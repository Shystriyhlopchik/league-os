import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { NewsEntity } from './entities/news.entity';
import { NewsPublicationEntity } from './entities/news-publication.entity';
import { NewsAccessService } from './news-access.service';
import { CommunityActor } from '../communities/communities.service';
import { VkDeliveryError, VkNewsClient } from './vk-news.client';

@Injectable()
export class NewsPublicationService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private readonly logger = new Logger(NewsPublicationService.name);
  constructor(
    private readonly db: DataSource,
    private readonly access: NewsAccessService,
    private readonly vk: VkNewsClient,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick().catch(() =>
        this.logger.error('Ошибка обработки очереди анонсов ВК'),
      );
    }, 5000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async status(newsId: number, actor: CommunityActor) {
    await this.access.article(newsId, actor);
    return this.db
      .getRepository(NewsPublicationEntity)
      .findOneBy({ newsId, provider: 'vk' });
  }

  async enqueue(newsId: number, actor: CommunityActor) {
    await this.access.article(newsId, actor);
    return this.db.transaction(async (manager) => {
      const news = await manager.getRepository(NewsEntity).findOneOrFail({
        where: { id: newsId },
        lock: { mode: 'pessimistic_write' },
      });
      const repo = manager.getRepository(NewsPublicationEntity);
      const existing = await repo.findOneBy({ newsId, provider: 'vk' });
      if (existing) return existing; // One announcement per article, including double clicks/restarts.
      if (news.status !== 'published')
        throw new ConflictException('Сначала опубликуйте новость на сайте');
      const { groupId, articleOrigin } = this.vk.requireConnection(
        news.communityId,
      );
      const title = news.vkTitle?.trim() || news.title;
      const text = news.vkText?.trim();
      if (!text)
        throw new BadRequestException('Заполните и сохраните текст анонса ВК');
      const url = new URL(
        `/news/${encodeURIComponent(news.slug)}`,
        articleOrigin,
      );
      url.searchParams.set('utm_source', 'vk');
      url.searchParams.set('utm_medium', 'social');
      url.searchParams.set('utm_campaign', `news_${news.id}`);
      const message = `${title}\n\n${text}\n\nЧитать полностью: ${url.href}`;
      if ([...message].length > 15000)
        throw new BadRequestException(
          'Анонс вместе со ссылкой слишком длинный для ВК',
        );
      if (news.vkImageUrl) {
        try {
          await this.vk.validatePreviewImage(news.vkImageUrl);
        } catch {
          throw new BadRequestException(
            'Изображение ВК недоступно. Загрузите JPEG или PNG заново.',
          );
        }
      }
      return repo.save(
        repo.create({
          newsId,
          communityId: news.communityId,
          provider: 'vk',
          groupId,
          status: 'queued',
          guid: randomUUID(),
          message,
          articleUrl: url.href,
          imageUrl: news.vkImageUrl ?? null,
          requestedByUserId: actor.id,
          lastRequestedByUserId: actor.id,
          attempts: 0,
          nextAttemptAt: new Date(),
        }),
      );
    });
  }

  async retry(newsId: number, actor: CommunityActor, confirmedAbsent: boolean) {
    await this.access.article(newsId, actor);
    return this.db.transaction(async (manager) => {
      const news = await manager.getRepository(NewsEntity).findOneOrFail({
        where: { id: newsId },
        lock: { mode: 'pessimistic_write' },
      });
      const repo = manager.getRepository(NewsPublicationEntity);
      const job = await repo.findOneBy({ newsId, provider: 'vk' });
      if (!job) throw new ConflictException('Анонс ещё не отправлялся');
      if (!['failed', 'unknown'].includes(job.status)) return job;
      if (job.status === 'unknown' && !confirmedAbsent)
        throw new ConflictException(
          'Проверьте стену ВК и подтвердите отсутствие поста. Иначе возможен дубль.',
        );
      if (news.status !== 'published')
        throw new ConflictException(
          'Новость должна быть опубликована на сайте',
        );
      this.vk.requireConnection(job.communityId, job.groupId);
      job.status = 'queued';
      job.errorMessage = null;
      job.nextAttemptAt = new Date();
      job.lastRequestedByUserId = actor.id;
      // The original payload, destination and guid remain unchanged.
      return repo.save(job);
    });
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.db.query(
        `UPDATE news_publications SET status='unknown', error_message=$1, "updatedAt"=now()
        WHERE status='sending' AND started_at < now() - interval '3 minutes'`,
        ['Отправка прервалась. Проверьте стену ВК перед повторной попыткой.'],
      );
      const job = await this.db.transaction(async (manager) => {
        const repo = manager.getRepository(NewsPublicationEntity);
        const row = await repo
          .createQueryBuilder('job')
          .where("job.status = 'queued' AND job.next_attempt_at <= now()")
          .orderBy('job.id', 'ASC')
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .getOne();
        if (!row) return null;
        row.status = 'sending';
        row.startedAt = new Date();
        row.attempts += 1;
        return repo.save(row);
      });
      if (!job) return;
      await this.deliver(job);
    } finally {
      this.busy = false;
    }
  }

  private async deliver(job: NewsPublicationEntity) {
    let postUrl: string;
    try {
      this.vk.requireConnection(job.communityId, job.groupId);
      const news = await this.db.getRepository(NewsEntity).findOneBy({
        id: job.newsId,
        communityId: job.communityId,
        status: 'published',
      });
      if (!news)
        throw new VkDeliveryError(
          'Новость снята с публикации или удалена. Анонс не отправлен.',
        );
      postUrl = await this.vk.post(
        job.groupId,
        job.message,
        job.guid,
        job.articleUrl,
      );
    } catch (error) {
      const known = error instanceof VkDeliveryError;
      const retryable = known && error.retryable && job.attempts < 3;
      await this.db.getRepository(NewsPublicationEntity).update(job.id, {
        status:
          known && error.uncertain
            ? 'unknown'
            : retryable
              ? 'queued'
              : 'failed',
        nextAttemptAt: new Date(Date.now() + 30000 * job.attempts),
        errorMessage: known
          ? error.message
          : 'Не удалось отправить анонс. Проверьте серверное подключение ВК.',
      });
      return;
    }
    // If saving this confirmation fails, leave sending -> unknown, never automatically repost.
    await this.db.getRepository(NewsPublicationEntity).update(job.id, {
      status: 'published',
      postUrl,
      publishedAt: new Date(),
      errorMessage: null,
    });
  }
}
