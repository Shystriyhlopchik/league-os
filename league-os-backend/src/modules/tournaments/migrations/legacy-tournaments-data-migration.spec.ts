import type { QueryRunner } from 'typeorm';
import { MigrateLegacyTournaments1784164450000 } from '../../../database/migrations/1784164450000-migrate-legacy-tournaments';

describe('legacy tournaments data migration', () => {
  it('is additive, audited and repeatable', async () => {
    const statements: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
      }),
    } as unknown as QueryRunner;
    const migration = new MigrateLegacyTournaments1784164450000();

    await migration.up(queryRunner);
    await migration.up(queryRunner);
    const sql = statements.join('\n');

    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "legacy_tournament_migration_audit"',
    );
    expect(sql).toContain('ON CONFLICT ("tournament_id") DO NOTHING');
    expect(sql).toContain('ON CONFLICT ("stage_id", "tournament_team_id")');
    expect(sql).toContain('"standings_before"');
    expect(sql).toContain('"standings_after"');
    expect(sql).toContain('"data_equivalent"');
    expect(sql).toContain('Legacy bootstrap by migration 1784164450000');
    expect(sql).not.toContain('DROP COLUMN');
    expect(sql).not.toContain('DROP TABLE "standings"');
  });

  it('rolls back only migration-owned data and blocks unsafe rollback', async () => {
    const statements: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
      }),
    } as unknown as QueryRunner;

    await new MigrateLegacyTournaments1784164450000().down(queryRunner);
    const sql = statements.join('\n');

    expect(sql).toContain('Rollback blocked');
    expect(sql).toContain('"qualification_source" = \'legacy_migration\'');
    expect(sql).toContain(
      '"change_summary" = \'Legacy bootstrap by migration 1784164450000\'',
    );
    expect(sql).toContain('"stage_id" = NULL');
    expect(sql).not.toContain('DROP COLUMN "round"');
    expect(sql).not.toContain('DROP TABLE "player_tournament_stats"');
  });
});
