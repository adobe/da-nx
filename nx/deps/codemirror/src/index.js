import { EditorView, basicSetup } from 'codemirror';
import { Compartment } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { githubLight } from '@fsegurai/codemirror-theme-github-light';
import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
import { oneDark } from '@codemirror/theme-one-dark';

export { EditorView, basicSetup, Compartment, json, markdown, githubLight, githubDark, oneDark };
