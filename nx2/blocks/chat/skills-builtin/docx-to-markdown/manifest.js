export const manifest = {
  id: 'docx-to-markdown',
  entry: 'convert',
  runtimes: ['js'],
  capabilities: [],
  dependencies: ['fflate'],
  timeoutMs: 5000,
  input: { /* doc: { bytesBase64: string } */ },
  output: { /* doc: { markdown: string } */ },
};
