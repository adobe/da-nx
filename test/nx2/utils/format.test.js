import { expect } from '@esm-bundle/chai';
import { formatRelativeDateTime } from '../../../nx2/utils/format.js';

describe('formatRelativeDateTime', () => {
  const at = (base, { days = 0, hours = 0, minutes = 0 } = {}) => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    d.setHours(d.getHours() + hours, d.getMinutes() + minutes, 0, 0);
    return d;
  };

  it('returns null for missing or unparseable values', () => {
    expect(formatRelativeDateTime(undefined)).to.equal(null);
    expect(formatRelativeDateTime(null)).to.equal(null);
    expect(formatRelativeDateTime('')).to.equal(null);
    expect(formatRelativeDateTime('not a date')).to.equal(null);
  });

  it('formats today as "Today at HH:MM" (24h)', () => {
    const today = at(new Date());
    today.setHours(14, 32, 0, 0);
    expect(formatRelativeDateTime(today)).to.equal('Today at 14:32');
  });

  it('formats yesterday as "Yesterday at HH:MM"', () => {
    const yesterday = at(new Date(), { days: -1 });
    yesterday.setHours(9, 5, 0, 0);
    expect(formatRelativeDateTime(yesterday)).to.equal('Yesterday at 09:05');
  });

  it('formats older dates as a short date plus time, without a relative prefix', () => {
    // A fixed past date well outside the today/yesterday window. The exact
    // day/month order is locale-dependent (e.g. "17 Jun" vs "Jun 17"), so assert
    // on the parts rather than a fixed string.
    const out = formatRelativeDateTime(new Date('2024-06-17T16:02:00'));
    expect(out).to.match(/^(?!Today|Yesterday)/);
    expect(out).to.contain('16:02');
    expect(out).to.contain('Jun');
    expect(out).to.contain('17');
  });

  it('accepts an ISO string', () => {
    const today = new Date();
    today.setHours(8, 0, 0, 0);
    expect(formatRelativeDateTime(today.toISOString())).to.equal('Today at 08:00');
  });
});
