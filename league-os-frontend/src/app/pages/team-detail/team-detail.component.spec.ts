import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
    convertToParamMap,
    ActivatedRoute,
    provideRouter,
} from '@angular/router';
import { of } from 'rxjs';

import { MatchApi } from '../../entities/match/api/match.api';
import { Match } from '../../entities/match/model/match.types';
import { PlayerCardsApi } from '../../entities/player-card/api/player-cards.api';
import { PlayerCard } from '../../entities/player-card/model/player-card.types';
import { StandingsApi } from '../../entities/standings/api/standings.api';
import { PublicTournamentView } from '../../entities/standings/model/public-tournament-view.model';
import { TeamPlayersApi } from '../../entities/team-player/api/team-players.api';
import { TeamsApi } from '../../entities/team/api/teams.api';
import { Team } from '../../entities/team/model/team.types';
import {
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentType,
} from '../../entities/tournaments/model/tournaments.model';
import { TournamentsApi } from '../../entities/tournaments/api/tournaments.api';
import { TeamDetailComponent } from './team-detail.component';

describe('TeamDetailComponent', () => {
    let fixture: ComponentFixture<TeamDetailComponent>;

    const team: Team = {
        id: 7,
        name: 'Север',
        slug: 'sever',
        isActive: true,
    };

    const opponent = {
        id: 8,
        name: 'Юг',
        shortName: 'Юг',
        logoUrl: null,
    };

    const tournament: Tournament = {
        id: 3,
        name: 'Дворовая лига',
        slug: 'yard-league',
        type: TournamentType.LEAGUE,
        format: TournamentFormat.ROUND_ROBIN,
        status: TournamentStatus.ACTIVE,
        season: { id: 1, name: '2026', year: 2026 },
        competition: { id: 1, name: 'Лига', slug: 'league' },
        colorPrimary: '#f61129',
    };

    const tournamentView: PublicTournamentView = {
        tournament: { id: 3, name: tournament.name },
        activeStageId: 11,
        stages: [
            {
                id: 11,
                key: 'group',
                name: 'Групповой этап',
                type: 'group_stage',
                order: 1,
                status: 'active',
                groups: [
                    {
                        id: 21,
                        key: 'a',
                        name: 'Группа А',
                        order: 1,
                        standings: [
                            {
                                position: 2,
                                team: { id: team.id, name: team.name },
                                played: 4,
                                wins: 2,
                                draws: 1,
                                losses: 1,
                                goalsFor: 8,
                                goalsAgainst: 5,
                                goalDifference: 3,
                                points: 7,
                            },
                        ],
                    },
                ],
                standings: [],
                crossGroupRankings: [],
                bracket: { confirmed: false, matches: [] },
                empty: false,
            },
        ],
    };

    const playerCards: PlayerCard[] = [
        playerCard(1, 'Иван Голин', 5, 1, 82),
        playerCard(2, 'Пётр Пасов', 2, 6, 78),
        playerCard(3, 'Максим Рейтинг', 1, 2, 91),
    ];

    const matches: Match[] = [
        match(1, '2026-06-01T15:00:00', 'finished', 3, 1),
        match(2, '2026-06-08T15:00:00', 'finished', 0, 2),
        match(3, '2099-09-01T15:00:00', 'scheduled', null, null),
    ];

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TeamDetailComponent],
            providers: [
                provideRouter([]),
                {
                    provide: ActivatedRoute,
                    useValue: {
                        snapshot: {
                            paramMap: convertToParamMap({ teamId: team.id }),
                        },
                    },
                },
                {
                    provide: TeamsApi,
                    useValue: { getTeam: () => of(team) },
                },
                {
                    provide: TeamPlayersApi,
                    useValue: { getByTeam: () => of([]) },
                },
                {
                    provide: TournamentsApi,
                    useValue: { getActiveTournament: () => of(tournament) },
                },
                {
                    provide: MatchApi,
                    useValue: { getByTournament: () => of(matches) },
                },
                {
                    provide: StandingsApi,
                    useValue: {
                        getPublicTournamentView: () => of(tournamentView),
                        getLegacyPublicTournamentView: () => of(tournamentView),
                    },
                },
                {
                    provide: PlayerCardsApi,
                    useValue: {
                        getTournamentCards: () =>
                            of({
                                tournamentId: tournament.id,
                                tournamentName: tournament.name,
                                ratingVersion: 1 as const,
                                players: playerCards,
                            }),
                    },
                },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(TeamDetailComponent);
        fixture.detectChanges();
    });

    it('shows the team position and the next opponent', () => {
        const element = fixture.nativeElement as HTMLElement;

        expect(
            element.querySelector('.standing-card__position strong')
                ?.textContent,
        ).toContain('2');
        expect(
            element.querySelector('.next-match-card__opponent strong')
                ?.textContent,
        ).toContain(opponent.name);
    });

    it('shows recent form from oldest to newest', () => {
        const element = fixture.nativeElement as HTMLElement;
        const results = Array.from(
            element.querySelectorAll<HTMLElement>('.team-form__result'),
        ).map((result) => result.textContent?.trim());

        expect(results).toEqual(['В', 'П']);
    });

    it('shows the goals, assists and rating leaders', () => {
        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

        expect(text).toContain('Иван Голин');
        expect(text).toContain('Пётр Пасов');
        expect(text).toContain('Максим Рейтинг');
        expect(text).toContain('OVR: 91');
    });

    function match(
        id: number,
        matchDateTime: string,
        status: Match['status'],
        home: number | null,
        away: number | null,
    ): Match {
        return {
            id,
            tournamentId: tournament.id,
            round: '1 тур',
            status,
            matchDateTime,
            homeTeam: {
                id: team.id,
                name: team.name,
                shortName: team.name,
                logoUrl: null,
            },
            awayTeam: opponent,
            score: { home, away },
            venue: { id: 1, name: 'Стадион' },
            tournament,
        };
    }

    function playerCard(
        playerId: number,
        name: string,
        goals: number,
        assists: number,
        ovr: number,
    ): PlayerCard {
        return {
            playerId,
            name,
            photoUrl: null,
            position: 'MF',
            positionName: 'Полузащитник',
            team: { id: team.id, name: team.name, logoUrl: null },
            shirtNumber: playerId,
            preferredFoot: 'right',
            preferredFootName: 'Правая',
            hasLimitedData: false,
            ratings: {
                ovr,
                att: ovr,
                cre: ovr,
                form: ovr,
                exp: ovr,
                disc: ovr,
                imp: ovr,
            },
            stats: {
                matches: 4,
                goals,
                assists,
                goalContributions: goals + assists,
                goalsPerMatch: goals / 4,
                assistsPerMatch: assists / 4,
                goalContributionsPerMatch: (goals + assists) / 4,
                recentGoalContributions: goals + assists,
                yellowCards: 0,
                secondYellowCards: 0,
                redCards: 0,
                suspensions: 0,
            },
        };
    }
});
