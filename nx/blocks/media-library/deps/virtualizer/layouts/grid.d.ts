/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { LayoutHostSink, Positions, Size } from './shared/Layout.js';
import { GridBaseLayout, GridBaseLayoutConfig } from './shared/GridBaseLayout.js';
type GridLayoutSpecifier = GridBaseLayoutConfig & {
    type: new (hostSink: LayoutHostSink, config?: GridBaseLayoutConfig) => GridLayout;
};
type GridLayoutSpecifierFactory = (config?: GridBaseLayoutConfig) => GridLayoutSpecifier;
export declare const grid: GridLayoutSpecifierFactory;
export declare class GridLayout extends GridBaseLayout<GridBaseLayoutConfig> {
    /**
     * Returns the average size (precise or estimated) of an item in the scrolling direction,
     * including any surrounding space.
     */
    protected get _delta(): number;
    protected _getItemSize(_idx: number): Size;
    _getActiveItems(): void;
    _getItemPosition(idx: number): Positions;
    _updateScrollSize(): void;
}
export {};
//# sourceMappingURL=grid.d.ts.map