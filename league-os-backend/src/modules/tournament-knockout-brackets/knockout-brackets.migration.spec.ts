import { KnockoutBrackets1784153650000 } from '../../database/migrations/1784153650000-knockout-brackets';

describe('knockout brackets migration', () => {
  it('creates bracket snapshots, plans and nullable future-match slots', async () => {
    const statements: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string) => {
        statements.push(sql);
        return Promise.resolve();
      }),
    };

    await new KnockoutBrackets1784153650000().up(queryRunner as never);
    const sql = statements.join('\n');

    expect(sql).toContain('tournament_knockout_bracket_snapshots');
    expect(sql).toContain('tournament_knockout_bracket_plans');
    expect(sql).toContain('home_participant_source');
    expect(sql).toContain('winner_team_id');
    expect(sql).toContain('DROP NOT NULL');
    expect(sql).toContain('UQ_matches_knockout_snapshot_position');
  });
});
