import {
  type CanActivate,
  type ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Repository } from 'typeorm';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TournamentMemberEntity } from '../tournament-members/entities/tournament-member.entity';
import { TournamentMemberRole } from '../tournament-members/enums/tournament-member-role.enum';
import { TournamentAccessGuard } from './access/tournament-access.guard';
import { TournamentAccessService } from './access/tournament-access.service';
import { TournamentEntity } from './entities/tournaments.entity';
import { TournamentLifecycleStatus } from './enums/tournament-lifecycle-status.enum';
import { TournamentLifecycleService } from './tournament-lifecycle.service';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

describe('Tournament lifecycle HTTP integration', () => {
  let app: INestApplication;

  const tournaments = {
    findOne: jest.fn(async () => ({ id: 10, ownerUserId: 1 })),
  } as unknown as Repository<TournamentEntity>;
  const members = {
    findOne: jest.fn(async ({ where }: { where: { userId: number } }) => {
      if (where.userId === 2) {
        return { role: TournamentMemberRole.ORGANIZER };
      }
      if (where.userId === 3) {
        return { role: TournamentMemberRole.VIEWER };
      }
      return null;
    }),
  } as unknown as Repository<TournamentMemberEntity>;
  const lifecycle = {
    create: jest.fn(async (_dto, ownerUserId) => ({
      id: 10,
      ownerUserId,
      lifecycleStatus: TournamentLifecycleStatus.DRAFT,
    })),
    setMember: jest.fn(async (_tournamentId, dto) => dto),
    createStage: jest.fn(async (_tournamentId, dto) => dto),
    createRuleVersion: jest.fn(async () => ({ version: 2, status: 'draft' })),
    updateDraftRuleVersion: jest.fn(async () => ({
      version: 2,
      status: 'draft',
    })),
    publish: jest.fn(async () => ({
      id: 10,
      lifecycleStatus: TournamentLifecycleStatus.PUBLISHED,
      activeRuleVersionId: 2,
    })),
  };
  const authenticationGuard: CanActivate = {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest();
      const userId = Number(request.headers['x-test-user-id']);
      if (!userId) throw new UnauthorizedException();
      request.user = { id: userId, roles: [] };
      return true;
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TournamentsController],
      providers: [
        TournamentAccessService,
        TournamentAccessGuard,
        { provide: TournamentsService, useValue: {} },
        { provide: TournamentLifecycleService, useValue: lifecycle },
        {
          provide: getRepositoryToken(TournamentEntity),
          useValue: tournaments,
        },
        {
          provide: getRepositoryToken(TournamentMemberEntity),
          useValue: members,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authenticationGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('creates a tournament for the authenticated owner', async () => {
    await request(app.getHttpServer())
      .post('/tournaments')
      .set('x-test-user-id', '1')
      .send({ seasonId: 1, name: 'Cup', slug: 'cup' })
      .expect(201)
      .expect({
        id: 10,
        ownerUserId: 1,
        lifecycleStatus: TournamentLifecycleStatus.DRAFT,
      });
  });

  it('lets the owner appoint an organizer', async () => {
    await request(app.getHttpServer())
      .post('/tournaments/10/members')
      .set('x-test-user-id', '1')
      .send({ userId: 2, role: TournamentMemberRole.ORGANIZER })
      .expect(201);

    expect(lifecycle.setMember).toHaveBeenCalledWith(10, {
      userId: 2,
      role: TournamentMemberRole.ORGANIZER,
    });
  });

  it('lets an organizer edit structure and create a rule version', async () => {
    await request(app.getHttpServer())
      .post('/tournaments/10/stages')
      .set('x-test-user-id', '2')
      .send({
        key: 'groups',
        name: 'Groups',
        type: 'group_stage',
        order: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/tournaments/10/rule-versions')
      .set('x-test-user-id', '2')
      .send({ schemaVersion: 1, config: { schemaVersion: 1 } })
      .expect(201)
      .expect({ version: 2, status: 'draft' });
  });

  it('reserves publication for the owner', async () => {
    await request(app.getHttpServer())
      .post('/tournaments/10/publish')
      .set('x-test-user-id', '2')
      .send({ ruleVersionId: 2 })
      .expect(403);

    await request(app.getHttpServer())
      .post('/tournaments/10/publish')
      .set('x-test-user-id', '1')
      .send({ ruleVersionId: 2 })
      .expect(200)
      .expect({
        id: 10,
        lifecycleStatus: TournamentLifecycleStatus.PUBLISHED,
        activeRuleVersionId: 2,
      });
  });

  it('denies edits to viewers and unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .post('/tournaments/10/stages')
      .set('x-test-user-id', '3')
      .send({
        key: 'groups',
        name: 'Groups',
        type: 'group_stage',
        order: 1,
      })
      .expect(403);

    await request(app.getHttpServer())
      .post('/tournaments/10/publish')
      .send({ ruleVersionId: 2 })
      .expect(401);
  });
});
