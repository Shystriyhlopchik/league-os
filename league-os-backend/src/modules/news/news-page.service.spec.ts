import { newsPageHtml } from './news-page.service';

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
