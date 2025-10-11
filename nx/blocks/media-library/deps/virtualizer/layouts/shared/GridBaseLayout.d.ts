/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { SizeGapPaddingBaseLayout, SizeGapPaddingBaseLayoutConfig, AutoGapSpec } from './SizeGapPaddingBaseLayout.js';
type FlexSpec = boolean | {
    preserve: 'aspect-ratio' | 'area' | 'width' | 'height';
};
type JustifySpec = 'start' | 'center' | 'end' | 'space-evenly' | 'space-around' | 'space-between';
export interface GridBaseLayoutConfig extends Omit<SizeGapPaddingBaseLayoutConfig, 'gap'> {
    gap?: AutoGapSpec;
    flex?: FlexSpec;
    justify?: JustifySpec;
}
interface GridLayoutMetrics {
    rolumns: number;
    itemSize1: number;
    itemSize2: number;
    gap1: number;
    gap2: number;
    padding1: {
        start: number;
        end: number;
    };
    padding2: {
        start: number;
        end: number;
    };
    positions: number[];
}
export declare abstract class GridBaseLayout<C extends GridBaseLayoutConfig> extends SizeGapPaddingBaseLayout<C> {
    protected _metrics: GridLayoutMetrics | null;
    flex: FlexSpec | null;
    justify: JustifySpec | null;
    protected _getDefaultConfig(): C;
    set gap(spec: AutoGapSpec);
    protected _updateLayout(): void;
}
export {};
//# sourceMappingURL=GridBaseLayout.d.ts.map