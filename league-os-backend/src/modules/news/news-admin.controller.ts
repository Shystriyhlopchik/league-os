import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsBoolean, IsOptional } from 'class-validator';
import type { CommunityActor } from '../communities/communities.service';
import { CommunitiesService } from '../communities/communities.service';
import { NewsAccessService } from './news-access.service';
import { NewsPublicationService } from './news-publication.service';
import { VkNewsClient, VkDeliveryError } from './vk-news.client';
import { CreateNewsDto } from './dto/create-news.dto';
import { ListNewsQueryDto } from './dto/list-news-query.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { NewsService } from './news.service';

class RetryVkDto {
  @IsOptional() @IsBoolean() confirmedAbsent?: boolean;
}

@Controller('admin/news')
@UseGuards(JwtAuthGuard)
export class NewsAdminController {
  constructor(
    private readonly newsService: NewsService,
    private readonly access: NewsAccessService,
    private readonly communities: CommunitiesService,
    private readonly publications: NewsPublicationService,
    private readonly vk: VkNewsClient,
  ) {}

  @Get('communities')
  async availableCommunities(@Req() req: { user: CommunityActor }) {
    return (await this.communities.listForUser(req.user)).filter(
      (c) => c.canManageTournaments,
    );
  }

  @Get('vk-connection')
  async connection(
    @Query('communityId', new ParseIntPipe({ optional: true }))
    communityId: number | undefined,
    @Req() req: { user: CommunityActor },
  ) {
    return this.vk.connection(
      await this.access.community(communityId, req.user),
    );
  }

  @Post('vk-connection/check')
  async checkConnection(
    @Query('communityId', new ParseIntPipe({ optional: true }))
    communityId: number | undefined,
    @Req() req: { user: CommunityActor },
  ) {
    const id = await this.access.community(communityId, req.user);
    try {
      return await this.vk.check(id);
    } catch (error) {
      if (error instanceof VkDeliveryError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get()
  async list(
    @Query() query: ListNewsQueryDto,
    @Query('communityId', new ParseIntPipe({ optional: true }))
    communityId: number | undefined,
    @Req() req: { user: CommunityActor },
  ) {
    return this.newsService.findForAdmin(
      query,
      await this.access.community(communityId, req.user),
    );
  }

  @Get(':newsId')
  findOne(
    @Param('newsId', ParseIntPipe) newsId: number,
    @Req() req: { user: CommunityActor },
  ) {
    return this.access.article(newsId, req.user);
  }

  @Post()
  async create(
    @Body() dto: CreateNewsDto,
    @Req() request: { user: CommunityActor },
  ) {
    return this.newsService.createDraft(
      dto,
      request.user.id,
      await this.access.community(dto.communityId, request.user),
    );
  }

  @Post('cover')
  @UseInterceptors(
    FileInterceptor('cover', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadCover(
    @UploadedFile()
    cover:
      | {
          buffer: Buffer;
          mimetype: string;
          originalname: string;
        }
      | undefined,
    @Req() req: { user: CommunityActor },
    @Query('communityId', new ParseIntPipe({ optional: true }))
    communityId: number | undefined,
  ) {
    await this.access.community(communityId, req.user);
    if (!cover) {
      throw new BadRequestException('Выберите изображение для обложки');
    }
    return this.newsService.saveCover(cover.buffer, cover.mimetype);
  }

  @Patch(':newsId')
  async update(
    @Param('newsId', ParseIntPipe) newsId: number,
    @Body() dto: UpdateNewsDto,
    @Req() request: { user: CommunityActor },
  ) {
    await this.access.article(newsId, request.user);
    if (dto.communityId !== undefined) {
      const news = await this.newsService.findForAdminById(newsId);
      if (dto.communityId !== news.communityId)
        throw new BadRequestException(
          'Перенос новости в другое сообщество запрещён',
        );
    }
    return this.newsService.updateDraft(newsId, dto, request.user.id);
  }

  @Post(':newsId/publish')
  async publish(
    @Param('newsId', ParseIntPipe) newsId: number,
    @Req() request: { user: CommunityActor },
  ) {
    await this.access.article(newsId, request.user);
    return this.newsService.publish(newsId, request.user.id);
  }

  @Post(':newsId/unpublish')
  async unpublish(
    @Param('newsId', ParseIntPipe) newsId: number,
    @Req() request: { user: CommunityActor },
  ) {
    await this.access.article(newsId, request.user);
    return this.newsService.unpublish(newsId, request.user.id);
  }

  @Delete(':newsId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('newsId', ParseIntPipe) newsId: number,
    @Req() req: { user: CommunityActor },
  ) {
    await this.access.article(newsId, req.user);
    return this.newsService.archive(newsId);
  }

  @Get(':newsId/vk')
  vkStatus(
    @Param('newsId', ParseIntPipe) id: number,
    @Req() req: { user: CommunityActor },
  ) {
    return this.publications.status(id, req.user);
  }

  @Post(':newsId/vk')
  sendVk(
    @Param('newsId', ParseIntPipe) id: number,
    @Req() req: { user: CommunityActor },
  ) {
    return this.publications.enqueue(id, req.user);
  }

  @Post(':newsId/vk/retry')
  retryVk(
    @Param('newsId', ParseIntPipe) id: number,
    @Body() dto: RetryVkDto,
    @Req() req: { user: CommunityActor },
  ) {
    return this.publications.retry(id, req.user, dto.confirmedAbsent === true);
  }
}
