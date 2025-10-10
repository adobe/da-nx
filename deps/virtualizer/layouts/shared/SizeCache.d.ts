/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
export interface SizeCacheConfig {
    roundAverageSize?: boolean;
}
export declare class SizeCache {
    private _map;
    private _roundAverageSize;
    totalSize: number;
    constructor(config?: SizeCacheConfig);
    set(index: number | string, value: number): void;
    get averageSize(): number;
    getSize(index: number | string): number | undefined;
    clear(): void;
}
//# sourceMappingURL=SizeCache.d.ts.map