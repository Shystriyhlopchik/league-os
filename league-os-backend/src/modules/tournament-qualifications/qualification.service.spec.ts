import type { DataSource, Repository } from 'typeorm';

import { MatchEntity } from '../matches/entities/match.entity';
import { TournamentStageParticipantEntity } from '../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageStatus } from '../tournament-stages/enums/tournament-stage-status.enum';
import { QualificationSnapshotEntryEntity } from './entities/qualification-snapshot-entry.entity';
import { QualificationSnapshotEntity } from './entities/qualification-snapshot.entity';
import { QualificationSnapshotStatus } from './enums/qualification-snapshot-status.enum';
import { QualificationEngine } from './qualification.engine';
import { QualificationService } from './qualification.service';

const entry = (
  tournamentTeamId: number,
  selectionOrder: number,
): QualificationSnapshotEntryEntity =>
  ({ tournamentTeamId, selectionOrder }) as QualificationSnapshotEntryEntity;

describe('QualificationService snapshot diff', () => {
  const service = new QualificationService(
    {} as Repository<QualificationSnapshotEntity>,
    {} as DataSource,
    new QualificationEngine(),
  );

  it('shows changes without mutating the confirmed snapshot composition', () => {
    const confirmed = [entry(1, 1), entry(2, 2), entry(3, 3), entry(5, 4)];
    const recalculated = [entry(1, 1), entry(2, 2), entry(3, 4), entry(8, 3)];

    const diff = service.calculateDiff(confirmed, recalculated);

    expect(diff).toEqual({
      addedTournamentTeamIds: [8],
      removedTournamentTeamIds: [5],
      unchangedTournamentTeamIds: [1, 2, 3],
      moved: [{ tournamentTeamId: 3, previousOrder: 3, nextOrder: 4 }],
    });
    expect(confirmed.map((row) => row.tournamentTeamId)).toEqual([1, 2, 3, 5]);
  });

  it('confirms the exact preview atomically and creates target participants', async () => {
    const snapshot = {
      id: 40,
      tournamentId: 1,
      fromStageId: 10,
      toStageId: 20,
      ruleVersionId: 7,
      sourceHash: 'source-v1',
      status: QualificationSnapshotStatus.PREVIEW,
      isCurrent: false,
      entries: [
        {
          tournamentTeamId: 101,
          selectionOrder: 1,
          qualificationRuleId: 'winner',
        },
      ],
    } as QualificationSnapshotEntity;
    const snapshotFindOne = jest.fn(
      ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve('id' in where ? snapshot : null),
    );
    const snapshotSave = jest.fn((value: QualificationSnapshotEntity) =>
      Promise.resolve(value),
    );
    const snapshotRepository = {
      findOne: snapshotFindOne,
      save: snapshotSave,
    } as unknown as Repository<QualificationSnapshotEntity>;
    const participantSave = jest.fn(
      (value: TournamentStageParticipantEntity[]) => Promise.resolve(value),
    );
    const participantRepository = {
      find: jest.fn(() => Promise.resolve([])),
      create: jest.fn(
        (value: Partial<TournamentStageParticipantEntity>) =>
          value as TournamentStageParticipantEntity,
      ),
      save: participantSave,
      delete: jest.fn(),
    } as unknown as Repository<TournamentStageParticipantEntity>;
    const matchRepository = {
      exists: jest.fn(() => Promise.resolve(false)),
    } as unknown as Repository<MatchEntity>;
    const entryFind = jest.fn(() => Promise.resolve(snapshot.entries));
    const entryRepository = {
      find: entryFind,
    } as unknown as Repository<QualificationSnapshotEntryEntity>;
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === QualificationSnapshotEntity) return snapshotRepository;
        if (entity === QualificationSnapshotEntryEntity) {
          return entryRepository;
        }
        if (entity === TournamentStageParticipantEntity) {
          return participantRepository;
        }
        return matchRepository;
      }),
    };
    const transactionMock = jest.fn(
      (
        _isolation: string,
        callback: (
          value: typeof manager,
        ) => Promise<QualificationSnapshotEntity>,
      ) => callback(manager),
    );
    const dataSource = {
      transaction: transactionMock,
    } as unknown as DataSource;
    const confirmingService = new QualificationService(
      snapshotRepository,
      dataSource,
      new QualificationEngine(),
    );
    Object.defineProperty(confirmingService, 'loadContext', {
      value: jest.fn(() =>
        Promise.resolve({
          sourceHash: 'source-v1',
          toStage: { status: TournamentStageStatus.PENDING },
        }),
      ),
    });

    const confirmed = await confirmingService.confirm(1, 40, {}, 9);

    expect(confirmed.status).toBe(QualificationSnapshotStatus.CONFIRMED);
    expect(confirmed.isCurrent).toBe(true);
    expect(participantSave).toHaveBeenCalledWith([
      expect.objectContaining({
        stageId: 20,
        tournamentTeamId: 101,
        qualificationSource: 'qualification_snapshot:40:winner',
      }),
    ]);
    expect(transactionMock).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    );
    expect(snapshotFindOne.mock.calls[0][0]).not.toHaveProperty('relations');
    expect(entryFind).toHaveBeenCalledWith({
      where: { snapshotId: 40 },
      order: { selectionOrder: 'ASC' },
    });
  });

  it('refuses to confirm a preview after source standings changed', async () => {
    const snapshot = {
      id: 41,
      tournamentId: 1,
      fromStageId: 10,
      toStageId: 20,
      ruleVersionId: 7,
      sourceHash: 'source-v1',
      status: QualificationSnapshotStatus.PREVIEW,
      entries: [],
    } as QualificationSnapshotEntity;
    const snapshotRepository = {
      findOne: jest.fn(() => Promise.resolve(snapshot)),
    } as unknown as Repository<QualificationSnapshotEntity>;
    const entryRepository = {
      find: jest.fn(() => Promise.resolve(snapshot.entries)),
    } as unknown as Repository<QualificationSnapshotEntryEntity>;
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === QualificationSnapshotEntity
          ? snapshotRepository
          : entryRepository,
      ),
    };
    const dataSource = {
      transaction: jest.fn(
        (
          _isolation: string,
          callback: (
            value: typeof manager,
          ) => Promise<QualificationSnapshotEntity>,
        ) => callback(manager),
      ),
    } as unknown as DataSource;
    const staleService = new QualificationService(
      snapshotRepository,
      dataSource,
      new QualificationEngine(),
    );
    Object.defineProperty(staleService, 'loadContext', {
      value: jest.fn(() => Promise.resolve({ sourceHash: 'source-v2' })),
    });

    await expect(staleService.confirm(1, 41, {}, 9)).rejects.toThrow(
      'Source standings changed after preview',
    );
  });
});
