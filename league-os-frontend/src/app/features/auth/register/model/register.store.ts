import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthApi } from '../../../../entities/user/api/auth.api';
import {
    PlayerLinkCandidate,
    RegisterDto,
} from '../../../../entities/user/model/auth.types';
import { SessionStore } from '../../../../entities/user/model/session.store';

@Injectable()
export class RegisterStore {
    private readonly authApi = inject(AuthApi);
    private readonly sessionStore = inject(SessionStore);
    private readonly router = inject(Router);

    readonly isLoading = signal(false);
    readonly isLinking = signal(false);
    readonly error = signal<string | null>(null);
    readonly linkError = signal<string | null>(null);
    readonly playerLinkCandidates = signal<PlayerLinkCandidate[]>([]);

    readonly hasPlayerLinkCandidates = computed(() => {
        return this.playerLinkCandidates().length > 0;
    });

    register(dto: RegisterDto): void {
        this.isLoading.set(true);
        this.error.set(null);
        this.linkError.set(null);
        this.playerLinkCandidates.set([]);

        this.authApi
            .register(dto)
            .pipe(finalize(() => this.isLoading.set(false)))
            .subscribe({
                next: (response) => {
                    this.sessionStore.setAuth(response);

                    const candidates = response.playerLinkCandidates ?? [];
                    this.playerLinkCandidates.set(candidates);

                    if (!candidates.length) {
                        this.router.navigate(['/dashboard']);
                    }
                },
                error: (err) => {
                    this.error.set(
                        err?.error?.message || 'Не удалось зарегистрироваться',
                    );
                },
            });
    }

    confirmPlayerLink(candidate: PlayerLinkCandidate): void {
        this.isLinking.set(true);
        this.linkError.set(null);

        this.authApi
            .confirmPlayerLink({
                teamPlayerId: candidate.teamPlayerId,
            })
            .pipe(finalize(() => this.isLinking.set(false)))
            .subscribe({
                next: (response) => {
                    this.sessionStore.setAuth(response);
                    this.router.navigate(['/dashboard']);
                },
                error: (err) => {
                    this.linkError.set(
                        err?.error?.message || 'Не удалось привязать игрока',
                    );
                },
            });
    }

    skipPlayerLink(): void {
        this.router.navigate(['/dashboard']);
    }
}
