/*
 * Copyright (C) 2018 Intel Corporation
 *
 * SPDX-License-Identifier: MIT
 */

/* exported callAnnotationUI translateSVGPos blurAllElements drawBoxSize */
"use strict";

function callAnnotationUI(jid) {
    initLogger(jid);
    let loadJobEvent = Logger.addContinuedEvent(Logger.EventType.loadJob);
    serverRequest("/get/job/" + jid, function(job) {
        serverRequest("get/annotation/job/" + jid, function(data) {
            $('#loadingOverlay').remove();
            setTimeout(() => {
                buildAnnotationUI(job, data, loadJobEvent);
            }, 0);
        });
    });
}

function initLogger(jobID) {
    if (!Logger.initializeLogger('CVAT', jobID))
    {
        let message = 'Could not initialize Logger. Please immediately report the problem to support team';
        console.error(message);
        showMessage(message);
        return;
    }

    Logger.setTimeThreshold(Logger.EventType.zoomImage);

    serverRequest('/get/username', function(response) {
        Logger.setUsername(response.username);
    });
}

function buildAnnotationUI(job, shapeData, loadJobEvent) {
    // Setup some API
    window.cvat = {
        labelsInfo: new LabelsInfo(job),
        player: {
            geometry: {
                scale: 1,
            },
            frames: {
                current: job.start,
                start: job.start,
                stop: job.stop,
            }
        },
        mode: null,
        job: {
            z_order: job.z_order,
            id: job.jobid
        },
    };

    window.cvat.config = new Config();

    // Setup components
    let annotationParser = new AnnotationParser(job, window.cvat.labelsInfo);

    let shapeCollectionModel = new ShapeCollectionModel().import(shapeData).updateHash();
    let shapeCollectionController = new ShapeCollectionController(shapeCollectionModel);
    let shapeCollectionView = new ShapeCollectionView(shapeCollectionModel, shapeCollectionController);

    window.cvat.data = {
        get: () => shapeCollectionModel.export(),
        set: (data) => {
            shapeCollectionModel.empty();
            shapeCollectionModel.import(data);
            shapeCollectionModel.update();
        },
        clear: () => shapeCollectionModel.empty(),
    };

    let shapeBufferModel = new ShapeBufferModel(shapeCollectionModel);
    let shapeBufferController = new ShapeBufferController(shapeBufferModel);
    let shapeBufferView = new ShapeBufferView(shapeBufferModel, shapeBufferController);

    $('#shapeModeSelector').prop('value', job.mode);
    let shapeCreatorModel = new ShapeCreatorModel(shapeCollectionModel, job);
    let shapeCreatorController = new ShapeCreatorController(shapeCreatorModel);
    let shapeCreatorView = new ShapeCreatorView(shapeCreatorModel, shapeCreatorController);

    let polyshapeEditorModel = new PolyshapeEditorModel();
    let polyshapeEditorController = new PolyshapeEditorController(polyshapeEditorModel);
    let polyshapeEditorView = new PolyshapeEditorView(polyshapeEditorModel, polyshapeEditorController);

    // Add static member for class. It will be used by all polyshapes.
    PolyShapeView.editor = polyshapeEditorModel;

    let shapeMergerModel = new ShapeMergerModel(shapeCollectionModel);
    let shapeMergerController = new ShapeMergerController(shapeMergerModel);
    new ShapeMergerView(shapeMergerModel, shapeMergerController);

    let shapeGrouperModel = new ShapeGrouperModel(shapeCollectionModel);
    let shapeGrouperController = new ShapeGrouperController(shapeGrouperModel);
    let shapeGrouperView = new ShapeGrouperView(shapeGrouperModel, shapeGrouperController);

    let aamModel = new AAMModel(shapeCollectionModel, (xtl, xbr, ytl, ybr) => {
        playerModel.focus(xtl, xbr, ytl, ybr);
    });
    let aamController = new AAMController(aamModel);
    new AAMView(aamModel, aamController);

    shapeCreatorModel.subscribe(shapeCollectionModel);
    shapeGrouperModel.subscribe(shapeCollectionView);
    shapeCollectionModel.subscribe(shapeGrouperModel);

    $('#playerProgress').css('width', $('#player')["0"].clientWidth - 420);

    let playerGeometry = {
        width: $('#playerFrame').width(),
        height: $('#playerFrame').height(),
    };

    let playerModel = new PlayerModel(job, playerGeometry);
    let playerController = new PlayerController(playerModel,
        () => shapeCollectionModel.activeShape,
        (direction) => shapeCollectionModel.find(direction),
        Object.assign({}, playerGeometry, {
            left: $('#playerFrame').offset().left,
            top: $('#playerFrame').offset().top,
        }), job);
    new PlayerView(playerModel, playerController, job);

    let historyModel = new HistoryModel(playerModel);
    let historyController = new HistoryController(historyModel);
    new HistoryView(historyController, historyModel);

    playerModel.subscribe(shapeCollectionModel);
    playerModel.subscribe(shapeCollectionView);
    playerModel.subscribe(shapeCreatorView);
    playerModel.subscribe(shapeBufferView);
    playerModel.subscribe(shapeGrouperView);
    playerModel.subscribe(polyshapeEditorView);
    playerModel.shift(getURISearchParameter('frame') || 0, true);

    let shortkeys = window.cvat.config.shortkeys;

    setupHelpWindow(shortkeys);
    setupSettingsWindow();
    setupMenu(job, shapeCollectionModel, annotationParser, aamModel, playerModel, historyModel);
    setupFrameFilters();
    setupShortkeys(shortkeys);

    $(window).on('click', function(event) {
        Logger.updateUserActivityTimer();
        if (['helpWindow', 'settingsWindow'].indexOf(event.target.id) != -1) {
            event.target.classList.add('hidden');
        }
    });

    let totalStat = shapeCollectionModel.collectStatistic()[1];
    loadJobEvent.addValues({
        'track count': totalStat.boxes.annotation + totalStat.boxes.interpolation +
            totalStat.polygons.annotation + totalStat.polygons.interpolation +
            totalStat.polylines.annotation + totalStat.polylines.interpolation +
            totalStat.points.annotation + totalStat.points.interpolation,
        'frame count': job.stop - job.start + 1,
        'object count': totalStat.total,
        'box count': totalStat.boxes.annotation + totalStat.boxes.interpolation,
        'polygon count': totalStat.polygons.annotation + totalStat.polygons.interpolation,
        'polyline count': totalStat.polylines.annotation + totalStat.polylines.interpolation,
        'points count': totalStat.points.annotation + totalStat.points.interpolation,
    });
    loadJobEvent.close();

    window.onbeforeunload = function(e) {
        if (shapeCollectionModel.hasUnsavedChanges()) {
            let message = "You have unsaved changes. Leave this page?";
            e.returnValue = message;
            return message;
        }
        return;
    };

    $('#player').on('click', (e) => {
        if (e.target.tagName.toLowerCase() != 'input') {
            blurAllElements();
        }
    });
}

function setupFrameFilters() {
    let brightnessRange = $('#playerBrightnessRange');
    let contrastRange = $('#playerContrastRange');
    let saturationRange = $('#playerSaturationRange');
    let frameBackground = $('#frameBackground');
    let reset = $('#resetPlayerFilterButton');
    let brightness = 100;
    let contrast = 100;
    let saturation = 100;

    let shortkeys = window.cvat.config.shortkeys;
    brightnessRange.attr('title', `
        ${shortkeys['change_player_brightness'].view_value} - ${shortkeys['change_player_brightness'].description}`);
    contrastRange.attr('title', `
        ${shortkeys['change_player_contrast'].view_value} - ${shortkeys['change_player_contrast'].description}`);
    saturationRange.attr('title', `
        ${shortkeys['change_player_saturation'].view_value} - ${shortkeys['change_player_saturation'].description}`);

    let changeBrightnessHandler = Logger.shortkeyLogDecorator(function(e) {
        if (e.shiftKey) brightnessRange.prop('value', brightness + 10).trigger('input');
        else brightnessRange.prop('value', brightness - 10).trigger('input');
    });

    let changeContrastHandler = Logger.shortkeyLogDecorator(function(e) {
        if (e.shiftKey) contrastRange.prop('value', contrast + 10).trigger('input');
        else contrastRange.prop('value', contrast - 10).trigger('input');
    });

    let changeSaturationHandler = Logger.shortkeyLogDecorator(function(e) {
        if (e.shiftKey) saturationRange.prop('value', saturation + 10).trigger('input');
        else saturationRange.prop('value', saturation - 10).trigger('input');
    });

    Mousetrap.bind(shortkeys["change_player_brightness"].value, changeBrightnessHandler, 'keydown');
    Mousetrap.bind(shortkeys["change_player_contrast"].value, changeContrastHandler, 'keydown');
    Mousetrap.bind(shortkeys["change_player_saturation"].value, changeSaturationHandler, 'keydown');

    reset.on('click', function() {
        brightness = 100;
        contrast = 100;
        saturation = 100;
        brightnessRange.prop('value', brightness);
        contrastRange.prop('value', contrast);
        saturationRange.prop('value', saturation);
        updateFilterParameters();
    });

    brightnessRange.on('input', function(e) {
        let value = Math.clamp(+e.target.value, +e.target.min, +e.target.max);
        brightness = e.target.value = value;
        updateFilterParameters();
    });

    contrastRange.on('input', function(e) {
        let value = Math.clamp(+e.target.value, +e.target.min, +e.target.max);
        contrast = e.target.value = value;
        updateFilterParameters();
    });

    saturationRange.on('input', function(e) {
        let value = Math.clamp(+e.target.value, +e.target.min, +e.target.max);
        saturation = e.target.value = value;
        updateFilterParameters();
    });

    function updateFilterParameters() {
        frameBackground.css('filter', `contrast(${contrast}%) brightness(${brightness}%) saturate(${saturation}%)`);
    }
}


function setupShortkeys(shortkeys) {
    let annotationMenu = $('#annotationMenu');
    let settingsWindow = $('#settingsWindow');
    let helpWindow = $('#helpWindow');

    Mousetrap.prototype.stopCallback = function() {
        return false;
    };

    let openHelpHandler = Logger.shortkeyLogDecorator(function() {
        let helpInvisible = helpWindow.hasClass('hidden');
        if (helpInvisible) {
            annotationMenu.addClass('hidden');
            settingsWindow.addClass('hidden');
            helpWindow.removeClass('hidden');
        }
        else {
            helpWindow.addClass('hidden');
        }
        return false;
    });

    let openSettingsHandler = Logger.shortkeyLogDecorator(function() {
        let settingsInvisible = settingsWindow.hasClass('hidden');
        if (settingsInvisible) {
            annotationMenu.addClass('hidden');
            helpWindow.addClass('hidden');
            settingsWindow.removeClass('hidden');
        }
        else {
            $('#settingsWindow').addClass('hidden');
        }
        return false;
    });

    let saveHandler = Logger.shortkeyLogDecorator(function() {
        let saveButtonLocked = $('#saveButton').prop('disabled');
        if (!saveButtonLocked) {
            $('#saveButton').click();
        }
        return false;
    });

    Mousetrap.bind(shortkeys["open_help"].value, openHelpHandler, 'keydown');
    Mousetrap.bind(shortkeys["open_settings"].value, openSettingsHandler, 'keydown');
    Mousetrap.bind(shortkeys["save_work"].value, saveHandler, 'keydown');
}


function setupHelpWindow(shortkeys) {
    let closeHelpButton = $('#closeHelpButton');
    let helpTable = $('#shortkeyHelpTable');

    closeHelpButton.on('click', function() {
        $('#helpWindow').addClass('hidden');
    });

    for (let key in shortkeys) {
        helpTable.append($(`<tr> <td> ${shortkeys[key].view_value} </td> <td> ${shortkeys[key].description} </td> </tr>`));
    }
}


function setupSettingsWindow() {
    let closeSettingsButton = $('#closeSettignsButton');
    let autoSaveBox = $('#autoSaveBox');
    let autoSaveTime = $('#autoSaveTime');

    closeSettingsButton.on('click', function() {
        $('#settingsWindow').addClass('hidden');
    });

    let saveInterval = null;
    autoSaveBox.on('change', function(e) {
        if (saveInterval) {
            clearInterval(saveInterval);
            saveInterval = null;
        }

        if (e.target.checked) {
            let time = +autoSaveTime.prop('value');
            saveInterval = setInterval(() => {
                let saveButton = $('#saveButton');
                if (!saveButton.prop('disabled')) {
                    saveButton.click();
                }
            }, time * 1000 * 60);
        }

        autoSaveTime.on('change', () => {
            let value = Math.clamp(+e.target.value, +e.target.min, +e.target.max);
            e.target.value = value;
            autoSaveBox.trigger('change');
        });
    });
}


function setupMenu(job, shapeCollectionModel, annotationParser, aamModel, playerModel, historyModel) {
    let annotationMenu = $('#annotationMenu');
    let menuButton = $('#menuButton');

    function hide() {
        annotationMenu.addClass('hidden');
    }

    (function setupVisibility() {
        let timer = null;
        menuButton.on('click', () => {
            let [byLabelsStat, totalStat] = shapeCollectionModel.collectStatistic();
            let table = $('#annotationStatisticTable');
            table.find('.temporaryStatisticRow').remove();

            for (let labelId in byLabelsStat) {
                $(`<tr>
                    <td class="semiBold"> ${window.cvat.labelsInfo.labels()[labelId].normalize()} </td>
                    <td> ${byLabelsStat[labelId].boxes.annotation} </td>
                    <td> ${byLabelsStat[labelId].boxes.interpolation} </td>
                    <td> ${byLabelsStat[labelId].polygons.annotation} </td>
                    <td> ${byLabelsStat[labelId].polygons.interpolation} </td>
                    <td> ${byLabelsStat[labelId].polylines.annotation} </td>
                    <td> ${byLabelsStat[labelId].polylines.interpolation} </td>
                    <td> ${byLabelsStat[labelId].points.annotation} </td>
                    <td> ${byLabelsStat[labelId].points.interpolation} </td>
                    <td> ${byLabelsStat[labelId].manually} </td>
                    <td> ${byLabelsStat[labelId].interpolated} </td>
                    <td class="semiBold"> ${byLabelsStat[labelId].total} </td>
                </tr>`).addClass('temporaryStatisticRow').appendTo(table);
            }

            $(`<tr class="semiBold">
                <td> Total: </td>
                <td> ${totalStat.boxes.annotation} </td>
                <td> ${totalStat.boxes.interpolation} </td>
                <td> ${totalStat.polygons.annotation} </td>
                <td> ${totalStat.polygons.interpolation} </td>
                <td> ${totalStat.polylines.annotation} </td>
                <td> ${totalStat.polylines.interpolation} </td>
                <td> ${totalStat.points.annotation} </td>
                <td> ${totalStat.points.interpolation} </td>
                <td> ${totalStat.manually} </td>
                <td> ${totalStat.interpolated} </td>
                <td> ${totalStat.total} </td>
            </tr>`).addClass('temporaryStatisticRow').appendTo(table);
        });

        menuButton.on('click', () => {
            annotationMenu.removeClass('hidden');
            annotationMenu.css('top', menuButton.offset().top - annotationMenu.height() - menuButton.height() + 'px');
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }

            timer = setTimeout(hide, 1000);
        });

        annotationMenu.on('mouseout', () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }

            timer = setTimeout(hide, 500);
        });

        annotationMenu.on('mouseover', function() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        });
    })();

    $('#statTaskName').text(job.slug);
    $('#statTaskStatus').text(job.status);
    $('#statFrames').text(`[${job.start}-${job.stop}]`);
    $('#statOverlap').text(job.overlap);
    $('#statZOrder').text(job.z_order);
    $('#statFlipped').text(job.flipped);


    let shortkeys = window.cvat.config.shortkeys;
    $('#helpButton').on('click', () => {
        hide();
        $('#helpWindow').removeClass('hidden');
    });
    $('#helpButton').attr('title', `
        ${shortkeys['open_help'].view_value} - ${shortkeys['open_help'].description}`);

    $('#settingsButton').on('click', () => {
        hide();
        $('#settingsWindow').removeClass('hidden');
    });
    $('#settingsButton').attr('title', `
        ${shortkeys['open_settings'].view_value} - ${shortkeys['open_settings'].description}`);

    $('#downloadAnnotationButton').on('click', (e) => {
        dumpAnnotationRequest(e.target, job.taskid, job.slug);
    });

    // $('#predictButton').on('click', () => {
        // let i = 0;
        // setInterval(() => {
        //     i = ++i % 3;
        //     $('#predictButton').text('Predicting '+'.'.repeat(i));
        // }, 600);

    //     $.ajax({
    //         url: '/return/untrained/indices/kfb_512',
    //         success: (data) => {
    //             console.log(typeof(data));
    //             console.log(data.indices);
    //             //predictionRequest(job.taskid, 'kfb_512');
    //             console.log('job id', job.taskid);
    //             console.log('frame count:', job.stop - job.start + 1);
                
    //             let indices_arr = data.indices;
    //             let frameCount = indices_arr.length;
    //             let groupSize = 1;
    //             let iters = Math.ceil(frameCount / groupSize);

    //             slidingPredictionRequest(job.taskid, 'kfb_512', groupSize, iters, 0, indices_arr);
    //         },
    //         error: () => {
    //             alert('There was a problem with the request!');
    //         }
    //     });
    // });

    $('#predictButton').on('click', () => {
        let i = 0;
        setInterval(() => {
            i = ++i % 3;
            $('#predictButton').text('Predicting '+'.'.repeat(i));
        }, 600);
        $.ajax({
            url: '/return/untrained/indices/kfb_512_100_test',
            success: (data) => {
                console.log(typeof(data));
                console.log(data.indices);
                console.log('task id:', job.taskid);
                let startFrame = data.indices[0];
                let stopFrame = data.indices[data.indices.length - 1];
                console.log('start frame: ', startFrame);
                console.log('stop frame: ', stopFrame);
                let predictionBatchSize = 40;

                bigdlStartPrediction(job.taskid, 'kfb_512_100_test', startFrame, stopFrame, 0, 0 + predictionBatchSize -1, predictionBatchSize);
            },
            error: () => {
                alert('There was a problem with the request!');
            }
        });
    });

    $('#uploadAnnotationButton').on('click', () => {
        hide();
        confirm('Current annotation will be removed from the client. Continue?',
            () => {
                uploadAnnotation(shapeCollectionModel, historyModel, annotationParser, $('#uploadAnnotationButton'));
            }
        );
    });

    $('#removeAnnotationButton').on('click', () => {
        if (!window.cvat.mode) {
            hide();
            confirm('Do you want to remove all annotations? The action cannot be undone!',
                () => {
                    historyModel.empty();
                    shapeCollectionModel.empty();
                    removeLabels('kfb_512_100_test');
                }
            );
        }
    });

    $('#saveButton').on('click', () => {
        saveAnnotation(shapeCollectionModel, job);
    });
    $('#saveButton').attr('title', `
        ${shortkeys['save_work'].view_value} - ${shortkeys['save_work'].description}`);

    // JS function cancelFullScreen don't work after pressing
    // and it is famous problem.
    $('#fullScreenButton').on('click', () => {
        $('#playerFrame').toggleFullScreen();
    });

    $('#playerFrame').on('fullscreenchange webkitfullscreenchange mozfullscreenchange', () => {
        playerModel.updateGeometry({
            width: $('#playerFrame').width(),
            height: $('#playerFrame').height(),
        });
        playerModel.fit();
    });

    $('#switchAAMButton').on('click', () => {
        hide();
        aamModel.switchAAMMode();
    });

    $('#switchAAMButton').attr('title', `
        ${shortkeys['switch_aam_mode'].view_value} - ${shortkeys['switch_aam_mode'].description}`);
}


function drawBoxSize(scene, box) {
    let scale = window.cvat.player.geometry.scale;
    let width = +box.getAttribute('width');
    let height = +box.getAttribute('height');
    let text = `${width.toFixed(1)}x${height.toFixed(1)}`;
    let obj = this && this.textUI && this.rm ? this : {
        textUI: scene.text('').font({
            weight: 'bolder'
        }).fill('white'),

        rm: function() {
            if (this.textUI) {
                this.textUI.remove();
            }
        }
    };

    obj.textUI.clear().plain(text);

    obj.textUI.font({
        size: 20 / scale,
    }).style({
        stroke: 'black',
        'stroke-width': 1 / scale
    });

    obj.textUI.move(+box.getAttribute('x'), +box.getAttribute('y'));

    return obj;
}


function uploadAnnotation(shapeCollectionModel, historyModel, annotationParser, uploadAnnotationButton) {
    $('#annotationFileSelector').one('change', (e) => {
        let file = e.target.files['0'];
        e.target.value = "";
        if (!file || file.type != 'text/xml') return;
        uploadAnnotationButton.text('Preparing..');
        uploadAnnotationButton.prop('disabled', true);
        let overlay = showOverlay("File is being uploaded..");

        let fileReader = new FileReader();
        fileReader.onload = function(e) {
            let data = null;

            let asyncParse = function() {
                try {
                    data = annotationParser.parse(e.target.result);
                }
                catch (err) {
                    overlay.remove();
                    showMessage(err.message);
                    return;
                }
                finally {
                    uploadAnnotationButton.text('Upload Annotation');
                    uploadAnnotationButton.prop('disabled', false);
                }

                let asyncImport = function() {
                    try {
                        historyModel.empty();
                        shapeCollectionModel.empty();
                        shapeCollectionModel.import(data);
                        shapeCollectionModel.update();
                    }
                    finally {
                        overlay.remove();
                    }
                };

                overlay.setMessage('Data are being imported..');
                setTimeout(asyncImport);
            };

            overlay.setMessage('File is being parsed..');
            setTimeout(asyncParse);
        };
        fileReader.readAsText(file);
    }).click();
}


function saveAnnotation(shapeCollectionModel, job) {
    let saveButton = $('#saveButton');

    Logger.addEvent(Logger.EventType.saveJob);
    let totalStat = shapeCollectionModel.collectStatistic()[1];
    Logger.addEvent(Logger.EventType.sendTaskInfo, {
        'track count': totalStat.boxes.annotation + totalStat.boxes.interpolation +
            totalStat.polygons.annotation + totalStat.polygons.interpolation +
            totalStat.polylines.annotation + totalStat.polylines.interpolation +
            totalStat.points.annotation + totalStat.points.interpolation,
        'frame count': job.stop - job.start + 1,
        'object count': totalStat.total,
        'box count': totalStat.boxes.annotation + totalStat.boxes.interpolation,
        'polygon count': totalStat.polygons.annotation + totalStat.polygons.interpolation,
        'polyline count': totalStat.polylines.annotation + totalStat.polylines.interpolation,
        'points count': totalStat.points.annotation + totalStat.points.interpolation,
    });

    let exportedData = shapeCollectionModel.export();
    let annotationLogs = Logger.getLogs();

    const data = {
        annotation: exportedData,
        logs: JSON.stringify(annotationLogs.export()),
    };

    saveButton.prop('disabled', true);
    saveButton.text('Saving..');

    saveJobRequest(job.jobid, 'kfb_512_100_test', data, () => {
        // success
        shapeCollectionModel.updateHash();
        saveButton.text('Success!');
        setTimeout(() => {
            saveButton.prop('disabled', false);
            saveButton.text('Save Work');
        }, 3000);

        // refresh labels info from HBase to display them on the screen
        save_data_from_hbase(job.jobid, 'kfb_512_100_test');
    }, (response) => {
        // error
        saveButton.prop('disabled', false);
        saveButton.text('Save Work');
        let message = `Impossible to save job. Errors was occured. Status: ${response.status}`;
        showMessage(message + ' ' + 'Please immediately report the problem to support team');
        throw Error(message);
    });
}

function translateSVGPos(svgCanvas, clientX, clientY) {
    let pt = svgCanvas.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    pt = pt.matrixTransform(svgCanvas.getScreenCTM().inverse());

    let pos = {
        x: pt.x,
        y: pt.y
    };

    if (platform.name.toLowerCase() == 'firefox') {
        pos.x /= window.cvat.player.geometry.scale;
        pos.y /= window.cvat.player.geometry.scale;
    }

    return pos;
}


function blurAllElements() {
    document.activeElement.blur();
}