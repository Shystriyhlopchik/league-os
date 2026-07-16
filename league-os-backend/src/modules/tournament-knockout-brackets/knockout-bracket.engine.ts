import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { MatchRoundType } from '../matches/enums/match-round-type.enum';
import type {
  CrossGroupCriterionV1,
  KnockoutParticipantSourceV1,
  PairingConstraintV1,
  SeedingRuleV1,
} from '../tournament-rules/types/tournament-rules-config.type';
import type {
  KnockoutBracketEngineInput,
  KnockoutMatchPlan,
  KnockoutQualifierInput,
} from './types/knockout-bracket.type';

interface SeededPair {
  home: KnockoutQualifierInput;
  away: KnockoutQualifierInput;
  useTeamSource: boolean;
}

@Injectable()
export class KnockoutBracketEngine {
  generate(input: KnockoutBracketEngineInput): KnockoutMatchPlan[] {
    this.assertInput(input);
    const drawRanks = new Map(
      input.seedingInput.drawResults.map((result) => [
        result.tournamentTeamId,
        result.rank,
      ]),
    );
    const pairs = this.seedFirstRound(input, drawRanks);
    return this.buildPlans(
      pairs,
      input.qualificationSnapshotId,
      input.bracket.placementMatch === 'third_place',
    );
  }

  private seedFirstRound(
    input: KnockoutBracketEngineInput,
    drawRanks: Map<number, number>,
  ): SeededPair[] {
    const seeding = input.bracket.seeding;
    if (seeding.type === 'manual') {
      return this.manualPairs(input, seeding);
    }
    if (seeding.type === 'random_draw') {
      if (input.seedingInput.randomSeed === undefined) {
        throw new BadRequestException(
          'randomSeed must be saved before previewing a random bracket',
        );
      }
      const shuffled = this.shuffle(
        input.qualifiers,
        input.seedingInput.randomSeed,
      );
      return this.pairOrdered(shuffled, seeding.constraints ?? [], false).map(
        ([home, away]) => ({ home, away, useTeamSource: false }),
      );
    }
    if (seeding.type === 'standard') {
      const ranked = this.rankQualifiers(
        input.qualifiers,
        seeding.ranking.criteria,
        drawRanks,
      );
      return this.pairOrdered(ranked, seeding.constraints ?? [], true).map(
        ([home, away]) => ({ home, away, useTeamSource: false }),
      );
    }
    return this.bestEligiblePairs(input.qualifiers, seeding, drawRanks);
  }

  private manualPairs(
    input: KnockoutBracketEngineInput,
    seeding: Extract<SeedingRuleV1, { type: 'manual' }>,
  ): SeededPair[] {
    if (input.seedingInput.manualPairs.length !== input.bracket.size / 2) {
      throw new BadRequestException(
        `Manual seeding requires exactly ${input.bracket.size / 2} pairs`,
      );
    }
    const byTournamentTeam = new Map(
      input.qualifiers.map((qualifier) => [
        qualifier.tournamentTeamId,
        qualifier,
      ]),
    );
    const used = new Set<number>();
    return input.seedingInput.manualPairs.map((pair) => {
      const home = byTournamentTeam.get(pair.homeTournamentTeamId);
      const away = byTournamentTeam.get(pair.awayTournamentTeamId);
      if (!home || !away || home === away) {
        throw new BadRequestException(
          'Manual pairs must reference two different qualified teams',
        );
      }
      if (used.has(home.tournamentTeamId) || used.has(away.tournamentTeamId)) {
        throw new BadRequestException(
          'Every qualified team must appear in exactly one manual pair',
        );
      }
      this.assertPairAllowed(home, away, seeding.constraints ?? []);
      used.add(home.tournamentTeamId);
      used.add(away.tournamentTeamId);
      return { home, away, useTeamSource: true };
    });
  }

  private bestEligiblePairs(
    qualifiers: KnockoutQualifierInput[],
    seeding: Extract<SeedingRuleV1, { type: 'best_eligible_opponent' }>,
    drawRanks: Map<number, number>,
  ): SeededPair[] {
    const protectedTeams = qualifiers.filter(
      (qualifier) =>
        qualifier.qualificationRuleId === seeding.protectedQualificationRuleId,
    );
    const rankedCandidates = this.rankQualifiers(
      qualifiers.filter(
        (qualifier) =>
          qualifier.qualificationRuleId ===
          seeding.candidateQualificationRuleId,
      ),
      seeding.candidateRanking.criteria,
      drawRanks,
    );
    if (
      protectedTeams.length === 0 ||
      protectedTeams.length + rankedCandidates.length !== qualifiers.length
    ) {
      throw new ConflictException(
        'Best-eligible seeding rules do not cover all qualified teams',
      );
    }
    const remaining = [...rankedCandidates];
    const pairs: SeededPair[] = [];
    protectedTeams
      .sort((left, right) => left.selectionOrder - right.selectionOrder)
      .forEach((protectedTeam) => {
        const candidateIndex = this.findPartnerIndex(
          protectedTeam,
          remaining,
          seeding.constraints,
        );
        const [candidate] = remaining.splice(candidateIndex, 1);
        pairs.push({
          home: protectedTeam,
          away: candidate,
          useTeamSource: false,
        });
      });
    pairs.push(
      ...this.pairOrdered(remaining, seeding.constraints, false).map(
        ([home, away]) => ({ home, away, useTeamSource: false }),
      ),
    );
    return pairs;
  }

  private rankQualifiers(
    qualifiers: KnockoutQualifierInput[],
    criteria: CrossGroupCriterionV1[],
    drawRanks: Map<number, number>,
  ): KnockoutQualifierInput[] {
    const statisticalCriteria = criteria.filter(
      (criterion) => criterion !== 'draw_lots',
    );
    const sorted = [...qualifiers].sort((left, right) => {
      const comparison = this.compare(left, right, statisticalCriteria);
      return comparison || left.tournamentTeamId - right.tournamentTeamId;
    });
    const partitions: KnockoutQualifierInput[][] = [];
    sorted.forEach((qualifier) => {
      const current = partitions[partitions.length - 1];
      if (
        !current ||
        this.compare(current[0], qualifier, statisticalCriteria) !== 0
      ) {
        partitions.push([qualifier]);
      } else {
        current.push(qualifier);
      }
    });
    partitions.forEach((partition) => {
      if (partition.length <= 1 || !criteria.includes('draw_lots')) return;
      const ranks = partition.map((qualifier) =>
        drawRanks.get(qualifier.tournamentTeamId),
      );
      if (
        ranks.some((rank) => rank === undefined) ||
        new Set(ranks).size !== partition.length
      ) {
        throw new ConflictException({
          code: 'KNOCKOUT_SEEDING_DRAW_REQUIRED',
          message: 'A saved draw result is required to seed tied teams',
          tournamentTeamIds: partition.map(
            (qualifier) => qualifier.tournamentTeamId,
          ),
        });
      }
      partition.sort(
        (left, right) =>
          (drawRanks.get(left.tournamentTeamId) as number) -
            (drawRanks.get(right.tournamentTeamId) as number) ||
          left.tournamentTeamId - right.tournamentTeamId,
      );
    });
    return partitions.flat();
  }

  private compare(
    left: KnockoutQualifierInput,
    right: KnockoutQualifierInput,
    criteria: CrossGroupCriterionV1[],
  ): number {
    for (const criterion of criteria) {
      const leftValue = this.criterionValue(left, criterion);
      const rightValue = this.criterionValue(right, criterion);
      const ascending =
        criterion === 'goals_against_asc' ||
        criterion === 'disciplinary_score_asc';
      const difference = ascending
        ? leftValue - rightValue
        : rightValue - leftValue;
      if (difference !== 0) return difference;
    }
    return 0;
  }

  private criterionValue(
    qualifier: KnockoutQualifierInput,
    criterion: CrossGroupCriterionV1,
  ): number {
    return qualifier.comparisonSnapshot[criterion] ?? 0;
  }

  private pairOrdered(
    ordered: KnockoutQualifierInput[],
    constraints: PairingConstraintV1[],
    reversePartnerOrder: boolean,
  ): Array<[KnockoutQualifierInput, KnockoutQualifierInput]> {
    if (ordered.length % 2 !== 0) {
      throw new ConflictException(
        'Knockout seeding requires an even team count',
      );
    }
    const remaining = [...ordered];
    const pairs: Array<[KnockoutQualifierInput, KnockoutQualifierInput]> = [];
    while (remaining.length > 0) {
      const home = remaining.shift() as KnockoutQualifierInput;
      const candidates = reversePartnerOrder
        ? [...remaining].reverse()
        : remaining;
      const candidateIndex = this.findPartnerIndex(
        home,
        candidates,
        constraints,
      );
      const away = candidates[candidateIndex];
      remaining.splice(remaining.indexOf(away), 1);
      pairs.push([home, away]);
    }
    return pairs;
  }

  private findPartnerIndex(
    home: KnockoutQualifierInput,
    candidates: KnockoutQualifierInput[],
    constraints: PairingConstraintV1[],
  ): number {
    if (candidates.length === 0) {
      throw new ConflictException('No knockout opponent is available');
    }
    const avoidSameGroup = constraints.find(
      (constraint) => constraint.type === 'avoid_same_source_group',
    );
    if (!avoidSameGroup) return 0;
    const eligible = candidates.findIndex(
      (candidate) =>
        home.sourceGroupId === undefined ||
        candidate.sourceGroupId === undefined ||
        home.sourceGroupId !== candidate.sourceGroupId,
    );
    if (eligible >= 0) return eligible;
    if (avoidSameGroup.mode === 'required') {
      throw new ConflictException(
        'avoid_same_source_group cannot be satisfied',
      );
    }
    return 0;
  }

  private assertPairAllowed(
    home: KnockoutQualifierInput,
    away: KnockoutQualifierInput,
    constraints: PairingConstraintV1[],
  ): void {
    const required = constraints.some(
      (constraint) =>
        constraint.type === 'avoid_same_source_group' &&
        constraint.mode === 'required',
    );
    if (
      required &&
      home.sourceGroupId !== undefined &&
      home.sourceGroupId === away.sourceGroupId
    ) {
      throw new ConflictException(
        'Manual pair violates avoid_same_source_group',
      );
    }
  }

  private shuffle(
    qualifiers: KnockoutQualifierInput[],
    seed: number,
  ): KnockoutQualifierInput[] {
    const result = [...qualifiers];
    let state = seed >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  private buildPlans(
    pairs: SeededPair[],
    qualificationSnapshotId: number,
    thirdPlace: boolean,
  ): KnockoutMatchPlan[] {
    const plans: KnockoutMatchPlan[] = [];
    let roundType = this.roundTypeForEntrants(pairs.length * 2);
    let roundNumber = 1;
    let previousPositions: string[] = [];
    pairs.forEach((pair, index) => {
      const bracketPosition = this.position(roundType, index + 1);
      previousPositions.push(bracketPosition);
      plans.push({
        order: plans.length + 1,
        bracketPosition,
        roundType,
        roundNumber,
        homeSource: this.qualifierSource(
          pair.home,
          qualificationSnapshotId,
          pair.useTeamSource,
        ),
        awaySource: this.qualifierSource(
          pair.away,
          qualificationSnapshotId,
          pair.useTeamSource,
        ),
        resolvedHomeTeamId: pair.home.teamId,
        resolvedAwayTeamId: pair.away.teamId,
      });
    });

    while (previousPositions.length > 1) {
      const previousRoundType = roundType;
      roundNumber += 1;
      roundType = this.roundTypeForEntrants(previousPositions.length);
      const nextPositions: string[] = [];
      for (let index = 0; index < previousPositions.length; index += 2) {
        const bracketPosition = this.position(roundType, index / 2 + 1);
        if (
          roundType === MatchRoundType.FINAL &&
          previousRoundType === MatchRoundType.SEMI_FINAL &&
          thirdPlace
        ) {
          plans.push({
            order: plans.length + 1,
            bracketPosition: 'THIRD_PLACE',
            roundType: MatchRoundType.THIRD_PLACE,
            roundNumber,
            homeSource: this.outcomeSource(previousPositions[index], 'loser'),
            awaySource: this.outcomeSource(
              previousPositions[index + 1],
              'loser',
            ),
          });
        }
        plans.push({
          order: plans.length + 1,
          bracketPosition,
          roundType,
          roundNumber,
          homeSource: this.outcomeSource(previousPositions[index], 'winner'),
          awaySource: this.outcomeSource(
            previousPositions[index + 1],
            'winner',
          ),
        });
        nextPositions.push(bracketPosition);
      }
      previousPositions = nextPositions;
    }
    return plans;
  }

  private qualifierSource(
    qualifier: KnockoutQualifierInput,
    qualificationSnapshotId: number,
    asTeam: boolean,
  ): KnockoutParticipantSourceV1 {
    if (asTeam) {
      return {
        type: 'team',
        tournamentTeamId: qualifier.tournamentTeamId,
        teamId: qualifier.teamId,
      };
    }
    return {
      type: 'qualification_position',
      qualificationSnapshotId,
      qualificationEntryId: qualifier.qualificationEntryId,
      selectionOrder: qualifier.selectionOrder,
      tournamentTeamId: qualifier.tournamentTeamId,
      teamId: qualifier.teamId,
    };
  }

  private outcomeSource(
    bracketPosition: string,
    outcome: 'winner' | 'loser',
  ): KnockoutParticipantSourceV1 {
    return { type: 'match_outcome', bracketPosition, outcome };
  }

  private roundTypeForEntrants(entrants: number): MatchRoundType {
    if (entrants === 32) return MatchRoundType.ROUND_OF_32;
    if (entrants === 16) return MatchRoundType.ROUND_OF_16;
    if (entrants === 8) return MatchRoundType.QUARTER_FINAL;
    if (entrants === 4) return MatchRoundType.SEMI_FINAL;
    return MatchRoundType.FINAL;
  }

  private position(roundType: MatchRoundType, number: number): string {
    if (roundType === MatchRoundType.ROUND_OF_32) return `R32-${number}`;
    if (roundType === MatchRoundType.ROUND_OF_16) return `R16-${number}`;
    if (roundType === MatchRoundType.QUARTER_FINAL) return `QF-${number}`;
    if (roundType === MatchRoundType.SEMI_FINAL) return `SF-${number}`;
    return 'FINAL';
  }

  private assertInput(input: KnockoutBracketEngineInput): void {
    if (input.qualifiers.length !== input.bracket.size) {
      throw new ConflictException(
        `Bracket requires ${input.bracket.size} confirmed qualifiers`,
      );
    }
    const ids = input.qualifiers.map((qualifier) => qualifier.tournamentTeamId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Qualified teams must be unique');
    }
    const drawRanks = input.seedingInput.drawResults.map(
      (result) => result.rank,
    );
    const drawTeams = input.seedingInput.drawResults.map(
      (result) => result.tournamentTeamId,
    );
    if (
      new Set(drawRanks).size !== drawRanks.length ||
      new Set(drawTeams).size !== drawTeams.length
    ) {
      throw new BadRequestException(
        'Seeding draw teams and ranks must be unique',
      );
    }
  }
}
