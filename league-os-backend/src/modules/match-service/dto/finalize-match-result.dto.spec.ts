import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { MatchResolutionType } from '../../matches/enums/match-resolution-type.enum';
import { FinalizeMatchResultDto } from './finalize-match-result.dto';

describe('FinalizeMatchResultDto', () => {
  it('validates a structured penalty result', async () => {
    const dto = plainToInstance(FinalizeMatchResultDto, {
      regularTime: { home: 1, away: 1 },
      penalties: {
        home: 5,
        away: 4,
        homeKicksTaken: 5,
        awayKicksTaken: 5,
      },
      resolutionType: MatchResolutionType.PENALTIES,
      winnerTeamId: 10,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects negative scores and invalid resolution types', async () => {
    const dto = plainToInstance(FinalizeMatchResultDto, {
      regularTime: { home: -1, away: 0 },
      resolutionType: 'script_expression',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['regularTime', 'resolutionType']),
    );
  });

  it('requires a reason for a technical result', async () => {
    const dto = plainToInstance(FinalizeMatchResultDto, {
      regularTime: { home: 3, away: 0 },
      resolutionType: MatchResolutionType.TECHNICAL,
      winnerTeamId: 10,
      technicalResultReason: '   ',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain(
      'technicalResultReason',
    );
  });

  it('trims and validates a technical result reason', async () => {
    const dto = plainToInstance(FinalizeMatchResultDto, {
      regularTime: { home: 3, away: 0 },
      resolutionType: MatchResolutionType.TECHNICAL,
      winnerTeamId: 10,
      technicalResultReason: '  Команда не явилась на матч  ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.technicalResultReason).toBe('Команда не явилась на матч');
  });
});
