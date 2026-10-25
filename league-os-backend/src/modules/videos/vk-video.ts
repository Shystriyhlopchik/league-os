import { BadRequestException } from '@nestjs/common';

/** Only identifiers are retained. Submitted HTML is never stored or rendered. */
export function normalizeVkVideo(input: string): string {
  let value = input.trim();
  if (value.startsWith('<')) {
    const frame =
      /^<iframe\s+[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>\s*<\/iframe>$/is.exec(
        value,
      );
    if (!frame) throw invalidVideo();
    value = frame[2].replace(/&amp;/gi, '&');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidVideo();
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    ![
      'vk.com',
      'www.vk.com',
      'vk.ru',
      'www.vk.ru',
      'vkvideo.ru',
      'www.vkvideo.ru',
    ].includes(url.hostname)
  ) {
    throw invalidVideo();
  }
  for (const key of ['oid', 'id', 'hash']) {
    if (url.searchParams.getAll(key).length > 1) throw invalidVideo();
  }
  const video = /^\/video(-?[1-9]\d{0,15})_([1-9]\d{0,15})\/?$/.exec(
    url.pathname,
  );
  const owner = video?.[1] ?? url.searchParams.get('oid');
  const id = video?.[2] ?? url.searchParams.get('id');
  if (
    (!video && url.pathname !== '/video_ext.php') ||
    !owner ||
    !/^-?[1-9]\d{0,15}$/.test(owner) ||
    !id ||
    !/^[1-9]\d{0,15}$/.test(id)
  )
    throw invalidVideo();
  const hash = url.searchParams.get('hash');
  if (hash !== null && !/^[a-zA-Z0-9_-]{1,128}$/.test(hash))
    throw invalidVideo();
  const canonical = new URL('https://vkvideo.ru/video_ext.php');
  canonical.searchParams.set('oid', owner);
  canonical.searchParams.set('id', id);
  if (hash) canonical.searchParams.set('hash', hash);
  canonical.searchParams.set('autoplay', '0');
  return canonical.toString();
}

function invalidVideo() {
  return new BadRequestException(
    'Вставьте HTTPS-ссылку на видео ВК или код iframe из «Поделиться → Экспортировать». Клипы и ссылки на плейлисты не поддерживаются.',
  );
}
