import { MatchProtocolMatch } from './match-protocol.types';
import { MatchScoreboardVm } from './match-scoreboard.vm';

export function mapProtocolMatchToScoreboardVm(
    match: MatchProtocolMatch,
): MatchScoreboardVm {
    return {
        competitionLogoUrl:
            match.tournament.logoUrl ??
            match.tournament.competition.logoUrl,
        tournamentName: match.tournament.name,

        seasonName: match.tournament.season.name,
        round: match.round,
        matchDateTime: match.matchDateTime,
        status: match.status,

        homeTeam: {
            id: match.homeTeam.id,
            name: match.homeTeam.name,
            shortName: match.homeTeam.shortName,
            logoUrl: match.homeTeam.logoUrl,
        },

        awayTeam: {
            id: match.awayTeam.id,
            name: match.awayTeam.name,
            shortName: match.awayTeam.shortName,
            logoUrl: match.awayTeam.logoUrl,
        },

        homeScore: match.homeTeam.score,
        awayScore: match.awayTeam.score,

        venueName: match.venue?.name ?? null,
    };
}
