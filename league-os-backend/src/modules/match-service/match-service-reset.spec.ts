import { randomUUID } from 'crypto';
import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchServiceService } from './match-service.service';
import { MatchServiceSessionEntity } from './entities/match-service-session.entity';
import { MatchCommandDto } from './dto/match-command.dto';

describe('Reset empty match service', () => {
  let match: any;
  let session: any;
  let manager: any;
  let service: MatchServiceService;
  let receipts: Map<string, any>;
  const reset = (): MatchCommandDto => ({ id: randomUUID(), action: 'reset', expectedRevision: 3,
    occurredAt: new Date().toISOString(), elapsedSeconds: 0, reason: 'Запущен по ошибке, протокол будет внесён вручную' });
  beforeEach(() => {
    match = { id: 9, tournamentId: 2, status: 'live', homeScore: 0, awayScore: 0,
      matchDatetime: new Date('2026-11-10T12:00:00Z'), venueId: 4 };
    session = { id: 7, matchId: 9, revision: 3, status: 'first_half', previousStatus: null,
      currentHalf: 1, elapsedSeconds: 172800, startedAt: new Date('2026-11-10T12:00:00Z'),
      homeScore: 0, awayScore: 0 };
    receipts = new Map();
    manager = {
      findOne: jest.fn().mockResolvedValue(match),
      exists: jest.fn().mockResolvedValue(false),
      save: jest.fn(async (value) => value), update: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn(async () => { session.revision++; }),
      query: jest.fn(async (sql, args) => {
        if (sql.startsWith('SELECT')) return receipts.has(args[0]) ? [receipts.get(args[0])] : [];
        receipts.set(args[0], { match_id: args[1], actor_id: args[2], request_hash: args[3], response: JSON.parse(args[4]) });
        return [];
      }),
    };
    const scoped = Object.assign(Object.create(MatchServiceService.prototype), {
      transactionManager: manager,
      getOrCreateSession: async () => session,
      getSession: async () => ({ match, session }),
    });
    service = Object.assign(Object.create(MatchServiceService.prototype), {
      dataSource: { transaction: async (fn: any) => fn(manager) }, inTransaction: () => scoped,
      standingsService: { lockTournament: jest.fn() },
    });
  });
  it('stops the clock and returns the same match to scheduled without changing rosters or tournament', async () => {
    const date = match.matchDatetime;
    const response = await service.command(9, reset(), 42);
    expect(match.status).toBe('scheduled');
    expect(match.matchDatetime).toBe(date);
    expect(match.venueId).toBe(4);
    expect(session).toMatchObject({ id: 7, revision: 4, status: 'not_started', currentHalf: 1,
      elapsedSeconds: 0, startedAt: null, pausedAt: null, finishedAt: null, previousStatus: null });
    expect(manager.update).toHaveBeenCalledWith(MatchEventEntity,
      { matchId: 9, isCancelled: false }, { isCancelled: true });
    expect(manager.save.mock.calls.map(([value]: any[]) => value)).toEqual([session, match]);
    expect(response.resetAudit).toMatchObject({ actorId: 42, previousElapsedSeconds: 172800,
      reason: expect.stringContaining('вручную') });
    expect(manager.increment).toHaveBeenCalledWith(MatchServiceSessionEntity, { matchId: 9 }, 'revision', 1);
  });
  it('returns the same receipt for a retry after a lost response without resetting again', async () => {
    const command = reset();
    const first = await service.command(9, command, 42);
    const retried = await service.command(9, command, 42);
    expect(retried).toEqual(JSON.parse(JSON.stringify(first)));
    expect(manager.increment).toHaveBeenCalledTimes(1);
  });
  it.each(['finished', 'cancelled', 'scheduled'])('refuses a %s match', async (status) => {
    match.status = status;
    await expect(service.command(9, reset(), 42)).rejects.toThrow();
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('rejects signed protocols even if the match status is inconsistent', async () => {
    session.status = 'protocol_signed';
    await expect(service.command(9, reset(), 42)).rejects.toThrow('подписан');
    expect(manager.save).not.toHaveBeenCalled();
  });
  it.each(['homeScore', 'regularTimeHomeScore', 'resultOfficialAt', 'winnerTeamId', 'resolutionType'])(
    'rejects existing result field %s', async (field) => {
      match[field] = field === 'regularTimeHomeScore' ? 0 : 1;
      await expect(service.command(9, reset(), 42)).rejects.toThrow('результат');
      expect(manager.save).not.toHaveBeenCalled();
    },
  );
  it('rejects any game event, including cancelled ones, without erasing it', async () => {
    manager.exists.mockImplementation(async (entity: any) => entity === MatchEventEntity);
    await expect(service.command(9, reset(), 42)).rejects.toThrow('игровые события');
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('rejects red-ball activations even without a game event', async () => {
    manager.exists.mockImplementation(async (entity: any) => entity !== MatchEventEntity);
    await expect(service.command(9, reset(), 42)).rejects.toThrow('игровые события');
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('checks reason, zero time and the current revision', async () => {
    await expect(service.command(9, { ...reset(), reason: ' ' }, 42)).rejects.toThrow('причину');
    await expect(service.command(9, { ...reset(), elapsedSeconds: 100 }, 42)).rejects.toThrow('нулю');
    await expect(service.command(9, { ...reset(), expectedRevision: 2 }, 42)).rejects.toThrow('другого устройства');
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('rejects an old device after reset instead of accepting abandoned events', async () => {
    await service.command(9, reset(), 42);
    await expect(service.command(9, { ...reset(), id: randomUUID(), action: 'pause' }, 42))
      .rejects.toThrow('другого устройства');
  });
});
