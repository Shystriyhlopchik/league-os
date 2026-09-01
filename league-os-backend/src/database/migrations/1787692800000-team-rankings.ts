import { MigrationInterface, QueryRunner } from 'typeorm';

export class TeamRankings1787692800000 implements MigrationInterface {
  name = 'TeamRankings1787692800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."team_rating_result_enum" AS ENUM('champion', 'finalist', 'third', 'fourth', 'playoff', 'participation')`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_teams" ADD "rating_result" "public"."team_rating_result_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tournament_teams" DROP COLUMN "rating_result"`,
    );
    await queryRunner.query(`DROP TYPE "public"."team_rating_result_enum"`);
  }
}
