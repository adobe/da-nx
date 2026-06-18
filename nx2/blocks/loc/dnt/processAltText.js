const ALT_TEXT_PLACEHOLDER = '*alt-placeholder*';

const setDntAttribute = (el) => {
  el.setAttribute('translate', 'no');
};

export const processAltText = (document, addDntWrapper) => {
  const hasPipe = (text) => text && text.includes('|');
  const hasUrl = (text) => text && ['http://', 'https://'].some((matchText) => text.startsWith(matchText));
  const getAltTextDntInfo = (text) => {
    const textHasUrl = hasUrl(text);
    const textHasPipe = hasPipe(text);
    if (textHasUrl && !textHasPipe) {
      return { alt: null, dnt: text };
    }
    if (textHasUrl && textHasPipe) {
      const urlAndAltText = text.split('|');
      if (urlAndAltText.length >= 2) {
        const altText = urlAndAltText[1].trim();
        const altPlaceholder = urlAndAltText[1].replace(altText, ALT_TEXT_PLACEHOLDER);
        const suffix = urlAndAltText.length > 2 ? `|${urlAndAltText.slice(2, urlAndAltText.length).join('|')}` : '';
        return { alt: altText, dnt: `${urlAndAltText[0]}|${altPlaceholder}${suffix}` };
      }
    }
    return { alt: text, dnt: null };
  };

  document.querySelectorAll('a').forEach((element) => {
    const elementText = element.textContent;
    const { alt, dnt } = getAltTextDntInfo(element.textContent);
    if (dnt) {
      if (alt) {
        addDntWrapper(element, elementText.substring(0, dnt.indexOf(ALT_TEXT_PLACEHOLDER)));
        const altTextSuffix = elementText.substring(dnt.indexOf(ALT_TEXT_PLACEHOLDER) + alt.length);
        if (altTextSuffix) {
          addDntWrapper(element, altTextSuffix);
        }
      } else setDntAttribute(element);
    }
  });

  document.querySelectorAll('img').forEach((img) => {
    const { alt, dnt } = getAltTextDntInfo(img.getAttribute('alt'));
    if (dnt) {
      img.setAttribute('dnt-alt-content', dnt);
      if (alt) img.setAttribute('alt', alt);
      else img.removeAttribute('alt');
    }
  });
};

export const resetAltText = (document) => {
  document.querySelectorAll('img[dnt-alt-content]').forEach((img) => {
    img.setAttribute('alt', `${img.getAttribute('dnt-alt-content').replace(ALT_TEXT_PLACEHOLDER, img.getAttribute('alt'))}`);
    img.removeAttribute('dnt-alt-content');
  });
};
