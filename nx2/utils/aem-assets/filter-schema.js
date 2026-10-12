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

const HYBRID_FILTER_SCHEMA_SOURCE = 'hybrid-merge-deep';

export function createApprovedOnlyFilterSchema() {
  return [
    {
      fields: [{
        element: 'radiogroup',
        name: 'property=dam:assetStatus=',
        defaultValue: ['approved'],
        readOnly: true,
        orientation: 'vertical',
        options: [
          { label: 'Approved', value: 'approved', readOnly: true },
        ],
      }],
      header: 'Asset Status',
      groupKey: 'AssetStatusGroup',
    },
  ];
}

// Each filter is a list of filter groups, and an empty list adds nothing. The
// selector takes a single `filterSchema`, so every filter is combined here.
export function toFilterProps(...filters) {
  const groups = filters.flatMap((filter) => filter ?? []);
  return groups.length
    ? { filterSchema: groups, filterSchemaSource: HYBRID_FILTER_SCHEMA_SOURCE }
    : {};
}

export function getApprovedOnlyFilterProps(approvedOnly) {
  return toFilterProps(approvedOnly ? createApprovedOnlyFilterSchema() : []);
}
