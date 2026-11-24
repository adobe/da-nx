import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  latestApprovers,
  parseApprovers,
  parseMap,
  resolvePeople,
  toEnvLines,
} from './chg-people.mjs';

const review = (login, state, type = 'User') => ({ user: { login, type }, state });

describe('latestApprovers', () => {
  it('keeps reviewers whose latest decisive review is APPROVED', () => {
    const reviews = [
      review('alice', 'APPROVED'),
      review('bob', 'APPROVED'),
      review('bob', 'CHANGES_REQUESTED'),
      review('carol', 'CHANGES_REQUESTED'),
      review('carol', 'APPROVED'),
    ];
    assert.deepEqual(latestApprovers(reviews), ['alice', 'carol']);
  });

  it('ignores plain comments when deciding the latest state', () => {
    const reviews = [review('alice', 'APPROVED'), review('alice', 'COMMENTED')];
    assert.deepEqual(latestApprovers(reviews), ['alice']);
  });

  it('drops dismissed approvals and bots', () => {
    const reviews = [
      review('alice', 'APPROVED'),
      review('alice', 'DISMISSED'),
      review('renovate[bot]', 'APPROVED', 'Bot'),
    ];
    assert.deepEqual(latestApprovers(reviews), []);
  });
});

describe('parseMap', () => {
  it('lower-cases GitHub logins', () => {
    assert.deepEqual(parseMap('{"MHaack":"ldap1"}'), { mhaack: 'ldap1' });
  });

  it('returns an empty map for missing or invalid input', () => {
    assert.deepEqual(parseMap(''), {});
    assert.deepEqual(parseMap(undefined), {});
    assert.deepEqual(parseMap('not json'), {});
    assert.deepEqual(parseMap('["a"]'), {});
  });
});

describe('parseApprovers', () => {
  it('accepts a JSON array', () => {
    assert.deepEqual(parseApprovers('["a","b"]'), ['a', 'b']);
  });

  it('accepts a comma-separated list', () => {
    assert.deepEqual(parseApprovers('a, b'), ['a', 'b']);
  });

  it('returns an empty list for missing input', () => {
    assert.deepEqual(parseApprovers(''), []);
    assert.deepEqual(parseApprovers(undefined), []);
  });
});

describe('resolvePeople', () => {
  const map = { alice: 'ldap-alice', bob: 'ldap-bob', carol: 'ldap-carol' };
  const defaults = { coordinator: 'ldap-default', approvedBy: ['ldap-d1', 'ldap-d2'] };

  it('uses the mapped author of the newest PR as coordinator and mapped approvers', () => {
    const prs = [
      { author: 'alice', approvers: ['bob'] },
      { author: 'carol', approvers: ['carol', 'bob'] },
    ];
    assert.deepEqual(resolvePeople({ prs, map, defaults }), {
      coordinator: 'ldap-alice',
      approvedBy: ['ldap-bob', 'ldap-carol'],
    });
  });

  it('falls back to the default coordinator for an unmapped author (external contributor)', () => {
    const prs = [{ author: 'stranger', approvers: ['bob'] }];
    assert.deepEqual(resolvePeople({ prs, map, defaults }), {
      coordinator: 'ldap-default',
      approvedBy: ['ldap-bob'],
    });
  });

  it('falls back to the default approvers when no approver is mapped', () => {
    const prs = [{ author: 'alice', approvers: ['stranger'] }];
    assert.deepEqual(resolvePeople({ prs, map, defaults }), {
      coordinator: 'ldap-alice',
      approvedBy: ['ldap-d1', 'ldap-d2'],
    });
  });

  it('never lists the coordinator as an approver', () => {
    const prs = [
      { author: 'alice', approvers: ['bob'] },
      { author: 'bob', approvers: ['alice'] },
    ];
    assert.deepEqual(resolvePeople({ prs, map, defaults }), {
      coordinator: 'ldap-alice',
      approvedBy: ['ldap-bob'],
    });
  });

  it('matches logins case-insensitively', () => {
    const prs = [{ author: 'Alice', approvers: ['BOB'] }];
    assert.deepEqual(resolvePeople({ prs, map, defaults }), {
      coordinator: 'ldap-alice',
      approvedBy: ['ldap-bob'],
    });
  });

  it('removes the coordinator from the default approvers as well', () => {
    const prs = [{ author: 'stranger', approvers: [] }];
    const own = { coordinator: 'ldap-d1', approvedBy: ['ldap-d1', 'ldap-d2'] };
    assert.deepEqual(resolvePeople({ prs, map, defaults: own }), {
      coordinator: 'ldap-d1',
      approvedBy: ['ldap-d2'],
    });
  });

  it('uses the defaults when there are no PRs', () => {
    assert.deepEqual(resolvePeople({ prs: [], map, defaults }), {
      coordinator: 'ldap-default',
      approvedBy: ['ldap-d1', 'ldap-d2'],
    });
  });

  it('returns nothing for values that have neither a mapping nor a default', () => {
    const prs = [{ author: 'stranger', approvers: [] }];
    assert.deepEqual(
      resolvePeople({ prs, map, defaults: { coordinator: '', approvedBy: [] } }),
      { coordinator: undefined, approvedBy: undefined },
    );
  });
});

describe('toEnvLines', () => {
  it('masks every LDAP id and writes the IPAAS_* env entries', () => {
    const { mask, env } = toEnvLines({ coordinator: 'ldap-a', approvedBy: ['ldap-b', 'ldap-c'] });
    assert.deepEqual(mask, ['ldap-a', 'ldap-b', 'ldap-c']);
    assert.deepEqual(env, [
      'IPAAS_COORDINATOR=ldap-a',
      'IPAAS_APPROVED_BY=["ldap-b","ldap-c"]',
    ]);
  });

  it('skips unresolved values so the shared secret stays in effect', () => {
    assert.deepEqual(toEnvLines({ coordinator: undefined, approvedBy: undefined }), {
      mask: [],
      env: [],
    });
  });
});
