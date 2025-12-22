import {
  Y, absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  TextSelection,
  NodeSelection,
} from 'https://y-wrapper-update--da-live--hannessolo.aem.live/deps/da-y-wrapper/dist/index.js';

export function findChangedNodes(oldDoc, newDoc) {
  const changes = [];

  function traverse(oldNode, newNode, pos) {
    // If nodes are the same reference, no changes
    if (oldNode === newNode) return;

    // Check if node type changed
    if (!oldNode || !newNode || oldNode.type !== newNode.type) {
      changes.push({
        type: 'replaced',
        pos,
        oldNode,
        newNode,
      });
      return;
    }

    // Check if content changed (for text nodes)
    if (oldNode.isText && newNode.isText) {
      if (oldNode.text !== newNode.text) {
        changes.push({
          type: 'text',
          pos,
          oldText: oldNode.text,
          newText: newNode.text,
        });
      }
      return;
    }

    // Check if marks changed
    if (oldNode.isText || newNode.isText) {
      const oldMarks = oldNode.marks || [];
      const newMarks = newNode.marks || [];
      if (oldMarks.length !== newMarks.length ||
        !oldMarks.every((m, i) => m.eq(newMarks[i]))) {
        changes.push({
          type: 'marks',
          pos,
          oldMarks,
          newMarks,
        });
      }
    }

    // Check if attributes changed
    if (!oldNode.sameMarkup(newNode)) {
      changes.push({
        type: 'attrs',
        pos,
        oldAttrs: oldNode.attrs,
        newAttrs: newNode.attrs,
      });
    }

    // Recursively check children
    const oldSize = oldNode.childCount;
    const newSize = newNode.childCount;
    const minSize = Math.min(oldSize, newSize);

    let oldPos = pos + 1;
    let newPos = pos + 1;

    for (let i = 0; i < minSize; i++) {
      const oldChild = oldNode.child(i);
      const newChild = newNode.child(i);
      traverse(oldChild, newChild, oldPos);
      oldPos += oldChild.nodeSize;
      newPos += newChild.nodeSize;
    }

    // Handle added nodes
    if (newSize > oldSize) {
      for (let i = oldSize; i < newSize; i++) {
        const newChild = newNode.child(i);
        changes.push({
          type: 'added',
          pos: newPos,
          node: newChild,
        });
        newPos += newChild.nodeSize;
      }
    }

    // Handle deleted nodes
    if (oldSize > newSize) {
      for (let i = newSize; i < oldSize; i++) {
        const oldChild = oldNode.child(i);
        changes.push({
          type: 'deleted',
          pos: oldPos,
          node: oldChild,
        });
        oldPos += oldChild.nodeSize;
      }
    }
  }

  traverse(oldDoc, newDoc, 0);
  return changes;
}

export function generateColor(name, hRange = [0, 360], sRange = [60, 80], lRange = [40, 60]) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  const normalizeHash = (min, max) => Math.floor((hash % (max - min)) + min);
  const h = normalizeHash(hRange[0], hRange[1]);
  const s = normalizeHash(sRange[0], sRange[1]);
  const l = normalizeHash(lRange[0], lRange[1]) / 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function cloneXmlNode(node, doc) {
  if (node instanceof Y.XmlText) {
    const text = new Y.XmlText()
    text.insert(0, node.toString())
    return text
  }

  if (node instanceof Y.XmlElement) {
    const el = new Y.XmlElement(node.nodeName)

    // ✅ correct attribute cloning
    const attrs = node.getAttributes()
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value)
    }

    // clone children
    for (const child of node.toArray()) {
      el.push([cloneXmlNode(child)])
    }

    return el
  }


  throw new Error('Unsupported XML node')
}

export function cloneXmlFragment(
  source,
  target,
  doc
) {
  target.delete(0, target.length)

  for (const node of source.toArray()) {
    target.push([cloneXmlNode(node, doc)])
  }
}

export const getRelativeSelection = (yXmlFragment, selection, mapping) => {
  try {
    return ({
      type: (selection).jsonID,
      anchor: absolutePositionToRelativePosition(
        selection.anchor,
        yXmlFragment,
        mapping
      ),
      head: absolutePositionToRelativePosition(
        selection.head,
        yXmlFragment,
        mapping
      )
    })
  } catch (e) {
    console.error('Error getting relative selection', e);
    return null;
  }
}

export const restoreRelativeSelection = (relSel, doc, yXmlFragment, mapping) => {
  if (relSel !== null && relSel.anchor !== null && relSel.head !== null) {
    if (relSel.type === 'all') {
      return new AllSelection(tr.doc)
    } else if (relSel.type === 'node') {
      const anchor = relativePositionToAbsolutePosition(
        doc,
        yXmlFragment,
        relSel.anchor,
        mapping
      )
      return NodeSelection.create(tr.doc, anchor)
    } else {
      const anchor = relativePositionToAbsolutePosition(
        doc,
        yXmlFragment,
        relSel.anchor,
        mapping
      )
      const head = relativePositionToAbsolutePosition(
        doc,
        yXmlFragment,
        relSel.head,
        mapping
      )
      if (anchor !== null && head !== null) {
        const sel = TextSelection.between(window.view.state.doc.resolve(anchor), window.view.state.doc.resolve(head));
        return sel
      }
    }
  }
}
