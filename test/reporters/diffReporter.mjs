/* eslint-disable no-console */

// Helper function to find longest common subsequence
function findLongestCommonSubsequence(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

  // Build LCS matrix
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Reconstruct the LCS
  const lcs = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (str1[i - 1] === str2[j - 1]) {
      lcs.unshift(str1[i - 1]);
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return lcs;
}

export default function diffReporter() {
  let diffResults = [];

  return {
    onTestRunStarted() {
      diffResults = [];
    },

    async reportTestFileResults({ logger, sessionsForTestFile }) {
      sessionsForTestFile.forEach((session) => {
        const testFile = session.testFile?.split('/test/')[1];
        session.testResults.suites.forEach((suite) => {
          suite.tests.forEach((test) => {
            if (!test.passed && !test.skipped && test.error
                && test.error.expected !== undefined && test.error.actual !== undefined) {
              const expected = String(test.error.expected);
              const actual = String(test.error.actual);

              // Smart diff algorithm
              const diffExpected = [];
              const diffActual = [];

              // Simple diff: find the longest common subsequence
              const lcs = findLongestCommonSubsequence(expected, actual);
              let expectedIndex = 0;
              let actualIndex = 0;
              let lcsIndex = 0;

              while (expectedIndex < expected.length || actualIndex < actual.length) {
                // Add expected characters that aren't in LCS
                while (expectedIndex < expected.length
                       && (lcsIndex >= lcs.length || expected[expectedIndex] !== lcs[lcsIndex])) {
                  diffExpected.push(`\x1b[41m${expected[expectedIndex]}\x1b[0m`);
                  expectedIndex += 1;
                }

                // Add actual characters that aren't in LCS
                while (actualIndex < actual.length
                       && (lcsIndex >= lcs.length || actual[actualIndex] !== lcs[lcsIndex])) {
                  diffActual.push(`\x1b[42m${actual[actualIndex]}\x1b[0m`);
                  actualIndex += 1;
                }

                // Add matching characters
                if (lcsIndex < lcs.length) {
                  diffExpected.push(expected[expectedIndex]);
                  diffActual.push(actual[actualIndex]);
                  expectedIndex += 1;
                  actualIndex += 1;
                  lcsIndex += 1;
                }
              }

              logger.log(`\x1b[1mExpected:\x1b[0m\n ${diffExpected.join('')}`);
              logger.log(`\x1b[1mReceived:\x1b[0m\n ${diffActual.join('')}`);

              // Store diff result for later display
              diffResults.push({
                fileName: testFile,
                testName: test.name,
                expected,
                actual,
                diffExpected: diffExpected.join(''),
                diffActual: diffActual.join(''),
              });
            }
          });
        });
      });
    },

    onTestRunFinished() {
      if (diffResults.length > 0) {
        console.log('\n\x1b[1m=== TEST RESULTS ===\x1b[0m');
        diffResults.forEach((result) => {
          console.log(`\n❌ ${result.fileName} ${result.testName}`);
          console.log(`\x1b[1mExpected:\x1b[0m\n ${result.diffExpected}`);
          console.log(`\x1b[1mReceived:\x1b[0m\n ${result.diffActual}`);
        });
        console.log('\n\x1b[1m=== END TEST RESULTS ===\x1b[0m\n');
      }
    },
  };
}
