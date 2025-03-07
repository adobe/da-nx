import { getMetadata } from '../../../scripts/nexter.js';

const MOCK_ORIGIN = 'https://main--da-block-collection--aemsites.aem.page';

export function calcOrigin() {
  const { origin: ogOrigin } = window.location;
  return ogOrigin.includes('localhost') ? MOCK_ORIGIN : ogOrigin;
}

export function calcUrl() {
  const { pathname } = window.location;
  const origin = calcOrigin();
  return `${origin}${pathname}`;
}

export function getExpDetails() {
  const name = getMetadata('experiment');
  if (!name) return null;

  const details = { name };

  const type = getMetadata('experiment-type');
  if (type) details.type = type;

  const goal = getMetadata('experiment-goal');
  if (goal) details.goal = goal;

  const startDate = getMetadata('experiment-start-date');
  if (startDate) details.startDate = startDate;

  const endDate = getMetadata('experiment-end-date');
  if (endDate) details.endDate = endDate;

  const status = getMetadata('experiment-status');
  if (status) details.status = status;

  // Add the control to the variants
  details.variants = [{ url: calcUrl() }];

  // Get the percentages
  const split = getMetadata('experiment-split')?.split(',');

  // Match percentages to challenger URLs
  const challengers = getMetadata('experiment-variants')?.split(',').map((path, idx) => {
    const challenger = { url: path.trim() };

    // Only add percent if its in the experiment
    if (split) challenger.percent = Number(split?.[idx] || 0);
    return challenger;
  }) || [];

  if (split) {
    // Total the percentage up
    const challPercent = challengers.reduce(
      (total, variant) => (variant.percent ? total + variant.percent : total),
      0,
    );

    // Update the control with the percentage left over
    details.variants[0].percent = 100 - challPercent;
  }

  // Push everything together
  if (challengers.length > 0) details.variants.push(...challengers);

  // Set an even percent if no split
  if (!split) {
    details.variants.forEach((variant) => {
      variant.percent = Math.round(100 / details.variants.length);
    });
  }

  return details;
}

export function makeDraggable(el) {
  let pos1 = 0;
  let pos2 = 0;
  let pos3 = 0;
  let pos4 = 0;

  function closeDragElement() {
    // Remove event listeners when done dragging
    document.onmouseup = null;
    document.onmousemove = null;
  }

  function elementDrag(e) {
    e.preventDefault();

    // Calculate new position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // Set parent element's new position
    el.style.top = `${el.offsetTop - pos2}px`;
    el.style.left = `${el.offsetLeft - pos1}px`;
  }

  function dragMouseDown(e) {
    e.preventDefault();
    // Get mouse position at startup
    pos3 = e.clientX;
    pos4 = e.clientY;
    // Add event listeners for mouse movement and release
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  el.querySelector('#aem-sidekick-exp-handle').onmousedown = dragMouseDown;
}
