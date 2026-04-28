import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import { MatAnchor, MatButton, MatFabAnchor } from '@angular/material/button';
import { NewsBlockComponent } from './components/news-block/news-block.component';
import { MatchTableBlockComponent } from './components/match-table-block/match-table-block.component';
import { MatIconModule } from '@angular/material/icon';
import { NewsListComponent } from '../../shared/components/news-list/news-list.component';
import { StatsComponent } from '../../shared/components/stats/stats.component';

@Component({
    selector: 'app-home',
    imports: [
        RouterLink,
        NgOptimizedImage,
        MatButton,
        NewsBlockComponent,
        MatchTableBlockComponent,
        MatAnchor,
        MatFabAnchor,
        MatIconModule,
        NewsListComponent,
        StatsComponent,
    ],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
})
export class HomeComponent {}
