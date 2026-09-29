export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // semantic-release's generated release commit bodies contain long link lines
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
