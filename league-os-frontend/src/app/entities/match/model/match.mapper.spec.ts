import { Match } from './match.types';
import { mapMatchToCardVm } from './match.mapper';

describe('mapMatchToCardVm', () => {
    it('supports the legacy season response without competition', () => {
        const match = createMatch();
        match.tournament.logoUrl = null;
        delete (match.tournament as Partial<Match['tournament']>).competition;

        const result = mapMatchToCardVm(match);

        expect(result.competitionLogoUrl).toBe('images/logo/dvor-liga.png');
    });

    it('uses the competition logo when the tournament logo is missing', () => {
        const match = createMatch();
        match.tournament.logoUrl = null;
        match.tournament.competition.logoUrl =
            '/uploads/competitions/yard-league.png';

        const result = mapMatchToCardVm(match);

        expect(result.competitionLogoUrl).toBe(
            '/uploads/competitions/yard-league.png',
        );
    });
});

function createMatch(): Match {
    return {
        id: 31,
        tournamentId: 7,
        round: 'Тур 1',
        status: 'scheduled',
        matchDateTime: '2026-07-21T18:30:00',
        homeTeam: {
            id: 1,
            name: 'ЖБК-9',
            shortName: 'ЖБК-9',
            logoUrl: null,
        },
        awayTeam: {
            id: 2,
            name: 'Цезарь',
            shortName: 'Цезарь',
            logoUrl: null,
        },
        score: { home: 0, away: 0 },
        venue: null,
        tournament: {
            id: 7,
            name: 'Дворовая лига',
            slug: 'dvorovaya-liga-2026',
            type: 'league' as never,
            format: 'mixed' as never,
            status: 'planned' as never,
            logoUrl: '/uploads/tournaments/yard-league.png',
            colorPrimary: '#27AE60',
            season: {
                id: 1,
                name: 'Сезон 2026',
                year: 2026,
            },
            competition: {
                id: 1,
                name: 'Дворовая лига',
                slug: 'dvorovaya-liga',
                logoUrl: null,
            },
        },
    };
}
