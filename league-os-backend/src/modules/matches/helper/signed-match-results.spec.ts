import { signedMatchResults } from './signed-match-results';
import { MatchStatus } from '../enums/match-status.enum';
import { MatchServiceStatus } from '../../match-service/enums/match-service-status.enum';

describe('Signed result selection', () => {
  it('excludes unsigned online results while preserving signed, manual, reset and historical results', async () => {
    const sessions = [
      { matchId: 1, status: MatchServiceStatus.FINISHED },
      { matchId: 2, status: MatchServiceStatus.PROTOCOL_SIGNED },
      { matchId: 3, status: MatchServiceStatus.NOT_STARTED },
      { matchId: 4, status: MatchServiceStatus.PAUSED },
    ];
    const manager = { getRepository: () => ({ find: async () => sessions }) } as never;
    const matches = [1, 2, 3, 4, 5].map((id) => ({ id, status: MatchStatus.FINISHED }));
    matches.push({ id: 6, status: MatchStatus.LIVE });
    expect((await signedMatchResults(manager, matches)).map((m) => m.id)).toEqual([2, 3, 5]);
  });
  it('does not query sessions when no match has finished', async () => {
    const getRepository = jest.fn();
    expect(await signedMatchResults({ getRepository } as never, [])).toEqual([]);
    expect(getRepository).not.toHaveBeenCalled();
  });
});
