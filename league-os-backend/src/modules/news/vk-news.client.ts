import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';

export class VkDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    readonly uncertain = false,
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
    >('groups.getById', { group_ids: groupId, fields: 'is_admin,admin_level' });
    const group = (Array.isArray(result) ? result : result.groups)?.find(
      (g) => String(g.id) === groupId,
    );
    if (!group || !group.is_admin || (group.admin_level ?? 0) < 2)
      throw new VkDeliveryError(
        'Токен должен принадлежать администратору или редактору выбранного сообщества ВК.',
      );
    return {
      ...this.connection(communityId),
      name: group.name,
      message:
        'Сообщество доступно. Возможность публикации окончательно проверяется при отправке анонса.',
    };
  }

  async image(path: string): Promise<Buffer> {
    if (!/^\/uploads\/news\/[0-9a-f-]{36}\.(jpg|png)$/.test(path))
      throw new VkDeliveryError(
        'Изображение ВК должно быть загружено через редактор (JPEG или PNG).',
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
      return buffer;
    } catch {
      throw new VkDeliveryError(
        'Изображение не найдено или повреждено. Загрузите JPEG или PNG до 5 МБ.',
      );
    }
  }

  async uploadPhoto(groupId: string, path: string) {
    const bytes = await this.image(path);
    const server = await this.call<{ upload_url: string }>(
      'photos.getWallUploadServer',
      { group_id: groupId },
    );
    const url = new URL(server.upload_url);
    // Never send our files or credentials to arbitrary URLs supplied by an upstream response.
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      !['vk.com', 'vk.ru', 'userapi.com'].some(
        (d) => url.hostname === d || url.hostname.endsWith(`.${d}`),
      )
    )
      throw new VkDeliveryError('ВК вернул недопустимый сервер загрузки.');
    const form = new FormData();
    form.append(
      'photo',
      new Blob([new Uint8Array(bytes)], {
        type: path.endsWith('.png') ? 'image/png' : 'image/jpeg',
      }),
      path.split('/').pop(),
    );
    let upload: { server: number; photo: string; hash: string };
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: form,
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error();
      upload = (await response.json()) as typeof upload;
      if (!upload.server || !upload.photo || !upload.hash) throw new Error();
    } catch {
      throw new VkDeliveryError('Не удалось загрузить изображение в ВК.', true);
    }
    const saved = await this.call<
      { owner_id: number; id: number; access_key?: string }[]
    >('photos.saveWallPhoto', {
      group_id: groupId,
      server: String(upload.server),
      photo: upload.photo,
      hash: upload.hash,
    });
    if (!saved[0]?.id || !saved[0]?.owner_id)
      throw new VkDeliveryError('ВК не сохранил изображение.');
    return `photo${saved[0].owner_id}_${saved[0].id}${saved[0].access_key ? `_${saved[0].access_key}` : ''}`;
  }

  async post(
    groupId: string,
    message: string,
    guid: string,
    attachment?: string,
  ) {
    const result = await this.call<{ post_id: number }>(
      'wall.post',
      {
        owner_id: `-${groupId}`,
        from_group: '1',
        message,
        guid,
        ...(attachment ? { attachments: attachment } : {}),
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
    let body: { response?: T; error?: { error_code: number } };
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
      // Never expose upstream request_params/error_msg: they may contain an access token.
      const message = [5, 27, 28].includes(code)
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
}
