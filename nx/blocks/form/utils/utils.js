import { daFetch } from 'https://da.live/blocks/shared/utils.js';

function parsePointer(pointer) {
  const parts = pointer.split('.').flatMap((part) => {
    // Handle consecutive indices like "[0][0]" first (before arrayMatch grabs "[0]" as key)
    if (part.startsWith('[')) {
      const indices = part.match(/\[(\d+)\]/g);
      if (indices) return indices.map((i) => parseInt(i.slice(1, -1), 10));
    }
    const arrayMatch = part.match(/^(.+?)\[(\d+)\]$/);
    if (arrayMatch) return [arrayMatch[1], parseInt(arrayMatch[2], 10)];
    const indexMatch = part.match(/^\[(\d+)\]$/);
    if (indexMatch) return [parseInt(indexMatch[1], 10)];
    return part;
  });
  return parts;
}

export async function loadHtml(details) {
  const resp = await daFetch(details.sourceUrl);
  if (!resp.ok) return { error: 'Could not fetch doc' };
  return { html: (await resp.text()) };
}

/**
 * Gets a value from an object using a pointer string (dot notation).
 * @param {Object} obj - The object to read from
 * @param {string} pointer - The pointer string (e.g. "data.items[0].name")
 * @returns {*} - The value at the pointer, or undefined
 */
export function getValueByPointer(obj, pointer) {
  const parts = parsePointer(pointer);
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Removes an array item at the given pointer by splicing it from its parent array.
 * @param {Object} obj - The object to modify
 * @param {string} pointer - Array item pointer (e.g. data.items[0])
 * @returns {boolean} - True if the item was removed, false otherwise
 */
export function removeArrayItemByPointer(obj, pointer) {
  const parts = parsePointer(pointer);
  if (parts.length < 2) return false;

  // Pointer must end with an array index (e.g. "data.items.[0]" → index 0)
  const lastPart = parts[parts.length - 1];
  if (typeof lastPart !== 'number') return false;

  // Navigate to the parent of the target array
  const parentParts = parts.slice(0, -1);
  let current = obj;
  for (let i = 0; i < parentParts.length - 1; i += 1) {
    const part = parentParts[i];
    if (current == null || !(part in current)) return false;
    // Step into each segment (e.g. obj → obj.data → obj.data.items)
    current = current[part];
  }

  // Key of the array (e.g. "items")
  const parentKey = parentParts[parentParts.length - 1];
  if (current == null || !(parentKey in current)
    || !Array.isArray(current[parentKey])) return false;

  const array = current[parentKey];
  const index = lastPart;
  if (index < 0 || index >= array.length) return false;

  // Remove the item in-place
  array.splice(index, 1);
  return true;
}

/**
 * Sets a value on an object using a pointer string (dot notation).
 * Supports dot notation and array indices.
 * @param {Object} obj - The object to set the value on
 * @param {string} pointer - The pointer string (e.g., "data.parent[0].child")
 * @param {*} value - The value to set
 * @example
 * const obj = { data: { items: [{ name: 'test' }] } };
 * setValueByPointer(obj, 'data.items[0].name', 'updated');
 * // obj.data.items[0].name is now 'updated'
 */
export function setValueByPointer(obj, pointer, value) {
  const parts = parsePointer(pointer);

  // Navigate to the parent of the final property
  let current = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!(part in current)) {
      // Create missing intermediate objects/arrays
      const nextPart = parts[i + 1];
      current[part] = typeof nextPart === 'number' ? [] : {};
    }
    current = current[part];
  }

  // Set the final value
  current[parts[parts.length - 1]] = value;
}

export function resolvePropSchema(localSchema, fullSchema) {
  const { title } = localSchema;

  if (localSchema.$ref) {
    const defKey = localSchema.$ref.substring(2).split('/')[1];

    // try local ref
    let def = localSchema?.$defs?.[defKey];
    // TODO: walk up the tree looking for the def
    // try global ref
    if (!def) def = fullSchema?.$defs?.[defKey];
    if (def) {
      if (!title) return def;
      return { ...def, title };
    }
  }

  // Normalize local props to the same format as referenced schema
  return { title, properties: localSchema, required: localSchema.required };
}

/**
 * @param {*} key the key of the property
 * @param {*} prop the current property being acted on
 * @param {*} propSchema the schema that applies to the current property
 * @param {*} fullSchema the full schema that applies to the form
 * @param {*} pointer the full pointer to this property (e.g., "grand.parent[0].child")
 */
export function annotateProp(key, propData, propSchema, fullSchema, pointer = '', required = false) {
  // Build the current pointer
  const currentPointer = pointer ? `${pointer}.${key}` : key;

  // Will have schema.props
  const resolvedSchema = resolvePropSchema(propSchema, fullSchema);

  if (Array.isArray(propData)) {
    const resolvedItemsSchema = resolvePropSchema(propSchema.items, fullSchema);

    // It's possible that items do not have a title, let them inherit from the parent
    resolvedItemsSchema.title ??= resolvedSchema.title;

    const data = [];

    // Loop through the actual data and match it to the item schema
    propData.forEach((itemPropData, index) => {
      if (propSchema.items.oneOf) {
        // TODO: Support one of schemas
        // propSchema.items.oneOf.forEach((oneOf) => {
        //   console.log(oneOf);
        //   const arrayPointer = `${currentPointer}[${index}]`;
        //   data.push(annotateProp(key, itemPropData, oneOf, fullSchema, arrayPointer));
        // });
      } else {
        data.push(annotateProp(`[${index}]`, itemPropData, propSchema.items, fullSchema, currentPointer));
      }
    });

    return { key, data, schema: resolvedSchema, pointer: currentPointer, required };
  }

  if (typeof propData === 'object') {
    // Loop through the data and match it to the item schema
    // return as array to keep consistent with upper array
    const data = Object.entries(propData).reduce((acc, [k, pD]) => {
      const isRequired = resolvedSchema.required?.includes(k) ?? false;

      if (resolvedSchema.properties[k]) {
        const childSchema = resolvedSchema.properties[k];
        acc.push(annotateProp(k, pD, childSchema, fullSchema, currentPointer, isRequired));
      }

      // Look for sub-property schemas
      if (resolvedSchema.properties.properties?.[k]) {
        const subPropSchema = resolvedSchema.properties.properties[k];
        acc.push(annotateProp(k, pD, subPropSchema, fullSchema, currentPointer, isRequired));
      }

      return acc;
    }, []);

    return { key, data, schema: resolvedSchema, pointer: currentPointer, required };
  }

  return { key, data: propData, schema: resolvedSchema, pointer: currentPointer, required };
}
