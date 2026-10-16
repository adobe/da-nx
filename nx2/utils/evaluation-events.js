// Cross-repo contract between the page-evaluation chat widget (da-nx chat-ao artifact)
// and a host that can show findings on the open page (da.live canvas).
// See docs/evaluation-findings.md for the finding shape and the full flow.
//
// FOCUS_FINDING (widget -> document), cancelable:
//   detail: { findingId: string, findings: EvalFinding[] }
//   A host that can locate findings on the page calls event.preventDefault() to claim it;
//   if nobody claims it, the widget falls back to its own suggestion dialog.
//
// SUGGEST_ELEMENT (widget -> document), cancelable:
//   detail: { group: EvalGroup, evaluatedUrl?: string }
//   EvalGroup = { key, label, name, findings: EvalFinding[] }: one failing page element; `name`
//   is the short element name used in the chat bubble, e.g. "Hero"
//   A host that can read the element from the page calls event.preventDefault() and sends the
//   "Generate suggestion" request to the chat itself (it can add the full current text, links and
//   formatting). If nobody claims it, the widget sends a plain request built from the artifact.
export const EVAL_EVENT = Object.freeze({
  FOCUS_FINDING: 'nx-eval-focus-finding',
  SUGGEST_ELEMENT: 'nx-eval-suggest-element',
});
