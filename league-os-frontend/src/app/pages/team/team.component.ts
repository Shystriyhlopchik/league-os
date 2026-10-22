import {
    Component,
    computed,
    DestroyRef,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { EMPTY, Subscription } from 'rxjs';
import { catchError, finalize, switchMap, tap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { TeamsApi } from '../../entities/team/api/teams.api';
import { Team } from '../../entities/team/model/team.types';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';

type TeamCard = Pick<Team, 'id' | 'name' | 'slug' | 'logoUrl'>;

@Component({
    selector: 'app-team',
    imports: [RouterLink],
    templateUrl: './team.component.html',
    styleUrl: './team.component.scss',
})
export class TeamComponent implements OnInit {
    private readonly teamsApi = inject(TeamsApi);
    private readonly tournamentsApi = inject(TournamentsApi);
    private readonly destroyRef = inject(DestroyRef);
    private loadSubscription?: Subscription;

    readonly teams = signal<TeamCard[]>([]);
    readonly tournamentName = signal<string | null>(null);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);

    readonly title = computed(() => {
        const tournamentName = this.tournamentName();
        return tournamentName
            ? `Команды турнира «${tournamentName}»`
            : 'Команды';
    });

    readonly isEmpty = computed(
        () => !this.isLoading() && !this.error() && this.teams().length === 0,
    );

    ngOnInit(): void {
        this.loadTeams();
    }

    loadTeams(): void {
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
                        this.teams.set([]);
                        this.error.set('Активный турнир не найден');
                        return EMPTY;
                    }

                    return this.teamsApi.getTournamentTeams(tournament.id);
                }),
                tap((teams) => this.teams.set(teams)),
                catchError(() => {
                    this.teams.set([]);
                    this.error.set('Не удалось загрузить команды');
                    return EMPTY;
                }),
                finalize(() => this.isLoading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();
    }

    useFallbackLogo(event: Event): void {
        const image = event.target as HTMLImageElement;
        image.onerror = null;
        image.src = '/images/teams/default-team-logo.png';
    }
}
