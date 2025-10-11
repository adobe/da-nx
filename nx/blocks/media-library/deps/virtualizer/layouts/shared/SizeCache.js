/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
export class SizeCache {
    constructor(config) {
        this._map = new Map();
        this._roundAverageSize = false;
        this.totalSize = 0;
        if (config?.roundAverageSize === true) {
            this._roundAverageSize = true;
        }
    }
    set(index, value) {
        const prev = this._map.get(index) || 0;
        this._map.set(index, value);
        this.totalSize += value - prev;
    }
    get averageSize() {
        if (this._map.size > 0) {
            const average = this.totalSize / this._map.size;
            return this._roundAverageSize ? Math.round(average) : average;
        }
        return 0;
    }
    getSize(index) {
        return this._map.get(index);
    }
    clear() {
        this._map.clear();
        this.totalSize = 0;
    }
}
//# sourceMappingURL=SizeCache.js.map