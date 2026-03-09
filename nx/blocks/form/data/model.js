import { DA_ORIGIN } from 'https://da.live/blocks/shared/constants.js';
import { daFetch } from 'https://da.live/blocks/shared/utils.js';
import HTMLConverter from '../utils/html2json.js';
import JSONConverter from '../utils/json2html.js';
import { validateJson } from '../utils/validator.js';
import { annotateFromSchema, isEmpty, pruneRecursive } from '../utils/utils.js';
import { getValueByPointer, setValueByPointer, removeValueByPointer } from '../utils/pointer.js';
import { generateValue, resolveValue } from '../utils/value-resolver.js';

/**
 * Find annotation node by pointer in the annotated tree.
 * @param {Object} node - Annotation node
 * @param {string} pointer - Target pointer (e.g. "/data/title")
 * @returns {Object|null} - The node or null
 */
function findNodeByPointer(node, pointer) {
  if (!node) return null;
  if (node.pointer === pointer) return node;
  const children = node.children ?? [];
  for (const child of children) {
    const found = findNodeByPointer(child, pointer);
    if (found) return found;
  }
  return null;
}

/**
 * A data model that represents a piece of structured content.
 */
export default class FormModel {
  constructor({ path, html, json, schemas }) {
    if (!(html || json)) {
      throw new Error('FormModel requires JSON or HTML');
    }

    this._path = path;
    this._schemas = schemas;
    const htmlAsJson = html ? this.htmlToJson(html) : json;
    this._schema = this._schemas?.[htmlAsJson?.metadata?.schemaName];

    if (!this._schema) {
      this._annotated = null;
      this._json = {
        metadata: htmlAsJson?.metadata ?? {},
        data: htmlAsJson?.data ?? {},
      };
    } else {
      const userData = htmlAsJson?.data ?? {};
      this._annotated = annotateFromSchema('data', this._schema, this._schema, userData, '', false);
      this._fillDefaults = isEmpty(userData);
      this._json = {
        metadata: htmlAsJson?.metadata ?? {},
        data: resolveValue(this._annotated, userData, this._fillDefaults),
      };
    }
  }

  clone() {
    return new FormModel({
      path: this._path,
      json: JSON.parse(JSON.stringify(this._json)),
      schemas: this._schemas,
    });
  }

  validate() {
    const prunedData = pruneRecursive(this._json.data);
    return validateJson(this._schema, prunedData ?? {}, this.annotated);
  }

  htmlToJson(html) {
    const converter = new HTMLConverter(html);
    return converter.json;
  }

  updateProperty({ name, value }) {
    const node = this._annotated ? findNodeByPointer(this._annotated, name) : null;
    if (!node) return;
    const effectiveValue = resolveValue(node, value, false);
    if (isEmpty(effectiveValue)) {
      removeValueByPointer(this._json, name);
    } else {
      setValueByPointer(this._json, name, effectiveValue);
    }
  }

  getValue(item) {
    if (!item) return undefined;
    const userVal = getValueByPointer(this._json, item.pointer);
    return resolveValue(item, userVal, this._fillDefaults);
  }

  addArrayItem(pointer, items) {
    if (!items) {
      // eslint-disable-next-line no-console
      console.warn('The array schema has no items definition for pointer "%s"', pointer);
      return;
    }
    const array = getValueByPointer(this._json, pointer) ?? [];
    const newItem = generateValue(items, true);
    array.push(newItem);
    setValueByPointer(this._json, pointer, array);
  }

  removeArrayItem(pointer) {
    return removeValueByPointer(this._json, pointer);
  }

  async saveHtml() {
    const prunedData = pruneRecursive(this._json.data);
    const json = { ...this._json, data: prunedData ?? {} };
    const html = JSONConverter(json);
    const body = new FormData();
    const data = new Blob([html], { type: 'text/html' });
    body.append('data', data);

    const opts = { method: 'POST', body };

    // TODO: Don't assume the save went perfect
    await daFetch(`${DA_ORIGIN}/source${this._path}`, opts);
  }

  get annotated() {
    return this._annotated;
  }

  get schema() {
    return this._schema;
  }

  getSerializedJson() {
    return JSON.stringify(this._json, null, 2);
  }
}
