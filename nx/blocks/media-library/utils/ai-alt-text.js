// nx/blocks/media-library/utils/ai-alt-text.js

const AI_ALT_TEXT_WORKER = 'https://helix-image-alt.aem-poc-lab.workers.dev';

/**
 * Clean extracted context by removing technical noise
 * @param {string} context - Raw context text
 * @returns {string} Cleaned context
 */
function cleanContextForAI(context) {
  return context
    .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
    .replace(/#[0-9A-Fa-f]{6}/g, '') // Remove hex colors
    .replace(/~~[^~]+~~/g, '') // Remove CTA markup like ~~TRY US TODAY~~
    .replace(/:{1,2}[a-z0-9-]+:{1,2}/gi, '') // Remove icon references like :logo-amc: or ::icon::
    .replace(/\{[^}]+\}/g, '') // Remove template variables like {smoke}, {66}
    .replace(/Background Color|Foreground|CTA|Offer Details|Sub Headline|Headline|Background Scroll Into Header|Scroll Into Header|Background|Orange \d+\+|Blue \d+\+/gi, '') // Remove metadata labels
    .replace(/\[TITLE\]/gi, '') // Remove [TITLE] markers
    .replace(/\btrue\b|\bfalse\b/gi, '') // Remove boolean values
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\.\s*\./g, '.') // Remove double periods
    .trim();
}

/**
 * Extract relevant text context surrounding an image in HTML
 * @param {string} htmlContent - HTML document content
 * @param {string} imageUrl - Image URL to find
 * @returns {string} Cleaned context text
 */
export function extractImageContext(htmlContent, imageUrl) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    const imageName = imageUrl.split('/').pop().split('?')[0];
    const imgElements = doc.querySelectorAll('img');
    const contextParts = [];

    for (const img of imgElements) {
      const src = img.getAttribute('src') || '';
      const srcWithoutParams = src.split('?')[0];

      // More flexible matching: check if src ends with the image name or contains the full URL
      if (srcWithoutParams.endsWith(imageName)
          || src.includes(imageUrl)
          || srcWithoutParams.includes(imageName)) {
        // Check for existing alt text or title
        const existingAlt = img.getAttribute('alt');
        const existingTitle = img.getAttribute('title');
        if (existingAlt && existingAlt.trim() && existingAlt !== 'null' && existingAlt.length > 5) {
          contextParts.push(`Image alt: ${existingAlt}`);
        }
        if (existingTitle && existingTitle.trim() && existingTitle.length > 5) {
          contextParts.push(`Image title: ${existingTitle}`);
        }

        // Check for figure caption
        const figure = img.closest('figure');
        if (figure) {
          const figcaption = figure.querySelector('figcaption');
          if (figcaption && figcaption.textContent?.trim()) {
            contextParts.push(`Caption: ${figcaption.textContent.trim()}`);
          }
        }

        // Get surrounding context from parent section
        const section = img.closest('div, section, article, main');

        if (section) {
          // Get headings
          const heading = section.querySelector('h1, h2, h3, h4, h5, h6');
          if (heading && heading.textContent?.trim()) {
            contextParts.push(heading.textContent.trim());
          }

          // Get paragraphs
          const paragraphs = section.querySelectorAll('p');
          paragraphs.forEach((p) => {
            const text = p.textContent?.trim();
            if (text && !text.includes('function') && text.length > 10) {
              contextParts.push(text);
            }
          });

          // Get list items
          const listItems = section.querySelectorAll('li');
          listItems.forEach((li) => {
            const text = li.textContent?.trim();
            if (text && text.length > 10) {
              contextParts.push(text);
            }
          });
        }

        // Fallback to parent element text nodes
        if (contextParts.length === 0) {
          const parent = img.parentElement;
          if (parent) {
            const text = Array.from(parent.childNodes)
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.textContent?.trim())
              .filter(Boolean)
              .join(' ');
            if (text) {
              contextParts.push(text);
            }
          }
        }

        // Additional fallback: get any nearby text from section
        if (contextParts.length === 0 && section) {
          const allText = section.textContent;
          const cleanText = allText?.trim().replace(/\s+/g, ' ');
          if (cleanText && cleanText.length > 20) {
            contextParts.push(cleanText.substring(0, 500));
          }
        }

        // Last resort: look for any text in the whole document near the image
        if (contextParts.length === 0) {
          const bodyText = doc.body.textContent?.trim().replace(/\s+/g, ' ');
          if (bodyText && bodyText.length > 20) {
            contextParts.push(bodyText.substring(0, 500));
          }
        }

        break;
      }
    }

    // Clean up and join context parts
    const rawContext = contextParts.slice(0, 3).join('. ').substring(0, 500);

    // Filter out noise using cleaning function
    const cleanedContext = cleanContextForAI(rawContext);

    // Return empty string instead of placeholder message - let the AI work without context
    return cleanedContext || '';
  } catch (error) {
    return '';
  }
}

/**
 * Generate alt text using AI worker
 * @param {string} imageUrl - Full image URL
 * @param {string} context - Image context
 * @returns {Promise<string>} Generated alt text
 */
export async function generateAltTextFromAI(imageUrl, context) {
  const response = await fetch(AI_ALT_TEXT_WORKER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageUrl, context }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Worker error: ${response.status}`);
  }

  const { altText } = await response.json();
  return altText || '';
}

