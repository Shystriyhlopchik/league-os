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
import { StandingsService } from '../standings/standings.service';
import { StandingEntity } from '../standings/entities/standing.entity';
import { RuleDrivenStandingsEngine } from '../standings/rule-driven-standings.engine';
import { QualificationSnapshotEntity } from '../tournament-qualifications/entities/qualification-snapshot.entity';
import { TournamentStageType } from '../tournament-stages/enums/tournament-stage-type.enum';
import { TournamentRuleVersionStatus } from '../tournament-rules/enums/tournament-rule-version-status.enum';
import { MatchResolutionType } from '../matches/enums/match-resolution-type.enum';
import { createYardLeagueRules } from '../tournaments/validation/yard-league-rules.fixture';

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
      new StandingsService(r(StandingEntity), r(MatchEntity), r(TournamentStageEntity),
        r(TournamentGroupEntity), r(TournamentStageParticipantEntity), r(TournamentTeamEntity),
        r(TournamentEntity), r(TournamentRuleVersionEntity), r(QualificationSnapshotEntity),
        r(KnockoutBracketSnapshotEntity), db, new RuleDrivenStandingsEngine()),
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

  const tableService = () => (service as any).standingsService as StandingsService;
  const groupFixture = async () => {
    const t = await db.getRepository(TournamentEntity).save({ name: 'Auto standings', slug: randomUUID(),
      seasonId: tournament.seasonId, lifecycleStatus: TournamentLifecycleStatus.IN_PROGRESS });
    const stage = await db.getRepository(TournamentStageEntity).save({ tournamentId: t.id, key: 'groups',
      name: 'Группы', type: TournamentStageType.GROUP_STAGE, order: 1 });
    const group = await db.getRepository(TournamentGroupEntity).save({ stageId: stage.id, key: 'a', name: 'A', order: 1 });
    const config = createYardLeagueRules();
    const version = await db.getRepository(TournamentRuleVersionEntity).save({ tournamentId: t.id,
      version: 1, schemaVersion: 1, status: TournamentRuleVersionStatus.PUBLISHED, config });
    await db.getRepository(TournamentEntity).update(t.id, { activeRuleVersionId: version.id });
    for (const [index, team] of [home, away].entries()) {
      const tt = await db.getRepository(TournamentTeamEntity).save({ tournamentId: t.id, teamId: team.id });
      await db.getRepository(TournamentStageParticipantEntity).save({ stageId: stage.id, groupId: group.id,
        tournamentTeamId: tt.id, seedNumber: index + 1 });
    }
    Object.assign(match, { tournamentId: t.id, stageId: stage.id, groupId: group.id,
      effectiveRuleVersionId: version.id, roundType: MatchRoundType.GROUP_ROUND, roundNumber: 1 });
    await db.getRepository(MatchEntity).save(match);
    const rows = () => db.getRepository(StandingEntity).find({ where: { stageId: stage.id, groupId: group.id }, order: { position: 'ASC' } });
    return { tournament: t, stage, group, version, rows };
  };
  const finishOnline = async (id = match.id, goal = true) => {
    let revision = 0;
    await service.command(id, command('start', revision++), actor.id);
    if (goal) await service.command(id, command('event', revision++, { event: {
      eventType: MatchEventType.GOAL, teamId: home.id, playerId: player.id, half: 1, second: 30, minute: 1,
    } }), actor.id);
    await service.command(id, command('finish-half', revision++), actor.id);
    await service.command(id, command('start-second-half', revision++), actor.id);
    await service.command(id, command('finish', revision++), actor.id);
    return revision;
  };

  it('updates group standings only after online signature; duplicate signatures do not double points', async () => {
    const context = await groupFixture();
    const revision = await finishOnline();
    expect(await context.rows()).toHaveLength(0);
    await tableService().recalculateByTournament(context.tournament.id);
    expect((await context.rows()).every((r) => r.played === 0 && r.points === 0)).toBe(true);
    const signed = command('sign', revision);
    await service.command(match.id, signed, actor.id);
    expect(await context.rows()).toEqual(expect.arrayContaining([
      expect.objectContaining({ teamId: home.id, played: 1, wins: 1, points: 3, goalsFor: 1 }),
      expect.objectContaining({ teamId: away.id, played: 1, losses: 1, points: 0 }),
    ]));
    await service.command(match.id, signed, actor.id);
    expect((await context.rows()).find((r) => r.teamId === home.id)?.points).toBe(3);
  });

  it('rebuilds points after a goal correction and cancellation, keeping the signed session score in sync', async () => {
    const context = await groupFixture();
    await service.command(match.id, command('sign', await finishOnline()), actor.id);
    const added = await service.createFinishedMatchEvent(match.id, { eventType: MatchEventType.GOAL,
      teamId: away.id, playerId: player.id, minute: 10, half: 2 });
    expect((await context.rows()).every((r) => r.points === 1 && r.draws === 1 && r.played === 1)).toBe(true);
    expect((await service.getSession(match.id)).session.awayScore).toBe(1);
    await service.cancelFinishedMatchEvent(match.id, added.id);
    expect((await context.rows()).find((r) => r.teamId === home.id)?.points).toBe(3);
    expect((await service.getSession(match.id)).session.awayScore).toBe(0);
    await expect(service.cancelFinishedMatchEvent(match.id, added.id)).rejects.toThrow();
    expect((await context.rows()).find((r) => r.teamId === home.id)?.played).toBe(1);
  });

  it('recalculates disciplinary tie-breaks when a card is added or cancelled', async () => {
    const context = await groupFixture();
    await service.command(match.id, command('sign', await finishOnline()), actor.id);
    const card = await service.createFinishedMatchEvent(match.id, { eventType: MatchEventType.YELLOW_CARD,
      teamId: home.id, playerId: player.id, minute: 10, half: 2 });
    expect((await context.rows()).find((r) => r.teamId === home.id)?.disciplinaryScore).toBeGreaterThan(0);
    await service.cancelFinishedMatchEvent(match.id, card.id);
    expect((await context.rows()).find((r) => r.teamId === home.id)?.disciplinaryScore).toBe(0);
    expect((await db.getRepository(PlayerTournamentStatEntity).findOneByOrFail({ tournamentId: context.tournament.id,
      teamId: home.id, playerId: player.id })).yellowCards).toBe(0);
  });

  it('rolls back the signature and receipt if standings calculation fails, then safely retries', async () => {
    const context = await groupFixture();
    const revision = await finishOnline();
    const signed = command('sign', revision);
    const failure = jest.spyOn(tableService(), 'refreshForMatch').mockRejectedValueOnce(new Error('Injected table failure'));
    await expect(service.command(match.id, signed, actor.id)).rejects.toThrow('Injected table failure');
    failure.mockRestore();
    const session = (await service.getSession(match.id)).session;
    expect(session.status).toBe('finished');
    expect(session.revision).toBe(revision);
    expect(await db.getRepository(MatchEventEntity).countBy({ matchId: match.id, eventType: MatchEventType.PROTOCOL_SIGNED })).toBe(0);
    expect(await db.query('SELECT id FROM match_service_commands WHERE id=$1', [signed.id])).toHaveLength(0);
    expect(await context.rows()).toHaveLength(0);
    await service.command(match.id, signed, actor.id);
    expect((await context.rows()).find((r) => r.teamId === home.id)?.points).toBe(3);
  });

  it('rolls back a correction and its player discipline when table recalculation fails', async () => {
    const context = await groupFixture();
    await service.command(match.id, command('sign', await finishOnline()), actor.id);
    const failure = jest.spyOn(tableService(), 'refreshForMatch').mockRejectedValueOnce(new Error('Injected table failure'));
    await expect(service.createFinishedMatchEvent(match.id, { eventType: MatchEventType.YELLOW_CARD,
      teamId: home.id, playerId: player.id, minute: 10, half: 2 })).rejects.toThrow('Injected table failure');
    failure.mockRestore();
    expect(await db.getRepository(MatchEventEntity).countBy({ matchId: match.id, eventType: MatchEventType.YELLOW_CARD })).toBe(0);
    const stat = await db.getRepository(PlayerTournamentStatEntity).findOneBy({ tournamentId: context.tournament.id, teamId: home.id, playerId: player.id });
    expect(stat?.yellowCards ?? 0).toBe(0);
    expect((await context.rows()).find((r) => r.teamId === home.id)?.disciplinaryScore).toBe(0);
  });

  it('publishes a manual technical result immediately and prevents ordinary score corrections to it', async () => {
    const context = await groupFixture();
    await service.getSession(match.id); // An unused or reset online session must not hide a manual result.
    await service.signManualProtocol(match.id, { resolutionType: MatchResolutionType.TECHNICAL,
      winnerTeamId: home.id, technicalResultReason: 'Неявка соперника' });
    expect((await context.rows()).find((r) => r.teamId === home.id)).toMatchObject({ points: 3, goalsFor: 5, played: 1 });
    await expect(service.createFinishedMatchEvent(match.id, { eventType: MatchEventType.GOAL,
      teamId: away.id, playerId: player.id, half: 1, minute: 1 })).rejects.toThrow();
    expect((await context.rows()).find((r) => r.teamId === home.id)?.points).toBe(3);
  });

  it('serializes simultaneous signatures for the same group without losing either result', async () => {
    const context = await groupFixture();
    const second = await db.getRepository(MatchEntity).save({ tournamentId: context.tournament.id,
      stageId: context.stage.id, groupId: context.group.id, effectiveRuleVersionId: context.version.id,
      roundType: MatchRoundType.GROUP_ROUND, roundNumber: 2, homeTeamId: home.id, awayTeamId: away.id,
      venueId: venue.id, matchDatetime: new Date('2027-01-11T18:00:00') });
    for (const team of [home, away]) {
      const roster = await db.getRepository(MatchRosterEntity).save({ matchId: second.id, teamId: team.id, isApproved: true });
      await db.getRepository(MatchRosterPlayerEntity).save({ matchRosterId: roster.id, playerId: player.id });
    }
    const revision = await finishOnline();
    const secondRevision = await finishOnline(second.id);
    await Promise.all([service.command(match.id, command('sign', revision), actor.id),
      service.command(second.id, command('sign', secondRevision), actor.id)]);
    expect((await context.rows()).find((r) => r.teamId === home.id)).toMatchObject({ played: 2, wins: 2, points: 6 });
  });

  it('signs a regular manually entered protocol, counts own goals, and deduplicates event retries', async () => {
    const context = await groupFixture();
    const community = (await db.getRepository(CommunityEntity).find())[0];
    if (!await db.getRepository(TeamPlayerEntity).findOneBy({ playerId: player.id, teamId: home.id }))
      await db.getRepository(TeamPlayerEntity).save({ communityId: community.id, teamId: home.id, playerId: player.id });
    const rosters = await db.getRepository(MatchRosterEntity).findBy({ matchId: match.id });
    for (const roster of rosters) {
      await db.getRepository(MatchRosterEntity).update(roster.id, { isSubmitted: true });
      for (let i = 0; i < 4; i++) {
        const p = await db.getRepository(PlayerEntity).save({ firstName: 'Extra', lastName: randomUUID(), slug: randomUUID() });
        await db.getRepository(MatchRosterPlayerEntity).save({ matchRosterId: roster.id, playerId: p.id });
      }
    }
    const dto = { clientEventId: randomUUID(), eventType: MatchEventType.GOAL, teamId: home.id,
      playerId: player.id, minute: 10, half: 1 };
    const goal = await service.createManualEvent(match.id, dto);
    expect((await service.createManualEvent(match.id, dto)).id).toBe(goal.id);
    await service.createManualEvent(match.id, { ...dto, clientEventId: randomUUID(), eventType: MatchEventType.OWN_GOAL, half: 2 });
    expect(await context.rows()).toHaveLength(0);
    await service.signManualProtocol(match.id);
    expect((await context.rows()).every((r) => r.played === 1 && r.draws === 1 && r.points === 1)).toBe(true);
    await expect(service.signManualProtocol(match.id)).rejects.toThrow('подписан');
    expect((await context.rows()).every((r) => r.played === 1)).toBe(true);
  });

  it('deduplicates a finished-match goal retry without doubling the corrected score or points', async () => {
    const context = await groupFixture();
    await service.command(match.id, command('sign', await finishOnline()), actor.id);
    const dto = { clientEventId: randomUUID(), eventType: MatchEventType.GOAL,
      teamId: away.id, playerId: player.id, minute: 10, half: 2 };
    const first = await service.createFinishedMatchEvent(match.id, dto);
    expect((await service.createFinishedMatchEvent(match.id, dto)).id).toBe(first.id);
    expect((await context.rows()).every((r) => r.played === 1 && r.points === 1)).toBe(true);
    expect((await service.getSession(match.id)).session.awayScore).toBe(1);
    await expect(service.createFinishedMatchEvent(match.id, { ...dto, minute: 11 })).rejects.toThrow('Идентификатор');
  });

  it('rolls back a manual signature including its official result if the table cannot be saved', async () => {
    const context = await groupFixture();
    const failure = jest.spyOn(tableService(), 'refreshForMatch').mockRejectedValueOnce(new Error('Injected table failure'));
    await expect(service.signManualProtocol(match.id, { resolutionType: MatchResolutionType.TECHNICAL,
      winnerTeamId: home.id, technicalResultReason: 'Неявка' })).rejects.toThrow('Injected table failure');
    failure.mockRestore();
    const stored = await db.getRepository(MatchEntity).findOneByOrFail({ id: match.id });
    expect(stored.status).toBe('scheduled');
    expect(stored.resultOfficialAt).toBeNull();
    expect(stored.homeScore).toBe(0);
    expect(await context.rows()).toHaveLength(0);
  });

  it('updates only the affected group and preserves existing manual tie-break ranks', async () => {
    const context = await groupFixture();
    const otherGroup = await db.getRepository(TournamentGroupEntity).save({ stageId: context.stage.id, key: 'b', name: 'B', order: 2 });
    const other = await db.getRepository(StandingEntity).save({ tournamentId: context.tournament.id,
      stageId: context.stage.id, groupId: otherGroup.id, ruleVersionId: context.version.id,
      teamId: home.id, played: 3, points: 9, position: 1 });
    await tableService().recalculateByTournament(context.tournament.id);
    // Recreate the isolated table after an explicit full rebuild, then the automatic hook must leave it alone.
    await db.getRepository(StandingEntity).save({ ...other, id: undefined });
    await db.getRepository(StandingEntity).update({ stageId: context.stage.id, groupId: context.group.id, teamId: home.id }, { manualDecisionRank: 7 });
    await service.command(match.id, command('sign', await finishOnline()), actor.id);
    expect((await context.rows()).find((r) => r.teamId === home.id)?.manualDecisionRank).toBe(7);
    expect(await db.getRepository(StandingEntity).findOneBy({ stageId: context.stage.id, groupId: otherGroup.id, teamId: home.id }))
      .toMatchObject({ played: 3, points: 9 });
  });

  it('does not mix playoff matches into the group table', async () => {
    const context = await groupFixture();
    await tableService().recalculateByTournament(context.tournament.id);
    const playoff = await db.getRepository(TournamentStageEntity).save({ tournamentId: context.tournament.id,
      key: 'playoff', name: 'Плей-офф', order: 2, type: TournamentStageType.KNOCKOUT });
    await db.getRepository(MatchEntity).update(match.id, { stageId: playoff.id, groupId: null as any,
      roundType: MatchRoundType.SEMI_FINAL });
    await service.command(match.id, command('sign', await finishOnline()), actor.id);
    expect((await context.rows()).every((r) => r.played === 0 && r.points === 0)).toBe(true);
    expect(await db.getRepository(StandingEntity).countBy({ stageId: playoff.id })).toBe(0);
  });

  it('automatically maintains legacy standings without tournament stages', async () => {
    const t = await db.getRepository(TournamentEntity).save({ name: 'Legacy table', slug: randomUUID(),
      seasonId: tournament.seasonId, lifecycleStatus: TournamentLifecycleStatus.IN_PROGRESS });
    for (const team of [home, away]) await db.getRepository(TournamentTeamEntity).save({ tournamentId: t.id, teamId: team.id });
    await db.getRepository(MatchEntity).update(match.id, { tournamentId: t.id });
    await service.command(match.id, command('sign', await finishOnline()), actor.id);
    const rows = await db.getRepository(StandingEntity).findBy({ tournamentId: t.id });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.teamId === home.id)).toMatchObject({ played: 1, wins: 1, points: 3 });
  });

  it('rebuilds every affected table when a newly published rule version changes scoring', async () => {
    const context = await groupFixture();
    const otherGroup = await db.getRepository(TournamentGroupEntity).save({ stageId: context.stage.id, key: 'b', name: 'B', order: 2 });
    for (let i = 0; i < 2; i++) {
      const team = await db.getRepository(TeamEntity).save({ name: 'Other', slug: randomUUID() });
      const tt = await db.getRepository(TournamentTeamEntity).save({ tournamentId: context.tournament.id, teamId: team.id });
      await db.getRepository(TournamentStageParticipantEntity).save({ stageId: context.stage.id, groupId: otherGroup.id,
        tournamentTeamId: tt.id, seedNumber: i + 1 });
    }
    await tableService().recalculateByTournament(context.tournament.id);
    const config = createYardLeagueRules();
    if (config.stages[0].type !== 'knockout') config.stages[0].scoring.win = 5;
    const version = await db.getRepository(TournamentRuleVersionEntity).save({ tournamentId: context.tournament.id,
      version: 2, schemaVersion: 1, status: TournamentRuleVersionStatus.PUBLISHED, config });
    await db.getRepository(TournamentEntity).update(context.tournament.id, { activeRuleVersionId: version.id });
    await service.command(match.id, command('sign', await finishOnline()), actor.id);
    const all = await db.getRepository(StandingEntity).findBy({ tournamentId: context.tournament.id });
    expect(all).toHaveLength(4);
    expect(all.every((r) => r.ruleVersionId === version.id)).toBe(true);
    expect(all.find((r) => r.teamId === home.id)?.points).toBe(5);
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
