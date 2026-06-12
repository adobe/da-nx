import { expect } from '@esm-bundle/chai';
import Turn from '../../../../../nx2/blocks/chat/controllers/turn.js';

describe('Turn', () => {
  let turn;

  beforeEach(() => {
    turn = new Turn();
  });

  describe('initial state', () => {
    it('starts idle and inactive', () => {
      expect(turn.isActive).to.be.false;
    });
  });

  describe('begin()', () => {
    it('idle → streaming (isActive becomes true)', () => {
      turn.begin();
      expect(turn.isActive).to.be.true;
    });
  });

  describe('end()', () => {
    it('streaming → idle', () => {
      turn.begin();
      turn.end();
      expect(turn.isActive).to.be.false;
    });

    it('resuming → idle', () => {
      turn.begin();
      turn.pause();
      turn.resume();
      turn.end();
      expect(turn.isActive).to.be.false;
    });

    it('no-op from approval-pending — stays active', () => {
      turn.begin();
      turn.pause();
      turn.end(); // must not go to idle
      expect(turn.isActive).to.be.true;
    });
  });

  describe('pause()', () => {
    it('streaming → approval-pending (end becomes no-op)', () => {
      turn.begin();
      turn.pause();
      turn.end(); // no-op from approval-pending
      expect(turn.isActive).to.be.true;
    });

    it('resuming → approval-pending (nested approval)', () => {
      turn.begin();
      turn.pause();
      turn.resume();
      turn.pause(); // nested — back to approval-pending
      turn.end(); // no-op from approval-pending
      expect(turn.isActive).to.be.true;
    });

    it('no-op from idle', () => {
      turn.pause();
      expect(turn.isActive).to.be.false;
    });

    it('no-op from approval-pending', () => {
      turn.begin();
      turn.pause();
      turn.pause(); // second pause — no-op
      // resume still works, confirming still in approval-pending
      turn.resume();
      turn.end();
      expect(turn.isActive).to.be.false;
    });
  });

  describe('resume()', () => {
    it('approval-pending → resuming (end then works)', () => {
      turn.begin();
      turn.pause();
      turn.resume();
      turn.end();
      expect(turn.isActive).to.be.false;
    });

    it('no-op from streaming (end still works)', () => {
      turn.begin();
      turn.resume(); // no-op — not in approval-pending
      turn.end();
      expect(turn.isActive).to.be.false;
    });

    it('no-op from resuming (end still works)', () => {
      turn.begin();
      turn.pause();
      turn.resume();
      turn.resume(); // no-op — already resuming
      turn.end();
      expect(turn.isActive).to.be.false;
    });
  });

  describe('cancel()', () => {
    it('streaming → idle', () => {
      turn.begin();
      turn.cancel();
      expect(turn.isActive).to.be.false;
    });

    it('approval-pending → idle', () => {
      turn.begin();
      turn.pause();
      turn.cancel();
      expect(turn.isActive).to.be.false;
    });

    it('resuming → idle', () => {
      turn.begin();
      turn.pause();
      turn.resume();
      turn.cancel();
      expect(turn.isActive).to.be.false;
    });
  });

  describe('isActive', () => {
    it('is false only in idle — true for streaming, approval-pending, resuming', () => {
      expect(turn.isActive).to.be.false; // idle

      turn.begin();
      expect(turn.isActive).to.be.true; // streaming

      turn.pause();
      expect(turn.isActive).to.be.true; // approval-pending

      turn.resume();
      expect(turn.isActive).to.be.true; // resuming

      turn.end();
      expect(turn.isActive).to.be.false; // idle
    });
  });
});
