import { expect } from '@esm-bundle/chai';
import { groupUrlsByWorkflow } from '../../../nx/blocks/loc/connectors/glaas/locPageRules.js';

describe('locPageRules', () => {
  describe('groupUrlsByWorkflow', () => {
    it('should handle complex page rules with multiple workflows and languages', () => {
      const urls = [
        '/drafts/bhagwath/html-demo/test-highlight',
        '/drafts/bhagwath/html-demo/dnt-test',
        '/drafts/bhagwath/test/exception.json',
        '/drafts/bhagwath/test1/transcreate',
        '/drafts/bhagwath/test/translate-doc',
      ];

      const languageObjects = [
        { code: 'de', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
        { code: 'fr', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
        { code: 'ja', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
      ];

      const config = {
        'loc-page-rules': {
          data: [
            { url: '/drafts/bhagwath/html-demo/*', languages: 'de, fr', workflow: 'WCMS_Transcreation/WCMS_Transcreation', workflowName: 'Transcreation' },
            { url: '/drafts/bhagwath/html-demo/dnt-test', languages: 'de, fr', workflow: 'WCMS/WCMS', workflowName: 'Human Translation' },
            { url: '/drafts/bhagwath/test/*.json', languages: 'ja', workflow: 'WCMS_Transcreation/WCMS_Transcreation', workflowName: 'Transcreation' },
            { url: '/drafts/bhagwath/test1/transcreate', languages: 'ja, de, fr', workflow: 'WCMS_Transcreation/WCMS_Transcreation', workflowName: 'Transcreation' },
          ],
        },
      };

      const result = groupUrlsByWorkflow(urls, languageObjects, config);

      const expected = {
        'WCMS_Transcreation/WCMS_Transcreation/Transcreation': [
          {
            languages: ['de', 'fr'],
            urlPaths: [
              '/drafts/bhagwath/html-demo/test-highlight',
              '/drafts/bhagwath/test1/transcreate',
            ],
          },
          {
            languages: ['ja'],
            urlPaths: [
              '/drafts/bhagwath/test/exception.json',
              '/drafts/bhagwath/test1/transcreate',
            ],
          },
        ],
        'WCMS/WCMS/Human Translation': [
          {
            languages: ['de', 'fr'],
            urlPaths: ['/drafts/bhagwath/html-demo/dnt-test'],
          },
        ],
        'WCMS/DX/Human Translation': [
          {
            languages: ['de', 'fr'],
            urlPaths: [
              '/drafts/bhagwath/test/exception.json',
              '/drafts/bhagwath/test/translate-doc',
            ],
          },
          {
            languages: ['ja'],
            urlPaths: [
              '/drafts/bhagwath/html-demo/dnt-test',
              '/drafts/bhagwath/html-demo/test-highlight',
              '/drafts/bhagwath/test/translate-doc',
            ],
          },
        ],
      };

      expect(result).to.deep.equal(expected);
    });

    it('should handle complex multi-workflow scenarios', () => {
      const urls = [
        '/api/data.json',
        '/products/photoshop/experience-manager/',
        '/products/premium/photoshop/',
      ];
      const languageObjects = [
        { code: 'de', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
        { code: 'fr', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
        { code: 'ja', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
      ];
      const config = {
        'loc-page-rules': {
          data: [
            // JSON files: de, ja get specific workflow, fr falls back
            { url: '*.json', languages: 'de, ja', workflow: 'WCMS/WCMS', workflowName: 'Human Translation' },
            // Exact match: all languages get specific workflow
            { url: '/products/photoshop/experience-manager/', languages: 'de, fr, ja', workflow: 'WCMS_FASTLANE/FASTLANE', workflowName: 'Machine Translation' },
            // Premium products: fr, ja get specific workflow, de falls back
            { url: '/products/premium/*', languages: 'fr, ja', workflow: 'WCMS/WCMS', workflowName: 'Human Translation' },
          ],
        },
      };

      const result = groupUrlsByWorkflow(urls, languageObjects, config);

      const expected = {
        'WCMS/WCMS/Human Translation': [
          {
            languages: ['de'],
            urlPaths: ['/api/data.json'],
          },
          {
            languages: ['ja'],
            urlPaths: ['/api/data.json', '/products/premium/photoshop/'],
          },
          {
            languages: ['fr'],
            urlPaths: ['/products/premium/photoshop/'],
          },
        ],
        'WCMS_FASTLANE/FASTLANE/Machine Translation': [
          {
            languages: ['de', 'fr', 'ja'],
            urlPaths: ['/products/photoshop/experience-manager/'],
          },
        ],
        'WCMS/DX/Human Translation': [
          {
            languages: ['de'],
            urlPaths: ['/products/premium/photoshop/'],
          },
          {
            languages: ['fr'],
            urlPaths: ['/api/data.json'],
          },
        ],
      };

      expect(result).to.deep.equal(expected);
    });

    it('should handle simple multiple URLs with default workflows', () => {
      const urls = ['/page1', '/page2'];
      const languageObjects = [
        { code: 'de', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
        { code: 'fr', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
      ];
      const config = {};

      const result = groupUrlsByWorkflow(urls, languageObjects, config);

      const expected = {
        'WCMS/DX/Human Translation': [
          {
            languages: ['de', 'fr'],
            urlPaths: ['/page1', '/page2'],
          },
        ],
      };

      console.log('🔍 SIMPLE TEST - Expected result:', JSON.stringify(expected, null, 2));

      expect(result).to.deep.equal(expected);
    });

    it('should handle single URL with multiple languages', () => {
      const urls = ['/single-page'];
      const languageObjects = [
        { code: 'de', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
        { code: 'fr', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
        { code: 'ja', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
      ];
      const config = {};

      const result = groupUrlsByWorkflow(urls, languageObjects, config);

      const expected = {
        'WCMS/DX/Human Translation': [
          {
            languages: ['de', 'fr', 'ja'],
            urlPaths: ['/single-page'],
          },
        ],
      };

      expect(result).to.deep.equal(expected);
    });

    it('should handle single language', () => {
      const urls = ['/page1', '/page2'];
      const languageObjects = [
        { code: 'de', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
      ];
      const config = {};

      const result = groupUrlsByWorkflow(urls, languageObjects, config);

      const expected = {
        'WCMS/DX/Human Translation': [
          {
            languages: ['de'],
            urlPaths: ['/page1', '/page2'],
          },
        ],
      };

      expect(result).to.deep.equal(expected);
    });

    it('should handle empty config gracefully', () => {
      const urls = ['/page1'];
      const languageObjects = [
        { code: 'de', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
      ];
      const config = {};

      const result = groupUrlsByWorkflow(urls, languageObjects, config);

      const expected = {
        'WCMS/DX/Human Translation': [
          {
            languages: ['de'],
            urlPaths: ['/page1'],
          },
        ],
      };

      expect(result).to.deep.equal(expected);
    });

    it('should handle missing loc-page-rules gracefully', () => {
      const urls = ['/page1'];
      const languageObjects = [
        { code: 'de', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
      ];
      const config = { 'loc-page-rules': {} };

      const result = groupUrlsByWorkflow(urls, languageObjects, config);

      const expected = {
        'WCMS/DX/Human Translation': [
          {
            languages: ['de'],
            urlPaths: ['/page1'],
          },
        ],
      };

      expect(result).to.deep.equal(expected);
    });

    it('should handle null/undefined config', () => {
      const urls = ['/page1'];
      const languageObjects = [
        { code: 'de', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
      ];

      const result = groupUrlsByWorkflow(urls, languageObjects, null);

      expect(result).to.deep.equal({});
    });

    it('should handle wildcard patterns correctly', () => {
      const urls = [
        '/drafts/bhagwath/test/file1.json',
        '/drafts/bhagwath/test/file2.json',
        '/drafts/bhagwath/other/page.html',
      ];
      const languageObjects = [
        { code: 'ja', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
      ];
      const config = {
        'loc-page-rules': {
          data: [
            { url: '/drafts/bhagwath/test/*.json', languages: 'ja', workflow: 'WCMS_Transcreation/WCMS_Transcreation', workflowName: 'Transcreation' },
          ],
        },
      };

      const result = groupUrlsByWorkflow(urls, languageObjects, config);

      const expected = {
        'WCMS_Transcreation/WCMS_Transcreation/Transcreation': [
          {
            languages: ['ja'],
            urlPaths: [
              '/drafts/bhagwath/test/file1.json',
              '/drafts/bhagwath/test/file2.json',
            ],
          },
        ],
        'WCMS/DX/Human Translation': [
          {
            languages: ['ja'],
            urlPaths: ['/drafts/bhagwath/other/page.html'],
          },
        ],
      };

      expect(result).to.deep.equal(expected);
    });

    it('should handle edge cases with malformed config', () => {
      const urls = ['/page1'];
      const languageObjects = [
        { code: 'de', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
      ];
      const config = {
        'loc-page-rules': {
          data: [
            null,
            { url: '', languages: 'de', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
            { url: '/page1', languages: '', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
          ],
        },
      };

      const result = groupUrlsByWorkflow(urls, languageObjects, config);

      const expected = {
        'WCMS/DX/Human Translation': [
          {
            languages: ['de'],
            urlPaths: ['/page1'],
          },
        ],
      };

      expect(result).to.deep.equal(expected);
    });

    it('should prioritize exact matches over wildcard patterns', () => {
      const urls = ['/products/photoshop/experience-manager/'];
      const languageObjects = [
        { code: 'de', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
        { code: 'fr', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
        { code: 'ja', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
      ];
      const config = {
        'loc-page-rules': {
          data: [
            // Wildcard rule (should be ignored)
            { url: '/products/*', languages: 'de, fr, ja', workflow: 'WCMS/WCMS', workflowName: 'Human Translation' },
            // Exact match rule (should take priority)
            { url: '/products/photoshop/experience-manager/', languages: 'de, fr, ja', workflow: 'WCMS_FASTLANE/FASTLANE', workflowName: 'Machine Translation' },
          ],
        },
      };

      const result = groupUrlsByWorkflow(urls, languageObjects, config);

      const expected = {
        'WCMS_FASTLANE/FASTLANE/Machine Translation': [
          {
            languages: ['de', 'fr', 'ja'],
            urlPaths: ['/products/photoshop/experience-manager/'],
          },
        ],
      };

      expect(result).to.deep.equal(expected);
    });

    it('should apply workflows to specified languages only', () => {
      const urls = ['/products/photoshop/experience-manager/'];
      const languageObjects = [
        { code: 'de', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
        { code: 'fr', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
        { code: 'ja', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
        { code: 'es', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
        { code: 'it', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
      ];
      const config = {
        'loc-page-rules': {
          data: [
            // Only de, fr, ja get specific workflow
            { url: '/products/photoshop/experience-manager/', languages: 'de, fr, ja', workflow: 'WCMS_FASTLANE/FASTLANE', workflowName: 'Machine Translation' },
          ],
        },
      };

      const result = groupUrlsByWorkflow(urls, languageObjects, config);

      const expected = {
        'WCMS_FASTLANE/FASTLANE/Machine Translation': [
          {
            languages: ['de', 'fr', 'ja'],
            urlPaths: ['/products/photoshop/experience-manager/'],
          },
        ],
        'WCMS/DX/Human Translation': [
          {
            languages: ['es', 'it'],
            urlPaths: ['/products/photoshop/experience-manager/'],
          },
        ],
      };

      expect(result).to.deep.equal(expected);
    });

    it('should handle langstore paths correctly', () => {
      const urls = ['/langstore/en/products/photoshop/experience-manager/'];
      const languageObjects = [
        { code: 'de', workflow: 'WCMS/DX', workflowName: 'Human Translation' },
      ];
      const config = {
        'loc-page-rules': {
          data: [
            // Pattern should match the normalized URL (without langstore prefix)
            { url: '/products/photoshop/experience-manager/', languages: 'de', workflow: 'WCMS_FASTLANE/FASTLANE', workflowName: 'Machine Translation' },
          ],
        },
      };

      const result = groupUrlsByWorkflow(urls, languageObjects, config);

      const expected = {
        'WCMS_FASTLANE/FASTLANE/Machine Translation': [
          {
            languages: ['de'],
            urlPaths: ['/langstore/en/products/photoshop/experience-manager/'],
          },
        ],
      };

      expect(result).to.deep.equal(expected);
    });
  });
});
