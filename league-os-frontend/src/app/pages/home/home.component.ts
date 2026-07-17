import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatchesSliderComponent } from '../../widgets/matches-slide/matches-slider/matches-slider.component';
import { StatisticsPreviewComponent } from '../../widgets/statistics-preview/statistics-preview.component';
import {NewsPreviewComponent} from '../../widgets/news-preview/ui/news-preview/news-preview.component';
import {AdvertisingBannerComponent} from '../../widgets/advertising-banner/advertising-banner.component';
import {StatsSummaryComponent} from '../../widgets/stats-summary/stats-summary.component';
import {TeamsMapComponent} from '../../widgets/teams-map/teams-map.component';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';

@Component({
    selector: 'app-home',
    imports: [
        MatchesSliderComponent,
        StatisticsPreviewComponent,
        NewsPreviewComponent,
        AdvertisingBannerComponent,
        StatsSummaryComponent,
        TeamsMapComponent,
    ],
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
})
export class HomeComponent {
    private readonly tournamentsApi = inject(TournamentsApi);

    readonly activeTournament = toSignal(
        this.tournamentsApi.getActiveTournament(),
        { initialValue: null },
    );
}
