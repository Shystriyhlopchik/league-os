import { BadRequestException, Injectable } from '@nestjs/common';

import type {
  MatchRulesV1,
  PenaltyShootoutRuleV1,
} from '../tournament-rules/types/tournament-rules-config.type';
import { MatchResolutionType } from './enums/match-resolution-type.enum';

export interface MatchScore {
  home: number;
  away: number;
}

export interface PenaltyShootoutScore extends MatchScore {
  homeKicksTaken: number;
  awayKicksTaken: number;
}

export interface ResolveMatchResultInput {
  homeTeamId: number;
  awayTeamId: number;
  regularTime: MatchScore;
  extraTime?: MatchScore;
  penalties?: PenaltyShootoutScore;
  resolutionType?: MatchResolutionType;
  winnerTeamId?: number;
  rules: MatchRulesV1;
}

export interface ResolvedMatchResult {
  regularTime: MatchScore;
  extraTime?: MatchScore;
  penalties?: PenaltyShootoutScore;
  resolutionType: MatchResolutionType;
  winnerTeamId?: number;
  loserTeamId?: number;
  legacyScore: MatchScore;
}

@Injectable()
export class MatchResultResolver {
  resolve(input: ResolveMatchResultInput): ResolvedMatchResult {
    this.assertParticipants(input.homeTeamId, input.awayTeamId);
    this.assertScore(input.regularTime, 'regularTime');

    if (
      input.resolutionType === MatchResolutionType.TECHNICAL ||
      input.resolutionType === MatchResolutionType.WALKOVER
    ) {
      return this.resolveAdministrative(input);
    }

    const regularComparison = this.compare(input.regularTime);
    if (regularComparison !== 0) {
      if (input.extraTime || input.penalties) {
        throw new BadRequestException(
          'Extra time and penalties are impossible when regular time has a winner',
        );
      }
      return this.finishPlayedResult(
        input,
        MatchResolutionType.REGULAR_TIME,
        regularComparison,
      );
    }

    let aggregate = { ...input.regularTime };
    let playedExtraTime = false;
    if (input.rules.extraTime.enabled) {
      if (!input.extraTime) {
        throw new BadRequestException(
          'Extra-time score is required by the stage rules after a regular-time draw',
        );
      }
      this.assertScore(input.extraTime, 'extraTime');
      aggregate = {
        home: aggregate.home + input.extraTime.home,
        away: aggregate.away + input.extraTime.away,
      };
      playedExtraTime = true;
    } else if (input.extraTime) {
      throw new BadRequestException('Extra time is disabled for this stage');
    }

    const aggregateComparison = this.compare(aggregate);
    if (aggregateComparison !== 0) {
      if (input.penalties) {
        throw new BadRequestException(
          'A penalty shootout is impossible when extra time has a winner',
        );
      }
      return this.finishPlayedResult(
        input,
        MatchResolutionType.EXTRA_TIME,
        aggregateComparison,
        aggregate,
      );
    }

    if (input.rules.penalties.enabled) {
      if (!input.penalties) {
        throw new BadRequestException(
          'Penalty shootout result is required by the stage rules',
        );
      }
      this.assertPenaltyShootout(input.penalties, input.rules.penalties);
      const penaltyComparison = this.compare(input.penalties);
      return this.finishPlayedResult(
        input,
        MatchResolutionType.PENALTIES,
        penaltyComparison,
        aggregate,
      );
    }

    if (input.penalties) {
      throw new BadRequestException(
        'Penalty shootout is disabled for this stage',
      );
    }
    if (!input.rules.allowDraw) {
      throw new BadRequestException(
        'A completed match cannot end in a draw under the stage rules',
      );
    }

    const resolutionType = playedExtraTime
      ? MatchResolutionType.EXTRA_TIME
      : MatchResolutionType.REGULAR_TIME;
    this.assertRequestedResolution(input.resolutionType, resolutionType);
    if (input.winnerTeamId !== undefined) {
      throw new BadRequestException('A drawn match cannot have a winner');
    }
    return {
      regularTime: input.regularTime,
      extraTime: input.extraTime,
      resolutionType,
      legacyScore: aggregate,
    };
  }

  private resolveAdministrative(
    input: ResolveMatchResultInput,
  ): ResolvedMatchResult {
    if (input.extraTime || input.penalties) {
      throw new BadRequestException(
        'Administrative results cannot contain extra-time or penalty scores',
      );
    }
    const winnerTeamId = this.assertWinnerParticipant(input);
    return {
      regularTime: input.regularTime,
      resolutionType: input.resolutionType as MatchResolutionType,
      winnerTeamId,
      loserTeamId:
        winnerTeamId === input.homeTeamId ? input.awayTeamId : input.homeTeamId,
      legacyScore: input.regularTime,
    };
  }

  private finishPlayedResult(
    input: ResolveMatchResultInput,
    resolutionType: MatchResolutionType,
    comparison: number,
    legacyScore: MatchScore = input.regularTime,
  ): ResolvedMatchResult {
    this.assertRequestedResolution(input.resolutionType, resolutionType);
    const winnerTeamId = comparison > 0 ? input.homeTeamId : input.awayTeamId;
    if (
      input.winnerTeamId !== undefined &&
      input.winnerTeamId !== winnerTeamId
    ) {
      throw new BadRequestException(
        'winnerTeamId contradicts the recorded match score',
      );
    }
    return {
      regularTime: input.regularTime,
      extraTime: input.extraTime,
      penalties: input.penalties,
      resolutionType,
      winnerTeamId,
      loserTeamId:
        winnerTeamId === input.homeTeamId ? input.awayTeamId : input.homeTeamId,
      legacyScore,
    };
  }

  private assertPenaltyShootout(
    score: PenaltyShootoutScore,
    rules: Extract<PenaltyShootoutRuleV1, { enabled: true }>,
  ): void {
    this.assertScore(score, 'penalties');
    this.assertNonNegativeInteger(score.homeKicksTaken, 'homeKicksTaken');
    this.assertNonNegativeInteger(score.awayKicksTaken, 'awayKicksTaken');
    if (
      score.home > score.homeKicksTaken ||
      score.away > score.awayKicksTaken
    ) {
      throw new BadRequestException(
        'Penalty goals cannot exceed the number of kicks taken',
      );
    }
    if (Math.abs(score.homeKicksTaken - score.awayKicksTaken) > 1) {
      throw new BadRequestException(
        'Penalty shootout kick counts can differ by at most one',
      );
    }
    if (score.home === score.away) {
      throw new BadRequestException(
        'A completed penalty shootout must determine a winner',
      );
    }

    const initial = rules.initialKicksPerTeam;
    const homeClinched =
      score.home > score.away + Math.max(initial - score.awayKicksTaken, 0);
    const awayClinched =
      score.away > score.home + Math.max(initial - score.homeKicksTaken, 0);
    const initialSeriesIncomplete =
      score.homeKicksTaken < initial || score.awayKicksTaken < initial;
    if (initialSeriesIncomplete && !homeClinched && !awayClinched) {
      throw new BadRequestException(
        'The initial penalty series may finish early only after the winner is mathematically determined',
      );
    }

    const suddenDeathStarted =
      score.homeKicksTaken > initial || score.awayKicksTaken > initial;
    if (suddenDeathStarted) {
      if (!rules.suddenDeath) {
        throw new BadRequestException('Sudden-death penalties are disabled');
      }
      if (
        score.homeKicksTaken !== score.awayKicksTaken ||
        Math.abs(score.home - score.away) !== 1
      ) {
        throw new BadRequestException(
          'A completed sudden-death shootout must contain equal kick counts and a one-goal margin',
        );
      }
    }
  }

  private assertRequestedResolution(
    requested: MatchResolutionType | undefined,
    actual: MatchResolutionType,
  ): void {
    if (requested !== undefined && requested !== actual) {
      throw new BadRequestException(
        `resolutionType must be ${actual} for the recorded result`,
      );
    }
  }

  private assertWinnerParticipant(input: ResolveMatchResultInput): number {
    if (
      input.winnerTeamId !== input.homeTeamId &&
      input.winnerTeamId !== input.awayTeamId
    ) {
      throw new BadRequestException(
        'Administrative result requires a participating winnerTeamId',
      );
    }
    return input.winnerTeamId;
  }

  private assertParticipants(homeTeamId: number, awayTeamId: number): void {
    if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) {
      throw new BadRequestException(
        'A match result requires two different resolved participants',
      );
    }
  }

  private assertScore(score: MatchScore, field: string): void {
    this.assertNonNegativeInteger(score.home, `${field}.home`);
    this.assertNonNegativeInteger(score.away, `${field}.away`);
  }

  private assertNonNegativeInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(`${field} must be a non-negative integer`);
    }
  }

  private compare(score: MatchScore): number {
    return Math.sign(score.home - score.away);
  }
}
