import { expect } from '@esm-bundle/chai';
import {
  isVoiceInputSupported, appendTranscript, createVoiceInput,
} from '../../../../../nx2/blocks/chat-ao/utils/voice-input.js';

class FakeRecognition {
  static instances = [];

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() { this.onstart?.(); }

  stop() { this.onend?.(); }

  emitResult(results, resultIndex = 0) {
    this.onresult?.({ resultIndex, results });
  }

  emitError(error) {
    this.onerror?.({ error });
  }
}

// Simulates Chrome's real, known flakiness: calling .stop() on the browser
// API doesn't reliably fire onend — this is the exact shape of the bug
// createVoiceInput's own stop() has to work around.
class StuckRecognition extends FakeRecognition {
  stop() { /* never calls onend, unlike a well-behaved recognition */ }
}

function result(transcript, isFinal) {
  return { 0: { transcript }, isFinal };
}

// Always shadows navigator.userAgentData deterministically for the duration —
// the real test browser's own ambient value must never leak into these
// assertions. `brands === undefined` simulates having no userAgentData at
// all (e.g. Safari); an array simulates a Chromium browser reporting it.
function withSpeechRecognitionCtor(brands, fn) {
  window.SpeechRecognition = FakeRecognition;
  FakeRecognition.instances = [];
  Object.defineProperty(window.navigator, 'userAgentData', {
    value: brands === undefined ? undefined : { brands },
    configurable: true,
  });
  try {
    return fn();
  } finally {
    delete window.SpeechRecognition;
    delete window.navigator.userAgentData;
  }
}

describe('isVoiceInputSupported', () => {
  it('is false when neither SpeechRecognition constructor exists', () => {
    // Chrome (this suite's own test browser) ships both real constructors,
    // inherited via Window.prototype — `delete` on an inherited property is
    // a no-op, so shadow both with an own `undefined` instead.
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
    try {
      expect(isVoiceInputSupported()).to.equal(false);
    } finally {
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;
    }
  });

  it('is true when SpeechRecognition exists and userAgentData is absent (e.g. Safari)', () => {
    withSpeechRecognitionCtor(undefined, () => {
      expect(isVoiceInputSupported()).to.equal(true);
    });
  });

  it('is true for an allowlisted Chromium brand (Google Chrome)', () => {
    withSpeechRecognitionCtor([{ brand: 'Google Chrome' }], () => {
      expect(isVoiceInputSupported()).to.equal(true);
    });
  });

  it('is false for a non-allowlisted Chromium fork exposing the same constructor', () => {
    withSpeechRecognitionCtor([{ brand: 'Brave' }], () => {
      expect(isVoiceInputSupported()).to.equal(false);
    });
  });
});

describe('appendTranscript', () => {
  it('appends to empty input with no separator', () => {
    expect(appendTranscript('', '', 'hello', false)).to.deep.equal({ value: 'hello', interim: '' });
  });

  it('replaces the previous interim text in place rather than duplicating it', () => {
    const step1 = appendTranscript('', '', 'hel', true);
    expect(step1).to.deep.equal({ value: 'hel', interim: 'hel' });
    const step2 = appendTranscript(step1.value, step1.interim, 'hello', true);
    expect(step2).to.deep.equal({ value: 'hello', interim: 'hello' });
  });

  it('locks in a final transcript and clears the interim tracker', () => {
    const step1 = appendTranscript('', '', 'hello', true);
    const step2 = appendTranscript(step1.value, step1.interim, 'hello', false);
    expect(step2).to.deep.equal({ value: 'hello', interim: '' });
  });

  it('separates a new chunk from prior typed text with a space', () => {
    expect(appendTranscript('draft', '', 'more', false)).to.deep.equal({ value: 'draft more', interim: '' });
  });

  it('does not add a redundant separator when the base already ends with a space', () => {
    expect(appendTranscript('draft ', '', 'more', false)).to.deep.equal({ value: 'draft more', interim: '' });
  });

  it('leaves user-typed text alone when it merely happens to end with unrelated text matching nothing tracked', () => {
    // prevInterim empty means nothing to strip, regardless of what the textarea currently holds.
    expect(appendTranscript('typed by hand', '', 'said aloud', false))
      .to.deep.equal({ value: 'typed by hand said aloud', interim: '' });
  });
});

describe('createVoiceInput', () => {
  it('is unsupported when no SpeechRecognition constructor exists', () => {
    // Same as isVoiceInputSupported's test above — shadow both real,
    // prototype-inherited constructors instead of relying on ambient absence.
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
    try {
      const voice = createVoiceInput({});
      expect(voice.isSupported).to.equal(false);
    } finally {
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;
    }
  });

  it('configures continuous/interim recognition and fires onStart', () => {
    withSpeechRecognitionCtor(undefined, () => {
      const started = [];
      const voice = createVoiceInput({ onStart: () => started.push(true) });

      voice.start();

      const recognition = FakeRecognition.instances.at(-1);
      expect(recognition.continuous).to.equal(true);
      expect(recognition.interimResults).to.equal(true);
      expect(started).to.deep.equal([true]);
    });
  });

  it('is a no-op to start a second time while already listening', () => {
    withSpeechRecognitionCtor(undefined, () => {
      const voice = createVoiceInput({});
      voice.start();
      voice.start();

      expect(FakeRecognition.instances).to.have.length(1);
    });
  });

  it('routes a final result to onFinalText, not onInterimText', () => {
    withSpeechRecognitionCtor(undefined, () => {
      const final = [];
      const interim = [];
      const voice = createVoiceInput({
        onFinalText: (t) => final.push(t),
        onInterimText: (t) => interim.push(t),
      });
      voice.start();

      FakeRecognition.instances.at(-1).emitResult([result('hello world', true)]);

      expect(final).to.deep.equal(['hello world']);
      expect(interim).to.have.length(0);
    });
  });

  it('routes an in-progress result to onInterimText', () => {
    withSpeechRecognitionCtor(undefined, () => {
      const interim = [];
      const voice = createVoiceInput({ onInterimText: (t) => interim.push(t) });
      voice.start();

      FakeRecognition.instances.at(-1).emitResult([result('hel', false)]);

      expect(interim).to.deep.equal(['hel']);
    });
  });

  it('maps a known error code to a friendly message', () => {
    withSpeechRecognitionCtor(undefined, () => {
      const errors = [];
      const voice = createVoiceInput({ onError: (msg) => errors.push(msg) });
      voice.start();

      FakeRecognition.instances.at(-1).emitError('not-allowed');

      expect(errors).to.deep.equal(['Microphone access was denied. Check your browser permissions.']);
    });
  });

  it('falls back to a generic message for an unknown error code', () => {
    withSpeechRecognitionCtor(undefined, () => {
      const errors = [];
      const voice = createVoiceInput({ onError: (msg) => errors.push(msg) });
      voice.start();

      FakeRecognition.instances.at(-1).emitError('mystery-error');

      expect(errors).to.deep.equal(['Voice recognition error: mystery-error']);
    });
  });

  it('ignores an "aborted" error entirely — that is the expected shape of a user-initiated stop', () => {
    withSpeechRecognitionCtor(undefined, () => {
      const errors = [];
      const voice = createVoiceInput({ onError: (msg) => errors.push(msg) });
      voice.start();

      FakeRecognition.instances.at(-1).emitError('aborted');

      expect(errors).to.have.length(0);
    });
  });

  it('fires onEnd and allows starting again after stop()', () => {
    withSpeechRecognitionCtor(undefined, () => {
      const ended = [];
      const voice = createVoiceInput({ onEnd: () => ended.push(true) });
      voice.start();

      voice.stop();
      expect(ended).to.deep.equal([true]);

      voice.start();
      expect(FakeRecognition.instances).to.have.length(2);
    });
  });

  it('flips to stopped immediately even when the browser never fires onend — the reported "stop doesn\'t work" bug', () => {
    window.SpeechRecognition = StuckRecognition;
    FakeRecognition.instances = [];
    Object.defineProperty(window.navigator, 'userAgentData', { value: undefined, configurable: true });
    try {
      const ended = [];
      const voice = createVoiceInput({ onEnd: () => ended.push(true) });
      voice.start();

      voice.stop(); // StuckRecognition's own .stop() never calls onend

      expect(ended).to.deep.equal([true]); // our stop() fires it anyway
      voice.start(); // would be a no-op if recognition hadn't been cleared
      expect(FakeRecognition.instances).to.have.length(2);
    } finally {
      delete window.SpeechRecognition;
      delete window.navigator.userAgentData;
    }
  });

  it('detaches the old instance\'s handlers on stop(), so a late event from it is ignored', () => {
    withSpeechRecognitionCtor(undefined, () => {
      const interim = [];
      const voice = createVoiceInput({ onInterimText: (t) => interim.push(t) });
      voice.start();
      const first = FakeRecognition.instances.at(-1);

      voice.stop();
      // Simulate the abandoned instance's onresult somehow still firing late.
      first.onresult?.({ resultIndex: 0, results: [result('late', false)] });

      expect(interim).to.have.length(0);
    });
  });

  it('stop() is a harmless no-op when nothing is listening', () => {
    withSpeechRecognitionCtor(undefined, () => {
      const voice = createVoiceInput({});
      voice.stop(); // throwing would fail this test
    });
  });
});
