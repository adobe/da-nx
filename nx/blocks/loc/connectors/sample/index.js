/**
 * Opt in to the per-language Re-download action. Set to true only if `saveItems`
 * fetches the vendor's latest content on every call, so redelivered corrections
 * are saved again.
 */
export const supportsReDownload = false;

export async function cancelTranslation({ service, lang, sendMessage }) {

}

export async function saveItems({
  org, site, service, lang, urls, saveFn,
}) {

}

export async function getStatusAll({ title, service, langs, urls, actions }) {

}

export async function sendAllLanguages({ title, service, langs, urls, actions }) {

}

export async function connect(service) {

}
