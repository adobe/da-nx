export default function makeBatches(arr, size = 999) {
  return arr.reduce((acc, _, index) => {
    if (index % size === 0) acc.push(arr.slice(index, index + size));
    return acc;
  }, []);
}
