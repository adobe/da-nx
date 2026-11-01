import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  collectMultimodalVideoUrls,
  createVideoResolver,
} from '../../../nx/blocks/loc/connectors/glaas/videoAssets.js';
import { writeVideoSelections } from '../../../nx/blocks/loc/connectors/glaas/videoSelections.js';

describe('GLaaS video discovery', () => {
  const discover = (html) => collectMultimodalVideoUrls(
    new DOMParser().parseFromString(html, 'text/html'),
  );

  it('collects production and stage Adobe TV links in document order', () => {
    const html = `
      <main>
        <a href="https://video.tv.adobe.com/v/333754?autoplay=false">Video</a>
        <a href="https://stage-video.tv.adobe.com/v/32079">Stage video</a>
      </main>
    `;
    expect(discover(html)).to.deep.equal([
      'https://video.tv.adobe.com/v/333754?autoplay=false',
      'https://stage-video.tv.adobe.com/v/32079',
    ]);
  });

  describe('GLaaS video metadata resolution', () => {
    const href = 'https://video.tv.adobe.com/v/333754?autoplay=false';
    const mp4 = 'https://images-tv.adobe.com/mpcv3/medium.mp4';
    const videoId = 'baac64d8-f931-4a14-b0e4-6574cb1a6846';
    const parse = (urls, selectedUrls = urls) => {
      const doc = new DOMParser().parseFromString(
        urls.map((url) => `<a href="${url.replaceAll('&', '&amp;')}">Video</a>`).join(''),
        'text/html',
      );
      writeVideoSelections(doc, selectedUrls.map((src) => ({ src, translate: 'true' })));
      return doc;
    };
    const metadataResponse = (sources = [{
      label: 'Medium', format: 'mpeg4', src: mp4, videoID: videoId,
    }]) => (
      new Response(JSON.stringify({ sources }), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const expectFailure = async (promise, message) => {
      const result = await promise;
      expect(result.videos).to.be.instanceOf(Map);
      expect(result.videos.size).to.equal(0);
      expect(result.errors).to.have.length(1);
      expect(result.errors[0].url).to.equal(href);
      expect(result.errors[0].error).to.include(message);
    };

    afterEach(() => sinon.restore());

    it('does not fetch videos when loc-videos metadata is absent', async () => {
      const doc = new DOMParser().parseFromString(`<a href="${href}">Video</a>`, 'text/html');
      const fetchStub = sinon.stub(window, 'fetch');
      const result = await createVideoResolver()(doc);
      expect(result).to.deep.equal({ videos: new Map(), errors: [] });
      expect(fetchStub.called).to.be.false;
    });

    it('does not fetch videos when selections are empty or explicitly unchecked', async () => {
      const fetchStub = sinon.stub(window, 'fetch');
      const resolve = createVideoResolver();
      const emptyResult = await resolve(parse([href], []));
      const doc = parse([href]);
      writeVideoSelections(doc, [{ src: href, translate: 'false' }]);
      const uncheckedResult = await resolve(doc);
      expect(emptyResult).to.deep.equal({ videos: new Map(), errors: [] });
      expect(uncheckedResult).to.deep.equal({ videos: new Map(), errors: [] });
      expect(fetchStub.called).to.be.false;
    });

    it('fetches only selected supported videos still present on the page', async () => {
      const unselected = 'https://video.tv.adobe.com/v/2';
      const removed = 'https://video.tv.adobe.com/v/3';
      const unsupported = 'https://example.com/video';
      const fetchStub = sinon.stub(window, 'fetch').resolves(metadataResponse());
      const result = await createVideoResolver()(
        parse([unselected, href, unsupported], [href, removed, unsupported]),
      );
      expect([...result.videos]).to.deep.equal([[href, { mp4, videoId }]]);
      expect(result.errors).to.deep.equal([]);
      expect(fetchStub.calledOnceWithExactly(`${href}&format=json`)).to.be.true;
    });

    it('keeps query and fragment variants distinct when matching selections', async () => {
      const selected = `${href}#t=10`;
      const otherFragment = `${href}#t=20`;
      const otherQuery = 'https://video.tv.adobe.com/v/333754?autoplay=true#t=10';
      const fetchStub = sinon.stub(window, 'fetch').resolves(metadataResponse());
      const result = await createVideoResolver()(
        parse([otherFragment, otherQuery, selected], [selected]),
      );
      expect([...result.videos]).to.deep.equal([[selected, { mp4, videoId }]]);
      expect(fetchStub.calledOnceWithExactly(`${href}&format=json`)).to.be.true;
    });

    it('matches normalized selections but keeps the original URL as the result key', async () => {
      const original = 'https://video.tv.adobe.com/v/333754?title=First Last#Part 1';
      const fetchStub = sinon.stub(window, 'fetch').resolves(metadataResponse());
      const result = await createVideoResolver()(parse([original]));
      expect([...result.videos]).to.deep.equal([[original, { mp4, videoId }]]);
      expect(fetchStub.calledOnceWithExactly(
        'https://video.tv.adobe.com/v/333754?title=First+Last&format=json',
      )).to.be.true;
    });

    it('does not return a previously cached video after it is deselected', async () => {
      const fetchStub = sinon.stub(window, 'fetch').resolves(metadataResponse());
      const resolve = createVideoResolver();
      await resolve(parse([href]));
      const result = await resolve(parse([href], []));
      expect(result).to.deep.equal({ videos: new Map(), errors: [] });
      expect(fetchStub.callCount).to.equal(1);
    });

    it('reads selections and resolves videos without parsing the document again', async () => {
      const doc = parse([href]);
      const parseSpy = sinon.spy(DOMParser.prototype, 'parseFromString');
      sinon.stub(window, 'fetch').resolves(metadataResponse());
      const result = await createVideoResolver()(doc);
      expect([...result.videos]).to.deep.equal([[href, { mp4, videoId }]]);
      expect(parseSpy.called).to.be.false;
    });

    it('maps original URLs to Medium MP4 and videoId, excluding HLS and other MP4 sizes', async () => {
      const fetchStub = sinon.stub(window, 'fetch').resolves(metadataResponse([
        {
          label: 'Medium',
          format: 'mpeg-ts',
          src: 'https://images-tv.adobe.com/medium.m3u8',
          videoID: 'hls-id',
        },
        {
          label: 'HD', format: 'mpeg4', src: 'https://images-tv.adobe.com/hd.mp4', videoID: 'hd-id',
        },
        {
          label: 'Medium', format: 'mpeg4', src: mp4, videoID: videoId,
        },
      ]));
      const resolve = createVideoResolver();
      const result = await resolve(parse([href]));
      expect(result.videos).to.be.instanceOf(Map);
      expect([...result.videos]).to.deep.equal([[href, { mp4, videoId }]]);
      expect(result).to.have.all.keys('videos', 'errors');
      expect(result.errors).to.deep.equal([]);
      expect(fetchStub.calledOnceWithExactly(`${href}&format=json`)).to.be.true;
    });

    it('replaces an existing format parameter and strips fragments only from metadata requests', async () => {
      const original = 'https://video.tv.adobe.com/v/333754?format=xml&autoplay=false#t=10';
      const fetchStub = sinon.stub(window, 'fetch').resolves(metadataResponse());
      const result = await createVideoResolver()(parse([original]));
      expect(result.videos.get(original)).to.deep.equal({ mp4, videoId });
      expect(fetchStub.calledOnceWithExactly(
        'https://video.tv.adobe.com/v/333754?format=json&autoplay=false',
      )).to.be.true;
    });

    it('adds format=json to URLs without query parameters', async () => {
      const fetchStub = sinon.stub(window, 'fetch').resolves(metadataResponse());
      await createVideoResolver()(parse(['https://video.tv.adobe.com/v/333754']));
      expect(fetchStub.calledOnceWithExactly(
        'https://video.tv.adobe.com/v/333754?format=json',
      )).to.be.true;
    });

    it('reuses resolved videos across pages in the same task without sharing between tasks', async () => {
      const fetchStub = sinon.stub(window, 'fetch').callsFake(async () => metadataResponse());
      const resolve = createVideoResolver();
      expect((await resolve(parse([href, href]))).videos.get(href)).to.deep.equal({ mp4, videoId });
      expect((await resolve(parse([href]))).videos.get(href)).to.deep.equal({ mp4, videoId });
      expect(fetchStub.callCount).to.equal(1);
      expect((await createVideoResolver()(parse([href]))).videos.get(href))
        .to.deep.equal({ mp4, videoId });
      expect(fetchStub.callCount).to.equal(2);
    });

    it('shares an in-flight lookup across concurrent page resolutions', async () => {
      const fetchStub = sinon.stub(window, 'fetch').callsFake(async () => metadataResponse());
      const resolve = createVideoResolver();
      const [first, second] = await Promise.all([
        resolve(parse([href])),
        resolve(parse([href])),
      ]);
      expect(first.videos.get(href)).to.deep.equal({ mp4, videoId });
      expect(second.videos.get(href)).to.deep.equal({ mp4, videoId });
      expect(fetchStub.callCount).to.equal(1);
    });

    it('reuses metadata for different fragments while retaining both original URLs', async () => {
      const fetchStub = sinon.stub(window, 'fetch').resolves(metadataResponse());
      const first = `${href}#t=10`;
      const second = `${href}#t=20`;
      const result = await createVideoResolver()(parse([first, second]));
      expect([...result.videos]).to.deep.equal([
        [first, { mp4, videoId }],
        [second, { mp4, videoId }],
      ]);
      expect(fetchStub.callCount).to.equal(1);
    });

    it('keeps stage, production and different query parameters separate in the cache', async () => {
      const stage = 'https://stage-video.tv.adobe.com/v/333754?autoplay=false';
      const differentQuery = 'https://video.tv.adobe.com/v/333754?autoplay=true';
      const fetchStub = sinon.stub(window, 'fetch').callsFake(async () => metadataResponse());
      const result = await createVideoResolver()(parse([href, stage, differentQuery]));
      expect([...result.videos.keys()]).to.deep.equal([href, stage, differentQuery]);
      expect(fetchStub.callCount).to.equal(3);
      expect(fetchStub.calledWithExactly(`${stage}&format=json`)).to.be.true;
    });

    it('does not parse the supplied document again or fetch when there are no supported links', async () => {
      const doc = parse(['https://example.com/v/1']);
      const parseSpy = sinon.spy(DOMParser.prototype, 'parseFromString');
      const fetchStub = sinon.stub(window, 'fetch');
      const result = await createVideoResolver()(doc);
      expect([...result.videos]).to.deep.equal([]);
      expect(result.errors).to.deep.equal([]);
      expect(parseSpy.called).to.be.false;
      expect(fetchStub.called).to.be.false;
    });

    it('preserves signed query parameters in the selected MP4 URL', async () => {
      const signedMp4 = `${mp4}?signature=AbC%2F123&expires=456`;
      sinon.stub(window, 'fetch').resolves(metadataResponse([
        {
          label: 'Medium', format: 'mpeg4', src: signedMp4, videoID: videoId,
        },
      ]));
      expect((await createVideoResolver()(parse([href]))).videos.get(href))
        .to.deep.equal({ mp4: signedMp4, videoId });
    });

    it('returns HTTP errors with the original URL and allows a later retry', async () => {
      const fetchStub = sinon.stub(window, 'fetch');
      fetchStub.onFirstCall().resolves(new Response('', { status: 503 }));
      fetchStub.onSecondCall().resolves(metadataResponse());
      const resolve = createVideoResolver();
      await expectFailure(resolve(parse([href])), 'Metadata request failed (HTTP 503).');
      expect((await resolve(parse([href]))).videos.get(href)).to.deep.equal({ mp4, videoId });
      expect(fetchStub.callCount).to.equal(2);
    });

    it('surfaces network failures and allows a later retry', async () => {
      const fetchStub = sinon.stub(window, 'fetch');
      fetchStub.onFirstCall().rejects(new TypeError('Failed to fetch'));
      fetchStub.onSecondCall().resolves(metadataResponse());
      const resolve = createVideoResolver();
      await expectFailure(resolve(parse([href])), 'Failed to fetch');
      expect((await resolve(parse([href]))).videos.get(href)).to.deep.equal({ mp4, videoId });
    });

    it('returns a reported error when metadata is not valid JSON', async () => {
      sinon.stub(window, 'fetch').resolves(new Response('not json'));
      await expectFailure(createVideoResolver()(parse([href])), 'JSON');
    });

    it('resolves remaining videos and collects failures into one result', async () => {
      const broken = 'https://video.tv.adobe.com/v/2';
      const anotherBroken = 'https://stage-video.tv.adobe.com/v/3';
      const last = 'https://video.tv.adobe.com/v/4';
      const fetchStub = sinon.stub(window, 'fetch');
      fetchStub.onCall(0).resolves(metadataResponse());
      fetchStub.onCall(1).resolves(new Response('', { status: 404 }));
      fetchStub.onCall(2).resolves(metadataResponse([]));
      fetchStub.onCall(3).resolves(metadataResponse());
      const result = await createVideoResolver()(parse([href, broken, anotherBroken, last]));
      expect([...result.videos]).to.deep.equal([
        [href, { mp4, videoId }],
        [last, { mp4, videoId }],
      ]);
      expect(result.errors).to.deep.equal([
        { url: broken, error: 'Metadata request failed (HTTP 404).' },
        { url: anotherBroken, error: 'Medium MPEG4 rendition not found.' },
      ]);
      expect(fetchStub.callCount).to.equal(4);
    });

    it('retains successful cached videos when a failed video is retried on another page', async () => {
      const broken = 'https://video.tv.adobe.com/v/2';
      const fetchStub = sinon.stub(window, 'fetch');
      fetchStub.onCall(0).resolves(new Response('', { status: 503 }));
      fetchStub.onCall(1).resolves(metadataResponse());
      fetchStub.onCall(2).resolves(metadataResponse());
      const resolve = createVideoResolver();
      const first = await resolve(parse([broken, href]));
      expect([...first.videos]).to.deep.equal([[href, { mp4, videoId }]]);
      expect(first.errors).to.have.length(1);
      const second = await resolve(parse([broken, href]));
      expect([...second.videos]).to.deep.equal([
        [broken, { mp4, videoId }],
        [href, { mp4, videoId }],
      ]);
      expect(second.errors).to.deep.equal([]);
      expect(fetchStub.callCount).to.equal(3);
    });

    [undefined, null, 42, '', '   '].forEach((id) => {
      it(`reports a missing or invalid rendition videoID ${JSON.stringify(id)}`, async () => {
        sinon.stub(window, 'fetch').resolves(metadataResponse([
          {
            label: 'Medium', format: 'mpeg4', src: mp4, videoID: id,
          },
        ]));
        await expectFailure(
          createVideoResolver()(parse([href])),
          'Medium MPEG4 rendition has no videoID.',
        );
      });
    });

    it('does not substitute a top-level videoID for the selected rendition ID', async () => {
      sinon.stub(window, 'fetch').resolves(new Response(JSON.stringify({
        videoID: 'top-level-id',
        sources: [{ label: 'Medium', format: 'mpeg4', src: mp4 }],
      })));
      await expectFailure(
        createVideoResolver()(parse([href])),
        'Medium MPEG4 rendition has no videoID.',
      );
    });

    it('continues after a missing videoID and retries that video on a later page', async () => {
      const another = 'https://video.tv.adobe.com/v/2';
      const anotherId = 'another-video-id';
      const fetchStub = sinon.stub(window, 'fetch');
      fetchStub.onCall(0).resolves(metadataResponse([
        { label: 'Medium', format: 'mpeg4', src: mp4 },
      ]));
      fetchStub.onCall(1).resolves(metadataResponse([
        {
          label: 'Medium', format: 'mpeg4', src: mp4, videoID: anotherId,
        },
      ]));
      fetchStub.onCall(2).resolves(metadataResponse());
      const resolve = createVideoResolver();
      const first = await resolve(parse([href, another]));
      expect([...first.videos]).to.deep.equal([[another, { mp4, videoId: anotherId }]]);
      expect(first.errors).to.deep.equal([
        { url: href, error: 'Medium MPEG4 rendition has no videoID.' },
      ]);
      const second = await resolve(parse([href, another]));
      expect([...second.videos]).to.deep.equal([
        [href, { mp4, videoId }],
        [another, { mp4, videoId: anotherId }],
      ]);
      expect(second.errors).to.deep.equal([]);
      expect(fetchStub.callCount).to.equal(3);
    });

    [undefined, {}, [], [
      { label: 'Medium', format: 'mpeg-ts', src: 'https://images-tv.adobe.com/medium.m3u8' },
    ], [
      { label: 'HD', format: 'mpeg4', src: mp4 },
    ], [
      { label: 'Medium', format: 'mpeg4' },
    ]].forEach((sources) => {
      it(`reports missing Medium MPEG4 for sources ${JSON.stringify(sources)}`, async () => {
        sinon.stub(window, 'fetch').resolves(new Response(JSON.stringify({ sources })));
        await expectFailure(createVideoResolver()(parse([href])), 'Medium MPEG4 rendition not found.');
      });
    });

    [
      'http://images-tv.adobe.com/video.mp4',
      'https://images-tv.adobe.com/video.m3u8',
      '/video.mp4',
    ].forEach((src) => {
      it(`rejects an invalid Medium MPEG4 URL ${src}`, async () => {
        sinon.stub(window, 'fetch').resolves(metadataResponse([
          { label: 'Medium', format: 'mpeg4', src },
        ]));
        const result = await createVideoResolver()(parse([href]));
        expect(result.videos.size).to.equal(0);
        expect(result.errors).to.have.length(1);
        expect(result.errors[0].url).to.equal(href);
        expect(result.errors[0].error).not.to.equal('');
      });
    });
  });

  it('ignores iframe, video and nested video source URLs', () => {
    const html = `
      <iframe src="https://video.tv.adobe.com/v/1"></iframe>
      <video src="https://stage-video.tv.adobe.com/v/2"></video>
      <video><source src="https://video.tv.adobe.com/v/3"></video>
    `;
    expect(discover(html)).to.deep.equal([]);
  });

  it('deduplicates repeated anchors, retaining first occurrence order', () => {
    const html = `
      <a href="https://video.tv.adobe.com/v/1">First</a>
      <a href="https://stage-video.tv.adobe.com/v/2">Second</a>
      <a href="https://video.tv.adobe.com/v/1">Repeated</a>
    `;
    expect(discover(html)).to.deep.equal([
      'https://video.tv.adobe.com/v/1',
      'https://stage-video.tv.adobe.com/v/2',
    ]);
  });

  it('preserves query parameters, encoded values and fragments', () => {
    const href = 'https://video.tv.adobe.com/v/333754?autoplay=false&token=AbC%2F123#t=10';
    const html = `<a href="${href.replaceAll('&', '&amp;')}">Video</a>`;
    expect(discover(html)).to.deep.equal([href]);
  });

  it('keeps different playback URLs and environments distinct', () => {
    const html = `
      <a href="https://video.tv.adobe.com/v/1?autoplay=false">One</a>
      <a href="https://video.tv.adobe.com/v/1?autoplay=true">Two</a>
      <a href="https://video.tv.adobe.com/v/1#t=10">Three</a>
      <a href="https://stage-video.tv.adobe.com/v/1?autoplay=false">Four</a>
    `;
    expect(discover(html)).to.deep.equal([
      'https://video.tv.adobe.com/v/1?autoplay=false',
      'https://video.tv.adobe.com/v/1?autoplay=true',
      'https://video.tv.adobe.com/v/1#t=10',
      'https://stage-video.tv.adobe.com/v/1?autoplay=false',
    ]);
  });

  it('trims surrounding attribute whitespace before deduplication', () => {
    const html = `
      <a href="  https://video.tv.adobe.com/v/1  ">One</a>
      <a href="https://video.tv.adobe.com/v/1">Two</a>
    `;
    expect(discover(html)).to.deep.equal([
      'https://video.tv.adobe.com/v/1',
    ]);
  });

  [
    'http://video.tv.adobe.com/v/1',
    'http://stage-video.tv.adobe.com/v/1',
    '//video.tv.adobe.com/v/1',
    '/v/1',
    './video.tv.adobe.com/v/1',
    'https://video.tv.adobe.com.evil.example/v/1',
    'https://evil-video.tv.adobe.com/v/1',
    'https://stage-video.tv.adobe.com.evil.example/v/1',
    'https://video.tv.adobe.com@evil.example/v/1',
    'https://user:password@video.tv.adobe.com/v/1',
    'https://video.tv.adobe.com:8443/v/1',
    'https://example.com/?video=https://video.tv.adobe.com/v/1',
    'https://images-tv.adobe.com/video.mp4',
    'data:video/mp4;base64,AAAA',
    'https://',
    '',
  ].forEach((href) => {
    it(`ignores unsupported URL ${JSON.stringify(href)}`, () => {
      expect(discover(`<a href="${href}">Link</a>`)).to.deep.equal([]);
    });
  });

  it('ignores plain text, comments, scripts, unrelated attributes and audio sources', () => {
    const html = `
      <p>https://video.tv.adobe.com/v/1</p>
      <!-- <a href="https://video.tv.adobe.com/v/2">Comment</a> -->
      <script type="application/json">{"url":"https://video.tv.adobe.com/v/3"}</script>
      <img src="https://video.tv.adobe.com/v/4">
      <div data-video="https://video.tv.adobe.com/v/5"></div>
      <audio><source src="https://video.tv.adobe.com/v/6"></audio>
      <a>Missing href</a><iframe></iframe><video></video>
    `;
    expect(discover(html)).to.deep.equal([]);
  });

  it('returns no URLs for empty content or a page without videos', () => {
    expect(discover('')).to.deep.equal([]);
    expect(discover('<main><p>No videos</p></main>')).to.deep.equal([]);
  });
});
