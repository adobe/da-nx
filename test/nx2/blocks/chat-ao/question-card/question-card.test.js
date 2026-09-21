import { expect } from '@esm-bundle/chai';
import '../../../../../nx2/blocks/chat-ao/question-card/question-card.js';

function makeQuestion(overrides = {}) {
  return {
    id: 'q1',
    header: 'Header',
    question: 'What?',
    multi_select: false,
    required: true,
    options: [{ label: 'A' }, { label: 'B', description: 'Option B' }],
    ...overrides,
  };
}

async function mount(pending) {
  const el = document.createElement('nx-question-card');
  el.pending = pending;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('nx-question-card', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when there is no pending question', async () => {
    const el = await mount(null);
    expect(el.shadowRoot.querySelector('form')).to.equal(null);
  });

  it('renders context, question text, and options with 1-indexed number hints', async () => {
    const el = await mount({ context: 'Some context', questions: [makeQuestion()] });
    const root = el.shadowRoot;
    expect(root.querySelector('.question-context').textContent.trim()).to.equal('Some context');
    expect(root.querySelector('.question-header').textContent.trim()).to.equal('Header');
    const numbers = [...root.querySelectorAll('.question-option-number')].map((n) => n.textContent.trim());
    // Two real options (1, 2) plus the trailing "Something else" (3).
    expect(numbers).to.deep.equal(['1', '2', '3']);
  });

  it('focuses the first option on first render — so Enter/number/Escape shortcuts work immediately', async () => {
    const el = await mount({ context: null, questions: [makeQuestion()] });
    const firstRadio = el.shadowRoot.querySelector('input[type="radio"]');
    expect(el.shadowRoot.activeElement).to.equal(firstRadio);
  });

  it('focuses the free-text input instead when the question has no options', async () => {
    const el = await mount({ context: null, questions: [makeQuestion({ options: [] })] });
    expect(el.shadowRoot.activeElement).to.equal(el.shadowRoot.querySelector('.question-other-input'));
  });

  it('selecting a radio option via native label click leaves Submit disabled until required questions are answered', async () => {
    const el = await mount({ context: null, questions: [makeQuestion()] });
    const submit = el.shadowRoot.querySelector('button[type="submit"]');
    expect(submit.disabled).to.equal(true);

    el.shadowRoot.querySelectorAll('input[type="radio"]')[0].click();
    await el.updateComplete;
    expect(submit.disabled).to.equal(false);
  });

  it('a single-select question clears the previous choice when a different option is picked', async () => {
    const el = await mount({ context: null, questions: [makeQuestion()] });
    const [first, second] = el.shadowRoot.querySelectorAll('input[type="radio"]');
    first.click();
    await el.updateComplete;
    second.click();
    await el.updateComplete;
    expect(first.checked).to.equal(false);
    expect(second.checked).to.equal(true);
  });

  it('a multi-select question allows more than one option checked at once', async () => {
    const question = makeQuestion({ multi_select: true, required: false });
    const el = await mount({ context: null, questions: [question] });
    const [first, second] = el.shadowRoot.querySelectorAll('input[type="checkbox"]');
    first.click();
    second.click();
    await el.updateComplete;
    expect(first.checked).to.equal(true);
    expect(second.checked).to.equal(true);
  });

  it('typing in the free-text input answers the question, and clearing it un-answers', async () => {
    const el = await mount({ context: null, questions: [makeQuestion()] });
    const submit = el.shadowRoot.querySelector('button[type="submit"]');
    const otherInput = el.shadowRoot.querySelector('.question-other-input');

    otherInput.value = 'my own answer';
    otherInput.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;
    expect(submit.disabled).to.equal(false);

    otherInput.value = '';
    otherInput.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;
    expect(submit.disabled).to.equal(true);
  });

  it('clicking Submit calls onSubmit with question_id/selected_options once every required question is answered', async () => {
    const el = await mount({ context: null, questions: [makeQuestion()] });
    let submitted = null;
    el.onSubmit = (answers) => { submitted = answers; };

    el.shadowRoot.querySelectorAll('input[type="radio"]')[1].click();
    await el.updateComplete;
    el.shadowRoot.querySelector('button[type="submit"]').click();

    expect(submitted).to.deep.equal([{ question_id: 'q1', selected_options: ['B'] }]);
  });

  it('clicking Skip calls onDecline without requiring any answer', async () => {
    const el = await mount({ context: null, questions: [makeQuestion()] });
    let declined = false;
    el.onDecline = () => { declined = true; };

    el.shadowRoot.querySelector('button[type="button"]').click();

    expect(declined).to.equal(true);
  });

  it('Enter on a focused option toggles it and auto-submits once the form is complete', async () => {
    const el = await mount({ context: null, questions: [makeQuestion()] });
    let submitted = null;
    el.onSubmit = (answers) => { submitted = answers; };

    const radio = el.shadowRoot.querySelectorAll('input[type="radio"]')[0];
    radio.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await el.updateComplete;

    expect(submitted).to.deep.equal([{ question_id: 'q1', selected_options: ['A'] }]);
  });

  it('a number key shortcut selects the matching option and submits when ready', async () => {
    const el = await mount({ context: null, questions: [makeQuestion()] });
    let submitted = null;
    el.onSubmit = (answers) => { submitted = answers; };

    el.shadowRoot.querySelector('.question-options')
      .dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
    await el.updateComplete;

    expect(submitted).to.deep.equal([{ question_id: 'q1', selected_options: ['B'] }]);
  });

  it('digits are ignored as shortcuts while typing in the free-text input', async () => {
    const el = await mount({ context: null, questions: [makeQuestion()] });
    const otherInput = el.shadowRoot.querySelector('.question-other-input');
    otherInput.focus();
    otherInput.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
    await el.updateComplete;

    const firstRadio = el.shadowRoot.querySelectorAll('input[type="radio"]')[0];
    expect(firstRadio.checked).to.equal(false);
  });

  it('the "something else" number shortcut focuses the text input when the form is not yet complete', async () => {
    const el = await mount({ context: null, questions: [makeQuestion()] });
    el.shadowRoot.querySelector('.question-options')
      .dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true }));
    await el.updateComplete;

    expect(el.shadowRoot.activeElement).to.equal(el.shadowRoot.querySelector('.question-other-input'));
  });

  it('clicking the number hint still toggles its option, via the label it sits inside', async () => {
    const question = makeQuestion({ multi_select: true, required: false });
    const el = await mount({ context: null, questions: [question] });
    const kbd = el.shadowRoot.querySelector('.question-option-number');
    kbd.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await el.updateComplete;

    const firstCheckbox = el.shadowRoot.querySelectorAll('input[type="checkbox"]')[0];
    expect(firstCheckbox.checked).to.equal(true);
  });

  it('clicking the "something else" number hint does nothing on its own', async () => {
    const el = await mount({ context: null, questions: [makeQuestion()] });
    const otherKbd = [...el.shadowRoot.querySelectorAll('.question-option-number')].at(-1);
    otherKbd.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await el.updateComplete;

    expect(el.shadowRoot.activeElement).to.not.equal(el.shadowRoot.querySelector('.question-other-input'));
    expect(el.shadowRoot.querySelector('input[aria-label="Custom answer"]').checked).to.equal(false);
  });

  it('Escape while typing in the free-text input moves focus to the first option instead of skipping', async () => {
    const el = await mount({ context: null, questions: [makeQuestion()] });
    let declined = false;
    el.onDecline = () => { declined = true; };

    const otherInput = el.shadowRoot.querySelector('.question-other-input');
    otherInput.focus();
    otherInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await el.updateComplete;

    expect(declined).to.equal(false);
    expect(el.shadowRoot.activeElement).to.equal(el.shadowRoot.querySelector('input[type="radio"]'));
  });

  it('Escape anywhere else calls onDecline (Skip)', async () => {
    const el = await mount({ context: null, questions: [makeQuestion()] });
    let declined = false;
    el.onDecline = () => { declined = true; };

    const radio = el.shadowRoot.querySelector('input[type="radio"]');
    radio.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(declined).to.equal(true);
  });

  it('resets selections and re-focuses when a new pending question replaces the old one', async () => {
    const el = await mount({ context: null, questions: [makeQuestion()] });
    el.shadowRoot.querySelectorAll('input[type="radio"]')[0].click();
    await el.updateComplete;

    el.pending = { context: null, questions: [makeQuestion({ id: 'q2', header: 'Second' })] };
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('.question-header').textContent.trim()).to.equal('Second');
    expect([...el.shadowRoot.querySelectorAll('input[type="radio"]')].every((r) => !r.checked)).to.equal(true);
  });
});
