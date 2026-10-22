import assert from 'node:assert/strict';
import test from 'node:test';
import config from '../../web-test-runner.config.mjs';
import diffReporter from './diffReporter.mjs';

test('custom reporters accept sessions without test results', async () => {
  const logger = { log: () => assert.fail('Unexpected test output') };
  const sessionsForTestFile = [{}];

  await config.reporters[1].reportTestFileResults({ logger, sessionsForTestFile });
  await diffReporter().reportTestFileResults({ logger, sessionsForTestFile });
});

test('custom reporter logs session errors with the test filename', async () => {
  const messages = [];
  const logger = { log: (...args) => messages.push(args) };
  const testFile = '/test/example.test.js';
  const sessionsForTestFile = [{
    testFile,
    errors: [
      { message: 'Browser tests did not finish within 120000ms' },
      { message: 'Could not load test module', stack: 'Error: Could not load test module\n    at example.test.js:1' },
    ],
  }];

  await config.reporters[1].reportTestFileResults({ logger, sessionsForTestFile });

  assert.deepEqual(messages, [
    [`${testFile}:`, sessionsForTestFile[0].errors[0].message],
    [`${testFile}:`, sessionsForTestFile[0].errors[1].stack],
  ]);
});

test('successful sessions remain quiet', async () => {
  const logger = { log: () => assert.fail('Unexpected test output') };
  const success = { name: 'successful assertion', passed: true, skipped: false };
  const sessionsForTestFile = [{
    errors: [],
    testResults: { tests: [success], suites: [{ tests: [success] }] },
  }];

  await config.reporters[0].reportTestFileResults({ logger, sessionsForTestFile });
  await config.reporters[1].reportTestFileResults({ logger, sessionsForTestFile });
  await diffReporter().reportTestFileResults({ logger, sessionsForTestFile });
});

test('custom reporters still report failures after a session without results', async () => {
  const messages = [];
  const logger = { log: (message) => messages.push(message) };
  const failure = {
    name: 'failed assertion',
    passed: false,
    skipped: false,
    error: { expected: 'hello', actual: 'hallo' },
  };
  const sessionsForTestFile = [
    {},
    { testResults: { tests: [failure], suites: [{ tests: [failure] }] } },
  ];

  await config.reporters[1].reportTestFileResults({ logger, sessionsForTestFile });
  await diffReporter().reportTestFileResults({ logger, sessionsForTestFile });

  assert.equal(messages[0], failure);
  assert.equal(messages.length, 3);
  assert.match(messages[1], /Expected:/);
  assert.match(messages[2], /Received:/);
});
