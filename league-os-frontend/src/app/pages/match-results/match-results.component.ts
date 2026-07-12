import { DatePipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatchResultsStore } from './match-results.store';
import { InfoCardComponent } from '../../shared/ui/info-card/info-card.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

@Component({
    selector: 'app-match-results',
    imports: [DatePipe, InfoCardComponent, PageHeaderComponent],
    templateUrl: './match-results.component.html',
    styleUrl: '../match-service/ui/match-service-page/match-service-page.component.scss',
    providers: [MatchResultsStore],
})
export class MatchResultsComponent implements OnInit {
    private readonly router = inject(Router);
    readonly store = inject(MatchResultsStore);

    ngOnInit(): void {
        this.store.loadMatches();
    }

    goBack(): void {
        this.router.navigate(['/dashboard']);
    }

    selectMatch(matchId: number): void {
        this.router.navigate(['/dashboard/match-results', matchId]);
    }
}
