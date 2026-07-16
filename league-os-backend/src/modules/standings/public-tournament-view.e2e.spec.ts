import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { FeatureFlagGuard } from '../../common/feature-flags/feature-flag.guard';
import { FeatureFlagsService } from '../../common/feature-flags/feature-flags.service';
import { StandingsController } from './standings.controller';
import { StandingsService } from './standings.service';

describe('public tournament view HTTP scenarios', () => {
  let app: INestApplication;
  const flags = {
    isEnabled: jest.fn(() => true),
  };
  const legacyRows = [
    {
      position: 1,
      team: { id: 1, name: 'Legacy A' },
      played: 2,
      wins: 2,
      draws: 0,
      losses: 0,
      goalsFor: 5,
      goalsAgainst: 1,
      goalDifference: 4,
      points: 6,
      disciplinaryScore: 0,
    },
  ];
  const service = {
    getLegacyTournamentStandings: jest.fn(async () => legacyRows),
    getPublicTournamentView: jest.fn(async (tournamentId: number) =>
      tournamentId === 1 ? legacyPublicView() : yardLeaguePublicView(),
    ),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StandingsController],
      providers: [
        FeatureFlagGuard,
        { provide: FeatureFlagsService, useValue: flags },
        { provide: StandingsService, useValue: service },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => {
    flags.isEnabled.mockReturnValue(true);
  });

  it('keeps the existing league legacy API and exposes an equivalent stage', async () => {
    const legacy = await request(app.getHttpServer())
      .get('/standings/1')
      .expect(200);
    const migrated = await request(app.getHttpServer())
      .get('/standings/tournaments/1/public-view')
      .expect(200);

    expect(migrated.body.stages).toHaveLength(1);
    expect(migrated.body.stages[0].type).toBe('round_robin');
    expect(migrated.body.stages[0].standings[0]).toEqual(
      expect.objectContaining({
        team: legacy.body[0].team,
        points: legacy.body[0].points,
        goalDifference: legacy.body[0].goalDifference,
      }),
    );
  });

  it('exposes the Yard League groups, best second ranking and playoff', async () => {
    const response = await request(app.getHttpServer())
      .get('/standings/tournaments/2/public-view')
      .expect(200);

    expect(response.body.stages).toHaveLength(2);
    expect(response.body.stages[0].groups).toHaveLength(3);
    expect(response.body.stages[0].crossGroupRankings[0].rows[0])
      .toEqual(expect.objectContaining({ qualificationStatus: 'best_placed' }));
    expect(
      response.body.stages[1].bracket.matches.map(
        (match: { roundType: string }) => match.roundType,
      ),
    ).toEqual(
      expect.arrayContaining(['semi_final', 'third_place', 'final']),
    );
  });

  it('can disable the new public read without affecting the legacy endpoint', async () => {
    flags.isEnabled.mockReturnValue(false);
    await request(app.getHttpServer())
      .get('/standings/tournaments/1/public-view')
      .expect(404);
    await request(app.getHttpServer()).get('/standings/1').expect(200);
  });
});

function legacyPublicView() {
  return {
    tournament: { id: 1, name: 'Existing league' },
    activeStageId: 10,
    stages: [
      {
        id: 10,
        key: 'legacy-main',
        name: 'Основной этап',
        type: 'round_robin',
        order: 1,
        status: 'active',
        groups: [],
        standings: legacyRowsWithStatus(),
        crossGroupRankings: [],
        bracket: { confirmed: false, matches: [] },
        empty: false,
      },
    ],
  };
}

function legacyRowsWithStatus() {
  return [
    {
      position: 1,
      team: { id: 1, name: 'Legacy A' },
      played: 2,
      wins: 2,
      draws: 0,
      losses: 0,
      goalsFor: 5,
      goalsAgainst: 1,
      goalDifference: 4,
      points: 6,
      disciplinaryScore: 0,
      qualificationStatus: 'not_applicable',
      placementReason: {
        type: 'position',
        title: 'Место 1',
        description: 'Позиция таблицы',
      },
    },
  ];
}

function yardLeaguePublicView() {
  const group = (id: number, key: string) => ({
    id,
    key,
    name: `Группа ${key}`,
    order: id,
    standings: [],
  });
  const pendingMatch = (position: string, roundType: string) => ({
    position,
    roundType,
    roundNumber: 1,
    status: 'pending',
    homeSourceLabel: 'Участник ещё не определён',
    awaySourceLabel: 'Участник ещё не определён',
  });
  return {
    tournament: { id: 2, name: 'Дворовая лига' },
    activeStageId: 20,
    stages: [
      {
        id: 20,
        key: 'groups',
        name: 'Групповой этап',
        type: 'group_stage',
        order: 1,
        status: 'active',
        groups: [group(1, 'A'), group(2, 'B'), group(3, 'C')],
        standings: [],
        crossGroupRankings: [
          {
            id: 'best-second',
            title: 'Рейтинг вторых мест',
            sourcePosition: 2,
            criteria: ['points', 'goal_difference', 'goals_for'],
            rows: [
              {
                ...legacyRowsWithStatus()[0],
                sourceGroup: { id: 2, key: 'B', name: 'Группа B' },
                crossGroupPosition: 1,
                qualificationStatus: 'best_placed',
              },
            ],
          },
        ],
        bracket: { confirmed: false, matches: [] },
        empty: false,
      },
      {
        id: 30,
        key: 'playoff',
        name: 'Плей-офф',
        type: 'knockout',
        order: 2,
        status: 'pending',
        groups: [],
        standings: [],
        crossGroupRankings: [],
        bracket: {
          confirmed: true,
          matches: [
            pendingMatch('SF-1', 'semi_final'),
            pendingMatch('SF-2', 'semi_final'),
            pendingMatch('THIRD_PLACE', 'third_place'),
            pendingMatch('FINAL', 'final'),
          ],
        },
        empty: false,
      },
    ],
  };
}
