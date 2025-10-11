/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { LayoutHostSink, Positions, Size } from './shared/Layout.js';
import { GridBaseLayout, GridBaseLayoutConfig } from './shared/GridBaseLayout.js';
import { PixelSize } from './shared/SizeGapPaddingBaseLayout.js';
type GetAspectRatio = (item: unknown) => number;
export interface MasonryLayoutConfig extends Omit<GridBaseLayoutConfig, 'flex' | 'itemSize'> {
    flex: boolean;
    itemSize: PixelSize;
    getAspectRatio: GetAspectRatio;
}
type MasonryLayoutSpecifier = MasonryLayoutConfig & {
    type: new (hostSink: LayoutHostSink, config?: MasonryLayoutConfig) => MasonryLayout;
};
type MasonryLayoutSpecifierFactory = (config?: MasonryLayoutConfig) => MasonryLayoutSpecifier;
export declare const masonry: MasonryLayoutSpecifierFactory;
export declare class MasonryLayout extends GridBaseLayout<MasonryLayoutConfig> {
    private _RANGE_MAP_GRANULARITY;
    private _positions;
    private _rangeMap;
    private _getAspectRatio?;
    protected _getDefaultConfig(): MasonryLayoutConfig;
    set getAspectRatio(getAspectRatio: GetAspectRatio);
    protected _setItems(items: unknown[]): void;
    protected _getItemSize(_idx: number): Size;
    protected _updateLayout(): void;
    private _getRangeMapKey;
    private _layOutChildren;
    _getActiveItems(): void;
    _getItemPosition(idx: number): Positions;
    _updateScrollSize(): void;
}
export {};
//# sourceMappingURL=masonry.d.ts.map