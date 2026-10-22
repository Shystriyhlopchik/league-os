import { BadRequestException } from '@nestjs/common';

import type { MatchRulesV1 } from '../tournament-rules/types/tournament-rules-config.type';
import { MatchResolutionType } from './enums/match-resolution-type.enum';
import { MatchResultResolver } from './match-result.resolver';

const playoffRules: MatchRulesV1 = {
  periods: 2,
  periodDurationMinutes: 20,
  allowDraw: false,
  extraTime: { enabled: false },
  penalties: {
    enabled: true,
    initialKicksPerTeam: 5,
    suddenDeath: true,
  },
};

describe('MatchResultResolver', () => {
  const resolver = new MatchResultResolver();

  const leg = (
    regularTime: { home: number; away: number },
    previousScore?: { home: number; away: number },
  ) => ({
    homeTeamId: 10,
    awayTeamId: 20,
    regularTime,
    rules: playoffRules,
    tie: { leg: previousScore ? (2 as const) : (1 as const), previousScore },
  });

  it('allows a drawn first leg without extra time or penalties', () => {
    const result = resolver.resolve({
      ...leg({ home: 1, away: 1 }),
      rules: {
        ...playoffRules,
        extraTime: { enabled: true, periods: 2, periodDurationMinutes: 5 },
      },
    });
    expect(result.winnerTeamId).toBeUndefined();
    expect(result.legacyScore).toEqual({ home: 1, away: 1 });
  });

  it('rejects penalties in a first leg', () => {
    expect(() =>
      resolver.resolve({
        ...leg({ home: 0, away: 0 }),
        penalties: { home: 5, away: 4, homeKicksTaken: 5, awayKicksTaken: 5 },
      }),
    ).toThrow(BadRequestException);
  });

  it('allows a drawn return fixture if the aggregate has a winner', () => {
    const result = resolver.resolve(
      leg({ home: 1, away: 1 }, { home: 0, away: 2 }),
    );
    expect(result.tieWinnerTeamId).toBe(20);
    expect(result.winnerTeamId).toBeUndefined();
    expect(result.legacyScore).toEqual({ home: 1, away: 1 });
  });

  it('separates the winner of a return match from the winner on aggregate', () => {
    const result = resolver.resolve(
      leg({ home: 2, away: 0 }, { home: 0, away: 3 }),
    );
    expect(result.winnerTeamId).toBe(10);
    expect(result.tieWinnerTeamId).toBe(20);
    expect(result.legacyScore).toEqual({ home: 2, away: 0 });
  });

  it('requires penalties after an aggregate draw even when the return score is not tied', () => {
    expect(() =>
      resolver.resolve(leg({ home: 2, away: 0 }, { home: 0, away: 2 })),
    ).toThrow(BadRequestException);
    const result = resolver.resolve({
      ...leg({ home: 2, away: 0 }, { home: 0, away: 2 }),
      penalties: { home: 4, away: 5, homeKicksTaken: 5, awayKicksTaken: 5 },
    });
    expect(result.tieWinnerTeamId).toBe(20);
    expect(result.winnerTeamId).toBe(10);
    expect(result.legacyScore).toEqual({ home: 2, away: 0 });
    expect(result.regularTime).toEqual({ home: 2, away: 0 });
  });

  it('does not use away goals and rejects unnecessary penalties', () => {
    expect(() =>
      resolver.resolve(leg({ home: 1, away: 1 }, { home: 2, away: 2 })),
    ).toThrow(BadRequestException);
    expect(() =>
      resolver.resolve({
        ...leg({ home: 1, away: 1 }, { home: 2, away: 0 }),
        penalties: { home: 5, away: 4, homeKicksTaken: 5, awayKicksTaken: 5 },
      }),
    ).toThrow(BadRequestException);
  });

  it('applies extra time only to an aggregate draw and stores only this fixture goals', () => {
    const result = resolver.resolve({
      ...leg({ home: 2, away: 0 }, { home: 0, away: 2 }),
      rules: {
        ...playoffRules,
        extraTime: { enabled: true, periods: 2, periodDurationMinutes: 5 },
      },
      extraTime: { home: 0, away: 1 },
    });
    expect(result.tieWinnerTeamId).toBe(20);
    expect(result.winnerTeamId).toBe(10);
    expect(result.legacyScore).toEqual({ home: 2, away: 1 });
  });

  it('rejects a return result without an official first-leg score', () => {
    expect(() =>
      resolver.resolve({ ...leg({ home: 0, away: 0 }), tie: { leg: 2 } }),
    ).toThrow(BadRequestException);
  });

  it('accepts an early finish when the initial penalty series is clinched', () => {
    const result = resolver.resolve({
      homeTeamId: 10,
      awayTeamId: 20,
      regularTime: { home: 1, away: 1 },
      penalties: {
        home: 3,
        away: 0,
        homeKicksTaken: 3,
        awayKicksTaken: 3,
      },
      rules: playoffRules,
    });

    expect(result).toEqual(
      expect.objectContaining({
        resolutionType: MatchResolutionType.PENALTIES,
        winnerTeamId: 10,
        loserTeamId: 20,
        legacyScore: { home: 1, away: 1 },
      }),
    );
  });

  it('rejects a shootout that is tied after five kicks per team', () => {
    expect(() =>
      resolver.resolve({
        homeTeamId: 10,
        awayTeamId: 20,
        regularTime: { home: 0, away: 0 },
        penalties: {
          home: 4,
          away: 4,
          homeKicksTaken: 5,
          awayKicksTaken: 5,
        },
        rules: playoffRules,
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts sudden death after the teams were level through five kicks', () => {
    const result = resolver.resolve({
      homeTeamId: 10,
      awayTeamId: 20,
      regularTime: { home: 0, away: 0 },
      penalties: {
        home: 5,
        away: 4,
        homeKicksTaken: 6,
        awayKicksTaken: 6,
      },
      rules: playoffRules,
    });

    expect(result.resolutionType).toBe(MatchResolutionType.PENALTIES);
    expect(result.winnerTeamId).toBe(10);
  });

  it('rejects an officially completed playoff draw without penalties', () => {
    expect(() =>
      resolver.resolve({
        homeTeamId: 10,
        awayTeamId: 20,
        regularTime: { home: 2, away: 2 },
        rules: playoffRules,
      }),
    ).toThrow('Penalty shootout result is required');
  });

  it('keeps penalty goals outside the legacy football score', () => {
    const result = resolver.resolve({
      homeTeamId: 10,
      awayTeamId: 20,
      regularTime: { home: 2, away: 2 },
      penalties: {
        home: 5,
        away: 4,
        homeKicksTaken: 5,
        awayKicksTaken: 5,
      },
      rules: playoffRules,
    });

    expect(result.legacyScore).toEqual({ home: 2, away: 2 });
    expect(result.penalties).toEqual(
      expect.objectContaining({ home: 5, away: 4 }),
    );
  });

  it('resolves a winner after configured extra time', () => {
    const result = resolver.resolve({
      homeTeamId: 10,
      awayTeamId: 20,
      regularTime: { home: 1, away: 1 },
      extraTime: { home: 0, away: 1 },
      rules: {
        ...playoffRules,
        extraTime: { enabled: true, periods: 2, periodDurationMinutes: 5 },
        penalties: { enabled: false },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        resolutionType: MatchResolutionType.EXTRA_TIME,
        winnerTeamId: 20,
        legacyScore: { home: 1, away: 2 },
      }),
    );
  });

  it('accepts an administrative result only with an explicit participant winner', () => {
    const result = resolver.resolve({
      homeTeamId: 10,
      awayTeamId: 20,
      regularTime: { home: 0, away: 3 },
      resolutionType: MatchResolutionType.TECHNICAL,
      winnerTeamId: 20,
      rules: playoffRules,
    });

    expect(result.resolutionType).toBe(MatchResolutionType.TECHNICAL);
    expect(result.winnerTeamId).toBe(20);
  });
});
