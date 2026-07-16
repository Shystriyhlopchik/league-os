export type TournamentLifecycleStatus =
    | 'draft'
    | 'published'
    | 'in_progress'
    | 'completed';

export type TournamentTemplateId =
    | 'round_robin'
    | 'knockout'
    | 'groups_playoff'
    | 'yard_league'
    | 'clone';

export type TournamentStageType =
    | 'round_robin'
    | 'group_stage'
    | 'knockout';

export type TieBreakerType =
    | 'points'
    | 'head_to_head'
    | 'wins'
    | 'goal_difference'
    | 'goals_for'
    | 'goals_against'
    | 'disciplinary_score'
    | 'technical_loss'
    | 'manual_decision'
    | 'draw';

export type CrossGroupCriterion =
    | 'points'
    | 'wins'
    | 'goal_difference'
    | 'goals_for'
    | 'goals_against_asc'
    | 'disciplinary_score_asc'
    | 'draw_lots';

export interface TournamentDetailsDraft {
    seasonId: number;
    name: string;
    slug: string;
    description: string;
    type: 'league' | 'cup' | 'friendly' | 'superCup';
    format: 'round_robin' | 'knockout' | 'mixed' | 'final';
    startDate: string;
    endDate: string;
    colorPrimary: string;
    colorSecondary: string;
    logoUrl: string;
}

export interface TournamentGroupDraft {
    clientKey: string;
    serverId?: number;
    key: string;
    name: string;
    order: number;
    capacity?: number;
}

export interface TournamentStageDraft {
    clientKey: string;
    serverId?: number;
    key: string;
    name: string;
    type: TournamentStageType;
    order: number;
    startDate: string;
    endDate: string;
    legs: 1 | 2 | 3 | 4;
    groups: TournamentGroupDraft[];
    bracketSize?: 2 | 4 | 8 | 16 | 32;
    thirdPlaceMatch?: boolean;
}

export interface TournamentParticipantDraft {
    teamId: number;
    tournamentTeamId?: number;
    stageParticipantId?: number;
    name: string;
    shortName?: string | null;
    logoUrl?: string | null;
    pot?: number;
    groupKey?: string;
    seedNumber?: number;
}

export interface ScoringDraft {
    win: number;
    draw: number;
    loss: number;
    technicalWin: number;
    technicalLoss: number;
}

export interface QualificationDraft {
    enabled: boolean;
    winnersPerGroup: number;
    bestPlacedSourcePosition: number;
    bestPlacedCount: number;
    crossGroupCriteria: CrossGroupCriterion[];
    confirmationRequired: true;
}

export interface PlayoffDraft {
    enabled: boolean;
    bracketSize: 2 | 4 | 8 | 16 | 32;
    seeding:
        | 'standard'
        | 'random_draw'
        | 'manual'
        | 'best_eligible_opponent';
    avoidSameSourceGroup: boolean;
    constraintMode: 'required' | 'best_effort';
    thirdPlaceMatch: boolean;
    candidateRanking: CrossGroupCriterion[];
}

export interface MatchRulesDraft {
    periods: number;
    periodDurationMinutes: number | null;
    allowDraw: boolean;
    extraTimeEnabled: boolean;
    extraTimePeriods: number;
    extraTimePeriodDurationMinutes: number;
    penaltiesEnabled: boolean;
    initialKicksPerTeam: number;
    suddenDeath: true;
}

export interface DisciplineDraft {
    accumulatedYellowsEnabled: boolean;
    yellowThreshold: number;
    suspensionMatches: number;
    yellowProgression:
        | 'reset_after_suspension'
        | 'every_card_after_threshold'
        | 'repeat_every_threshold';
    secondYellowEnabled: boolean;
    secondYellowMinimumMatches: number;
    directRedEnabled: boolean;
    directRedMinimumMatches: number;
    allowManualExtension: boolean;
    carryYellowCards: boolean;
    carryPendingSuspensions: boolean;
}

export interface TournamentBuilderDraft {
    draftSchemaVersion: 1;
    localId: string;
    tournamentId?: number;
    ruleVersionId?: number;
    lifecycleStatus: TournamentLifecycleStatus;
    templateId: TournamentTemplateId;
    currentStep: number;
    details: TournamentDetailsDraft;
    stages: TournamentStageDraft[];
    participants: TournamentParticipantDraft[];
    removedStageParticipantIds: number[];
    groupAssignmentStrategy: 'manual' | 'pots' | 'random';
    scoring: ScoringDraft;
    tieBreakers: TieBreakerType[];
    qualification: QualificationDraft;
    playoff: PlayoffDraft;
    groupMatchRules: MatchRulesDraft;
    playoffMatchRules: MatchRulesDraft;
    discipline: DisciplineDraft;
    changeSummary: string;
    savedAt?: string;
}

export interface TournamentValidationIssue {
    path: string;
    message: string;
    code?: string;
}

export interface TournamentValidationResult {
    valid: boolean;
    errors: TournamentValidationIssue[];
    warnings?: TournamentValidationIssue[];
}

export interface SchedulePreviewMatch {
    round: number;
    groupKey?: string;
    home: string;
    away: string;
}

export interface TournamentBuilderPreviews {
    schedule: SchedulePreviewMatch[];
    qualification: string[];
    bracket: Array<{ position: string; home: string; away: string }>;
    backend?: unknown;
}

export interface TournamentRulesConfigV1 {
    schemaVersion: 1;
    stages: Array<Record<string, unknown>>;
    transitions: Array<Record<string, unknown>>;
}

export interface SavedTournamentDraftSummary {
    storageKey: string;
    tournamentId?: number;
    name: string;
    savedAt?: string;
}
