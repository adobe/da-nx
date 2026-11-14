/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { expect } from '@esm-bundle/chai';
import { formatExternalBrief } from '../../../../nx2/utils/aem-assets/external-brief.js';

function makeDoc(text, h1Title = '') {
  return {
    textContent: text,
    descendants: (fn) => {
      if (h1Title) {
        fn({ type: { name: 'heading' }, attrs: { level: 1 }, textContent: h1Title });
      }
    },
  };
}

describe('AEM Assets external brief', () => {
  it('returns empty string when document has no text content', () => {
    expect(formatExternalBrief(makeDoc(''))).to.equal('');
  });

  it('includes content text in brief', () => {
    const brief = formatExternalBrief(makeDoc('We sell great shoes.'));
    expect(brief).to.include('We sell great shoes.');
  });

  it('includes h1 title in brief when present', () => {
    const brief = formatExternalBrief(makeDoc('We sell great shoes.', 'Our Products'));
    expect(brief).to.include('Title: Our Products');
  });

  it('omits title line when no h1 is present', () => {
    const brief = formatExternalBrief(makeDoc('Some page content without a heading.'));
    expect(brief).to.not.include('Title:');
    expect(brief).to.include('Some page content without a heading.');
  });

  it('uses only the first h1 as the title', () => {
    const doc = {
      textContent: 'Body',
      descendants: (fn) => {
        const nodes = [
          { type: { name: 'heading' }, attrs: { level: 2 }, textContent: 'Sub' },
          { type: { name: 'heading' }, attrs: { level: 1 }, textContent: 'First' },
          { type: { name: 'heading' }, attrs: { level: 1 }, textContent: 'Second' },
        ];
        nodes.every((node) => fn(node) !== false);
      },
    };
    const brief = formatExternalBrief(doc);
    expect(brief).to.include('Title: First');
    expect(brief).to.not.include('Second');
  });
});
