import { Team } from '../../team/model/team.types';

export interface TransferPlayer {
    id: number;
    firstName: string;
    lastName: string;
    middleName?: string | null;
}

export interface PlayerTransfer {
    id: number;
    transferDate: string;
    comment?: string | null;
    player: TransferPlayer;
    fromTeam: Team;
    toTeam: Team;
    createdAt: string;
}

export interface CreatePlayerTransferDto {
    playerId: number;
    fromTeamId: number;
    toTeamId: number;
    shirtNumber?: number;
    isCaptain?: boolean;
    comment?: string;
}
