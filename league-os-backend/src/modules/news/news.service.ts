import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NewsEntity } from './entities/news.entity';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../../common/base/base-crud.service';

@Injectable()
export class NewsService extends BaseCrudService<NewsEntity> {
  constructor(
    @InjectRepository(NewsEntity)
    private readonly newsRepository: Repository<NewsEntity>,
  ) {
    super(newsRepository, 'Новость');
  }

  findPublished() {
    return this.newsRepository.find({
      where: { status: 'published' },
      order: {
        publishedAt: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  async findBySlug(slug: string) {
    const news = await this.newsRepository.findOne({
      where: {
        slug,
        status: 'published',
      },
    });

    if (!news) {
      throw new NotFoundException('Новость не найдена');
    }

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
