/** Integration fixture is confined to a disposable admissions_test database on 55439. */
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
import { UserEntity } from '../modules/users/entities/user.entity';
import { RoleEntity } from '../modules/roles/entities/role.entity';
import { RoleCode } from '../modules/users/enums/role-code.enum';
import { CompetitionEntity } from '../modules/competitions/entities/competitions.entity';
import { SeasonEntity } from '../modules/seasons/entities/season.entity';
import { TournamentEntity } from '../modules/tournaments/entities/tournaments.entity';
import { TournamentLifecycleStatus } from '../modules/tournaments/enums/tournament-lifecycle-status.enum';
import { TournamentStageEntity } from '../modules/tournament-stages/entities/tournament-stage.entity';
import { TournamentStageType } from '../modules/tournament-stages/enums/tournament-stage-type.enum';
import { TournamentGroupEntity } from '../modules/tournament-groups/entities/tournament-group.entity';
import { TournamentTeamEntity } from '../modules/tournament-teams/entities/tournament-teams.entity';
import { TournamentStageParticipantEntity } from '../modules/tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentRuleVersionEntity } from '../modules/tournament-rules/entities/tournament-rule-version.entity';
import { TournamentRuleVersionStatus } from '../modules/tournament-rules/enums/tournament-rule-version-status.enum';
import { createYardLeagueRules } from '../modules/tournaments/validation/yard-league-rules.fixture';
import { TournamentRulesConfigValidator } from '../modules/tournaments/validation/tournament-rules-config.validator';
import { TeamEntity } from '../modules/teams/entities/team.entity';
import { PlayerEntity } from '../modules/players/entities/player.entity';
import { TeamPlayerEntity } from '../modules/team-players/entities/team-players.entity';
import { StandingEntity } from '../modules/standings/entities/standing.entity';
import { MatchEntity } from '../modules/matches/entities/match.entity';
import { MatchStatus } from '../modules/matches/enums/match-status.enum';
import { MatchRosterEntity } from '../modules/match-rosters/entities/match-roster.entity';
import { MatchRosterPlayerEntity } from '../modules/match-rosters/entities/match-roster-player.entity';
import { MatchEventEntity } from '../modules/match-events/entities/match-event.entity';
import { MatchEventType } from '../modules/match-events/enums/match-event-type.enum';
import { VenueEntity } from '../modules/venues/entities/venue.entity';
import { CommunityEntity } from '../modules/communities/entities/community.entity';
import type { PenaltyShootoutScore } from '../modules/matches/match-result.resolver';
import type { PlayoffLaunchService } from '../modules/tournaments/playoff-launch.service';
import type { MatchServiceSessionDto } from '../modules/match-service/dto/match-service-session.dto';
import type { PublicTournamentView } from '../modules/standings/types/public-tournament-view.type';

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
    const role =
      (await db.manager.findOneBy(RoleEntity, { code: RoleCode.SuperAdmin })) ??
      (await db.manager.save(RoleEntity, {
        code: RoleCode.SuperAdmin,
        name: 'Test superadmin',
      }));
    const user = await db.manager.save(UserEntity, {
      username: `two-leg-${suffix}`,
      firstName: 'Тест',
      lastName: 'Сетки',
      roles: [role],
    });
    const competition = await db.manager.save(CompetitionEntity, {
      communityId: community.id,
      name: 'Кубок',
      slug: `two-leg-${suffix}`,
    });
    const season = await db.manager.save(SeasonEntity, {
      competitionId: competition.id,
      name: 'Сезон',
      slug: `two-leg-${suffix}`,
    });
    const tournament = await db.manager.save(TournamentEntity, {
      seasonId: season.id,
      name: 'Два матча',
      slug: `two-leg-${suffix}`,
      lifecycleStatus: TournamentLifecycleStatus.PUBLISHED,
    });
    const groupsStage = await db.manager.save(TournamentStageEntity, {
      tournamentId: tournament.id,
      key: 'groups',
      name: 'Группы',
      type: TournamentStageType.GROUP_STAGE,
      order: 1,
    });
    const playoff = await db.manager.save(TournamentStageEntity, {
      tournamentId: tournament.id,
      key: 'playoff',
      name: 'Плей-офф',
      type: TournamentStageType.KNOCKOUT,
      order: 2,
    });
    const config = createYardLeagueRules();
    const groupRules = config.stages[0];
    const knockout = config.stages[1];
    assert(groupRules.type === 'group_stage' && knockout.type === 'knockout');
    groupRules.groups = { count: 2, teamsPerGroup: 8 };
    groupRules.match.periodDurationMinutes = 15;
    knockout.bracket = {
      size: 8,
      quarterFinalLegs: 2,
      semiFinalLegs: 2,
      semiFinalPairing: 'cross',
      placementMatch: 'third_place',
      seeding: { type: 'manual' },
    };
    config.transitions[0].qualification = [
      { id: 'top-four', type: 'top_n_per_group', positions: [1, 2, 3, 4] },
    ];
    delete config.transitions[0].crossGroupComparison;
    assert.equal(
      new TournamentRulesConfigValidator().validate(config).valid,
      true,
    );
    const version = await db.manager.save(TournamentRuleVersionEntity, {
      tournamentId: tournament.id,
      version: 1,
      schemaVersion: 1,
      config,
      status: TournamentRuleVersionStatus.PUBLISHED,
    });
    await db.manager.update(TournamentEntity, tournament.id, {
      activeRuleVersionId: version.id,
    });
    const groupEntities = await db.manager.save(
      TournamentGroupEntity,
      ['А', 'Б'].map((name, i) => ({
        stageId: groupsStage.id,
        name,
        key: String(i),
        order: i + 1,
        capacity: 8,
      })),
    );
    const teamIds: number[] = [];
    const tournamentTeamIds: number[] = [];
    const squad = new Map<number, TeamPlayerEntity[]>();
    for (let i = 0; i < 16; i++) {
      const team = await db.manager.save(TeamEntity, {
        name: `Команда ${i + 1}`,
        slug: `two-leg-${suffix}-${i}`,
      });
      teamIds.push(team.id);
      const participation = await db.manager.save(TournamentTeamEntity, {
        tournamentId: tournament.id,
        teamId: team.id,
      });
      tournamentTeamIds.push(participation.id);
      const group = groupEntities[Math.floor(i / 8)];
      await db.manager.save(TournamentStageParticipantEntity, {
        stageId: groupsStage.id,
        tournamentTeamId: participation.id,
        groupId: group.id,
      });
      await db.manager.save(StandingEntity, {
        tournamentId: tournament.id,
        stageId: groupsStage.id,
        groupId: group.id,
        teamId: team.id,
        ruleVersionId: version.id,
        position: (i % 8) + 1,
        played: 7,
        wins: 7 - (i % 8),
        points: (7 - (i % 8)) * 3,
      });
      const links: TeamPlayerEntity[] = [];
      for (let p = 0; p < 5; p++) {
        const player = await db.manager.save(PlayerEntity, {
          firstName: `Игрок ${p}`,
          lastName: `Команда ${i}`,
          slug: `two-leg-${suffix}-${i}-${p}`,
          birthDate: '2000-01-01',
        });
        links.push(
          await db.manager.save(TeamPlayerEntity, {
            teamId: team.id,
            playerId: player.id,
            shirtNumber: p + 1,
            isCaptain: p === 0,
          }),
        );
      }
      squad.set(team.id, links);
    }
    for (let g = 0; g < 2; g++) {
      for (let a = 0; a < 8; a++)
        for (let b = a + 1; b < 8; b++) {
          await db.manager.save(MatchEntity, {
            tournamentId: tournament.id,
            stageId: groupsStage.id,
            groupId: groupEntities[g].id,
            homeTeamId: teamIds[g * 8 + a],
            awayTeamId: teamIds[g * 8 + b],
            status: MatchStatus.FINISHED,
            resultOfficialAt: new Date(),
            effectiveRuleVersionId: version.id,
          });
        }
    }
    const venue = await db.manager.save(VenueEntity, {
      name: 'Зал',
      slug: `two-leg-${suffix}`,
    });
    Object.assign(process.env, {
      POSTGRES_HOST: '127.0.0.1',
      POSTGRES_PORT: '55439',
      POSTGRES_USER: 'admissions_test',
      POSTGRES_PASSWORD: 'isolated_test_only',
      POSTGRES_DB: 'admissions_test',
      JWT_SECRET: 'two-leg-isolated-test',
      TOURNAMENT_BUILDER_ENABLED: 'true',
      MULTI_STAGE_PUBLIC_VIEW_ENABLED: 'true',
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
      const token = app.get(JwtService).sign({ sub: user.id, av: 0 });
      const launchUrl = `/api/tournaments/${tournament.id}/playoff-launch`;
      const before = await request(server)
        .get(launchUrl)
        .auth(token, { type: 'bearer' })
        .expect(200);
      const initialState = before.body as Awaited<
        ReturnType<PlayoffLaunchService['getState']>
      >;
      assert.equal(initialState.knockoutStage.expectedMatches.length, 14);
      assert.equal(initialState.knockoutStage.semiFinalPairing, 'cross');
      assert.deepEqual(initialState.knockoutStage.semiFinalSources, [
        { position: 'SF-1', home: 'QF-1', away: 'QF-3' },
        { position: 'SF-2', home: 'QF-2', away: 'QF-4' },
      ]);
      const pendingView = await request(server)
        .get(`/api/standings/tournaments/${tournament.id}/public-view`)
        .expect(200);
      const pending = (pendingView.body as PublicTournamentView).stages.find(
        (s) => s.id === playoff.id,
      )?.bracket.matches;
      assert.equal(
        pending?.find((m) => m.position === 'SF-1:L1')?.awaySourceLabel,
        'Победитель QF-3',
      );
      assert.equal(
        pending?.find((m) => m.position === 'SF-1:L2')?.homeSourceLabel,
        'Победитель QF-3',
      );
      const selected = [0, 1, 2, 3, 8, 9, 10, 11].map(
        (i) => tournamentTeamIds[i],
      );
      const pairs = [0, 1, 2, 3].map((i) => ({
        homeTournamentTeamId: tournamentTeamIds[i],
        awayTournamentTeamId: tournamentTeamIds[11 - i],
      }));
      const schedule = initialState.knockoutStage.expectedMatches.map(
        (m: { bracketPosition: string }, i: number) => ({
          bracketPosition: m.bracketPosition,
          venueId: venue.id,
          matchDatetime: `2026-12-${String(i + 1).padStart(2, '0')}T18:00`,
        }),
      );
      const badSchedule = schedule.map(
        (s: { bracketPosition: string; matchDatetime: string }) =>
          s.bracketPosition === 'QF-1:L2'
            ? { ...s, matchDatetime: '2026-11-30T18:00' }
            : s,
      );
      await request(server)
        .post(launchUrl)
        .auth(token, { type: 'bearer' })
        .send({
          selectedTournamentTeamIds: selected,
          manualPairs: pairs,
          schedule: badSchedule,
        })
        .expect(400);
      await request(server)
        .post(launchUrl)
        .auth(token, { type: 'bearer' })
        .send({
          selectedTournamentTeamIds: selected,
          manualPairs: pairs,
          schedule,
        })
        .expect(200);
      const getMatch = (position: string) =>
        db.manager.findOneByOrFail(MatchEntity, {
          tournamentId: tournament.id,
          stageId: playoff.id,
          bracketPosition: position,
        });
      assert.equal(
        await db.manager.countBy(MatchEntity, { stageId: playoff.id }),
        14,
      );
      const rosters = async (m: MatchEntity) => {
        for (const teamId of [m.homeTeamId, m.awayTeamId]) {
          const roster = await db.manager.save(MatchRosterEntity, {
            matchId: m.id,
            teamId,
            isSubmitted: true,
            isApproved: true,
          });
          for (const p of squad.get(teamId)!)
            await db.manager.save(MatchRosterPlayerEntity, {
              matchRosterId: roster.id,
              playerId: p.playerId,
              teamPlayerId: p.id,
              shirtNumber: p.shirtNumber,
              isCaptain: p.isCaptain,
            });
        }
      };
      const finish = async (
        position: string,
        home: number,
        away: number,
        penalties?: PenaltyShootoutScore,
        live = false,
      ) => {
        const m = await getMatch(position);
        await rosters(m);
        if (live) {
          assert.equal(home + away, 0);
          const base = `/api/match-service/matches/${m.id}`;
          const session = await request(server)
            .get(`${base}/session`)
            .auth(token, { type: 'bearer' })
            .expect(200);
          assert.equal(
            (session.body as MatchServiceSessionDto).match.knockoutTie?.leg,
            2,
          );
          await request(server)
            .post(`${base}/start`)
            .auth(token, { type: 'bearer' })
            .send({})
            .expect(201);
          await request(server)
            .post(`${base}/finish-half`)
            .auth(token, { type: 'bearer' })
            .send({})
            .expect(201);
          await request(server)
            .post(`${base}/start-second-half`)
            .auth(token, { type: 'bearer' })
            .send({})
            .expect(201);
          await request(server)
            .post(`${base}/finish`)
            .auth(token, { type: 'bearer' })
            .send({ penalties })
            .expect(201);
        } else {
          for (const [teamId, score] of [
            [m.homeTeamId, home],
            [m.awayTeamId, away],
          ]) {
            for (let i = 0; i < score; i++)
              await db.manager.save(MatchEventEntity, {
                matchId: m.id,
                teamId,
                playerId: squad.get(teamId)![0].playerId,
                eventType: MatchEventType.GOAL,
                minute: i + 1,
                half: 1,
              });
          }
          const url = `/api/match-service/matches/${m.id}/manual-protocol/sign`;
          if (penalties)
            await request(server)
              .post(url)
              .auth(token, { type: 'bearer' })
              .send({})
              .expect(400);
          await request(server)
            .post(url)
            .auth(token, { type: 'bearer' })
            .send(penalties ? { penalties } : {})
            .expect(201);
        }
        const stored = await getMatch(position);
        assert.equal(stored.homeScore, home);
        assert.equal(stored.awayScore, away);
        return stored;
      };
      await finish('QF-1:L1', 3, 0);
      assert.equal((await getMatch('SF-1:L1')).homeTeamId, null);
      const first = await getMatch('QF-1:L1');
      const returning = await finish('QF-1:L2', 2, 0);
      assert.equal(returning.winnerTeamId, returning.homeTeamId);
      assert.equal((await getMatch('SF-1:L1')).homeTeamId, first.homeTeamId);
      assert.equal((await getMatch('SF-1:L2')).awayTeamId, first.homeTeamId);
      await finish('QF-2:L1', 2, 0);
      await finish('QF-2:L2', 2, 0, {
        home: 4,
        away: 5,
        homeKicksTaken: 5,
        awayKicksTaken: 5,
      });
      const qf2 = await getMatch('QF-2:L1');
      assert.equal(
        (await getMatch('SF-1:L1')).awayTeamId,
        null,
        'QF-2 must not feed SF-1',
      );
      assert.equal((await getMatch('SF-2:L1')).homeTeamId, qf2.homeTeamId);
      assert.equal((await getMatch('SF-2:L2')).awayTeamId, qf2.homeTeamId);
      await finish('QF-3:L1', 1, 1);
      await finish('QF-3:L2', 0, 0, {
        home: 5,
        away: 4,
        homeKicksTaken: 5,
        awayKicksTaken: 5,
      });
      const qf3 = await getMatch('QF-3:L2');
      assert.equal((await getMatch('SF-1:L1')).awayTeamId, qf3.homeTeamId);
      assert.equal((await getMatch('SF-1:L2')).homeTeamId, qf3.homeTeamId);
      assert.equal(
        (await getMatch('SF-2:L1')).awayTeamId,
        null,
        'QF-3 must not feed SF-2',
      );
      await finish('QF-4:L1', 2, 1);
      await finish('QF-4:L2', 0, 1);
      const qf4 = await getMatch('QF-4:L1');
      assert.equal((await getMatch('SF-2:L1')).awayTeamId, qf4.homeTeamId);
      assert.equal((await getMatch('SF-2:L2')).homeTeamId, qf4.homeTeamId);
      await finish('SF-1:L1', 1, 1);
      await finish(
        'SF-1:L2',
        0,
        0,
        { home: 4, away: 5, homeKicksTaken: 5, awayKicksTaken: 5 },
        true,
      );
      await finish('SF-2:L1', 1, 0);
      await finish('SF-2:L2', 0, 0);
      await finish('THIRD_PLACE', 0, 2);
      await finish('FINAL', 1, 0);
      const publicView = await request(server)
        .get(`/api/standings/tournaments/${tournament.id}/public-view`)
        .expect(200);
      const publicStage = (publicView.body as PublicTournamentView).stages.find(
        (s) => s.id === playoff.id,
      );
      assert(publicStage);
      const bracket = publicStage.bracket.matches;
      assert.equal(bracket.length, 14);
      assert.equal(
        bracket.find((m) => m.position === 'SF-1:L1')?.awaySourceLabel,
        'Победитель QF-3',
      );
      assert.equal(
        bracket.find((m) => m.position === 'SF-2:L1')?.homeSourceLabel,
        'Победитель QF-2',
      );
      const summary = bracket.find(
        (m: { position: string }) => m.position === 'QF-1:L2',
      )?.tie;
      assert(summary);
      assert.equal(summary.home, 2);
      assert.equal(summary.away, 3);
      assert.equal(summary.winnerTeamId, first.homeTeamId);
      const calendar = await request(server)
        .get(`/api/tournaments/${tournament.id}/calendar-management`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      assert(calendar.body);
      console.log(
        'PASS: fresh migrations, eight qualifiers, 14 fixtures, 1–3 / 2–4 routes before and after publication, actual advancement into both semifinal legs, aggregate scores, penalties, live referee finish, final and bronze match',
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
