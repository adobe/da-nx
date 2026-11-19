// Answers the cards-filter search for the <nx-action-card> children of `container`.
// Hiding is done here, outside the card: blocks style `nx-action-card[hidden]`.
const matches = ({ card, query }) => `${card.heading ?? ''} ${card.description ?? ''}`
  .toLowerCase().includes(query);

// eslint-disable-next-line import/prefer-default-export
export function attachCardSearch(container) {
  document.addEventListener('nx-cards-filter', ({ detail }) => {
    if (!container.isConnected) return;
    const query = (detail?.query ?? '').trim().toLowerCase();
    const cards = [...container.querySelectorAll(':scope > nx-action-card')];
    const count = cards.reduce((acc, card) => {
      const match = !query || matches({ card, query });
      card.hidden = !match;
      return match ? acc + 1 : acc;
    }, 0);
    const section = container.closest('.section') ?? container.parentElement;
    detail?.results?.push({ section, count });
  });
  document.dispatchEvent(new CustomEvent('nx-cards-ready'));
}
