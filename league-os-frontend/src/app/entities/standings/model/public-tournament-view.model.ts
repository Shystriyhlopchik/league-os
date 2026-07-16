import { StandingRow } from './standings-row.model';

export interface PublicTournamentView {
    tournament: {
        id: number;
        name: string;
        description?: string;
        logoUrl?: string;
        colorPrimary?: string;
        lifecycleStatus?: string;
    };
    activeStageId: number | null;
    stages: PublicTournamentStage[];
}

export interface PublicTournamentStage {
    id: number | null;
    key: string;
    name: string;
    type: 'round_robin' | 'group_stage' | 'knockout';
    order: number;
    status: 'pending' | 'active' | 'completed' | 'legacy';
    startDate?: string;
    endDate?: string;
    groups: Array<{
        id: number;
        key: string;
        name: string;
        order: number;
        standings: StandingRow[];
    }>;
    standings: StandingRow[];
    crossGroupRankings: Array<{
        id: string;
        title: string;
        sourcePosition: number;
        criteria: string[];
        rows: Array<
            StandingRow & {
                sourceGroup: { id: number; key: string; name: string };
                crossGroupPosition: number;
            }
        >;
    }>;
    bracket: {
        confirmed: boolean;
        matches: PublicBracketMatch[];
    };
    empty: boolean;
}

export interface PublicBracketMatch {
    id?: number;
    position: string;
    roundType:
        | 'round_robin'
        | 'group_round'
        | 'round_of_32'
        | 'round_of_16'
        | 'quarter_final'
        | 'semi_final'
        | 'third_place'
        | 'final';
    roundNumber: number;
    status: 'scheduled' | 'in_progress' | 'finished' | 'cancelled' | 'pending';
    homeTeam?: StandingRow['team'];
    awayTeam?: StandingRow['team'];
    homeSourceLabel: string;
    awaySourceLabel: string;
    regularTime?: { home: number; away: number };
    extraTime?: { home: number; away: number };
    penalties?: {
        home: number;
        away: number;
        homeKicksTaken?: number;
        awayKicksTaken?: number;
    };
    resolutionType?:
        | 'regular_time'
        | 'extra_time'
        | 'penalties'
        | 'technical'
        | 'walkover';
    winnerTeamId?: number;
    administrativeDecision?: {
        type: 'technical_result' | 'walkover';
        label: string;
    };
}

export interface PublicSuspension {
    id: number;
    stageId?: number;
    stageName?: string;
    player: { id: number; name: string };
    team: { id: number; name: string; logoUrl?: string };
    reason: string;
    matchesRequired: number;
    matchesServed: number;
    matchesRemaining: number;
    sourceMatchId?: number;
    manualDecisionId?: number;
}
