/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { SizeGapPaddingBaseLayout, SizeGapPaddingBaseLayoutConfig, GapSpec } from './shared/SizeGapPaddingBaseLayout.js';
import { ChildMeasurements, ItemBox, LayoutHostSink, MeasureChildFunction, Positions, Size } from './shared/Layout.js';
interface FlexWrapLayoutConfig extends SizeGapPaddingBaseLayoutConfig {
    gap?: GapSpec;
}
type FlexWrapLayoutSpecifier = FlexWrapLayoutConfig & {
    type: new (hostSink: LayoutHostSink, config?: FlexWrapLayoutConfig) => FlexWrapLayout;
};
type FlexWrapLayoutSpecifierFactory = (config?: FlexWrapLayoutConfig) => FlexWrapLayoutSpecifier;
export declare const layout1dFlex: FlexWrapLayoutSpecifierFactory;
interface Rolumn {
    _startIdx: number;
    _endIdx: number;
    _startPos: number;
    _size: number;
}
interface Chunk {
    _itemPositions: Array<Positions>;
    _rolumns: Array<Rolumn>;
    _size: number;
    _dirty: boolean;
}
/**
 * TODO @straversi: document and test this Layout.
 */
export declare class FlexWrapLayout extends SizeGapPaddingBaseLayout<FlexWrapLayoutConfig> {
    private _itemSizes;
    private _chunkLength;
    private _chunks;
    private _chunkSizeCache;
    private _rolumnSizeCache;
    private _rolumnLengthCache;
    private _aspectRatios;
    private _numberOfAspectRatiosMeasured;
    listenForChildLoadEvents: boolean;
    set gap(spec: GapSpec);
    /**
     * TODO graynorton@ Don't hard-code Flickr - probably need a config option
     */
    measureChildren: MeasureChildFunction;
    updateItemSizes(sizes: ChildMeasurements): void;
    _newChunk(): {
        _rolumns: never[];
        _itemPositions: never[];
        _size: number;
        _dirty: boolean;
    };
    _getChunk(idx: number | string): Chunk;
    _recordAspectRatio(dims: ItemBox): void;
    _getRandomAspectRatio(): Size;
    _getActiveItems(): void;
    _getItemPosition(idx: number): Positions;
    _getItemSize(idx: number): Size;
    _getNaturalItemDims(idx: number): Size;
    _layOutChunk(startIdx: number, endIdx: number): Chunk;
    _updateLayout(): void;
    _updateScrollSize(): void;
}
export {};
//# sourceMappingURL=flexWrap.d.ts.map