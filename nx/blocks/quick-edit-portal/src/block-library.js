import { getToken } from './utils.js';
import { TextSelection, DOMParser as proseDOMParser } from 'da-y-wrapper';

// Helper to get fetch headers with auth
async function getFetchHeaders() {
  const token = await getToken();
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

// Convert div-based block structure to HTML table (same as da-library)
function getBlockTableHtml(block) {
  const classes = block.className.split(' ');
  const name = classes.shift();
  const variants = classes.length > 0 ? classes.join(', ') : '';
  
  const rows = [...block.children];
  const maxCols = rows.reduce((cols, row) => (
    row.children.length > cols ? row.children.length : cols), 0);
  
  const table = document.createElement('table');
  table.setAttribute('border', 1);
  const headerRow = document.createElement('tr');

  const th = document.createElement('td');
  th.setAttribute('colspan', maxCols);
  th.textContent = variants ? `${name} (${variants})` : name;

  headerRow.append(th);
  table.append(headerRow);
  
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    [...row.children].forEach((col) => {
      const td = document.createElement('td');
      if (row.children.length < maxCols) {
        td.setAttribute('colspan', maxCols);
      }
      td.innerHTML = col.innerHTML;
      tr.append(td);
    });
    table.append(tr);
  });
  
  return table;
}

// Helper to fetch and parse block variants
async function getBlockVariants(path) {
  try {
    const headers = await getFetchHeaders();
    const resp = await fetch(path, { headers });
    if (!resp.ok) return [];
    
    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const blocks = [...doc.querySelectorAll('body > div > div, main > div > div')];
    
    return blocks.map((block) => {
      const classes = block.className.split(' ');
      const name = classes.shift();
      const variants = classes.length > 0 ? classes.join(', ') : '';
      
      // Convert div-based block to HTML table
      const table = getBlockTableHtml(block);
      
      return {
        name: name || 'Default',
        variants,
        html: table.outerHTML,
      };
    });
  } catch (e) {
    console.error('Error fetching block variants:', e);
    return [];
  }
}

// Helper to fetch blocks list
async function getBlocks(sources) {
  try {
    const headers = await getFetchHeaders();
    const sourcesData = await Promise.all(
      sources.map(async (url) => {
        try {
          const resp = await fetch(url, { headers });
          if (!resp.ok) return null;
          const data = await resp.json();
          return data;
        } catch {
          return null;
        }
      })
    );

    const blockList = [];
    sourcesData.forEach((blockData) => {
      if (!blockData || !blockData.data) return;
      (blockData.data.data || blockData.data).forEach((block) => {
        if (block.name && block.path) blockList.push(block);
      });
    });

    return blockList;
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return [];
  }
}

export async function handleBlockLibraryRequest(data, ctx) {
  const { requestType, payload, requestId } = data;
  
  try {
    if (requestType === 'get-blocks') {
      const blocks = await getBlocks(payload.sources);
      ctx.port.postMessage({
        type: 'block-library-response',
        requestType: 'get-blocks',
        requestId,
        data: blocks,
      });
    } else if (requestType === 'get-block-variants') {
      const variants = await getBlockVariants(payload.path);
      ctx.port.postMessage({
        type: 'block-library-response',
        requestType: 'get-block-variants',
        requestId,
        data: variants,
      });
    }
  } catch (error) {
    ctx.port.postMessage({
      type: 'block-library-response',
      requestType,
      requestId,
      error: error.message,
    });
  }
}

export function insertBlockAt(data, ctx) {
  const { html, proseIndex, position } = data;
  
  if (!window.view) return;

  // Parse the HTML string into a document
  const doc = new DOMParser().parseFromString(html, 'text/html');
  
  // Extract the actual content from the body (same as da-library's parseDom)
  // Get the first child element from the body (usually a table or div)
  const blockElement = doc.body.firstElementChild;
  
  if (!blockElement) return;
  
  // Parse the DOM element into ProseMirror nodes
  const nodes = proseDOMParser.fromSchema(window.view.state.schema).parse(blockElement);

  // Calculate insertion position
  let insertPos;
  const pos = window.view.state.doc.resolve(proseIndex);
  
  if (position === 'before') {
    // Insert before the element
    insertPos = pos.before(pos.depth);
  } else {
    // Insert after the element
    insertPos = pos.after(pos.depth);
  }

  // Create transaction and insert the content
  const tr = window.view.state.tr;
  tr.insert(insertPos, nodes.content);

  // Update selection to after the inserted content
  const newPos = insertPos + nodes.content.size;
  tr.setSelection(TextSelection.create(tr.doc, Math.min(newPos, tr.doc.content.size)));

  // Dispatch the transaction
  window.view.dispatch(tr.scrollIntoView());
}

export function deleteBlockAt(data, ctx) {
  const { proseIndex } = data;
  
  if (!window.view) return;

  const { tr, doc } = window.view.state;
  
  try {
    // Resolve the position to get a resolved position object
    const $pos = doc.resolve(proseIndex);
    
    // Find the table node by traversing up the tree
    // Blocks are represented as tables, so we need to find the table ancestor
    let tableDepth = null;
    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth);
      if (node.type.name === 'table') {
        tableDepth = depth;
        break;
      }
    }
    
    if (tableDepth === null) {
      console.warn('No table found at position', proseIndex);
      return;
    }
    
    // Get the table node and its position
    const tableNode = $pos.node(tableDepth);
    const from = $pos.before(tableDepth);
    const to = from + tableNode.nodeSize;
    
    console.log(`Deleting table from ${from} to ${to} (size: ${tableNode.nodeSize})`);
    
    // Delete the entire table
    tr.delete(from, to);
    
    // Dispatch the transaction
    window.view.dispatch(tr.scrollIntoView());
  } catch (error) {
    console.error('Error deleting block:', error);
  }
}

export function moveBlockAt(data, ctx) {
  const { fromIndex, toIndex } = data;
  
  if (!window.view) return;

  const { tr, doc, schema } = window.view.state;
  
  try {
    // Resolve the from position
    const $fromPos = doc.resolve(fromIndex);
    
    // Find the table node at fromIndex
    let fromTableDepth = null;
    for (let depth = $fromPos.depth; depth > 0; depth--) {
      const node = $fromPos.node(depth);
      if (node.type.name === 'table') {
        fromTableDepth = depth;
        break;
      }
    }
    
    if (fromTableDepth === null) {
      console.warn('No table found at fromIndex', fromIndex);
      return;
    }
    
    // Get the table node and its position
    const tableNode = $fromPos.node(fromTableDepth);
    const fromStart = $fromPos.before(fromTableDepth);
    const fromEnd = fromStart + tableNode.nodeSize;
    
    // Resolve the to position
    const $toPos = doc.resolve(toIndex);
    
    // Find the table node at toIndex
    let toTableDepth = null;
    for (let depth = $toPos.depth; depth > 0; depth--) {
      const node = $toPos.node(depth);
      if (node.type.name === 'table') {
        toTableDepth = depth;
        break;
      }
    }
    
    if (toTableDepth === null) {
      console.warn('No table found at toIndex', toIndex);
      return;
    }
    
    // Get the target position (before the target table)
    const toStart = $toPos.before(toTableDepth);
    
    console.log(`Moving block from ${fromStart}-${fromEnd} to ${toStart}`);
    
    // Delete from the original position first
    tr.delete(fromStart, fromEnd);
    
    // Recalculate the insertion position if the target is after the deleted block
    let insertPos = toStart;
    if (toStart > fromStart) {
      insertPos = toStart - tableNode.nodeSize;
    }
    
    // Insert at the new position
    tr.insert(insertPos, tableNode);
    
    // Dispatch the transaction
    window.view.dispatch(tr.scrollIntoView());
  } catch (error) {
    console.error('Error moving block:', error);
  }
}
