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
import {
  createApprovedOnlyFilterSchema,
  createImagesOnlyFilterSchema,
  getApprovedOnlyFilterProps,
  getImagesOnlyFilterProps,
  toFilterProps,
} from '../../../../nx2/utils/aem-assets/filter-schema.js';

describe('approved-only AEM Assets filter schema', () => {
  it('contains only the locked Asset Status group', () => {
    const schema = createApprovedOnlyFilterSchema();
    expect(schema.map(({ groupKey }) => groupKey)).to.deep.equal([
      'AssetStatusGroup',
    ]);
  });

  it('locks Asset Status to Approved', () => {
    const statusGroup = createApprovedOnlyFilterSchema()
      .find(({ groupKey }) => groupKey === 'AssetStatusGroup');
    const [statusField] = statusGroup.fields;

    expect(statusField).to.include({
      element: 'radiogroup',
      name: 'property=dam:assetStatus=',
      readOnly: true,
    });
    expect(statusField.defaultValue).to.deep.equal(['approved']);
    expect(statusField.options).to.deep.equal([
      { label: 'Approved', value: 'approved', readOnly: true },
    ]);
  });

  it('returns a fresh nested schema for every call', () => {
    const first = createApprovedOnlyFilterSchema();
    const second = createApprovedOnlyFilterSchema();

    expect(first).to.not.equal(second);
    expect(first[0]).to.not.equal(second[0]);
    expect(first[0].fields[0]).to.not.equal(second[0].fields[0]);
  });

  it('adds the hybrid filter contract only when approved-only is enabled', () => {
    const enabled = getApprovedOnlyFilterProps(true);
    const disabled = getApprovedOnlyFilterProps(false);

    expect(enabled).to.include({ filterSchemaSource: 'hybrid-merge-deep' });
    expect(Object.keys(enabled).sort()).to.deep.equal([
      'filterSchema',
      'filterSchemaSource',
    ]);
    expect(enabled.filterSchema.map(({ groupKey }) => groupKey)).to.deep.equal(['AssetStatusGroup']);
    expect(disabled).to.deep.equal({});
    expect(disabled).to.not.have.property('filterSchema');
    expect(disabled).to.not.have.property('filterSchemaSource');
  });
});

describe('images-only AEM Assets filter schema', () => {
  it('locks the file type to images', () => {
    const [group] = createImagesOnlyFilterSchema();
    const [typeField] = group.fields;

    expect(group.groupKey).to.equal('FileTypeGroup');
    expect(typeField).to.include({ element: 'checkbox', name: 'type', readOnly: true });
    expect(typeField.defaultValue).to.deep.equal(['image/*']);
    expect(typeField.options).to.deep.equal([
      { label: 'Images', value: 'image/*', readOnly: true },
    ]);
  });

  it('returns a fresh nested schema for every call', () => {
    const first = createImagesOnlyFilterSchema();
    const second = createImagesOnlyFilterSchema();

    expect(first[0]).to.not.equal(second[0]);
    expect(first[0].fields[0]).to.not.equal(second[0].fields[0]);
  });

  it('adds the hybrid filter contract only when images-only is enabled', () => {
    const enabled = getImagesOnlyFilterProps(true);

    expect(enabled).to.include({ filterSchemaSource: 'hybrid-merge-deep' });
    expect(enabled.filterSchema.map(({ groupKey }) => groupKey)).to.deep.equal(['FileTypeGroup']);
    expect(getImagesOnlyFilterProps(false)).to.deep.equal({});
    expect(getImagesOnlyFilterProps()).to.deep.equal({});
  });
});

describe('toFilterProps', () => {
  const groupKeys = (props) => props.filterSchema.map(({ groupKey }) => groupKey);

  it('returns no filter props for no or empty filters', () => {
    expect(toFilterProps()).to.deep.equal({});
    expect(toFilterProps([], [])).to.deep.equal({});
    expect(toFilterProps(null, undefined)).to.deep.equal({});
  });

  it('returns a single filter in the hybrid contract', () => {
    const props = toFilterProps(createImagesOnlyFilterSchema());

    expect(groupKeys(props)).to.deep.equal(['FileTypeGroup']);
    expect(props).to.include({ filterSchemaSource: 'hybrid-merge-deep' });
  });

  it('combines filters in the given order into one filter schema', () => {
    const props = toFilterProps(
      createApprovedOnlyFilterSchema(),
      [],
      createImagesOnlyFilterSchema(),
    );

    expect(groupKeys(props)).to.deep.equal(['AssetStatusGroup', 'FileTypeGroup']);
  });

  it('does not change the given filters', () => {
    const images = createImagesOnlyFilterSchema();
    toFilterProps(createApprovedOnlyFilterSchema(), images);
    expect(images.map(({ groupKey }) => groupKey)).to.deep.equal(['FileTypeGroup']);
  });
});
