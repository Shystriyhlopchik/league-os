export interface StandingRow {
    id: number;
    teamName: string;
    teamLogoUrl: string;
    games: number;
    points: number;
    movement: 'up' | 'same' | 'down';
}
