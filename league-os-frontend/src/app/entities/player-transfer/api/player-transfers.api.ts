import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CreatePlayerTransferDto, PlayerTransfer } from '../model/player-transfer.types';

@Injectable({ providedIn: 'root' })
export class PlayerTransfersApi {
    private readonly http = inject(HttpClient);
    private readonly url = `${environment.apiUrl}/admin/player-transfers`;

    getAll(): Observable<PlayerTransfer[]> {
        return this.http.get<PlayerTransfer[]>(this.url);
    }

    create(dto: CreatePlayerTransferDto): Observable<PlayerTransfer> {
        return this.http.post<PlayerTransfer>(this.url, dto);
    }
}
