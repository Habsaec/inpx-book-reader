import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadingPositionProtocolError, saveReadingPosition } from '../inpxClient';
import type { ServerConfig } from '../../types';

const config: ServerConfig = {
  url: 'http://test/',
  username: 'reader',
  password: 'secret',
  connectionStatus: 'connected',
};

describe('reading position request', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends positionVersion 4, exact anchors, and the CAS base revision', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      positionVersion: 4,
      revision: 5,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await saveReadingPosition(
      config,
      'book-1',
      'epubcfi(/6/8)',
      40,
      0.4,
      null,
      {
        sectionIndex: 3,
        textOffset: 1234,
        textQuote: 'Exact words',
        textSectionLength: 9000,
      },
      4,
      'phone-session',
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      position: 'epubcfi(/6/8)',
      progress: 40,
      fraction: 0.4,
      positionVersion: 4,
      baseRevision: 4,
      sessionId: 'phone-session',
      sectionIndex: 3,
      textOffset: 1234,
      textQuote: 'Exact words',
      textSectionLength: 9000,
    });
  });

  it('throws ReadingPositionProtocolError on HTTP 428', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('legacy client', { status: 428 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveReadingPosition(config, 'book-1', '', 0, 0, null, null, 0))
      .rejects
      .toBeInstanceOf(ReadingPositionProtocolError);
  });
});
