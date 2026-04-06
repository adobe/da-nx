import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { compareAndMergeDataJson, getMergedJson } from '../../../nx/blocks/loc/project/merge-json/merge-json.js';

describe('merge-json', () => {
  let sourceJson;
  let destJson;

  beforeEach(async () => {
    const [sourceRaw, destRaw] = await Promise.all([
      readFile({ path: './mocks/source.json' }),
      readFile({ path: './mocks/dest.json' }),
    ]);
    sourceJson = JSON.parse(sourceRaw);
    destJson = JSON.parse(destRaw);
  });

  describe('compareAndMergeDataJson', () => {
    it('returns source when destination is missing', () => {
      const result = compareAndMergeDataJson(sourceJson.default, null);
      expect(result.error).to.be.undefined;
      expect(result.mergedJson).to.equal(sourceJson.default);
    });

    it('returns destination when source is missing', () => {
      const result = compareAndMergeDataJson(null, destJson.default);
      expect(result.mergedJson).to.equal(destJson.default);
    });

    it('overwrites with source when :uid/:rollout missing but both sides have rows', () => {
      const source = { data: [{ key: 'a', value: 'from-src' }, { key: 'b', value: 'x' }] };
      const dest = { data: [{ key: 'a', value: 'from-dest' }] };
      const result = compareAndMergeDataJson(source, dest);
      expect(result.error).to.be.undefined;
      expect(result.mergedJson).to.equal(source);
    });

    it('merges two sheets with :uid and :rollout', () => {
      const result = compareAndMergeDataJson(sourceJson.default, destJson.default);
      expect(result.error, 'no merge error').to.be.undefined;
      expect(result.mergedJson.data, 'four rows').to.have.lengthOf(4);
      expect(result.mergedJson.data[0].value, 'Field: source wins').to.equal('Content');
      expect(result.mergedJson.data[1].value, 'source-wins: source wins').to.equal('Source value');
      expect(result.mergedJson.data[2].value, 'dest-wins: dest wins (:regional)').to.equal('Dest value');
      expect(result.mergedJson.data[2][':regional'], 'dest-wins row has :regional yes').to.equal('yes');
      expect(result.mergedJson.data[3].value, 'dest-only: dest only (:regional)').to.equal('Dest only');
      expect(result.mergedJson.data[3][':regional'], 'dest-only row has :regional yes').to.equal('yes');
    });
  });

  describe('getMergedJson', () => {
    it('returns merged multi-sheet JSON with no error for source + dest mocks', () => {
      const result = getMergedJson(sourceJson, destJson);
      expect(result.error).to.equal(false);
      expect(result.finalJson[':names']).to.deep.equal(['default', 'dnt', 'non-default']);
      expect(result.finalJson[':type']).to.equal('multi-sheet');
      expect(result.finalJson.default.data).to.have.lengthOf(4);
      expect(result.finalJson.default.data[0].value).to.equal('Content');
      expect(result.finalJson.default.data[1].value).to.equal('Source value');
      expect(result.finalJson.default.data[2].value).to.equal('Dest value');
      expect(result.finalJson.default.data[3].value).to.equal('Dest only');
      expect(result.finalJson.dnt).to.deep.equal(sourceJson.dnt);
      expect(result.finalJson['non-default']).to.deep.equal(sourceJson['non-default']);
    });

    it('preserves :private from source when dest has no :private', () => {
      const source = { ...sourceJson, ':private': { foo: { data: [] } } };
      const result = getMergedJson(source, destJson);
      expect(result.error).to.equal(false);
      expect(result.finalJson[':private']).to.deep.equal({ foo: { data: [] } });
    });

    it('preserves :private from dest when source has no :private', () => {
      const dest = { ...destJson, ':private': { bar: { x: 1 } } };
      const result = getMergedJson(sourceJson, dest);
      expect(result.error).to.equal(false);
      expect(result.finalJson[':private']).to.deep.equal({ bar: { x: 1 } });
    });

    it('merges :private by key (source wins when both have same key)', () => {
      const source = { ...sourceJson, ':private': { a: { from: 'source' }, c: { only: 'source' } } };
      const dest = { ...destJson, ':private': { a: { from: 'dest' }, b: { only: 'dest' } } };
      const result = getMergedJson(source, dest);
      expect(result.error).to.equal(false);
      expect(result.finalJson[':private'].a).to.deep.equal({ from: 'source' });
      expect(result.finalJson[':private'].b).to.deep.equal({ only: 'dest' });
      expect(result.finalJson[':private'].c).to.deep.equal({ only: 'source' });
    });

    it('uses source for default sheet when :uid/:rollout missing (per-sheet overwrite)', () => {
      const badSource = {
        ':names': ['default', 'dnt'],
        ':type': 'multi-sheet',
        default: {
          data: [
            { key: 'x', value: 'y' },
          ],
        },
        dnt: { data: [] },
      };
      const dest = {
        ':names': ['default', 'dnt'],
        ':type': 'multi-sheet',
        default: {
          data: [
            { key: 'x', value: 'dest' },
          ],
        },
        dnt: { data: [] },
      };
      const result = getMergedJson(badSource, dest);
      expect(result.error).to.equal(false);
      expect(result.finalJson.default).to.equal(badSource.default);
      expect(result.finalJson.default.data[0].value).to.equal('y');
    });
  });
});
