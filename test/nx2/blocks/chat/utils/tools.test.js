import { expect } from '@esm-bundle/chai';
import { affectedFolders } from '../../../../../nx2/blocks/chat/utils/tools.js';

const ORG = 'adobe';
const REPO = 'mysite';
const base = { org: ORG, repo: REPO };

describe('affectedFolders', () => {
  describe('guard — missing org/repo', () => {
    it('returns [] when input is null', () => {
      expect(affectedFolders('content_create', null)).to.deep.equal([]);
    });

    it('returns [] when input is undefined', () => {
      expect(affectedFolders('content_create', undefined)).to.deep.equal([]);
    });

    it('returns [] when org is missing', () => {
      expect(affectedFolders('content_create', { repo: REPO, path: '/a/b.md' })).to.deep.equal([]);
    });

    it('returns [] when repo is missing', () => {
      expect(affectedFolders('content_create', { org: ORG, path: '/a/b.md' })).to.deep.equal([]);
    });
  });

  describe('toParent — path resolution', () => {
    it('returns the immediate parent of a deep path', () => {
      const result = affectedFolders('content_create', { ...base, path: '/folder/sub/file.md' });
      expect(result).to.deep.equal([`/${ORG}/${REPO}/folder/sub`]);
    });

    it('returns /org/repo for a file at the repo root', () => {
      const result = affectedFolders('content_create', { ...base, path: '/file.md' });
      expect(result).to.deep.equal([`/${ORG}/${REPO}`]);
    });

    it('handles paths without a leading slash', () => {
      const result = affectedFolders('content_create', { ...base, path: 'folder/file.md' });
      expect(result).to.deep.equal([`/${ORG}/${REPO}/folder`]);
    });

    it('returns [] when path is absent', () => {
      expect(affectedFolders('content_create', { ...base })).to.deep.equal([]);
    });
  });

  describe('content_move', () => {
    it('returns both source and destination parent folders', () => {
      const input = {
        ...base,
        sourcePath: '/src/file.md',
        destinationPath: '/dst/file.md',
      };
      const result = affectedFolders('content_move', input);
      expect(result).to.deep.equal([`/${ORG}/${REPO}/src`, `/${ORG}/${REPO}/dst`]);
    });

    it('deduplicates when source and destination are in the same folder', () => {
      const input = {
        ...base,
        sourcePath: '/shared/a.md',
        destinationPath: '/shared/b.md',
      };
      const result = affectedFolders('content_move', input);
      expect(result).to.deep.equal([`/${ORG}/${REPO}/shared`]);
    });

    it('returns single entry when both paths are at repo root', () => {
      const input = {
        ...base,
        sourcePath: '/a.md',
        destinationPath: '/b.md',
      };
      const result = affectedFolders('content_move', input);
      expect(result).to.deep.equal([`/${ORG}/${REPO}`]);
    });
  });

  describe('content_copy', () => {
    it('returns only the destination parent', () => {
      const input = {
        ...base,
        sourcePath: '/src/file.md',
        destinationPath: '/dst/sub/file.md',
      };
      const result = affectedFolders('content_copy', input);
      expect(result).to.deep.equal([`/${ORG}/${REPO}/dst/sub`]);
    });

    it('does not include the source parent', () => {
      const input = {
        ...base,
        sourcePath: '/original/file.md',
        destinationPath: '/copy/file.md',
      };
      const result = affectedFolders('content_copy', input);
      expect(result).to.not.include(`/${ORG}/${REPO}/original`);
    });
  });

  describe('other tools (content_create, content_delete, content_update, content_upload)', () => {
    for (const toolName of ['content_create', 'content_delete', 'content_update', 'content_upload']) {
      it(`${toolName} — returns parent of input.path`, () => {
        const result = affectedFolders(toolName, { ...base, path: '/docs/page.md' });
        expect(result).to.deep.equal([`/${ORG}/${REPO}/docs`]);
      });
    }

    it('returns [] when path is absent', () => {
      expect(affectedFolders('content_delete', { ...base })).to.deep.equal([]);
    });
  });
});
