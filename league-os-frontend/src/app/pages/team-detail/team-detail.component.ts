import {
    Component,
    computed,
    DestroyRef,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, forkJoin, of, Subscription } from 'rxjs';
import { catchError, finalize, map, switchMap } from 'rxjs/operators';

import { MatchApi } from '../../entities/match/api/match.api';
import { Match, MatchTeam } from '../../entities/match/model/match.types';
import { PlayerCardsApi } from '../../entities/player-card/api/player-cards.api';
import { PlayerCard } from '../../entities/player-card/model/player-card.types';
import { StandingsApi } from '../../entities/standings/api/standings.api';
import { PublicTournamentView } from '../../entities/standings/model/public-tournament-view.model';
import { StandingRow } from '../../entities/standings/model/standings-row.model';
import { TeamPlayersApi } from '../../entities/team-player/api/team-players.api';
import { TeamPlayer } from '../../entities/team-player/model/team-player.types';
import { TeamsApi } from '../../entities/team/api/teams.api';
import { Team } from '../../entities/team/model/team.types';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';

type TeamMatchResult = 'win' | 'draw' | 'loss';

interface TeamStandingContext {
    row: StandingRow;
    stageName: string;
    groupName?: string;
}

interface TeamLeader {
    key: 'goals' | 'assists' | 'rating';
    label: string;
    value: string;
    player: PlayerCard;
}

@Component({
    selector: 'app-team-detail',
    imports: [DatePipe, RouterLink],
    templateUrl: './team-detail.component.html',
    styleUrls: [
        './team-detail.component.scss',
        './team-detail-insights.component.scss',
    ],
})
export class TeamDetailComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly teamsApi = inject(TeamsApi);
    private readonly teamPlayersApi = inject(TeamPlayersApi);
    private readonly tournamentsApi = inject(TournamentsApi);
    private readonly matchApi = inject(MatchApi);
    private readonly standingsApi = inject(StandingsApi);
    private readonly playerCardsApi = inject(PlayerCardsApi);
    private readonly destroyRef = inject(DestroyRef);
    private loadSubscription?: Subscription;

    readonly team = signal<Team | null>(null);
    readonly players = signal<TeamPlayer[]>([]);
    readonly tournamentName = signal<string | null>(null);
    readonly tournamentMatches = signal<Match[]>([]);
    readonly tournamentView = signal<PublicTournamentView | null>(null);
    readonly tournamentPlayerCards = signal<PlayerCard[]>([]);
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

    readonly standingContext = computed<TeamStandingContext | null>(() => {
        const teamId = this.team()?.id;
        const view = this.tournamentView();
        if (!teamId || !view) return null;

        const activeStage = view.stages.find(
            (stage) =>
                stage.id === view.activeStageId || stage.status === 'active',
        );
        const remainingStages = view.stages
            .filter((stage) => stage !== activeStage)
            .sort((left, right) => right.order - left.order);
        const stages = activeStage
            ? [activeStage, ...remainingStages]
            : remainingStages;

        for (const stage of stages) {
            for (const group of stage.groups) {
                const row = group.standings.find(
                    (standing) => standing.team.id === teamId,
                );
                if (row) {
                    return {
                        row,
                        stageName: stage.name,
                        groupName: group.name,
                    };
                }
            }

            const row = stage.standings.find(
                (standing) => standing.team.id === teamId,
            );
            if (row) return { row, stageName: stage.name };
        }

        return null;
    });

    readonly teamMatches = computed(() => {
        const teamId = this.team()?.id;
        if (!teamId) return [];

        return this.tournamentMatches().filter(
            (match) =>
                match.homeTeam.id === teamId || match.awayTeam.id === teamId,
        );
    });

    readonly recentMatches = computed(() =>
        this.teamMatches()
            .filter(
                (match) =>
                    match.status === 'finished' &&
                    match.score.home !== null &&
                    match.score.away !== null,
            )
            .sort(
                (left, right) =>
                    this.matchTimestamp(right) - this.matchTimestamp(left),
            )
            .slice(0, 5),
    );

    readonly formMatches = computed(() => [...this.recentMatches()].reverse());

    readonly nextMatch = computed(() => {
        const now = Date.now();
        const liveMatch = this.teamMatches().find(
            (match) => match.status === 'live',
        );
        if (liveMatch) return liveMatch;

        return (
            this.teamMatches()
                .filter(
                    (match) =>
                        match.status === 'scheduled' &&
                        this.matchTimestamp(match) >= now,
                )
                .sort(
                    (left, right) =>
                        this.matchTimestamp(left) - this.matchTimestamp(right),
                )[0] ?? null
        );
    });

    readonly teamLeaders = computed<TeamLeader[]>(() => {
        const teamId = this.team()?.id;
        if (!teamId) return [];

        const players = this.tournamentPlayerCards().filter(
            (player) => player.team.id === teamId,
        );
        if (!players.length) return [];

        const byGoals = [...players].sort(
            (left, right) =>
                right.stats.goals - left.stats.goals ||
                right.ratings.ovr - left.ratings.ovr,
        )[0];
        const byAssists = [...players].sort(
            (left, right) =>
                right.stats.assists - left.stats.assists ||
                right.ratings.ovr - left.ratings.ovr,
        )[0];
        const byRating = [...players].sort(
            (left, right) => right.ratings.ovr - left.ratings.ovr,
        )[0];

        return [
            {
                key: 'goals',
                label: 'Бомбардир',
                value: `Голы: ${byGoals.stats.goals}`,
                player: byGoals,
            },
            {
                key: 'assists',
                label: 'Ассистент',
                value: `Передачи: ${byAssists.stats.assists}`,
                player: byAssists,
            },
            {
                key: 'rating',
                label: 'Лучший рейтинг',
                value: `OVR: ${byRating.ratings.ovr}`,
                player: byRating,
            },
        ];
    });

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
        this.resetTournamentData();

        this.loadSubscription = forkJoin({
            team: this.teamsApi.getTeam(teamId),
            players: this.teamPlayersApi.getByTeam(teamId),
            tournament: this.tournamentsApi
                .getActiveTournament()
                .pipe(catchError(() => of(null))),
        })
            .pipe(
                switchMap(({ team, players, tournament }) => {
                    if (!tournament) {
                        return of({
                            team,
                            players,
                            tournamentName: null,
                            matches: [] as Match[],
                            view: null as PublicTournamentView | null,
                            playerCards: [] as PlayerCard[],
                        });
                    }

                    const standingsRequest = this.standingsApi
                        .getPublicTournamentView(tournament.id)
                        .pipe(
                            catchError(() =>
                                this.standingsApi.getLegacyPublicTournamentView(
                                    tournament.id,
                                ),
                            ),
                            catchError(() => of(null)),
                        );

                    return forkJoin({
                        matches: this.matchApi
                            .getByTournament(tournament.id)
                            .pipe(catchError(() => of([] as Match[]))),
                        view: standingsRequest,
                        playerCards: this.playerCardsApi
                            .getTournamentCards(tournament.id)
                            .pipe(
                                map((response) => response.players),
                                catchError(() => of([] as PlayerCard[])),
                            ),
                    }).pipe(
                        map(({ matches, view, playerCards }) => ({
                            team,
                            players,
                            tournamentName: tournament.name,
                            matches,
                            view,
                            playerCards,
                        })),
                    );
                }),
                catchError(() => {
                    this.team.set(null);
                    this.players.set([]);
                    this.error.set('Не удалось загрузить информацию о команде');
                    return EMPTY;
                }),
                finalize(() => this.isLoading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(
                ({
                    team,
                    players,
                    tournamentName,
                    matches,
                    view,
                    playerCards,
                }) => {
                    this.team.set(team);
                    this.players.set(players);
                    this.tournamentName.set(tournamentName);
                    this.tournamentMatches.set(matches);
                    this.tournamentView.set(view);
                    this.tournamentPlayerCards.set(playerCards);
                },
            );
    }

    matchResult(match: Match): TeamMatchResult {
        const teamId = this.team()?.id;
        const homeScore = match.score.home ?? 0;
        const awayScore = match.score.away ?? 0;

        if (homeScore === awayScore) return 'draw';
        const teamWon =
            (match.homeTeam.id === teamId && homeScore > awayScore) ||
            (match.awayTeam.id === teamId && awayScore > homeScore);
        return teamWon ? 'win' : 'loss';
    }

    matchResultShort(match: Match): string {
        const labels: Record<TeamMatchResult, string> = {
            win: 'В',
            draw: 'Н',
            loss: 'П',
        };
        return labels[this.matchResult(match)];
    }

    matchResultLabel(match: Match): string {
        const labels: Record<TeamMatchResult, string> = {
            win: 'Победа',
            draw: 'Ничья',
            loss: 'Поражение',
        };
        return labels[this.matchResult(match)];
    }

    opponent(match: Match): MatchTeam {
        return match.homeTeam.id === this.team()?.id
            ? match.awayTeam
            : match.homeTeam;
    }

    teamScore(match: Match): number | null {
        return match.homeTeam.id === this.team()?.id
            ? match.score.home
            : match.score.away;
    }

    opponentScore(match: Match): number | null {
        return match.homeTeam.id === this.team()?.id
            ? match.score.away
            : match.score.home;
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

    private matchTimestamp(match: Match): number {
        const timestamp = new Date(match.matchDateTime).getTime();
        return Number.isNaN(timestamp) ? 0 : timestamp;
    }

    private resetTournamentData(): void {
        this.tournamentName.set(null);
        this.tournamentMatches.set([]);
        this.tournamentView.set(null);
        this.tournamentPlayerCards.set([]);
    }
}
