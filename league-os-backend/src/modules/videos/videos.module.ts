import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CommunitiesModule } from '../communities/communities.module';
import { VideoEntity } from './entities/video.entity';
import { VideosController, VideosAdminController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [
    AuthModule,
    CommunitiesModule,
    TypeOrmModule.forFeature([VideoEntity]),
  ],
  controllers: [VideosController, VideosAdminController],
  providers: [VideosService],
})
export class VideosModule {}
