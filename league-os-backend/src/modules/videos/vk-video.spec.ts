import { normalizeVkVideo } from './vk-video';

describe('VK video normalization', () => {
  it.each(['vk.com', 'www.vk.com', 'vk.ru', 'vkvideo.ru', 'www.vkvideo.ru'])(
    'accepts %s share links',
    (host) => {
      expect(normalizeVkVideo(`https://${host}/video-123_456?list=abc`)).toBe(
        'https://vkvideo.ru/video_ext.php?oid=-123&id=456&autoplay=0',
      );
    },
  );
  it('keeps export hash, decodes HTML entities and discards arbitrary iframe attributes', () => {
    expect(
      normalizeVkVideo(
        '<iframe src="https://vk.com/video_ext.php?oid=123&amp;id=456&amp;hash=a_123-X&amp;autoplay=1" width="100%" onload="alert(1)"></iframe>',
      ),
    ).toBe(
      'https://vkvideo.ru/video_ext.php?oid=123&id=456&hash=a_123-X&autoplay=0',
    );
  });
  it('accepts its canonical output again', () => {
    const url = normalizeVkVideo('https://vkvideo.ru/video-123_456');
    expect(normalizeVkVideo(url)).toBe(url);
  });
  it.each([
    'javascript:alert(1)',
    'http://vk.com/video-1_2',
    'https://vk.com.evil.test/video-1_2',
    'https://evil.test/video_ext.php?oid=1&id=2',
    'https://user:pass@vk.com/video-1_2',
    'https://vk.com:8443/video-1_2',
    'https://vk.com/clip-1_2',
    'https://vk.com/video0_2',
    'https://vk.com/video-1_0',
    'https://vk.com/video_ext.php?oid=1&id=2&id=3',
    'https://vk.com/video_ext.php?oid=1&id=2&hash=%22%3E',
    '<script>alert(1)</script>',
    '<iframe src="https://vk.com/video-1_2"></iframe><script>alert(1)</script>',
    'https://vkvideo.ru/playlist-1_2',
    'https://vk.com/video-123456789012345678901_2',
  ])('rejects unsupported or hostile input %s', (input) => {
    expect(() => normalizeVkVideo(input)).toThrow();
  });
});
