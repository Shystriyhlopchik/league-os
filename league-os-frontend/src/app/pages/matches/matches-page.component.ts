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
import { MatchScheduleRowComponent } from '../../entities/match/ui/match-schedule-row/match-schedule-row.component';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';
import { SelectComponent } from '../../shared/ui/select/select.component';
import { SelectOption } from '../../shared/ui/select/select-option.model';

interface MatchDateGroup {
    key: string;
    date: string;
    matches: MatchCardVm[];
}

@Component({
    selector: 'app-matches-page',
    imports: [DatePipe, MatchScheduleRowComponent, SelectComponent],
    templateUrl: './matches-page.component.html',
    styleUrl: './matches-page.component.scss',
})
export class MatchesPageComponent implements OnInit {
    readonly allTeamsId = 0;

    private readonly matchApi = inject(MatchApi);
    private readonly tournamentsApi = inject(TournamentsApi);
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);
    private loadSubscription?: Subscription;

    readonly matches = signal<MatchCardVm[]>([]);
    readonly tournamentName = signal<string | null>(null);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);
    readonly selectedTeamId = signal(this.allTeamsId);
    readonly selectedStatus = signal<'all' | 'upcoming' | 'finished'>('all');
    readonly heroPhotoFailed = signal(false);
    readonly statusFilters = [
        { value: 'all', label: 'Все матчи' },
        { value: 'upcoming', label: 'Предстоящие' },
        { value: 'finished', label: 'Результаты' },
    ] as const;

    readonly title = computed(() => {
        const tournamentName = this.tournamentName();
        return tournamentName ? `Матчи турнира «${tournamentName}»` : 'Матчи';
    });

    readonly teamOptions = computed<SelectOption<number>[]>(() => {
        const teams = new Map<number, string>();

        for (const match of this.matches()) {
            teams.set(match.homeTeamId, match.homeTeamName);
            teams.set(match.awayTeamId, match.awayTeamName);
        }

        const teamOptions = Array.from(teams, ([value, label]) => ({
            value,
            label,
        })).sort((left, right) =>
            left.label.localeCompare(right.label, 'ru', {
                sensitivity: 'base',
            }),
        );

        return [
            { value: this.allTeamsId, label: 'Все команды' },
            ...teamOptions,
        ];
    });

    readonly filteredMatches = computed(() => {
        const teamId = this.selectedTeamId();
        return this.matches().filter(
            (match) =>
                (teamId === this.allTeamsId ||
                    match.homeTeamId === teamId ||
                    match.awayTeamId === teamId) &&
                (this.selectedStatus() === 'all' ||
                    (this.selectedStatus() === 'upcoming' &&
                        match.status === 'scheduled') ||
                    (this.selectedStatus() === 'finished' &&
                        match.status === 'finished')),
        );
    });

    readonly isCalendarEmpty = computed(
        () => !this.isLoading() && !this.error() && this.matches().length === 0,
    );

    readonly isFilterEmpty = computed(
        () =>
            !this.isLoading() &&
            !this.error() &&
            this.matches().length > 0 &&
            this.filteredMatches().length === 0,
    );

    readonly dateGroups = computed<MatchDateGroup[]>(() => {
        const groups = new Map<string, MatchCardVm[]>();

        for (const match of this.filteredMatches()) {
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
                    const mappedMatches = matches
                        .map(mapMatchToCardVm)
                        .sort(
                            (left, right) =>
                                new Date(left.matchDateTime).getTime() -
                                    new Date(right.matchDateTime).getTime() ||
                                left.id - right.id,
                        );
                    this.matches.set(mappedMatches);

                    const selectedTeamId = this.selectedTeamId();
                    if (
                        selectedTeamId !== this.allTeamsId &&
                        !mappedMatches.some(
                            (match) =>
                                match.homeTeamId === selectedTeamId ||
                                match.awayTeamId === selectedTeamId,
                        )
                    ) {
                        this.selectedTeamId.set(this.allTeamsId);
                    }
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

    resetFilters(): void {
        this.selectedTeamId.set(this.allTeamsId);
        this.selectedStatus.set('all');
    }

    private toDateKey(value: string | Date): string {
        const date = new Date(value);
        const pad = (part: number) => String(part).padStart(2, '0');
        return [
            date.getFullYear(),
            pad(date.getMonth() + 1),
            pad(date.getDate()),
        ].join('-');
    }
}
