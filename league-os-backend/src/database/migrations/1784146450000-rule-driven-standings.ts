import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RuleDrivenStandings1784146450000 implements MigrationInterface {
  name = 'RuleDrivenStandings1784146450000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "standings" DROP CONSTRAINT "UQ_a8d990b7004d5eeaefb83c8b6e3"`,
    );
    await queryRunner.query(`ALTER TABLE "standings" ADD "stage_id" integer`);
    await queryRunner.query(`ALTER TABLE "standings" ADD "group_id" integer`);
    await queryRunner.query(
      `ALTER TABLE "standings" ADD "rule_version_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "standings" ADD "disciplinary_score" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "standings" ADD "manual_decision_rank" integer`,
    );
    await queryRunner.query(`ALTER TABLE "standings" ADD "draw_rank" integer`);
    await queryRunner.query(
      `ALTER TABLE "standings" ADD "tie_break_reason" jsonb`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_standings_legacy_tournament_team" ON "standings" ("tournament_id", "team_id") WHERE "stage_id" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_standings_stage_team_without_group" ON "standings" ("stage_id", "team_id") WHERE "stage_id" IS NOT NULL AND "group_id" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_standings_stage_group_team" ON "standings" ("stage_id", "group_id", "team_id") WHERE "group_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_standings_stage_group_position" ON "standings" ("stage_id", "group_id", "position")`,
    );

    await queryRunner.query(
      `ALTER TABLE "standings" ADD CONSTRAINT "FK_standings_stage" FOREIGN KEY ("stage_id") REFERENCES "tournament_stages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "standings" ADD CONSTRAINT "FK_standings_group" FOREIGN KEY ("group_id") REFERENCES "tournament_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "standings" ADD CONSTRAINT "FK_standings_rule_version" FOREIGN KEY ("rule_version_id") REFERENCES "tournament_rule_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "standings" WHERE "stage_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "standings" DROP CONSTRAINT "FK_standings_rule_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "standings" DROP CONSTRAINT "FK_standings_group"`,
    );
    await queryRunner.query(
      `ALTER TABLE "standings" DROP CONSTRAINT "FK_standings_stage"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_standings_stage_group_position"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_standings_stage_group_team"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_standings_stage_team_without_group"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_standings_legacy_tournament_team"`,
    );

    await queryRunner.query(
      `ALTER TABLE "standings" DROP COLUMN "tie_break_reason"`,
    );
    await queryRunner.query(`ALTER TABLE "standings" DROP COLUMN "draw_rank"`);
    await queryRunner.query(
      `ALTER TABLE "standings" DROP COLUMN "manual_decision_rank"`,
    );
    await queryRunner.query(
      `ALTER TABLE "standings" DROP COLUMN "disciplinary_score"`,
    );
    await queryRunner.query(
      `ALTER TABLE "standings" DROP COLUMN "rule_version_id"`,
    );
    await queryRunner.query(`ALTER TABLE "standings" DROP COLUMN "group_id"`);
    await queryRunner.query(`ALTER TABLE "standings" DROP COLUMN "stage_id"`);
    await queryRunner.query(
      `ALTER TABLE "standings" ADD CONSTRAINT "UQ_a8d990b7004d5eeaefb83c8b6e3" UNIQUE ("tournament_id", "team_id")`,
    );
  }
}
