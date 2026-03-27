/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { ItemBox, LayoutConfigValue, ChildMeasurements, StateChangedMessage, MeasureChildFunction, LayoutHostMessage } from './layouts/shared/Layout.js';
import { RangeChangedEvent, VisibilityChangedEvent, UnpinnedEvent } from './events.js';
/**
 * Call this function to provide a `ResizeObserver` polyfill for Virtualizer to use.
 * @param Ctor Constructor for a `ResizeObserver` polyfill (recommend using the one provided with the Virtualizer package)
 */
export declare function provideResizeObserver(Ctor: typeof ResizeObserver): void;
export declare const virtualizerRef: unique symbol;
declare global {
    interface HTMLElementEventMap {
        rangeChanged: RangeChangedEvent;
        visibilityChanged: VisibilityChangedEvent;
        unpinned: UnpinnedEvent;
    }
}
export interface VirtualizerHostElement extends HTMLElement {
    [virtualizerRef]?: Virtualizer;
}
/**
 * A very limited proxy object for a virtualizer child,
 * returned by Virtualizer.element(idx: number). Introduced
 * to enable scrolling a virtual element into view using
 * a call that looks and behaves essentially the same as for
 * a real Element. May be useful for other things later.
 */
export interface VirtualizerChildElementProxy {
    scrollIntoView: (options?: ScrollIntoViewOptions) => void;
}
export interface VirtualizerConfig {
    layout?: LayoutConfigValue;
    /**
     * The parent of all child nodes to be rendered.
     */
    hostElement: VirtualizerHostElement;
    scroller?: boolean;
}
/**
 * Provides virtual scrolling boilerplate.
 *
 * Extensions of this class must set hostElement and layout.
 *
 * Extensions of this class must also override VirtualRepeater's DOM
 * manipulation methods.
 */
export declare class Virtualizer {
    private _benchmarkStart;
    private _layout;
    private _clippingAncestors;
    /**
     * Layout provides these values, we set them on _render().
     * TODO @straversi: Can we find an XOR type, usable for the key here?
     */
    private _scrollSize;
    /**
     * Difference between scroll target's current and required scroll offsets.
     * Provided by layout.
     */
    private _scrollError;
    /**
     * A list of the positions (top, left) of the children in the current range.
     */
    private _childrenPos;
    private _childMeasurements;
    private _toBeMeasured;
    private _rangeChanged;
    private _itemsChanged;
    private _visibilityChanged;
    /**
     * The HTMLElement that hosts the virtualizer. Set by hostElement.
     */
    protected _hostElement?: VirtualizerHostElement;
    private _scrollerController;
    private _isScroller;
    private _sizer;
    /**
     * Resize observer attached to hostElement.
     */
    private _hostElementRO;
    /**
     * Resize observer attached to children.
     */
    private _childrenRO;
    private _mutationObserver;
    private _scrollEventListeners;
    private _scrollEventListenerOptions;
    private _loadListener;
    /**
     * Index of element to scroll into view, plus scroll
     * behavior options, as imperatively specified via
     * `element(index).scrollIntoView()`
     */
    private _scrollIntoViewTarget;
    private _updateScrollIntoViewCoordinates;
    /**
     * Items to render. Set by items.
     */
    private _items;
    /**
     * Index of the first child in the range, not necessarily the first visible child.
     * TODO @straversi: Consider renaming these.
     */
    protected _first: number;
    /**
     * Index of the last child in the range.
     */
    protected _last: number;
    /**
     * Index of the first item intersecting the viewport.
     */
    private _firstVisible;
    /**
     * Index of the last item intersecting the viewport.
     */
    private _lastVisible;
    protected _scheduled: WeakSet<Function>;
    /**
     * Invoked at the end of each render cycle: children in the range are
     * measured, and their dimensions passed to this callback. Use it to layout
     * children as needed.
     */
    protected _measureCallback: ((sizes: ChildMeasurements) => void) | null;
    protected _measureChildOverride: MeasureChildFunction | null;
    /**
     * State for `layoutComplete` promise
     */
    private _layoutCompletePromise;
    private _layoutCompleteResolver;
    private _layoutCompleteRejecter;
    private _pendingLayoutComplete;
    /**
     * Layout initialization is async because we dynamically load
     * the default layout if none is specified. This state is to track
     * whether init is complete.
     */
    private _layoutInitialized;
    /**
     * Track connection state to guard against errors / unnecessary work
     */
    private _connected;
    constructor(config: VirtualizerConfig);
    set items(items: Array<unknown> | undefined);
    _init(config: VirtualizerConfig): void;
    private _initObservers;
    _initHostElement(config: VirtualizerConfig): void;
    connected(): void;
    _observeAndListen(): void;
    disconnected(): void;
    private _applyVirtualizerStyles;
    _getSizer(): HTMLElement;
    updateLayoutConfig(layoutConfig: LayoutConfigValue): Promise<boolean>;
    private _initLayout;
    startBenchmarking(): void;
    stopBenchmarking(): {
        timeElapsed: number;
        virtualizationTime: number;
    } | null;
    private _measureChildren;
    /**
     * Returns the width, height, and margins of the given child.
     */
    _measureChild(element: Element): ItemBox;
    protected _schedule(method: Function): Promise<void>;
    _updateDOM(state: StateChangedMessage): Promise<void>;
    _finishDOMUpdate(): void;
    _updateLayout(): void;
    private _handleScrollEvent;
    handleEvent(event: CustomEvent): void;
    _handleLayoutMessage(message: LayoutHostMessage): void;
    get _children(): Array<HTMLElement>;
    private _updateView;
    /**
     * Styles the host element so that its size reflects the
     * total size of all items.
     */
    private _sizeHostElement;
    /**
     * Sets the top and left transform style of the children from the values in
     * pos.
     */
    private _positionChildren;
    private _adjustRange;
    private _correctScrollError;
    element(index: number): VirtualizerChildElementProxy | undefined;
    private _scrollElementIntoView;
    /**
     * If we are smoothly scrolling to an element and the target element
     * is in the DOM, we update our target coordinates as needed
     */
    private _checkScrollIntoViewTarget;
    /**
     * Emits a rangechange event with the current first, last, firstVisible, and
     * lastVisible.
     */
    private _notifyRange;
    private _notifyVisibility;
    get layoutComplete(): Promise<void>;
    private _rejectLayoutCompletePromise;
    private _scheduleLayoutComplete;
    private _resolveLayoutCompletePromise;
    private _resetLayoutCompleteState;
    /**
     * Render and update the view at the next opportunity with the given
     * hostElement size.
     */
    private _hostElementSizeChanged;
    private _childLoaded;
    private _childrenSizeChanged;
}
//# sourceMappingURL=Virtualizer.d.ts.map