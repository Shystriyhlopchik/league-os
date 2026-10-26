import { ConfigService } from '@nestjs/config';
import { VkDeliveryError, VkNewsClient } from './vk-news.client';

describe('VkNewsClient', () => {
  let client: VkNewsClient;
  let fetchMock: jest.SpyInstance;
  const articleUrl = 'https://liga-dvora.ru/news/results?utm_source=vk';
  beforeEach(() => {
    client = new VkNewsClient(
      new ConfigService({
        VK_PUBLISHING_ENABLED: 'true',
        VK_GROUP_ID: '123',
        VK_NEWS_COMMUNITY_ID: '7',
        VK_ACCESS_TOKEN: 'secret-must-not-leak',
        FRONTEND_URL: 'https://liga-dvora.ru',
        NODE_ENV: 'production',
      }),
    );
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('never exposes tokens and pins the connection to its community', () => {
    expect(client.connection(7)).toEqual({
      configured: true,
      groupId: '123',
      groupUrl: 'https://vk.com/club123',
    });
    expect(client.connection(8).configured).toBe(false);
    expect(() => client.requireConnection(7, '999')).toThrow();
    expect(JSON.stringify(client.connection(7))).not.toContain('secret');
  });

  it('sends as the community with a stable guid and only returns confirmed post IDs', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ response: { post_id: 99 } })),
    );
    await expect(
      client.post('123', 'Анонс', 'same-guid', articleUrl),
    ).resolves.toBe('https://vk.com/wall-123_99');
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('from_group')).toBe('1');
    expect(body.get('owner_id')).toBe('-123');
    expect(body.get('guid')).toBe('same-guid');
    expect(body.get('attachments')).toBe(articleUrl);
    expect(body.get('attachments')).not.toContain('photo-');
    expect(fetchMock.mock.calls[0][0]).not.toContain('secret');
  });

  it.each([5, 7, 14, 15, 27, 28, 200])(
    'sanitizes VK error %s without exposing request_params',
    async (code) => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              error_code: code,
              error_msg: 'secret-must-not-leak',
              request_params: [
                { key: 'access_token', value: 'secret-must-not-leak' },
              ],
            },
          }),
        ),
      );
      const error = await client
        .post('123', 'Текст', 'guid', articleUrl)
        .catch((e) => e as VkDeliveryError);
      expect(error).toBeInstanceOf(VkDeliveryError);
      expect(error.message).not.toContain('secret');
      expect(error.retryable).toBe(false);
      expect(error.uncertain).toBe(false);
    },
  );

  it('allows rate-rejection retry, but treats internal wall errors as uncertain', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { error_code: 6 } })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { error_code: 10 } })),
      );
    await expect(
      client.post('123', 'Текст', 'guid', articleUrl),
    ).rejects.toMatchObject({
      retryable: true,
      uncertain: false,
    });
    await expect(
      client.post('123', 'Текст', 'guid', articleUrl),
    ).rejects.toMatchObject({
      retryable: false,
      uncertain: true,
    });
  });

  it.each(['network', 'http', 'json', 'no-id'])(
    'does not blindly retry ambiguous wall.post outcome: %s',
    async (kind) => {
      if (kind === 'network')
        fetchMock.mockRejectedValue(new Error('timeout with secret'));
      else
        fetchMock.mockResolvedValue(
          kind === 'http'
            ? new Response('', { status: 503 })
            : kind === 'json'
              ? new Response('not json')
              : new Response(JSON.stringify({ response: {} })),
        );
      await expect(
        client.post('123', 'Текст', 'guid', articleUrl),
      ).rejects.toMatchObject({
        uncertain: true,
        retryable: false,
      });
    },
  );

  it('checks a community key with wall permission without requiring user admin fields', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: {
              mask: 12293,
              permissions: [
                { name: 'wall', setting: 8192 },
                { name: 'photos', setting: 4 },
              ],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: {
              groups: [{ id: 123, name: 'Лига' }],
            },
          }),
        ),
      );
    await expect(client.check(7)).resolves.toMatchObject({
      name: 'Лига',
      configured: true,
      tokenType: 'community',
      publicationVerified: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('groups.getTokenPermissions');
    expect(fetchMock.mock.calls[1][0]).toContain('groups.getById');
    expect(
      fetchMock.mock.calls.some(
        ([url]) =>
          String(url).includes('wall.post') || String(url).includes('photos.'),
      ),
    ).toBe(false);
  });

  it('accepts a wall-only community key and rejects missing wall permission', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: {
              mask: 8192,
              permissions: [{ name: 'wall', setting: 8192 }],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ response: [{ id: 123, name: 'Лига' }] })),
      );
    await expect(client.check(7)).resolves.toMatchObject({
      tokenType: 'community',
    });
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: {
              mask: 4,
              permissions: [{ name: 'photos', setting: 4 }],
            },
          }),
        ),
      );
    await expect(client.check(7)).rejects.toThrow('нет разрешения wall');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '8192', -1, 1.5])(
    'rejects malformed permission masks: %s',
    async (mask) => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ response: { mask } })),
      );
      await expect(client.check(7)).rejects.toThrow('нет разрешения wall');
    },
  );

  it('preserves user-key checks when the community-permissions method rejects that token type', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { error_code: 27 } })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: {
              groups: [{ id: 123, name: 'Лига', is_admin: 1, admin_level: 2 }],
            },
          }),
        ),
      );
    await expect(client.check(7)).resolves.toMatchObject({
      tokenType: 'user',
      publicationVerified: false,
    });
  });

  it('never bypasses a failed user authorization check', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { error_code: 27 } })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ response: { groups: [{ id: 123, name: 'Лига' }] } }),
        ),
      );
    await expect(client.check(7)).rejects.toThrow(
      'администратору или редактору',
    );
  });

  it('does not hide an expired key behind a user-token fallback', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { error_code: 5 } })),
    );
    await expect(client.check(7)).rejects.toThrow('недействителен или истёк');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('distinguishes group authorization restrictions from an expired token', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { error_code: 27 } })),
    );
    await expect(
      client.post('123', 'Текст', 'guid', articleUrl),
    ).rejects.toMatchObject({ code: 27, uncertain: false });
  });

  it('rejects links outside the configured article origin before making a request', async () => {
    await expect(
      client.post('123', 'Текст', 'guid', 'https://evil.example/news/results'),
    ).rejects.toThrow('Некорректная ссылка');
    await expect(
      client.post('123', 'Текст', 'guid', 'photo-123_1'),
    ).rejects.toThrow('Некорректная ссылка');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsafe image paths before reading files', async () => {
    await expect(
      client.validatePreviewImage('/uploads/news/../../.env'),
    ).rejects.toThrow();
    await expect(
      client.validatePreviewImage('https://internal/private'),
    ).rejects.toThrow();
    await expect(
      client.validatePreviewImage(
        '/uploads/news/00000000-0000-0000-0000-000000000000.webp',
      ),
    ).rejects.toThrow();
  });

  it('requires an HTTPS canonical origin in production', () => {
    const invalid = new VkNewsClient(
      new ConfigService({
        NODE_ENV: 'production',
        FRONTEND_URL: 'http://liga-dvora.ru',
      }),
    );
    expect(() => invalid.articleOrigin()).toThrow();
  });
});
