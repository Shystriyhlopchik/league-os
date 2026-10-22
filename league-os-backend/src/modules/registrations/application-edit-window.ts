import { MatchEntity } from '../matches/entities/match.entity';
import { MatchRoundType } from '../matches/enums/match-round-type.enum';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { formatLocalDateTime } from '../matches/helper/formatLocalDateTime';

export const APPLICATION_LOCK_ROUND = 4;
export const APPLICATIONS_LOCKED_MESSAGE =
  'С начала 4-го тура изменение и утверждение заявок на турнир запрещено';

export interface ApplicationEditWindow {
  locked: boolean;
  locksAt: string | null;
  serverNow: string;
}

export function applicationEditWindow(
  matches: Pick<
    MatchEntity,
    'roundNumber' | 'roundType' | 'status' | 'matchDatetime'
  >[],
  now = new Date(),
): ApplicationEditWindow {
  const rounds = matches.filter(
    (m) =>
      (m.roundNumber ?? 0) >= APPLICATION_LOCK_ROUND &&
      (m.roundType === MatchRoundType.GROUP_ROUND ||
        m.roundType === MatchRoundType.ROUND_ROBIN) &&
      m.status !== MatchStatus.CANCELLED,
  );
  // matches.match_datetime stores wall-clock time, not UTC. The league calendar
  // uses Moscow time, including when the backend container itself runs in UTC.
  const dates = rounds.flatMap((m) => {
    const local = formatLocalDateTime(m.matchDatetime);
    return local ? [new Date(`${local}+03:00`).getTime()] : [];
  });
  const first = dates.length ? Math.min(...dates) : null;
  return {
    locked:
      rounds.some(
        (m) =>
          m.status === MatchStatus.LIVE || m.status === MatchStatus.FINISHED,
      ) ||
      (first !== null && first <= now.getTime()),
    locksAt: first !== null ? new Date(first).toISOString() : null,
    serverNow: now.toISOString(),
  };
}
