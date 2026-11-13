export const calls = [];

export default function prose2aem(...args) {
  calls.push(args);
  return `<main><div>${args[0].innerHTML}</div></main>`;
}
