/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { TemplateResult, ChildPart } from 'lit';
import { DirectiveResult, PartInfo } from 'lit/directive.js';
import { AsyncDirective } from 'lit/async-directive.js';
import { KeyFn } from 'lit/directives/repeat.js';
import { Virtualizer } from './Virtualizer.js';
import { LayoutConfigValue } from './layouts/shared/Layout.js';
export { virtualizerRef, VirtualizerHostElement } from './Virtualizer.js';
/**
 * Configuration options for the virtualize directive.
 */
export interface VirtualizeDirectiveConfig<T> {
    /**
     * A function that returns a lit-html TemplateResult. It will be used
     * to generate the DOM for each item in the virtual list.
     */
    renderItem?: RenderItemFunction<T>;
    keyFunction?: KeyFn<T>;
    scroller?: boolean;
    layout?: LayoutConfigValue;
    /**
     * The list of items to display via the renderItem function.
     */
    items?: Array<T>;
}
export type RenderItemFunction<T = unknown> = (item: T, index: number) => TemplateResult;
export declare const defaultKeyFunction: KeyFn<unknown>;
export declare const defaultRenderItem: RenderItemFunction<unknown>;
declare class VirtualizeDirective<T = unknown> extends AsyncDirective {
    _virtualizer: Virtualizer | null;
    _first: number;
    _last: number;
    _renderItem: RenderItemFunction<T>;
    _keyFunction: KeyFn<T>;
    _items: Array<T>;
    constructor(part: PartInfo);
    render(config?: VirtualizeDirectiveConfig<T>): unknown;
    update(part: ChildPart, [config]: [VirtualizeDirectiveConfig<T>]): unknown;
    private _updateVirtualizerConfig;
    private _setFunctions;
    private _makeVirtualizer;
    private _initialize;
    disconnected(): void;
    reconnected(): void;
}
export declare const virtualize: <T>(config?: VirtualizeDirectiveConfig<T>) => DirectiveResult<typeof VirtualizeDirective>;
//# sourceMappingURL=virtualize.d.ts.map