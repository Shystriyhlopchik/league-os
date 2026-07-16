import type { QueryRunner } from 'typeorm';

import { RuleDrivenStandings1784146450000 } from '../../database/migrations/1784146450000-rule-driven-standings';

describe('RuleDrivenStandings migration', () => {
  it('keeps legacy rows and adds stage/group scoped unique indexes', async () => {
    const statements: string[] = [];
    const queryRunner = {
      query: jest.fn((statement: string) => {
        statements.push(statement);
        return Promise.resolve(undefined);
      }),
    } as unknown as QueryRunner;

    await new RuleDrivenStandings1784146450000().up(queryRunner);

    const sql = statements.join('\n');
    expect(sql).toContain('ALTER TABLE "standings" ADD "stage_id" integer');
    expect(sql).toContain('ALTER TABLE "standings" ADD "group_id" integer');
    expect(sql).toContain('ADD "tie_break_reason" jsonb');
    expect(sql).toContain('UQ_standings_legacy_tournament_team');
    expect(sql).toContain('UQ_standings_stage_group_team');
    expect(sql).not.toContain('DELETE FROM "standings"');
  });
});
