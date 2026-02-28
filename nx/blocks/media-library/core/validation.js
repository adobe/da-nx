/**
 * Query utilities for index operations.
 * Follows helix-admin pattern from src/support/log-query-utils.js
 */

/**
 * Parse an integer with a validation condition.
 * @param {string} s string to parse
 * @param {function(number): boolean} cond condition function
 * @param {number} defaultValue default value if invalid
 * @returns {number} parsed value or default
 */
export function parseIntWithCond(s, cond, defaultValue) {
  if (s) {
    const value = Number.parseInt(s, 10);
    if (!Number.isNaN(value) && cond(value)) {
      return value;
    }
  }
  return defaultValue;
}

/**
 * Parse a limit parameter with bounds checking.
 * @param {string} limitStr limit as string
 * @param {number} max maximum allowed value
 * @returns {number} parsed limit or max
 */
export function parseLimit(limitStr, max = 1000) {
  return parseIntWithCond(limitStr, (v) => v >= 1 && v <= max, max);
}

/**
 * Parse a timestamp parameter.
 * @param {string|number} timestampStr timestamp string or number
 * @param {string} paramName parameter name for error messages
 * @returns {number|null} parsed timestamp or null
 * @throws {Error} if timestamp is invalid
 */
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

/**
 * Validate a time range.
 * @param {number} from start timestamp
 * @param {number} to end timestamp
 * @throws {Error} if range is invalid
 */
export function validateTimeRange(from, to) {
  if (from !== null && to !== null && from >= to) {
    throw new Error(`'from' (${from}) must be less than 'to' (${to})`);
  }
}

/**
 * Validate required properties exist on an object.
 * @param {object} obj object to validate
 * @param {string} message error message
 * @param {...string} props required property names
 * @throws {Error} if any required property is missing
 */
export function assertRequiredProperties(obj, message, ...props) {
  const missing = props.filter((prop) => !obj[prop]);
  if (missing.length > 0) {
    throw new Error(`${message}: missing ${missing.join(', ')}`);
  }
}
