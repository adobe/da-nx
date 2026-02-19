function getDocument() {
  const doc = document.implementation.createHTMLDocument();

  const header = document.createElement('header');

  const main = document.createElement('main');
  const section = document.createElement('div');
  main.append(section);

  const footer = document.createElement('footer');

  doc.body.append(header, main, footer);

  return doc;
}

function createRow(key, valCol) {
  const row = document.createElement('div');

  const keyCol = document.createElement('div');
  const keyPara = document.createElement('p');
  keyPara.textContent = key;
  keyCol.append(keyPara);

  row.append(keyCol, valCol);
  return row;
}

function createBlock(name) {
  const block = document.createElement('div');
  block.className = name.toLowerCase();
  return block;
}

function createNestedBlock(key, obj, nestedBlocks) {
  const guid = Math.random().toString(36).substring(2, 8);
  const nestedBlock = createBlock(`${key} ${key}-${guid}`);
  const rows = Object.entries(obj).map(([k, v]) => {
    // eslint-disable-next-line no-use-before-define
    const nestedValCol = createValueCol(k, v, nestedBlocks);
    return createRow(k, nestedValCol);
  });
  nestedBlock.append(...rows);
  nestedBlocks.push(nestedBlock);
  return guid;
}

function createArrayBlock(key, arr, nestedBlocks) {
  const guid = Math.random().toString(36).substring(2, 8);
  const arrayBlock = createBlock(`${key} ${key}-${guid}`);

  // Create a row with @items key, but process array items with original key
  const valCol = document.createElement('div');
  const ul = document.createElement('ul');

  arr.forEach((item) => {
    if (Array.isArray(item)) {
      // Nested array within array
      const itemGuid = createArrayBlock(key, item, nestedBlocks);
      const li = document.createElement('li');
      li.textContent = `self://#${key.toLowerCase()}-${itemGuid}`;
      ul.append(li);
    } else if (typeof item === 'object' && item !== null) {
      // Object within array - use original key, not '@items'
      const itemGuid = createNestedBlock(key, item, nestedBlocks);
      const li = document.createElement('li');
      li.textContent = `self://#${key.toLowerCase()}-${itemGuid}`;
      ul.append(li);
    } else {
      // Primitive within array
      const li = document.createElement('li');
      li.textContent = item;
      ul.append(li);
    }
  });

  valCol.append(ul);
  const row = createRow('@items', valCol);

  arrayBlock.append(row);
  nestedBlocks.push(arrayBlock);
  return guid;
}

function createValueCol(key, value, nestedBlocks) {
  const valCol = document.createElement('div');

  if (value) {
    // Create a paragraph to hold the property
    const valPara = document.createElement('p');

    // Handle objects by creating a nested block
    if (typeof value === 'object') {
      // Check if value is an array and create multiple nested blocks if needed
      if (Array.isArray(value)) {
        // Skip empty arrays - don't create any HTML
        if (!value.length) {
          return null;
        }
        // Handle array items: could be arrays, objects, or primitives
        const ul = document.createElement('ul');
        value.forEach((item) => {
          if (Array.isArray(item)) {
            // Handle nested array (array within array)
            const guid = createArrayBlock(key, item, nestedBlocks);
            const li = document.createElement('li');
            li.textContent = `self://#${key.toLowerCase()}-${guid}`;
            ul.append(li);
          } else if (typeof item === 'object' && item !== null) {
            // Handle object within array
            const guid = createNestedBlock(key, item, nestedBlocks);
            const li = document.createElement('li');
            li.textContent = `self://#${key.toLowerCase()}-${guid}`;
            ul.append(li);
          } else {
            // Handle primitive within array
            const li = document.createElement('li');
            li.textContent = item;
            ul.append(li);
          }
        });
        valCol.append(ul);
        // Since we already appended paragraphs above, skip the rest of this function
        return valCol;
      }

      // handle objects - skip empty objects
      if (Object.keys(value).length === 0) {
        return null;
      }
      const guid = createNestedBlock(key, value, nestedBlocks);
      valPara.textContent = `self://#${key.toLowerCase()}-${guid}`;
    } else {
      valPara.textContent = value;
    }

    valCol.append(valPara);
  }

  return valCol;
}

function getFormBlock(metadata, nestedBlocks) {
  const daForm = createBlock('da-form');

  const rows = Object.entries(metadata).flatMap((entry) => {
    const [key, value] = entry;
    const xKey = key === 'schemaName' ? 'x-schema-name' : key;

    const valCol = createValueCol(key, value, nestedBlocks);

    // Skip if createValueCol returned null (empty array/object)
    if (!valCol) return [];

    return [createRow(xKey, valCol)];
  });

  daForm.append(...rows);
  return daForm;
}

function getDataBlock(schemaName, data, nestedBlocks) {
  const dataBlock = createBlock(schemaName);
  const rows = Object.entries(data).flatMap((entry) => {
    const [key, value] = entry;

    const valCol = createValueCol(key, value, nestedBlocks);

    // Skip if createValueCol returned null (empty array/object)
    if (!valCol) return [];

    return [createRow(key, valCol)];
  });
  dataBlock.append(...rows);
  return dataBlock;
}

export default function json2html(json) {
  const nestedBlocks = [];
  const doc = getDocument();

  const { metadata, data } = json;
  const { schemaName } = metadata;
  const formBlock = getFormBlock(metadata, nestedBlocks);
  const dataBlock = getDataBlock(schemaName, data, nestedBlocks);

  doc.querySelector('main > div').append(formBlock, dataBlock, ...nestedBlocks);

  return doc.body.outerHTML;
}
