import { isFolder as browseListRowIsFolder } from '../utils.js';

const TIME_FORMAT_OPTIONS = { hour: 'numeric', minute: '2-digit' };

function parseTimestamp(timestampRaw) {
  if (timestampRaw == null || timestampRaw === '') return null;
  const parsedDate = new Date(timestampRaw);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatAbsolute(dateInstant, referenceNow = new Date()) {
  const timeSegment = dateInstant.toLocaleTimeString(undefined, TIME_FORMAT_OPTIONS);
  if (dateInstant.getFullYear() === referenceNow.getFullYear()) {
    const dateSegment = dateInstant.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    return `${dateSegment}, ${timeSegment}`;
  }
  const dateSegment = dateInstant.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return `${dateSegment}, ${timeSegment}`;
}

function formatRelative(dateInstant, referenceNow = new Date()) {
  const elapsedMilliseconds = referenceNow - dateInstant;
  const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const eventCalendarDay = dateInstant.toDateString();
  const referenceCalendarDay = referenceNow.toDateString();

  let displayLabel;
  if (eventCalendarDay === referenceCalendarDay) {
    const elapsedSeconds = Math.floor(elapsedMilliseconds / 1000);
    if (elapsedSeconds < 60) displayLabel = relativeTimeFormatter.format(0, 'second');
    else {
      const elapsedMinutes = Math.floor(elapsedSeconds / 60);
      if (elapsedMinutes < 60) displayLabel = relativeTimeFormatter.format(-elapsedMinutes, 'minute');
      else {
        const elapsedHours = Math.floor(elapsedMinutes / 60);
        displayLabel = relativeTimeFormatter.format(-elapsedHours, 'hour');
      }
    }
  } else {
    const referenceYesterday = new Date(referenceNow);
    referenceYesterday.setDate(referenceYesterday.getDate() - 1);
    if (eventCalendarDay === referenceYesterday.toDateString()) {
      const relativeDayPhrase = relativeTimeFormatter.format(-1, 'day');
      const timeSegment = dateInstant.toLocaleTimeString(undefined, TIME_FORMAT_OPTIONS);
      displayLabel = `${relativeDayPhrase}, ${timeSegment}`;
    } else {
      displayLabel = formatAbsolute(dateInstant, referenceNow);
    }
  }

  return displayLabel;
}

export function formatColumnLastModified(lastModified) {
  const lastModifiedDate = parseTimestamp(lastModified);
  if (!lastModifiedDate) return { label: null };
  return {
    label: formatRelative(lastModifiedDate),
    title: `Last modified on ${formatAbsolute(lastModifiedDate)}`,
  };
}

function emailChip(email) {
  const atSignIndex = email.indexOf('@');
  return atSignIndex > 0
    ? { label: email.slice(0, atSignIndex), title: email }
    : { label: email, title: email };
}

function initials(displayText) {
  const text = String(displayText || '');
  if (!text) return '';
  if (text.includes(' ')) {
    const parts = text.split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
    }
  }
  if (text.includes('@')) return (text.split('@')[0] || text).slice(0, 2).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

/** File rows: `resourceStatus` missing until `/status` completes; then object or `null`. */
function statusAwaitingResource(item, isFolder) {
  if (isFolder) return false;
  return !browseListRowIsFolder(item) && item.resourceStatus === undefined;
}

export function formatColumnModifiedBy(item) {
  const statusPending = statusAwaitingResource(item, false);
  const fromList = item.lastModifiedBy || item.modifiedBy || item.updatedBy;
  if (fromList) {
    const author = String(fromList).trim();
    if (!author) {
      if (statusPending) return { label: 'Checking', initials: '', pending: true };
      return { label: null, initials: '' };
    }
    const displayBase = author.includes('@')
      ? emailChip(author)
      : { label: author, title: author };
    return {
      ...displayBase,
      initials: initials(author.includes('@') ? author : displayBase.label),
    };
  }
  const profile = item.resourceStatus?.profile;
  const profileDisplayName = profile
    ? (profile.displayName || profile.name
      || [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim())
    : '';
  const profileEmail = profile?.email != null && profile.email !== ''
    ? String(profile.email).trim()
    : '';
  if (profileDisplayName) {
    const name = String(profileDisplayName);
    return { label: name, title: profileEmail || name, initials: initials(name) };
  }
  if (profileEmail) {
    return { ...emailChip(profileEmail), initials: initials(profileEmail) };
  }
  if (statusPending) return { label: 'Checking', initials: '', pending: true };
  return { label: null, initials: '' };
}

function formatStatus(isFolder, statusPending, environment, statusOk, timestampRaw) {
  if (isFolder) return { label: '', showBadge: false };

  const lastModifiedDate = parseTimestamp(timestampRaw);
  if (lastModifiedDate) {
    const titleHeadline = environment === 'live' ? 'Last published' : 'Last previewed';
    return {
      label: formatRelative(lastModifiedDate),
      title: `${titleHeadline} on ${formatAbsolute(lastModifiedDate)}`,
      showBadge: statusOk === true,
    };
  }

  if (statusPending && statusOk === undefined) {
    return { label: 'Checking', showBadge: false, pending: true };
  }
  if (statusOk === false) {
    return { label: 'Never', showBadge: false };
  }
  return { label: null, showBadge: false };
}

function envStatusOk(env) {
  if (env == null) return undefined;
  return Number(env.status) === 200;
}

export function formatColumnLastPreviewed(item, { isFolder }) {
  const preview = item.resourceStatus?.preview;
  const statusPending = statusAwaitingResource(item, isFolder);
  return formatStatus(
    isFolder,
    statusPending,
    'preview',
    envStatusOk(preview),
    preview?.lastModified,
  );
}

export function formatColumnLastPublished(item, { isFolder }) {
  const live = item.resourceStatus?.live;
  const statusPending = statusAwaitingResource(item, isFolder);
  return formatStatus(
    isFolder,
    statusPending,
    'live',
    envStatusOk(live),
    live?.lastModified,
  );
}
