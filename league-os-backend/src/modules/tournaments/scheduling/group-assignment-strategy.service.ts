import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import type { TournamentGroupEntity } from '../../tournament-groups/entities/tournament-group.entity';
import type { TournamentTeamEntity } from '../../tournament-teams/entities/tournament-teams.entity';
import type { AssignStageGroupsDto } from '../dto/assign-stage-groups.dto';
import { GroupAssignmentStrategy } from '../enums/group-assignment-strategy.enum';

export interface PlannedGroupAssignment {
  tournamentTeamId: number;
  groupId: number;
}

@Injectable()
export class GroupAssignmentStrategyService {
  plan(
    dto: AssignStageGroupsDto,
    groups: TournamentGroupEntity[],
    teams: TournamentTeamEntity[],
    defaultSeed: number,
  ): PlannedGroupAssignment[] {
    if (groups.length === 0) {
      throw new BadRequestException('Stage has no groups');
    }
    if (teams.length === 0) {
      throw new BadRequestException('Tournament has no active teams');
    }

    if (dto.strategy === GroupAssignmentStrategy.MANUAL) {
      return this.planManual(dto, groups, teams);
    }

    this.assertCapacity(groups, teams.length);
    if (dto.strategy === GroupAssignmentStrategy.POTS) {
      const assignments = this.planPots(
        groups,
        teams,
        dto.randomSeed ?? defaultSeed,
      );
      this.assertAssignmentCapacities(groups, assignments);
      return assignments;
    }
    const assignments = this.planRandom(
      groups,
      teams,
      dto.randomSeed ?? defaultSeed,
    );
    this.assertAssignmentCapacities(groups, assignments);
    return assignments;
  }

  private planManual(
    dto: AssignStageGroupsDto,
    groups: TournamentGroupEntity[],
    teams: TournamentTeamEntity[],
  ): PlannedGroupAssignment[] {
    if (!dto.assignments?.length) {
      throw new BadRequestException(
        'Manual strategy requires at least one assignment',
      );
    }
    const groupIds = new Set(groups.map((group) => group.id));
    const teamIds = new Set(teams.map((team) => team.id));
    const assignedTeamIds = new Set<number>();
    const groupCounts = new Map<number, number>();

    for (const assignment of dto.assignments) {
      if (!teamIds.has(assignment.tournamentTeamId)) {
        throw new BadRequestException(
          `Tournament team ${assignment.tournamentTeamId} does not belong to the tournament`,
        );
      }
      if (!groupIds.has(assignment.groupId)) {
        throw new BadRequestException(
          `Group ${assignment.groupId} does not belong to the stage`,
        );
      }
      if (assignedTeamIds.has(assignment.tournamentTeamId)) {
        throw new ConflictException(
          `Tournament team ${assignment.tournamentTeamId} is assigned more than once in the stage`,
        );
      }
      assignedTeamIds.add(assignment.tournamentTeamId);
      groupCounts.set(
        assignment.groupId,
        (groupCounts.get(assignment.groupId) ?? 0) + 1,
      );
    }

    this.assertGroupCounts(groups, groupCounts);
    return dto.assignments.map((assignment) => ({ ...assignment }));
  }

  private planRandom(
    groups: TournamentGroupEntity[],
    teams: TournamentTeamEntity[],
    seed: number,
  ): PlannedGroupAssignment[] {
    const shuffled = this.shuffle([...teams], seed);
    return shuffled.map((team, index) => ({
      tournamentTeamId: team.id,
      groupId: groups[index % groups.length].id,
    }));
  }

  private planPots(
    groups: TournamentGroupEntity[],
    teams: TournamentTeamEntity[],
    seed: number,
  ): PlannedGroupAssignment[] {
    if (teams.some((team) => !Number.isInteger(team.seedNumber))) {
      throw new BadRequestException(
        'Pots strategy requires seedNumber for every tournament team',
      );
    }
    const seeded = [...teams].sort(
      (left, right) =>
        (left.seedNumber as number) - (right.seedNumber as number) ||
        left.id - right.id,
    );
    const assignments: PlannedGroupAssignment[] = [];
    for (let offset = 0; offset < seeded.length; offset += groups.length) {
      const potNumber = Math.floor(offset / groups.length);
      const pot = this.shuffle(
        seeded.slice(offset, offset + groups.length),
        seed + potNumber,
      );
      pot.forEach((team, index) =>
        assignments.push({
          tournamentTeamId: team.id,
          groupId: groups[index].id,
        }),
      );
    }
    return assignments;
  }

  private assertCapacity(
    groups: TournamentGroupEntity[],
    teamCount: number,
  ): void {
    const totalCapacity = groups.reduce(
      (total, group) => total + (group.capacity ?? teamCount),
      0,
    );
    if (totalCapacity < teamCount) {
      throw new ConflictException(
        `Group capacity ${totalCapacity} is smaller than ${teamCount} teams`,
      );
    }
  }

  private assertGroupCounts(
    groups: TournamentGroupEntity[],
    counts: Map<number, number>,
  ): void {
    for (const group of groups) {
      if (group.capacity && (counts.get(group.id) ?? 0) > group.capacity) {
        throw new ConflictException(`Group ${group.key} capacity exceeded`);
      }
    }
  }

  private assertAssignmentCapacities(
    groups: TournamentGroupEntity[],
    assignments: PlannedGroupAssignment[],
  ): void {
    const counts = new Map<number, number>();
    assignments.forEach((assignment) =>
      counts.set(assignment.groupId, (counts.get(assignment.groupId) ?? 0) + 1),
    );
    this.assertGroupCounts(groups, counts);
  }

  private shuffle<T>(items: T[], seed: number): T[] {
    let state = seed >>> 0;
    const random = () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    for (let index = items.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [items[index], items[target]] = [items[target], items[index]];
    }
    return items;
  }
}
