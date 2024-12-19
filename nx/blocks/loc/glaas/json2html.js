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
