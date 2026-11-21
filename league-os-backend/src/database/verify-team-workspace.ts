/** Integration fixtures run only against the dedicated disposable database on port 56439. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppDataSource } from './data-source';
import { AppModule } from '../app.module';
import { RoleEntity } from '../modules/roles/entities/role.entity';
import { RoleCode } from '../modules/users/enums/role-code.enum';
import { CommunityEntity } from '../modules/communities/entities/community.entity';
import {
  CommunityMemberEntity,
  CommunityRole,
} from '../modules/communities/entities/community-member.entity';
import { TeamManagerEntity } from '../modules/teams/entities/team-management.entity';
import { TeamPlayerEntity } from '../modules/team-players/entities/team-players.entity';
import { PlayerEntity } from '../modules/players/entities/player.entity';
import { CompetitionEntity } from '../modules/competitions/entities/competitions.entity';
import { SeasonEntity } from '../modules/seasons/entities/season.entity';
import { TournamentEntity } from '../modules/tournaments/entities/tournaments.entity';
import { TournamentLifecycleStatus } from '../modules/tournaments/enums/tournament-lifecycle-status.enum';
import { DEFAULT_REGISTRATION_POLICY } from '../modules/registrations/entities/registration.entity';
import { TournamentTeamEntity } from '../modules/tournament-teams/entities/tournament-teams.entity';
import { TeamEntity } from '../modules/teams/entities/team.entity';
import { CommunityTeamEntity } from '../modules/registrations/entities/registration.entity';
import { MatchEntity } from '../modules/matches/entities/match.entity';
import { MatchStatus } from '../modules/matches/enums/match-status.enum';
import { UserEntity } from '../modules/users/entities/user.entity';
import { MatchEventEntity } from '../modules/match-events/entities/match-event.entity';
import { MatchEventType } from '../modules/match-events/enums/match-event-type.enum';

interface Auth {
  accessToken: string;
  user: { id: number; username: string; roles: string[] };
}
interface Profile {
  communityId: number;
  team: {
    id: number;
    profileStatus: string;
    profileVersion: number;
    createdByUserId: number;
    logoUrl?: string;
  };
}
async function main() {
  const db = new DataSource({
    type: 'postgres',
    entities: AppDataSource.options.entities,
    migrations: AppDataSource.options.migrations,
    host: '127.0.0.1',
    port: 56439,
    username: 'admissions_test',
    password: 'isolated_test_only',
    database: 'admissions_test',
    logging: false,
  });
  await db.initialize();
  const originalCwd = process.cwd();
  let scratch: string | undefined;
  let uploaded: string | undefined;
  try {
    const selfServiceIndex = db.migrations.findIndex(
      (m) => (m.name || m.constructor.name) === 'TeamSelfService1792627200000',
    );
    assert.ok(selfServiceIndex >= 0);
    const selfService = db.migrations.splice(selfServiceIndex, 1)[0];
    await db.runMigrations({ transaction: 'all' });
    const suffix = Date.now();
    const needsBackfill = (
      await db.query<{ missing: boolean }[]>(
        `SELECT to_regclass('public.team_managers') IS NULL AS missing`,
      )
    )[0].missing;
    let legacy:
      { userId: number; teamId: number; communityId: number } | undefined;
    let ambiguousTeamId: number | undefined;
    if (needsBackfill) {
      const c = (
        await db.query<{ id: number }[]>(
          `SELECT id FROM communities WHERE "isDefault"`,
        )
      )[0];
      const u = (
        await db.query<{ id: number }[]>(
          `INSERT INTO users(username,"firstName","lastName") VALUES ($1,'Старый','Капитан') RETURNING id`,
          [`legacy-${suffix}`],
        )
      )[0];
      const t = (
        await db.query<{ id: number }[]>(
          `INSERT INTO teams(name,slug) VALUES ('Существующая команда',$1) RETURNING id`,
          [`legacy-${suffix}`],
        )
      )[0];
      const p = (
        await db.query<{ id: number }[]>(
          `INSERT INTO players("firstName","lastName",slug,user_id) VALUES ('Старый','Капитан',$1,$2) RETURNING id`,
          [`legacy-${suffix}`, u.id],
        )
      )[0];
      await db.query(
        `INSERT INTO team_players(team_id,player_id,"shirtNumber","isCaptain","isActive") VALUES ($1,$2,1,true,true)`,
        [t.id, p.id],
      );
      legacy = { userId: u.id, teamId: t.id, communityId: c.id };
      const ambiguous = (
        await db.query<{ id: number }[]>(
          `INSERT INTO teams(name,slug) VALUES ('Два прежних капитана',$1) RETURNING id`,
          [`ambiguous-${suffix}`],
        )
      )[0];
      ambiguousTeamId = ambiguous.id;
      for (let i = 0; i < 2; i++) {
        const account = (
          await db.query<{ id: number }[]>(
            `INSERT INTO users(username,"firstName","lastName") VALUES ($1,'Ещё','Капитан') RETURNING id`,
            [`ambiguous-${suffix}-${i}`],
          )
        )[0];
        const player = (
          await db.query<{ id: number }[]>(
            `INSERT INTO players("firstName","lastName",slug,user_id) VALUES ('Ещё','Капитан',$1,$2) RETURNING id`,
            [`ambiguous-${suffix}-${i}`, account.id],
          )
        )[0];
        await db.query(
          `INSERT INTO team_players(team_id,player_id,"shirtNumber","isCaptain","isActive") VALUES ($1,$2,$3,true,true)`,
          [ambiguous.id, player.id, i + 1],
        );
      }
    }
    db.migrations.push(selfService);
    await db.runMigrations({ transaction: 'all' });
    if (ambiguousTeamId) {
      const grants = await db.manager.findBy(TeamManagerEntity, {
        teamId: ambiguousTeamId,
      });
      assert.equal(grants.length, 2);
      assert.ok(
        grants.every((grant) => grant.role === 'manager'),
        'do not arbitrarily elevate one of several captains to owner',
      );
    }
    if (legacy)
      assert.equal(
        (
          await db.manager.findOneByOrFail(TeamManagerEntity, {
            communityId: legacy.communityId,
            teamId: legacy.teamId,
            userId: legacy.userId,
          })
        ).role,
        'owner',
      );
    let userRole = await db.manager.findOneBy(RoleEntity, {
      code: RoleCode.User,
    });
    userRole ??= await db.manager.save(RoleEntity, {
      code: RoleCode.User,
      name: 'Пользователь',
    });
    Object.assign(process.env, {
      POSTGRES_HOST: '127.0.0.1',
      POSTGRES_PORT: '56439',
      POSTGRES_USER: 'admissions_test',
      POSTGRES_PASSWORD: 'isolated_test_only',
      POSTGRES_DB: 'admissions_test',
      JWT_SECRET: 'isolated-team-workspace-secret',
      TOURNAMENT_BUILDER_ENABLED: 'true',
    });
    const app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    scratch = await mkdtemp(join(tmpdir(), 'league-os-team-test-'));
    process.chdir(scratch); // Logo files are test artifacts, not uploads in the user's project.
    try {
      const server = app.getHttpServer() as Server;
      const register = async (name: string): Promise<Auth> =>
        (
          await request(server)
            .post('/api/auth/register')
            .send({
              username: `${name}-${suffix}`,
              email: `${name}-${suffix}@example.test`,
              password: 'test-password-123',
              firstName: 'Тест',
              lastName: name,
            })
            .expect(201)
        ).body as Auth;
      const owner = await register('owner');
      const successor = await register('successor');
      const outsider = await register('outsider');
      const admin = await register('admin');
      const rejected = await register('rejected');
      assert.deepEqual(owner.user.roles, ['user']);
      const community = await db.manager.findOneByOrFail(CommunityEntity, {
        isDefault: true,
      });
      await db.manager.save(CommunityMemberEntity, {
        communityId: community.id,
        userId: admin.user.id,
        role: CommunityRole.Admin,
        isActive: true,
      });
      const workspace = '/api/team-workspace';
      await request(server).get(workspace).expect(401);
      const initial = await request(server)
        .get(workspace)
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(200);
      assert.deepEqual((initial.body as { teams: unknown[] }).teams, []);
      const created = (
        await request(server)
          .post(`${workspace}/teams`)
          .auth(owner.accessToken, { type: 'bearer' })
          .send({
            name: `Новая команда ${suffix}`,
            createdByUserId: outsider.user.id,
            profileStatus: 'published',
            isActive: false,
            logoUrl: 'https://example.test/untrusted.svg',
          })
          .expect(201)
      ).body as Profile;
      assert.equal(created.team.createdByUserId, owner.user.id);
      assert.equal(created.team.profileStatus, 'draft');
      assert.equal(created.team.logoUrl ?? null, null);
      const teamId = created.team.id;
      const profileUrl = `${workspace}/communities/${community.id}/teams/${teamId}`;
      await request(server).get(`/api/teams/${teamId}`).expect(404);
      await request(server).get(`/api/teams/${teamId}/players`).expect(404);
      await request(server)
        .get(profileUrl)
        .auth(outsider.accessToken, { type: 'bearer' })
        .expect(403);
      await request(server)
        .get(
          `/api/registrations/communities/${community.id}/teams/${teamId}/players`,
        )
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(200);
      await request(server)
        .post(`${profileUrl}/publish`)
        .auth(owner.accessToken, { type: 'bearer' })
        .send({ expectedVersion: 1 })
        .expect(400);
      await request(server)
        .post(`${profileUrl}/logo`)
        .auth(owner.accessToken, { type: 'bearer' })
        .field('expectedVersion', '1')
        .attach(
          'logo',
          Buffer.from('<svg onload="alert(1)"></svg>'),
          'logo.png',
        )
        .expect(400);
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      );
      const logo = (
        await request(server)
          .post(`${profileUrl}/logo`)
          .auth(owner.accessToken, { type: 'bearer' })
          .field('expectedVersion', '1')
          .attach('logo', png, 'logo.png')
          .expect(201)
      ).body as Profile;
      assert.match(
        logo.team.logoUrl!,
        /^\/uploads\/teams\/\d+-[a-f0-9-]+\.png$/,
      );
      uploaded = join(scratch, logo.team.logoUrl!.replace(/^\//, ''));
      await request(server)
        .post(`${profileUrl}/logo`)
        .auth(outsider.accessToken, { type: 'bearer' })
        .field('expectedVersion', '2')
        .attach('logo', png, 'logo.png')
        .expect(403);
      await request(server)
        .patch(profileUrl)
        .auth(owner.accessToken, { type: 'bearer' })
        .send({
          expectedVersion: 2,
          city: 'Чебоксары',
          description: 'Описание новой команды',
          shortName: 'Новая',
        })
        .expect(200);
      await request(server)
        .patch(profileUrl)
        .auth(owner.accessToken, { type: 'bearer' })
        .send({ expectedVersion: 2, name: 'Устаревшее изменение' })
        .expect(409);
      assert.equal(
        await db.manager.countBy(PlayerEntity, { userId: owner.user.id }),
        0,
        'owner is not implicitly a player',
      );
      const competition = await db.manager.save(CompetitionEntity, {
        communityId: community.id,
        name: 'Серия',
        slug: `series-${suffix}`,
      });
      const season = await db.manager.save(SeasonEntity, {
        competitionId: competition.id,
        name: 'Сезон',
        slug: `season-${suffix}`,
      });
      const tournament = await db.manager.save(TournamentEntity, {
        seasonId: season.id,
        name: 'Кубок',
        slug: `cup-${suffix}`,
        registrationRequired: true,
        registrationStatus: 'open',
        registrationOpenedAt: new Date(),
        registrationPolicy: DEFAULT_REGISTRATION_POLICY,
        lifecycleStatus: TournamentLifecycleStatus.DRAFT,
      });
      const applicationUrl = `/api/registrations/tournaments/${tournament.id}/teams/${teamId}`;
      await request(server)
        .put(applicationUrl)
        .auth(owner.accessToken, { type: 'bearer' })
        .send({ playerIds: [], representatives: [] })
        .expect(409);
      const links: { id: number; playerId: number }[] = [];
      for (let i = 0; i < 6; i++) {
        const link = (
          await request(server)
            .post(`/api/teams/${teamId}/players`)
            .auth(owner.accessToken, { type: 'bearer' })
            .send({
              firstName: `Игрок ${suffix}-${i}`,
              lastName: 'Тест',
              birthDate: '2000-01-01',
              shirtNumber: i + 1,
              isCaptain: i === 0,
            })
            .expect(201)
        ).body as { id: number; playerId: number };
        links.push(link);
      }
      await request(server)
        .post(`${profileUrl}/publish`)
        .auth(owner.accessToken, { type: 'bearer' })
        .send({ expectedVersion: 3 })
        .expect(201);
      await request(server).get(`/api/teams/${teamId}`).expect(200);
      await request(server)
        .post(`${workspace}/teams`)
        .auth(owner.accessToken, { type: 'bearer' })
        .send({ name: `Новая команда ${suffix}`, city: 'Чебоксары' })
        .expect(409);
      const draft = (
        await request(server)
          .put(applicationUrl)
          .auth(owner.accessToken, { type: 'bearer' })
          .send({
            playerIds: links.map((l) => l.playerId),
            representatives: [{ name: 'Неиграющий представитель' }],
          })
          .expect(200)
      ).body as { id: number; currentRevisionId: number };
      await request(server)
        .post(`${applicationUrl}/submit`)
        .auth(owner.accessToken, { type: 'bearer' })
        .send({ revisionId: draft.currentRevisionId })
        .expect(201);
      assert.equal(
        await db.manager.countBy(TournamentTeamEntity, {
          tournamentId: tournament.id,
          teamId,
        }),
        0,
      );
      await request(server)
        .post(
          `/api/registrations/tournaments/${tournament.id}/applications/${draft.id}/review`,
        )
        .auth(admin.accessToken, { type: 'bearer' })
        .send({ revisionId: draft.currentRevisionId, decision: 'approve' })
        .expect(201);
      assert.equal(
        await db.manager.countBy(TournamentTeamEntity, {
          tournamentId: tournament.id,
          teamId,
        }),
        1,
      );
      await request(server)
        .post(`${profileUrl}/managers`)
        .auth(owner.accessToken, { type: 'bearer' })
        .send({ username: successor.user.username, role: 'manager' })
        .expect(201);
      await request(server)
        .get(profileUrl)
        .auth(successor.accessToken, { type: 'bearer' })
        .expect(200);
      const identity = async (actor: Auth) =>
        (
          await request(server)
            .get('/api/auth/me')
            .auth(actor.accessToken, { type: 'bearer' })
            .expect(200)
        ).body;
      const ownerIdentity = await identity(owner);
      assert.deepEqual(ownerIdentity.captainTeamIds, []);
      assert.ok(
        ownerIdentity.teamAccess.some(
          (g: any) => g.teamId === teamId && g.role === 'owner',
        ),
      );
      const managerIdentity = await identity(successor);
      assert.deepEqual(managerIdentity.captainTeamIds, []);
      assert.ok(
        managerIdentity.teamAccess.some(
          (g: any) =>
            g.teamId === teamId &&
            g.role === 'manager' &&
            !g.permissions.includes('team.access.manage'),
        ),
      );
      const opponent = await db.manager.save(TeamEntity, {
        name: 'Соперник',
        slug: `opponent-${suffix}`,
      });
      await db.manager.upsert(
        CommunityTeamEntity,
        { communityId: community.id, teamId: opponent.id, isActive: true },
        ['communityId', 'teamId'],
      );
      await db.manager.update(TournamentEntity, tournament.id, {
        lifecycleStatus: TournamentLifecycleStatus.IN_PROGRESS,
      });
      const match = await db.manager.save(MatchEntity, {
        tournamentId: tournament.id,
        homeTeamId: teamId,
        awayTeamId: opponent.id,
        status: MatchStatus.SCHEDULED,
        matchDatetime: new Date(Date.now() + 86400000),
      });
      const rosterUrl = `/api/match-service/registration-matches/${match.id}/teams/${teamId}/roster`;
      const officialUrl = `/api/match-service/match-results/${match.id}/teams/${teamId}/roster`;
      const selection = { teamPlayerIds: links.map((l) => l.id) };
      const listed = await request(server)
        .get('/api/match-service/registration-matches')
        .auth(successor.accessToken, { type: 'bearer' })
        .expect(200);
      assert.ok(
        listed.body.some(
          (m: any) => m.id === match.id && m.communityId === community.id,
        ),
      );
      await request(server)
        .put(rosterUrl)
        .auth(successor.accessToken, { type: 'bearer' })
        .send(selection)
        .expect(200);
      const submitted = await request(server)
        .post(`${rosterUrl}/approve`)
        .auth(successor.accessToken, { type: 'bearer' })
        .expect(201);
      assert.equal(submitted.body.isSubmitted, true);
      assert.equal(submitted.body.isApproved, false);
      await request(server)
        .put(officialUrl)
        .auth(outsider.accessToken, { type: 'bearer' })
        .send(selection)
        .expect(403);
      const approved = await request(server)
        .put(officialUrl)
        .auth(admin.accessToken, { type: 'bearer' })
        .send(selection)
        .expect(200);
      assert.equal(approved.body.isApproved, true);
      await request(server)
        .put(rosterUrl)
        .auth(owner.accessToken, { type: 'bearer' })
        .send(selection)
        .expect(400);
      await request(server)
        .put(officialUrl)
        .auth(admin.accessToken, { type: 'bearer' })
        .send(selection)
        .expect(400);
      const returned = await request(server)
        .post(`${officialUrl}/return`)
        .auth(admin.accessToken, { type: 'bearer' })
        .send({ reason: 'Уточните состав перед матчем' })
        .expect(201);
      assert.equal(returned.body.isApproved, false);
      assert.equal(returned.body.isSubmitted, false);
      assert.equal(returned.body.reviewComment, 'Уточните состав перед матчем');
      await request(server)
        .put(rosterUrl)
        .auth(owner.accessToken, { type: 'bearer' })
        .send(selection)
        .expect(200);
      await request(server)
        .post(`${rosterUrl}/approve`)
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(201);
      await request(server)
        .put(officialUrl)
        .auth(admin.accessToken, { type: 'bearer' })
        .send(selection)
        .expect(200);
      const corrected = await request(server)
        .put(officialUrl)
        .auth(admin.accessToken, { type: 'bearer' })
        .send({ ...selection, reason: 'Исправление по просьбе представителя' })
        .expect(200);
      assert.ok(
        corrected.body.workflowHistory.some(
          (e: any) => e.action === 'returned',
        ),
      );
      assert.equal(
        corrected.body.workflowHistory.at(-1).reason,
        'Исправление по просьбе представителя',
      );
      const adminWorkspace = await request(server)
        .get(workspace)
        .auth(admin.accessToken, { type: 'bearer' })
        .expect(200);
      assert.ok(
        adminWorkspace.body.teamsWithoutOwners.some(
          (t: any) => t.teamId === opponent.id,
        ),
      );
      const referee = await register('referee');
      const refereeRole =
        (await db.manager.findOneBy(RoleEntity, { code: RoleCode.Referee })) ??
        (await db.manager.save(RoleEntity, {
          code: RoleCode.Referee,
          name: 'Судья',
        }));
      const refereeAccount = await db.manager.findOneOrFail(UserEntity, {
        where: { id: referee.user.id },
        relations: { roles: true },
      });
      refereeAccount.roles.push(refereeRole);
      await db.manager.save(refereeAccount);
      const otherCommunity = await db.manager.save(CommunityEntity, {
        name: 'Другое сообщество',
        slug: `other-${suffix}`,
      });
      await db.manager.save(CommunityMemberEntity, {
        communityId: otherCommunity.id,
        userId: referee.user.id,
        role: CommunityRole.Member,
        isActive: true,
      });
      await request(server)
        .get(officialUrl)
        .auth(referee.accessToken, { type: 'bearer' })
        .expect(403);
      await db.manager.save(CommunityMemberEntity, {
        communityId: community.id,
        userId: referee.user.id,
        role: CommunityRole.Member,
        isActive: true,
      });
      await request(server)
        .get(officialUrl)
        .auth(referee.accessToken, { type: 'bearer' })
        .expect(200);
      await db.manager.update(
        CommunityMemberEntity,
        { communityId: community.id, userId: referee.user.id },
        { isActive: false },
      );
      await request(server)
        .get(officialUrl)
        .auth(referee.accessToken, { type: 'bearer' })
        .expect(403);
      await request(server)
        .post(`${profileUrl}/managers`)
        .auth(successor.accessToken, { type: 'bearer' })
        .send({ username: outsider.user.username, role: 'owner' })
        .expect(403);
      // A playing captain does not retain access after an explicit manager grant is revoked.
      await db.manager.update(PlayerEntity, links[1].playerId, {
        userId: successor.user.id,
      });
      await db.manager.update(TeamPlayerEntity, links[1].id, {
        isCaptain: true,
      });
      await request(server)
        .delete(`${profileUrl}/managers/${successor.user.id}`)
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(200);
      await request(server)
        .get(profileUrl)
        .auth(successor.accessToken, { type: 'bearer' })
        .expect(403);
      const revokedIdentity = await identity(successor);
      assert.ok(revokedIdentity.captainTeamIds.includes(teamId));
      assert.ok(
        !revokedIdentity.teamAccess.some((g: any) => g.teamId === teamId),
      );
      await request(server)
        .get(rosterUrl)
        .auth(successor.accessToken, { type: 'bearer' })
        .expect(403);
      await request(server)
        .delete(`${profileUrl}/managers/${owner.user.id}`)
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(409);
      await request(server)
        .post(`${profileUrl}/ownership/transfer`)
        .auth(owner.accessToken, { type: 'bearer' })
        .send({
          username: 'missing-account',
          previousOwnerUserId: owner.user.id,
          previousOwnerAction: 'revoke',
          reason: 'Проверка атомарности передачи',
        })
        .expect(404);
      assert.equal(
        (
          await db.manager.findOneByOrFail(TeamManagerEntity, {
            teamId,
            userId: owner.user.id,
          })
        ).isActive,
        true,
      );
      await request(server)
        .post(`${profileUrl}/ownership/transfer`)
        .auth(owner.accessToken, { type: 'bearer' })
        .send({
          username: successor.user.username,
          previousOwnerUserId: owner.user.id,
          previousOwnerAction: 'revoke',
          reason: 'Передача полномочий новому владельцу',
        })
        .expect(201);
      await request(server)
        .get(profileUrl)
        .auth(owner.accessToken, { type: 'bearer' })
        .expect(403);
      await request(server)
        .delete(
          `/api/registrations/communities/${community.id}/teams/${teamId}/players/${links[1].id}`,
        )
        .auth(successor.accessToken, { type: 'bearer' })
        .expect(200);
      await request(server)
        .get(profileUrl)
        .auth(successor.accessToken, { type: 'bearer' })
        .expect(200);
      const claim = (
        await request(server)
          .post(`${workspace}/access-requests`)
          .auth(outsider.accessToken, { type: 'bearer' })
          .send({
            teamId,
            reason: 'Я представляю команду, прошу проверить мои полномочия',
          })
          .expect(201)
      ).body as { id: number };
      await request(server)
        .get(profileUrl)
        .auth(outsider.accessToken, { type: 'bearer' })
        .expect(403);
      await request(server)
        .post(
          `${workspace}/communities/${community.id}/access-requests/${claim.id}/review`,
        )
        .auth(successor.accessToken, { type: 'bearer' })
        .send({ decision: 'approve' })
        .expect(403);
      await request(server)
        .post(
          `${workspace}/communities/${community.id}/access-requests/${claim.id}/review`,
        )
        .auth(admin.accessToken, { type: 'bearer' })
        .send({ decision: 'approve', comment: 'Полномочия проверены' })
        .expect(201);
      await request(server)
        .get(profileUrl)
        .auth(outsider.accessToken, { type: 'bearer' })
        .expect(200);
      const rejectedClaim = (
        await request(server)
          .post(`${workspace}/access-requests`)
          .auth(rejected.accessToken, { type: 'bearer' })
          .send({ teamId, reason: 'Запрос для проверки отказа с комментарием' })
          .expect(201)
      ).body as { id: number };
      const reviewUrl = `${workspace}/communities/${community.id}/access-requests/${rejectedClaim.id}/review`;
      await request(server)
        .post(reviewUrl)
        .auth(admin.accessToken, { type: 'bearer' })
        .send({ decision: 'reject' })
        .expect(400);
      await request(server)
        .post(reviewUrl)
        .auth(admin.accessToken, { type: 'bearer' })
        .send({ decision: 'reject', comment: 'Полномочия не подтверждены' })
        .expect(201);
      await request(server)
        .get(profileUrl)
        .auth(rejected.accessToken, { type: 'bearer' })
        .expect(403);
      await db.manager.update(
        CommunityMemberEntity,
        { communityId: community.id, userId: outsider.user.id },
        { isActive: false },
      );
      await request(server)
        .get(profileUrl)
        .auth(outsider.accessToken, { type: 'bearer' })
        .expect(403);
      await request(server)
        .get(`${profileUrl}/managers`)
        .auth(outsider.accessToken, { type: 'bearer' })
        .expect(403);
      await request(server)
        .post(`${profileUrl}/managers`)
        .auth(outsider.accessToken, { type: 'bearer' })
        .send({ username: rejected.user.username, role: 'owner' })
        .expect(403);
      for (const action of ['keep', 'manager'] as const) {
        await request(server)
          .post(`${profileUrl}/ownership/transfer`)
          .auth(admin.accessToken, { type: 'bearer' })
          .send({
            username: owner.user.username,
            previousOwnerUserId: successor.user.id,
            previousOwnerAction: action,
            reason: 'Проверка вариантов сохранения доступа',
          })
          .expect(201);
        const prior = await db.manager.findOneByOrFail(TeamManagerEntity, {
          teamId,
          userId: successor.user.id,
        });
        assert.equal(prior.role, action === 'keep' ? 'owner' : 'manager');
        assert.equal(prior.isActive, true);
        // Restore the successor as an owner before testing the next explicit choice.
        await request(server)
          .post(`${profileUrl}/ownership/transfer`)
          .auth(admin.accessToken, { type: 'bearer' })
          .send({
            username: successor.user.username,
            previousOwnerUserId: owner.user.id,
            previousOwnerAction: 'revoke',
            reason: 'Обратная передача для проверки',
          })
          .expect(201);
      }
      const adminRole =
        (await db.manager.findOneBy(RoleEntity, { code: RoleCode.Admin })) ??
        (await db.manager.save(RoleEntity, {
          code: RoleCode.Admin,
          name: 'Администратор',
        }));
      const adminAccount = await db.manager.findOneOrFail(UserEntity, {
        where: { id: admin.user.id },
        relations: { roles: true },
      });
      adminAccount.roles.push(adminRole);
      await db.manager.save(adminAccount);
      await db.manager.update(MatchEntity, match.id, {
        status: MatchStatus.FINISHED,
      });
      await request(server)
        .post(`${officialUrl}/return`)
        .auth(admin.accessToken, { type: 'bearer' })
        .send({ reason: 'Матч уже завершён' })
        .expect(404);
      const finishedUrl = `/api/match-service/finished-matches/${match.id}/teams/${teamId}/roster`;
      await request(server)
        .put(finishedUrl)
        .auth(admin.accessToken, { type: 'bearer' })
        .send(selection)
        .expect(400);
      const finished = await request(server)
        .put(finishedUrl)
        .auth(admin.accessToken, { type: 'bearer' })
        .send({
          ...selection,
          reason: 'Уточнение фактического состава после игры',
        })
        .expect(200);
      assert.equal(
        finished.body.workflowHistory.at(-1).action,
        'corrected_finished',
      );
      assert.ok(
        finished.body.workflowHistory.some((e: any) => e.action === 'returned'),
      );
      await db.manager.save(MatchEventEntity, {
        matchId: match.id,
        teamId,
        playerId: links[0].playerId,
        eventType: MatchEventType.GOAL,
        minute: 1,
        half: 1,
        isCancelled: false,
      });
      const blocked = await request(server)
        .put(finishedUrl)
        .auth(admin.accessToken, { type: 'bearer' })
        .send({
          teamPlayerIds: selection.teamPlayerIds.filter(
            (id) => id !== links[0].id,
          ),
          reason: 'Попытка исключить автора гола',
        })
        .expect(400);
      assert.match(blocked.body.message, /Сначала удалите события/);
      console.log(
        'PASS: migrations; signup → team → squad → approved tournament application → roster submission/approval/return/correction history; non-playing manager; captain without grant denied; community-scoped referees; atomic ownership keep/manager/revoke; last-owner protection; reviewed access; upload validation',
      );
    } finally {
      await app.close();
    }
  } finally {
    process.chdir(originalCwd);
    if (uploaded) await unlink(uploaded);
    if (scratch) {
      await rmdir(join(scratch, 'uploads', 'teams')).catch(() => undefined);
      await rmdir(join(scratch, 'uploads')).catch(() => undefined);
      await rmdir(scratch);
    }
    await db.destroy();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
