// Test fixture — sample skill script body; the real skill lives in the GH marketplace.

function unescapeXml(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

function extractTextFromXml(xml) {
  const paragraphs = xml.split('</w:p>');
  return paragraphs
    .map((para) => {
      const matches = [...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)];
      return matches.map((m) => unescapeXml(m[1])).join('');
    })
    .filter((line) => line.trim())
    .join('\n');
}

export async function convert({ bytesBase64 }, host) {
  // fflate is injected by the host — not imported — so this skill stays host-independent
  const { unzipSync, strFromU8 } = host.deps.fflate;

  // Decode base64 to Uint8Array
  const binaryStr = atob(bytesBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i += 1) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  let files;
  try {
    files = unzipSync(bytes);
  } catch (err) {
    throw new Error(`Failed to unzip docx: ${err.message}`);
  }

  const xmlFiles = ['word/document.xml', 'word/header1.xml', 'word/footer1.xml'];
  const parts = [];

  for (const name of xmlFiles) {
    if (files[name]) {
      host.log(`extracting ${name}`);
      const xml = strFromU8(files[name]);
      const text = extractTextFromXml(xml);
      if (text) parts.push(text);
    }
  }

  const markdown = parts.join('\n\n');
  return { markdown };
}
