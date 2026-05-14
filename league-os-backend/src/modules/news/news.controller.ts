import { Controller, Get, Param } from '@nestjs/common';
import { NewsService } from './news.service';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  getPublishedNews() {
    return this.newsService.findPublished();
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.newsService.findOne({
      where: { slug, status: 'published' },
    });
  }
}
