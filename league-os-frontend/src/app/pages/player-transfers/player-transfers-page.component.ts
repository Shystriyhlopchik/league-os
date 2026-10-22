import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PlayerTransfersApi } from '../../entities/player-transfer/api/player-transfers.api';
import { PlayerTransfer } from '../../entities/player-transfer/model/player-transfer.types';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

@Component({
    selector: 'app-player-transfers-page', imports: [PageHeaderComponent, RouterLink],
    templateUrl: './player-transfers-page.component.html', styleUrl: './player-transfers-page.component.scss',
})
export class PlayerTransfersPageComponent {
    private readonly router = inject(Router);
    readonly transfers = signal<PlayerTransfer[]>([]);
    readonly isLoading = signal(true);
    readonly error = signal('');
    constructor() {
        inject(PlayerTransfersApi).getAll().subscribe({ next: transfers => { this.transfers.set(transfers); this.isLoading.set(false); }, error: () => { this.error.set('Не удалось загрузить историю'); this.isLoading.set(false); } });
    }
    goBack() { void this.router.navigate(['/dashboard']); }
    getTransferPlayerName(transfer: PlayerTransfer) { return [transfer.player.lastName, transfer.player.firstName, transfer.player.middleName].filter(Boolean).join(' '); }
}
