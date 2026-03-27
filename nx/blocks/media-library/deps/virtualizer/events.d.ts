/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
export declare class RangeChangedEvent extends Event {
    static eventName: string;
    first: number;
    last: number;
    constructor(range: Range);
}
export declare class VisibilityChangedEvent extends Event {
    static eventName: string;
    first: number;
    last: number;
    constructor(range: Range);
}
export declare class UnpinnedEvent extends Event {
    static eventName: string;
    constructor();
}
interface Range {
    first: number;
    last: number;
}
export {};
//# sourceMappingURL=events.d.ts.map