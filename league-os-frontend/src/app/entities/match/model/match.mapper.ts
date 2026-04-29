import { Match } from '../../../shared/models';
import {MatchCardVm} from './match-card.vm';


export const mapMatchToCardVm = (match: Match): MatchCardVm => ({
    id: match.id,
    competitionName: match.competitionName,
    competitionLogoUrl: match.competitionLogoUrl,
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
