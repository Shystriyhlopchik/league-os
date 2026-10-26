import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsEntity } from './entities/news.entity';
import { NewsAdminController } from './news-admin.controller';
import { AuthModule } from '../auth/auth.module';
import { CommunitiesModule } from '../communities/communities.module';
import { NewsPublicationEntity } from './entities/news-publication.entity';
import { NewsAccessService } from './news-access.service';
import { VkNewsClient } from './vk-news.client';
import { NewsPublicationService } from './news-publication.service';
import { NewsPageService } from './news-page.service';

@Module({
  imports: [
    AuthModule,
    CommunitiesModule,
    TypeOrmModule.forFeature([NewsEntity, NewsPublicationEntity]),
  ],
  controllers: [NewsController, NewsAdminController],
  providers: [
    NewsService,
    NewsAccessService,
    VkNewsClient,
    NewsPublicationService,
    NewsPageService,
  ],
  exports: [NewsService],
})
export class NewsModule {}
