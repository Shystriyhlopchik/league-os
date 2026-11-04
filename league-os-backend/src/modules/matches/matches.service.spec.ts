import { In, IsNull, Not, type Repository } from 'typeorm';

import { MatchEventType } from '../match-events/enums/match-event-type.enum';
import type { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import type { MatchRosterEntity } from '../match-rosters/entities/match-roster.entity';
import { MatchStatus } from './enums/match-status.enum';
import type { MatchEntity } from './entities/match.entity';
import { MatchesService } from './matches.service';
import { TournamentLifecycleStatus } from '../tournaments/enums/tournament-lifecycle-status.enum';
import { TournamentStatus } from '../tournaments/enums/tournament-status.enum';

describe('MatchesService', () => {
  describe('active community slider', () => {
    const createService = (matches: MatchEntity[] = []) => {
      const repository = { find: jest.fn().mockResolvedValue(matches) };
      const service = new MatchesService(
        repository as never,
        {} as never,
        {} as never,
      );
      return { service, repository };
    };
    const match = (
      id: number,
      tournamentId: number,
      seasonId: number,
      status: MatchStatus,
    ) =>
      ({
        id,
        tournamentId,
        status,
        round: '1',
        matchDatetime: new Date('2026-11-08T10:00:00Z'),
        homeTeam: { id: 10, name: 'Home' },
        awayTeam: { id: 20, name: 'Away' },
        homeScore: 1,
        awayScore: 0,
        venue: null,
        tournament: {
          id: tournamentId,
          name: `Tournament ${tournamentId}`,
          lifecycleStatus: TournamentLifecycleStatus.IN_PROGRESS,
          season: {
            id: seasonId,
            name: `Season ${seasonId}`,
            year: 2026,
            competition: {
              id: 3,
              name: 'League',
              slug: 'league',
              communityId: 1,
            },
          },
        },
      }) as MatchEntity;

    it('restricts the default feed to current tournaments of the active default community', async () => {
      const { service, repository } = createService();
      await expect(service.findActiveCommunityMatches()).resolves.toEqual([]);
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: Not(MatchStatus.CANCELLED),
            homeTeamId: Not(IsNull()),
            awayTeamId: Not(IsNull()),
            matchDatetime: Not(IsNull()),
            tournament: {
              isActive: true,
              lifecycleStatus: In([
                TournamentLifecycleStatus.PUBLISHED,
                TournamentLifecycleStatus.IN_PROGRESS,
              ]),
              status: Not(
                In([TournamentStatus.FINISHED, TournamentStatus.CANCELLED]),
              ),
              season: {
                isActive: true,
                competition: {
                  isActive: true,
                  community: { isActive: true, isDefault: true },
                },
              },
            },
          },
          order: { matchDatetime: 'ASC', id: 'ASC' },
        }),
      );
    });

    it('uses the explicitly selected community without falling back to the default one', async () => {
      const { service, repository } = createService();
      await service.findActiveCommunityMatches(7);
      expect(
        repository.find.mock.calls[0][0].where.tournament.season.competition
          .community,
      ).toEqual({ id: 7, isActive: true });
    });

    it('returns played, live and upcoming matches from multiple current tournaments and seasons', async () => {
      const { service } = createService([
        match(1, 2, 4, MatchStatus.FINISHED),
        match(2, 3, 5, MatchStatus.LIVE),
        match(3, 3, 5, MatchStatus.SCHEDULED),
      ]);
      const result = await service.findActiveCommunityMatches();
      expect(result.map((m) => [m.id, m.tournamentId, m.status])).toEqual([
        [1, 2, MatchStatus.FINISHED],
        [2, 3, MatchStatus.LIVE],
        [3, 3, MatchStatus.SCHEDULED],
      ]);
      expect(result.map((m) => m.tournament.season.id)).toEqual([4, 5, 5]);
    });

    it('does not publish cancelled matches or unresolved calendar slots', async () => {
      const valid = match(1, 2, 4, MatchStatus.SCHEDULED);
      const { service } = createService([
        valid,
        { ...valid, id: 2, status: MatchStatus.CANCELLED },
        { ...valid, id: 3, homeTeam: null } as never,
        { ...valid, id: 4, matchDatetime: null } as never,
      ]);
      expect(
        (await service.findActiveCommunityMatches()).map((m) => m.id),
      ).toEqual([1]);
    });

    it('retains completed tournaments in the separate season/archive endpoint', async () => {
      const archived = match(1, 2, 4, MatchStatus.FINISHED);
      archived.tournament.lifecycleStatus = TournamentLifecycleStatus.COMPLETED;
      const { service, repository } = createService([archived]);
      expect((await service.findBySeason(4)).map((m) => m.id)).toEqual([1]);
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tournament: { seasonId: 4 } } }),
      );
    });

    it.each([0, -1, 1.5])(
      'rejects invalid community id %s instead of broadening the query',
      async (communityId) => {
        const { service, repository } = createService();
        await expect(
          service.findActiveCommunityMatches(communityId),
        ).rejects.toThrow('Укажите корректный ID сообщества');
        expect(repository.find).not.toHaveBeenCalled();
      },
    );
  });

  describe('findProtocol', () => {
    it('does not return cancelled events', async () => {
      const team = {
        id: 10,
        name: 'Team',
        shortName: 'TM',
        logoUrl: null,
      };
      const match = {
        id: 1,
        status: MatchStatus.FINISHED,
        round: '1',
        homeTeamId: 10,
        awayTeamId: 20,
        homeScore: 1,
        awayScore: 0,
        homeTeam: team,
        awayTeam: { ...team, id: 20 },
        tournament: {
          id: 30,
          name: 'Tournament',
          logoUrl: null,
          season: {
            id: 40,
            name: 'Season',
            year: 2026,
            competition: {
              id: 50,
              name: 'Competition',
              logoUrl: null,
            },
          },
        },
        venue: null,
        officials: [],
        events: [
          {
            id: 100,
            eventType: MatchEventType.GOAL,
            minute: 5,
            team,
            isCancelled: false,
          },
          {
            id: 200,
            eventType: MatchEventType.YELLOW_CARD,
            minute: 10,
            team,
            isCancelled: true,
          },
        ],
      } as unknown as MatchEntity;

      const matchesRepository = {
        findOne: jest.fn().mockResolvedValue(match),
      } as unknown as Repository<MatchEntity>;
      const matchRosterRepository = {
        find: jest.fn().mockResolvedValue([]),
      } as unknown as Repository<MatchRosterEntity>;
      const matchRosterPlayerRepository =
        {} as Repository<MatchRosterPlayerEntity>;
      const service = new MatchesService(
        matchesRepository,
        matchRosterRepository,
        matchRosterPlayerRepository,
      );

      const protocol = await service.findProtocol(match.id);

      expect(protocol.events).toHaveLength(1);
      expect(protocol.events[0].id).toBe(100);
    });
  });
});
