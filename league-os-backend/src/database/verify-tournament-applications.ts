/** Destructive fixtures are confined to a purpose-created test database on port 55439. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AppDataSource } from './data-source';
import { CommunitiesService } from '../modules/communities/communities.service';
import { CommunityEntity } from '../modules/communities/entities/community.entity';
import {
  CommunityMemberEntity,
  CommunityRole,
} from '../modules/communities/entities/community-member.entity';
import { CommunitySquadsService } from '../modules/registrations/community-squads.service';
import { TournamentApplicationsService } from '../modules/registrations/tournament-applications.service';
import {
  CommunityTeamEntity,
  CommunityTransferRequestEntity,
  TournamentApplicationEntity,
} from '../modules/registrations/entities/registration.entity';
import { TournamentAccessService } from '../modules/tournaments/access/tournament-access.service';
import { TournamentAccessAction } from '../modules/tournaments/access/tournament-access-action.enum';
import { TournamentEntity } from '../modules/tournaments/entities/tournaments.entity';
import { TournamentLifecycleStatus } from '../modules/tournaments/enums/tournament-lifecycle-status.enum';
import { TournamentMemberEntity } from '../modules/tournament-members/entities/tournament-member.entity';
import { TournamentMemberRole } from '../modules/tournament-members/enums/tournament-member-role.enum';
import { TournamentTeamEntity } from '../modules/tournament-teams/entities/tournament-teams.entity';
import { TeamEntity } from '../modules/teams/entities/team.entity';
import { TeamManagerEntity } from '../modules/teams/entities/team-management.entity';
import { TeamPlayerEntity } from '../modules/team-players/entities/team-players.entity';
import { PlayerEntity } from '../modules/players/entities/player.entity';
import { UserEntity } from '../modules/users/entities/user.entity';
import { CompetitionEntity } from '../modules/competitions/entities/competitions.entity';
import { SeasonEntity } from '../modules/seasons/entities/season.entity';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../app.module';
import { MatchEntity } from '../modules/matches/entities/match.entity';
import { MatchRoundType } from '../modules/matches/enums/match-round-type.enum';
import { MatchStatus } from '../modules/matches/enums/match-status.enum';
import { RoleEntity } from '../modules/roles/entities/role.entity';
import { RoleCode } from '../modules/users/enums/role-code.enum';
import type { Server } from 'node:http';
import { VenueEntity } from '../modules/venues/entities/venue.entity';
import { TournamentStageEntity } from '../modules/tournament-stages/entities/tournament-stage.entity';
import { TournamentStageType } from '../modules/tournament-stages/enums/tournament-stage-type.enum';
import { TournamentRuleVersionEntity } from '../modules/tournament-rules/entities/tournament-rule-version.entity';
import { createYardLeagueRules } from '../modules/tournaments/validation/yard-league-rules.fixture';

async function main() {
  const db = new DataSource({
    type: 'postgres',
    entities: AppDataSource.options.entities,
    migrations: AppDataSource.options.migrations,
    host: '127.0.0.1',
    port: 55439,
    username: 'admissions_test',
    password: 'isolated_test_only',
    database: 'admissions_test',
    logging: false,
  });
  await db.initialize();
  try {
    await db.runMigrations({ transaction: 'all' });
    const communities = new CommunitiesService(
      db.getRepository(CommunityEntity),
      db,
    );
    const squads = new CommunitySquadsService(db, communities);
    const access = new TournamentAccessService(
      db.getRepository(TournamentEntity),
      db.getRepository(TournamentMemberEntity),
      db.getRepository(CommunityMemberEntity),
    );
    const service = new TournamentApplicationsService(db, squads, access);
    const communityId = await squads.defaultCommunityId();
    const suffix = Date.now();
    const user = await db.manager.save(UserEntity, {
      username: `captain-${suffix}`,
      firstName: 'Капитан',
      lastName: 'Тест',
    });
    const adminUser = await db.manager.save(UserEntity, {
      username: `admin-${suffix}`,
      firstName: 'Админ',
      lastName: 'Тест',
    });
    const delegated = await db.manager.save(UserEntity, {
      username: `delegated-${suffix}`,
      firstName: 'Админ турнира',
      lastName: 'Тест',
    });
    await db.manager.save(CommunityMemberEntity, [
      {
        communityId,
        userId: adminUser.id,
        role: CommunityRole.Admin,
        isActive: true,
      },
      {
        communityId,
        userId: delegated.id,
        role: CommunityRole.Member,
        isActive: true,
      },
    ]);
    const actor = { id: user.id, roles: [] };
    const admin = { id: adminUser.id, roles: [] };
    const teams = await db.manager.save(TeamEntity, [
      { name: 'Первая', slug: `one-${suffix}` },
      { name: 'Вторая', slug: `two-${suffix}` },
    ]);
    await db.manager.save(TeamManagerEntity, {
      communityId,
      teamId: teams[0].id,
      userId: user.id,
      role: 'owner',
      isActive: true,
    });
    assert.equal(
      await db.manager.countBy(CommunityTeamEntity, {
        communityId,
        teamId: teams[0].id,
      }),
      1,
      'team trigger attaches default community',
    );
    const competition = await db.manager.save(CompetitionEntity, {
      communityId,
      name: 'Кубок',
      slug: `cup-${suffix}`,
    });
    const season = await db.manager.save(SeasonEntity, {
      competitionId: competition.id,
      name: 'Сезон',
      slug: `season-${suffix}`,
    });
    const tournament = await db.manager.save(TournamentEntity, {
      seasonId: season.id,
      name: 'Тест',
      slug: `test-${suffix}`,
      registrationRequired: true,
      lifecycleStatus: TournamentLifecycleStatus.DRAFT,
    });
    const links: TeamPlayerEntity[] = [];
    for (let i = 0; i < 6; i++) {
      const player = await db.manager.save(PlayerEntity, {
        firstName: `Игрок ${i}`,
        lastName: 'Тест',
        slug: `player-${suffix}-${i}`,
        userId: i === 0 ? user.id : undefined,
        birthDate: '2000-01-01',
      });
      links.push(
        await db.manager.save(TeamPlayerEntity, {
          teamId: teams[0].id,
          playerId: player.id,
          shirtNumber: i + 1,
          isCaptain: i === 0,
          isActive: true,
        }),
      );
    }
    await db.manager.save(TournamentMemberEntity, {
      tournamentId: tournament.id,
      userId: delegated.id,
      role: TournamentMemberRole.ADMIN,
    });
    await access.assertAccess(
      tournament.id,
      { id: delegated.id },
      TournamentAccessAction.REVIEW_APPLICATIONS,
    );
    await assert.rejects(() =>
      access.assertAccess(
        tournament.id,
        { id: delegated.id },
        TournamentAccessAction.MANAGE_MEMBERS,
      ),
    );
    const ids = links.slice(0, 5).map((p) => p.playerId);
    await assert.rejects(
      () =>
        service.save(
          tournament.id,
          teams[0].id,
          { playerIds: ids, representatives: [] },
          actor,
        ),
      /закрыта/,
    );
    await assert.rejects(
      () => service.registration(tournament.id, 'open', admin),
      /структуру и правила/,
    );
    const initialRules = createYardLeagueRules().stages[0];
    if (initialRules.type !== 'group_stage') throw new Error('Invalid fixture');
    await db.manager.save(TournamentStageEntity, {
      tournamentId: tournament.id,
      key: 'league',
      name: 'Чемпионат',
      type: TournamentStageType.ROUND_ROBIN,
      order: 1,
    });
    await db.manager.save(TournamentRuleVersionEntity, {
      tournamentId: tournament.id,
      version: 1,
      config: {
        schemaVersion: 1,
        stages: [
          {
            stageKey: 'league',
            type: 'round_robin',
            schedule: initialRules.schedule,
            scoring: initialRules.scoring,
            standings: initialRules.standings,
            match: initialRules.match,
            discipline: initialRules.discipline,
          },
        ],
        transitions: [],
      },
    });
    await service.registration(tournament.id, 'open', admin);
    await service.configure(
      tournament.id,
      {
        maxPlayers: 12,
        minPlayers: 5,
        maxRepresentatives: 2,
        minMatchPlayers: 5,
        maxMatchPlayers: 12,
        allowAmendments: true,
      },
      admin,
    );
    let app = await service.save(
      tournament.id,
      teams[0].id,
      { playerIds: ids, representatives: [{ name: 'Представитель один' }] },
      actor,
    );
    assert.equal(
      await db.manager.countBy(TournamentTeamEntity, {
        tournamentId: tournament.id,
      }),
      0,
      'draft is not participation',
    );
    await service.submit(
      tournament.id,
      teams[0].id,
      app.currentRevisionId!,
      actor,
    );
    await assert.rejects(
      () =>
        service.review(
          tournament.id,
          app.id,
          { revisionId: app.currentRevisionId!, decision: 'return' },
          admin,
        ),
      /исправить/,
    );
    await service.review(
      tournament.id,
      app.id,
      {
        revisionId: app.currentRevisionId!,
        decision: 'return',
        comment: 'Проверьте представителя',
      },
      admin,
    );
    app = await service.save(
      tournament.id,
      teams[0].id,
      {
        playerIds: ids,
        representatives: [],
        expectedRevisionId: app.currentRevisionId!,
      },
      actor,
    );
    await service.submit(
      tournament.id,
      teams[0].id,
      app.currentRevisionId!,
      actor,
    );
    await service.review(
      tournament.id,
      app.id,
      { revisionId: app.currentRevisionId!, decision: 'approve' },
      { id: delegated.id },
    );
    assert.equal(
      await db.manager.countBy(TournamentTeamEntity, {
        tournamentId: tournament.id,
      }),
      1,
    );
    assert.equal(
      (await service.matchRoster(tournament.id, teams[0].id))?.length,
      5,
    );
    const approved = await db.manager.findOneByOrFail(
      TournamentApplicationEntity,
      { id: app.id },
    );
    const revision = approved.approvedRevisionId;
    const beforeChange = service.policy(
      await service.tournament(tournament.id),
    );
    await service.configure(
      tournament.id,
      { ...beforeChange, allowAmendments: false },
      admin,
    );
    await assert.rejects(
      () =>
        service.save(
          tournament.id,
          teams[0].id,
          {
            playerIds: ids,
            representatives: [],
            expectedRevisionId: app.currentRevisionId!,
          },
          actor,
        ),
      /запрещены регламентом/,
    );
    await service.configure(
      tournament.id,
      { ...beforeChange, allowAmendments: true },
      admin,
    );
    assert.equal(
      (
        await db.manager.findOneByOrFail(TournamentApplicationEntity, {
          id: app.id,
        })
      ).approvedRevisionId,
      revision,
    );
    await assert.rejects(
      () =>
        service.configure(
          tournament.id,
          { ...beforeChange, minPlayers: 6 },
          admin,
        ),
      /несовместимы/,
    );
    const amendment = await service.save(
      tournament.id,
      teams[0].id,
      {
        playerIds: [...ids, links[5].playerId],
        representatives: [],
        expectedRevisionId: app.currentRevisionId!,
      },
      actor,
    );
    await service.submit(
      tournament.id,
      teams[0].id,
      amendment.currentRevisionId!,
      actor,
    );
    assert.equal(
      (await service.matchRoster(tournament.id, teams[0].id))?.length,
      5,
      'pending amendment must not replace roster',
    );
    await assert.rejects(
      () =>
        service.configure(
          tournament.id,
          {
            ...beforeChange,
            maxPlayers: 5,
            maxMatchPlayers: 5,
          },
          admin,
        ),
      /несовместимы/,
    );
    await assert.rejects(
      () =>
        service.review(
          tournament.id,
          app.id,
          { revisionId: revision!, decision: 'approve' },
          admin,
        ),
      /устарела/,
    );
    await service.review(
      tournament.id,
      app.id,
      { revisionId: amendment.currentRevisionId!, decision: 'approve' },
      admin,
    );
    assert.equal(
      (await service.matchRoster(tournament.id, teams[0].id))?.length,
      6,
    );
    const requested = await squads.addExisting(
      communityId,
      teams[1].id,
      { playerId: links[1].playerId, shirtNumber: 20 },
      admin,
    );
    assert.equal(requested.transferRequested, true);
    const transfer = await db.manager.findOneByOrFail(
      CommunityTransferRequestEntity,
      { id: requested.requestId },
    );
    assert.equal(
      (await db.manager.findOneByOrFail(TeamPlayerEntity, { id: links[1].id }))
        .isActive,
      true,
    );
    await squads.reviewTransfer(
      communityId,
      transfer.id,
      { decision: 'approve' },
      admin,
    );
    assert.equal(
      (await db.manager.findOneByOrFail(TeamPlayerEntity, { id: links[1].id }))
        .isActive,
      false,
    );
    assert.equal(
      (await service.matchRoster(tournament.id, teams[0].id))?.length,
      6,
      'transfer must preserve approved tournament roster',
    );
    await squads.remove(communityId, teams[0].id, links[2].id, admin);
    assert.equal(
      (await service.matchRoster(tournament.id, teams[0].id))?.length,
      6,
      'release must preserve approved tournament roster',
    );
    const free = await squads.addExisting(
      communityId,
      teams[1].id,
      { playerId: links[2].playerId, shirtNumber: 21 },
      admin,
    );
    assert.equal(
      free.transferRequested,
      false,
      'free agent reuses same player',
    );
    assert.equal(
      await db.manager.countBy(PlayerEntity, { id: links[2].playerId }),
      1,
    );
    const otherCommunity = await db.manager.save(CommunityEntity, {
      name: 'Другое',
      slug: `other-${suffix}`,
    });
    await assert.rejects(() =>
      squads.addExisting(
        otherCommunity.id,
        teams[1].id,
        { playerId: links[3].playerId, shirtNumber: 22 },
        actor,
      ),
    );
    await service.registration(tournament.id, 'close', admin);
    Object.assign(process.env, {
      POSTGRES_HOST: '127.0.0.1',
      POSTGRES_PORT: '55439',
      POSTGRES_USER: 'admissions_test',
      POSTGRES_PASSWORD: 'isolated_test_only',
      POSTGRES_DB: 'admissions_test',
      JWT_SECRET: 'isolated-http-test-secret',
      TOURNAMENT_BUILDER_ENABLED: 'true',
    });
    const nestApplication = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    nestApplication.setGlobalPrefix('api');
    nestApplication.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await nestApplication.init();
    try {
      const jwt = nestApplication.get(JwtService);
      const captainToken = jwt.sign({ sub: user.id, av: 0 });
      const adminToken = jwt.sign({ sub: adminUser.id, av: 0 });
      const delegatedToken = jwt.sign({ sub: delegated.id, av: 0 });
      const server = nestApplication.getHttpServer() as Server;
      await request(server).get('/api/registrations/workspace').expect(401);
      await request(server)
        .get('/api/registrations/workspace')
        .auth(captainToken, { type: 'bearer' })
        .expect(200);
      await request(server)
        .get(`/api/registrations/tournaments/${tournament.id}/applications`)
        .auth(captainToken, { type: 'bearer' })
        .expect(403);
      await request(server)
        .get(`/api/registrations/tournaments/${tournament.id}/applications`)
        .auth(delegatedToken, { type: 'bearer' })
        .expect(200);
      await request(server)
        .get(`/api/registrations/tournaments/${tournament.id}/members`)
        .auth(adminToken, { type: 'bearer' })
        .expect(200);
      await request(server)
        .post(`/api/tournaments/${tournament.id}/members`)
        .auth(delegatedToken, { type: 'bearer' })
        .send({ userId: user.id, role: 'admin' })
        .expect(403);
      await request(server)
        .post(`/api/teams/${teams[0].id}/players`)
        .auth(captainToken, { type: 'bearer' })
        .send({
          firstName: 'Игрок 1',
          lastName: 'Тест',
          birthDate: '2000-01-01',
          shirtNumber: 50,
        })
        .expect(409);
      await request(server)
        .put(
          `/api/registrations/tournaments/${tournament.id}/teams/${teams[0].id}`,
        )
        .auth(captainToken, { type: 'bearer' })
        .send({ playerIds: Array(13).fill(ids[0]), representatives: [] })
        .expect(400);
      await request(server)
        .post('/api/match-service/matches/1/rosters/1/approve')
        .expect(401);
      // This scenario tests match lineups, not launch preparation.
      await db.manager.update(TournamentEntity, tournament.id, {
        lifecycleStatus: TournamentLifecycleStatus.PUBLISHED,
      });
      const match = await db.manager.save(MatchEntity, {
        tournamentId: tournament.id,
        homeTeamId: teams[0].id,
        awayTeamId: teams[1].id,
      });
      const rosterUrl = `/api/match-service/registration-matches/${match.id}/teams/${teams[0].id}/roster`;
      await request(server)
        .patch(`/api/teams/${teams[0].id}/players/${links[0].id}`)
        .auth(captainToken, { type: 'bearer' })
        .send({ isCaptain: false })
        .expect(200);
      await request(server)
        .patch(`/api/teams/${teams[0].id}/players/${links[0].id}`)
        .auth(captainToken, { type: 'bearer' })
        .send({ isCaptain: true })
        .expect(200);
      const response = await request(server)
        .get(rosterUrl)
        .auth(captainToken, { type: 'bearer' })
        .expect(200);
      assert.equal(
        (response.body as { players: unknown[] }).players.length,
        6,
        'match API uses approved roster, including transferred players',
      );
      const outsider = await db.manager.save(PlayerEntity, {
        firstName: 'Новый',
        lastName: 'Незаявленный',
        slug: `outsider-${suffix}`,
      });
      const outsideLink = await db.manager.save(TeamPlayerEntity, {
        playerId: outsider.id,
        teamId: teams[0].id,
        shirtNumber: 45,
        isActive: true,
      });
      await request(server)
        .put(rosterUrl)
        .auth(captainToken, { type: 'bearer' })
        .send({
          teamPlayerIds: [
            ...links.slice(0, 5).map((l) => l.id),
            outsideLink.id,
          ],
        })
        .expect(400);
      const selected = links.slice(0, 5).map((l) => l.id);
      await request(server)
        .put(rosterUrl)
        .auth(captainToken, { type: 'bearer' })
        .send({ teamPlayerIds: selected })
        .expect(200);
      let refereeRole = await db.manager.findOneBy(RoleEntity, {
        code: RoleCode.Referee,
      });
      refereeRole ??= await db.manager.save(RoleEntity, {
        code: RoleCode.Referee,
        name: 'Судья',
      });
      const referee = await db.manager.save(UserEntity, {
        username: `referee-${suffix}`,
        firstName: 'Судья',
        lastName: 'Тест',
        roles: [refereeRole],
      });
      const refereeToken = jwt.sign({ sub: referee.id, av: 0 });
      await request(server)
        .post(`${rosterUrl}/approve`)
        .auth(refereeToken, { type: 'bearer' })
        .expect(201);
      await request(server)
        .put(rosterUrl)
        .auth(captainToken, { type: 'bearer' })
        .send({ teamPlayerIds: links.map((l) => l.id) })
        .expect(400);
      await db.manager.update(TournamentEntity, tournament.id, {
        lifecycleStatus: TournamentLifecycleStatus.PUBLISHED,
      });
      const venue = await db.manager.save(VenueEntity, {
        name: 'Тестовая площадка',
        slug: `venue-${suffix}`,
      });
      const calendarUrl = `/api/tournaments/${tournament.id}/calendar-management`;
      await request(server)
        .get(calendarUrl)
        .auth(delegatedToken, { type: 'bearer' })
        .expect(200);
      await request(server)
        .patch(`${calendarUrl}/${match.id}`)
        .auth(delegatedToken, { type: 'bearer' })
        .send({ matchDatetime: '2026-12-01T18:00', venueId: venue.id })
        .expect(200);
      const anotherMatch = await db.manager.save(MatchEntity, {
        tournamentId: tournament.id,
        homeTeamId: teams[1].id,
        awayTeamId: teams[0].id,
      });
      await request(server)
        .patch(`${calendarUrl}/${anotherMatch.id}`)
        .auth(delegatedToken, { type: 'bearer' })
        .send({ matchDatetime: '2026-12-01T18:00', venueId: venue.id })
        .expect(409);
      await request(server)
        .patch(`${calendarUrl}/${anotherMatch.id}`)
        .auth(delegatedToken, { type: 'bearer' })
        .send({ matchDatetime: '2026-02-30T18:00', venueId: venue.id })
        .expect(400);
      // Initial admission and amendments have independent deadlines. Use only
      // the isolated database, and real authenticated HTTP for every mutation.
      const currentTournament = await service.tournament(tournament.id);
      await db.manager.update(TournamentEntity, tournament.id, {
        registrationStatus: 'closed',
        registrationPolicy: {
          ...service.policy(currentTournament),
          deadline: '2000-01-01T00:00:00Z',
        },
      });
      const roundFour = await db.manager.save(MatchEntity, {
        tournamentId: tournament.id,
        homeTeamId: teams[0].id,
        awayTeamId: teams[1].id,
        roundNumber: 4,
        roundType: MatchRoundType.GROUP_ROUND,
        matchDatetime: new Date(2099, 0, 1, 18),
      });
      await db.manager.save(MatchEntity, [
        {
          tournamentId: tournament.id,
          roundNumber: 3,
          roundType: MatchRoundType.GROUP_ROUND,
          status: MatchStatus.FINISHED,
        },
        {
          tournamentId: tournament.id,
          roundNumber: 4,
          roundType: MatchRoundType.GROUP_ROUND,
          status: MatchStatus.CANCELLED,
          matchDatetime: new Date(2000, 0, 1),
        },
        {
          tournamentId: tournament.id,
          roundNumber: 4,
          roundType: MatchRoundType.QUARTER_FINAL,
          status: MatchStatus.FINISHED,
        },
      ]);
      const applicationUrl = `/api/registrations/tournaments/${tournament.id}/teams/${teams[0].id}`;
      const reviewUrl = `/api/registrations/tournaments/${tournament.id}/applications/${app.id}/review`;
      const beforeLock = await request(server)
        .get(applicationUrl)
        .auth(captainToken, { type: 'bearer' })
        .expect(200);
      const beforeLockBody = beforeLock.body as Awaited<
        ReturnType<TournamentApplicationsService['detail']>
      >;
      assert.equal(
        beforeLockBody.editing.canEdit,
        true,
        'initial deadline must not block amendments before round four',
      );
      const newPlayerIds = (
        await squads.roster(communityId, teams[0].id, actor)
      ).map((l) => l.playerId);
      const draft = await request(server)
        .put(applicationUrl)
        .auth(captainToken, { type: 'bearer' })
        .send({
          playerIds: newPlayerIds,
          representatives: [{ name: 'Новый представитель' }],
          expectedRevisionId: beforeLockBody.application!.currentRevisionId,
        })
        .expect(200);
      const pendingRevision = (draft.body as TournamentApplicationEntity)
        .currentRevisionId!;
      await request(server)
        .post(`${applicationUrl}/submit`)
        .auth(captainToken, { type: 'bearer' })
        .send({ revisionId: pendingRevision })
        .expect(201);
      await db.manager.update(MatchEntity, roundFour.id, {
        matchDatetime: new Date(2000, 0, 1, 18),
      });
      const lockedDetail = await request(server)
        .get(applicationUrl)
        .auth(captainToken, { type: 'bearer' })
        .expect(200);
      const lockedBody = lockedDetail.body as Awaited<
        ReturnType<TournamentApplicationsService['detail']>
      >;
      assert.equal(lockedBody.editing.locked, true);
      assert.equal(lockedBody.editing.canEdit, false);
      assert.match(lockedBody.editing.reason!, /4-го тура/);
      for (const operation of [
        () =>
          request(server)
            .put(applicationUrl)
            .auth(captainToken, { type: 'bearer' })
            .send({
              playerIds: newPlayerIds,
              representatives: [],
              expectedRevisionId: pendingRevision,
            }),
        () =>
          request(server)
            .post(`${applicationUrl}/submit`)
            .auth(captainToken, { type: 'bearer' })
            .send({ revisionId: pendingRevision }),
        () =>
          request(server)
            .post(reviewUrl)
            .auth(delegatedToken, { type: 'bearer' })
            .send({ revisionId: pendingRevision, decision: 'approve' }),
      ]) {
        const blocked = await operation().expect(409);
        assert.match(
          (blocked.body as { message: string }).message,
          /4-го тура/,
        );
      }
      await request(server)
        .post(reviewUrl)
        .auth(delegatedToken, { type: 'bearer' })
        .send({
          revisionId: pendingRevision,
          decision: 'return',
          comment: 'Срок дозаявок завершён',
        })
        .expect(201);
      await request(server)
        .put(applicationUrl)
        .auth(captainToken, { type: 'bearer' })
        .send({
          playerIds: newPlayerIds,
          representatives: [],
          expectedRevisionId: pendingRevision,
        })
        .expect(409);
      assert.equal(
        (await service.matchRoster(tournament.id, teams[0].id))?.length,
        6,
        'locked pending amendment must not replace the accepted roster',
      );
      const roundFourRosterUrl = `/api/match-service/registration-matches/${roundFour.id}/teams/${teams[0].id}/roster`;
      await request(server)
        .put(roundFourRosterUrl)
        .auth(captainToken, { type: 'bearer' })
        .send({ teamPlayerIds: selected })
        .expect(200);
      console.log(
        'PASS: amendments after the initial deadline, fourth-round cutoff for save/submit/approval, accepted roster preserved, match protocol still editable',
      );
      console.log(
        'PASS: full Nest module initialization, authenticated HTTP, captain/admin isolation, validation, duplicate identity guard',
      );
    } finally {
      await nestApplication.close();
    }
    console.log(
      'PASS: migrations, automatic community, scoped admin, submission/review, immutable versions, stale review, approved roster, transfer, release/free agent, community isolation',
    );
  } finally {
    await db.destroy();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
