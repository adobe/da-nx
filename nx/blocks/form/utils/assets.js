import { SUPPORTED_FILES } from '../../../../nx2/utils/utils.js';
import {
  SUPPORTED_IMAGE_TYPES,
  getImageUploadLimit,
  getMediaUploadPath,
  imageTooLargeMessage,
  uploadMedia,
} from '../../../../nx2/utils/media-upload.js';

const normalizeMediaType = (type) => (typeof type === 'string' ? type.trim().toLowerCase() : '');

export const isImageType = (type) => normalizeMediaType(type).startsWith('image/');

export const extensionOf = (fileName) => (fileName?.includes('.') ? fileName.split('.').pop().toLowerCase() : '');

export function typeFromName(fileName) {
  return SUPPORTED_FILES[extensionOf(fileName)] ?? '';
}

const MEDIA_BUS_PREFIX = './media_';
const UNSAFE_MEDIA_BUS_CHARS = /[\s<>"']/;
const WEB_PROTOCOLS = ['http:', 'https:'];

function parseHref(href, base) {
  try {
    return new URL(href, base);
  } catch {
    return undefined;
  }
}

const isWebHref = (href) => WEB_PROTOCOLS.includes(parseHref(href)?.protocol);

const isMediaBusHref = (href) => href.startsWith(MEDIA_BUS_PREFIX)
  && !UNSAFE_MEDIA_BUS_CHARS.test(href);

export function isAssetHref(href) {
  if (typeof href !== 'string' || !href.trim()) return false;
  return isMediaBusHref(href) || isWebHref(href);
}

export function previewHrefFor({ href, previewOrigin }) {
  if (!isAssetHref(href)) return undefined;
  if (isWebHref(href)) return href;
  return previewOrigin ? parseHref(href, `${previewOrigin}/`)?.href : undefined;
}

function fileNameFromHref(href) {
  const lastSegment = href.split(/[?#]/)[0].split('/').pop();
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

// Types are only known for files picked in this session, so stored values fall back to the name.
export function describeAsset({ href, name, type }) {
  const fileName = name || (href ? fileNameFromHref(href) : '');
  const fileType = type || typeFromName(fileName);
  return {
    name: fileName,
    isImage: !fileType || isImageType(fileType),
  };
}

const INVALID_FILE_NAME = /[/\\?#]|^\.{1,2}$/;

const UPLOAD_ERRORS = {
  document: 'The form document path is unavailable for upload.',
  fileName: 'The file name is invalid.',
  fileType: 'This file type cannot be uploaded here.',
  response: 'The upload did not return a usable file URL.',
};

const isValidFileName = (fileName) => !!fileName && !INVALID_FILE_NAME.test(fileName);

// The upload API derives the content type from the extension, so validation does too.
export async function uploadFile({
  details, file, upload, checkHlx6,
}) {
  const type = typeFromName(file?.name);
  if (!SUPPORTED_IMAGE_TYPES.includes(type)) {
    return { error: UPLOAD_ERRORS.fileType };
  }

  const {
    owner, repo, parent, name,
  } = details ?? {};
  if (!owner || !repo || !parent || !name) {
    return { error: UPLOAD_ERRORS.document };
  }
  if (!isValidFileName(file.name)) {
    return { error: UPLOAD_ERRORS.fileName };
  }

  const size = file.size ?? 0;
  const limitBytes = await getImageUploadLimit({
    org: owner, site: repo, size, checkHlx6,
  });
  if (size > limitBytes) return { error: imageTooLargeMessage({ limitBytes }) };

  const path = getMediaUploadPath({ parent, name, fileName: file.name });
  const { href, error } = await uploadMedia({ path, body: file, upload });
  if (error) return { error };
  if (!isAssetHref(href)) return { error: UPLOAD_ERRORS.response };
  return { href, name: file.name, type };
}

export const CANCELLED = Object.freeze({ cancelled: true });

const SOURCE_IDS = {
  upload: 'upload',
  aemAssets: 'aem-assets',
};

function uploadSource({ details }) {
  return {
    id: SOURCE_IDS.upload,
    label: 'Upload',
    fileTypes: SUPPORTED_IMAGE_TYPES,
    select: ({ file }) => uploadFile({ details, file }),
  };
}

function aemAssetsSource({ repoConfig }) {
  return {
    id: SOURCE_IDS.aemAssets,
    label: 'AEM Assets',
    select: async () => {
      const { selectAemAsset } = await import('./aem-selector.js');
      return selectAemAsset({ repoConfig });
    },
  };
}

// A source whose result arrives after the document changed must not write into the new one.
function ignoreStaleResults({ source, isCurrent }) {
  return {
    ...source,
    select: async (request) => {
      const result = await source.select(request);
      return isCurrent() ? result : CANCELLED;
    },
  };
}

export function createAssetSources({ details, repoConfig, isCurrent }) {
  return [
    uploadSource({ details }),
    ...(repoConfig ? [aemAssetsSource({ repoConfig })] : []),
  ].map((source) => ignoreStaleResults({ source, isCurrent }));
}
