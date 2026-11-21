import { MigrationInterface, QueryRunner } from 'typeorm';
export class TeamAccessWorkflow1795219200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // Existing grants are preserved; no playing captain is automatically elevated.
    await q.query(
      `ALTER TABLE match_rosters ADD COLUMN workflow_history jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE match_rosters DROP COLUMN workflow_history`);
  }
}
