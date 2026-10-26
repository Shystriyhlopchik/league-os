import { NewsPageService, newsPageHtml } from './news-page.service';
import { NewsService } from './news.service';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { VkNewsClient } from './vk-news.client';

describe('newsPageHtml', () => {
  const template =
    '<html><head><title>Общий заголовок</title><meta name="description" content="old"><meta property="og:title" content="old"><meta property="og:image" content="old"><meta property="og:image:width" content="100"><link rel="canonical" href="old"><base href="/"></head><body><app-root></app-root><script src="main.js"></script></body></html>';
  it('replaces generic metadata but keeps the working Angular shell', () => {
    const html = newsPageHtml(
      template,
      { title: 'Финал', slug: 'final', excerpt: 'Анонс', content: 'Статья' },
      'https://liga-dvora.ru',
      'https://liga-dvora.ru/image.jpg',
    );
    expect(html).toContain('https://liga-dvora.ru/news/final');
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html).not.toContain('content="old"');
    expect(html).toContain('<app-root>');
    expect(html).toContain('src="main.js"');
    expect(html).toContain('<base href="/">');
  });
  it('escapes untrusted titles, descriptions and image URLs', () => {
    const html = newsPageHtml(
      template,
      {
        title: '</title><script>alert(1)</script>',
        slug: 'final',
        excerpt: '"><script>bad</script>',
        content: '',
      },
      'https://liga-dvora.ru',
      'https://liga-dvora.ru/a"b.jpg',
    );
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<script>bad');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a&quot;b.jpg');
  });

  it('does not interpret replacement-pattern characters in article text', () => {
    const html = newsPageHtml(
      template,
      { title: "$& $` $'", slug: 'final', content: '$&' },
      'https://liga-dvora.ru',
      'https://liga-dvora.ru/image.jpg',
    );
    expect(html).toContain('$&amp; $` $&#39;');
    expect(html.match(/<app-root>/g)).toHaveLength(1);
  });
});

describe('News link preview page', () => {
  let fetchMock: jest.SpyInstance;
  let news: { findForLinkPreview: jest.Mock };
  let page: NewsPageService;
  beforeEach(() => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          '<html><head><title>Site</title></head><body><app-root></app-root></body></html>',
        ),
      );
    news = {
      findForLinkPreview: jest.fn(async () => ({
        title: 'Заголовок ВК',
          pageTitle: 'Заголовок статьи',
        slug: 'results',
        excerpt: 'Анонс ВК',
        content: 'Статья',
        coverUrl: '/uploads/news/preview.png',
      })),
    };
    page = new NewsPageService(
      news as unknown as NewsService,
      new ConfigService({
        NEWS_HTML_TEMPLATE_URL: 'http://frontend/index.html',
      }),
      {
        articleOrigin: () => 'https://liga-dvora.ru',
      } as unknown as VkNewsClient,
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('renders the uploaded social image as an absolute og:image without calling VK photos APIs', async () => {
    const html = await page.page('results');
    expect(html).toContain(
      'property="og:image" content="https://liga-dvora.ru/uploads/news/preview.png"',
    );
    expect(html).toContain('property="og:title" content="Заголовок ВК"');
    expect(html).toContain('<title>Заголовок статьи — Дворовая лига</title>');
    expect(html).toContain('property="og:description" content="Анонс ВК"');
    expect(html).toContain(
      'property="og:url" content="https://liga-dvora.ru/news/results"',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://frontend/index.html');
  });
  it('uses the existing brand photo if neither a social image nor an article cover exists', async () => {
    news.findForLinkPreview.mockResolvedValue({
      title: 'Новость',
      slug: 'results',
      content: 'Текст',
    });
    expect(await page.page('results')).toContain(
      'https://liga-dvora.ru/brand/photos/team-emotion.jpg',
    );
  });
  it('never renders metadata for a draft or archived article', async () => {
    news.findForLinkPreview.mockRejectedValue(
      new NotFoundException('Новость не найдена'),
    );
    await expect(page.page('results')).rejects.toThrow('Новость не найдена');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
