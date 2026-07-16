import { PlayerSuspensions1784160850000 } from '../../database/migrations/1784160850000-player-suspensions';

describe('player suspensions migration', () => {
  it('creates independent suspensions and migrates active legacy penalties', async () => {
    const statements: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string) => {
        statements.push(sql);
        return Promise.resolve();
      }),
    };

    await new PlayerSuspensions1784160850000().up(queryRunner as never);
    const sql = statements.join('\n');

    expect(sql).toContain('CREATE TABLE "player_suspensions"');
    expect(sql).toContain('"matches_required"');
    expect(sql).toContain('"matches_served"');
    expect(sql).toContain('"manual_decision_id"');
    expect(sql).toContain('FROM "player_tournament_stats"');
    expect(sql).toContain('stat."is_suspended" = true');
    expect(sql).not.toContain('suspended_until_match_id" integer');
  });
});
