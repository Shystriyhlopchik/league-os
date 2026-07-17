import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsEntity } from './entities/news.entity';
import { NewsAdminController } from './news-admin.controller';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([NewsEntity])],
  controllers: [NewsController, NewsAdminController],
  providers: [NewsService, RolesGuard],
  exports: [NewsService],
})
export class NewsModule {}
