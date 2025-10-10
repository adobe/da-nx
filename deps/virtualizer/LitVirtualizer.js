/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { __decorate } from "tslib";
import { html, LitElement } from 'http://localhost:6456/deps/lit/dist/index.js';
import { property } from 'http://localhost:6456/deps/lit/dist/index.js';
import { virtualize, virtualizerRef, defaultRenderItem, defaultKeyFunction, } from './virtualize.js';
export class LitVirtualizer extends LitElement {
    constructor() {
        super(...arguments);
        this.items = [];
        this.renderItem = defaultRenderItem;
        this.keyFunction = defaultKeyFunction;
        this.layout = {};
        this.scroller = false;
    }
    createRenderRoot() {
        return this;
    }
    render() {
        const { items, renderItem, keyFunction, layout, scroller } = this;
        return html `${virtualize({
            items,
            renderItem,
            keyFunction,
            layout,
            scroller,
        })}`;
    }
    element(index) {
        return this[virtualizerRef]?.element(index);
    }
    get layoutComplete() {
        return this[virtualizerRef]?.layoutComplete;
    }
    /**
     * This scrollToIndex() shim is here to provide backwards compatibility with other 0.x versions of
     * lit-virtualizer. It is deprecated and will likely be removed in the 1.0.0 release.
     */
    scrollToIndex(index, position = 'start') {
        this.element(index)?.scrollIntoView({ block: position });
    }
}
__decorate([
    property({ attribute: false })
], LitVirtualizer.prototype, "items", void 0);
__decorate([
    property()
], LitVirtualizer.prototype, "renderItem", void 0);
__decorate([
    property()
], LitVirtualizer.prototype, "keyFunction", void 0);
__decorate([
    property({ attribute: false })
], LitVirtualizer.prototype, "layout", void 0);
__decorate([
    property({ reflect: true, type: Boolean })
], LitVirtualizer.prototype, "scroller", void 0);
//# sourceMappingURL=LitVirtualizer.js.map