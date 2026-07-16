import { AppDataSource } from './data-source';

interface AuditRow {
  tournamentId: number;
  stageId: number;
  ruleVersionId: number;
  dataEquivalent: boolean | null;
  expectedMatches: number;
  actualMatches: number;
  expectedParticipants: number;
  actualParticipants: number;
  matchesWithoutStage: number;
  standingsWithoutStage: number;
  activeSuspensionsWithoutStage: number;
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const tableExists = await AppDataSource.query(`
      SELECT to_regclass('public.legacy_tournament_migration_audit') IS NOT NULL AS "exists"
    `);
    if (!tableExists[0]?.exists) {
      throw new Error(
        'legacy_tournament_migration_audit is missing; run migrations first',
      );
    }

    const rows = (await AppDataSource.query(`
      SELECT
        audit."tournament_id" AS "tournamentId",
        audit."stage_id" AS "stageId",
        audit."rule_version_id" AS "ruleVersionId",
        audit."data_equivalent" AS "dataEquivalent",
        audit."legacy_match_count" AS "expectedMatches",
        (
          SELECT COUNT(*)::integer
          FROM "matches" match
          WHERE match."tournament_id" = audit."tournament_id"
            AND match."stage_id" = audit."stage_id"
        ) AS "actualMatches",
        audit."legacy_participant_count" AS "expectedParticipants",
        (
          SELECT COUNT(*)::integer
          FROM "tournament_stage_participants" participant
          WHERE participant."stage_id" = audit."stage_id"
        ) AS "actualParticipants",
        (
          SELECT COUNT(*)::integer
          FROM "matches" match
          WHERE match."tournament_id" = audit."tournament_id"
            AND match."stage_id" IS NULL
        ) AS "matchesWithoutStage",
        (
          SELECT COUNT(*)::integer
          FROM "standings" standing
          WHERE standing."tournament_id" = audit."tournament_id"
            AND standing."stage_id" IS NULL
        ) AS "standingsWithoutStage",
        (
          SELECT COUNT(*)::integer
          FROM "player_suspensions" suspension
          WHERE suspension."tournament_id" = audit."tournament_id"
            AND suspension."status" = 'active'
            AND suspension."stage_id" IS NULL
        ) AS "activeSuspensionsWithoutStage"
      FROM "legacy_tournament_migration_audit" audit
      ORDER BY audit."tournament_id"
    `)) as AuditRow[];

    const differences = rows.filter(
      (row) =>
        row.dataEquivalent !== true ||
        row.expectedMatches !== row.actualMatches ||
        row.expectedParticipants !== row.actualParticipants ||
        row.matchesWithoutStage !== 0 ||
        row.standingsWithoutStage !== 0 ||
        row.activeSuspensionsWithoutStage !== 0 ||
        !row.stageId ||
        !row.ruleVersionId,
    );

    console.log(
      JSON.stringify(
        {
          checkedTournaments: rows.length,
          passed: rows.length - differences.length,
          differences,
        },
        null,
        2,
      ),
    );
    if (differences.length) process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
