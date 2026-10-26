import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CreateNewsDto } from './dto/create-news.dto';
import { ListNewsQueryDto } from './dto/list-news-query.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { NewsEntity } from './entities/news.entity';

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(NewsEntity)
    private readonly newsRepository: Repository<NewsEntity>,
  ) {}

  findPublished(query: ListNewsQueryDto) {
    return this.newsRepository.find({
      where: { status: 'published' },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        content: true,
        coverUrl: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
  }

  async findBySlug(slug: string) {
    const news = await this.newsRepository.findOne({
      where: { slug, status: 'published' },
    });
    if (!news) throw new NotFoundException('Новость не найдена');
    return this.toPublicView(news);
  }

  async findForLinkPreview(slug: string) {
    const news = await this.newsRepository.findOne({
      where: { slug, status: 'published' },
    });
    if (!news) throw new NotFoundException('Новость не найдена');
    // Only metadata uses the social teaser; the article API keeps its own title/content.
    return {
      title: news.vkTitle?.trim() || news.title,
      pageTitle: news.title,
      slug: news.slug,
      excerpt: (news.vkText?.trim() || news.excerpt || news.content).slice(
        0,
        500,
      ),
      content: news.content,
      coverUrl: news.coverUrl,
    };
  }

  async findForAdmin(query: ListNewsQueryDto, communityId?: number) {
    const where: FindOptionsWhere<NewsEntity> = query.status
      ? { status: query.status }
      : {};
    if (communityId) where.communityId = communityId;
    const [items, total] = await this.newsRepository.findAndCount({
      where,
      order: { updatedAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items, total, page: query.page, limit: query.limit };
  }

  async findForAdminById(newsId: number) {
    const news = await this.newsRepository.findOne({ where: { id: newsId } });
    if (!news) throw new NotFoundException('Новость не найдена');
    return news;
  }

  async createDraft(dto: CreateNewsDto, userId: number, communityId?: number) {
    const slug = await this.availableSlug(dto.slug || dto.title);
    return this.newsRepository.save(
      this.newsRepository.create({
        ...this.normalize(dto),
        communityId,
        slug,
        status: 'draft',
        publishedAt: null,
        authorUserId: userId,
        updatedByUserId: userId,
      }),
    );
  }

  async updateDraft(newsId: number, dto: UpdateNewsDto, userId: number) {
    return this.withLockedNews(newsId, async (news, repo) => {
      if (dto.slug && dto.slug !== news.slug) {
        if (news.slugLocked || news.publishedAt) {
          throw new ConflictException(
            'Адрес опубликованной или отправленной в ВК новости менять нельзя',
          );
        }
        news.slug = await this.availableSlug(dto.slug, newsId, false);
      }
      Object.assign(news, this.normalize(dto), { updatedByUserId: userId });
      return repo.save(news);
    });
  }

  async publish(newsId: number, userId: number) {
    return this.withLockedNews(newsId, async (news, repo) => {
      if (!news.title.trim() || !news.content.trim()) {
        throw new ConflictException(
          'Для публикации заполните заголовок и текст новости',
        );
      }
      news.status = 'published';
      news.slugLocked = true;
      news.publishedAt ??= new Date();
      news.updatedByUserId = userId;
      return repo.save(news);
    });
  }

  async unpublish(newsId: number, userId: number) {
    return this.withLockedNews(newsId, async (news, repo) => {
      news.status = 'draft';
      news.publishedAt = null;
      news.updatedByUserId = userId;
      return repo.save(news);
    });
  }

  async archive(newsId: number): Promise<void> {
    await this.withLockedNews(newsId, async (_news, repo) => {
      await repo.softDelete(newsId);
    });
  }

  private withLockedNews<T>(
    newsId: number,
    action: (news: NewsEntity, repo: Repository<NewsEntity>) => Promise<T>,
  ): Promise<T> {
    return this.newsRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(NewsEntity);
      const news = await repo.findOne({
        where: { id: newsId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!news) throw new NotFoundException('Новость не найдена');
      return action(news, repo);
    });
  }

  async saveCover(
    buffer: Buffer,
    declaredMimeType: string,
  ): Promise<{ url: string }> {
    const detected = this.detectImage(buffer);
    if (!detected || detected.mimeType !== declaredMimeType) {
      throw new BadRequestException(
        'Обложка должна быть изображением PNG, JPEG или WebP',
      );
    }

    const directory = join(process.cwd(), 'uploads', 'news');
    const fileName = `${randomUUID()}.${detected.extension}`;
    await mkdir(directory, { recursive: true, mode: 0o755 });
    await writeFile(join(directory, fileName), buffer, {
      flag: 'wx',
      mode: 0o644,
    });
    return { url: `/uploads/news/${fileName}` };
  }

  private normalize(dto: UpdateNewsDto): Partial<NewsEntity> {
    const result: Partial<NewsEntity> = {};
    if (dto.title !== undefined) result.title = dto.title.trim();
    if (dto.excerpt !== undefined) result.excerpt = dto.excerpt.trim() || null;
    if (dto.content !== undefined) result.content = dto.content.trim();
    if (dto.coverUrl !== undefined)
      result.coverUrl = dto.coverUrl.trim() || null;
    if (dto.vkTitle !== undefined) result.vkTitle = dto.vkTitle?.trim() || null;
    if (dto.vkText !== undefined) result.vkText = dto.vkText?.trim() || null;
    if (dto.vkImageUrl !== undefined) {
      const url = dto.vkImageUrl?.trim() || '';
      if (url && !/^\/uploads\/news\/[0-9a-f-]{36}\.(jpg|png)$/.test(url))
        throw new BadRequestException(
          'Для ВК загрузите изображение JPEG или PNG',
        );
      result.vkImageUrl = url || null;
    }
    return result;
  }

  private async availableSlug(
    source: string,
    excludedId?: number,
    addSuffix = true,
  ): Promise<string> {
    const base = this.slugify(source);
    if (!base)
      throw new ConflictException('Не удалось сформировать адрес новости');
    let candidate = base;
    let suffix = 2;
    while (true) {
      const existing = await this.newsRepository.findOne({
        where: { slug: candidate },
        withDeleted: true,
      });
      if (!existing || existing.id === excludedId) return candidate;
      if (!addSuffix)
        throw new ConflictException('Такой адрес новости уже используется');
      candidate = `${base}-${suffix++}`;
    }
  }

  private slugify(value: string): string {
    const transliteration: Record<string, string> = {
      а: 'a',
      б: 'b',
      в: 'v',
      г: 'g',
      д: 'd',
      е: 'e',
      ё: 'e',
      ж: 'zh',
      з: 'z',
      и: 'i',
      й: 'y',
      к: 'k',
      л: 'l',
      м: 'm',
      н: 'n',
      о: 'o',
      п: 'p',
      р: 'r',
      с: 's',
      т: 't',
      у: 'u',
      ф: 'f',
      х: 'h',
      ц: 'c',
      ч: 'ch',
      ш: 'sh',
      щ: 'sch',
      ъ: '',
      ы: 'y',
      ь: '',
      э: 'e',
      ю: 'yu',
      я: 'ya',
    };
    return value
      .trim()
      .toLowerCase()
      .split('')
      .map((character) => transliteration[character] ?? character)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180);
  }

  private detectImage(
    buffer: Buffer,
  ): { extension: 'png' | 'jpg' | 'webp'; mimeType: string } | null {
    if (
      buffer.length >= 8 &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      return { extension: 'png', mimeType: 'image/png' };
    }
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return { extension: 'jpg', mimeType: 'image/jpeg' };
    }
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return { extension: 'webp', mimeType: 'image/webp' };
    }
    return null;
  }

  private toPublicView(news: NewsEntity) {
    return {
      id: news.id,
      title: news.title,
      slug: news.slug,
      excerpt: news.excerpt,
      content: news.content,
      coverUrl: news.coverUrl,
      publishedAt: news.publishedAt,
    };
  }
}
