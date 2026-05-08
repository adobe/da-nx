import { fromHtmlIsomorphic, selectAll } from '../../../deps/da-form/dist/index.js';

const SELF_REF = 'self://#';

class HTMLConverter {
  constructor(html) {
    this.tree = fromHtmlIsomorphic(html);
    this.blocks = selectAll('main > div > div', this.tree);
    this.json = this.convertBlocksToJson();
  }

  convertBlocksToJson() {
    const metadata = this.getMetadata();
    const data = this.findAndConvert(metadata.schemaName);
    return { metadata, data };
  }

  getMetadata() {
    const baseMeta = this.findAndConvert('da-form');
    const { 'x-schema-name': schemaName, ...rest } = baseMeta;
    return { schemaName, ...rest };
  }

  getProperties(block) {
    return block.children.reduce((rdx, row) => {
      if (row.children) {
        const [keyCol, valCol] = row.children;

        const key = keyCol.children[0].children[0].value.trim();

        // If there's absolutely no children in cell, return an empty string
        if (!valCol.children[0]) {
          rdx[key] = '';
        } else if (valCol.children[0].children.length === 0) {
          rdx[key] = '';
        } else if (valCol.children[0].children.length === 1) {
          // Li
          if (valCol.children[0].children[0].children?.length) {
            rdx[key] = [this.getTypedValue(valCol.children[0].children[0].children[0].value)];
          } else {
            const isArr = valCol.children[0].children[0].children;
            const value = this.getTypedValue(valCol.children[0].children[0].value);
            if (isArr) {
              // No li > * (any el) should return as an empty array
              rdx[key] = value ? [value] : [];
            } else {
              rdx[key] = value;
            }
          }
        } else {
          rdx[key] = this.getArrayValues(key, valCol.children[0].children);
        }
      }
      return rdx;
    }, {});
  }

  findAndConvert(searchTerm, searchRef) {
    return this.blocks.reduce((acc, block) => {
      // If we are looking for a reference,
      // use the variation, not the block name
      const idx = searchRef ? 1 : 0;
      const matches = block.properties.className[idx]?.toLowerCase() === searchTerm.toLowerCase();
      // Root block has a single class (e.g. "foo"); nested item blocks add a
      // second class for refs (e.g. "foo foo-abcd"). Both match on className[0],
      // so we require no second class to pick the root.
      const isRootBlock = !searchRef && !block.properties.className[1];
      if (matches && (searchRef || isRootBlock)) {
        const properties = this.getProperties(block);
        // If the block contains only @items, it represents an array
        // Return the array value directly instead of the object wrapper
        const keys = Object.keys(properties);
        if (keys.length === 1 && keys[0] === '@items') {
          return properties['@items'];
        }
        return properties;
      }
      return acc;
    }, {});
  }

  // We will always try to convert to a strong type.
  // The schema is responsible for knowing if it
  // is correct and converting back if necessary.
  getTypedValue(value) {
    // It it doesn't exist, resolve to undefined
    if (!value) {
      return '';
    }

    // Attempt boolean
    const boolean = this.getBoolean(value);
    if (boolean !== null) return boolean;

    // Attempt reference
    const reference = this.getReference(value);
    if (reference !== null) return reference;

    // Attempt number
    const number = this.getNumber(value);
    if (number !== null) return number;

    return value;
  }

  getArrayValues(key, parent) {
    return parent.map((listItem) => {
      const { value } = listItem.children[0];
      if (!value) {
        // eslint-disable-next-line no-console
        console.log(key);
        return '';
      }
      const reference = this.getReference(value);
      return reference || value;
    });
  }

  getReference(text) {
    if (text.startsWith(SELF_REF)) {
      const refId = text.split(SELF_REF)[1].replaceAll('/', '-');
      const reference = this.findAndConvert(refId, true);
      if (reference) return reference;
    }
    return null;
  }

  getBoolean(text) {
    if (text === 'true') return true;
    if (text === 'false') return false;
    return null;
  }

  getNumber(text) {
    const num = Number(text);
    const isNum = Number.isFinite(num);
    if (!isNum) return null;
    return num;
  }
}

export function convertHtmlToJson(html) {
  if (typeof html !== 'string' || !html.trim()) return null;

  try {
    const converter = new HTMLConverter(html);
    return converter.json;
  } catch {
    return null;
  }
}

export function isEmptyDocumentHtml(htmlString) {
  if (typeof htmlString !== 'string') return false;

  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  const mainContainer = doc.querySelector('body > main > div');
  if (!mainContainer) return false;

  if (mainContainer.tagName !== 'DIV') return false;
  if (mainContainer.childElementCount !== 0) return false;
  if (mainContainer.textContent.trim().length > 0) return false;

  return true;
}

export function isStructuredContentHtml(htmlString) {
  if (!htmlString) return false;

  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  const formBlock = doc.querySelector('body > main > div > div.da-form');
  if (!formBlock) return false;

  const rows = Array.from(formBlock.children)
    .filter((row) => row.children.length >= 2);
  if (rows.length === 0) return false;

  const keys = rows
    .map((row) => row.children[0]?.textContent?.trim().toLowerCase())
    .filter(Boolean);

  const hasTitle = keys.includes('title');
  const hasSchemaName = keys.includes('x-schema-name');
  return hasTitle && hasSchemaName;
}
