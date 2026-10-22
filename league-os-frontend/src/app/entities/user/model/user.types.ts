export interface User {
    id: number;
    email: string | null;
    username: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    roles: string[];
    communities?: {
        id: number;
        name: string;
        slug: string;
        role: 'owner' | 'admin' | 'member';
    }[];
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
