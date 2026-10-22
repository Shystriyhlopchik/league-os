import { Repository } from 'typeorm';

import { CompetitionEntity } from '../competitions/entities/competitions.entity';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { SeasonEntity } from '../seasons/entities/season.entity';
import { StandingEntity } from '../standings/entities/standing.entity';
import { TeamEntity } from '../teams/entities/team.entity';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { TournamentFormat } from '../tournaments/enums/tournament-format.enum';
import { TournamentStatus } from '../tournaments/enums/tournament-status.enum';
import { TeamRankingCalculator } from './team-ranking.calculator';
import { TeamRankingsService } from './team-rankings.service';

type MockRepository<T extends object> = Pick<
  jest.Mocked<Repository<T>>,
  'find' | 'findOneBy'
>;

const repository = <T extends object>(): MockRepository<T> => ({
  find: jest.fn(),
  findOneBy: jest.fn(),
});

describe('TeamRankingsService', () => {
  it('uses goal difference only to break equal rating points', async () => {
    const competitions = repository<CompetitionEntity>();
    const seasons = repository<SeasonEntity>();
    const tournaments = repository<TournamentEntity>();
    const tournamentTeams = repository<TournamentTeamEntity>();
    const matches = repository<MatchEntity>();
    const standings = repository<StandingEntity>();
    const service = new TeamRankingsService(
      competitions as unknown as Repository<CompetitionEntity>,
      seasons as unknown as Repository<SeasonEntity>,
      tournaments as unknown as Repository<TournamentEntity>,
      tournamentTeams as unknown as Repository<TournamentTeamEntity>,
      matches as unknown as Repository<MatchEntity>,
      standings as unknown as Repository<StandingEntity>,
      new TeamRankingCalculator(),
    );

    const teamA = { id: 1, name: 'А', slug: 'a' } as TeamEntity;
    const teamB = { id: 2, name: 'Б', slug: 'b' } as TeamEntity;
    const teamC = { id: 3, name: 'В', slug: 'c' } as TeamEntity;
    competitions.findOneBy.mockResolvedValue({
      id: 7,
      name: 'Дворовая лига',
      slug: 'yard-league',
    } as CompetitionEntity);
    seasons.find.mockResolvedValue([
      {
        id: 11,
        competitionId: 7,
        name: 'Сезон 2026',
        year: 2026,
      } as SeasonEntity,
    ]);
    tournaments.find.mockResolvedValue([
      {
        id: 21,
        seasonId: 11,
        name: 'Дворовая лига 2026',
        format: TournamentFormat.MIXED,
        status: TournamentStatus.ACTIVE,
      } as TournamentEntity,
    ]);
    tournamentTeams.find.mockResolvedValue(
      [teamA, teamB, teamC].map(
        (team, index) =>
          ({
            id: index + 1,
            tournamentId: 21,
            teamId: team.id,
            team,
          }) as TournamentTeamEntity,
      ),
    );
    matches.find.mockResolvedValue([
      finishedMatch(1, 1, 3, 1, 0),
      finishedMatch(2, 2, 3, 5, 0),
      finishedMatch(3, 2, 3, 4, 0),
    ]);
    standings.find.mockResolvedValue([]);

    const response = await service.getCurrent(7);

    expect(response.rankings[0].team.id).toBe(2);
    expect(response.rankings[1].team.id).toBe(1);
    expect(response.rankings[0].points).toBe(29.44);
    expect(response.rankings[1].points).toBe(29.44);
    expect(response.rankings[0].goalDifference).toBe(9);
    expect(response.seasonWeights).toEqual([
      {
        seasonId: 11,
        seasonName: 'Сезон 2026',
        seasonYear: 2026,
        weight: 1,
      },
    ]);
  });
});

function finishedMatch(
  id: number,
  homeTeamId: number,
  awayTeamId: number,
  homeScore: number,
  awayScore: number,
): MatchEntity {
  return {
    id,
    tournamentId: 21,
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    status: MatchStatus.FINISHED,
  } as MatchEntity;
}
