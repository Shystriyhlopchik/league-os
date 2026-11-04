import { PlayerProfileCorrections1793836800000 } from '../../database/migrations/1793836800000-player-profile-corrections';

describe('Player profile corrections migration', () => {
  it('adds versioning, frozen match identities, immutable correction history and a pending uniqueness constraint', async () => {
    const q = { query: jest.fn() };
    await new PlayerProfileCorrections1793836800000().up(q as never);
    const sql = q.query.mock.calls.map((call) => call[0]).join('\n');
    expect(sql).toContain('identity_version int NOT NULL DEFAULT 1');
    expect(sql).toContain('identity_snapshot jsonb');
    expect(sql).toContain('CREATE TABLE player_profile_audit');
    expect(sql).toContain("WHERE status = 'submitted'");
    expect(sql).toContain('REFERENCES players(id) ON DELETE RESTRICT');
    expect(sql).not.toMatch(/DELETE FROM|TRUNCATE|UPDATE players/);
  });
  it('reverts in foreign-key safe order', async () => {
    const q = { query: jest.fn() };
    await new PlayerProfileCorrections1793836800000().down(q as never);
    expect(q.query.mock.calls.map((call) => call[0])).toEqual([
      'DROP TABLE player_profile_audit',
      'DROP TABLE player_profile_changes',
      'ALTER TABLE match_roster_players DROP COLUMN identity_snapshot',
      'ALTER TABLE players DROP COLUMN identity_version',
    ]);
  });
});
