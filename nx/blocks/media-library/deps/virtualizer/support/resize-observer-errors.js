/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { interceptMethod, } from './method-interception.js';
/**
 * In a testing environment with a setup/before and teardown/after callback pattern, this function
 * can be used as a succinct declaration to ignore these errors in tests.
 * @param before a setup callback; in Mocha, this would be the `beforeEach` function.
 * @param after a teardown callback; in Mocha, this would be the `afterEach` function.
 */
export function setupIgnoreWindowResizeObserverLoopErrors(before, after, options = {}) {
    let teardown;
    before(() => (teardown = ignoreWindowResizeObserverLoopErrors(options)));
    after(() => {
        teardown?.();
        teardown = undefined;
    });
}
/**
 * Reads the message text and returns true if the message contains any text indicating an
 * error due to too many ResizeObserver triggers.
 * @param message The text to evaluate
 * @returns True if text contains ResizeObserver loop limit exceeded message.
 */
export function isResizeObserverLoopErrorMessage(message) {
    return (message.includes('ResizeObserver loop limit exceeded') ||
        message.includes('ResizeObserver loop completed with undelivered notifications'));
}
/**
 * Replaces the window.onerror method with a new method that tests the error message
 * against the given predicate function.  If the predicate returns true, the original
 * window.onerror is not called.  Otherwise, the original window.onerror is called.
 * This is most useful for ignoring benign errors that are expected to occur in tests.
 * @param messagePredicate A function that returns true if the error message should
 * cause the skip the call to the original window.onerror.
 */
export function ignoreWindowOnError(messagePredicate, options = {}) {
    const { suppressErrorLogging = false } = options;
    const teardownWindowOnError = interceptMethod(window, 'onerror', (originalOnError, ...args) => {
        const message = typeof args[0] === 'string' ? args[0] : args[0].message;
        if (messagePredicate(message)) {
            return;
        }
        return originalOnError?.apply(window, args);
    });
    const teardownConsoleError = suppressErrorLogging
        ? interceptMethod(console, 'error', (originalConsoleError, ...args) => {
            const message = args[0];
            if (messagePredicate(message)) {
                return;
            }
            return originalConsoleError?.apply(console, args);
        })
        : undefined;
    return () => {
        teardownWindowOnError();
        teardownConsoleError?.();
    };
}
/**
 * Patches window.onerror to ignore the "ResizeObserver loop limit
 * exceeded" errors.
 * @returns A function that can be used to restore the original window.onerror to the unpatched version.
 */
export function ignoreWindowResizeObserverLoopErrors(options = {}) {
    return ignoreWindowOnError(isResizeObserverLoopErrorMessage, options);
}
/**
 * Adds an event listener to the window which prevents default event
 * handling for "ResizeObserver loop limit exceeded errors."
 * @returns A function that can be used to remove the event listener.
 */
export function preventResizeObserverLoopErrorEventDefaults() {
    const eventListener = (ev) => {
        if (typeof ev.message === 'string' &&
            isResizeObserverLoopErrorMessage(ev.message)) {
            ev.preventDefault?.();
            ev.stopPropagation?.();
            ev.stopImmediatePropagation?.();
            return;
        }
    };
    const removeEventListener = () => window.removeEventListener('error', eventListener);
    window.addEventListener('error', eventListener);
    // Returns a function that can be used to remove the event listener.
    return removeEventListener;
}
//# sourceMappingURL=resize-observer-errors.js.map