export default function makeBatches(arr, n = 50) {
  const batchSize = Math.ceil(arr.length / n);
  const size = Math.ceil(arr.length / batchSize);
  return Array.from({ length: batchSize }, (v, i) => arr.slice(i * size, i * size + size));
}
