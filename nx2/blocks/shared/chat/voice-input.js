// See docs/chat-ao-component.md#voice-input for the rationale behind this
// file's non-obvious choices (browser allowlist, interim-replace, stop()).
const CHROMIUM_BRANDS = new Set(['Google Chrome']);

const ERROR_MESSAGES = {
  network: 'Could not connect to the speech recognition service. Check your connection and try again.',
  'not-allowed': 'Microphone access was denied. Check your browser permissions.',
  'no-speech': 'No speech detected. Try again.',
  'audio-capture': 'No microphone found, or it is in use by another app.',
};

function getSpeechRecognitionCtor() {
  const ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!ctor) return null;
  const brands = navigator.userAgentData?.brands ?? null;
  if (brands && !brands.some((b) => CHROMIUM_BRANDS.has(b.brand))) return null;
  return ctor;
}

export function isVoiceInputSupported() {
  return getSpeechRecognitionCtor() !== null;
}

export function appendTranscript(currentValue, prevInterim, text, isInterim) {
  const base = prevInterim && currentValue.endsWith(prevInterim)
    ? currentValue.slice(0, currentValue.length - prevInterim.length)
    : currentValue;
  const separator = base && !base.endsWith(' ') ? ' ' : '';
  return { value: base + separator + text, interim: isInterim ? text : '' };
}

export function createVoiceInput({
  onStart, onEnd, onInterimText, onFinalText, onError,
}) {
  const Ctor = getSpeechRecognitionCtor();
  let recognition = null;

  return {
    isSupported: Ctor !== null,

    start() {
      if (!Ctor || recognition) return;
      const inst = new Ctor();
      recognition = inst;
      inst.continuous = true;
      inst.interimResults = true;
      inst.lang = navigator.language || 'en-US';

      inst.onstart = () => { if (inst === recognition) onStart?.(); };

      inst.onresult = (e) => {
        if (inst !== recognition) return;
        let interim = '';
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const result = e.results[i];
          if (result.isFinal) final += result[0].transcript;
          else interim += result[0].transcript;
        }
        if (final) onFinalText?.(final);
        else if (interim) onInterimText?.(interim);
      };

      inst.onerror = (e) => {
        if (inst !== recognition || e.error === 'aborted') return;
        onError?.(ERROR_MESSAGES[e.error] ?? `Voice recognition error: ${e.error}`);
      };

      inst.onend = () => {
        if (inst !== recognition) return;
        recognition = null;
        onEnd?.();
      };

      inst.start();
    },

    stop() {
      if (!recognition) return;
      const inst = recognition;
      recognition = null;
      onEnd?.();
      inst.onstart = null;
      inst.onresult = null;
      inst.onerror = null;
      inst.onend = null;
      inst.stop();
    },
  };
}
