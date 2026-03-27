/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
/**
 * Replaces the method on the object with a new method that calls the interceptor
 * function along with the original function so the interceptor can decided how to
 * handle the call.  Essentially enables wrapping an existing method with new logic
 * similarly to how a subclass can call super() to invoke the superclass's method.
 * @param object The method's host object
 * @param methodName The name of the method to intercept/wrap
 * @param interceptor The interceptor function that is called when the method is
 *   called.  It is passed the original method as the first argument, followed by
 *   the original method's arguments.
 * @returns a teardown function that can be called to restore the original method
 *   to the object.
 */
export function interceptMethod(target, methodName, interceptor) {
    const originalMethod = target[methodName];
    const newMethod = (...args) => interceptor.bind(target)(originalMethod, ...args);
    Object.assign(target, { [methodName]: newMethod });
    return () => {
        if (target[methodName] !== newMethod) {
            throw new Error(`Unexpected method "${methodName}" on ${target} likely due to out-of-sequence interceptor teardown.`);
        }
        Object.assign(target, { [methodName]: originalMethod });
        return originalMethod;
    };
}
//# sourceMappingURL=method-interception.js.map