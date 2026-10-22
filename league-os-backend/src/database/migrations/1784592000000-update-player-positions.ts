import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdatePlayerPositions1784592000000
  implements MigrationInterface
{
  name = 'UpdatePlayerPositions1784592000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.replaceEnum(queryRunner, 'players', 'players_position_enum');
    await this.replaceEnum(
      queryRunner,
      'team_players',
      'team_players_position_enum',
    );
    await this.replaceEnum(
      queryRunner,
      'match_roster_players',
      'match_roster_players_position_enum',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.restoreEnum(queryRunner, 'players', 'players_position_enum');
    await this.restoreEnum(
      queryRunner,
      'team_players',
      'team_players_position_enum',
    );
    await this.restoreEnum(
      queryRunner,
      'match_roster_players',
      'match_roster_players_position_enum',
    );
  }

  private async replaceEnum(
    queryRunner: QueryRunner,
    tableName: string,
    enumName: string,
  ): Promise<void> {
    const oldEnumName = `${enumName}_old`;

    await queryRunner.query(
      `ALTER TYPE "public"."${enumName}" RENAME TO "${oldEnumName}"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."${enumName}" AS ENUM('goalkeeper', 'defender', 'winger', 'forward')`,
    );
    await queryRunner.query(
      `ALTER TABLE "${tableName}" ALTER COLUMN "position" TYPE "public"."${enumName}" USING (CASE WHEN "position"::text = 'midfielder' THEN 'winger' ELSE "position"::text END)::"public"."${enumName}"`,
    );
    await queryRunner.query(`DROP TYPE "public"."${oldEnumName}"`);
  }

  private async restoreEnum(
    queryRunner: QueryRunner,
    tableName: string,
    enumName: string,
  ): Promise<void> {
    const newEnumName = `${enumName}_new`;

    await queryRunner.query(
      `ALTER TYPE "public"."${enumName}" RENAME TO "${newEnumName}"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."${enumName}" AS ENUM('goalkeeper', 'defender', 'midfielder', 'forward')`,
    );
    await queryRunner.query(
      `ALTER TABLE "${tableName}" ALTER COLUMN "position" TYPE "public"."${enumName}" USING (CASE WHEN "position"::text = 'winger' THEN 'midfielder' ELSE "position"::text END)::"public"."${enumName}"`,
    );
    await queryRunner.query(`DROP TYPE "public"."${newEnumName}"`);
  }
}
