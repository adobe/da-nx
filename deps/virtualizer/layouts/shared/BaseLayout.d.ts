/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { Layout, Positions, ScrollDirection, Size, dimension, position, PinOptions, ScrollToCoordinates, BaseLayoutConfig, LayoutHostSink } from './Layout.js';
type UpdateVisibleIndicesOptions = {
    emit?: boolean;
};
export declare function dim1(direction: ScrollDirection): dimension;
export declare function dim2(direction: ScrollDirection): dimension;
export declare function pos1(direction: ScrollDirection): position;
export declare function pos2(direction: ScrollDirection): position;
export declare abstract class BaseLayout<C extends BaseLayoutConfig> implements Layout {
    /**
     * The last set viewport scroll position.
     */
    private _latestCoords;
    /**
     * Scrolling direction.
     */
    private _direction;
    /**
     * Dimensions of the viewport.
     */
    private _viewportSize;
    totalScrollSize: Size;
    offsetWithinScroller: Positions;
    /**
     * Flag for debouncing asynchronous reflow requests.
     */
    private _pendingReflow;
    private _pendingLayoutUpdate;
    protected _pin: PinOptions | null;
    /**
     * The index of the first item intersecting the viewport.
     */
    protected _firstVisible: number;
    /**
     * The index of the last item intersecting the viewport.
     */
    protected _lastVisible: number;
    /**
     * Pixel offset in the scroll direction of the first child.
     */
    protected _physicalMin: number;
    /**
     * Pixel offset in the scroll direction of the last child.
     */
    protected _physicalMax: number;
    /**
     * Index of the first child.
     */
    protected _first: number;
    /**
     * Index of the last child.
     */
    protected _last: number;
    /**
     * Length in the scrolling direction.
     */
    protected _sizeDim: dimension;
    /**
     * Length in the non-scrolling direction.
     */
    protected _secondarySizeDim: dimension;
    /**
     * Position in the scrolling direction.
     */
    protected _positionDim: position;
    /**
     * Position in the non-scrolling direction.
     */
    protected _secondaryPositionDim: position;
    /**
     * Current scroll offset in pixels.
     */
    protected _scrollPosition: number;
    /**
     * Difference between current scroll offset and scroll offset calculated due
     * to a reflow.
     */
    protected _scrollError: number;
    /**
     * Total number of items that could possibly be displayed. Used to help
     * calculate the scroll size.
     */
    protected _items: unknown[];
    /**
     * The total (estimated) length of all items in the scrolling direction.
     */
    protected _scrollSize: number;
    /**
     * Number of pixels beyond the viewport to still include
     * in the active range of items.
     */
    protected _overhang: number;
    /**
     * Call this to deliver messages (e.g. stateChanged, unpinned) to host
     */
    private _hostSink;
    protected _getDefaultConfig(): C;
    constructor(hostSink: LayoutHostSink, config?: C);
    set config(config: C);
    get config(): C;
    /**
     * Maximum index of children + 1, to help estimate total height of the scroll
     * space.
     */
    get items(): unknown[];
    set items(items: unknown[]);
    protected _setItems(items: unknown[]): void;
    /**
     * Primary scrolling direction.
     */
    get direction(): ScrollDirection;
    set direction(dir: ScrollDirection);
    /**
     * Height and width of the viewport.
     */
    get viewportSize(): Size;
    set viewportSize(dims: Size);
    /**
     * Scroll offset of the viewport.
     */
    get viewportScroll(): Positions;
    set viewportScroll(coords: Positions);
    /**
     * Perform a reflow if one has been scheduled.
     */
    reflowIfNeeded(force?: boolean): void;
    set pin(options: PinOptions | null);
    get pin(): PinOptions | null;
    _clampScrollPosition(val: number): number;
    unpin(): void;
    /**
     * Get the top and left positioning of the item at idx.
     */
    protected abstract _getItemPosition(idx: number): Positions;
    /**
     * Update _first and _last based on items that should be in the current
     * range.
     */
    protected abstract _getActiveItems(): void;
    protected abstract _getItemSize(_idx: number): Size;
    /**
     * Calculates (precisely or by estimating, if needed) the total length of all items in
     * the scrolling direction, including spacing, caching the value in the `_scrollSize` field.
     *
     * Should return a minimum value of 1 to ensure at least one item is rendered.
     * TODO (graynorton): Possibly no longer required, but leaving here until it can be verified.
     */
    protected abstract _updateScrollSize(): void;
    protected _updateLayout(): void;
    /**
     * The height or width of the viewport, whichever corresponds to the scrolling direction.
     */
    protected get _viewDim1(): number;
    /**
     * The height or width of the viewport, whichever does NOT correspond to the scrolling direction.
     */
    protected get _viewDim2(): number;
    protected _scheduleReflow(): void;
    protected _scheduleLayoutUpdate(): void;
    protected _triggerReflow(): void;
    protected _reflow(): void;
    /**
     * If we are supposed to be pinned to a particular
     * item or set of coordinates, we set `_scrollPosition`
     * accordingly and adjust `_scrollError` as needed
     * so that the virtualizer can keep the scroll
     * position in the DOM in sync
     */
    protected _setPositionFromPin(): void;
    /**
     * Calculate the coordinates to scroll to, given
     * a request to scroll to the element at a specific
     * index.
     *
     * Supports the same positioning options (`start`,
     * `center`, `end`, `nearest`) as the standard
     * `Element.scrollIntoView()` method, but currently
     * only considers the provided value in the `block`
     * dimension, since we don't yet have any layouts
     * that support virtualization in two dimensions.
     */
    protected _calculateScrollIntoViewPosition(options: PinOptions): number;
    getScrollIntoViewCoordinates(options: PinOptions): ScrollToCoordinates;
    private _sendUnpinnedMessage;
    private _sendVisibilityChangedMessage;
    protected _sendStateChangedMessage(): void;
    /**
     * Number of items to display.
     */
    private get _num();
    private _checkThresholds;
    /**
     * Find the indices of the first and last items to intersect the viewport.
     * Emit a visibleindiceschange event when either index changes.
     */
    protected _updateVisibleIndices(options?: UpdateVisibleIndicesOptions): void;
}
export {};
//# sourceMappingURL=BaseLayout.d.ts.map