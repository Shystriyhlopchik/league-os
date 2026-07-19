import { DatePipe } from '@angular/common';
import {
    Component,
    computed,
    DestroyRef,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { EMPTY, Subscription } from 'rxjs';
import { catchError, finalize, switchMap, tap } from 'rxjs/operators';

import { MatchApi } from '../../entities/match/api/match.api';
import { MatchCardVm } from '../../entities/match/model/match-card.vm';
import { mapMatchToCardVm } from '../../entities/match/model/match.mapper';
import { MatchCardComponent } from '../../entities/match/ui/match-card/match-card.component';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';
import { SectionTitleComponent } from '../../shared/ui/section-title/section-title.component';

interface MatchDateGroup {
    key: string;
    date: string;
    matches: MatchCardVm[];
}

@Component({
    selector: 'app-matches-page',
    imports: [DatePipe, MatchCardComponent, SectionTitleComponent],
    templateUrl: './matches-page.component.html',
    styleUrl: './matches-page.component.scss',
})
export class MatchesPageComponent implements OnInit {
    private readonly matchApi = inject(MatchApi);
    private readonly tournamentsApi = inject(TournamentsApi);
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);
    private loadSubscription?: Subscription;

    readonly matches = signal<MatchCardVm[]>([]);
    readonly tournamentName = signal<string | null>(null);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);

    readonly title = computed(() => {
        const tournamentName = this.tournamentName();
        return tournamentName ? `Матчи турнира «${tournamentName}»` : 'Матчи';
    });

    readonly isEmpty = computed(
        () => !this.isLoading() && !this.error() && this.matches().length === 0,
    );

    readonly dateGroups = computed<MatchDateGroup[]>(() => {
        const groups = new Map<string, MatchCardVm[]>();

        for (const match of this.matches()) {
            const key = this.toDateKey(match.matchDateTime);
            const matches = groups.get(key) ?? [];
            matches.push(match);
            groups.set(key, matches);
        }

        return Array.from(groups, ([key, matches]) => ({
            key,
            date: `${key}T00:00:00`,
            matches,
        }));
    });

    ngOnInit(): void {
        this.loadMatches();
    }

    loadMatches(): void {
        this.loadSubscription?.unsubscribe();
        this.isLoading.set(true);
        this.error.set(null);

        this.loadSubscription = this.tournamentsApi
            .getActiveTournament()
            .pipe(
                tap((tournament) => {
                    this.tournamentName.set(tournament?.name ?? null);
                }),
                switchMap((tournament) => {
                    if (!tournament) {
                        this.matches.set([]);
                        this.error.set('Активный турнир не найден');
                        return EMPTY;
                    }

                    return this.matchApi.getByTournament(tournament.id);
                }),
                tap((matches) => {
                    this.matches.set(matches.map(mapMatchToCardVm));
                }),
                catchError(() => {
                    this.matches.set([]);
                    this.error.set('Не удалось загрузить матчи');
                    return EMPTY;
                }),
                finalize(() => this.isLoading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();
    }

    openProtocol(matchId: number | string): void {
        void this.router.navigate(['/matches', matchId, 'protocol']);
    }

    private toDateKey(value: string | Date): string {
        if (typeof value === 'string') {
            return value.slice(0, 10);
        }

        const pad = (part: number) => String(part).padStart(2, '0');
        return [
            value.getFullYear(),
            pad(value.getMonth() + 1),
            pad(value.getDate()),
        ].join('-');
    }
}
