import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { CommunityActor } from '../communities/communities.service';
import { SaveVideoDto, VideoOptionsQuery, VideosQuery } from './video.dto';
import { VideosService } from './videos.service';

@Controller('videos')
export class VideosController {
  constructor(private readonly service: VideosService) {}
  @Get() publicList(@Query() query: VideosQuery) {
    return this.service.publicVideos(query);
  }
  @Get('catalog') publicCatalog(@Query() query: VideosQuery) {
    return this.service.publicCatalog(query);
  }
}

@Controller('communities/:communityId/videos')
@UseGuards(JwtAuthGuard)
export class VideosAdminController {
  constructor(private readonly service: VideosService) {}
  @Get() list(
    @Param('communityId', ParseIntPipe) communityId: number,
    @Query() query: VideosQuery,
    @Req() req: { user: CommunityActor },
  ) {
    return this.service.list(communityId, query, req.user);
  }
  @Get('options') options(
    @Param('communityId', ParseIntPipe) communityId: number,
    @Query() query: VideoOptionsQuery,
    @Req() req: { user: CommunityActor },
  ) {
    return this.service.options(communityId, query.tournamentId, req.user);
  }
  @Post() create(
    @Param('communityId', ParseIntPipe) communityId: number,
    @Body() dto: SaveVideoDto,
    @Req() req: { user: CommunityActor },
  ) {
    return this.service.save(communityId, null, dto, req.user);
  }
  @Put(':id') update(
    @Param('communityId', ParseIntPipe) communityId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveVideoDto,
    @Req() req: { user: CommunityActor },
  ) {
    return this.service.save(communityId, id, dto, req.user);
  }
  @Delete(':id') @HttpCode(204) archive(
    @Param('communityId', ParseIntPipe) communityId: number,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: CommunityActor },
  ) {
    return this.service.archive(communityId, id, req.user);
  }
  @Post('cover')
  @UseInterceptors(
    FileInterceptor('cover', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  cover(
    @Param('communityId', ParseIntPipe) communityId: number,
    @Req() req: { user: CommunityActor },
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ) {
    return this.service.cover(communityId, req.user, file);
  }
}
