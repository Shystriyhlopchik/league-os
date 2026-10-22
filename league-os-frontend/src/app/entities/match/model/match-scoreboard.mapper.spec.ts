import { MatchProtocolMatch } from './match-protocol.types';
import { mapProtocolMatchToScoreboardVm } from './match-scoreboard.mapper';

describe('mapProtocolMatchToScoreboardVm', () => {
    const match = (tournamentLogoUrl: string | null): MatchProtocolMatch => ({
        id: 31,
        status: 'scheduled',
        round: 'Тур 1',
        matchDateTime: '2026-07-21T18:30:00',
        tournament: {
            id: 1,
            name: 'Дворовая лига',
            logoUrl: tournamentLogoUrl,
            season: {
                id: 1,
                name: 'Сезон 2026',
                year: 2026,
            },
            competition: {
                id: 1,
                name: 'Дворовая лига',
                logoUrl: '/uploads/competitions/fallback.png',
            },
        },
        venue: null,
        homeTeam: {
            id: 1,
            name: 'ЖБК-9',
            shortName: 'ЖБК-9',
            score: 0,
        },
        awayTeam: {
            id: 2,
            name: 'Цезарь',
            shortName: 'Цезарь',
            score: 0,
        },
    });

    it('uses the tournament logo when it is available', () => {
        const result = mapProtocolMatchToScoreboardVm(
            match('/uploads/tournaments/yard-league.png'),
        );

        expect(result.competitionLogoUrl).toBe(
            '/uploads/tournaments/yard-league.png',
        );
    });

    it('falls back to the competition logo', () => {
        const result = mapProtocolMatchToScoreboardVm(match(null));

        expect(result.competitionLogoUrl).toBe(
            '/uploads/competitions/fallback.png',
        );
    });
});
