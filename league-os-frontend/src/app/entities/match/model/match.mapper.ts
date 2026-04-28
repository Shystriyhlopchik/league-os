import { Match } from '../../../shared/models';
import { MatchCardVm } from '../ui/match-card/match-card.component';

export const mapMatchToCardVm = (match: Match): MatchCardVm => ({
    id: match.id,
    seasonYear: match.seasonYear,
    roundNumber: match.roundNumber,
    matchDateTime: match.matchDateTime,
    homeTeamName: match.homeTeamName,
    homeTeamLogoUrl: match.homeTeamLogoUrl,
    homeTeamScore: match.homeTeamScore,
    awayTeamName: match.awayTeamName,
    awayTeamLogoUrl: match.awayTeamLogoUrl,
    awayTeamScore: match.awayTeamScore,
    venueName: match.venueName,
});
