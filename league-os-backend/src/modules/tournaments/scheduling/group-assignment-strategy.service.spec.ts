import { ConflictException } from '@nestjs/common';

import { TournamentGroupEntity } from '../../tournament-groups/entities/tournament-group.entity';
import { TournamentTeamEntity } from '../../tournament-teams/entities/tournament-teams.entity';
import { GroupAssignmentStrategy } from '../enums/group-assignment-strategy.enum';
import { GroupAssignmentStrategyService } from './group-assignment-strategy.service';

describe('GroupAssignmentStrategyService', () => {
  const service = new GroupAssignmentStrategyService();
  const groups = [1, 2, 3].map(
    (id) =>
      ({
        id,
        key: String.fromCharCode(64 + id),
        capacity: 5,
      }) as TournamentGroupEntity,
  );
  const teams = Array.from({ length: 15 }, (_, index) => ({
    id: index + 1,
    teamId: 100 + index,
    seedNumber: index + 1,
  })) as TournamentTeamEntity[];

  it('rejects a manual composition containing the same team twice', () => {
    expect(() =>
      service.plan(
        {
          strategy: GroupAssignmentStrategy.MANUAL,
          assignments: [
            { tournamentTeamId: 1, groupId: 1 },
            { tournamentTeamId: 1, groupId: 2 },
          ],
        },
        groups,
        teams,
        1,
      ),
    ).toThrow(ConflictException);
  });

  it('distributes seeded pots evenly among groups', () => {
    const result = service.plan(
      { strategy: GroupAssignmentStrategy.POTS, randomSeed: 17 },
      groups,
      teams,
      1,
    );

    for (const group of groups) {
      expect(result.filter((item) => item.groupId === group.id)).toHaveLength(
        5,
      );
    }
    for (let offset = 0; offset < 15; offset += 3) {
      const potTeamIds = new Set([offset + 1, offset + 2, offset + 3]);
      const potAssignments = result.filter((item) =>
        potTeamIds.has(item.tournamentTeamId),
      );
      expect(new Set(potAssignments.map((item) => item.groupId)).size).toBe(3);
    }
  });

  it('makes random distribution reproducible with the same seed', () => {
    const dto = {
      strategy: GroupAssignmentStrategy.RANDOM,
      randomSeed: 2026,
    };

    expect(service.plan(dto, groups, teams, 1)).toEqual(
      service.plan(dto, groups, teams, 999),
    );
  });
});
