const setDntAttribute = (el) => {
  el.setAttribute('translate', 'no');
};

const extractNonDataKeys = (obj) => {
  const { data, ...nonDataKeys } = obj; // Destructure to exclude 'data'
  return JSON.stringify(nonDataKeys); // Serialize the remaining keys
};

const json2html = (json, dntConfig) => {
  const defaultDntConfig = { sheets: [], sheetToColumns: new Map(), universalColumns: [] };
  const isTextInDntRules = (text) => dntConfig
    .get('sheetRules').some((rule) => {
      if (rule.condition === 'exists') {
        return true;
      }
      const matchTexts = rule.match;
      return (rule.condition === 'equals' && matchTexts.includes(text)) || (rule.condition === 'beginsWith' && matchTexts.some((matchText) => text.startsWith(matchText)));
    });

  const createSheetDiv = (dataJson, name, dntInfo) => {
    let isDntAttributeSet = false;
    const { sheets, sheetToColumns, universalColumns } = dntInfo;
    const { data } = dataJson;
    const div = document.createElement('div');
    const sheetAttrs = extractNonDataKeys(dataJson);
    div.setAttribute('sheet-attrs', sheetAttrs);
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
          if (!isDntAttributeSet
            && !isRowSetAsDnt
            && (universalColumns.includes(key)
              || (sheetToColumns.has(name) && sheetToColumns.get(name).includes(key))
              || isTextInDntRules(text))
          ) {
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
    return div;
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

  const html = document.createElement('html');
  const body = document.createElement('body');
  html.appendChild(body);

  const jsonCopy = { ...json };

  if (jsonCopy[':type'] === 'multi-sheet') {
    const dntInfo = jsonCopy?.dnt ? getDntInfo(jsonCopy.dnt) : defaultDntConfig;
    jsonCopy[':names'].sort().forEach((name) => {
      body.appendChild(createSheetDiv(jsonCopy[name], name, dntInfo));
      delete jsonCopy[name];
    });
  } else {
    body.appendChild(createSheetDiv(jsonCopy, 'default', defaultDntConfig));
    delete jsonCopy.data;
  }

  // Save any remaining top-level attributes
  delete jsonCopy[':type'];
  delete jsonCopy[':names'];
  body.setAttribute('top-attrs', JSON.stringify(jsonCopy));

  return html;
};

const html2json = (html) => {
  const parser = new DOMParser();
  const htmlDom = parser.parseFromString(html, 'text/html');

  const sheets = htmlDom.querySelectorAll('body > div[data-type="sheet"]');
  const isSingleSheet = sheets.length === 1;
  const jsonData = {};

  const topLevelAttrs = JSON.parse(htmlDom.body.getAttribute('top-attrs'));
  if (topLevelAttrs) {
    Object.assign(jsonData, topLevelAttrs);
  }

  jsonData[':type'] = isSingleSheet ? 'sheet' : 'multi-sheet';
  if (!isSingleSheet) {
    jsonData[':names'] = [];
  }
  sheets.forEach((sheet) => {
    const name = sheet.getAttribute('name');
    let jsonElement = jsonData;
    if (!isSingleSheet) {
      jsonData[':names'].push(name);
      jsonData[name] = {};
      jsonElement = jsonData[name];
    }
    const sheetAttrs = JSON.parse(sheet.getAttribute('sheet-attrs'));
    Object.assign(jsonElement, sheetAttrs);
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

export { json2html, html2json };
