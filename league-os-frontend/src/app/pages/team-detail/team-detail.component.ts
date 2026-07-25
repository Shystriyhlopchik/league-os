import {
    Component,
    computed,
    DestroyRef,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, forkJoin, Subscription } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

import { TeamPlayersApi } from '../../entities/team-player/api/team-players.api';
import { TeamPlayer } from '../../entities/team-player/model/team-player.types';
import { TeamsApi } from '../../entities/team/api/teams.api';
import { Team } from '../../entities/team/model/team.types';

@Component({
    selector: 'app-team-detail',
    imports: [RouterLink],
    templateUrl: './team-detail.component.html',
    styleUrl: './team-detail.component.scss',
})
export class TeamDetailComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly teamsApi = inject(TeamsApi);
    private readonly teamPlayersApi = inject(TeamPlayersApi);
    private readonly destroyRef = inject(DestroyRef);
    private loadSubscription?: Subscription;

    readonly team = signal<Team | null>(null);
    readonly players = signal<TeamPlayer[]>([]);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);

    readonly location = computed(() => {
        const team = this.team();
        if (!team) {
            return 'Не указана';
        }

        return (
            [team.city, team.village].filter(Boolean).join(', ') || 'Не указана'
        );
    });

    readonly activePlayers = computed(() =>
        this.players().filter(
            (teamPlayer) => teamPlayer.isActive && teamPlayer.player.isActive,
        ),
    );

    ngOnInit(): void {
        this.loadTeam();
    }

    loadTeam(): void {
        const teamId = Number(this.route.snapshot.paramMap.get('teamId'));

        if (!Number.isInteger(teamId) || teamId <= 0) {
            this.team.set(null);
            this.players.set([]);
            this.error.set('Команда не найдена');
            return;
        }

        this.loadSubscription?.unsubscribe();
        this.isLoading.set(true);
        this.error.set(null);

        this.loadSubscription = forkJoin({
            team: this.teamsApi.getTeam(teamId),
            players: this.teamPlayersApi.getByTeam(teamId),
        })
            .pipe(
                catchError(() => {
                    this.team.set(null);
                    this.players.set([]);
                    this.error.set('Не удалось загрузить информацию о команде');
                    return EMPTY;
                }),
                finalize(() => this.isLoading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(({ team, players }) => {
                this.team.set(team);
                this.players.set(players);
            });
    }

    playerName(teamPlayer: TeamPlayer): string {
        const { firstName, lastName, middleName } = teamPlayer.player;
        return [lastName, firstName, middleName].filter(Boolean).join(' ');
    }

    playerPosition(teamPlayer: TeamPlayer): string {
        const position = teamPlayer.position ?? teamPlayer.player.position;
        const labels: Record<string, string> = {
            goalkeeper: 'Вратарь',
            defender: 'Защитник',
            midfielder: 'Полузащитник',
            winger: 'Крайний игрок',
            forward: 'Нападающий',
        };

        return position ? (labels[position] ?? position) : 'Игрок';
    }

    imageUrl(url?: string | null): string | null {
        if (!url) {
            return null;
        }

        if (/^(https?:)?\/\//i.test(url) || url.startsWith('/')) {
            return url;
        }

        return `/${url}`;
    }

    useFallbackLogo(event: Event): void {
        this.useFallbackImage(event, '/images/teams/default-team-logo.png');
    }

    useFallbackPlayerPhoto(event: Event): void {
        this.useFallbackImage(event, '/images/organization-team/not-photo.png');
    }

    private useFallbackImage(event: Event, fallback: string): void {
        const image = event.target as HTMLImageElement;
        image.onerror = null;
        image.src = fallback;
    }
}
