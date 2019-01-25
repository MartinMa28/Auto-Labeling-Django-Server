
# Copyright (C) 2018 Intel Corporation
#
# SPDX-License-Identifier: MIT

import os
import json
import logging
import traceback
import time

from django.http import HttpResponse, HttpResponseBadRequest, JsonResponse
from django.shortcuts import redirect, render
from django.conf import settings
from django.contrib.auth.decorators import permission_required
from django.views.decorators.gzip import gzip_page
from sendfile import sendfile

from . import annotation, task, models
from cvat.settings.base import JS_3RDPARTY
from cvat.apps.authentication.decorators import login_required
from cvat.apps.log_proxy.proxy_logger import client_log_proxy
from requests.exceptions import RequestException
from .logging import task_logger, job_logger

from PIL import ImageFile
import requests
import happybase
import base64

# ----------------- import pytorch and other related modules ------------------
import torch
import torchvision
import torch.nn as nn
from torchvision import models, transforms, datasets
from PIL import Image
import shutil
import cv2
import numpy as np
# -----------------------------------

# ---------------------------- socket -----------------------------------
import socket
# ---------------------------- socket -----------------------------------
ImageFile.LOAD_TRUNCATED_IMAGES = True

global_logger = logging.getLogger(__name__)

############################# High Level server API
@login_required
def dispatch_request(request):
    """An entry point to dispatch legacy requests"""
    if request.method == 'GET' and 'id' in request.GET:
        return render(request, 'engine/annotation.html', {
            'js_3rdparty': JS_3RDPARTY.get('engine', [])
        })
    else:
        return redirect('/index/')


def download_imgs_and_labels(server, table_name, picture_name, dist):
    connection = happybase.Connection(server)
    kfb_150 = connection.table(table_name)

    img_dir = os.path.join(dist, '{}/imgs'.format(picture_name))

    if not os.path.exists(dist):
        os.makedirs(dist)
    if not os.path.exists(img_dir):
        os.makedirs(img_dir)

    #label_file = open(os.path.join(dist, 'labels.csv'), 'w+')


    for key, data in kfb_150.scan():
        row_key = int(key.decode('utf-8'))
        frame_id = row_key - 1
        # label = (data['{}:pos'.format(picture_name).encode('utf-8')]).decode('utf-8')
        # label_file.write('{},{},{}\n'.format(str(row_key), str(frame_id), str(label)))

        img_data = base64.b64decode(data['{}:data'.format(picture_name).encode('utf-8')])
        img_name = str(frame_id).zfill(5) + '.jpg'
        img_file = open(os.path.join(img_dir, img_name), 'wb')
        img_file.write(img_data)
        img_file.close()

    #label_file.close()

def create_task_through_api(request, task_name, task_labels, table_name, picture_name):
    db_task = None
    params = {'task_name': 'Un-named Task', 'storage': 'local', 'flip_flag': 'false', 'labels': 'vehicle @select=type:__undefined__,car,truck,bus,train ~radio=quality:good,bad ~checkbox=parked:false', 'bug_tracker_link': '', 'z_order': 'false'}
    # request_data = json.loads(request.body.decode(encoding='utf-8'))
    # # request_data = request.POST.dict()
    # print('request.POST', request.POST)
    # print('request_data:', request_data)
    params['owner'] = request.user
    params['task_name'] = task_name
    params['labels'] = task_labels

    print('create task with params = {}'.format(params))
    try:
        db_task = task.create_empty(params)
        target_paths = []
        source_paths = []
        upload_dir = db_task.get_upload_dirname()
        # ---------------------------------------------
        print('views.create_task, upload_dir:', upload_dir)
        # -------------------------- Download from HBase -----------------------------
        # data_set = DATA_SET(ip='ai-master.sh.intel.com')
        hbase_download_path = '/home/django/test_images/{}'.format(str(db_task.id))
        # data_set.download('kfb', table_name, \
        # hbase_download_path, \
        # [picture_name])
        download_imgs_and_labels('ai-master.sh.intel.com', table_name, '123_s20', hbase_download_path)
        hbase_imgs_path = os.path.join(hbase_download_path, '{}/imgs'.format(picture_name))
        hbase_imgs = os.listdir(hbase_imgs_path)
        # -------------------------- Download from HBase -----------------------------
        # ---------------------------------------------
        share_root = settings.SHARE_ROOT
        if params['storage'] == 'share':
            data_list = request.POST.getlist('data')
            data_list.sort(key=len)
            for share_path in data_list:
                relpath = os.path.normpath(share_path).lstrip('/')
                if '..' in relpath.split(os.path.sep):
                    raise Exception('Permission denied')
                abspath = os.path.abspath(os.path.join(share_root, relpath))
                if os.path.commonprefix([share_root, abspath]) != share_root:
                    raise Exception('Bad file path on share: ' + abspath)
                source_paths.append(abspath)
                target_paths.append(os.path.join(upload_dir, relpath))
        else:
            data_list = request.FILES.getlist('data')
            # ----------------------------------------------------
            print('views.create_task', len(data_list))
            # ----------------------------------------------------

            if len(data_list) > settings.LOCAL_LOAD_MAX_FILES_COUNT:
                raise Exception('Too many files. Please use download via share')
            common_size = 0
            for f in data_list:
                common_size += f.size
            if common_size > settings.LOCAL_LOAD_MAX_FILES_SIZE:
                raise Exception('Too many size. Please use download via share')

            for hbase_img in hbase_imgs:
                source_paths.append(hbase_img)
                path = os.path.join(upload_dir, hbase_img)
                target_paths.append(path)
                # ----------------------------------------------------
                print('views.create_task, source_paths:', source_paths)
                print('views.create_task, path:', path)
                print('views.create_task, target_paths:', target_paths)

                upload_file_handler = open(path, 'wb')
                with open(os.path.join(hbase_imgs_path, hbase_img),'rb') as f:
                    while True:
                        sub_byte = f.read(1)
                        if not sub_byte:
                            break
                        upload_file_handler.write(sub_byte)
        
        params['SOURCE_PATHS'] = source_paths
        params['TARGET_PATHS'] = target_paths

        task.create(db_task.id, params)

        return JsonResponse({'tid': db_task.id})
    
    except Exception as exc:
        global_logger.error("cannot create task {}".format(params['task_name']), exc_info=True)
        db_task.delete()
        return HttpResponseBadRequest(str(exc))

    return JsonResponse({'tid': db_task.id})

@login_required
@permission_required('engine.add_task', raise_exception=True)
def create_task(request):
    """Create a new annotation task"""

    db_task = None
    params = request.POST.dict()
    params['owner'] = request.user
    global_logger.info("create task with params = {}".format(params))
    print('create task with params = {}'.format(params))
    try:
        db_task = task.create_empty(params)
        target_paths = []
        source_paths = []
        upload_dir = db_task.get_upload_dirname()
        # ---------------------------------------------
        print('views.create_task, upload_dir:', upload_dir)
        # -------------------------- Download from HBase -----------------------------
        data_set = DATA_SET(ip='ai-master.sh.intel.com')
        hbase_download_path = '/home/django/test_images/'
        data_set.download('kfb', 'new_512_kfb', \
        hbase_download_path, \
        ["123_s20"])
        hbase_imgs_path = os.path.join(hbase_download_path, '123_s20/Image')
        hbase_imgs = os.listdir(hbase_imgs_path)
        # -------------------------- Download from HBase -----------------------------
        # ---------------------------------------------
        share_root = settings.SHARE_ROOT
        if params['storage'] == 'share':
            data_list = request.POST.getlist('data')
            data_list.sort(key=len)
            for share_path in data_list:
                relpath = os.path.normpath(share_path).lstrip('/')
                if '..' in relpath.split(os.path.sep):
                    raise Exception('Permission denied')
                abspath = os.path.abspath(os.path.join(share_root, relpath))
                if os.path.commonprefix([share_root, abspath]) != share_root:
                    raise Exception('Bad file path on share: ' + abspath)
                source_paths.append(abspath)
                target_paths.append(os.path.join(upload_dir, relpath))
        else:
            data_list = request.FILES.getlist('data')
            # ----------------------------------------------------
            print('views.create_task', len(data_list))
            # ----------------------------------------------------

            if len(data_list) > settings.LOCAL_LOAD_MAX_FILES_COUNT:
                raise Exception('Too many files. Please use download via share')
            common_size = 0
            for f in data_list:
                common_size += f.size
            if common_size > settings.LOCAL_LOAD_MAX_FILES_SIZE:
                raise Exception('Too many size. Please use download via share')

            for hbase_img in hbase_imgs:
                source_paths.append(hbase_img)
                path = os.path.join(upload_dir, hbase_img)
                target_paths.append(path)
                # ----------------------------------------------------
                print('views.create_task, source_paths:', source_paths)
                print('views.create_task, path:', path)
                print('views.create_task, target_paths:', target_paths)
                # ----------------------------------------------------
                # with open(path, 'wb') as upload_file:
                #     for chunk in data_file.chunks():
                #         # --------------------------------------------
                #         print("views.create_task, chunk's type:", type(chunk))
                #         # --------------------------------------------
                #         upload_file.write(chunk)
                
                
                upload_file_handler = open(path, 'wb')
                with open(os.path.join(hbase_imgs_path, hbase_img),'rb') as f:
                    while True:
                        sub_byte = f.read(1)
                        if not sub_byte:
                            break
                        upload_file_handler.write(sub_byte)

            # for data_file in data_list:
            #     # -------------------------------------------------------
            #     print('views.create_task, data_file.name:', data_file.name)
            #     # -------------------------------------------------------
            #     source_paths.append(data_file.name)
            #     path = os.path.join(upload_dir, data_file.name)
            #     target_paths.append(path)
            #     # ----------------------------------------------------
            #     print('views.create_task, source_paths:', source_paths)
            #     print('views.create_task, path:', path)
            #     print('views.create_task, target_paths:', target_paths)
            #     # ----------------------------------------------------
            #     # with open(path, 'wb') as upload_file:
            #     #     for chunk in data_file.chunks():
            #     #         # --------------------------------------------
            #     #         print("views.create_task, chunk's type:", type(chunk))
            #     #         # --------------------------------------------
            #     #         upload_file.write(chunk)
                
            #     # -------------------------- Download from HBase -----------------------------
            #     data_set = DATA_SET(ip='ai-master.sh.intel.com')
            #     data_set.download('kfb', 'merge_kfb_2', \
            #     '/home/django/test_images/', \
            #     ["pos:123_s20"])
            #     # -------------------------- Download from HBase -----------------------------
            #     upload_file_handler = open(path, 'wb')
            #     with open('/home/django/test_images/pos:123_s20/0.jpg','rb') as f:
            #         while True:
            #             sub_byte = f.read(1)
            #             if not sub_byte:
            #                 break
            #             upload_file_handler.write(sub_byte)

        params['SOURCE_PATHS'] = source_paths
        params['TARGET_PATHS'] = target_paths

        task.create(db_task.id, params)

        return JsonResponse({'tid': db_task.id})
    except Exception as exc:
        global_logger.error("cannot create task {}".format(params['task_name']), exc_info=True)
        db_task.delete()
        return HttpResponseBadRequest(str(exc))

    return JsonResponse({'tid': db_task.id})

@login_required
@permission_required('engine.view_task', raise_exception=True)
def check_task(request, tid):
    """Check the status of a task"""

    try:
        global_logger.info("check task #{}".format(tid))
        response = task.check(tid)
    except Exception as e:
        global_logger.error("cannot check task #{}".format(tid), exc_info=True)
        return HttpResponseBadRequest(str(e))

    return JsonResponse(response)

@login_required
@permission_required('engine.view_task', raise_exception=True)
def get_frame(request, tid, frame):
    """Stream corresponding from for the task"""

    try:
        # Follow symbol links if the frame is a link on a real image otherwise
        # mimetype detection inside sendfile will work incorrectly.
        path = os.path.realpath(task.get_frame_path(tid, frame))
        # ------------------------------------------------------
        print('views.get_frame',path)
        # ------------------------------------------------------
        return sendfile(request, path)
    except Exception as e:
        task_logger[tid].error("cannot get frame #{}".format(frame), exc_info=True)
        return HttpResponseBadRequest(str(e))

@login_required
@permission_required('engine.delete_task', raise_exception=True)
def delete_task(request, tid):
    """Delete the task"""
    try:
        global_logger.info("delete task #{}".format(tid))
        if not task.is_task_owner(request.user, tid):
            return HttpResponseBadRequest("You don't have permissions to delete the task.")

        task.delete(tid)
    except Exception as e:
        global_logger.error("cannot delete task #{}".format(tid), exc_info=True)
        return HttpResponseBadRequest(str(e))

    return HttpResponse()

@login_required
@permission_required('engine.change_task', raise_exception=True)
def update_task(request, tid):
    """Update labels for the task"""
    try:
        task_logger[tid].info("update task request")
        if not task.is_task_owner(request.user, tid):
            return HttpResponseBadRequest("You don't have permissions to change the task.")

        labels = request.POST['labels']
        task.update(tid, labels)
    except Exception as e:
        task_logger[tid].error("cannot update task", exc_info=True)
        return HttpResponseBadRequest(str(e))

    return HttpResponse()

# @login_required
# @permission_required(perm='engine.view_task', raise_exception=True)
def get_task(request, tid):
    try:
        task_logger[tid].info("get task request")
        response = task.get(tid)
    except Exception as e:
        task_logger[tid].error("cannot get task", exc_info=True)
        return HttpResponseBadRequest(str(e))

    return JsonResponse(response, safe=False)

# @login_required
# @permission_required(perm=['engine.view_task', 'engine.view_annotation'], raise_exception=True)
def get_job(request, jid):
    try:
        job_logger[jid].info("get job #{} request".format(jid))
        response = task.get_job(jid)
    except Exception as e:
        job_logger[jid].error("cannot get job #{}".format(jid), exc_info=True)
        return HttpResponseBadRequest(str(e))

    return JsonResponse(response, safe=False)

@login_required
@permission_required(perm=['engine.view_task', 'engine.view_annotation'], raise_exception=True)
def dump_annotation(request, tid):
    try:
        task_logger[tid].info("dump annotation request")
        annotation.dump(tid, annotation.FORMAT_XML, request.scheme, request.get_host())
    except Exception as e:
        task_logger[tid].error("cannot dump annotation", exc_info=True)
        return HttpResponseBadRequest(str(e))

    return HttpResponse()

@login_required
@gzip_page
@permission_required(perm=['engine.view_task', 'engine.view_annotation'], raise_exception=True)
def check_annotation(request, tid):
    try:
        task_logger[tid].info("check annotation")
        response = annotation.check(tid)
    except Exception as e:
        task_logger[tid].error("cannot check annotation", exc_info=True)
        return HttpResponseBadRequest(str(e))

    return JsonResponse(response)


@login_required
@gzip_page
@permission_required(perm=['engine.view_task', 'engine.view_annotation'], raise_exception=True)
def download_annotation(request, tid):
    try:
        task_logger[tid].info("get dumped annotation")
        db_task = models.Task.objects.get(pk=tid)
        response = sendfile(request, db_task.get_dump_path(), attachment=True,
            attachment_filename='{}_{}.xml'.format(db_task.id, db_task.name))
    except Exception as e:
        task_logger[tid].error("cannot get dumped annotation", exc_info=True)
        return HttpResponseBadRequest(str(e))

    return response


@login_required
@gzip_page
@permission_required(perm=['engine.view_task', 'engine.view_annotation'], raise_exception=True)
def get_annotation(request, jid):
    try:
        job_logger[jid].info("get annotation for {} job".format(jid))
        response = annotation.get(jid)
    except Exception as e:
        job_logger[jid].error("cannot get annotation for job {}".format(jid), exc_info=True)
        return HttpResponseBadRequest(str(e))

    return JsonResponse(response, safe=False)

@login_required
@permission_required(perm=['engine.view_task', 'engine.change_annotation'], raise_exception=True)
def save_annotation_for_job(request, jid):
    try:
        job_logger[jid].info("save annotation for {} job".format(jid))
        data = json.loads(request.body.decode('utf-8'))
        
        if 'annotation' in data:
            annotation.save_job(jid, json.loads(data['annotation']))
                
        if 'logs' in data:
            client_log_proxy.push_logs(jid, json.loads(data['logs']))
    except RequestException as e:
        job_logger[jid].error("cannot send annotation logs for job {}".format(jid), exc_info=True)
        return HttpResponseBadRequest(str(e))
    except Exception as e:
        job_logger[jid].error("cannot save annotation for job {}".format(jid), exc_info=True)
        return HttpResponseBadRequest(str(e))

    return HttpResponse()

def get_label_name(label_id, jid):
    url = 'http://127.0.0.1:8080/get/job/{}'.format(jid)
    r = requests.get(url=url)
    resp_dict = r.json()
    return resp_dict['labels'][str(label_id)]


def get_label_id(label_name, jid):
    url = 'http://127.0.0.1:8080/get/job/{}'.format(jid)
    r = requests.get(url=url)
    resp_dict = r.json()
    label_id_getter = {}
    for key,value in resp_dict['labels'].items():
        label_id_getter[value] = key
    return int(label_id_getter[label_name])

def get_job_id_from_task_id(tid):
    url = 'http://127.0.0.1:8080/get/task/{}'.format(tid)
    r = requests.get(url=url)
    resp_dict = r.json()
    return resp_dict['jobs']

def upload_data_to_hbase(table_name, attr_param_dict, jid):
    connection = happybase.Connection('ai-master.sh.intel.com')
    table = connection.table(table_name)
    for box_info in attr_param_dict['boxes']:
        row_key = str(box_info['frame']+1).zfill(9).encode('utf-8')
        label_name = get_label_name(box_info['label_id'], jid)
        if label_name == 'positive':
            # positive
            table.put(row_key, {b'123_s20:pos': b'1',\
            b'123_s20:offset': (str(box_info['xtl'])+','+str(box_info['ytl'])).encode('utf-8')})
        else:
            # negative
            table.put(row_key, {b'123_s20:pos': b'0', b'123_s20:offset': b'#'})


def generate_attribute_from_hbase(jid, table_name):
    connection = happybase.Connection('ai-master.sh.intel.com')

    table = connection.table(table_name)
    data_attr = {}
    data_attr["boxes"] = []

    for key, data in table.scan():
        row_key = int(key.decode('utf-8').lstrip('0'))
        pos = data[b'123_s20:pos'].decode('utf-8')
        if pos != 'none':
        # make sure this image has been labeled
        # 150*150 images don't have offset
            offset = data[b'123_s20:offset'].decode('utf-8')
            
            frame_data = {"xtl":float(0),"ytl":float(0),"xbr":float(512),"ybr":float(512),"occluded":False,"z_order":0,"attributes":[],"label_id":3,"group_id":0,"frame":row_key-1}
            
            if pos == '1':
                x = offset.split(',')[0].strip()
                y = offset.split(',')[1].strip()
                frame_data["xtl"] = float(x)
                frame_data["ytl"] = float(y)
                frame_data["xbr"] = float(x) + float(150)
                frame_data["ybr"] = float(y) + float(150)
                frame_data["label_id"] = get_label_id('positive', jid)
            else:
                frame_data["label_id"] = get_label_id('negative', jid)
            data_attr["boxes"].append(frame_data)

    data_attr["box_paths"] = []
    data_attr["points"] = []
    data_attr["points_paths"] = []
    data_attr["polygons"] = []
    data_attr["polygon_paths"] = []
    data_attr["polylines"] = []
    data_attr["polyline_paths"] = []

    return data_attr


@login_required
@permission_required(perm=['engine.view_task', 'engine.change_annotation'], raise_exception=True)
def save_annotation_for_job_and_update_hbase(request, jid, table_name):
    try:
        job_logger[jid].info("save annotation for {} job".format(jid))
        data = json.loads(request.body.decode('utf-8'))
        
        if 'annotation' in data:
            attr_dict = json.loads(data['annotation'])
            annotation.save_job(jid, attr_dict)
            upload_data_to_hbase(table_name, attr_dict, jid)

                
        if 'logs' in data:
            client_log_proxy.push_logs(jid, json.loads(data['logs']))
    except RequestException as e:
        job_logger[jid].error("cannot send annotation logs for job {}".format(jid), exc_info=True)
        return HttpResponseBadRequest(str(e))
    except Exception as e:
        job_logger[jid].error("cannot save annotation for job {}".format(jid), exc_info=True)
        return HttpResponseBadRequest(str(e))

    return HttpResponse()

def save_annotation_for_job_from_hbase(request, jid, table_name):
    try:
        job_logger[jid].info("save annotation for {} job from HBase".format(jid))
        data_annotation = generate_attribute_from_hbase(jid, table_name)
        annotation.save_job(jid, data_annotation)
    except Exception as e:
        job_logger[jid].error("cannot save annotation for job {}".format(jid), exc_info=True)
        return HttpResponseBadRequest(str(e))
    return JsonResponse(data_annotation)

# plain function for the RestAPI above to get invoked directly in the server
def save_from_hbase(jid, table_name):
    try:
        job_logger[jid].info("save annotation for {} job from HBase".format(jid))
        data_annotation = generate_attribute_from_hbase(jid, table_name)
        annotation.save_job(jid, data_annotation)
        return "saved from HBase successfully"

    except:
        job_logger[jid].error("cannot save annotation for job {}".format(jid), exc_info=True)
        return "failed to save from HBase"


@login_required
@permission_required(perm=['engine.view_task', 'engine.change_annotation'], raise_exception=True)
def save_annotation_for_task(request, tid):
    try:
        task_logger[tid].info("save annotation request")
        data = json.loads(request.body.decode('utf-8'))
        annotation.save_task(tid, data)
    except Exception as e:
        task_logger[tid].error("cannot save annotation", exc_info=True)
        return HttpResponseBadRequest(str(e))

    return HttpResponse()

@login_required
def get_username(request):
    response = {'username': request.user.username}
    return JsonResponse(response, safe=False)

def rq_handler(job, exc_type, exc_value, tb):
    job.exc_info = "".join(traceback.format_exception_only(exc_type, exc_value))
    job.save()
    module = job.id.split('.')[0]
    if module == 'task':
        return task.rq_handler(job, exc_type, exc_value, tb)
    elif module == 'annotation':
        return annotation.rq_handler(job, exc_type, exc_value, tb)

    return True

def _model_prep(model_path):
    model_ft = models.resnet50()
    model_ft.load_state_dict(torch.load('/home/django/jupyter_notebooks/resnet50-19c8e357.pth'))
    num_ftrs = model_ft.fc.in_features
    model_ft.fc = nn.Linear(num_ftrs, 2)

    model_ft.load_state_dict(torch.load(model_path))
    model_ft.eval()
    return model_ft



def _predict_with_sliding_window(win_width, win_height, tid, table_name, start, stop, step=120, window_num=16, crop_size=224):
    test_transform = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(crop_size),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    imgs_dir = '/home/django/data/{}/.upload'.format(tid)
    imgs_list = os.listdir(imgs_dir)
    imgs_list.sort()

    connection = happybase.Connection('ai-master.sh.intel.com')
    table = connection.table(table_name)
    
    b = table.batch()
    for img_path in imgs_list[start:stop]:
        bgr_img = cv2.imread(os.path.join(imgs_dir, img_path))
        rgb_img = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2RGB)

        device = torch.device('cpu')
        model = _model_prep('/home/django/jupyter_notebooks/official_model.pt')
        batch_windows = torch.Tensor(window_num, 3, crop_size, crop_size)
        window_index = 0
        index_coordinate_map = {}
        
        # (x, y) in image is equal to (y, x) in matrix, opencv reads images as matrices
        for x in range(0, rgb_img.shape[1] - win_width, step):
            for y in range(0, rgb_img.shape[0] - win_height, step):
                window = rgb_img[y:y + win_height, x:x + win_width, :]
                window_img = Image.fromarray(window)
                win_data = test_transform(window_img)
                batch_windows[window_index] = win_data
                index_coordinate_map[str(window_index)] = (x, y)
                window_index += 1
        
        with torch.no_grad():
            batch_windows = batch_windows.to(device)
            outputs = model(batch_windows)
            _, preds = torch.max(outputs.data, 1)

            
            if torch.sum(preds) > 0:
                # has positive result
                pos_loc_id = torch.arange(0, window_num)[preds > 0].numpy()
                pos_logits = _[preds > 0].numpy()
                labeled_loc = pos_loc_id[np.argmax(pos_logits)]
                win_x, win_y = index_coordinate_map[labeled_loc.astype(str)]
                # remove leading .jpg and leading zeros
                img_num = img_path[:img_path.find('.')]
                frame_id = int(img_num)
                row_key = str(frame_id + 1).zfill(9).encode('utf-8')
                offset = '{},{}'.format(win_x, win_y)
                b.put(row_key, {b'123_s20:pos': b'1', b'123_s20:offset': offset.encode('utf-8')})
            else:
                # all of windows are negative
                img_num = img_path[:img_path.find('.')]
                frame_id = int(img_num)
                row_key = str(frame_id + 1).zfill(9).encode('utf-8')
                b.put(row_key, {b'123_s20:pos': b'0', b'123_s20:offset': b'#'})
    
    b.send()


def start_prediction(request, table_name):
    # start socket server, and let it listen to further requests
    # os.system('spark-submit --master local[4] \
    # --driver-memory 8g --class com.intel.analytics.bigdl.models.resnet.test \
    # /home/django/AI-Master-0.1.0-SNAPSHOT-jar-with-dependencies.jar \
    # /home/django/core-site.xml /home/django/hbase-site.xml \
    # /home/django/model_new_helper_API_10.obj {}'.format(table_name))

    # s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    # print('client socket successfully connected after server')

    # port = 10001
    # num_of_images = str(stop - start + 1)
    # start_row = str(start + 1).zfill(9)
    # stop_row = str(stop + 1 + 1).zfill(9)
    # s.connect(('127.0.0.1', port))
    # s.sendall('{} {} {}\n'.format(start_row, stop_row, num_of_images).encode('utf-8'))
    # print(s.recv(1024).decode('utf-8'))
    # s.close()

    # # 2. download newly predicted data from HBase to display them in labelling tool
    # jid = get_job_id_from_task_id(tid)
    # resp = save_from_hbase(jid[0], table_name)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        print('Socket successfully created')
    except socket.error as err:
        print("Failed to create Socket with error: {}".format(err))
    
    proxy_port = 10002

    s.connect(('127.0.0.1', proxy_port))
    s.sendall(table_name.encode('utf-8'))
    response = s.recv(1024).decode('utf-8')
    print(response)
    s.close()
    
    return JsonResponse({'response': response})

def stop_prediction(request, tid, table_name):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        print('Socket successfully created')
    except socket.error as err:
        print("Failed to create Socket with error: {}".format(err))
    
    port = 10001

    s.connect(('127.0.0.1', port))
    s.sendall('stop\n'.encode('utf-8'))
    print(s.recv(1024).decode('utf-8'))
    s.close()
    # 2. download newly predicted data from HBase to display them in labelling tool
    jid = get_job_id_from_task_id(tid)
    resp = save_from_hbase(jid[0], table_name)

    return JsonResponse({'response': resp + ", socket stopped"})
                
def predict_with_sliding_window(request, start, stop):
    # 1. predict labels for each sliding window, and update HBase
    #_predict_with_sliding_window(150, 150, tid, table_name, start, stop)
    
    # os.system('spark-submit --master local[4] \
    # --driver-memory 8g --class com.intel.analytics.bigdl.models.resnet.test \
    # /home/django/AI-Master-0.1.0-SNAPSHOT-jar-with-dependencies.jar \
    # /home/django/core-site.xml /home/django/hbase-site.xml \
    # /home/django/model_new_helper_API_10.obj {} {} {} {}'.format(table_name, start_row, stop_row, num_of_images))

    # try:
    #     s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    #     print('Socket successfully connected')
    # except socket.error as err:
    #     print('Failed to create Socket with error: {}'.format(err))

    port = 10001
    time.sleep(2)
    
    if start == 0:
        sock = socket.create_connection(('127.0.0.1', port))
        #s.connect(('127.0.0.1', port))
        print(sock.recv(1024).decode('utf-8'))
        sock.close()

    
    num_of_images = str(stop - start + 1)
    start_row = str(start + 1).zfill(9)
    stop_row = str(stop + 1 + 1).zfill(9)
    
    s = socket.create_connection(('127.0.0.1', port))
    s.sendall('{} {} {}\n'.format(start_row, stop_row, num_of_images).encode('utf-8'))
    print(s.recv(1024).decode('utf-8'))
    s.close()

    # 2. download newly predicted data from HBase to display them in labelling tool
    # jid = get_job_id_from_task_id(tid)
    # resp = save_from_hbase(jid[0], table_name)
    
    return JsonResponse({'response': "finish predicting"})

def add_to_training_set(request, table_name, frame_id):
    try:
        connection = happybase.Connection('ai-master.sh.intel.com')
        table = connection.table(table_name)

        rowkey = str(frame_id + 1).zfill(9).encode('utf-8')
        table.put(rowkey, {b'123_s20:train': b'1'})
    except Exception as e:
        return HttpResponseBadRequest(str(e))
    
    return HttpResponse(status=200)

    


def remove_from_training_set(request, table_name, frame_id):
    try:
        connection = happybase.Connection('ai-master.sh.intel.com')
        table = connection.table(table_name)
        
        rowkey = str(frame_id + 1).zfill(9).encode('utf-8')
        table.put(rowkey, {b'123_s20:train': b'0'})
    except Exception as e:
        return HttpResponseBadRequest(str(e))
    
    return HttpResponse(status=200)


def move_images_to_training_folder(request, tid, table_name, image_width, image_height, crop_width, crop_height, neg_num):
    connection = happybase.Connection('ai-master.sh.intel.com')
    table = connection.table(table_name)

    original_image_folder = '/home/django/data/{}/.upload'.format(tid)
    dest_image_folder = '/home/django/training_set/{}'.format(tid)
    dest_image_folder_train = dest_image_folder + '/train'
    dest_image_folder_val = dest_image_folder + '/val'
    if not os.path.exists('/home/django/training_set'):
        os.mkdir('/home/django/training_set')
    if not os.path.exists(dest_image_folder):
        os.mkdir(dest_image_folder)
    else:
        shutil.rmtree(dest_image_folder)
        os.mkdir(dest_image_folder)
    
    os.mkdir(dest_image_folder_train)
    os.mkdir(dest_image_folder_val)
    os.mkdir(dest_image_folder_train+'/positive')
    os.mkdir(dest_image_folder_train+'/negative')
    os.mkdir(dest_image_folder_val+'/positive')
    os.mkdir(dest_image_folder_val+'/negative')
    
    for row_key, data in table.scan():
        if data[b'123_s20:train'] == b'1':
            frame_id = int(row_key.decode('utf-8')) - 1
            image_name = str(frame_id).zfill(5) + '.jpg'
            image_obj = Image.open(os.path.join(original_image_folder, image_name))
            if data[b'123_s20:pos'] == b'1':
                offset = (data[b'123_s20:offset']).decode('utf-8')
                xlt, ylt = offset.split(',')
                xlt = float(xlt)
                ylt = float(ylt)
                cropped_image = image_obj.crop((xlt, ylt, xlt + crop_width, ylt + crop_height))
                cropped_image.save(dest_image_folder_train+'/'+'positive'+'/'+image_name)
                cropped_image.save(dest_image_folder_val+'/'+'positive'+'/'+image_name)
            else:
                for i in range(neg_num):
                    xlt = np.random.rand() * (image_width - crop_width)
                    xlt = np.int32(np.floor(xlt))
                    xlt = np.asscalar(xlt)
                    ylt = np.random.rand() * (image_height - crop_height)
                    ylt = np.int32(np.floor(ylt))
                    ylt = np.asscalar(ylt)
                    cropped_image = image_obj.crop((xlt, ylt, xlt + crop_width, ylt + crop_height))
                    cropped_image.save(dest_image_folder_train+'/'+'negative'+'/'+str(frame_id).zfill(5) + '_{}'.format(i) + '.jpg')
                    cropped_image.save(dest_image_folder_val+'/'+'negative'+'/'+str(frame_id).zfill(5) + '_{}'.format(i) + '.jpg')

    return HttpResponse(status=200)

def remove_labels(request, table_name):
    connection = happybase.Connection('ai-master.sh.intel.com')
    table = connection.table(table_name)
    b = table.batch()

    for key,data in table.scan():
        b.put(key, {b'123_s20:train':b'0',
        b'123_s20:pos':b'none',
        b'123_s20:offset':b'#'})
    
    b.send()
    return HttpResponse(status=200)

def return_untrained_indices(request, table_name):
    connection = happybase.Connection('ai-master.sh.intel.com')
    table = connection.table(table_name)

    untrained_indices = []
    for key,data in table.scan():
        if data[b'123_s20:train'] == b'0':
            untrained_indices.append(int(key.decode('utf-8')) - 1)
    
    return JsonResponse({'indices': untrained_indices})
