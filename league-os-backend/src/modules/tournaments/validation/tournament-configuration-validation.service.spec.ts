import type { Repository } from 'typeorm';

import { TournamentGroupEntity } from '../../tournament-groups/entities/tournament-group.entity';
import { TournamentStageParticipantEntity } from '../../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentStageType } from '../../tournament-stages/enums/tournament-stage-type.enum';
import { TournamentTeamEntity } from '../../tournament-teams/entities/tournament-teams.entity';
import { TournamentEntity } from '../entities/tournaments.entity';
import { TournamentConfigurationValidationService } from './tournament-configuration-validation.service';
import { TournamentRulesConfigValidator } from './tournament-rules-config.validator';
import { createYardLeagueRules } from './yard-league-rules.fixture';

const queryBuilder = <T>(items: T[]) => ({
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(items),
});

describe('TournamentConfigurationValidationService', () => {
  const groups = [1, 2, 3].map(
    (id) =>
      ({
        id,
        stageId: 1,
        key: String.fromCharCode(64 + id),
      }) as TournamentGroupEntity,
  );
  const participants = Array.from({ length: 15 }, (_, index) => ({
    id: index + 1,
    stageId: 1,
    groupId: groups[Math.floor(index / 5)].id,
  })) as TournamentStageParticipantEntity[];
  const stageValues = [
    {
      id: 1,
      tournamentId: 10,
      key: 'groups',
      order: 1,
      type: TournamentStageType.GROUP_STAGE,
    },
    {
      id: 2,
      tournamentId: 10,
      key: 'playoff',
      order: 2,
      type: TournamentStageType.KNOCKOUT,
    },
  ] as TournamentStageEntity[];
  const tournaments = {
    findOne: jest.fn(),
  } as unknown as Repository<TournamentEntity>;
  const stages = {
    find: jest.fn(),
  } as unknown as Repository<TournamentStageEntity>;
  const groupRepository = {
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<TournamentGroupEntity>;
  const participantRepository = {
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<TournamentStageParticipantEntity>;
  const teams = {
    count: jest.fn(),
  } as unknown as Repository<TournamentTeamEntity>;
  const service = new TournamentConfigurationValidationService(
    new TournamentRulesConfigValidator(),
    tournaments,
    stages,
    groupRepository,
    participantRepository,
    teams,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(tournaments.findOne)
      .mockResolvedValue({ id: 10 } as TournamentEntity);
    jest.mocked(stages.find).mockResolvedValue(stageValues);
    jest
      .mocked(groupRepository.createQueryBuilder)
      .mockReturnValue(queryBuilder(groups) as never);
    jest
      .mocked(participantRepository.createQueryBuilder)
      .mockReturnValue(queryBuilder(participants) as never);
    jest.mocked(teams.count).mockResolvedValue(15);
  });

  it('accepts three groups with five registered teams each', async () => {
    await expect(
      service.validate(10, createYardLeagueRules()),
    ).resolves.toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('reports group and initial participant count mismatches', async () => {
    jest.mocked(teams.count).mockResolvedValue(14);
    jest
      .mocked(groupRepository.createQueryBuilder)
      .mockReturnValue(queryBuilder(groups.slice(0, 2)) as never);

    const result = await service.validate(10, createYardLeagueRules());

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INITIAL_PARTICIPANT_COUNT_MISMATCH' }),
        expect.objectContaining({ code: 'GROUP_COUNT_MISMATCH' }),
      ]),
    );
  });
});
