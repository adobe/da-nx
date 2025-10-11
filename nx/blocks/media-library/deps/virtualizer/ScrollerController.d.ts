/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { ScrollToCoordinates } from './layouts/shared/Layout.js';
type retargetScrollCallback = () => ScrollToCoordinates;
type endScrollCallback = () => void;
type Nullable<T> = T | null;
export declare class ScrollerShim {
    protected _node: Element | Window;
    protected _element: Nullable<Element>;
    constructor(element?: Element);
    get element(): Element;
    get scrollTop(): number;
    get scrollLeft(): number;
    get scrollHeight(): number;
    get scrollWidth(): number;
    get viewportHeight(): number;
    get viewportWidth(): number;
    get maxScrollTop(): number;
    get maxScrollLeft(): number;
}
export declare class ScrollerController extends ScrollerShim {
    private _originalScrollTo;
    private _originalScrollBy;
    private _originalScroll;
    private _clients;
    private _retarget;
    private _end;
    private __destination;
    constructor(client: unknown, element?: Element);
    correctingScrollError: boolean;
    private get _destination();
    get scrolling(): boolean;
    scrollTo(options: ScrollToOptions): void;
    scrollTo(x: number, y: number): void;
    scrollTo(p1: ScrollToOptions | number, p2?: number): void;
    scrollBy(options: ScrollToOptions): void;
    scrollBy(x: number, y: number): void;
    scrollBy(p1: ScrollToOptions | number, p2?: number): void;
    private _nativeScrollTo;
    private _scrollTo;
    private _setDestination;
    private _resetScrollState;
    private _updateManagedScrollTo;
    managedScrollTo(options: ScrollToOptions, retarget: retargetScrollCallback, end: endScrollCallback): (coordinates: ScrollToCoordinates) => void;
    correctScrollError(coordinates: ScrollToCoordinates): void;
    private _checkForArrival;
    detach(client: unknown): null;
    private _attach;
}
export {};
//# sourceMappingURL=ScrollerController.d.ts.map