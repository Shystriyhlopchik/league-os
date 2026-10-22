import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { Server } from 'node:http';
import { CommunitiesController } from './communities.controller';
import { CommunitiesService } from './communities.service';
import { CommunityEntity } from './entities/community.entity';
import {
  CommunityMemberEntity,
  CommunityRole,
} from './entities/community-member.entity';
import { CommunityAccessAuditEntity } from './entities/community-access-audit.entity';
import { UserEntity } from '../users/entities/user.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { TournamentMemberEntity } from '../tournament-members/entities/tournament-member.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('Community permissions HTTP integration', () => {
  let app: INestApplication<Server>;
  type TestMember = Pick<
    CommunityMemberEntity,
    'userId' | 'communityId' | 'role' | 'isActive'
  > & { id?: number };
  const memberships = new Map<string, TestMember>();
  const audit: Pick<
    CommunityAccessAuditEntity,
    'communityId' | 'actorUserId' | 'targetUserId' | 'previousRole' | 'newRole'
  >[] = [];
  const communityRepo = {
    findOne: jest.fn(() => Promise.resolve({ id: 10, isActive: true })),
    findOneBy: jest.fn(() => Promise.resolve({ id: 10, isActive: true })),
  };
  const membershipRepo = {
    findOneBy: jest.fn((where: { communityId: number; userId: number }) =>
      Promise.resolve(
        memberships.get(`${where.communityId}:${where.userId}`) ?? null,
      ),
    ),
    create: (x: TestMember) => x,
    save: jest.fn((x: TestMember) => {
      memberships.set(`${x.communityId}:${x.userId}`, x);
      return Promise.resolve(x);
    }),
  };
  const grantRepo = { delete: jest.fn() };
  const manager = {
    getRepository: (entity: unknown): unknown => {
      if (entity === CommunityEntity) return communityRepo;
      if (entity === CommunityMemberEntity) return membershipRepo;
      if (entity === CommunityAccessAuditEntity)
        return {
          save: (entry: (typeof audit)[number]) =>
            Promise.resolve(audit.push(entry)),
        };
      if (entity === UserEntity)
        return {
          findOneBy: (where: { id: number }) =>
            Promise.resolve({ id: where.id, isActive: true }),
        };
      if (entity === TournamentEntity)
        return { find: () => Promise.resolve([{ id: 100 }]) };
      if (entity === TournamentMemberEntity) return grantRepo;
      throw new Error('Unexpected repository');
    },
  };
  const authentication: CanActivate = {
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<{
        headers: Record<string, string>;
        user?: { id: number; roles: string[] };
      }>();
      const id = Number(req.headers['x-test-user-id']);
      if (!id) throw new UnauthorizedException();
      req.user = { id, roles: ['user'] };
      return true;
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CommunitiesController],
      providers: [
        CommunitiesService,
        {
          provide: getRepositoryToken(CommunityEntity),
          useValue: communityRepo,
        },
        {
          provide: DataSource,
          useValue: {
            manager,
            transaction: (work: (m: typeof manager) => unknown) =>
              work(manager),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authentication)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    memberships.clear();
    audit.length = 0;
    jest.clearAllMocks();
    memberships.set('10:1', {
      id: 1,
      userId: 1,
      communityId: 10,
      role: CommunityRole.Owner,
      isActive: true,
    });
    memberships.set('10:2', {
      id: 2,
      userId: 2,
      communityId: 10,
      role: CommunityRole.Member,
      isActive: true,
    });
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .patch('/communities/10/members/2')
      .send({ role: 'admin' })
      .expect(401);
  });
  it('lets an owner grant and immediately revoke administrative access', async () => {
    await request(app.getHttpServer())
      .patch('/communities/10/members/2')
      .set('x-test-user-id', '1')
      .send({ role: 'admin', roles: ['super_admin'] })
      .expect(200);
    expect(memberships.get('10:2')?.role).toBe('admin');
    expect(memberships.get('10:2')).not.toHaveProperty('roles');
    await request(app.getHttpServer())
      .patch('/communities/10/members/3')
      .set('x-test-user-id', '2')
      .send({ role: 'admin' })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/communities/10/members/2')
      .set('x-test-user-id', '1')
      .send({ role: 'member' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/communities/10/context')
      .set('x-test-user-id', '2')
      .expect(403);
    expect(grantRepo.delete).toHaveBeenCalled();
    expect(audit.map((entry) => entry.newRole)).toEqual(['admin', 'member']);
  });
  it('rejects the same actor in a different community', async () => {
    await request(app.getHttpServer())
      .patch('/communities/20/members/2')
      .set('x-test-user-id', '1')
      .send({ role: 'admin' })
      .expect(403);
    expect(membershipRepo.save).not.toHaveBeenCalled();
  });
  it('does not let local owners grant platform or ownership privileges', async () => {
    await request(app.getHttpServer())
      .patch('/communities/10/members/2')
      .set('x-test-user-id', '1')
      .send({ role: 'super_admin' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/communities/10/members/2')
      .set('x-test-user-id', '1')
      .send({ role: 'owner' })
      .expect(403);
  });
  it('validates pagination and identifiers before invoking the service', async () => {
    await request(app.getHttpServer())
      .get('/communities/10/members?limit=10000')
      .set('x-test-user-id', '1')
      .expect(400);
    await request(app.getHttpServer())
      .get('/communities/10/members?page=0')
      .set('x-test-user-id', '1')
      .expect(400);
    await request(app.getHttpServer())
      .patch('/communities/not-a-number/members/2')
      .set('x-test-user-id', '1')
      .send({ role: 'admin' })
      .expect(400);
  });
});
