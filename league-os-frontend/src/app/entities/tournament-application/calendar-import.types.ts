export type CalendarImportKind = 'group' | 'team' | 'venue';
export interface CalendarImportRow {
    row: number; group: string; roundNumber: number; home: string; away: string;
    date: string; time: string; venue: string;
}
export interface CalendarImportMapping { kind: CalendarImportKind; source: string; id: number }
export interface CalendarImportRequest { mode: 'append' | 'replace'; rows: CalendarImportRow[]; mappings: CalendarImportMapping[] }
export interface CalendarImportPreview {
    valid: boolean; version: string; sourceRows: CalendarImportRow[];
    rows: (CalendarImportRow & { action: 'add' | 'skip' | 'error'; errors: string[]; warnings: string[]; matchDatetime: string | null })[];
    sources: { kind: CalendarImportKind; source: string; id: number | null }[];
    references: {
        groups: { id: number; key: string; name: string }[];
        teams: { id: number; name: string; groupId: number }[];
        venues: { id: number; name: string }[];
    };
    errors: { row: number; message: string }[];
    warnings: { row: number; message: string }[];
    createCount: number; skipCount: number; cancelCount: number; totalAfterImport: number; expectedMatches: number;
}
