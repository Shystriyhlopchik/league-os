import { Match } from './match.types';
import { MatchCardVm } from './match-card.vm';

const DEFAULT_TEAM_LOGO = 'images/teams/default-team-logo.svg';

export function mapMatchToCardVm(match: Match): MatchCardVm {
    return {
        id: match.id,
        round: match.round,
        status: match.status,
        matchDateTime: match.matchDateTime,

        homeTeamName: match.homeTeam.shortName || match.homeTeam.name,
        homeTeamLogoUrl: match.homeTeam.logoUrl ?? DEFAULT_TEAM_LOGO,
        homeTeamScore: match.score.home,

        awayTeamName: match.awayTeam.shortName || match.awayTeam.name,
        awayTeamLogoUrl: match.awayTeam.logoUrl ?? DEFAULT_TEAM_LOGO,
        awayTeamScore: match.score.away,

        venueName: match.venue?.name ?? null,

        competitionLogoUrl: match.tournament.competition.logoUrl,
        competitionName: match.tournament.competition.name,

        seasonYear: match.tournament.season.year,
    };
}
