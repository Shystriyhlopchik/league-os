import {Component, computed, inject, signal} from '@angular/core';
import {
    FormControl,
    FormGroup,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import {LoginStore} from '../../model/login.store.';
import {RouterLink} from '@angular/router';

@Component({
    selector: 'app-login-form',
    imports: [ReactiveFormsModule, RouterLink],
    templateUrl: './login-form.component.html',
    styleUrl: './login-form.component.scss',
    providers: [LoginStore]
})
export class LoginFormComponent {
    readonly store = inject(LoginStore);

    readonly isPasswordVisible = signal(false);

    readonly error = signal<string | null>(null);

    readonly passwordInputType = computed(() => {
        return this.isPasswordVisible() ? 'text' : 'password';
    });

    readonly form = new FormGroup({
        login: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required, Validators.email],
        }),
        password: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required],
        }),
        rememberMe: new FormControl(true, {
            nonNullable: true,
        }),
    });

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();

            return;
        }

        const { login, password } = this.form.getRawValue();

        this.store.login({
            login,
            password,
        });
    }

    togglePasswordVisibility(): void {
        this.isPasswordVisible.update((value) => !value);
    }
}
