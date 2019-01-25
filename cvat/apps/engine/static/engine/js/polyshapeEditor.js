/*
 * Copyright (C) 2018 Intel Corporation
 *
 * SPDX-License-Identifier: MIT
 */

/* exported PolyshapeEditorModel PolyshapeEditorController PolyshapeEditorView */

"use strict";

class PolyshapeEditorModel extends Listener {
    constructor() {
        super("onPolyshapeEditorUpdate", () => this);

        this._modeName = 'poly_editing';
        this._active = false;
        this._data = {
            points: null,
            color: null,
            start: null,
            oncomplete: null,
            type: null,
            event: null,
        };
    }

    edit(type, points, color, start, event, oncomplete) {
        if (!this._active && !window.cvat.mode) {
            window.cvat.mode = this._modeName;
            this._active = true;
            this._data.points = points;
            this._data.color = color;
            this._data.start = start;
            this._data.oncomplete = oncomplete;
            this._data.type = type;
            this._data.event = event;
            this.notify();
        }
        else if (this._active) {
            throw Error('Polyshape has been being edited already');
        }
    }

    finish(points) {
        if (this._active && this._data.oncomplete) {
            this._data.oncomplete(points);
        }

        this.cancel();
    }

    cancel() {
        if (this._active) {
            this._active = false;
            if (window.cvat.mode != this._modeName) {
                throw Error(`Inconsistent behaviour has been detected. Edit mode is activated, but mode variable is '${window.cvat.mode}'`);
            }
            else {
                window.cvat.mode = null;
            }

            this._data.points = null;
            this._data.color = null;
            this._data.start = null;
            this._data.oncomplete = null;
            this._data.type = null;
            this._data.event = null;
            this.notify();
        }
    }

    get active() {
        return this._active;
    }

    get data() {
        return this._data;
    }
}


class PolyshapeEditorController {
    constructor(model) {
        this._model = model;
    }

    finish(points) {
        this._model.finish(points);
    }

    cancel() {
        this._model.cancel();
    }
}


class PolyshapeEditorView {
    constructor(model, controller) {
        this._controller = controller;
        this._data = null;

        this._frameContent = SVG.adopt($('#frameContent')[0]);
        this._originalShapePointsGroup = null;
        this._originalShapePoints = [];
        this._originalShape = null;
        this._correctLine = null;

        this._scale = window.cvat.player.geometry.scale;
        this._frame = window.cvat.player.frames.current;

        model.subscribe(this);
    }

    _rescaleDrawPoints() {
        let scale = this._scale;
        $('.svg_draw_point').each(function() {
            this.instance.radius(POINT_RADIUS / (2 * scale)).attr('stroke-width', STROKE_WIDTH / (2 * scale));
        });
    }

    // After this method start element will be in begin of the array.
    // Array will consist only range elements from start to stop
    _resortPoints(points, start, stop) {
        let sorted = [];

        if (points.indexOf(start) === -1 || points.indexOf(stop) === -1) {
            throw Error('Point array must consist both start and stop elements');
        }

        let idx = points.indexOf(start) + 1;
        let condition = true;  // constant condition is eslint error
        while (condition) {
            if (idx >= points.length) idx = 0;
            if (points[idx] === stop) condition = false;
            else sorted.push(points[idx++]);
        }

        return sorted;
    }

    // Method represents array like circle list and find shortest way from source to target
    // It returns integer number - distance from source to target.
    // It can be negative if shortest way is anti clockwise
    _findMinCircleDistance(array, source, target) {
        let clockwise_distance = 0;
        let anti_clockwise_distance = 0;

        let source_idx = array.indexOf(source);
        let target_idx = array.indexOf(target);

        if (source_idx === -1 || target_idx == -1) {
            throw Error('Array should consist both elements');
        }

        let idx = source_idx;
        while (array[idx++] != target) {
            clockwise_distance ++;
            if (idx >= array.length) idx = 0;
        }

        idx = source_idx;
        while (array[idx--] != target) {
            anti_clockwise_distance ++;
            if (idx < 0) idx = array.length - 1;
        }

        let offset = Math.min(clockwise_distance, anti_clockwise_distance);
        if (anti_clockwise_distance < clockwise_distance) {
            offset = -offset;
        }

        return offset;
    }

    _startEdit() {
        this._frame = window.cvat.player.frames.current;
        let strokeWidth = this._data.type === 'points' ? 0 : STROKE_WIDTH / this._scale;

        // Draw copy of original shape
        if (this._data.type === 'polygon') {
            this._originalShape = this._frameContent.polygon(this._data.points);
        }
        else {
            this._originalShape = this._frameContent.polyline(this._data.points);
        }

        this._originalShape.attr({
            'stroke-width': strokeWidth,
            'stroke': 'white',
            'fill': 'none',
        });

        // Create the correct line
        this._correctLine = this._frameContent.polyline().draw({snapToGrid: 0.1}).attr({
            'stroke-width': strokeWidth / 2,
            'fill': 'none',
            'stroke': 'red',
        }).on('mouseover', () => false);


        // Add points to original shape
        let pointRadius = POINT_RADIUS / this._scale;
        this._originalShapePointsGroup = this._frameContent.group();
        for (let point of PolyShapeModel.convertStringToNumberArray(this._data.points)) {
            let uiPoint = this._originalShapePointsGroup.circle(pointRadius * 2)
                .move(point.x - pointRadius, point.y - pointRadius)
                .attr({
                    'stroke-width': strokeWidth,
                    'stroke': 'black',
                    'fill': 'white',
                    'z_order': Number.MAX_SAFE_INTEGER,
                });
            this._originalShapePoints.push(uiPoint);
        }


        let prevPoint = {
            x: this._data.event.clientX,
            y: this._data.event.clientY
        };

        this._correctLine.draw('point', this._data.event);
        this._rescaleDrawPoints();
        this._frameContent.on('mousemove.polyshapeEditor', (e) => {
            if (e.shiftKey && this._data.type != 'points') {
                let delta = Math.sqrt(Math.pow(e.clientX - prevPoint.x, 2) + Math.pow(e.clientY - prevPoint.y, 2));
                let deltaTreshold = 15;
                if (delta > deltaTreshold) {
                    this._correctLine.draw('point', e);
                    prevPoint = {
                        x: e.clientX,
                        y: e.clientY
                    };
                }
            }
        });

        this._frameContent.on('contextmenu.polyshapeEditor', (e) => {
            if (PolyShapeModel.convertStringToNumberArray(this._correctLine.attr('points')).length > 2) {
                this._correctLine.draw('undo');
            }
            else {
                // Finish without points argument is just cancel
                this._controller.finish();
            }
            e.preventDefault();
            e.stopPropagation();
        });

        this._correctLine.on('drawpoint', (e) => {
            prevPoint = {
                x: e.detail.event.clientX,
                y: e.detail.event.clientY
            };
            this._rescaleDrawPoints();
        });

        this._correctLine.on('drawstart', () => this._rescaleDrawPoints());


        for (let instance of this._originalShapePoints) {
            instance.on('mouseover', () => {
                instance.attr('stroke-width', STROKE_WIDTH * 2 / this._scale);
            }).on('mouseout', () => {
                instance.attr('stroke-width', STROKE_WIDTH / this._scale);
            }).on('mousedown', (e) => {
                if (e.which != 1) return;
                let currentPoints = PolyShapeModel.convertStringToNumberArray(this._data.points);
                let correctPoints = PolyShapeModel.convertStringToNumberArray(this._correctLine.attr('points'));
                let resultPoints = [];

                if (this._data.type === 'polygon') {
                    let startPtIdx = this._data.start;
                    let stopPtIdx = $(instance.node).index();
                    let offset = this._findMinCircleDistance(currentPoints, currentPoints[startPtIdx], currentPoints[stopPtIdx]);

                    if (!offset) {
                        currentPoints = this._resortPoints(currentPoints, currentPoints[startPtIdx], currentPoints[stopPtIdx]);
                        resultPoints.push(...correctPoints.slice(0, -2));
                        resultPoints.push(...currentPoints);
                    }
                    else {
                        resultPoints.push(...correctPoints);
                        if (offset < 0) {
                            resultPoints = resultPoints.reverse();
                            currentPoints = this._resortPoints(currentPoints, currentPoints[startPtIdx], currentPoints[stopPtIdx]);
                        }
                        else {
                            currentPoints = this._resortPoints(currentPoints, currentPoints[stopPtIdx], currentPoints[startPtIdx]);
                        }

                        resultPoints.push(...currentPoints);
                    }
                }
                else if (this._data.type === 'polyline') {
                    let startPtIdx = this._data.start;
                    let stopPtIdx = $(instance.node).index();

                    if (startPtIdx === stopPtIdx) {
                        resultPoints.push(...correctPoints.slice(1, -1).reverse());
                        resultPoints.push(...currentPoints);
                    }
                    else {
                        if (startPtIdx > stopPtIdx) {
                            if (startPtIdx < currentPoints.length - 1) {
                                resultPoints.push(...currentPoints.slice(startPtIdx + 1).reverse());
                            }
                            resultPoints.push(...correctPoints.slice(0, -1));
                            if (stopPtIdx > 0) {
                                resultPoints.push(...currentPoints.slice(0, stopPtIdx).reverse());
                            }
                        }
                        else {
                            if (startPtIdx > 0) {
                                resultPoints.push(...currentPoints.slice(0, startPtIdx));
                            }
                            resultPoints.push(...correctPoints.slice(0, -1));
                            if (stopPtIdx < currentPoints.length) {
                                resultPoints.push(...currentPoints.slice(stopPtIdx + 1));
                            }
                        }
                    }
                }
                else {
                    resultPoints.push(...currentPoints);
                    resultPoints.push(...correctPoints.slice(1, -1).reverse());
                }

                this._correctLine.draw('cancel');
                this._controller.finish(PolyShapeModel.convertNumberArrayToString(resultPoints));
            });
        }
    }

    _endEdit() {
        for (let uiPoint of this._originalShapePoints) {
            uiPoint.off();
            uiPoint.remove();
        }

        this._originalShapePoints = [];
        this._originalShapePointsGroup.remove();
        this._originalShapePointsGroup = null;
        this._originalShape.remove();
        this._originalShape = null;
        this._correctLine.off('drawstart');
        this._correctLine.off('drawpoint');
        this._correctLine.draw('cancel');
        this._correctLine.remove();
        this._correctLine = null;
        this._data = null;

        this._frameContent.off('mousemove.polyshapeEditor');
        this._frameContent.off('mousedown.polyshapeEditor');
        this._frameContent.off('contextmenu.polyshapeEditor');
    }


    onPolyshapeEditorUpdate(model) {
        if (model.active && !this._data) {
            this._data = model.data;
            this._startEdit();
        }
        else if (!model.active) {
            this._endEdit();
        }
    }

    onPlayerUpdate(player) {
        let scale = player.geometry.scale;
        if (this._scale != scale) {
            this._scale = scale;

            let strokeWidth = this._data && this._data.type === 'points' ? 0 : STROKE_WIDTH / this._scale;
            let pointRadius = POINT_RADIUS / this._scale;

            if (this._originalShape) {
                this._originalShape.attr('stroke-width', strokeWidth);
            }

            if (this._correctLine) {
                this._correctLine.attr('stroke-width', strokeWidth / 2);
            }

            for (let uiPoint of this._originalShapePoints) {
                uiPoint.attr('stroke-width', strokeWidth);
                uiPoint.radius(pointRadius);
            }

            this._rescaleDrawPoints();
        }

        // Abort if frame have been changed
        if (player.frames.current != this._frame && this._data) {
            this._controller.cancel();
        }
    }
}
