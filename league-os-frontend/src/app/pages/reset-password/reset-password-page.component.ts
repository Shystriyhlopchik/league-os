import { Component, computed, inject, signal } from '@angular/core';
import {
    FormControl,
    FormGroup,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthApi } from '../../entities/user/api/auth.api';

@Component({
    selector: 'app-reset-password-page',
    imports: [ReactiveFormsModule, RouterLink],
    templateUrl: './reset-password-page.component.html',
    styleUrl: './reset-password-page.component.scss',
})
export class ResetPasswordPageComponent {
    private readonly authApi = inject(AuthApi);
    private readonly route = inject(ActivatedRoute);

    readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';
    readonly isLoading = signal(false);
    readonly isPasswordVisible = signal(false);
    readonly message = signal<string | null>(null);
    readonly error = signal<string | null>(
        this.token ? null : 'В ссылке отсутствует токен сброса пароля',
    );
    readonly passwordInputType = computed(() =>
        this.isPasswordVisible() ? 'text' : 'password',
    );

    readonly form = new FormGroup({
        password: new FormControl('', {
            nonNullable: true,
            validators: [
                Validators.required,
                Validators.minLength(8),
                Validators.maxLength(128),
            ],
        }),
        passwordConfirmation: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required],
        }),
    });

    submit(): void {
        this.error.set(null);

        if (!this.token) {
            this.error.set('В ссылке отсутствует токен сброса пароля');
            return;
        }

        if (this.form.invalid || this.isLoading()) {
            this.form.markAllAsTouched();
            return;
        }

        const { password, passwordConfirmation } = this.form.getRawValue();

        if (password !== passwordConfirmation) {
            this.form.controls.passwordConfirmation.setErrors({
                mismatch: true,
            });
            return;
        }

        this.isLoading.set(true);
        this.authApi
            .resetPassword({ token: this.token, password })
            .pipe(finalize(() => this.isLoading.set(false)))
            .subscribe({
                next: ({ message }) => {
                    this.message.set(message);
                    this.form.disable();
                },
                error: (response) =>
                    this.error.set(
                        response?.error?.message ??
                            'Не удалось изменить пароль. Попробуйте ещё раз.',
                    ),
            });
    }

    togglePasswordVisibility(): void {
        this.isPasswordVisible.update((value) => !value);
    }
}
