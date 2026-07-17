import type { MigrationInterface, QueryRunner } from 'typeorm';

export class NewsManagement1784168050000 implements MigrationInterface {
  name = 'NewsManagement1784168050000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "news" ADD "author_user_id" integer`);
    await queryRunner.query(
      `ALTER TABLE "news" ADD "updated_by_user_id" integer`,
    );
    await queryRunner.query(`ALTER TABLE "news" ADD "deleted_at" TIMESTAMP`);
    await queryRunner.query(
      `CREATE INDEX "IDX_news_publication" ON "news" ("status", "publishedAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "news" ADD CONSTRAINT "FK_news_author" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "news" ADD CONSTRAINT "FK_news_updated_by" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "news" DROP CONSTRAINT "FK_news_updated_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "news" DROP CONSTRAINT "FK_news_author"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_news_publication"`);
    await queryRunner.query(`ALTER TABLE "news" DROP COLUMN "deleted_at"`);
    await queryRunner.query(
      `ALTER TABLE "news" DROP COLUMN "updated_by_user_id"`,
    );
    await queryRunner.query(`ALTER TABLE "news" DROP COLUMN "author_user_id"`);
  }
}
