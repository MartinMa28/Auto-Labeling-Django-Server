/*
 * Copyright (C) 2018 Intel Corporation
 *
 * SPDX-License-Identifier: MIT
 */

/* exported confirm showMessage showOverlay dumpAnnotationRequest getURISearchParameter setURISearchParameter */
"use strict";

Math.clamp = function(x, min, max) {
    return Math.min(Math.max(x, min), max);
};


function confirm(message, onagree, ondisagree) {
    let template = $('#confirmTemplate');
    let confirmWindow = $(template.html()).css('display', 'block');

    let annotationConfirmMessage = confirmWindow.find('.templateMessage');
    let agreeConfirm = confirmWindow.find('.templateAgreeButton');
    let disagreeConfirm = confirmWindow.find('.templateDisagreeButton');

    annotationConfirmMessage.text(message);
    $('body').append(confirmWindow);

    agreeConfirm.on('click', function() {
        hideConfirm();
        if (onagree) onagree();
    });

    disagreeConfirm.on('click', function() {
        hideConfirm();
        if (ondisagree) ondisagree();
    });

    disagreeConfirm.focus();

    confirmWindow.on('keydown', (e) => {
        e.stopPropagation();
    });

    function hideConfirm() {
        agreeConfirm.off('click');
        disagreeConfirm.off('click');
        confirmWindow.remove();
    }
}


function showMessage(message) {
    let template = $('#messageTemplate');
    let messageWindow = $(template.html()).css('display', 'block');

    let messageText = messageWindow.find('.templateMessage');
    let okButton = messageWindow.find('.templateOKButton');

    messageText.text(message);
    $('body').append(messageWindow);

    messageWindow.on('keydown', (e) => {
        e.stopPropagation();
    });

    okButton.on('click', function() {
        okButton.off('click');
        messageWindow.remove();
    });

    okButton.focus();
    return messageWindow;
}


function showOverlay(message) {
    let template = $('#overlayTemplate');
    let overlayWindow = $(template.html()).css('display', 'block');
    let overlayText = overlayWindow.find('.templateMessage');
    overlayWindow[0].setMessage = function(message) {
        overlayText.text(message);
    };

    overlayWindow[0].remove = function() {
        overlayWindow.remove();
    };

    $('body').append(overlayWindow);
    overlayWindow[0].setMessage(message);
    return overlayWindow[0];
}


function dumpAnnotationRequest(dumpButton, taskID) {
    dumpButton = $(dumpButton);
    dumpButton.attr('disabled', true);

    $.ajax({
        url: '/dump/annotation/task/' + taskID,
        success: onDumpRequestSuccess,
        error: onDumpRequestError,
    });

    function onDumpRequestSuccess() {
        let requestInterval = 3000;
        let requestSended = false;

        let checkInterval = setInterval(function() {
            if (requestSended) return;
            requestSended = true;
            $.ajax({
                url: '/check/annotation/task/' + taskID,
                success: onDumpCheckSuccess,
                error: onDumpCheckError,
                complete: () => requestSended = false,
            });
        }, requestInterval);

        function onDumpCheckSuccess(data) {
            if (data.state === 'created') {
                clearInterval(checkInterval);
                getDumpedFile();
            }
            else if (data.state != 'started' ) {
                clearInterval(checkInterval);
                let message = 'Dump process completed with an error. ' + data.stderr;
                dumpButton.attr('disabled', false);
                showMessage(message);
                throw Error(message);
            }

            function getDumpedFile() {
                $.ajax({
                    url: '/download/annotation/task/' + taskID,
                    error: onGetDumpError,
                    success: () => window.location = '/download/annotation/task/' + taskID,
                    complete: () => dumpButton.attr('disabled', false)
                });

                function onGetDumpError(response) {
                    let message = 'Get the dump request error: ' + response.responseText;
                    showMessage(message);
                    throw Error(message);
                }
            }
        }

        function onDumpCheckError(response) {
            clearInterval(checkInterval);
            let message = 'Check the dump request error: ' + response.responseText;
            dumpButton.attr('disabled', false);
            showMessage(message);
            throw Error(message);
        }
    }

    function onDumpRequestError(response) {
        let message = "Dump request error: " + response.responseText;
        dumpButton.attr('disabled', false);
        showMessage(message);
        throw Error(message);
    }
}


function setURISearchParameter(name, value) {
    let searchParams = new URLSearchParams(window.location.search);
    if (typeof value === 'undefined' || value === null) {
        if (searchParams.has(name)) {
            searchParams.delete(name);
        }
    }
    else searchParams.set(name, value);

    window.history.replaceState(null, null, `?${searchParams.toString()}`);
}


function resetURISearchParameters() {
    let searchParams = new URLSearchParams();
    searchParams.set('id', window.cvat.job.id);
    window.history.replaceState(null, null, `?${searchParams.toString()}`);
}


function getURISearchParameter(name) {
    let decodedURI = '';
    try {
        decodedURI = decodeURIComponent(window.location.search);
    }
    catch (error) {
        showMessage('Bad URL has been found');
        resetURISearchParameters();
    }

    let urlSearchParams = new URLSearchParams(decodedURI);
    if (urlSearchParams.has(name)) {
        return urlSearchParams.get(name);
    }
    else return null;
}


/* These HTTP methods do not require CSRF protection */
function csrfSafeMethod(method) {
    return (/^(GET|HEAD|OPTIONS|TRACE)$/.test(method));
}


$.ajaxSetup({
    beforeSend: function(xhr, settings) {
        if (!csrfSafeMethod(settings.type) && !this.crossDomain) {
            xhr.setRequestHeader("X-CSRFToken", Cookies.get('csrftoken'));
        }
    }
});

function addToTrainingSet(){
    let url = window.location.href;
    let start = Number(url.search('frame=')) + 6;    // capture frame=, and add 6
    let frame_id = url.slice(start);

    let httpRequest = new XMLHttpRequest();
    
    if (!httpRequest){
            alert('Cannot create an XMLHTTP instance');
            return false;
    }

    // call back function for the response
    httpRequest.onreadystatechange = function(){
        if (httpRequest.readyState === XMLHttpRequest.DONE){
            if (httpRequest.status === 200){
                alert('Current frame is added to training set.');
            } else{
                alert('There was a problem with the request!');
            }
        }
    };
    
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1'){
        httpRequest.open('GET', `http://127.0.0.1:8080/add/train/kfb_512_100_test/${frame_id}`, true);
    }else {
        httpRequest.open('GET', `http://ai-master-bigdl-0.sh.intel.com:8080/add/train/kfb_512_100_test/${frame_id}`, true);
    }
    
    httpRequest.setRequestHeader("Content-Type", "application/json");
    httpRequest.send();
}

function removeFromTrainingSet(){
    let url = window.location.href;
    let start = Number(url.search('frame=')) + 6;    // capture frame=, and add 6
    let frame_id = url.slice(start);

    let httpRequest = new XMLHttpRequest();
    
    if (!httpRequest){
            alert('Cannot create an XMLHTTP instance');
            return false;
    }

    // call back function for the response
    httpRequest.onreadystatechange = function(){
        if (httpRequest.readyState === XMLHttpRequest.DONE){
            if (httpRequest.status === 200){
                alert('Current frame is removed from training set.');
            } else{
                alert('There was a problem with the request!');
            }
        }
    };
    
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1'){
        httpRequest.open('GET', `http://127.0.0.1:8080/remove/train/kfb_512_100_test/${frame_id}`, true);
    }else {
        httpRequest.open('GET', `http://ai-master-bigdl-0.sh.intel.com:8080/remove/train/kfb_512_100_test/${frame_id}`, true);
    }
    httpRequest.setRequestHeader("Content-Type", "application/json");
    httpRequest.send();
}

// function predictionRequest(taskID, tableName){
//     let request_url;
//     if (location.hostname === 'localhost' || location.hostname === '127.0.0.1'){
//         request_url = `http://127.0.0.1:8080/predict/labels/${taskID}/${tableName}`;
//     }else{
//         request_url = `http://ai-master.sh.intel.com:8080/predict/labels/${taskID}/${tableName}`;
//     }
    
//     let httpRequest = new XMLHttpRequest();
//     if (!httpRequest){
//         alert('Cannot create an XMLHTTP instance');
//         return false;
//     }

//     // call back function for the response
//     httpRequest.onreadystatechange = function(){
//         if (httpRequest.readyState === XMLHttpRequest.DONE){
//             if (httpRequest.status === 200){
//                 window.location.reload();
//                 alert('Finished predicting');
//             } else{
//                 alert('There was a problem with the request!');
//             }
//         }
//     };

//     httpRequest.open('GET', request_url, true);
//     httpRequest.setRequestHeader("Content-Type", "application/json");
//     httpRequest.send();
// }

function slidingPredictionRequest(taskID, tableName, groupSize, iters, curIter, indices_arr){
    let requestURL;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1'){
        requestURL = `http://127.0.0.1:8080/predict/labels/sliding/${taskID}/${tableName}/${indices_arr[curIter]}/${indices_arr[curIter] + 1}`;
    }else{
        requestURL = `http://ai-master-bigdl-0.sh.intel.com:8080/predict/labels/sliding/${taskID}/${tableName}/${indices_arr[curIter]}/${indices_arr[curIter] + 1}`;
    }

    $('#progressBar').removeClass('hidden');
    $('#progressBar').text(`${curIter}/${iters * groupSize}`);

    let httpRequest = new XMLHttpRequest();
    if (!httpRequest){
        alert('Cannot create an XMLHTTP instance');
        return false;
    }

    // call back function for the response
    httpRequest.onreadystatechange = function(){
        if (httpRequest.readyState === XMLHttpRequest.DONE){
            if (httpRequest.status === 200){
                if (curIter + groupSize < iters * groupSize){
                    slidingPredictionRequest(taskID, tableName, groupSize, iters, curIter + groupSize, indices_arr);
                }else {
                    // finish all of predictions
                    $('#progressBar').text('');
                    $('#progressBar').addClass('hidden');
                    window.location.reload();
                }
            } else{
                alert('There was a problem with the request!');
            }
        }
    };

    httpRequest.open('GET', requestURL, true);
    httpRequest.setRequestHeader("Content-Type", "application/json");
    httpRequest.send();
}


function bigdlStartPrediction(taskID, tableName, startFrame, stopFrame, curStartFrame, curStopFrame, predictBatchSize){
    $('#progressBar').removeClass('hidden');
    $('#progressBar').text(`${curStartFrame}/${stopFrame + 1}`);
    $.ajax({
        url: `start/prediction/${tableName}`,
        success: () => {
            if (curStopFrame + predictBatchSize <= stopFrame){
                bigdlPredictionRequest(taskID, tableName, startFrame, stopFrame, curStartFrame, curStopFrame, predictBatchSize);
            }else if (curStopFrame < stopFrame){
                bigdlPredictionRequest(taskID, tableName, startFrame, stopFrame, curStartFrame, stopFrame, stopFrame - curStartFrame + 1);
            }
            else {
                bigdlStopPrediction(taskID, tableName);
                $('#progressBar').text('');
                $('#progressBar').addClass('hidden');
                window.location.reload();
            }
        },
        error: () => {
            alert('There was a problem with the request!');
        },
    });
}

function bigdlPredictionRequest(taskID, tableName, startFrame, stopFrame, curStartFrame, curStopFrame, predictBatchSize){
    $('#progressBar').removeClass('hidden');
    $('#progressBar').text(`${curStartFrame}/${stopFrame + 1}`);
    $.ajax({
        url: `/predict/labels/sliding/${curStartFrame}/${curStopFrame}`,
        success: () => {
            if (curStopFrame + predictBatchSize <= stopFrame){
                bigdlPredictionRequest(taskID, tableName, startFrame, stopFrame, curStartFrame + predictBatchSize, curStopFrame + predictBatchSize, predictBatchSize);
            }else if (curStopFrame < stopFrame){
                bigdlPredictionRequest(taskID, tableName, startFrame, stopFrame, curStartFrame + predictBatchSize, stopFrame, stopFrame - (curStartFrame + predictBatchSize) + 1);
            }
            else {
                bigdlStopPrediction(taskID, tableName);
                $('#progressBar').text('');
                $('#progressBar').addClass('hidden');
                window.location.reload();
            }
        },
        error: () => {
            alert('There was a problem with the request!');
        }
    });
}

function bigdlStopPrediction(taskID, tableName){
    $.ajax({
        url: `/stop/prediction/${taskID}/${tableName}`,
        success: () => {
            console.log("Socket stopped");
        },
        error: () => {
            alert('There was a problem with the request!');
        }
    });
}

function removeLabels(tableName){
    let request_url;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1'){
        request_url = `http://127.0.0.1:8080/remove/labels/${tableName}`;
    }else{
        request_url = `http://ai-master-bigdl-0.sh.intel.com:8080/remove/labels/${tableName}`;
    }

    let httpRequest = new XMLHttpRequest();
    if(!httpRequest){
        alert('Cannot create an XMLHTTP instance');
        return false;
    }

    // call back function for the response
    httpRequest.onreadystatechange = function(){
        if (httpRequest.readyState === XMLHttpRequest.DONE){
            if (httpRequest.status === 200){
                //window.location.reload();
                console.log(httpRequest.responseText);
            } else{
                alert('There was a problem with the request!');
            }
        }
    };

    httpRequest.open('GET', request_url, true);
    httpRequest.setRequestHeader("Content-Type", "application/json");
    httpRequest.send();
}

function save_data_from_hbase(jid, tableName){
    let request_url;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1'){
        request_url = `http://127.0.0.1:8080/save/annotation/job/from_hbase/${jid}/${tableName}`;
    }else{
        request_url = `http://ai-master-bigdl-0.sh.intel.com:8080/save/annotation/job/from_hbase/${jid}/${tableName}`;
    }
    
    let httpRequest = new XMLHttpRequest();
    if (!httpRequest){
        alert('Cannot create an XMLHTTP instance');
        return false;
    }

    // call back function for the response
    httpRequest.onreadystatechange = function(){
        if (httpRequest.readyState === XMLHttpRequest.DONE){
            if (httpRequest.status === 200){
                window.location.reload();
            } else{
                alert('There was a problem with the request!');
            }
        }
    };

    httpRequest.open('GET', request_url, true);
    httpRequest.setRequestHeader("Content-Type", "application/json");
    httpRequest.send();
}


$(document).ready(function(){
    $('body').css({
        width: window.screen.width + 'px',
        height: window.screen.height * 0.95 + 'px'
    });

    $('#addToTrainButton').on('click', addToTrainingSet);
    $('#removeFromTrainButton').on('click', removeFromTrainingSet);
});
