
# Copyright (C) 2018 Intel Corporation
#
# SPDX-License-Identifier: MIT

from django.urls import path
from . import views

urlpatterns = [
    path('', views.dispatch_request),
    path('create/task/<str:task_name>/<str:task_labels>/<str:table_name>/<str:picture_name>', views.create_task_through_api),
    path('get/task/<str:tid>/frame/<int:frame>', views.get_frame),
    path('check/task/<int:tid>', views.check_task),
    path('delete/task/<int:tid>', views.delete_task),
    path('update/task/<int:tid>', views.update_task),
    path('get/job/<int:jid>', views.get_job),
    path('get/task/<int:tid>', views.get_task),
    path('dump/annotation/task/<int:tid>', views.dump_annotation),
    path('check/annotation/task/<int:tid>', views.check_annotation),
    path('download/annotation/task/<int:tid>', views.download_annotation),
    path('save/annotation/job/<int:jid>/<str:table_name>', views.save_annotation_for_job_and_update_hbase),
    path('save/annotation/job/from_hbase/<int:jid>/<str:table_name>', views.save_annotation_for_job_from_hbase),
    path('save/annotation/task/<int:tid>', views.save_annotation_for_task),
    path('get/annotation/job/<int:jid>', views.get_annotation),
    path('get/username', views.get_username),
    #path('predict/labels/<int:tid>/<str:table_name>', views.predict_labels),
    path('add/train/<str:table_name>/<int:frame_id>', views.add_to_training_set),
    path('remove/train/<str:table_name>/<int:frame_id>', views.remove_from_training_set),
    path('move/train/<int:tid>/<str:table_name>/<int:image_width>/<int:image_height>/<int:crop_width>/<int:crop_height>/<int:neg_num>', views.move_images_to_training_folder),
    path('start/prediction/<str:table_name>', views.start_prediction),
    path('predict/labels/sliding/<int:start>/<int:stop>', views.predict_with_sliding_window),
    path('stop/prediction/<int:tid>/<str:table_name>', views.stop_prediction),
    path('remove/labels/<str:table_name>', views.remove_labels),
    path('return/untrained/indices/<str:table_name>', views.return_untrained_indices),
]
