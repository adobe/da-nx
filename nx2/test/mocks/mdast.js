export function unified() {
  const pipe = {
    use: () => pipe,
    parse: (text) => ({ type: 'root', children: [], raw: text }),
  };
  return pipe;
}

export const remarkParse = {};
export const remarkGfmNoLink = {};

export function mdast2hast(tree) {
  return { type: 'root', children: [], raw: tree?.raw ?? '' };
}

export function hastToDom(hast) {
  const frag = document.createDocumentFragment();
  if (hast?.raw) {
    frag.appendChild(document.createTextNode(hast.raw));
  }
  return frag;
}
