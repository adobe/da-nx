import { DA_ORIGIN } from 'https://da.live/blocks/shared/constants.js';
import { daFetch } from 'https://da.live/blocks/shared/utils.js';
import HTMLConverter from '../utils/html2json.js';
import JSONConverter from '../utils/json2html.js';
import { validateJson } from '../utils/validator.js';
import { annotateFromSchema, isEmpty, pruneRecursive } from '../utils/utils.js';
import { getValueByPointer, setValueByPointer, removeArrayItemByPointer } from '../utils/pointer.js';
import { generateValue, mergeWithDefaults } from '../utils/generator.js';

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
    if (html) this._html = html;
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
      this._includeNodeDefaultValue = isEmpty(userData);
      this._json = {
        metadata: htmlAsJson?.metadata ?? {},
        data: mergeWithDefaults(this._annotated, userData, this._includeNodeDefaultValue),
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
    return validateJson(this._schema, this._json.data, this.annotated);
  }

  htmlToJson(html) {
    const converter = new HTMLConverter(html);
    return converter.json;
  }

  updateProperty({ name, value }) {
    setValueByPointer(this._json, name, value);
  }

  getValue(item) {
    if (!item) return undefined;
    return getValueByPointer(this._json, item.pointer);
  }

  addArrayItem(pointer, items) {
    const array = getValueByPointer(this._json, pointer) ?? [];
    const newItem = generateValue(items ?? { type: 'string' }, true);
    array.push(newItem);
    setValueByPointer(this._json, pointer, array);
  }

  removeArrayItem(pointer) {
    return removeArrayItemByPointer(this._json, pointer);
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
