import { validate } from 'class-validator';

import { CreateMatchDto } from '../../matches/dto/create-match.dto';
import { MatchRoundType } from '../../matches/enums/match-round-type.enum';
import { CreateTournamentGroupDto } from '../../tournament-groups/dto/create-tournament-group.dto';
import { CreateTournamentMemberDto } from '../../tournament-members/dto/create-tournament-member.dto';
import { TournamentMemberRole } from '../../tournament-members/enums/tournament-member-role.enum';
import { CreateTournamentRuleVersionDto } from '../../tournament-rules/dto/create-tournament-rule-version.dto';
import { CreateTournamentStageParticipantDto } from '../../tournament-stage-participants/dto/create-tournament-stage-participant.dto';
import { CreateTournamentStageDto } from '../../tournament-stages/dto/create-tournament-stage.dto';
import { TournamentStageType } from '../../tournament-stages/enums/tournament-stage-type.enum';
import { TournamentLifecycleStatus } from '../enums/tournament-lifecycle-status.enum';
import { CreateTournamentDto } from './create-tournament.dto';

describe('Tournament builder DTO validation', () => {
  it('accepts a valid stage and rejects an invalid type and order', async () => {
    const valid = Object.assign(new CreateTournamentStageDto(), {
      tournamentId: 1,
      key: 'group-stage',
      name: 'Group stage',
      type: TournamentStageType.GROUP_STAGE,
      order: 1,
      configuration: { schemaVersion: 1, type: 'group_stage' },
    });
    const invalid = Object.assign(new CreateTournamentStageDto(), {
      tournamentId: 1,
      key: 'group-stage',
      name: 'Group stage',
      type: 'unsupported',
      order: 0,
      configuration: 'not-an-object',
    });

    expect(await validate(valid)).toHaveLength(0);
    expect((await validate(invalid)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['type', 'order', 'configuration']),
    );
  });

  it('enforces group capacity and organizer role values', async () => {
    const group = Object.assign(new CreateTournamentGroupDto(), {
      stageId: 1,
      key: 'A',
      name: 'Group A',
      order: 1,
      capacity: 1,
    });
    const member = Object.assign(new CreateTournamentMemberDto(), {
      tournamentId: 1,
      userId: 2,
      role: 'administrator',
    });
    const organizer = Object.assign(new CreateTournamentMemberDto(), {
      tournamentId: 1,
      userId: 2,
      role: TournamentMemberRole.ORGANIZER,
    });

    expect((await validate(group)).map((error) => error.property)).toContain(
      'capacity',
    );
    expect((await validate(member)).map((error) => error.property)).toContain(
      'role',
    );
    expect(await validate(organizer)).toHaveLength(0);
  });

  it('requires positive rule and schema versions with an object config', async () => {
    const dto = Object.assign(new CreateTournamentRuleVersionDto(), {
      tournamentId: 1,
      version: 0,
      schemaVersion: 0,
      config: 'script()',
    });

    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['version', 'schemaVersion', 'config']),
    );
  });

  it('validates stage participant seed and structured match round', async () => {
    const participant = Object.assign(
      new CreateTournamentStageParticipantDto(),
      {
        stageId: 1,
        tournamentTeamId: 2,
        seedNumber: 0,
      },
    );
    const validMatch = Object.assign(new CreateMatchDto(), {
      tournamentId: 1,
      homeTeamId: 1,
      awayTeamId: 2,
      stageId: 3,
      groupId: 4,
      roundType: MatchRoundType.GROUP_ROUND,
      roundNumber: 1,
    });
    const invalidMatch = Object.assign(new CreateMatchDto(), {
      tournamentId: 1,
      homeTeamId: 1,
      awayTeamId: 2,
      roundType: 'semi',
      roundNumber: 0,
    });

    expect(
      (await validate(participant)).map((error) => error.property),
    ).toContain('seedNumber');
    expect(await validate(validMatch)).toHaveLength(0);
    expect(
      (await validate(invalidMatch)).map((error) => error.property),
    ).toEqual(expect.arrayContaining(['roundType', 'roundNumber']));
  });

  it('accepts the new lifecycle fields on tournament creation', async () => {
    const valid = Object.assign(new CreateTournamentDto(), {
      seasonId: 1,
      name: 'Yard League',
      slug: 'yard-league',
      ownerUserId: 7,
      lifecycleStatus: TournamentLifecycleStatus.DRAFT,
    });
    const invalid = Object.assign(new CreateTournamentDto(), {
      seasonId: 1,
      name: 'Yard League',
      slug: 'yard-league',
      ownerUserId: 'owner',
      lifecycleStatus: 'planned',
    });

    expect(await validate(valid)).toHaveLength(0);
    expect((await validate(invalid)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['ownerUserId', 'lifecycleStatus']),
    );
  });
});
