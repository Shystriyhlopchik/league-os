import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NewsService } from './news.service';
import { VkNewsClient } from './vk-news.client';

export function newsPageHtml(
  template: string,
  news: {
    title: string;
    slug: string;
    excerpt?: string | null;
    content: string;
  },
  origin: string,
  image: string,
) {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char]!,
    );
  const title = escape(news.title);
  const description = escape(news.excerpt || news.content.slice(0, 250));
  const canonical = escape(
    new URL(`/news/${encodeURIComponent(news.slug)}`, origin).href,
  );
  const head = `<title>${title} — Дворовая лига</title>
    <meta name="description" content="${description}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${escape(image)}">
    <link rel="canonical" href="${canonical}">`;
  return template
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(
      /<meta\b[^>]*(?:name\s*=\s*["']description["']|property\s*=\s*["']og:(?:type|title|description|url|image)(?::[^"']*)?["'])[^>]*>/gi,
      '',
    )
    .replace(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/gi, '')
    .replace(/<\/head>/i, () => `${head}</head>`);
}

@Injectable()
export class NewsPageService {
  private template?: { html: string; expires: number };
  constructor(
    private readonly news: NewsService,
    private readonly config: ConfigService,
    private readonly vk: VkNewsClient,
  ) {}

  async page(slug: string) {
    // Fetch the public article first: drafts/archived articles must return 404, including to bots.
    const article = await this.news.findBySlug(slug);
    const origin = this.vk.articleOrigin();
    if (!this.template || this.template.expires < Date.now()) {
      try {
        const response = await fetch(
          this.config.get<string>(
            'NEWS_HTML_TEMPLATE_URL',
            'http://frontend/index.html',
          ),
          {
            redirect: 'error',
            signal: AbortSignal.timeout(5000),
          },
        );
        if (!response.ok) throw new Error();
        const html = await response.text();
        if (!/<\/head>/i.test(html) || !/<app-root\b/i.test(html))
          throw new Error();
        this.template = { html, expires: Date.now() + 5000 };
      } catch {
        throw new ServiceUnavailableException(
          'Не удалось загрузить шаблон страницы новости',
        );
      }
    }
    let image = new URL('/brand/photos/team-emotion.jpg', origin).href;
    if (article.coverUrl) {
      try {
        const url = new URL(article.coverUrl, origin);
        if (
          ['https:', 'http:'].includes(url.protocol) &&
          !url.username &&
          !url.password
        )
          image = url.href;
      } catch {
        /* Use the local brand photo when a legacy cover URL is invalid. */
      }
    }
    return newsPageHtml(this.template.html, article, origin, image);
  }
}
