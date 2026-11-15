import { randomUUID } from 'crypto';
import { validateSync } from 'class-validator';
import { MatchCommandDto } from './dto/match-command.dto';
import { MatchServiceService } from './match-service.service';

describe('Stale match clock recovery', () => {
  it('keeps the limit and returns recovery instructions instead of an English validation error', () => {
    const dto = Object.assign(new MatchCommandDto(), { id: randomUUID(), action: 'start-recording',
      expectedRevision: 1, occurredAt: new Date().toISOString(), elapsedSeconds: 172800 });
    const error = validateSync(dto).find((e) => e.property === 'elapsedSeconds');
    expect(error?.constraints?.max).toContain('Восстановление после сбоя');
    expect(error?.constraints?.max).toContain('24 часа');
    dto.elapsedSeconds = 1200;
    dto.action = 'recover';
    dto.reason = 'Связь отсутствовала';
    expect(validateSync(dto)).toEqual([]);
  });

  it('replaces a stale clock with explicit playing time, preserving score and kickoff', async () => {
    const kickoff = new Date('2026-11-10T12:00:00Z');
    const match = { id: 9, status: 'live', startedAt: kickoff };
    const session = { revision: 3, elapsedSeconds: 172800, currentHalf: 1,
      status: 'first_half', startedAt: kickoff, homeScore: 2, awayScore: 1 };
    const manager = {
      findOne: jest.fn().mockResolvedValue(match), query: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (value) => value), increment: jest.fn().mockResolvedValue(undefined),
    };
    const scoped = { getOrCreateSession: jest.fn().mockResolvedValue(session),
      createSystemEvent: jest.fn().mockResolvedValue(undefined),
      getSession: jest.fn(async () => ({ match, session })) };
    const service: MatchServiceService = Object.assign(Object.create(MatchServiceService.prototype), {
      dataSource: { transaction: async (fn: any) => fn(manager) },
      inTransaction: () => scoped,
      standingsService: { lockTournament: jest.fn() },
    });
    await service.command(9, { id: randomUUID(), action: 'recover', expectedRevision: 3,
      elapsedSeconds: 1200, occurredAt: new Date().toISOString(), reason: 'Матч сыгран, связь отсутствовала' }, 7);
    expect(session.elapsedSeconds).toBe(1200);
    expect(session.status).toBe('paused');
    expect(session.startedAt).toBeNull();
    expect(session.currentHalf).toBe(2);
    expect([session.homeScore, session.awayScore]).toEqual([2, 1]);
    expect(match.startedAt).toEqual(kickoff);
    expect(scoped.createSystemEvent).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining('Восстановление организатором #7'),
    }));
  });
});
