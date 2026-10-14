// Cross-repo contract between the page-evaluation chat widget (da-nx chat-ao artifact)
// and a host that can show findings on the open page (da.live canvas).
// See docs/evaluation-findings.md for the finding shape and the full flow.
//
// FOCUS_FINDING (widget -> document), cancelable:
//   detail: { findingId: string, findings: EvalFinding[] }
//   A host that can locate findings on the page calls event.preventDefault() to claim it;
//   if nobody claims it, the widget falls back to its own suggestion dialog.
export const EVAL_EVENT = Object.freeze({
  FOCUS_FINDING: 'nx-eval-focus-finding',
});
