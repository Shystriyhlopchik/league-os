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
