import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatchRosterCheckStore } from '../../../../entities/match-roster/model/match-roster-check.store';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header.component';
import { DatePipe } from '@angular/common';
import { InfoCardComponent } from '../../../../shared/ui/info-card/info-card.component';
import { MatchRosterPlayer } from '../../../../entities/match-roster/model/match-roster.types';

@Component({
    selector: 'app-match-roster-check-page',
    imports: [PageHeaderComponent, DatePipe, InfoCardComponent],
    templateUrl: './match-roster-check-page.component.html',
    styleUrl: './match-roster-check-page.component.scss',
})
export class MatchRosterCheckPageComponent {
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);

    readonly store = inject(MatchRosterCheckStore);

    private readonly matchId = Number(
        this.route.snapshot.paramMap.get('matchId'),
    );

    readonly matchTitle = computed(() => {
        const data = this.store.data();

        if (!data) {
            return '';
        }

        return `${data.match.homeTeam.name} — ${data.match.awayTeam.name}`;
    });

    constructor() {
        this.store.load(this.matchId);
    }

    getPlayerName(player: MatchRosterPlayer): string {
        return [player.lastName, player.firstName, player.middleName]
            .filter(Boolean)
            .join(' ');
    }

    goBack(): void {
        this.router.navigate(['/dashboard/match-service']);
    }
}
