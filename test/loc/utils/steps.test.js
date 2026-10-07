import { expect } from '@esm-bundle/chai';
import { calculateView } from '../../../nx/blocks/loc/utils/steps.js';

describe('Steps - Complete project availability', () => {
  it('Disables complete when a translate lang is still in progress', () => {
    const project = {
      view: 'translate',
      langs: [
        { action: 'translate', translation: { status: 'sent' } },
      ],
    };
    const next = calculateView({ project, currentView: 'translate', direction: 'next' });
    expect(next.disabled).to.be.true;
  });

  it('Enables complete when all translate langs are complete', () => {
    const project = {
      view: 'translate',
      langs: [
        { action: 'translate', translation: { status: 'complete' } },
      ],
    };
    const next = calculateView({ project, currentView: 'translate', direction: 'next' });
    expect(next.disabled).to.be.false;
  });

  it('Enables complete when a translate lang is cancelled', () => {
    const project = {
      view: 'translate',
      langs: [
        { action: 'translate', translation: { status: 'complete' } },
        { action: 'translate', translation: { status: 'cancelled' } },
      ],
    };
    const next = calculateView({ project, currentView: 'translate', direction: 'next' });
    expect(next.disabled).to.be.false;
  });

  it('Enables complete when a copy lang is cancelled', () => {
    const project = {
      view: 'translate',
      langs: [
        { action: 'copy', copy: { status: 'cancelled' } },
      ],
    };
    const next = calculateView({ project, currentView: 'translate', direction: 'next' });
    expect(next.disabled).to.be.false;
  });

  it('Enables complete via rollout when a translate lang was cancelled', () => {
    const project = {
      view: 'rollout',
      langs: [
        {
          action: 'translate',
          translation: { status: 'complete' },
          locales: ['en-us'],
          rollout: { status: 'complete' },
        },
        { action: 'translate', translation: { status: 'cancelled' }, locales: ['fr-fr'] },
      ],
    };
    const next = calculateView({ project, currentView: 'rollout', direction: 'next' });
    expect(next.disabled).to.be.false;
  });

  it('Disables complete via rollout when a non-cancelled lang has not rolled out', () => {
    const project = {
      view: 'rollout',
      langs: [
        {
          action: 'translate',
          translation: { status: 'complete' },
          locales: ['en-us'],
        },
      ],
    };
    const next = calculateView({ project, currentView: 'rollout', direction: 'next' });
    expect(next.disabled).to.be.true;
  });
});
