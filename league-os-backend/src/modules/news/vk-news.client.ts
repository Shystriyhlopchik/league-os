import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';

export class VkDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    readonly uncertain = false,
    readonly code?: number,
  ) {
    super(message);
  }
}

@Injectable()
export class VkNewsClient {
  constructor(private readonly config: ConfigService) {}

  connection(communityId: number) {
    const groupId = this.config.get<string>('VK_GROUP_ID', '').trim();
    const configured =
      this.config.get<string>('VK_PUBLISHING_ENABLED') === 'true' &&
      /^[1-9]\d*$/.test(groupId) &&
      Number(this.config.get('VK_NEWS_COMMUNITY_ID')) === communityId &&
      !!this.config.get<string>('VK_ACCESS_TOKEN')?.trim();
    return {
      configured,
      groupId: configured ? groupId : null,
      groupUrl: configured ? `https://vk.com/club${groupId}` : null,
    };
  }

  requireConnection(communityId: number, expectedGroupId?: string) {
    const connection = this.connection(communityId);
    if (
      !connection.configured ||
      !connection.groupId ||
      (expectedGroupId && expectedGroupId !== connection.groupId)
    )
      throw new ServiceUnavailableException(
        'ВК не подключён для этого сообщества. Проверьте серверные настройки публикации.',
      );
    return { groupId: connection.groupId, articleOrigin: this.articleOrigin() };
  }

  articleOrigin(): string {
    try {
      const url = new URL(this.config.get<string>('FRONTEND_URL', ''));
      if (
        url.username ||
        url.password ||
        (url.protocol !== 'https:' &&
          !(
            this.config.get('NODE_ENV') !== 'production' &&
            url.protocol === 'http:'
          ))
      )
        throw new Error();
      return url.origin;
    } catch {
      throw new ServiceUnavailableException(
        'Укажите корректный FRONTEND_URL для ссылок на новости (HTTPS в production).',
      );
    }
  }

  async check(communityId: number) {
    const { groupId } = this.requireConnection(communityId);
    let tokenType: 'community' | 'user' = 'community';
    try {
      const permissions = await this.call<{
        mask: number;
        permissions: { name: string; setting: number }[];
      }>('groups.getTokenPermissions', {});
      // photos/messages permissions are not needed for a text + link post.
      if (
        !permissions ||
        !Number.isSafeInteger(permissions.mask) ||
        permissions.mask < 0 ||
        permissions.mask > 0xffffffff ||
        (permissions.mask & 8192) === 0
      )
        throw new VkDeliveryError(
          'У ключа сообщества нет разрешения wall. Выдайте ключу доступ к стене.',
        );
    } catch (error) {
      // Preserve support for existing user tokens, but do not treat network errors,
      // expired keys or a missing wall permission as successful authorization.
      if (
        !(error instanceof VkDeliveryError) ||
        ![27, 28].includes(error.code ?? 0)
      )
        throw error;
      tokenType = 'user';
    }
    const result = await this.call<
      | {
          groups: {
            id: number;
            name: string;
            is_admin?: number;
            admin_level?: number;
          }[];
        }
      | { id: number; name: string; is_admin?: number; admin_level?: number }[]
    >('groups.getById', {
      group_ids: groupId,
      ...(tokenType === 'user' ? { fields: 'is_admin,admin_level' } : {}),
    });
    const group = (Array.isArray(result) ? result : result?.groups)?.find(
      (g) => String(g.id) === groupId,
    );
    if (!group)
      throw new VkDeliveryError(
        'Сообщество ВК не найдено. Проверьте VK_GROUP_ID.',
      );
    if (
      tokenType === 'user' &&
      (!group.is_admin || (group.admin_level ?? 0) < 2)
    )
      throw new VkDeliveryError(
        'Токен должен принадлежать администратору или редактору выбранного сообщества ВК.',
      );
    return {
      ...this.connection(communityId),
      name: group.name,
      tokenType,
      publicationVerified: false,
      message:
        tokenType === 'community'
          ? 'Ключ сообщества принят, разрешение wall есть, выбранная группа найдена. Отправится текст со ссылкой; принадлежность ключа выбранной группе и возможность публикации окончательно проверяются при отправке. Пост не создан.'
          : 'Права пользователя подтверждены. Отправится текст со ссылкой. Возможность публикации окончательно проверяется при отправке. Пост не создан.',
    };
  }

  async validatePreviewImage(path: string): Promise<void> {
    if (!/^\/uploads\/news\/[0-9a-f-]{36}\.(jpg|png)$/.test(path))
      throw new VkDeliveryError(
        'Изображение карточки ссылки должно быть загружено через редактор (JPEG или PNG).',
      );
    try {
      const directory = await realpath(join(process.cwd(), 'uploads', 'news'));
      const file = await realpath(join(process.cwd(), path.slice(1)));
      if (!file.startsWith(directory + sep)) throw new Error();
      const buffer = await readFile(file);
      const jpeg =
        buffer.length >= 3 &&
        buffer[0] === 255 &&
        buffer[1] === 216 &&
        buffer[2] === 255;
      const png = buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if ((!jpeg && !png) || buffer.length > 5 * 1024 * 1024) throw new Error();
    } catch {
      throw new VkDeliveryError(
        'Изображение не найдено или повреждено. Загрузите JPEG или PNG до 5 МБ.',
      );
    }
  }

  async post(
    groupId: string,
    message: string,
    guid: string,
    articleUrl: string,
  ) {
    try {
      const url = new URL(articleUrl);
      if (
        url.origin !== this.articleOrigin() ||
        url.username ||
        url.password ||
        url.hash ||
        !/^\/news\/[^/]+$/.test(url.pathname)
      )
        throw new Error();
    } catch {
      throw new VkDeliveryError(
        'Некорректная ссылка на статью. Проверьте FRONTEND_URL и адрес новости.',
      );
    }
    const result = await this.call<{ post_id: number }>(
      'wall.post',
      {
        owner_id: `-${groupId}`,
        from_group: '1',
        message,
        guid,
        attachments: articleUrl,
      },
      true,
    );
    if (!Number.isSafeInteger(result.post_id) || result.post_id <= 0)
      throw new VkDeliveryError(
        'ВК не подтвердил номер поста. Проверьте стену сообщества.',
        false,
        true,
      );
    return `https://vk.com/wall-${groupId}_${result.post_id}`;
  }

  private async call<T>(
    method: string,
    params: Record<string, string>,
    sendingPost = false,
  ): Promise<T> {
    let body: {
      response?: T;
      error?: { error_code: number; error_msg?: unknown };
    };
    try {
      const response = await fetch(`https://api.vk.com/method/${method}`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        body: new URLSearchParams({
          ...params,
          access_token: this.config.get<string>('VK_ACCESS_TOKEN', ''),
          v: this.config.get<string>('VK_API_VERSION', '5.199'),
        }),
      });
      if (!response.ok) throw new Error();
      body = (await response.json()) as typeof body;
    } catch {
      throw new VkDeliveryError(
        sendingPost
          ? 'Нет подтверждения от ВК. Проверьте стену сообщества перед повтором.'
          : 'ВК временно недоступен.',
        !sendingPost,
        sendingPost,
      );
    }
    if (body.error) {
      const code = body.error.error_code;
      // Never echo upstream request_params/error_msg: they may contain secrets.
      // For code 100, translate only recognized parameter names and reasons.
      const message =
        code === 100
          ? this.parameterError(method, body.error.error_msg)
          : code === 27
            ? 'ВК отклонил авторизацию сообщества (код 27). Проверьте тип ключа, его доступ к выбранной группе и поддержку метода. Это не обязательно истёкший токен.'
            : code === 28
              ? 'ВК отклонил авторизацию приложения (код 28). Проверьте тип ключа и доступ приложения к методу.'
              : code === 5
                ? 'Ключ доступа ВК недействителен или истёк. Обновите его на сервере.'
                : [7, 15, 20, 200, 203, 214].includes(code)
                  ? 'ВК запретил публикацию. Проверьте права, тип токена и доступ приложения.'
                  : code === 14
                    ? 'ВК требует подтверждение CAPTCHA. Автоматическая отправка остановлена.'
                    : `ВК отклонил запрос (код ${Number.isInteger(code) ? code : 'неизвестен'}).`;
      // Internal errors during wall.post are ambiguous, unlike an explicit rate rejection.
      throw new VkDeliveryError(
        message,
        code === 6 || (!sendingPost && code === 10),
        sendingPost && code === 10,
        Number.isInteger(code) ? code : undefined,
      );
    }
    if (body.response === undefined)
      throw new VkDeliveryError(
        'Некорректный ответ ВК.',
        !sendingPost,
        sendingPost,
      );
    return body.response;
  }

  private parameterError(method: string, upstreamMessage: unknown): string {
    const prefix = `ВК отклонил запрос ${method} (код 100).`;
    const hints = new Map([
      ['owner_id', 'стена сообщества; проверьте VK_GROUP_ID'],
      ['from_group', 'публикация от имени сообщества'],
      ['message', 'текст анонса'],
      ['attachments', 'вложение со ссылкой на статью'],
      ['guid', 'идентификатор защиты от повторной публикации'],
      ['group_id', 'идентификатор сообщества; проверьте VK_GROUP_ID'],
      ['group_ids', 'список сообществ; проверьте VK_GROUP_ID'],
      ['fields', 'запрашиваемые поля сообщества'],
      ['v', 'версия API; проверьте VK_API_VERSION'],
      [
        'access_token',
        'ключ доступа; проверьте серверную настройку VK_ACCESS_TOKEN',
      ],
    ]);
    // Bound parsing work. No arbitrary upstream substring is ever returned,
    // even when it includes a token, a URL, HTML or request parameter values.
    const text =
      typeof upstreamMessage === 'string' ? upstreamMessage.slice(0, 4096) : '';
    const patterns = [
      /\b(?:missing\s+)?(?:parameter|param)\s*:?\s*['"`]?([a-z][a-z0-9_]*)\b/gi,
      /\b(?:invalid|missing|unsupported|unknown)\s+['"`]?([a-z][a-z0-9_]*)\b/gi,
      /\b([a-z][a-z0-9_]*)['"`]?\s+(?:(?:is|was)\s+)?(?:invalid|missing|required|not\s+(?:valid|supported)|should\s+be|must\s+be|has\s+to\s+be|too\s+long)\b/gi,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const parameter = match[1].toLowerCase();
        const hint = hints.get(parameter);
        if (!hint) continue;
        const offset = match[0].toLowerCase().lastIndexOf(parameter);
        const detail = text
          .slice(match.index! + offset + parameter.length)
          .split(/[;\r\n]/, 1)[0]
          .slice(0, 160);
        const reason =
          /\b(?:should|must|has to)\s+be\s+(?:an?\s+)?(?:integer|int)\b/i.test(
            detail,
          )
            ? 'ВК ожидает целое число.'
            : /\b(?:should|must|has to)\s+be\s+(?:an?\s+)?string\b/i.test(
                  detail,
                )
              ? 'ВК ожидает строку.'
              : /\b(?:should|must|has to)\s+be\s+(?:an?\s+)?(?:valid\s+)?(?:url|link)\b/i.test(
                    detail,
                  )
                ? 'ВК ожидает корректную ссылку.'
                : /\b(?:required|missing|empty)\b/i.test(detail) ||
                    /^missing\b/i.test(match[0])
                  ? 'ВК сообщает об отсутствующем или пустом значении.'
                  : 'ВК не принял значение или формат параметра.';
        return `${prefix} Параметр «${parameter}» (${hint}). ${reason}`;
      }
    }
    return `${prefix} Отсутствует или некорректен один из параметров. В ответе ВК нет распознаваемого уточнения параметра.`;
  }
}
