export interface Player {
    id: number;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    slug: string;
    birthDate?: string | null;
    photoUrl?: string | null;
    position?: string | null;
    isActive: boolean;
}

export interface TeamPlayer {
    id: number;
    teamId: number;
    playerId: number;
    shirtNumber?: number | null;
    position?: string | null;
    isCaptain: boolean;
    isActive: boolean;
    joinedAt?: string | null;
    leftAt?: string | null;
    player: Player;
}

export interface CreateTeamPlayerDto {
    firstName: string;
    lastName: string;
    middleName?: string | null;
    shirtNumber?: number | null;
    position?: string | null;
    isCaptain?: boolean;
}
