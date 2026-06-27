export const manifest = {
  id: 'docx-to-markdown',
  entry: 'convert',
  runtimes: ['js'],
  capabilities: [],
  timeoutMs: 5000,
  input: { /* doc: { bytesBase64: string } */ },
  output: { /* doc: { markdown: string } */ },
};
