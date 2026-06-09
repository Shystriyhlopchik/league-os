import { inject, Injectable, signal } from '@angular/core';
import { AuthApi } from '../../../../entities/user/api/auth.api';
import { SessionStore } from '../../../../entities/user/model/session.store';
import { Router } from '@angular/router';
import { LoginDto } from '../../../../entities/user/model/auth.types';
import { finalize } from 'rxjs';

@Injectable()
export class LoginStore {
    private readonly authApi = inject(AuthApi);
    private readonly sessionStore = inject(SessionStore);
    private readonly router = inject(Router);

    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);

    login(dto: LoginDto): void {
        this.isLoading.set(true);
        this.error.set(null);

        this.authApi
            .login(dto)
            .pipe(finalize(() => this.isLoading.set(false)))
            .subscribe({
                next: (response) => {
                    this.sessionStore.setAuth(response);
                    this.router.navigate(['/dashboard']);
                },
                error: (err) => {
                    this.error.set(err.error.message);
                },
            });
    }
}
