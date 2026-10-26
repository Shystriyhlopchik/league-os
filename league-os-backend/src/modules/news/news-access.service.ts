import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CommunitiesService,
  CommunityActor,
} from '../communities/communities.service';
import { CommunityEntity } from '../communities/entities/community.entity';
import { NewsEntity } from './entities/news.entity';

@Injectable()
export class NewsAccessService {
  constructor(
    private readonly db: DataSource,
    private readonly communities: CommunitiesService,
  ) {}

  async community(
    id: number | undefined,
    actor: CommunityActor,
  ): Promise<number> {
    const community = id
      ? { id }
      : await this.db
          .getRepository(CommunityEntity)
          .findOneBy({ isDefault: true, isActive: true });
    if (!community) throw new NotFoundException('Сообщество не найдено');
    await this.communities.assertAccess(community.id, actor);
    return community.id;
  }

  async article(id: number, actor: CommunityActor): Promise<NewsEntity> {
    const news = await this.db.getRepository(NewsEntity).findOneBy({ id });
    if (!news) throw new NotFoundException('Новость не найдена');
    await this.communities.assertAccess(news.communityId, actor);
    return news;
  }
}
