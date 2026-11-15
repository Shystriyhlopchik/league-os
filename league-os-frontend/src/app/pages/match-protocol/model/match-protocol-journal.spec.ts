import { MatchProtocolJournal } from './match-protocol-journal';
import { MatchProtocolData } from '../../../entities/match-service/model/match-service.types';

describe('IndexedDB protocol persistence', () => {
    it('commits an independent copy that a new storage instance can read', async () => {
        const key = `browser-test:${crypto.randomUUID()}`;
        const first = new MatchProtocolJournal();
        const value = { key, confirmed: { match: { id: 12 } } as MatchProtocolData, pending: [] };
        await first.save(value);
        value.confirmed.match.id = 99;
        const saved = await new MatchProtocolJournal().read(key);
        expect(saved?.confirmed.match.id).toBe(12);
    });
});
