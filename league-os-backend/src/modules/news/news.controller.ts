import { Controller, Get, Param, Query } from '@nestjs/common';
import { NewsService } from './news.service';
import { ListNewsQueryDto } from './dto/list-news-query.dto';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  getPublishedNews(@Query() query: ListNewsQueryDto) {
    return this.newsService.findPublished(query);
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.newsService.findBySlug(slug);
  }
}
