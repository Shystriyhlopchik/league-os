import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { MatchServiceService } from './match-service.service';
import { MatchCommandDto } from './dto/match-command.dto';
import { MatchEntity } from '../matches/entities/match.entity';
import { TeamEntity } from '../teams/entities/team.entity';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import { PlayerEntity } from '../players/entities/player.entity';
import { UserEntity } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { SeasonEntity } from '../seasons/entities/season.entity';
import { CompetitionEntity } from '../competitions/entities/competitions.entity';
import { CommunityEntity } from '../communities/entities/community.entity';
import { CommunityMemberEntity } from '../communities/entities/community-member.entity';
import { VenueEntity } from '../venues/entities/venue.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { TournamentMemberEntity } from '../tournament-members/entities/tournament-member.entity';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentGroupEntity } from '../tournament-groups/entities/tournament-group.entity';
import { TournamentStageParticipantEntity } from '../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { MatchRosterEntity } from '../match-rosters/entities/match-roster.entity';
import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import { MatchServiceSessionEntity } from './entities/match-service-session.entity';
import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { MatchRedBallActivationEntity } from './entities/match-red-ball-activation.entity';
import { PlayerSuspensionEntity } from '../player-suspensions/entities/player-suspension.entity';
import { PlayerSuspensionsService } from '../player-suspensions/player-suspensions.service';
import { DisciplineEngine } from '../player-suspensions/discipline.engine';
import { PlayerTournamentStatEntity } from '../player-tournament-stats/entities/player-tournament-stat.entity';
import { PlayerTournamentStatsService } from '../player-tournament-stats/player-tournament-stats.service';
import { KnockoutBracketService } from '../tournament-knockout-brackets/knockout-bracket.service';
import { KnockoutBracketEngine } from '../tournament-knockout-brackets/knockout-bracket.engine';
import { KnockoutBracketSnapshotEntity } from '../tournament-knockout-brackets/entities/knockout-bracket-snapshot.entity';
import { MatchResultResolver } from '../matches/match-result.resolver';
import { TournamentLifecycleService } from '../tournaments/tournament-lifecycle.service';
import { TournamentLifecycleStatus } from '../tournaments/enums/tournament-lifecycle-status.enum';
import { TournamentApplicationsService } from '../registrations/tournament-applications.service';
import { MatchRoundType } from '../matches/enums/match-round-type.enum';
import { MatchEventType } from '../match-events/enums/match-event-type.enum';

const url = process.env.MATCH_CONTINUITY_DB_URL;
const integration = url ? describe : describe.skip;
integration('Match continuity on disposable PostgreSQL', () => {
  let db: DataSource;
  let service: MatchServiceService;
  let lifecycle: TournamentLifecycleService;
  let tournament: TournamentEntity;
  let match: MatchEntity;
  let actor: UserEntity;
  let home: TeamEntity;
  let away: TeamEntity;
  let player: PlayerEntity;
  let venue: VenueEntity;

  beforeAll(async () => {
    const target = new URL(url!);
    if (
      target.hostname !== '127.0.0.1' ||
      target.port !== '5547' ||
      target.pathname !== '/league_os_continuity_check'
    )
      throw new Error(
        'Refusing to run destructive integration setup on a non-disposable database',
      );
    db = new DataSource({
      type: 'postgres',
      url,
      entities: ['src/modules/**/*.entity.ts'],
      migrations: ['src/database/migrations/*.ts'],
      synchronize: false,
    });
    await db.initialize();
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public'); // Only the explicitly validated disposable database.
    await db.runMigrations();
    const r = <T>(entity: new () => T) => db.getRepository(entity);
    const suspensions = new PlayerSuspensionsService(
      r(PlayerSuspensionEntity),
      r(MatchEntity),
      r(MatchEventEntity),
      r(TournamentStageEntity),
      r(TournamentEntity),
      r(TournamentRuleVersionEntity),
      new DisciplineEngine(),
    );
    const stats = new PlayerTournamentStatsService(
      r(PlayerTournamentStatEntity),
      suspensions,
    );
    lifecycle = new TournamentLifecycleService(
      r(TournamentEntity),
      r(TournamentMemberEntity),
      r(TournamentStageEntity),
      r(TournamentGroupEntity),
      r(TournamentStageParticipantEntity),
      r(TournamentRuleVersionEntity),
      r(TournamentTeamEntity),
      r(MatchEntity),
      r(UserEntity),
      db,
      {} as never,
      {} as never,
      r(SeasonEntity),
      r(CommunityMemberEntity),
    );
    service = new MatchServiceService(
      r(MatchEntity),
      r(TeamPlayerEntity),
      r(PlayerTournamentStatEntity),
      r(MatchRosterEntity),
      r(MatchRosterPlayerEntity),
      r(MatchServiceSessionEntity),
      r(MatchEventEntity),
      r(MatchRedBallActivationEntity),
      stats,
      suspensions,
      new UsersService(r(UserEntity)),
      lifecycle,
      new KnockoutBracketService(
        r(KnockoutBracketSnapshotEntity),
        db,
        new KnockoutBracketEngine(),
      ),
      new MatchResultResolver(),
      db,
      {} as never,
      {} as never,
    );
    actor = await r(UserEntity).save(
      r(UserEntity).create({
        username: 'Admin_CASE',
        email: 'MiXeD@example.org',
        firstName: 'Admin',
        lastName: 'Test',
      }),
    );
    const community = (await r(CommunityEntity).find())[0];
    const competition = await r(CompetitionEntity).save(
      r(CompetitionEntity).create({
        name: 'Check',
        slug: randomUUID(),
        communityId: community.id,
      }),
    );
    const season = await r(SeasonEntity).save(
      r(SeasonEntity).create({
        name: 'Check',
        slug: randomUUID(),
        competitionId: competition.id,
      }),
    );
    tournament = await r(TournamentEntity).save(
      r(TournamentEntity).create({
        name: 'Check',
        slug: randomUUID(),
        seasonId: season.id,
        lifecycleStatus: TournamentLifecycleStatus.IN_PROGRESS,
      }),
    );
    home = await r(TeamEntity).save(
      r(TeamEntity).create({ name: 'Home', slug: randomUUID() }),
    );
    away = await r(TeamEntity).save(
      r(TeamEntity).create({ name: 'Away', slug: randomUUID() }),
    );
    player = await r(PlayerEntity).save(
      r(PlayerEntity).create({
        firstName: 'Player',
        lastName: 'Test',
        slug: randomUUID(),
      }),
    );
    venue = await r(VenueEntity).save(
      r(VenueEntity).create({ name: 'Venue', slug: randomUUID() }),
    );
  }, 60000);

  beforeEach(async () => {
    match = await db.getRepository(MatchEntity).save(
      db.getRepository(MatchEntity).create({
        tournamentId: tournament.id,
        homeTeamId: home.id,
        awayTeamId: away.id,
        venueId: venue.id,
        matchDatetime: new Date('2027-01-10T18:00:00'),
      }),
    );
    for (const team of [home, away]) {
      const roster = await db
        .getRepository(MatchRosterEntity)
        .save(
          db
            .getRepository(MatchRosterEntity)
            .create({ matchId: match.id, teamId: team.id, isApproved: true }),
        );
      await db
        .getRepository(MatchRosterPlayerEntity)
        .save(
          db
            .getRepository(MatchRosterPlayerEntity)
            .create({ matchRosterId: roster.id, playerId: player.id }),
        );
    }
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  const command = (
    action: MatchCommandDto['action'],
    revision: number,
    extra: Partial<MatchCommandDto> = {},
  ): MatchCommandDto => ({
    id: randomUUID(),
    action,
    expectedRevision: revision,
    occurredAt: new Date(Date.now() - 10000).toISOString(),
    elapsedSeconds: 30,
    ...extra,
  });

  it('migrates and finds legacy usernames/emails without case or whitespace sensitivity', async () => {
    const users = new UsersService(db.getRepository(UserEntity));
    expect((await users.findByEmailOrUsername('  ADMIN_case '))?.id).toBe(
      actor.id,
    );
    expect((await users.findByEmailOrUsername(' MIXED@EXAMPLE.ORG '))?.id).toBe(
      actor.id,
    );
    expect(await users.findByEmailOrUsername('%')).toBeNull();
    await expect(
      db
        .getRepository(UserEntity)
        .save({ username: 'admin_case', firstName: 'x', lastName: 'x' }),
    ).rejects.toThrow();
  });

  it('lists editable calendars including legacy tournaments without registration', async () => {
    expect(
      (
        await lifecycle.managedCalendars({
          id: actor.id,
          roles: ['super_admin'],
        })
      ).map((t) => t.id),
    ).toContain(tournament.id);
    expect(
      await lifecycle.managedCalendars({ id: actor.id, roles: [] }),
    ).toEqual([]);
  });

  it('initializes application modules with the guarded command endpoint', async () => {
    const previous = { ...process.env };
    Object.assign(process.env, {
      POSTGRES_HOST: '127.0.0.1',
      POSTGRES_PORT: '5547',
      POSTGRES_USER: 'continuity_check',
      POSTGRES_PASSWORD: 'isolated_check_only',
      POSTGRES_DB: 'league_os_continuity_check',
      JWT_SECRET: 'disposable-integration-secret',
    });
    try {
      const { Test } =
        require('@nestjs/testing') as typeof import('@nestjs/testing');
      const { AppModule } =
        require('../../app.module') as typeof import('../../app.module');
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      try {
        await module.init();
        expect(module.get(MatchServiceService)).toBeDefined();
      } finally {
        await module.close();
      }
    } finally {
      for (const name of [
        'POSTGRES_HOST',
        'POSTGRES_PORT',
        'POSTGRES_USER',
        'POSTGRES_PASSWORD',
        'POSTGRES_DB',
        'JWT_SECRET',
      ]) {
        if (previous[name] === undefined) delete process.env[name];
        else process.env[name] = previous[name];
      }
    }
  }, 30000);

  it('replays the same accepted UUID without duplicating start or goals', async () => {
    const start = command('start', 0);
    const first = await service.command(match.id, start, actor.id);
    expect(first.data.session.revision).toBe(1);
    await expect(service.command(match.id, start, actor.id)).resolves.toEqual(
      JSON.parse(JSON.stringify(first)),
    );
    const goal = command('event', 1, {
      event: {
        eventType: MatchEventType.GOAL,
        teamId: home.id,
        playerId: player.id,
        second: 30,
        half: 1,
      },
    });
    await service.command(match.id, goal, actor.id);
    await service.command(match.id, goal, actor.id);
    expect((await service.getSession(match.id)).session.homeScore).toBe(1);
    expect(
      await db
        .getRepository(MatchEventEntity)
        .countBy({ matchId: match.id, eventType: MatchEventType.GOAL }),
    ).toBe(1);
  });

  it('serializes concurrent starts and rejects stale-device commands without changing state', async () => {
    const results = await Promise.allSettled([
      service.command(match.id, command('start', 0), actor.id),
      service.command(match.id, command('start', 0), actor.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(
      service.command(match.id, command('pause', 0), actor.id),
    ).rejects.toThrow('другого устройства');
    expect((await service.getSession(match.id)).session.status).toBe(
      'first_half',
    );
  });

  it('commits a delayed two-half journal, finish and signature, retaining the original match', async () => {
    for (const [i, action] of (
      ['start', 'finish-half', 'start-second-half', 'finish', 'sign'] as const
    ).entries())
      await service.command(
        match.id,
        command(action, i, { elapsedSeconds: 1200 }),
        actor.id,
      );
    const data = await service.getSession(match.id);
    expect(data.match.id).toBe(match.id);
    expect(data.match.status).toBe('finished');
    expect(data.session.status).toBe('protocol_signed');
    expect(data.session.revision).toBe(5);
  });

  it('rolls back a failed command, including its timer edits and receipt', async () => {
    const failed = command('finish', 0, { elapsedSeconds: 999 });
    await expect(service.command(match.id, failed, actor.id)).rejects.toThrow();
    expect((await service.getSession(match.id)).session.elapsedSeconds).toBe(0);
    expect(
      await db.query('SELECT id FROM match_service_commands WHERE id=$1', [
        failed.id,
      ]),
    ).toHaveLength(0);
  });

  it('recovers a long-running first-half session without resetting kickoff', async () => {
    await service.command(match.id, command('start', 0), actor.id);
    const recovered = await service.command(
      match.id,
      command('recover', 1, {
        reason: 'Game played; lost connection',
        elapsedSeconds: 1200,
      }),
      actor.id,
    );
    expect(recovered.data.session.status).toBe('paused');
    expect(recovered.data.session.currentHalf).toBe(2);
    await service.command(
      match.id,
      command('finish', 2, { elapsedSeconds: 1200 }),
      actor.id,
    );
    expect((await service.getSession(match.id)).match.status).toBe('finished');
  });

  it('postpones without deleting fixtures/players and requires a fresh schedule revision', async () => {
    await lifecycle.updateCalendarMatch(
      tournament.id,
      match.id,
      { postponed: true, reason: 'Weather', expectedRevision: 0 },
      actor.id,
    );
    const postponed = await db
      .getRepository(MatchEntity)
      .findOneByOrFail({ id: match.id });
    expect(postponed.matchDatetime).toBeNull();
    expect(postponed.postponedAt).not.toBeNull();
    expect(postponed.scheduleHistory[0].actorId).toBe(actor.id);
    expect(
      await db
        .getRepository(MatchRosterPlayerEntity)
        .count({ where: { matchRoster: { matchId: match.id } } }),
    ).toBe(2);
    expect(
      await db
        .getRepository(MatchRosterEntity)
        .countBy({ matchId: match.id, isApproved: true }),
    ).toBe(0);
    await expect(
      lifecycle.updateCalendarMatch(
        tournament.id,
        match.id,
        { postponed: true, reason: 'Again', expectedRevision: 0 },
        actor.id,
      ),
    ).rejects.toThrow('другим организатором');
    await lifecycle.updateCalendarMatch(
      tournament.id,
      match.id,
      {
        matchDatetime: '2027-02-01T19:00',
        venueId: venue.id,
        expectedRevision: 1,
        reason: 'Agreed',
      },
      actor.id,
    );
    expect(
      (await db.getRepository(MatchEntity).findOneByOrFail({ id: match.id }))
        .postponedAt,
    ).toBeNull();
  });

  it('blocks overlapping venue/team slots and never reopens the reached fourth-round cutoff', async () => {
    await db
      .getRepository(TournamentEntity)
      .update(tournament.id, { registrationRequired: true });
    await db.getRepository(MatchEntity).update(match.id, {
      roundType: MatchRoundType.GROUP_ROUND,
      roundNumber: 4,
      matchDatetime: new Date('2020-01-01T18:00:00'),
    });
    await expect(
      lifecycle.updateCalendarMatch(
        tournament.id,
        match.id,
        {
          matchDatetime: '2027-01-10T18:15',
          venueId: venue.id,
          expectedRevision: 0,
          reason: 'Move',
        },
        actor.id,
      ),
    ).rejects.toThrow('Пересечение');
    await lifecycle.updateCalendarMatch(
      tournament.id,
      match.id,
      { postponed: true, expectedRevision: 0, reason: 'Weather' },
      actor.id,
    );
    const saved = await db
      .getRepository(TournamentEntity)
      .findOneByOrFail({ id: tournament.id });
    expect(saved.applicationsLockedAt).not.toBeNull();
    const applications = new TournamentApplicationsService(
      db,
      {} as never,
      {} as never,
    );
    expect((await applications.editWindow(saved)).locked).toBe(true);
    await db
      .getRepository(TournamentEntity)
      .update(tournament.id, { registrationRequired: false });
  });
});
