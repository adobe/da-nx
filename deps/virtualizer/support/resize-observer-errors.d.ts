/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { MethodInterceptorTeardown } from './method-interception.js';
type IgnoreWindowOnErrorOptions = {
    /**
     * If this option is set to `true`, `ignoreWindowOnError` will not only prevent
     * `window.onerror` from being called, but also prevent the error message from
     * being logged to the console. This is useful for keeping your test output
     * clean, but it will prevent you from observing whether / how many times the
     * targeted error has been ignored.
     */
    suppressErrorLogging?: boolean;
};
/**
 * In a testing environment with a setup/before and teardown/after callback pattern, this function
 * can be used as a succinct declaration to ignore these errors in tests.
 * @param before a setup callback; in Mocha, this would be the `beforeEach` function.
 * @param after a teardown callback; in Mocha, this would be the `afterEach` function.
 */
export declare function setupIgnoreWindowResizeObserverLoopErrors(before: Function, after: Function, options?: IgnoreWindowOnErrorOptions): void;
/**
 * Reads the message text and returns true if the message contains any text indicating an
 * error due to too many ResizeObserver triggers.
 * @param message The text to evaluate
 * @returns True if text contains ResizeObserver loop limit exceeded message.
 */
export declare function isResizeObserverLoopErrorMessage(message: string): boolean;
/**
 * Replaces the window.onerror method with a new method that tests the error message
 * against the given predicate function.  If the predicate returns true, the original
 * window.onerror is not called.  Otherwise, the original window.onerror is called.
 * This is most useful for ignoring benign errors that are expected to occur in tests.
 * @param messagePredicate A function that returns true if the error message should
 * cause the skip the call to the original window.onerror.
 */
export declare function ignoreWindowOnError(messagePredicate: (message: string) => boolean, options?: IgnoreWindowOnErrorOptions): MethodInterceptorTeardown;
/**
 * Patches window.onerror to ignore the "ResizeObserver loop limit
 * exceeded" errors.
 * @returns A function that can be used to restore the original window.onerror to the unpatched version.
 */
export declare function ignoreWindowResizeObserverLoopErrors(options?: IgnoreWindowOnErrorOptions): MethodInterceptorTeardown;
/**
 * Adds an event listener to the window which prevents default event
 * handling for "ResizeObserver loop limit exceeded errors."
 * @returns A function that can be used to remove the event listener.
 */
export declare function preventResizeObserverLoopErrorEventDefaults(): () => void;
export {};
//# sourceMappingURL=resize-observer-errors.d.ts.map