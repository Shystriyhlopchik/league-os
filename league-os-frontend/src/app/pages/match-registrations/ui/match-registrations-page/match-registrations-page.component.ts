import { DatePipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { Router } from '@angular/router';

import { InfoCardComponent } from '../../../../shared/ui/info-card/info-card.component';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header.component';
import { MatchRegistrationsStore } from '../../model/match-registrations.store';
import { SessionStore } from '../../../../entities/user/model/session.store';
import {
    MatchServiceMatch,
    MatchServiceTeam,
} from '../../../../entities/match-service/model/match-service.types';

@Component({
    selector: 'app-match-registrations-page',
    imports: [InfoCardComponent, PageHeaderComponent, DatePipe],
    templateUrl: './match-registrations-page.component.html',
    styleUrl:
        '../../../match-service/ui/match-service-page/match-service-page.component.scss',
    providers: [MatchRegistrationsStore],
})
export class MatchRegistrationsPageComponent implements OnInit {
    private readonly router = inject(Router);
    private readonly sessionStore = inject(SessionStore);

    readonly store = inject(MatchRegistrationsStore);

    ngOnInit(): void {
        this.sessionStore
            .refreshUser()
            .pipe(finalize(() => this.store.loadMatches()))
            .subscribe({ error: () => {} });
    }

    goBack(): void {
        this.router.navigate(['/dashboard']);
    }

    getManageableTeams(match: MatchServiceMatch): MatchServiceTeam[] {
        return [match.homeTeam, match.awayTeam].filter((team) =>
            this.sessionStore.canManageTeam(team.id, match.communityId),
        );
    }

    openRegistration(matchId: number, teamId: number): void {
        this.router.navigate([
            '/dashboard/match-registrations',
            matchId,
            'teams',
            teamId,
        ]);
    }
}
