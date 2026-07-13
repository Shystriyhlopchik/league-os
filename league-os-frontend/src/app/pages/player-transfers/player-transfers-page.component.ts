import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { TeamsApi } from '../../entities/team/api/teams.api';
import { Team } from '../../entities/team/model/team.types';
import { TeamPlayersApi } from '../../entities/team-player/api/team-players.api';
import { TeamPlayer } from '../../entities/team-player/model/team-player.types';
import { PlayerTransfersApi } from '../../entities/player-transfer/api/player-transfers.api';
import { PlayerTransfer } from '../../entities/player-transfer/model/player-transfer.types';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

@Component({
    selector: 'app-player-transfers-page',
    imports: [FormsModule, PageHeaderComponent],
    templateUrl: './player-transfers-page.component.html',
    styleUrl: './player-transfers-page.component.scss',
})
export class PlayerTransfersPageComponent implements OnInit {
    private readonly router = inject(Router);
    private readonly teamsApi = inject(TeamsApi);
    private readonly teamPlayersApi = inject(TeamPlayersApi);
    private readonly transfersApi = inject(PlayerTransfersApi);

    readonly teams = signal<Team[]>([]);
    readonly players = signal<TeamPlayer[]>([]);
    readonly transfers = signal<PlayerTransfer[]>([]);
    readonly isLoading = signal(false);
    readonly isSaving = signal(false);
    readonly error = signal('');
    readonly message = signal('');

    fromTeamId: number | null = null;
    playerId: number | null = null;
    toTeamId: number | null = null;
    shirtNumber: number | null = null;
    isCaptain = false;
    comment = '';

    ngOnInit(): void {
        this.isLoading.set(true);
        forkJoin({ teams: this.teamsApi.getTeams(), transfers: this.transfersApi.getAll() })
            .subscribe({
                next: ({ teams, transfers }) => {
                    this.teams.set(teams);
                    this.transfers.set(transfers);
                    this.isLoading.set(false);
                },
                error: () => {
                    this.error.set('Не удалось загрузить данные трансферов');
                    this.isLoading.set(false);
                },
            });
    }

    onFromTeamChange(): void {
        this.playerId = null;
        this.players.set([]);
        if (!this.fromTeamId) return;
        this.teamPlayersApi.getByTeam(this.fromTeamId).subscribe({
            next: (players) => this.players.set(players),
            error: () => this.error.set('Не удалось загрузить игроков команды'),
        });
    }

    submit(): void {
        if (!this.fromTeamId || !this.toTeamId || !this.playerId || this.isSaving()) {
            this.error.set('Выберите исходную команду, игрока и новую команду');
            return;
        }
        this.isSaving.set(true);
        this.error.set('');
        this.message.set('');
        this.transfersApi.create({
            playerId: this.playerId,
            fromTeamId: this.fromTeamId,
            toTeamId: this.toTeamId,
            shirtNumber: this.shirtNumber ?? undefined,
            isCaptain: this.isCaptain,
            comment: this.comment.trim() || undefined,
        }).subscribe({
            next: (transfer) => {
                this.transfers.update((items) => [transfer, ...items]);
                this.message.set('Трансфер успешно оформлен');
                this.isSaving.set(false);
                this.playerId = null;
                this.shirtNumber = null;
                this.isCaptain = false;
                this.comment = '';
                this.onFromTeamChange();
            },
            error: (error) => {
                this.error.set(error?.error?.message || 'Не удалось оформить трансфер');
                this.isSaving.set(false);
            },
        });
    }

    getPlayerName(player: TeamPlayer): string {
        return [player.player.lastName, player.player.firstName, player.player.middleName]
            .filter(Boolean).join(' ');
    }

    getTransferPlayerName(transfer: PlayerTransfer): string {
        return [transfer.player.lastName, transfer.player.firstName, transfer.player.middleName]
            .filter(Boolean).join(' ');
    }

    goBack(): void { this.router.navigate(['/dashboard']); }
}
