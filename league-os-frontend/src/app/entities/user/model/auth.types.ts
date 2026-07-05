import { User } from './user.types';

export interface LoginDto {
    login: string;
    password: string;
}

export interface RegisterDto {
    username: string;
    password: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    email?: string | null;
}

export interface PlayerLinkCandidate {
    teamPlayerId: number;
    playerId: number;
    teamId: number;
    teamName: string;
    isCaptain: boolean;
    player: {
        id: number;
        firstName: string;
        lastName: string;
        middleName?: string | null;
    };
}

export interface AuthResponse {
    accessToken: string;
    user: User;
    playerLinkCandidates?: PlayerLinkCandidate[];
}

export interface ConfirmPlayerLinkDto {
    teamPlayerId: number;
}
