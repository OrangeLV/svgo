'use strict';

exports.type = 'full';

exports.active = false;

exports.params = {
};

var pathElems = require('./_collections.js').pathElems,
    cleanupOutData = require('../lib/svgo/tools').cleanupOutData,
    path2js = require('./_path.js').path2js,
    js2path = require('./_path.js').js2path,
    transform2js = require('./_transforms.js').transform2js,
    transformsMultiply = require('./_transforms').transformsMultiply;

var INVERT_Y_TRANSFORM = {
    name: 'matrix',
    data: [1,0,0,-1,0,0]
};
var regSeparator = /\s+,?\s*|,\s*/;

/**
 * Remove vertical flipping from Symbols and their child graphics that is introduced by Illustrator SVG output
 *
 * @param {Object} item current iteration item
 * @param {Object} params plugin params
 *
 * @author Edgar Simson @edzis
 */

exports.fn = function(data, params) {
    function traverseUses(items, isRootLevel) {
        items.content.forEach(function(item){
            var _isRootLevel = isRootLevel;

            if (item.isElem('use')) {
                cleanInstance(item, params, _isRootLevel, !_isRootLevel);
                _isRootLevel = false;
            }
            if (item.isElem('text')) {
                cleanInstance(item, params, _isRootLevel, !_isRootLevel);
            }
            if (item.isElem('symbol')) {
                _isRootLevel = false;
            }
            // go deeper
            if (item.content) {
                traverseUses(item, _isRootLevel);
            }
        });
    };
    traverseUses(data, true);


    function traverseSymbols(items, symbol) {
        items.content.forEach(function(item){
            var _symbol = symbol;

            if(item.isElem('symbol')) {
                _symbol = item;
                cleanSymbol(item, params);
            }
            if(_symbol) {
                cleanGraphics(item, params);
            }

            // go deeper
            if (item.content) {
                traverseSymbols(item, _symbol);
            }
        });
    };
    traverseSymbols(data, null);

    return data;
};

function cleanInstance(item, params, invertY, flipY) {
    if(item.hasAttr('y')) {
        var y = parseFloat(item.attr('y').value);
        var height = parseFloat(item.attr('height').value);
        item.attr('y').value = -y - height;
    }

    // transform
    if (!item.hasAttr('transform')) {
        return;
    }

    var transforms = transform2js(item.attr('transform').value);
    transforms.forEach(function(transform) {
        if(transform.name !== 'matrix') {
            return;
        }
        if(invertY) {
            transform.data = transformsMultiply([transform, INVERT_Y_TRANSFORM]).data;
        }
        if(flipY) {
            transform.data[1] *= -1;
            transform.data[2] *= -1;
            transform.data[5] *= -1;
        };
    })
    item.attr('transform').value = js2transform(transforms, params);
}

function cleanSymbol(item, params) {
    var symbolHref = '#' + item.attr('id').value;

    if(!item.hasAttr('viewBox')) {
        return;
    }

    var viewBox = item.attr('viewBox').value;

    var match = item.attr('viewBox').value.split(/ /g);
    if(match) {
        match[1] = - parseFloat(match[3]) - parseFloat(match[1]); // y += height
        item.attr('viewBox').value = match.join(' ');
    }
};

function cleanGraphics(item, params) {
    if (
        item.isElem(pathElems) &&
        item.hasAttr('d')
    ) {
        var data = path2js(item.attr('d').value);

        if (data.length) {
            data = invertY(data);
            item.pathJS = data;
            item.attr('d').value = js2path(data, params);
        }
    }

    if ((
        item.isElem('polyline') ||
        item.isElem('polygon')
        ) &&
        item.hasAttr('points')
    ) {

        var coords = item.attr('points').value.trim().split(regSeparator);
        if (coords.length < 4) return false;

        for (var i = 0, l = coords.length; i < l; i+=2) {
            coords[i] += ",";
        };
        for (var i = 1, l = coords.length; i < l; i+=2) {
            coords[i] = -coords[i] + ' ';
        };
        item.attr('points').value = coords.join('');
    }


    if ( item.isElem('line') || item.isElem('linearGradient') ) {
        item.hasAttr('y1') && (item.attr('y1').value = -parseFloat(item.attr('y1').value));
        item.hasAttr('y2') && (item.attr('y2').value = -parseFloat(item.attr('y2').value));
    }

    if ( item.isElem('ellipse') || item.isElem('radialGradient') ) {
        item.hasAttr('cy') && (item.attr('cy').value = -parseFloat(item.attr('cy').value));
    }

    //TODO otherbasic shapes
};

/**
 * Invert  Y axis
 *
 * @param {Array} path input path data
 * @param {Object} params plugin params
 * @return {Array} output path data
 */
function invertY(path) {

    var instruction,
        data

    path.forEach(function(item) {

        instruction = item.instruction.toLowerCase();
        data = item.data;

        // data !== !z
        if (data) {
            if (instruction === 'v') {
                // y
                // 0
                data[0] *= -1;
            } else if ('mlt'.indexOf(instruction) > -1) {
                // x y
                // 0  1
                data[1] *= -1;
            } else if ('sq'.indexOf(instruction) > -1) {
                // x1 y1 x y
                // 0  1  2  3
                data[1] *= -1;
                data[3] *= -1;
            } else if ('c'.indexOf(instruction) > -1) {
                // x1 y1 x2 y2 x y
                // 0  1  2  3  4 5
                data[1] *= -1;
                data[3] *= -1;
                data[5] *= -1;
            } else if ('a'.indexOf(instruction) > -1) {
                // rx ry x-axis-rotation large-arc-flag sweep-flag x y
                // 0  1  2               3              4          5 6
                data[1] *= -1;
                data[6] *= -1;
            }
        }
    });

    return path;
}

/**
 * Convert transforms JS representation to string.
 *
 * @param {Array} transformJS JS representation array
 * @param {Object} params plugin params
 * @return {String} output string
 */
function js2transform(transformJS, params) {
    var transformString = '';

    // collect output value string
    transformJS.forEach(function(transform) {
        transformString += (transformString ? ' ' : '') + transform.name + '(' + cleanupOutData(transform.data, params) + ')';
    });

    return transformString;
}
