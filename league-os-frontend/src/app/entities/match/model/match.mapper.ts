import { Match } from './match.types';
import { MatchCardVm } from './match-card.vm';

const DEFAULT_TEAM_LOGO = 'images/logo/logo_team_def.png';
const DEFAULT_TOURNAMENT_LOGO = 'images/logo/dvor-liga.png';

export function mapMatchToCardVm(match: Match): MatchCardVm {
    return {
        id: match.id,
        round: match.round,
        status: match.status,
        matchDateTime: match.matchDateTime,

        homeTeamId: match.homeTeam.id,
        homeTeamName: match.homeTeam.shortName || match.homeTeam.name,
        homeTeamLogoUrl: match.homeTeam.logoUrl ?? DEFAULT_TEAM_LOGO,
        homeTeamScore: match.score.home,

        awayTeamId: match.awayTeam.id,
        awayTeamName: match.awayTeam.shortName || match.awayTeam.name,
        awayTeamLogoUrl: match.awayTeam.logoUrl ?? DEFAULT_TEAM_LOGO,
        awayTeamScore: match.score.away,

        venueName: match.venue?.name ?? null,

        competitionLogoUrl:
            match.tournament.logoUrl ??
            match.tournament.competition?.logoUrl ??
            DEFAULT_TOURNAMENT_LOGO,
        competitionName: match.tournament.name,

        seasonYear: match.tournament.season.year,
    };
}
