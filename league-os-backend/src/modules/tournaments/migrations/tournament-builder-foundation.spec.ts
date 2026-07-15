import { QueryRunner } from 'typeorm';

import { TournamentBuilderFoundation1784142850000 } from '../../../database/migrations/1784142850000-tournament-builder-foundation';

describe('TournamentBuilderFoundation migration', () => {
  it('expands tournaments and matches without removing legacy round', async () => {
    const statements: string[] = [];
    const queryRunner = {
      query: jest.fn((statement: string) => {
        statements.push(statement);
        return Promise.resolve(undefined);
      }),
    } as unknown as QueryRunner;

    await new TournamentBuilderFoundation1784142850000().up(queryRunner);

    const sql = statements.join('\n');
    expect(sql).toContain('CREATE TABLE "tournament_stages"');
    expect(sql).toContain('CREATE TABLE "tournament_groups"');
    expect(sql).toContain('CREATE TABLE "tournament_rule_versions"');
    expect(sql).toContain('CREATE TABLE "tournament_members"');
    expect(sql).toContain('CREATE TABLE "tournament_stage_participants"');
    expect(sql).toContain('ALTER TABLE "matches" ADD "stage_id" integer');
    expect(sql).toContain('ALTER TABLE "matches" ADD "round_type"');
    expect(sql).not.toContain('DROP COLUMN "round"');
  });
});
