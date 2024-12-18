/* eslint-disable max-len */

let dntConfigGlobal;
const ALT_TEXT_PLACEHOLDER = '*alt-placeholder*';

const getHtmlSelector = (blockscope, blockConfig) => {
  const getChildSelector = (indexStr) => {
    if (indexStr === '*' || Number.isNaN(indexStr)) {
      return ' > div';
    }
    const index = Number(indexStr);
    return index > 0 ? ` > div:nth-child(${index})` : ` > div:nth-last-child(${Math.abs(index)})`;
  };

  if (blockscope === 'noblock') {
    return 'body > div';
  }
  const blockSelector = `.${blockscope.toLowerCase().replace(/\s+/g, ' ').trim().replaceAll(' ', '-')}`;
  const column = blockConfig.column.trim();
  const row = blockConfig.row.trim();
  if (column === '*' && row === '*') {
    return blockSelector;
  }
  const rowSelector = getChildSelector(row);
  const columnSelector = getChildSelector(column);
  return `${blockSelector}${rowSelector}${columnSelector}`;
};

const doFetchDntConfig = async () => {
  const extractPattern = (rule) => {
    const { pattern } = rule;
    let condition = 'exists';
    let match = '*';
    if (pattern && pattern.length > 0) {
      if (pattern !== '*' && pattern.includes('(') && pattern.includes(')')) {
        condition = pattern.substring(0, pattern.indexOf('(')).trim();
        match = (pattern.substring(pattern.indexOf('(') + 1, pattern.indexOf(')')).split('||')).map((item) => item.trim());
      }
    }
    return { condition, match };
  };

  // TODO: Each consumer can have additional DNT blocks/content hence have merge logic in place
  const dntConfigPath = 'https://main--milo--adobecom.hlx.page/.milo/dnt-config.json';
  const dntConfig = new Map();
  const dntConfigContent = await fetchText(dntConfigPath, runtime);
  if (dntConfigContent === '') {
    console.error('DNT Config unavailable.');
    return dntConfig;
  }
  const dntConfigJson = JSON.parse(dntConfigContent);

  // Docx Rule Set
  dntConfig.set('docxRules', new Map());
  const docxRules = dntConfig.get('docxRules');
  dntConfigJson.docxRules.data.forEach((dntBlock) => {
    const blockScopeArray = dntBlock.block_scope.split(',');
    blockScopeArray.forEach((blockScope) => {
      const selector = getHtmlSelector(blockScope.trim(), dntBlock);
      const patternInfo = extractPattern(dntBlock);
      const config = { ...patternInfo, action: dntBlock.action };
      if (docxRules.has(selector)) {
        docxRules.get(selector).push(config);
      } else {
        docxRules.set(selector, [config]);
      }
    });
  });

  // Docx Content Set
  dntConfig.set('docxContent', []);
  const docxContent = dntConfig.get('docxContent');
  dntConfigJson.docxContent.data.forEach((dntContent) => {
    docxContent.push(dntContent.content);
  });

  // XLSX Rule Set
  dntConfig.set('xlsxRules', []);
  const xlsxRules = dntConfig.get('xlsxRules');
  dntConfigJson.xlsxRules.data.forEach((xlsxRule) => {
    xlsxRules.push(extractPattern(xlsxRule));
  });
  return dntConfig;
};

const getDntConfig = async () => {
  if (!dntConfigGlobal) {
    dntConfigGlobal = await doFetchDntConfig();
  }
};

const setDntAttribute = (el) => {
  el.setAttribute('translate', 'no');
};

const addDntAttribute = (selector, operations, document) => {
  document.querySelectorAll(selector).forEach((element) => {
    operations.forEach((operation) => {
      const dntElement = operation.action === 'dnt-row' ? element.parentNode : element;
      if (operation.condition === 'exists') {
        setDntAttribute(dntElement);
      } else {
        const matchTexts = operation.match;
        const elementText = element.textContent;
        if (
          (operation.condition === 'equals' && matchTexts.includes(elementText)) ||
          (operation.condition === 'beginsWith' && matchTexts.some((matchText) => elementText.startsWith(matchText))) ||
          (operation.condition === 'has' && matchTexts.every((matchText) => element.querySelector(matchText)))
        ) {
          setDntAttribute(dntElement);
        }
      }
    });
  });
};

const addDntWrapper = (node, dntContent) => {
  node.innerHTML = node.innerHTML.replaceAll(dntContent, `<span translate="no" class="dnt-text">${dntContent}</span>`);
};

const findAndAddDntWrapper = (document, dntContent) => {
  const contentMatches = document.evaluate(`//text()[contains(., "${dntContent}")]/..`, document, null, 0, null);
  // eslint-disable-next-line no-underscore-dangle
  contentMatches?._value?.nodes.forEach((node) => {
    addDntWrapper(node, dntContent);
  });
};

const processAltText = (document) => {
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

const addDntInfoToHtml = async (html) => {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  dntConfigGlobal.get('docxRules').forEach((operations, selector) => {
    addDntAttribute(selector, operations, document);
  });
  dntConfigGlobal.get('docxContent').forEach((content) => {
    findAndAddDntWrapper(document, content);
  });
  processAltText(document);
  return dom.serialize();
};

const getPageInfo = async (previewPath) => {
  const path = previewPath.replace(/\/$/, '/index');
  const htmlUrl = `${path}.plain.html`;
  const mdUrl = `${path}.md`;
  const html = await fetchText(htmlUrl, runtime);
  const md = await fetchText(mdUrl, runtime);
  return { html, md };
};

const getHtml = (blockMdast) => {
  if (!blockMdast) {
    return '';
  }
  console.info(`blockMdast: ${blockMdast}`);
  const hast = mdast2hast(blockMdast, {
    handlers: {
      ...defaultHandlers,
      [TYPE_TABLE]: mdast2hastGridTablesHandler(),
    },
    allowDangerousHtml: true,
  });
  const wrappedHast = {
    type: 'element',
    tagName: 'div',
    properties: {},
    children: [raw(hast)],
  };
  const blockInfo = { content: { hast: wrappedHast } };
  createPageBlocks(blockInfo);
  return toHtml(blockInfo.content.hast);
};

const getPageLevelMetadata = async (md) => {
  const mdast = await getMdastFromMd(md);
  const metadataNode = find(mdast, (node) => node?.type === 'gridTable' && find(node, (child) => child?.type === 'text' && (child?.value === 'Metadata' || child?.value === 'metadata')));
  return getHtml(metadataNode);
};

const htmlWithDnt = async (path) => {
  const { html, md } = await getPageInfo(path);
  const pageLevelMetadata = await getPageLevelMetadata(md);
  return addDntInfoToHtml(`<main>${html}${pageLevelMetadata}</main>`);
};

const fixAnchors = (document) => {
  const slugger = new IDSlugger();
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach((heading) => {
    const processedHeadingTxt = slugger.slug(heading.textContent.trim());
    const headingId = heading.id;
    if (headingId && headingId !== processedHeadingTxt) {
      heading.id = processedHeadingTxt;
      const anchors = document.querySelectorAll(`a[href='#${headingId}']`);
      anchors.forEach((anchor) => {
        anchor.href = `#${processedHeadingTxt}`;
      });
    }
  });
};

const unwrapDntContent = (document) => {
  document.querySelectorAll('.dnt-text').forEach((dntSpan) => {
    const spanParent = dntSpan.parentNode;
    const textBefore = document.createTextNode(dntSpan.textContent);
    const textAfter = document.createTextNode('');

    spanParent.replaceChild(textAfter, dntSpan);
    spanParent.insertBefore(textBefore, textAfter);
    spanParent.normalize();
  });
};

const resetAltText = (document) => {
  document.querySelectorAll('img[dnt-alt-content]').forEach((img) => {
    img.setAttribute('alt', `${img.getAttribute('dnt-alt-content').replace(ALT_TEXT_PLACEHOLDER, img.getAttribute('alt'))}`);
    img.removeAttribute('dnt-alt-content');
  });
};

const fixImageSize = (document) => {
  const imgs = document.querySelectorAll('img');
  imgs.forEach((img) => {
    const imgURL = new URL(img.src);
    img.src = `${imgURL.origin}${imgURL.pathname}`;
  });
};

const fixRelativeLinks = (document, domain) => {
  document.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href.startsWith('/')) {
      a.setAttribute('href', `${domain}${href}`);
    }
  });
};

const postProcessHtml = (html, project) => {
  const domain = `https://${project.getHlxPageSubDomain()}`;
  const htmlWithMediaUrls = html.replaceAll('./media_', `${domain}/media_`);
  const dom = new JSDOM(htmlWithMediaUrls);
  const { document } = dom.window;
  fixAnchors(document);
  unwrapDntContent(document);
  resetAltText(document);
  // MWPW-151193
  fixRelativeLinks(document, domain);
  fixImageSize(document);
  return dom.serialize();
};

const json2html = async (url) => {
  const json = await fetchPreviewContent(url, runtime);
  const dom = new JSDOM();
  const { document } = dom.window;

  const defaultDntConfig = { sheets: [], sheetToColumns: new Map(), universalColumns: [] };
  const isTextInDntRules = (text) =>
    dntConfigGlobal.get('xlsxRules').some((rule) => {
      if (rule.condition === 'exists') {
        return true;
      }
      const matchTexts = rule.match;
      return (rule.condition === 'equals' && matchTexts.includes(text)) || (rule.condition === 'beginsWith' && matchTexts.some((matchText) => text.startsWith(matchText)));
    });

  const createDataDiv = (dataJson, name, dntInfo) => {
    let isDntAttributeSet = false;
    const { sheets, sheetToColumns, universalColumns } = dntInfo;
    const { total, offset, limit, data } = dataJson;
    const div = document.createElement('div');
    div.setAttribute('total', total);
    div.setAttribute('offset', offset);
    div.setAttribute('limit', limit);
    div.setAttribute('name', name);
    div.setAttribute('data-type', 'sheet');
    if (sheets.includes(name)) {
      setDntAttribute(div);
      isDntAttributeSet = true;
    }
    if (data?.length > 0) {
      data.forEach((jsonObject) => {
        const rowDiv = div.appendChild(document.createElement('div'));
        rowDiv.setAttribute('data-type', 'row');
        const shouldRowBeTranslated = Object.hasOwn(jsonObject, ':translate') && jsonObject[':translate'] && jsonObject[':translate'] === 'yes';
        let isRowSetAsDnt = false;
        if (!shouldRowBeTranslated) {
          setDntAttribute(rowDiv);
          isRowSetAsDnt = true;
        }
        const keys = Object.keys(jsonObject);
        keys.forEach((key) => {
          const colDiv = rowDiv.appendChild(document.createElement('div'));
          const text = jsonObject[key];
          if (!isDntAttributeSet && !isRowSetAsDnt && (universalColumns.includes(key) || (sheetToColumns.has(name) && sheetToColumns.get(name).includes(key)) || isTextInDntRules(text))) {
            setDntAttribute(colDiv);
          }
          colDiv.setAttribute('key', key);
          colDiv.setAttribute('data-type', 'col');
          if (text.includes('|')) {
            colDiv.setAttribute('segmented', 'yes');
            text.split('|').forEach((splitText) => {
              const segmentSpan = colDiv.appendChild(document.createElement('p'));
              segmentSpan.textContent = splitText.trim();
            });
          } else {
            colDiv.textContent = text;
          }
        });
      });
    }
    document.body.appendChild(div);
  };

  const getDntInfo = (dntJson) => {
    const dntInfo = defaultDntConfig;
    const { data } = dntJson;
    if (data?.length > 0) {
      dntInfo.sheets.push(['dnt', 'non-default']);
      dntInfo.universalColumns.push(...[':translate', ':rollout', ':uid', ':regional']);
      data.forEach((jsonObject) => {
        const dntSheet = jsonObject['dnt-sheet'];
        const dntColumnsStr = jsonObject['dnt-columns'];
        if (dntColumnsStr === '*') {
          dntInfo.sheets.push(dntSheet);
        } else {
          const dntColumns = dntColumnsStr.split(',');
          if (dntSheet === '*') {
            dntInfo.universalColumns.push(...dntColumns);
          } else {
            dntInfo.sheetToColumns.set(dntSheet, dntColumns);
          }
        }
      });
    }
    return dntInfo;
  };
  if (isMultiSheet(json)) {
    const dntInfo = json?.dnt ? getDntInfo(json.dnt) : defaultDntConfig;
    json[':names'].sort().forEach((name) => {
      createDataDiv(json[name], name, dntInfo);
    });
  } else {
    createDataDiv(json, 'default', defaultDntConfig);
  }
  return dom.serialize();
};

const html2json = async (html) => {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const sheets = document.querySelectorAll('body > div[data-type="sheet"]');
  const isSingleSheet = sheets.length === 1;
  const jsonData = {};
  jsonData[':type'] = isSingleSheet ? 'sheet' : 'multi-sheet';
  jsonData[':names'] = [];
  sheets.forEach((sheet) => {
    const name = sheet.getAttribute('name');
    let jsonElement = jsonData;
    if (!isSingleSheet) {
      jsonData[':names'].push(name);
      jsonData[name] = {};
      jsonElement = jsonData[name];
    }
    jsonElement.total = sheet.getAttribute('total');
    jsonElement.offset = sheet.getAttribute('offset');
    jsonElement.limit = sheet.getAttribute('limit');
    jsonElement.data = [];
    sheet.querySelectorAll('div[data-type="row"]').forEach((row) => {
      const columns = row.children;
      const columnsArray = Array.from(columns);
      const columnJson = {};
      columnsArray.forEach((column) => {
        let value = column.textContent;
        if (column.getAttribute('segmented') === 'yes') {
          const segmentParagraphs = column.children;
          const segmentParagraphArray = Array.from(segmentParagraphs).map((el) => el.textContent);
          value = segmentParagraphArray.join(' | ');
        }
        columnJson[column.getAttribute('key')] = value;
      });
      jsonElement.data.push(columnJson);
    });
  });
  return JSON.stringify(jsonData);
};

const html2excel = async (html) => {
  const json = await html2json(html);
  return json2excel(JSON.parse(json));
};

export const convertToHtml = async (document) => {
  const path = document.url.sourcePreview();
  await getDntConfig();
  console.info(`DNT config read for path ${path} Docx Rules Config length ${dntConfigGlobal.get('docxRules').size}`);
  const html = document.isExcel() ? await json2html(path) : await htmlWithDnt(path);
  if (html) {
    console.info(`Path ${path} has dnt attribute: ${html.includes('translate="no"')}`);
    await runtime.filesWrapper.writeFile(`${document.storage.source()}.html`, html);
    console.info(`HTML has been stored: ${document.storage.source()}.html`);
  } else {
    console.warn(`No data for ${document.storage.fileName()}`);
  }
};

export const buildDocument = async (document, storagePath, project) => {
  const htmlContent = (await filesWrapper.readFileIntoBuffer(`${storagePath}.html`)).toString();
  const content = document.isExcel() ? await html2excel(htmlContent) : await html2docx(htmlContent, document, project);
  console.info(`New Document has been stored: ${storagePath}`);
  await filesWrapper.writeFile(storagePath, content);
};
