import { Component, inject, signal } from '@angular/core';
import {
    FormControl,
    FormGroup,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthApi } from '../../entities/user/api/auth.api';

@Component({
    selector: 'app-forgot-password-page',
    imports: [ReactiveFormsModule, RouterLink],
    templateUrl: './forgot-password-page.component.html',
    styleUrl: './forgot-password-page.component.scss',
})
export class ForgotPasswordPageComponent {
    private readonly authApi = inject(AuthApi);

    readonly isLoading = signal(false);
    readonly message = signal<string | null>(null);
    readonly error = signal<string | null>(null);

    readonly form = new FormGroup({
        email: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required, Validators.email],
        }),
    });

    submit(): void {
        if (this.form.invalid || this.isLoading()) {
            this.form.markAllAsTouched();
            return;
        }

        this.isLoading.set(true);
        this.message.set(null);
        this.error.set(null);

        this.authApi
            .forgotPassword(this.form.getRawValue())
            .pipe(finalize(() => this.isLoading.set(false)))
            .subscribe({
                next: ({ message }) => this.message.set(message),
                error: () =>
                    this.error.set(
                        'Не удалось отправить запрос. Попробуйте ещё раз позже.',
                    ),
            });
    }
}
