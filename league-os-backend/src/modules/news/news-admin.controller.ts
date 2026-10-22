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
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleCode } from '../users/enums/role-code.enum';
import { CreateNewsDto } from './dto/create-news.dto';
import { ListNewsQueryDto } from './dto/list-news-query.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { NewsService } from './news.service';

@Controller('admin/news')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.Admin, RoleCode.SuperAdmin)
export class NewsAdminController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  list(@Query() query: ListNewsQueryDto) {
    return this.newsService.findForAdmin(query);
  }

  @Get(':newsId')
  findOne(@Param('newsId', ParseIntPipe) newsId: number) {
    return this.newsService.findForAdminById(newsId);
  }

  @Post()
  create(@Body() dto: CreateNewsDto, @Req() request: { user: { id: number } }) {
    return this.newsService.createDraft(dto, request.user.id);
  }

  @Post('cover')
  @UseInterceptors(
    FileInterceptor('cover', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadCover(
    @UploadedFile()
    cover?: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
    },
  ) {
    if (!cover) {
      throw new BadRequestException('Выберите изображение для обложки');
    }
    return this.newsService.saveCover(cover.buffer, cover.mimetype);
  }

  @Patch(':newsId')
  update(
    @Param('newsId', ParseIntPipe) newsId: number,
    @Body() dto: UpdateNewsDto,
    @Req() request: { user: { id: number } },
  ) {
    return this.newsService.updateDraft(newsId, dto, request.user.id);
  }

  @Post(':newsId/publish')
  publish(
    @Param('newsId', ParseIntPipe) newsId: number,
    @Req() request: { user: { id: number } },
  ) {
    return this.newsService.publish(newsId, request.user.id);
  }

  @Post(':newsId/unpublish')
  unpublish(
    @Param('newsId', ParseIntPipe) newsId: number,
    @Req() request: { user: { id: number } },
  ) {
    return this.newsService.unpublish(newsId, request.user.id);
  }

  @Delete(':newsId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('newsId', ParseIntPipe) newsId: number) {
    return this.newsService.archive(newsId);
  }
}
