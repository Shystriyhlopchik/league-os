import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  TeamPublicService,
  aggregateTeamStatistics,
} from './team-public.service';
import { TeamStatisticsQuery } from './dto/team-public-query.dto';
import { CommunityTeamEntity } from '../registrations/entities/registration.entity';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import { VideoEntity } from '../videos/entities/video.entity';
import { StandingEntity } from '../standings/entities/standing.entity';

describe('Team public pages', () => {
  const teamId = 2;
  const oldPlayer = {
    id: 17,
    firstName: 'Иван',
    lastName: 'Бывший',
    middleName: null,
    isActive: false,
    userId: 999,
  };
  const teammate = {
    id: 18,
    firstName: 'Олег',
    lastName: 'Пасов',
    isActive: true,
  };
  const match = (id = 1, tournamentId = 10, date = '2026-10-01T12:00:00') =>
    ({
      id,
      tournamentId,
      homeTeamId: 2,
      awayTeamId: 3,
      status: 'finished',
      homeScore: 3,
      awayScore: 1,
      matchDatetime: new Date(date),
      homeTeam: { id: 2, name: 'Команда' },
      awayTeam: { id: 3, name: 'Соперник' },
    }) as MatchEntity;
  const event = (extra = {}) =>
    ({
      id: 1,
      matchId: 1,
      teamId,
      eventType: 'goal',
      goalValue: 1,
      isCancelled: false,
      playerId: 17,
      player: oldPlayer,
      assistPlayerId: 18,
      assistPlayer: teammate,
      ...extra,
    }) as MatchEventEntity;
  const roster = (extra = {}) =>
    ({
      wasAllowed: true,
      player: oldPlayer,
      matchRoster: { teamId: 2, matchId: 1, isApproved: true },
      ...extra,
    }) as MatchRosterPlayerEntity;
  const entry = (id = 10, seasonId = 1, extra = {}) => ({
    teamId,
    tournamentId: id,
    tournament: {
      id,
      name: `Турнир ${id}`,
      seasonId,
      status: 'finished',
      lifecycleStatus: 'completed',
      format: 'group_stage_playoff',
      season: { id: seasonId, name: `Сезон ${seasonId}`, year: 2026 },
    },
    ...extra,
  });
  function setup() {
    const repos = new Map<any, any>();
    const repo = (entity: any, rows: any[]) => {
      const r = {
        find: jest.fn().mockResolvedValue(rows),
        findOne: jest.fn().mockResolvedValue(rows[0] || null),
      };
      repos.set(entity, r);
      return r;
    };
    const links = repo(CommunityTeamEntity, [
      { communityId: 1, community: { id: 1, name: 'Лига', isDefault: true } },
    ]);
    const entries = repo(TournamentTeamEntity, [entry()]);
    const matches = repo(MatchEntity, [match()]);
    const players = repo(TeamPlayerEntity, []);
    const rosters = repo(MatchRosterPlayerEntity, [roster()]);
    const events = repo(MatchEventEntity, [event()]);
    const standings = repo(StandingEntity, []);
    const videos = repo(VideoEntity, []);
    const service = new TeamPublicService(
      { getRepository: (entity: any) => repos.get(entity) } as any,
      {
        findPublicById: jest.fn().mockResolvedValue({ id: 2, name: 'Команда' }),
      } as any,
    );
    return {
      service,
      links,
      entries,
      matches,
      players,
      rosters,
      events,
      standings,
      videos,
    };
  }

  it('retains former and inactive players without consulting their current team', () => {
    const stats = aggregateTeamStatistics(
      teamId,
      [match()],
      [roster()],
      [event()],
    );
    expect(stats.players.find((p) => p.playerId === 17)).toMatchObject({
      goals: 1,
      matches: 1,
    });
    expect(stats.players.find((p) => p.playerId === 18)).toMatchObject({
      assists: 1,
      matches: 1,
    });
    expect(stats.players[0]).not.toHaveProperty('userId');
  });
  it('ignores cancelled events and contributions made for another club or match', () => {
    const stats = aggregateTeamStatistics(
      teamId,
      [match()],
      [],
      [
        event({ isCancelled: true }),
        event({ teamId: 9 }),
        event({ matchId: 99 }),
      ],
    );
    expect(stats.players).toEqual([]);
  });
  it('counts weighted and penalty goals, but never own goals or own-goal assists', () => {
    const stats = aggregateTeamStatistics(
      teamId,
      [match()],
      [],
      [
        event({ goalValue: 2 }),
        event({ eventType: 'penalty_goal' }),
        event({ eventType: 'own_goal' }),
      ],
    );
    expect(stats.players.find((p) => p.playerId === 17)?.goals).toBe(3);
    expect(stats.players.find((p) => p.playerId === 18)?.assists).toBe(2);
    expect(stats.players[0].matches).toBe(1);
  });
  it('counts second yellows explicitly and uses the official winner for shootouts', () => {
    const stats = aggregateTeamStatistics(
      teamId,
      [{ ...match(), homeScore: 1, awayScore: 1, winnerTeamId: 2 }],
      [],
      [
        event({ eventType: 'yellow_card' }),
        event({ eventType: 'second_yellow_card' }),
        event({ eventType: 'red_card' }),
      ],
    );
    expect(stats.totals).toMatchObject({
      wins: 1,
      draws: 0,
      goalsFor: 1,
      goalsAgainst: 1,
    });
    expect(stats.players[0]).toMatchObject({
      yellowCards: 2,
      secondYellowCards: 1,
      redCards: 1,
      assists: 0,
    });
  });
  it('returns no statistics for a period without finished matches', async () => {
    const s = setup();
    s.matches.find.mockResolvedValue([{ ...match(), status: 'scheduled' }]);
    const stats = await s.service.statistics(2, {});
    expect(stats.totals.matches).toBe(0);
    expect(stats.players).toEqual([]);
    expect(s.events.find).not.toHaveBeenCalled();
  });
  it('intersects season and tournament filters, and filters the year by match date', async () => {
    const s = setup();
    s.entries.find.mockResolvedValue([entry(), entry(11, 2)]);
    s.matches.find.mockResolvedValue([
      match(),
      match(2, 10, '2027-01-01T12:00:00'),
    ]);
    const stats = await s.service.statistics(2, {
      seasonId: 1,
      tournamentId: 10,
      year: 2026,
    });
    expect(stats.totals.matches).toBe(1);
    const conditions = s.matches.find.mock.calls[0][0].where;
    expect(conditions[0].tournamentId.value).toEqual([10]);
    expect(conditions[0].homeTeamId).toBe(2);
    expect(conditions[1].awayTeamId).toBe(2);
    expect(
      s.entries.find.mock.calls[0][0].where.tournament.season.competition
        .communityId,
    ).toBe(1);
  });
  it('rejects an explicit community the team does not belong to', async () => {
    const s = setup();
    await expect(
      s.service.overview(2, { communityId: 999 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(s.matches.find).not.toHaveBeenCalled();
  });
  it('hides draft tournaments and scopes the active roster to the selected community', async () => {
    const s = setup();
    s.entries.find.mockResolvedValue([
      entry(),
      entry(11, 1, { tournament: { id: 11, lifecycleStatus: 'draft' } }),
    ]);
    const overview = await s.service.overview(2, {});
    expect(overview.tournaments.map((t) => t.id)).toEqual([10]);
    expect(s.players.find.mock.calls[0][0].where).toEqual({
      teamId: 2,
      communityId: 1,
      isActive: true,
      player: { isActive: true },
    });
  });
  it('loads all published match videos, including those not featured on the home page', async () => {
    const s = setup();
    await s.service.overview(2, {});
    const options = s.videos.find.mock.calls[0][0];
    expect(options.where).toMatchObject({
      communityId: 1,
      status: 'published',
    });
    expect(options.where.matchId.value).toEqual([1]);
    expect(options.where).not.toHaveProperty('showOnHome');
    expect(options).not.toHaveProperty('take');
  });
  it('does not label a group position as a final tournament place', async () => {
    const s = setup();
    s.standings.find.mockResolvedValue([
      { tournamentId: 10, position: 1, groupId: 7 },
    ]);
    const overview = await s.service.overview(2, {});
    expect(overview.tournaments[0].place).toBeNull();
  });
  it('shows recorded final places and does not award trophies before completion', async () => {
    const s = setup();
    s.entries.find.mockResolvedValue([
      entry(10, 1, { ratingResult: 'champion' }),
    ]);
    expect((await s.service.overview(2, {})).tournaments[0].place).toBe(1);
    const pending = entry();
    pending.tournament.status = 'active';
    pending.tournament.lifecycleStatus = 'in_progress';
    s.entries.find.mockResolvedValue([
      { ...pending, ratingResult: 'champion' },
    ]);
    expect((await s.service.overview(2, {})).tournaments[0].place).toBeNull();
  });
  it('provides a historical player card even after the current link is gone', async () => {
    const s = setup();
    const profile = await s.service.player(2, 17, {});
    expect(profile.player.isCurrent).toBe(false);
    expect(profile.totals.goals).toBe(1);
    expect(profile.seasons).toHaveLength(1);
    expect(profile.player).not.toHaveProperty('userId');
    await expect(s.service.player(2, 999, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(s.matches.find).toHaveBeenCalledTimes(2); // one history query per player, no query per season
  });
  it('validates public filters instead of accepting malformed IDs and years', async () => {
    expect(
      await validate(
        plainToInstance(TeamStatisticsQuery, {
          communityId: '1',
          year: '2026',
        }),
      ),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(TeamStatisticsQuery, {
            tournamentId: '-1',
            year: 'abc',
          }),
        )
      ).length,
    ).toBe(2);
  });
});
