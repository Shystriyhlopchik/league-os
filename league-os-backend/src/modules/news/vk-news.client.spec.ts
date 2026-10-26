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
    const message = `Анонс\n\nЧитать полностью: ${articleUrl}`;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ response: { post_id: 99 } })),
    );
    await expect(
      client.post('123', message, 'same-guid', articleUrl),
    ).resolves.toBe('https://vk.com/wall-123_99');
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('from_group')).toBe('1');
    expect(body.get('owner_id')).toBe('-123');
    expect(body.get('guid')).toBe('same-guid');
    expect(body.get('message')).toBe(message);
    expect(body.has('attachments')).toBe(false);
    expect(body.has('link_photo_id')).toBe(false);
    expect([...body.keys()].sort()).toEqual(
      ['owner_id', 'from_group', 'message', 'guid', 'access_token', 'v'].sort(),
    );
    expect(fetchMock.mock.calls[0][0]).not.toContain('secret');
  });

  it('does not trigger VK link-photo validation by attaching the article URL', async () => {
    // Regression for the observed VK rejection, not a live API call.
    fetchMock.mockImplementation(async (_url, options) => {
      const body = options.body as URLSearchParams;
      return new Response(
        JSON.stringify(
          body.has('attachments')
            ? {
                error: {
                  error_code: 100,
                  error_msg:
                    'One of the parameters specified was missing or invalid: Violated: link_photo_sizing_rule. No photo given',
                },
              }
            : { response: { post_id: 99 } },
        ),
      );
    });
    const message = `Анонс\n\nЧитать полностью: ${articleUrl}&utm_medium=social`;
    await expect(
      client.post('123', message, 'stable-guid', articleUrl),
    ).resolves.toBe('https://vk.com/wall-123_99');
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('message')).toBe(message);
    expect(body.get('guid')).toBe('stable-guid');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([5, 7, 14, 15, 27, 28, 100, 200])(
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

  it.each([
    ['Invalid parameter: guid should be integer', 'guid', 'целое число'],
    ['Invalid parameter: owner_id is invalid', 'owner_id', 'VK_GROUP_ID'],
    [
      'One of the parameters specified was missing or invalid: attachments is invalid',
      'attachments',
      'ссылкой на статью',
    ],
    ['Invalid attachments', 'attachments', 'ссылкой на статью'],
    ['Missing parameter: message', 'message', 'отсутствующем или пустом'],
    ['Missing message', 'message', 'отсутствующем или пустом'],
    ['Parameter "from_group" must be a string', 'from_group', 'строку'],
    ['attachments should be a valid URL', 'attachments', 'корректную ссылку'],
    [
      'Invalid parameter: access_token is invalid',
      'access_token',
      'VK_ACCESS_TOKEN',
    ],
    ['Invalid parameter: v is invalid', 'v', 'VK_API_VERSION'],
  ])(
    'safely explains parameter error: %s',
    async (errorMessage, parameter, hint) => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              error_code: 100,
              error_msg: `${errorMessage}; secret-must-not-leak <script>private</script>`,
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
      expect(error.message).toContain('wall.post (код 100)');
      expect(error.message).toContain(`«${parameter}»`);
      expect(error.message).toContain(hint);
      expect(error.message).not.toMatch(/secret|script|private|request_params/);
      expect(error).toMatchObject({
        code: 100,
        retryable: false,
        uncertain: false,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    undefined,
    null,
    123,
    { message: 'Invalid parameter: guid' },
    '',
    '   ',
  ])(
    'keeps a safe fallback for unrecognized parameter details: %p',
    async (errorMessage) => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              error_code: 100,
              error_msg: errorMessage,
              request_params: [{ key: 'guid', value: 'secret-must-not-leak' }],
            },
          }),
        ),
      );
      await expect(
        client.post('123', 'Текст', 'guid', articleUrl),
      ).rejects.toMatchObject({
        message:
          'ВК отклонил запрос wall.post (код 100). Отсутствует или некорректен один из параметров. ВК не передал текстовое уточнение ошибки.',
        code: 100,
        retryable: false,
        uncertain: false,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    'One of the parameters specified was missing or invalid',
    'Invalid parameter: copyright is unavailable for this token type',
    'Unsupported operation for this token type',
  ])(
    'retains a redacted explanation when a parameter cannot be translated: %s',
    async (explanation) => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { error_code: 100, error_msg: explanation },
          }),
        ),
      );
      await expect(
        client.post('123', 'Текст', 'guid', articleUrl),
      ).rejects.toMatchObject({
        message: expect.stringContaining(
          `Уточнение ВК (очищено): ${explanation}`,
        ),
        code: 100,
        retryable: false,
        uncertain: false,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('redacts tokens, quoted values, URLs, payload values and embedded dumps from fallback details', async () => {
    const message = 'Частный текст анонса';
    const guid = '9fd7aa81-c478-4b91-970a-25a3f5e4838b';
    const opaque = 'a'.repeat(70);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            error_code: 100,
            error_msg: `Unsupported operation. secret-must-not-leak ${message} ${encodeURIComponent(message)} ${guid} ${articleUrl} vk1.a.OTHER_PRIVATE_KEY "private quoted value" ${opaque} password=private-password request_params [{"key":"access_token","value":"another-secret"}]`,
            request_params: [
              { key: 'access_token', value: 'do-not-read-this-secret' },
            ],
          },
        }),
      ),
    );
    const error = await client
      .post('123', message, guid, articleUrl)
      .catch((e) => e as VkDeliveryError);
    expect(error.message).toContain('Unsupported operation.');
    for (const value of [
      'secret-must-not-leak',
      message,
      encodeURIComponent(message),
      guid,
      articleUrl,
      'OTHER_PRIVATE_KEY',
      'private quoted value',
      opaque,
      'private-password',
      'another-secret',
      'do-not-read-this-secret',
      'request_params',
    ])
      expect(error.message).not.toContain(value);
    expect(error).toMatchObject({
      code: 100,
      retryable: false,
      uncertain: false,
    });
  });

  it('redacts encoded credentials and credentials crossing the output limit before truncating', async () => {
    const token = 'vk1.a.' + 'private+/credential?='.repeat(10);
    const encoded = encodeURIComponent(token);
    const formEncoded = new URLSearchParams({ value: token })
      .toString()
      .slice(6);
    const configuredClient = new VkNewsClient(
      new ConfigService({
        VK_ACCESS_TOKEN: token,
        FRONTEND_URL: 'https://liga-dvora.ru',
        NODE_ENV: 'production',
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            error_code: 100,
            error_msg: `Unsupported operation ${encoded} ${formEncoded} ${'word '.repeat(80)}${token}`,
          },
        }),
      ),
    );
    const error = await configuredClient
      .post('123', 'Текст', 'guid', articleUrl)
      .catch((e) => e as VkDeliveryError);
    expect(error.message).not.toContain(token);
    expect(error.message).not.toContain('credential');
    expect(error.message).not.toContain('private');
    expect(error.message).not.toContain(encoded);
    expect(error.message).not.toContain(formEncoded);
    expect(
      error.message.split('Уточнение ВК (очищено): ')[1].length,
    ).toBeLessThanOrEqual(500);
  });

  it('bounds fallback text and removes markup and control characters', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            error_code: 100,
            error_msg:
              '<b>Unsupported operation</b>\n\u202E' + 'details '.repeat(1000),
          },
        }),
      ),
    );
    const error = await client
      .post('123', 'Текст', 'guid', articleUrl)
      .catch((e) => e as VkDeliveryError);
    expect(error.message).toContain('Unsupported operation');
    expect(error.message).not.toMatch(/[<>\n\u202E]/);
    expect(error.message.split('Уточнение ВК (очищено): ')[1].length).toBe(500);
  });

  it('includes the failing read method without attempting a post', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            error_code: 100,
            error_msg: 'Invalid parameter: v is invalid',
          },
        }),
      ),
    );
    await expect(client.check(7)).rejects.toThrow(
      'groups.getTokenPermissions (код 100)',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

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
    fetchMock.mockReset().mockResolvedValueOnce(
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
