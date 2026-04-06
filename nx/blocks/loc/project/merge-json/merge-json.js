function getJsonElementByKeyValue(jsonArray, key, value) {
  return jsonArray.find((data) => data[key] === value);
}

/**
 * Merge one sheet's source and destination data by :uid / :rollout / :regional.
 * If both sides have rows but :uid / :rollout are not configured, uses source (overwrite).
 * @returns {{ mergedJson }}
 */
function compareAndMergeDataJson(sourceJson, destinationJson) {
  if (sourceJson && !destinationJson) {
    return { mergedJson: sourceJson };
  }
  if (!sourceJson && destinationJson) {
    return { mergedJson: destinationJson };
  }
  const srcData = sourceJson?.data;
  const destData = destinationJson?.data;
  if (!srcData || srcData.length === 0) {
    return { mergedJson: destData?.length > 0 ? destinationJson : sourceJson };
  }

  const filteredRow = (row) => {
    const configKeys = [':translate', ':rollout', ':uid'];
    const rowCopy = { ...row };
    configKeys.forEach((key) => delete rowCopy[key]);
    return rowCopy;
  };

  const canRollout = (srcRow) => srcRow[':rollout'] && srcRow[':rollout'].toLowerCase() === 'yes';
  const shouldRollout = (srcRow, destRow) => {
    const isRegional = destRow[':regional'] && destRow[':regional'].toLowerCase() === 'yes';
    return canRollout(srcRow) && !isRegional;
  };

  if (srcData.length > 0 && destData?.length > 0) {
    const srcFirstRow = srcData[0];
    const uid = srcFirstRow[':uid'];
    const isRolloutBehaviourConfigured = Object.hasOwn(srcFirstRow, ':rollout');
    if (uid === ':override') {
      return { mergedJson: sourceJson };
    }
    if (!uid || !isRolloutBehaviourConfigured) {
      return { mergedJson: sourceJson };
    }
    const mergedJson = {};
    mergedJson.data = [];
    destData.forEach((destRow) => {
      const destUID = destRow[uid];
      const srcRow = getJsonElementByKeyValue(srcData, uid, destUID);
      if (srcRow) {
        if (!isRolloutBehaviourConfigured || shouldRollout(srcRow, destRow)) {
          mergedJson.data.push(filteredRow(srcRow));
        } else {
          mergedJson.data.push(destRow);
        }
        srcRow[':processed'] = true;
      } else {
        destRow[':regional'] = 'yes';
        mergedJson.data.push(destRow);
      }
    });
    srcData
      .filter((data) => !Object.hasOwn(data, ':processed') && canRollout(data))
      .forEach((row) => mergedJson.data.push(filteredRow(row)));
    return { mergedJson };
  }
  return { mergedJson: destinationJson };
}

/**
 * Merge :private by key: union of keys from source[':private'] and destination[':private'],
 * pass-through per key (source wins when present, else destination).
 */
function handlePrivateSheets(source, destination, finalJsonWithStatus) {
  const srcPrivate = source?.[':private'] && typeof source[':private'] === 'object' ? source[':private'] : {};
  const destPrivate = destination?.[':private'] && typeof destination[':private'] === 'object' ? destination[':private'] : {};
  const privateKeys = Array.from(
    new Set([...Object.keys(srcPrivate), ...Object.keys(destPrivate)]),
  );
  if (privateKeys.length === 0) return;
  const mergedPrivate = {};
  privateKeys.sort().forEach((key) => {
    const fromSrc = srcPrivate[key];
    const fromDest = destPrivate[key];
    mergedPrivate[key] = fromSrc ?? fromDest;
  });
  finalJsonWithStatus.finalJson[':private'] = mergedPrivate;
}

/**
 * Merge multi-sheet source and destination JSON. Pass-through for dnt / non-default sheets.
 * Preserves :private via handlePrivateSheets (source ?? dest per key).
 * @returns {{ error: boolean, errorMessage?: string, finalJson: object }}
 */
function getMergedJson(source, destination) {
  const finalJsonWithStatus = { error: false, finalJson: { ':names': [], ':type': 'sheet' } };
  const addToFinalJson = (mergedJsonWithStatus, name) => {
    if (!mergedJsonWithStatus.error) {
      finalJsonWithStatus.finalJson[':names'].push(name);
      finalJsonWithStatus.finalJson[name] = mergedJsonWithStatus.mergedJson;
      return true;
    }
    finalJsonWithStatus.error = true;
    finalJsonWithStatus.errorMessage = mergedJsonWithStatus.errorMessage;
    return false;
  };

  const defaultName = ['default'];
  const sourceSheetNames = source[':names'] ?? defaultName;
  const destinationSheetNames = destination[':names'] ?? defaultName;
  const sheetNames = Array.from(new Set([...sourceSheetNames, ...destinationSheetNames]));
  const getSheetJson = (name, json) => (
    sheetNames.length === 1 && name === 'default' && json?.[':type'] === 'sheet'
      ? json
      : json?.[name]
  );

  sheetNames.sort().some((name) => {
    const sourceData = getSheetJson(name, source);
    const destinationData = getSheetJson(name, destination);
    const mergedJsonWithStatus = ['dnt', 'non-default'].includes(name)
      ? { mergedJson: (sourceData || destinationData) }
      : compareAndMergeDataJson(sourceData, destinationData);
    return !addToFinalJson(mergedJsonWithStatus, name);
  });

  if (finalJsonWithStatus.finalJson[':names']?.length > 0) {
    finalJsonWithStatus.finalJson[':type'] = 'multi-sheet';
  }

  handlePrivateSheets(source, destination, finalJsonWithStatus);
  return finalJsonWithStatus;
}

export { compareAndMergeDataJson, getMergedJson };
