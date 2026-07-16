import { MatchResults1784157250000 } from '../../database/migrations/1784157250000-match-results';

describe('match results migration', () => {
  it('adds structured scores and backfills finished legacy matches', async () => {
    const statements: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string) => {
        statements.push(sql);
        return Promise.resolve();
      }),
    };

    await new MatchResults1784157250000().up(queryRunner as never);
    const sql = statements.join('\n');

    expect(sql).toContain('match_resolution_type_enum');
    expect(sql).toContain('regular_time_home_score');
    expect(sql).toContain('extra_time_home_score');
    expect(sql).toContain('penalty_home_kicks_taken');
    expect(sql).toContain('result_official_at');
    expect(sql).toContain('WHERE "status" = \'finished\'');
    expect(sql).toContain('CHK_matches_penalty_result_complete');
  });
});
