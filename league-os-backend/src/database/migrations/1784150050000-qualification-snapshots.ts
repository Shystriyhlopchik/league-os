import type { MigrationInterface, QueryRunner } from 'typeorm';

export class QualificationSnapshots1784150050000 implements MigrationInterface {
  name = 'QualificationSnapshots1784150050000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."qualification_snapshot_status_enum" AS ENUM('preview', 'confirmed')`,
    );
    await queryRunner.query(`
      CREATE TABLE "tournament_qualification_snapshots" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "tournament_id" integer NOT NULL,
        "from_stage_id" integer NOT NULL,
        "to_stage_id" integer NOT NULL,
        "rule_version_id" integer NOT NULL,
        "revision" integer NOT NULL,
        "status" "public"."qualification_snapshot_status_enum" NOT NULL DEFAULT 'preview',
        "is_current" boolean NOT NULL DEFAULT false,
        "source_hash" character varying(64) NOT NULL,
        "transition_config" jsonb NOT NULL,
        "resolution_input" jsonb NOT NULL,
        "confirmed_at" TIMESTAMP,
        "created_by_user_id" integer,
        "confirmed_by_user_id" integer,
        "supersedes_snapshot_id" integer,
        CONSTRAINT "CHK_qualification_snapshot_revision" CHECK ("revision" > 0),
        CONSTRAINT "UQ_qualification_snapshot_transition_revision" UNIQUE ("tournament_id", "from_stage_id", "to_stage_id", "revision"),
        CONSTRAINT "PK_tournament_qualification_snapshots" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "tournament_qualification_snapshot_entries" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "snapshot_id" integer NOT NULL,
        "tournament_team_id" integer NOT NULL,
        "source_group_id" integer,
        "source_position" integer NOT NULL,
        "qualification_rule_id" character varying(100) NOT NULL,
        "selection_order" integer NOT NULL,
        "comparison_snapshot" jsonb NOT NULL,
        "selection_reason" jsonb NOT NULL,
        CONSTRAINT "CHK_qualification_entry_position" CHECK ("source_position" > 0),
        CONSTRAINT "CHK_qualification_entry_order" CHECK ("selection_order" > 0),
        CONSTRAINT "UQ_qualification_entry_snapshot_team" UNIQUE ("snapshot_id", "tournament_team_id"),
        CONSTRAINT "UQ_qualification_entry_snapshot_order" UNIQUE ("snapshot_id", "selection_order"),
        CONSTRAINT "PK_tournament_qualification_snapshot_entries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_qualification_snapshot_transition" ON "tournament_qualification_snapshots" ("tournament_id", "from_stage_id", "to_stage_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_qualification_snapshot_current" ON "tournament_qualification_snapshots" ("tournament_id", "from_stage_id", "to_stage_id") WHERE "status" = 'confirmed' AND "is_current" = true`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_qualification_entry_snapshot" ON "tournament_qualification_snapshot_entries" ("snapshot_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshots" ADD CONSTRAINT "FK_qualification_snapshot_tournament" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshots" ADD CONSTRAINT "FK_qualification_snapshot_from_stage" FOREIGN KEY ("from_stage_id") REFERENCES "tournament_stages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshots" ADD CONSTRAINT "FK_qualification_snapshot_to_stage" FOREIGN KEY ("to_stage_id") REFERENCES "tournament_stages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshots" ADD CONSTRAINT "FK_qualification_snapshot_rule_version" FOREIGN KEY ("rule_version_id") REFERENCES "tournament_rule_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshots" ADD CONSTRAINT "FK_qualification_snapshot_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshots" ADD CONSTRAINT "FK_qualification_snapshot_confirmed_by" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshots" ADD CONSTRAINT "FK_qualification_snapshot_supersedes" FOREIGN KEY ("supersedes_snapshot_id") REFERENCES "tournament_qualification_snapshots"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshot_entries" ADD CONSTRAINT "FK_qualification_entry_snapshot" FOREIGN KEY ("snapshot_id") REFERENCES "tournament_qualification_snapshots"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshot_entries" ADD CONSTRAINT "FK_qualification_entry_tournament_team" FOREIGN KEY ("tournament_team_id") REFERENCES "tournament_teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshot_entries" ADD CONSTRAINT "FK_qualification_entry_source_group" FOREIGN KEY ("source_group_id") REFERENCES "tournament_groups"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshot_entries" DROP CONSTRAINT "FK_qualification_entry_source_group"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshot_entries" DROP CONSTRAINT "FK_qualification_entry_tournament_team"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshot_entries" DROP CONSTRAINT "FK_qualification_entry_snapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshots" DROP CONSTRAINT "FK_qualification_snapshot_supersedes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshots" DROP CONSTRAINT "FK_qualification_snapshot_confirmed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshots" DROP CONSTRAINT "FK_qualification_snapshot_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshots" DROP CONSTRAINT "FK_qualification_snapshot_rule_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshots" DROP CONSTRAINT "FK_qualification_snapshot_to_stage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshots" DROP CONSTRAINT "FK_qualification_snapshot_from_stage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_qualification_snapshots" DROP CONSTRAINT "FK_qualification_snapshot_tournament"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_qualification_entry_snapshot"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_qualification_snapshot_current"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_qualification_snapshot_transition"`,
    );
    await queryRunner.query(
      `DROP TABLE "tournament_qualification_snapshot_entries"`,
    );
    await queryRunner.query(`DROP TABLE "tournament_qualification_snapshots"`);
    await queryRunner.query(
      `DROP TYPE "public"."qualification_snapshot_status_enum"`,
    );
  }
}
