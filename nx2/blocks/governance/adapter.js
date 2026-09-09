const TONE_BY_ALIGNMENT = { YES: 'positive', NO: 'negative' };

const toneOf = (alignment) => TONE_BY_ALIGNMENT[alignment] ?? 'neutral';

function basename(source = '') {
  const last = source.split('?')[0].split('#')[0].split('/').pop();
  return last || source;
}

function toItem(check, assetLabel) {
  const {
    check_title: title, alignment, reasoning, suggestions, category,
  } = check;
  const context = { category, description: reasoning };
  const label = assetLabel ?? title;

  if (alignment === 'NO' && suggestions) {
    return {
      title,
      description: reasoning,
      suggestion: {
        label, issue: reasoning, suggested: suggestions, context,
      },
    };
  }
  return { title, description: reasoning, check: { label, context } };
}

function collectChecks(response) {
  const textChecks = (response.text_evaluation?.evaluations ?? [])
    .map((check) => ({ check }));
  const imageChecks = (response.image_evaluations ?? [])
    .flatMap((image) => (image.evaluations ?? [])
      .map((check) => ({ check, assetLabel: basename(image.source) })));
  return [...textChecks, ...imageChecks];
}

export function adaptEvaluation(response = {}) {
  const entries = collectChecks(response).map(({ check, assetLabel }) => ({
    tone: toneOf(check.alignment),
    item: toItem(check, assetLabel),
  }));

  const itemsByTone = (tone) => entries
    .filter((entry) => entry.tone === tone)
    .map((entry) => entry.item);
  const failed = itemsByTone('negative');
  const passed = itemsByTone('positive');
  const notApplicable = itemsByTone('neutral');

  const summary = [
    { label: 'Failed', value: failed.length, tone: 'negative' },
    { label: 'Passed', value: passed.length, tone: 'positive' },
    ...(notApplicable.length
      ? [{ label: 'Not applicable', value: notApplicable.length, tone: 'neutral' }] : []),
  ];

  const sections = [
    ...(failed.length
      ? [{
        label: 'Failed checks', tone: 'negative', defaultOpen: true, items: failed,
      }] : []),
    ...(passed.length
      ? [{
        label: 'Passed checks', tone: 'positive', defaultOpen: false, items: passed,
      }] : []),
    ...(notApplicable.length
      ? [{
        label: 'Not applicable', tone: 'neutral', defaultOpen: false, items: notApplicable,
      }] : []),
  ];

  return {
    title: response.brand_name || 'Page evaluation',
    summary,
    sections,
  };
}
