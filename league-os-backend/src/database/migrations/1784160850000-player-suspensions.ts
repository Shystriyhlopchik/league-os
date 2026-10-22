import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PlayerSuspensions1784160850000 implements MigrationInterface {
  name = 'PlayerSuspensions1784160850000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."player_suspension_reason_enum" AS ENUM('accumulated_yellows', 'second_yellow_card', 'direct_red')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."player_suspension_status_enum" AS ENUM('active', 'served', 'cancelled')`,
    );
    await queryRunner.query(`
      CREATE TABLE "player_suspensions" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "tournament_id" integer NOT NULL,
        "stage_id" integer,
        "player_id" integer NOT NULL,
        "team_id" integer NOT NULL,
        "reason" "public"."player_suspension_reason_enum" NOT NULL,
        "matches_required" integer NOT NULL,
        "matches_served" integer NOT NULL DEFAULT 0,
        "status" "public"."player_suspension_status_enum" NOT NULL DEFAULT 'active',
        "source_match_id" integer,
        "manual_decision_id" integer,
        "served_at" TIMESTAMP,
        "cancelled_at" TIMESTAMP,
        CONSTRAINT "CHK_player_suspensions_matches_required" CHECK ("matches_required" > 0),
        CONSTRAINT "CHK_player_suspensions_matches_served" CHECK ("matches_served" >= 0),
        CONSTRAINT "CHK_player_suspensions_progress" CHECK ("matches_served" <= "matches_required"),
        CONSTRAINT "PK_player_suspensions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_player_suspensions_tournament_stage" ON "player_suspensions" ("tournament_id", "stage_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_player_suspensions_player_status" ON "player_suspensions" ("tournament_id", "player_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_player_suspensions_team_status" ON "player_suspensions" ("tournament_id", "team_id", "status")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_player_suspensions_source_reason" ON "player_suspensions" ("source_match_id", "player_id", "reason") WHERE "source_match_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "player_suspensions" ADD CONSTRAINT "FK_player_suspensions_tournament" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "player_suspensions" ADD CONSTRAINT "FK_player_suspensions_stage" FOREIGN KEY ("stage_id") REFERENCES "tournament_stages"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "player_suspensions" ADD CONSTRAINT "FK_player_suspensions_player" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "player_suspensions" ADD CONSTRAINT "FK_player_suspensions_team" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "player_suspensions" ADD CONSTRAINT "FK_player_suspensions_source_match" FOREIGN KEY ("source_match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`
      INSERT INTO "player_suspensions" (
        "tournament_id",
        "stage_id",
        "player_id",
        "team_id",
        "reason",
        "matches_required",
        "matches_served",
        "status",
        "createdAt",
        "updatedAt"
      )
      SELECT
        stat."tournament_id",
        next_match."stage_id",
        stat."player_id",
        stat."team_id",
        CASE stat."suspension_reason"::text
          WHEN 'four_yellow_cards' THEN 'accumulated_yellows'::"public"."player_suspension_reason_enum"
          WHEN 'second_yellow_card' THEN 'second_yellow_card'::"public"."player_suspension_reason_enum"
          ELSE 'direct_red'::"public"."player_suspension_reason_enum"
        END,
        1,
        0,
        'active'::"public"."player_suspension_status_enum",
        stat."updatedAt",
        stat."updatedAt"
      FROM "player_tournament_stats" stat
      LEFT JOIN "matches" next_match
        ON next_match."id" = stat."suspended_until_match_id"
      WHERE stat."is_suspended" = true
        AND stat."suspension_reason" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "player_suspensions" DROP CONSTRAINT "FK_player_suspensions_source_match"`,
    );
    await queryRunner.query(
      `ALTER TABLE "player_suspensions" DROP CONSTRAINT "FK_player_suspensions_team"`,
    );
    await queryRunner.query(
      `ALTER TABLE "player_suspensions" DROP CONSTRAINT "FK_player_suspensions_player"`,
    );
    await queryRunner.query(
      `ALTER TABLE "player_suspensions" DROP CONSTRAINT "FK_player_suspensions_stage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "player_suspensions" DROP CONSTRAINT "FK_player_suspensions_tournament"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_player_suspensions_source_reason"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_player_suspensions_team_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_player_suspensions_player_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_player_suspensions_tournament_stage"`,
    );
    await queryRunner.query(`DROP TABLE "player_suspensions"`);
    await queryRunner.query(
      `DROP TYPE "public"."player_suspension_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."player_suspension_reason_enum"`,
    );
  }
}
