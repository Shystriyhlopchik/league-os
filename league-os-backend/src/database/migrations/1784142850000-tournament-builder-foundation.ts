import { MigrationInterface, QueryRunner } from 'typeorm';

export class TournamentBuilderFoundation1784142850000 implements MigrationInterface {
  name = 'TournamentBuilderFoundation1784142850000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."tournament_lifecycle_status_enum" AS ENUM('draft', 'published', 'in_progress', 'completed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tournament_stage_type_enum" AS ENUM('round_robin', 'group_stage', 'knockout')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tournament_stage_status_enum" AS ENUM('pending', 'active', 'completed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tournament_group_status_enum" AS ENUM('draft', 'confirmed', 'completed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tournament_rule_version_status_enum" AS ENUM('draft', 'published', 'superseded')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tournament_member_role_enum" AS ENUM('organizer', 'viewer')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tournament_stage_participant_status_enum" AS ENUM('active', 'qualified', 'eliminated', 'withdrawn')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."match_round_type_enum" AS ENUM('round_robin', 'group_round', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final')`,
    );

    await queryRunner.query(
      `ALTER TABLE "tournaments" ADD "owner_user_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" ADD "lifecycle_status" "public"."tournament_lifecycle_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" ADD "active_rule_version_id" integer`,
    );

    await queryRunner.query(`
      CREATE TABLE "tournament_stages" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "tournament_id" integer NOT NULL,
        "key" character varying(100) NOT NULL,
        "name" character varying(255) NOT NULL,
        "type" "public"."tournament_stage_type_enum" NOT NULL,
        "order" integer NOT NULL,
        "status" "public"."tournament_stage_status_enum" NOT NULL DEFAULT 'pending',
        "start_date" date,
        "end_date" date,
        "configuration" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "CHK_tournament_stages_order" CHECK ("order" > 0),
        CONSTRAINT "UQ_tournament_stages_tournament_key" UNIQUE ("tournament_id", "key"),
        CONSTRAINT "UQ_tournament_stages_tournament_order" UNIQUE ("tournament_id", "order"),
        CONSTRAINT "PK_3c1213475a2b65d4d9be7c01f07" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tournament_groups" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "stage_id" integer NOT NULL,
        "key" character varying(50) NOT NULL,
        "name" character varying(255) NOT NULL,
        "order" integer NOT NULL,
        "capacity" integer,
        "status" "public"."tournament_group_status_enum" NOT NULL DEFAULT 'draft',
        CONSTRAINT "CHK_tournament_groups_order" CHECK ("order" > 0),
        CONSTRAINT "CHK_tournament_groups_capacity" CHECK ("capacity" IS NULL OR "capacity" >= 2),
        CONSTRAINT "UQ_tournament_groups_stage_key" UNIQUE ("stage_id", "key"),
        CONSTRAINT "UQ_tournament_groups_stage_order" UNIQUE ("stage_id", "order"),
        CONSTRAINT "PK_c2f8cd1faeb19919d97022068df" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tournament_rule_versions" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "tournament_id" integer NOT NULL,
        "version" integer NOT NULL,
        "schema_version" integer NOT NULL DEFAULT 1,
        "config" jsonb NOT NULL,
        "status" "public"."tournament_rule_version_status_enum" NOT NULL DEFAULT 'draft',
        "published_at" TIMESTAMP,
        "based_on_version_id" integer,
        "created_by_user_id" integer,
        "published_by_user_id" integer,
        "change_summary" text,
        CONSTRAINT "CHK_tournament_rule_versions_version" CHECK ("version" > 0),
        CONSTRAINT "CHK_tournament_rule_versions_schema_version" CHECK ("schema_version" > 0),
        CONSTRAINT "UQ_tournament_rule_versions_tournament_version" UNIQUE ("tournament_id", "version"),
        CONSTRAINT "PK_2c426a457f9035f054c5f84dfb5" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tournament_members" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "tournament_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "role" "public"."tournament_member_role_enum" NOT NULL DEFAULT 'organizer',
        CONSTRAINT "UQ_tournament_members_tournament_user" UNIQUE ("tournament_id", "user_id"),
        CONSTRAINT "PK_1f6703932ec49b7d0df4a2ccd17" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tournament_stage_participants" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "stage_id" integer NOT NULL,
        "tournament_team_id" integer NOT NULL,
        "group_id" integer,
        "seed_number" integer,
        "qualification_source" character varying(100),
        "status" "public"."tournament_stage_participant_status_enum" NOT NULL DEFAULT 'active',
        CONSTRAINT "CHK_stage_participants_seed" CHECK ("seed_number" IS NULL OR "seed_number" > 0),
        CONSTRAINT "UQ_stage_participants_stage_tournament_team" UNIQUE ("stage_id", "tournament_team_id"),
        CONSTRAINT "PK_239a3c473bc3918a7de848f9923" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`ALTER TABLE "matches" ADD "stage_id" integer`);
    await queryRunner.query(`ALTER TABLE "matches" ADD "group_id" integer`);
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "round_type" "public"."match_round_type_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "matches" ADD "round_number" integer`);
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "bracket_position" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD "effective_rule_version_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD CONSTRAINT "CHK_matches_round_number" CHECK ("round_number" IS NULL OR "round_number" > 0)`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_tournaments_owner_user" ON "tournaments" ("owner_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tournaments_active_rule_version" ON "tournaments" ("active_rule_version_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tournament_stages_tournament" ON "tournament_stages" ("tournament_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tournament_groups_stage" ON "tournament_groups" ("stage_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tournament_rule_versions_tournament" ON "tournament_rule_versions" ("tournament_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tournament_rule_versions_status" ON "tournament_rule_versions" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tournament_members_tournament" ON "tournament_members" ("tournament_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tournament_members_user" ON "tournament_members" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_stage_participants_stage" ON "tournament_stage_participants" ("stage_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_stage_participants_group" ON "tournament_stage_participants" ("group_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_stage_participants_tournament_team" ON "tournament_stage_participants" ("tournament_team_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_matches_stage" ON "matches" ("stage_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_matches_group" ON "matches" ("group_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_matches_effective_rule_version" ON "matches" ("effective_rule_version_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_matches_stage_round" ON "matches" ("stage_id", "round_type", "round_number")`,
    );

    await queryRunner.query(
      `ALTER TABLE "tournament_stages" ADD CONSTRAINT "FK_tournament_stages_tournament" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_groups" ADD CONSTRAINT "FK_tournament_groups_stage" FOREIGN KEY ("stage_id") REFERENCES "tournament_stages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_rule_versions" ADD CONSTRAINT "FK_rule_versions_tournament" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_rule_versions" ADD CONSTRAINT "FK_rule_versions_based_on" FOREIGN KEY ("based_on_version_id") REFERENCES "tournament_rule_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_rule_versions" ADD CONSTRAINT "FK_rule_versions_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_rule_versions" ADD CONSTRAINT "FK_rule_versions_published_by" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_members" ADD CONSTRAINT "FK_tournament_members_tournament" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_members" ADD CONSTRAINT "FK_tournament_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_stage_participants" ADD CONSTRAINT "FK_stage_participants_stage" FOREIGN KEY ("stage_id") REFERENCES "tournament_stages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_stage_participants" ADD CONSTRAINT "FK_stage_participants_tournament_team" FOREIGN KEY ("tournament_team_id") REFERENCES "tournament_teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_stage_participants" ADD CONSTRAINT "FK_stage_participants_group" FOREIGN KEY ("group_id") REFERENCES "tournament_groups"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" ADD CONSTRAINT "FK_tournaments_owner" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" ADD CONSTRAINT "FK_tournaments_active_rule" FOREIGN KEY ("active_rule_version_id") REFERENCES "tournament_rule_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD CONSTRAINT "FK_matches_stage" FOREIGN KEY ("stage_id") REFERENCES "tournament_stages"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD CONSTRAINT "FK_matches_group" FOREIGN KEY ("group_id") REFERENCES "tournament_groups"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD CONSTRAINT "FK_matches_effective_rule_version" FOREIGN KEY ("effective_rule_version_id") REFERENCES "tournament_rule_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "matches" DROP CONSTRAINT "FK_matches_effective_rule_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP CONSTRAINT "FK_matches_group"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP CONSTRAINT "FK_matches_stage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" DROP CONSTRAINT "FK_tournaments_active_rule"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" DROP CONSTRAINT "FK_tournaments_owner"`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_matches_stage_round"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_matches_effective_rule_version"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_matches_group"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_matches_stage"`);
    await queryRunner.query(
      `ALTER TABLE "matches" DROP CONSTRAINT "CHK_matches_round_number"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "effective_rule_version_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP COLUMN "bracket_position"`,
    );
    await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "round_number"`);
    await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "round_type"`);
    await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "group_id"`);
    await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "stage_id"`);

    await queryRunner.query(`DROP TABLE "tournament_stage_participants"`);
    await queryRunner.query(`DROP TABLE "tournament_members"`);
    await queryRunner.query(`DROP TABLE "tournament_groups"`);

    await queryRunner.query(
      `ALTER TABLE "tournament_rule_versions" DROP CONSTRAINT "FK_rule_versions_published_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_rule_versions" DROP CONSTRAINT "FK_rule_versions_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_rule_versions" DROP CONSTRAINT "FK_rule_versions_based_on"`,
    );
    await queryRunner.query(`DROP TABLE "tournament_rule_versions"`);
    await queryRunner.query(`DROP TABLE "tournament_stages"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_tournaments_active_rule_version"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_tournaments_owner_user"`);
    await queryRunner.query(
      `ALTER TABLE "tournaments" DROP COLUMN "active_rule_version_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" DROP COLUMN "lifecycle_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" DROP COLUMN "owner_user_id"`,
    );

    await queryRunner.query(`DROP TYPE "public"."match_round_type_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."tournament_stage_participant_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."tournament_member_role_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."tournament_rule_version_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."tournament_group_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."tournament_stage_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."tournament_stage_type_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."tournament_lifecycle_status_enum"`,
    );
  }
}
