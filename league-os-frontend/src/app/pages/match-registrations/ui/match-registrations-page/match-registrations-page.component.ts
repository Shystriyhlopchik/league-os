import { DatePipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { InfoCardComponent } from '../../../../shared/ui/info-card/info-card.component';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header.component';
import { MatchRegistrationsStore } from '../../model/match-registrations.store';
import { SessionStore } from '../../../../entities/user/model/session.store';
import { UserRole } from '../../../../entities/user/model/user-role.type';
import { MatchServiceMatch, MatchServiceTeam } from '../../../../entities/match-service/model/match-service.types';

@Component({
    selector: 'app-match-registrations-page',
    imports: [InfoCardComponent, PageHeaderComponent, DatePipe],
    templateUrl: './match-registrations-page.component.html',
    styleUrl: '../../../match-service/ui/match-service-page/match-service-page.component.scss',
    providers: [MatchRegistrationsStore],
})
export class MatchRegistrationsPageComponent implements OnInit {
    private readonly router = inject(Router);
    private readonly sessionStore = inject(SessionStore);

    readonly store = inject(MatchRegistrationsStore);

    ngOnInit(): void {
        this.store.loadMatches();
    }

    goBack(): void {
        this.router.navigate(['/dashboard']);
    }

    getManageableTeams(match: MatchServiceMatch): MatchServiceTeam[] {
        if (this.sessionStore.hasAnyRole(UserRole.Admin, UserRole.SuperAdmin)) {
            return [match.homeTeam, match.awayTeam];
        }

        const teamIds = new Set(
            this.sessionStore.user()?.manageableTeamIds ?? [],
        );

        return [match.homeTeam, match.awayTeam].filter((team) =>
            teamIds.has(team.id),
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
