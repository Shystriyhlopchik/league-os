import type { Repository } from 'typeorm';

import { MatchEventType } from '../match-events/enums/match-event-type.enum';
import type { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import type { MatchRosterEntity } from '../match-rosters/entities/match-roster.entity';
import { MatchStatus } from './enums/match-status.enum';
import type { MatchEntity } from './entities/match.entity';
import { MatchesService } from './matches.service';

describe('MatchesService', () => {
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
