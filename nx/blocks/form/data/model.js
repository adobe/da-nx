import { DA_ORIGIN } from 'https://da.live/blocks/shared/constants.js';
import { daFetch } from 'https://da.live/blocks/shared/utils.js';
import HTMLConverter from '../utils/html2json.js';
import JSONConverter from '../utils/json2html.js';
import { validateJson } from '../utils/validator.js';
import { annotateProp, getValueByPointer, setValueByPointer, removeArrayItemByPointer } from '../utils/utils.js';
import generateEmptyObject from '../utils/generator.js';

/**
 * A data model that represents a piece of structured content.
 */
export default class FormModel {
  constructor({ path, html, json, schemas }) {
    if (!(html || json)) {
      // eslint-disable-next-line no-console
      console.log('Please supply JSON or HTML to make a form model');
      return;
    }

    if (html) {
      this._html = html;
      this.updateJson();
    } else if (json) {
      this._json = json;
      this.updateHtml();
    }

    this._path = path;
    this._schemas = schemas;
    this._schema = schemas[this._json.metadata.schemaName];
    this._annotated = annotateProp('data', this._json.data, this._schema, this._schema);
  }

  clone() {
    return new FormModel({
      path: this._path,
      json: JSON.parse(JSON.stringify(this._json)),
      schemas: this._schemas,
    });
  }

  validate() {
    return validateJson(this._schema, this._json.data);
  }

  updateJson() {
    const converter = new HTMLConverter(this._html);
    this._json = converter.json;
  }

  updateHtml() {
    const html = JSONConverter(this._json);
    this._html = html;
  }

  updateProperty({ name, value }) {
    setValueByPointer(this._json, name, value);
    this.updateHtml();
  }

  addArrayItem(pointer, itemsSchema) {
    const array = getValueByPointer(this._json, pointer) ?? [];
    const newItem = generateEmptyObject(itemsSchema ?? {}, new Set(), this._schema);
    const newIndex = array.length;
    setValueByPointer(this._json, `${pointer}[${newIndex}]`, newItem);
    this.updateHtml();
  }

  removeArrayItem(pointer) {
    if (!removeArrayItemByPointer(this._json, pointer)) return false;
    this._annotated = annotateProp('data', this._json.data, this._schema, this._schema);
    this.updateHtml();
    return true;
  }

  async saveHtml() {
    const body = new FormData();
    const data = new Blob([this._html], { type: 'text/html' });
    body.append('data', data);

    const opts = { method: 'POST', body };

    // TODO: Don't assume the save went perfect
    await daFetch(`${DA_ORIGIN}/source${this._path}`, opts);
  }

  set html(html) {
    this._html = html;
  }

  get html() {
    return this._html;
  }

  get annotated() {
    return this._annotated;
  }

  get schema() {
    return this._schema;
  }

  get json() {
    return this._json;
  }
}
