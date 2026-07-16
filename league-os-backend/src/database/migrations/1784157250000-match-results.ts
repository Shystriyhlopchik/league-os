import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MatchResults1784157250000 implements MigrationInterface {
  name = 'MatchResults1784157250000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."match_resolution_type_enum" AS ENUM('regular_time', 'extra_time', 'penalties', 'technical', 'walkover')`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "regular_time_home_score" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "regular_time_away_score" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "extra_time_home_score" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "extra_time_away_score" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "penalty_home_score" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "penalty_away_score" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "penalty_home_kicks_taken" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "penalty_away_kicks_taken" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "resolution_type" "public"."match_resolution_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "result_official_at" TIMESTAMP`,
    );

    await queryRunner.query(`
      UPDATE "matches"
      SET
        "regular_time_home_score" = "home_score",
        "regular_time_away_score" = "away_score",
        "resolution_type" = 'regular_time',
        "result_official_at" = "updatedAt",
        "winner_team_id" = CASE
          WHEN "home_score" > "away_score" THEN "home_team_id"
          WHEN "away_score" > "home_score" THEN "away_team_id"
          ELSE "winner_team_id"
        END,
        "loser_team_id" = CASE
          WHEN "home_score" > "away_score" THEN "away_team_id"
          WHEN "away_score" > "home_score" THEN "home_team_id"
          ELSE "loser_team_id"
        END
      WHERE "status" = 'finished'
    `);

    await queryRunner.query(`
      ALTER TABLE "matches" ADD CONSTRAINT "CHK_matches_regular_time_score_pair"
      CHECK (("regular_time_home_score" IS NULL) = ("regular_time_away_score" IS NULL))
    `);
    await queryRunner.query(`
      ALTER TABLE "matches" ADD CONSTRAINT "CHK_matches_extra_time_score_pair"
      CHECK (("extra_time_home_score" IS NULL) = ("extra_time_away_score" IS NULL))
    `);
    await queryRunner.query(`
      ALTER TABLE "matches" ADD CONSTRAINT "CHK_matches_penalty_result_complete"
      CHECK (
        ("penalty_home_score" IS NULL AND "penalty_away_score" IS NULL AND
         "penalty_home_kicks_taken" IS NULL AND "penalty_away_kicks_taken" IS NULL)
        OR
        ("penalty_home_score" IS NOT NULL AND "penalty_away_score" IS NOT NULL AND
         "penalty_home_kicks_taken" IS NOT NULL AND "penalty_away_kicks_taken" IS NOT NULL)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "matches" ADD CONSTRAINT "CHK_matches_result_scores_non_negative"
      CHECK (
        COALESCE("regular_time_home_score", 0) >= 0 AND
        COALESCE("regular_time_away_score", 0) >= 0 AND
        COALESCE("extra_time_home_score", 0) >= 0 AND
        COALESCE("extra_time_away_score", 0) >= 0 AND
        COALESCE("penalty_home_score", 0) >= 0 AND
        COALESCE("penalty_away_score", 0) >= 0 AND
        COALESCE("penalty_home_kicks_taken", 0) >= 0 AND
        COALESCE("penalty_away_kicks_taken", 0) >= 0
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "matches" DROP CONSTRAINT "CHK_matches_result_scores_non_negative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP CONSTRAINT "CHK_matches_penalty_result_complete"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP CONSTRAINT "CHK_matches_extra_time_score_pair"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP CONSTRAINT "CHK_matches_regular_time_score_pair"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "result_official_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "resolution_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "penalty_away_kicks_taken"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "penalty_home_kicks_taken"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "penalty_away_score"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "penalty_home_score"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "extra_time_away_score"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "extra_time_home_score"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "regular_time_away_score"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "regular_time_home_score"`,
    );
    await queryRunner.query(`DROP TYPE "public"."match_resolution_type_enum"`);
  }
}
