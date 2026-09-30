import { expect } from '@esm-bundle/chai';
import {
  camel, pascal, singular, toFieldName, toTypeName,
} from '../../../../nx/blocks/graphql/utils/sdl.js';

describe('graphql naming', () => {
  it('pascal-cases kebab, camel and spaced values', () => {
    expect(pascal('my-type')).to.equal('MyType');
    expect(pascal('firstName')).to.equal('FirstName');
    expect(pascal('Line item')).to.equal('LineItem');
  });

  it('prefixes names that do not start with a letter', () => {
    expect(pascal('123abc')).to.equal('T123abc');
    expect(pascal('')).to.equal('Type');
  });

  it('camel-cases values', () => {
    expect(camel('blog-post')).to.equal('blogPost');
  });

  it('singularises common plurals', () => {
    expect(singular('Tags')).to.equal('Tag');
    expect(singular('Categories')).to.equal('Category');
    expect(singular('Address')).to.equal('Address');
    expect(singular('Status')).to.equal('Status');
    expect(singular('Matrix')).to.equal('Matrix');
  });

  it('suffixes reserved type names', () => {
    expect(toTypeName('query')).to.equal('QueryType');
    expect(toTypeName('date')).to.equal('DateType');
    expect(toTypeName('article')).to.equal('Article');
  });

  it('sanitises field names', () => {
    expect(toFieldName('first-name')).to.equal('first_name');
    expect(toFieldName('title')).to.equal('title');
    expect(toFieldName('1st')).to.equal('_1st');
    expect(toFieldName('__typename')).to.equal('f__typename');
  });
});
