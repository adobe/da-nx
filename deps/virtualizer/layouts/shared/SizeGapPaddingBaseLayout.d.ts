/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { BaseLayoutConfig } from './Layout.js';
import { BaseLayout } from './BaseLayout.js';
import { ScrollDirection, Size } from './Layout.js';
export type PixelSize = `${'0' | `${number}px`}`;
type GapValue = PixelSize;
type TwoGapValues = `${GapValue} ${GapValue}`;
export type GapSpec = GapValue | TwoGapValues;
export type AutoGapSpec = PixelSize | `${PixelSize} ${PixelSize}` | `auto ${PixelSize}` | `${PixelSize} auto`;
type PaddingValue = PixelSize | 'match-gap';
type TwoPaddingValues = `${PaddingValue} ${PaddingValue}`;
type ThreePaddingValues = `${TwoPaddingValues} ${PaddingValue}`;
type FourPaddingValues = `${ThreePaddingValues} ${PaddingValue}`;
type PaddingSpec = PaddingValue | TwoPaddingValues | ThreePaddingValues | FourPaddingValues;
type PixelDimensions = {
    width: PixelSize;
    height: PixelSize;
};
export declare function gap1(direction: ScrollDirection): "column" | "row";
export declare function gap2(direction: ScrollDirection): "column" | "row";
export declare function padding1(direction: ScrollDirection): [side, side];
export declare function padding2(direction: ScrollDirection): [side, side];
export interface SizeGapPaddingBaseLayoutConfig extends BaseLayoutConfig {
    padding?: PaddingSpec;
    itemSize?: PixelDimensions | PixelSize;
}
type gap = 'row' | 'column';
type side = 'top' | 'right' | 'bottom' | 'left';
type Gaps = {
    [key in gap]: number;
};
type Padding = {
    [key in side]: number;
};
export declare abstract class SizeGapPaddingBaseLayout<C extends SizeGapPaddingBaseLayoutConfig> extends BaseLayout<C> {
    protected _itemSize: Size | {};
    protected _gaps: Gaps | {};
    protected _padding: Padding | {};
    protected _getDefaultConfig(): C;
    protected get _gap(): number;
    protected get _idealSize(): number;
    protected get _idealSize1(): number;
    protected get _idealSize2(): number;
    protected get _gap1(): number;
    protected get _gap2(): number;
    protected get _padding1(): [number, number];
    protected get _padding2(): [number, number];
    set itemSize(dims: PixelDimensions | PixelSize);
    set gap(spec: GapSpec | AutoGapSpec);
    protected _setGap(spec: GapSpec | AutoGapSpec): void;
    set padding(spec: PaddingSpec);
}
export {};
//# sourceMappingURL=SizeGapPaddingBaseLayout.d.ts.map