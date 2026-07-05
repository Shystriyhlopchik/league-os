export interface User {
    id: number;
    email: string | null;
    username: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    roles: string[];
    linkedPlayer?: LinkedPlayer | null;
    captainTeamIds?: number[];
    manageableTeamIds?: number[];
}

export interface LinkedPlayer {
    id: number;
    firstName: string;
    lastName: string;
    middleName?: string | null;
}
