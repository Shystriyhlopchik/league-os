import {Component, Input} from '@angular/core';
import {MatGridList, MatGridTile} from '@angular/material/grid-list';
import {MatCard, MatCardContent, MatCardImage, MatCardTitle} from '@angular/material/card';
import {NgForOf} from '@angular/common';

export interface NewsItem {
  image: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-news-block',
  imports: [
    MatGridList,
    MatGridTile,
    MatCard,
    MatCardContent,
    MatCardImage,
    MatCardTitle,
    NgForOf
  ],
  templateUrl: './news-block.component.html',
  styleUrl: './news-block.component.scss'
})
export class NewsBlockComponent {
  @Input() news: NewsItem[] = [];
}
