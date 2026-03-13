import { DA_ORIGIN } from 'https://da.live/blocks/shared/constants.js';
import { daFetch } from 'https://da.live/blocks/shared/utils.js';
import HTMLConverter from '../utils/html2json.js';
import JSONConverter from '../utils/json2html.js';
import { validateJson } from '../utils/validator.js';
import { annotateFromSchema, dereferenceSchema, findNodeByPointer, isEmpty, pruneRecursive } from '../utils/utils.js';
import {
  append,
  getValue,
  setValue,
  removeValue,
  moveToIndex,
  insertBefore,
} from '../utils/pointer.js';
import { generateValue, resolveValue } from '../utils/value-resolver.js';

/**
 * A data model that represents a piece of structured content.
 */
export default class FormModel {
  constructor({ path, html, json, schemas, dereferencedSchema }) {
    if (!(html || json)) {
      throw new Error('FormModel requires JSON or HTML');
    }

    this._path = path;
    this._schemas = schemas;
    const htmlAsJson = html ? this.htmlToJson(html) : json;
    this._schema = this._schemas?.[htmlAsJson?.metadata?.schemaName];

    if (!this._schema) {
      this._dereferencedSchema = null;
      this._annotated = null;
      this._json = {
        metadata: htmlAsJson?.metadata ?? {},
        data: htmlAsJson?.data ?? {},
      };
    } else {
      const data = htmlAsJson?.data ?? {};
      this._dereferencedSchema = dereferencedSchema ?? dereferenceSchema(this._schema);
      this._annotated = annotateFromSchema('data', this._dereferencedSchema, data);
      this._fillDefaults = isEmpty(data);
      this._json = {
        metadata: htmlAsJson?.metadata ?? {},
        data: resolveValue(this._annotated, data, this._fillDefaults),
      };
    }
  }

  clone() {
    return new FormModel({
      path: this._path,
      json: JSON.parse(JSON.stringify(this._json)),
      schemas: this._schemas,
      dereferencedSchema: this._dereferencedSchema,
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
      removeValue(this._json, name);
    } else {
      setValue(this._json, name, effectiveValue);
    }
  }

  getValue(item) {
    if (!item) return undefined;
    const userVal = getValue(this._json, item.pointer);
    return resolveValue(item, userVal, this._fillDefaults);
  }

  addArrayItem(pointer, items) {
    if (!items) {
      // eslint-disable-next-line no-console
      console.warn('The array schema has no items definition for pointer "%s"', pointer);
      return;
    }
    const array = getValue(this._json, pointer) ?? [];
    const newItem = generateValue(items, true);
    insertBefore(this._json, append(pointer, array.length), newItem);
  }

  insertArrayItem(pointer, items) {
    if (!items) {
      // eslint-disable-next-line no-console
      console.warn('The array schema has no items definition for pointer "%s"', pointer);
      return false;
    }
    const newItem = generateValue(items, true);
    return insertBefore(this._json, pointer, newItem);
  }

  removeArrayItem(pointer) {
    return removeValue(this._json, pointer);
  }

  moveArrayItem(pointer, targetIndex) {
    return moveToIndex(this._json, pointer, targetIndex);
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
