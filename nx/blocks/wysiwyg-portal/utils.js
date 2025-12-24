import { handleSignIn, loadIms } from "../../utils/ims.js";

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
        return;
      }
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

const EDITABLE_TYPES = ['heading', 'paragraph', 'ordered_list', 'bullet_list'];

// Find the common editable ancestor for all changed nodes
export function findCommonEditableAncestor(view, changes, prevState) {
  if (changes.length === 0) return null;

  // For each change, find its editable ancestor
  const editableAncestors = [];
  
  for (const change of changes) {
    const isDeletedNode = change.type === 'deleted';
    try {
      const doc = isDeletedNode ? prevState.doc : view.state.doc;
      const $pos = doc.resolve(change.pos);
      let editableAncestor = null;
      
      // Walk up the tree to find an editable node
      for (let depth = $pos.depth; depth > 0; depth--) {
        const node = $pos.node(depth);
        if (EDITABLE_TYPES.includes(node.type.name)) {
          editableAncestor = {
            node,
            pos: $pos.before(depth),
          };
          // TODO consider adding this break back, to find the nearest.
          // Problem is, for ul we can have ul > p where we want the ul.
          // break;
        }
      }
      
      if (editableAncestor) {
        editableAncestors.push(editableAncestor);
      } else if (!isDeletedNode) {
        // If any change doesn't have an editable ancestor, return null
        return null;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Could not resolve position for change:', e);
      return null;
    }
  }

  // Check if all changes share the same editable ancestor
  if (editableAncestors.length === 0) return null;
  
  const firstPos = editableAncestors[0].pos;
  const allSameAncestor = editableAncestors.every((ancestor) => ancestor.pos === firstPos);
  
  return allSameAncestor ? editableAncestors[0] : null;
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

export async function checkPermissions(sourceUrl) {
  const token = await getToken();
  const resp = await fetch(sourceUrl, {
    method: "HEAD",
    headers: { Authorization: `Bearer ${token}` },
  });

  // If child actions header is present, use it.
  // This is a hint as to what can be done with the children.
  if (resp.headers?.get("x-da-child-actions")) {
    resp.permissions = resp.headers
      .get("x-da-child-actions")
      .split("=")
      .pop()
      .split(",");
    return resp;
  }

  // Use the self actions hint if child actions are not present.
  if (resp.headers?.get("x-da-actions")) {
    resp.permissions = resp.headers
      ?.get("x-da-actions")
      ?.split("=")
      .pop()
      .split(",");
    return resp;
  }

  // Support legacy admin.role.all
  resp.permissions = ["read", "write"];
  return resp;
}

export async function getToken() {
  const ims = await loadIms(true);
  if (ims.anonymous) return null;
  const { token } = ims.accessToken;
  return token;
}

export async function signIn() {
  const token = await getToken();
  if (!token) {
    handleSignIn();
    await new Promise(() => {
      const signInListener = (e) => {
        try {
          const url = new URL(e.data);
          if (url.hash.includes('from_ims')) {
            window.location.reload();
          }
        } catch (e) {}
      }
      window.addEventListener('message', signInListener);
    });
  }
}
