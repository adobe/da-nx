import { MenuItem, TextSelection } from 'da-y-wrapper';
import { markActive } from './menuUtils.js';

function findExistingLink(state, linkMarkType) {
  const { $from, $to, empty } = state.selection;
  if (empty) {
    const { node, offset } = $from.parent.childAfter($from.parentOffset);
    return {
      link: node,
      offset,
    };
  }
  let result;
  $from.parent.nodesBetween($from.parentOffset, $to.parentOffset, (node, pos) => {
    if (linkMarkType.isInSet(node.marks)) {
      result = {
        link: node,
        offset: pos,
      };
    }
  });
  return result;
}

function calculateLinkPosition(state, link, offset) {
  const { $from } = state.selection;
  const start = $from.pos - ($from.parentOffset - offset);
  return {
    start,
    end: start + link.nodeSize,
  };
}

export function linkItem(linkMarkType) {
  const label = 'Edit link';

  return new MenuItem({
    title: 'Add or Edit link',
    label,
    class: 'edit-link',
    active(state) {
      return markActive(state, linkMarkType);
    },
    enable(state) {
      return !state.selection.empty || this.active(state);
    },
    run(state, dispatch) {
      const { $from, $to } = state.selection;
      let href = '';
      let text = '';

      // Get existing link if there is one
      if (this.active(state)) {
        const found = findExistingLink(state, linkMarkType);
        if (found?.link) {
          const linkMark = found.link.marks.find((m) => m.type === linkMarkType);
          href = linkMark?.attrs.href || '';
          text = found.link.textContent || '';
        }
      } else {
        text = state.doc.textBetween($from.pos, $to.pos);
        if (text && /^(https|http):/.test(text.trim())) {
          href = text.trim();
        }
      }

      // Use browser prompt for simplicity in portal
      const newHref = prompt('Enter link URL:', href);
      if (newHref === null) return; // User cancelled

      const trimmedHref = newHref.trim();
      if (!trimmedHref) return;

      let tr = state.tr;
      let start = $from.pos;
      let end = $to.pos;

      // Handle existing link
      if (this.active(state)) {
        const found = findExistingLink(state, linkMarkType);
        if (found?.link) {
          const linkPos = calculateLinkPosition(state, found.link, found.offset);
          start = linkPos.start;
          end = linkPos.end;
        }
      } else if (state.selection.empty && trimmedHref) {
        // No selection, insert the URL as text
        text = trimmedHref;
        const textNode = state.schema.text(text);
        tr = tr.replaceWith(start, end, textNode);
        end = start + text.length;
      }

      // Apply or update link mark
      tr = tr.removeMark(start, end, linkMarkType);
      tr = tr.addMark(start, end, linkMarkType.create({ href: trimmedHref }));
      tr = tr.setSelection(TextSelection.create(tr.doc, end));

      dispatch(tr);
    },
  });
}

export function removeLinkItem(linkMarkType) {
  return new MenuItem({
    title: 'Remove link',
    label: 'Remove',
    class: 'edit-unlink',
    active(state) {
      return markActive(state, linkMarkType);
    },
    enable(state) {
      return this.active(state);
    },
    run(state, dispatch) {
      const { link, offset } = findExistingLink(state, linkMarkType);
      if (!link) return;
      
      const { start, end } = calculateLinkPosition(state, link, offset);
      const tr = state.tr
        .setSelection(TextSelection.create(state.doc, start, end))
        .removeMark(start, end, linkMarkType);
      dispatch(tr);
    },
  });
}
