// Parses int if cond passes; otherwise returns default.
export function parseIntWithCond(s, cond, defaultValue) {
  if (s) {
    const value = Number.parseInt(s, 10);
    if (!Number.isNaN(value) && cond(value)) {
      return value;
    }
  }
  return defaultValue;
}

// Parses limit query param, clamped to [1, max].
export function parseLimit(limitStr, max = 1000) {
  return parseIntWithCond(limitStr, (v) => v >= 1 && v <= max, max);
}

// Parses timestamp; throws if invalid.
export function parseTimestamp(timestampStr, paramName) {
  if (timestampStr === undefined || timestampStr === null || timestampStr === '') {
    return null;
  }

  const ts = typeof timestampStr === 'number'
    ? timestampStr
    : Number.parseInt(timestampStr, 10);

  if (Number.isNaN(ts) || ts < 0) {
    throw new Error(`'${paramName}' must be a valid timestamp: ${timestampStr}`);
  }
  return ts;
}

// Throws if from >= to when both are set.
export function validateTimeRange(from, to) {
  if (from !== null && to !== null && from >= to) {
    throw new Error(`'from' (${from}) must be less than 'to' (${to})`);
  }
}

// Throws if any of props are missing on obj.
export function assertRequiredProperties(obj, message, ...props) {
  const missing = props.filter((prop) => !obj[prop]);
  if (missing.length > 0) {
    throw new Error(`${message}: missing ${missing.join(', ')}`);
  }
}
