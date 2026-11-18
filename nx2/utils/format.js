/*
 * Copyright 2026 Adobe. All rights reserved.
 * Shared human-friendly date/time formatting for nx2.
 */

/**
 * Human-friendly timestamp. Recent times read as "Today at 14:32" /
 * "Yesterday at 14:32"; older ones as "17 Jun, 16:02". Returns null for
 * missing or unparseable values.
 * @param {string | number | Date | undefined} value
 * @returns {string | null}
 */
export function formatRelativeDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, now)) return `Today at ${time}`;
  if (sameDay(date, yesterday)) return `Yesterday at ${time}`;
  const day = date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return `${day}, ${time}`;
}
