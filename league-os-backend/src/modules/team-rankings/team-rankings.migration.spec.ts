import type { QueryRunner } from 'typeorm';

import { TeamRankings1787692800000 } from '../../database/migrations/1787692800000-team-rankings';

describe('TeamRankings migration', () => {
  it('adds only the optional explicit tournament result', async () => {
    const statements: string[] = [];
    const queryRunner = {
      query: jest.fn((statement: string) => {
        statements.push(statement);
        return Promise.resolve(undefined);
      }),
    } as unknown as QueryRunner;

    await new TeamRankings1787692800000().up(queryRunner);

    const sql = statements.join('\n');
    expect(sql).toContain('team_rating_result_enum');
    expect(sql).toContain('ALTER TABLE "tournament_teams" ADD "rating_result"');
    expect(sql).not.toContain('CREATE TABLE');
  });
});
