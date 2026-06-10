import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { InfoCardComponent } from '../../../../shared/ui/info-card/info-card.component';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header.component';
import { MatchServiceStore } from '../../model/match-service.store';
import {DatePipe} from '@angular/common';

@Component({
    selector: 'app-match-service-page',
    imports: [InfoCardComponent, PageHeaderComponent, DatePipe],
    templateUrl: './match-service-page.component.html',
    styleUrl: './match-service-page.component.scss',
})
export class MatchServicePageComponent {
    private readonly router = inject(Router);

    readonly store = inject(MatchServiceStore);

    goBack(): void {
        this.router.navigate(['/dashboard']);
    }

    startMatch(matchId: number): void {
        this.router.navigate(['/dashboard/match-service', matchId, 'rosters']);
    }
}
