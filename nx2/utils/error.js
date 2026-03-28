/* eslint-disable no-console */
export default async function error(ex, el) {
  console.log(ex);
  if (el) console.log(el);
}
