/** Full HTTP workflow. Only the disposable admissions_test database on port 55439. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { DataSource } from 'typeorm';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppDataSource } from './data-source';
import { AppModule } from '../app.module';
import { CommunityEntity } from '../modules/communities/entities/community.entity';
import {
  CommunityMemberEntity,
  CommunityRole,
} from '../modules/communities/entities/community-member.entity';
import { UserEntity } from '../modules/users/entities/user.entity';
import { RoleEntity } from '../modules/roles/entities/role.entity';
import { RoleCode } from '../modules/users/enums/role-code.enum';
import { CompetitionEntity } from '../modules/competitions/entities/competitions.entity';
import { SeasonEntity } from '../modules/seasons/entities/season.entity';
import { TournamentEntity } from '../modules/tournaments/entities/tournaments.entity';
import { TournamentTeamEntity } from '../modules/tournament-teams/entities/tournament-teams.entity';
import { TeamEntity } from '../modules/teams/entities/team.entity';
import { TeamManagerEntity } from '../modules/teams/entities/team-management.entity';
import { PlayerEntity } from '../modules/players/entities/player.entity';
import { TeamPlayerEntity } from '../modules/team-players/entities/team-players.entity';
import { MatchEntity } from '../modules/matches/entities/match.entity';
import { MatchStatus } from '../modules/matches/enums/match-status.enum';
import { VenueEntity } from '../modules/venues/entities/venue.entity';
import {
  TournamentApplicationEntity,
  DEFAULT_REGISTRATION_POLICY,
} from '../modules/registrations/entities/registration.entity';
import { createYardLeagueRules } from '../modules/tournaments/validation/yard-league-rules.fixture';
import type { TournamentValidationResult } from '../modules/tournaments/validation/tournament-validation-result.type';

async function main() {
  const db = new DataSource({
    type: 'postgres',
    host: '127.0.0.1',
    port: 55439,
    username: 'admissions_test',
    password: 'isolated_test_only',
    database: 'admissions_test',
    entities: AppDataSource.options.entities,
    migrations: AppDataSource.options.migrations,
  });
  await db.initialize();
  try {
    await db.runMigrations({ transaction: 'all' });
    const suffix = Date.now();
    const community = await db.manager.findOneByOrFail(CommunityEntity, {
      isDefault: true,
    });
    const admin = await db.manager.save(UserEntity, {
      username: `workflow-admin-${suffix}`,
      firstName: 'Администратор',
      lastName: 'Сообщества',
    });
    const captain = await db.manager.save(UserEntity, {
      username: `workflow-captain-${suffix}`,
      firstName: 'Капитан',
      lastName: 'Команд',
    });
    await db.manager.save(CommunityMemberEntity, [
      {
        communityId: community.id,
        userId: admin.id,
        role: CommunityRole.Admin,
        isActive: true,
      },
      {
        communityId: community.id,
        userId: captain.id,
        role: CommunityRole.Member,
        isActive: true,
      },
    ]);
    const competition = await db.manager.save(CompetitionEntity, {
      communityId: community.id,
      name: 'Кубки сообщества',
      slug: `workflow-${suffix}`,
    });
    const season = await db.manager.save(SeasonEntity, {
      competitionId: competition.id,
      name: 'Сезон',
      slug: `workflow-${suffix}`,
    });
    Object.assign(process.env, {
      POSTGRES_HOST: '127.0.0.1',
      POSTGRES_PORT: '55439',
      POSTGRES_USER: 'admissions_test',
      POSTGRES_PASSWORD: 'isolated_test_only',
      POSTGRES_DB: 'admissions_test',
      JWT_SECRET: 'isolated-workflow-test-secret',
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
    try {
      const server = app.getHttpServer() as Server;
      const jwt = app.get(JwtService);
      const adminToken = jwt.sign({ sub: admin.id, av: 0 });
      const captainToken = jwt.sign({ sub: captain.id, av: 0 });
      const post = (url: string, body: object, token = adminToken) =>
        request(server).post(url).auth(token, { type: 'bearer' }).send(body);
      const created = await post('/api/tournaments', {
        seasonId: season.id,
        name: 'Турнир без команд',
        slug: `workflow-${suffix}`,
        format: 'mixed',
      }).expect(201);
      const tournament = created.body as TournamentEntity;
      assert.equal(
        await db.manager.countBy(TournamentTeamEntity, {
          tournamentId: tournament.id,
        }),
        0,
      );
      const base = `/api/tournaments/${tournament.id}`;
      const reg = `/api/registrations/tournaments/${tournament.id}`;
      await post(`${reg}/open`, {}).expect(409);
      const config = createYardLeagueRules();
      const groupRules = config.stages[0];
      const playoffRules = config.stages[1];
      if (groupRules.type !== 'group_stage' || playoffRules.type !== 'knockout')
        throw new Error('Invalid fixture');
      groupRules.groups = { count: 2, teamsPerGroup: 2 };
      playoffRules.bracket.seeding = {
        type: 'standard',
        ranking: {
          criteria: ['points', 'goal_difference', 'goals_for', 'draw_lots'],
        },
      };
      config.transitions[0].qualification = [
        { id: 'top-two', type: 'top_n_per_group', positions: [1, 2] },
      ];
      delete config.transitions[0].crossGroupComparison;
      const stage = (
        await post(`${base}/stages`, {
          key: 'groups',
          name: 'Группы',
          type: 'group_stage',
          order: 1,
          configuration: {
            schemaVersion: 1,
            type: 'group_stage',
            groupsCount: 2,
            teamsPerGroup: 2,
            legs: 1,
          },
        }).expect(201)
      ).body as { id: number };
      await post(`${base}/stages`, {
        key: 'playoff',
        name: 'Плей-офф',
        type: 'knockout',
        order: 2,
        configuration: {
          schemaVersion: 1,
          type: 'knockout',
          bracketSize: 4,
          thirdPlaceMatch: true,
        },
      }).expect(201);
      const groupIds: number[] = [];
      for (const key of ['A', 'B'])
        groupIds.push(
          (
            (
              await post(`${base}/stages/${stage.id}/groups`, {
                key,
                name: `Группа ${key}`,
                order: groupIds.length + 1,
                capacity: 2,
              }).expect(201)
            ).body as { id: number }
          ).id,
        );
      const version = (
        await post(`${base}/rule-versions`, { config }).expect(201)
      ).body as { id: number };
      assert.equal(
        (
          (
            await post(`${base}/validate`, {
              config,
              mode: 'configuration',
            }).expect(200)
          ).body as TournamentValidationResult
        ).valid,
        true,
      );
      assert.equal(
        (
          (
            await post(`${base}/validate`, { config, mode: 'launch' }).expect(
              200,
            )
          ).body as TournamentValidationResult
        ).valid,
        false,
      );
      await post(`${base}/publish`, { ruleVersionId: version.id }).expect(400);
      const policy = { ...DEFAULT_REGISTRATION_POLICY };
      await request(server)
        .put(`${reg}/policy`)
        .auth(adminToken, { type: 'bearer' })
        .send(policy)
        .expect(200);
      await post(`${reg}/open`, {}).expect(201);
      const applications: TournamentApplicationEntity[] = [];
      const teamIds: number[] = [];
      for (let t = 0; t < 4; t++) {
        const team = await db.manager.save(TeamEntity, {
          name: `Команда ${t}`,
          slug: `workflow-${suffix}-${t}`,
          profileStatus: 'published',
          city: 'Чебоксары',
        });
        teamIds.push(team.id);
        await db.manager.save(TeamManagerEntity, {
          communityId: community.id,
          teamId: team.id,
          userId: captain.id,
          role: 'owner',
          isActive: true,
        });
        const ids: number[] = [];
        for (let i = 0; i < 5; i++) {
          const player = await db.manager.save(PlayerEntity, {
            firstName: `Игрок ${t}-${i}`,
            lastName: 'Тест',
            slug: `workflow-${suffix}-${t}-${i}`,
            birthDate: '2000-01-01',
          });
          ids.push(player.id);
          await db.manager.save(TeamPlayerEntity, {
            communityId: community.id,
            teamId: team.id,
            playerId: player.id,
            shirtNumber: i + 1,
            isCaptain: i === 0,
            isActive: true,
          });
        }
        const url = `${reg}/teams/${team.id}`;
        let saved = (
          await request(server)
            .put(url)
            .auth(captainToken, { type: 'bearer' })
            .send({ playerIds: ids, representatives: [] })
            .expect(200)
        ).body as TournamentApplicationEntity;
        await post(
          `${url}/submit`,
          { revisionId: saved.currentRevisionId },
          captainToken,
        ).expect(201);
        if (t === 0) {
          await post(`${reg}/applications/${saved.id}/review`, {
            revisionId: saved.currentRevisionId,
            decision: 'return',
            comment: 'Укажите представителя',
          }).expect(201);
          saved = (
            await request(server)
              .put(url)
              .auth(captainToken, { type: 'bearer' })
              .send({
                playerIds: ids,
                representatives: [{ name: 'Представитель' }],
                expectedRevisionId: saved.currentRevisionId,
              })
              .expect(200)
          ).body as TournamentApplicationEntity;
          await post(
            `${url}/submit`,
            { revisionId: saved.currentRevisionId },
            captainToken,
          ).expect(201);
        }
        applications.push(saved);
        // Keep the last application pending to check launch protection.
        if (t !== 3)
          await post(`${reg}/applications/${saved.id}/review`, {
            revisionId: saved.currentRevisionId,
            decision: 'approve',
          }).expect(201);
      }
      await post(`${reg}/close`, {}).expect(201);
      await post(`${base}/publish`, { ruleVersionId: version.id }).expect(400);
      const last = applications[3];
      await post(`${reg}/applications/${last.id}/review`, {
        revisionId: last.currentRevisionId,
        decision: 'approve',
      }).expect(201);
      const accepted = await db.manager.findBy(TournamentTeamEntity, {
        tournamentId: tournament.id,
      });
      for (let i = 0; i < accepted.length; i++)
        await post(`${base}/stages/${stage.id}/participants`, {
          tournamentTeamId: accepted[i].id,
          groupId: groupIds[Math.floor(i / 2)],
        }).expect(201);
      const readyWithoutCalendar = (
        await post(`${base}/validate`, { config, mode: 'launch' }).expect(200)
      ).body as TournamentValidationResult;
      assert(
        readyWithoutCalendar.errors.some(
          (e) => e.code === 'CALENDAR_INCOMPLETE',
        ),
      );
      const venue = await db.manager.save(VenueEntity, {
        name: 'Тестовая площадка',
        slug: `workflow-${suffix}`,
      });
      let generated = (
        await post(`${base}/stages/${stage.id}/schedule/generate`, {
          legs: 1,
        }).expect(201)
      ).body as { createdMatches: number; matches: MatchEntity[] };
      assert.equal(generated.createdMatches, 2);
      await request(server)
        .patch(`${base}/calendar-management/${generated.matches[0].id}`)
        .auth(adminToken, { type: 'bearer' })
        .send({ matchDatetime: '2099-01-01T17:00', venueId: venue.id })
        .expect(200);
      assert.equal(
        (
          (
            await post(`${base}/stages/${stage.id}/schedule/generate`, {
              legs: 1,
            }).expect(201)
          ).body as { createdMatches: number }
        ).createdMatches,
        0,
      );
      await post(`${base}/stages/${stage.id}/schedule/reset`, {}).expect(400);
      await post(
        `${base}/stages/${stage.id}/schedule/reset`,
        { confirmation: 'RESET_GROUP_STAGE_SCHEDULE' },
        captainToken,
      ).expect(403);
      await post(`${base}/stages/${stage.id}/schedule/reset`, {
        confirmation: 'RESET_GROUP_STAGE_SCHEDULE',
      }).expect(200);
      generated = (
        await post(`${base}/stages/${stage.id}/schedule/generate`, {
          legs: 1,
        }).expect(201)
      ).body as typeof generated;
      await post(`${reg}/open`, {}).expect(409);
      await post(`${base}/publish`, { ruleVersionId: version.id }).expect(400);
      for (let i = 0; i < generated.matches.length; i++)
        await request(server)
          .patch(`${base}/calendar-management/${generated.matches[i].id}`)
          .auth(adminToken, { type: 'bearer' })
          .send({ matchDatetime: `2099-01-01T${18 + i}:00`, venueId: venue.id })
          .expect(200);
      assert.equal(
        (
          (
            await request(server)
              .get(`/api/matches/tournament/${tournament.id}`)
              .expect(200)
          ).body as unknown[]
        ).length,
        0,
        'draft calendar is private',
      );
      const listed = (
        await request(server).get('/api/match-service/matches').expect(200)
      ).body as { id: number }[];
      assert(
        !listed.some((m) => generated.matches.some((g) => g.id === m.id)),
        'draft calendar cannot reach result entry',
      );
      const refereeRole =
        (await db.manager.findOneBy(RoleEntity, { code: RoleCode.Referee })) ??
        (await db.manager.save(RoleEntity, {
          code: RoleCode.Referee,
          name: 'Судья',
        }));
      const referee = await db.manager.save(UserEntity, {
        username: `workflow-ref-${suffix}`,
        firstName: 'Судья',
        lastName: 'Тест',
        roles: [refereeRole],
      });
      const refToken = jwt.sign({ sub: referee.id, av: 0 });
      await post(
        `/api/match-service/matches/${generated.matches[0].id}/start`,
        {},
        refToken,
      ).expect(400);
      assert.equal(
        (
          (
            await post(`${base}/validate`, { config, mode: 'launch' }).expect(
              200,
            )
          ).body as TournamentValidationResult
        ).valid,
        true,
      );
      await post(`${base}/publish`, { ruleVersionId: version.id }).expect(200);
      const calendar = (
        await request(server)
          .get(`/api/matches/tournament/${tournament.id}`)
          .expect(200)
      ).body as unknown[];
      assert.equal(
        calendar.length,
        2,
        'launch publishes the prepared calendar',
      );
      assert(
        (await db.manager.findBy(MatchEntity, { tournamentId: tournament.id }))
          .filter((m) => m.status !== MatchStatus.CANCELLED)
          .every((m) => m.effectiveRuleVersionId === version.id),
      );
      await post(`${base}/stages/${stage.id}/schedule/reset`, {
        confirmation: 'RESET_GROUP_STAGE_SCHEDULE',
      }).expect(409);
      console.log(
        'PASS: create without teams, configuration/launch validation split, open admission, return/resubmit/approve, prepare private calendar before launch, strict launch and effective rules',
      );
    } finally {
      await app.close();
    }
  } finally {
    await db.destroy();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
