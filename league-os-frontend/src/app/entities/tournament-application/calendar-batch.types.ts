export interface CalendarBatchChange {
    id: number;
    expectedRevision: number;
    roundNumber?: number;
    postponed: boolean;
    matchDatetime?: string;
    venueId?: number;
    durationMinutes: number;
}
export interface CalendarBatchRequest {
    requestId: string;
    reason: string;
    changes: CalendarBatchChange[];
}
export interface CalendarBatchIssue {
    matchId?: number;
    otherMatchId?: number;
    field: string;
    message: string;
}
export interface CalendarBatchPreview {
    valid: boolean;
    version?: string;
    replayed: boolean;
    updatedCount: number;
    issues: CalendarBatchIssue[];
    warnings: string[];
    changes: {
        id: number;
        match: string;
        before: CalendarScheduleState;
        after: CalendarScheduleState;
    }[];
}
export interface CalendarScheduleState {
    roundNumber: number | null;
    matchDatetime: string | null;
    venueId: number | null;
    durationMinutes: number;
    postponed: boolean;
}
export interface CalendarBatchResult {
    updatedCount: number;
    replayed: boolean;
    requestId: string;
}
