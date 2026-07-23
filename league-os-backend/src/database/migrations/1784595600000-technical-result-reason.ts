import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TechnicalResultReason1784595600000 implements MigrationInterface {
  name = 'TechnicalResultReason1784595600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "technical_result_reason" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "technical_result_reason"`,
    );
  }
}
