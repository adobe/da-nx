const PHASE = {
  IDLE: 'idle',
  STREAMING: 'streaming',
  APPROVAL_PENDING: 'approval-pending',
  RESUMING: 'resuming',
};

/*
 * Tracks the lifecycle of a single agent turn — from user message to final response,
 * including any approval pauses in between.
 *
 * Transitions:
 *   idle → streaming              begin()
 *   streaming → idle              end()
 *   streaming → approval-pending  pause()
 *   approval-pending → resuming   resume()
 *   resuming → idle               end()
 *   resuming → approval-pending   pause()  (nested approval)
 *   any → idle                    cancel() (stop / reject / clear)
 */
export default class Turn {
  _phase = PHASE.IDLE;

  // end() stays in approval-pending to avoid a false idle between stream end and user decision.
  pause() {
    if (this._phase === PHASE.STREAMING || this._phase === PHASE.RESUMING) {
      this._phase = PHASE.APPROVAL_PENDING;
    }
  }

  begin() { this._phase = PHASE.STREAMING; }

  resume() {
    if (this._phase === PHASE.APPROVAL_PENDING) this._phase = PHASE.RESUMING;
  }

  end() {
    if (this._phase !== PHASE.APPROVAL_PENDING) this._phase = PHASE.IDLE;
  }

  cancel() { this._phase = PHASE.IDLE; }

  get isActive() { return this._phase !== PHASE.IDLE; }
}
