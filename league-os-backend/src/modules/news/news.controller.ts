import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { NewsService } from './news.service';
import { ListNewsQueryDto } from './dto/list-news-query.dto';
import { NewsPageService } from './news-page.service';

@Controller('news')
export class NewsController {
  constructor(
    private readonly newsService: NewsService,
    private readonly pages: NewsPageService,
  ) {}

  @Get(':slug/page')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  page(@Param('slug') slug: string) {
    return this.pages.page(slug);
  }

  @Get()
  getPublishedNews(@Query() query: ListNewsQueryDto) {
    return this.newsService.findPublished(query);
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.newsService.findBySlug(slug);
  }
}
