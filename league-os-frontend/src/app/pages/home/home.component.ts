import { Component } from '@angular/core';
import { MatchesSliderComponent } from '../../widgets/matches-slide/matches-slider/matches-slider.component';
import { TeamsShowcaseComponent } from '../../widgets/teams-showcase/teams-showcase.component';
import { StatisticsPreviewComponent } from '../../widgets/statistics-preview/statistics-preview.component';
import {NewsPreviewComponent} from '../../widgets/news-preview/ui/news-preview/news-preview.component';
import {AdvertisingBannerComponent} from '../../widgets/advertising-banner/advertising-banner.component';
import {StatsSummaryComponent} from '../../widgets/stats-summary/stats-summary.component';

@Component({
    selector: 'app-home',
    imports: [
        MatchesSliderComponent,
        TeamsShowcaseComponent,
        StatisticsPreviewComponent,
        NewsPreviewComponent,
        AdvertisingBannerComponent,
        StatsSummaryComponent,
    ],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
})
export class HomeComponent {
    ngOnInit() {
        console.log('home');
    }
}
