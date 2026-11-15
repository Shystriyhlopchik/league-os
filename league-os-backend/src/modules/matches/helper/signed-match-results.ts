import { In, type EntityManager } from 'typeorm';
import type { MatchEntity } from '../entities/match.entity';
import { MatchStatus } from '../enums/match-status.enum';
import { MatchServiceSessionEntity } from '../../match-service/entities/match-service-session.entity';
import { MatchServiceStatus } from '../../match-service/enums/match-service-status.enum';

/** FINISHED is provisional in live service until the referee signs. Manual and
 * legacy results have no live session (or a NOT_STARTED session after reset). */
export async function signedMatchResults<T extends Pick<MatchEntity, 'id' | 'status'>>(
  manager: EntityManager,
  matches: T[],
): Promise<T[]> {
  const finished = matches.filter((match) => match.status === MatchStatus.FINISHED);
  if (!finished.length) return [];
  const sessions = await manager.getRepository(MatchServiceSessionEntity).find({
    where: { matchId: In(finished.map((match) => match.id)) },
    select: { matchId: true, status: true },
  });
  const unsigned = new Set(sessions.filter((s) =>
    s.status !== MatchServiceStatus.PROTOCOL_SIGNED && s.status !== MatchServiceStatus.NOT_STARTED,
  ).map((s) => s.matchId));
  return finished.filter((match) => !unsigned.has(match.id));
}
