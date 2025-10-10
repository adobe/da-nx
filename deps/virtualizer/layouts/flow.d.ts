/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { BaseLayout } from './shared/BaseLayout.js';
import { Positions, Size, Margins, ScrollDirection, ChildMeasurements, BaseLayoutConfig, LayoutHostSink } from './shared/Layout.js';
type ItemBounds = {
    pos: number;
    size: number;
};
type FlowLayoutConstructor = {
    prototype: FlowLayout;
    new (hostSink: LayoutHostSink, config?: BaseLayoutConfig): FlowLayout;
};
type FlowLayoutSpecifier = BaseLayoutConfig & {
    type: FlowLayoutConstructor;
};
type FlowLayoutSpecifierFactory = (config?: BaseLayoutConfig) => FlowLayoutSpecifier;
export declare const flow: FlowLayoutSpecifierFactory;
declare class MetricsCache {
    private _childSizeCache;
    private _marginSizeCache;
    private _metricsCache;
    update(metrics: {
        [key: number]: Size & Margins;
    }, direction: ScrollDirection): void;
    get averageChildSize(): number;
    get totalChildSize(): number;
    get averageMarginSize(): number;
    get totalMarginSize(): number;
    getLeadingMarginValue(index: number, direction: ScrollDirection): number;
    getChildSize(index: number): number | undefined;
    getMarginSize(index: number): number | undefined;
    clear(): void;
}
export declare class FlowLayout extends BaseLayout<BaseLayoutConfig> {
    /**
     * Initial estimate of item size
     */
    _itemSize: Size;
    /**
     * Indices of children mapped to their (position and length) in the scrolling
     * direction. Used to keep track of children that are in range.
     */
    _physicalItems: Map<number, ItemBounds>;
    /**
     * Used in tandem with _physicalItems to track children in range across
     * reflows.
     */
    _newPhysicalItems: Map<number, ItemBounds>;
    /**
     * Width and height of children by their index.
     */
    _metricsCache: MetricsCache;
    /**
     * anchorIdx is the anchor around which we reflow. It is designed to allow
     * jumping to any point of the scroll size. We choose it once and stick with
     * it until stable. _first and _last are deduced around it.
     */
    _anchorIdx: number | null;
    /**
     * Position in the scrolling direction of the anchor child.
     */
    _anchorPos: number | null;
    /**
     * Whether all children in range were in range during the previous reflow.
     */
    _stable: boolean;
    private _measureChildren;
    _estimate: boolean;
    get measureChildren(): boolean;
    /**
     * Determine the average size of all children represented in the sizes
     * argument.
     */
    updateItemSizes(sizes: ChildMeasurements): void;
    /**
     * Set the average item size based on the total length and number of children
     * in range.
     */
    _getPhysicalItem(idx: number): ItemBounds | undefined;
    _getSize(idx: number): number | undefined;
    _getAverageSize(): number;
    _estimatePosition(idx: number): number;
    /**
     * Returns the position in the scrolling direction of the item at idx.
     * Estimates it if the item at idx is not in the DOM.
     */
    _getPosition(idx: number): number;
    _calculateAnchor(lower: number, upper: number): number;
    _getAnchor(lower: number, upper: number): number;
    /**
     * Updates _first and _last based on items that should be in the current
     * viewed range.
     */
    _getActiveItems(): void;
    /**
     * Sets the range to empty.
     */
    _clearItems(): void;
    _getItems(): void;
    _calculateError(): number;
    _reflow(): void;
    _resetReflowState(): void;
    _updateScrollSize(): void;
    /**
     * Returns the average size (precise or estimated) of an item in the scrolling direction,
     * including any surrounding space.
     */
    protected get _delta(): number;
    /**
     * Returns the top and left positioning of the item at idx.
     */
    _getItemPosition(idx: number): Positions;
    /**
     * Returns the height and width of the item at idx.
     */
    _getItemSize(idx: number): Size;
    _viewDim2Changed(): void;
}
export {};
//# sourceMappingURL=flow.d.ts.map