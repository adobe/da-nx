/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { LitElement } from 'lit';
import { KeyFn } from 'lit/directives/repeat.js';
import { LayoutConfigValue } from './layouts/shared/Layout.js';
import { RenderItemFunction } from './virtualize.js';
export declare class LitVirtualizer<T = unknown> extends LitElement {
    items: T[];
    renderItem: RenderItemFunction<T>;
    keyFunction: KeyFn<T>;
    layout: LayoutConfigValue;
    scroller: boolean;
    createRenderRoot(): this;
    render(): import("lit-html").TemplateResult<1>;
    element(index: number): import("./Virtualizer.js").VirtualizerChildElementProxy | undefined;
    get layoutComplete(): Promise<void> | undefined;
    /**
     * This scrollToIndex() shim is here to provide backwards compatibility with other 0.x versions of
     * lit-virtualizer. It is deprecated and will likely be removed in the 1.0.0 release.
     */
    scrollToIndex(index: number, position?: 'start' | 'center' | 'end' | 'nearest'): void;
}
//# sourceMappingURL=LitVirtualizer.d.ts.map