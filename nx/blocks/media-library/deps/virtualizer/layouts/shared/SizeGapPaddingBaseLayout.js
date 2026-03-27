/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { BaseLayout, dim1, dim2 } from './BaseLayout.js';
// function numberToPixelSize(n: number): PixelSize {
//     return n === 0 ? '0' : `${n}px`;
// }
function paddingValueToNumber(v) {
    if (v === 'match-gap') {
        return Infinity;
    }
    return parseInt(v);
}
function gapValueToNumber(v) {
    if (v === 'auto') {
        return Infinity;
    }
    return parseInt(v);
}
export function gap1(direction) {
    return direction === 'horizontal' ? 'column' : 'row';
}
export function gap2(direction) {
    return direction === 'horizontal' ? 'row' : 'column';
}
export function padding1(direction) {
    return direction === 'horizontal' ? ['left', 'right'] : ['top', 'bottom'];
}
export function padding2(direction) {
    return direction === 'horizontal' ? ['top', 'bottom'] : ['left', 'right'];
}
export class SizeGapPaddingBaseLayout extends BaseLayout {
    constructor() {
        super(...arguments);
        this._itemSize = {};
        this._gaps = {};
        this._padding = {};
    }
    _getDefaultConfig() {
        return Object.assign({}, super._getDefaultConfig(), {
            itemSize: { width: '300px', height: '300px' },
            gap: '8px',
            padding: 'match-gap',
        });
    }
    // Temp, to support current flexWrap implementation
    get _gap() {
        return this._gaps.row;
    }
    // Temp, to support current flexWrap implementation
    get _idealSize() {
        return this._itemSize[dim1(this.direction)];
    }
    get _idealSize1() {
        return this._itemSize[dim1(this.direction)];
    }
    get _idealSize2() {
        return this._itemSize[dim2(this.direction)];
    }
    get _gap1() {
        return this._gaps[gap1(this.direction)];
    }
    get _gap2() {
        return this._gaps[gap2(this.direction)];
    }
    get _padding1() {
        const padding = this._padding;
        const [start, end] = padding1(this.direction);
        return [padding[start], padding[end]];
    }
    get _padding2() {
        const padding = this._padding;
        const [start, end] = padding2(this.direction);
        return [padding[start], padding[end]];
    }
    set itemSize(dims) {
        const size = this._itemSize;
        if (typeof dims === 'string') {
            dims = {
                width: dims,
                height: dims,
            };
        }
        const width = parseInt(dims.width);
        const height = parseInt(dims.height);
        if (width !== size.width) {
            size.width = width;
            this._triggerReflow();
        }
        if (height !== size.height) {
            size.height = height;
            this._triggerReflow();
        }
    }
    set gap(spec) {
        this._setGap(spec);
    }
    // This setter is overridden in specific layouts to narrow the accepted types
    _setGap(spec) {
        const values = spec.split(' ').map((v) => gapValueToNumber(v));
        const gaps = this._gaps;
        if (values[0] !== gaps.row) {
            gaps.row = values[0];
            this._triggerReflow();
        }
        if (values[1] === undefined) {
            if (values[0] !== gaps.column) {
                gaps.column = values[0];
                this._triggerReflow();
            }
        }
        else {
            if (values[1] !== gaps.column) {
                gaps.column = values[1];
                this._triggerReflow();
            }
        }
    }
    set padding(spec) {
        const padding = this._padding;
        const values = spec
            .split(' ')
            .map((v) => paddingValueToNumber(v));
        if (values.length === 1) {
            padding.top = padding.right = padding.bottom = padding.left = values[0];
            this._triggerReflow();
        }
        else if (values.length === 2) {
            padding.top = padding.bottom = values[0];
            padding.right = padding.left = values[1];
            this._triggerReflow();
        }
        else if (values.length === 3) {
            padding.top = values[0];
            padding.right = padding.left = values[1];
            padding.bottom = values[2];
            this._triggerReflow();
        }
        else if (values.length === 4) {
            ['top', 'right', 'bottom', 'left'].forEach((side, idx) => (padding[side] = values[idx]));
            this._triggerReflow();
        }
    }
}
//# sourceMappingURL=SizeGapPaddingBaseLayout.js.map