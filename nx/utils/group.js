// A utility to assist converting large arrays into groups of a certain size.
// export default function makeGroups(items, size = 10) {
//   const groups = [];
//   while (items.length) {
//     groups.push(items.splice(0, size));
//   }
//   return groups;
// }

export default function makeGroups(arr, n) {
  const size = Math.ceil(arr.length / n);
  return Array.from({ length: n }, (v, i) => arr.slice(i * size, i * size + size));
}
