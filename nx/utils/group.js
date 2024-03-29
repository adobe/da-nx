// A utility to assist converting large arrays into groups of a certain size.
export default function makeGroups(items, size = 10) {
  const groups = [];
  while (items.length) {
    groups.push(items.splice(0, size));
  }
  return groups;
}
