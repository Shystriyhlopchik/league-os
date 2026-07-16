import type { MigrationInterface, QueryRunner } from 'typeorm';

export class KnockoutBrackets1784153650000 implements MigrationInterface {
  name = 'KnockoutBrackets1784153650000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."knockout_bracket_snapshot_status_enum" AS ENUM('preview', 'confirmed')`,
    );
    await queryRunner.query(`
      CREATE TABLE "tournament_knockout_bracket_snapshots" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "tournament_id" integer NOT NULL,
        "stage_id" integer NOT NULL,
        "qualification_snapshot_id" integer NOT NULL,
        "rule_version_id" integer NOT NULL,
        "revision" integer NOT NULL,
        "status" "public"."knockout_bracket_snapshot_status_enum" NOT NULL DEFAULT 'preview',
        "is_current" boolean NOT NULL DEFAULT false,
        "source_hash" character varying(64) NOT NULL,
        "bracket_config" jsonb NOT NULL,
        "seeding_input" jsonb NOT NULL,
        "confirmed_at" TIMESTAMP,
        "created_by_user_id" integer,
        "confirmed_by_user_id" integer,
        CONSTRAINT "CHK_knockout_snapshot_revision" CHECK ("revision" > 0),
        CONSTRAINT "UQ_knockout_snapshot_stage_revision" UNIQUE ("tournament_id", "stage_id", "revision"),
        CONSTRAINT "PK_tournament_knockout_bracket_snapshots" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "tournament_knockout_bracket_plans" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "snapshot_id" integer NOT NULL,
        "order" integer NOT NULL,
        "bracket_position" character varying(100) NOT NULL,
        "round_type" "public"."match_round_type_enum" NOT NULL,
        "round_number" integer NOT NULL,
        "home_source" jsonb NOT NULL,
        "away_source" jsonb NOT NULL,
        "match_id" integer,
        CONSTRAINT "CHK_knockout_plan_order" CHECK ("order" > 0),
        CONSTRAINT "CHK_knockout_plan_round_number" CHECK ("round_number" > 0),
        CONSTRAINT "UQ_knockout_plan_snapshot_position" UNIQUE ("snapshot_id", "bracket_position"),
        CONSTRAINT "UQ_knockout_plan_snapshot_order" UNIQUE ("snapshot_id", "order"),
        CONSTRAINT "UQ_knockout_plan_match" UNIQUE ("match_id"),
        CONSTRAINT "PK_tournament_knockout_bracket_plans" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "matches" ALTER COLUMN "home_team_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ALTER COLUMN "away_team_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "bracket_snapshot_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "home_participant_source" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "away_participant_source" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "winner_team_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "loser_team_id" integer`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_knockout_snapshot_stage" ON "tournament_knockout_bracket_snapshots" ("tournament_id", "stage_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_knockout_snapshot_current" ON "tournament_knockout_bracket_snapshots" ("tournament_id", "stage_id") WHERE "status" = 'confirmed' AND "is_current" = true`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_knockout_plan_snapshot" ON "tournament_knockout_bracket_plans" ("snapshot_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_matches_knockout_snapshot_position" ON "matches" ("bracket_snapshot_id", "bracket_position") WHERE "bracket_snapshot_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_snapshots" ADD CONSTRAINT "FK_knockout_snapshot_tournament" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_snapshots" ADD CONSTRAINT "FK_knockout_snapshot_stage" FOREIGN KEY ("stage_id") REFERENCES "tournament_stages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_snapshots" ADD CONSTRAINT "FK_knockout_snapshot_qualification" FOREIGN KEY ("qualification_snapshot_id") REFERENCES "tournament_qualification_snapshots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_snapshots" ADD CONSTRAINT "FK_knockout_snapshot_rule_version" FOREIGN KEY ("rule_version_id") REFERENCES "tournament_rule_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_snapshots" ADD CONSTRAINT "FK_knockout_snapshot_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_snapshots" ADD CONSTRAINT "FK_knockout_snapshot_confirmed_by" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_plans" ADD CONSTRAINT "FK_knockout_plan_snapshot" FOREIGN KEY ("snapshot_id") REFERENCES "tournament_knockout_bracket_snapshots"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_plans" ADD CONSTRAINT "FK_knockout_plan_match" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD CONSTRAINT "FK_matches_bracket_snapshot" FOREIGN KEY ("bracket_snapshot_id") REFERENCES "tournament_knockout_bracket_snapshots"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD CONSTRAINT "FK_matches_winner_team" FOREIGN KEY ("winner_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD CONSTRAINT "FK_matches_loser_team" FOREIGN KEY ("loser_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "matches" DROP CONSTRAINT "FK_matches_loser_team"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP CONSTRAINT "FK_matches_winner_team"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP CONSTRAINT "FK_matches_bracket_snapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_plans" DROP CONSTRAINT "FK_knockout_plan_match"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_plans" DROP CONSTRAINT "FK_knockout_plan_snapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_snapshots" DROP CONSTRAINT "FK_knockout_snapshot_confirmed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_snapshots" DROP CONSTRAINT "FK_knockout_snapshot_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_snapshots" DROP CONSTRAINT "FK_knockout_snapshot_rule_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_snapshots" DROP CONSTRAINT "FK_knockout_snapshot_qualification"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_snapshots" DROP CONSTRAINT "FK_knockout_snapshot_stage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_knockout_bracket_snapshots" DROP CONSTRAINT "FK_knockout_snapshot_tournament"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_matches_knockout_snapshot_position"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_knockout_plan_snapshot"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_knockout_snapshot_current"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_knockout_snapshot_stage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "loser_team_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "winner_team_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "away_participant_source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "home_participant_source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "bracket_snapshot_id"`,
    );
    await queryRunner.query(
      `DELETE FROM "matches" WHERE "home_team_id" IS NULL OR "away_team_id" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ALTER COLUMN "away_team_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ALTER COLUMN "home_team_id" SET NOT NULL`,
    );
    await queryRunner.query(`DROP TABLE "tournament_knockout_bracket_plans"`);
    await queryRunner.query(
      `DROP TABLE "tournament_knockout_bracket_snapshots"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."knockout_bracket_snapshot_status_enum"`,
    );
  }
}
