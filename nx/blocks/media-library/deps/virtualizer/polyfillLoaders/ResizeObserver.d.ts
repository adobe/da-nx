/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
export { provideResizeObserver } from '../Virtualizer.js';
/**
 * If your browser support matrix includes older browsers
 * that don't implement `ResizeObserver`, import this function,
 * call it, and await its return before doing anything that
 * will cause a virtualizer to be instantiated. See docs
 * for details.
 */
export declare function loadPolyfillIfNeeded(): Promise<{
    new (callback: ResizeObserverCallback): ResizeObserver;
    prototype: ResizeObserver;
}>;
//# sourceMappingURL=ResizeObserver.d.ts.map