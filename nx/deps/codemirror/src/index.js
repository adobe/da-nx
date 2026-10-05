import { EditorView, basicSetup } from 'codemirror';
import { Compartment } from '@codemirror/state';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { linter, lintGutter } from '@codemirror/lint';
import { githubLight } from '@fsegurai/codemirror-theme-github-light';
import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
import { oneDark } from '@codemirror/theme-one-dark';

export {
  EditorView,
  basicSetup,
  Compartment,
  json,
  jsonParseLinter,
  markdown,
  linter,
  lintGutter,
  githubLight,
  githubDark,
  oneDark,
};
