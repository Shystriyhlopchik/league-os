import { Component, ElementRef, inject, signal } from '@angular/core';
import {
    FormControl,
    FormGroup,
    ReactiveFormsModule,
    ValidatorFn,
    Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import { PlayerLinkCandidate } from '../../../../../entities/user/model/auth.types';
import { RegisterStore } from '../../model/register.store';

const requiredText: ValidatorFn = (control) =>
    typeof control.value === 'string' && control.value.trim()
        ? null
        : { required: true };

const matchingPasswords: ValidatorFn = (group) => {
    const password = group.get('password')?.value;
    const confirmation = group.get('passwordConfirmation')?.value;
    return password && confirmation && password !== confirmation
        ? { passwordMismatch: true }
        : null;
};

@Component({
    selector: 'app-register-form',
    imports: [ReactiveFormsModule, RouterLink],
    templateUrl: './register-form.component.html',
    styleUrl: './register-form.component.scss',
    providers: [RegisterStore],
})
export class RegisterFormComponent {
    readonly store = inject(RegisterStore);
    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
    readonly submitted = signal(false);

    readonly form = new FormGroup(
        {
            lastName: new FormControl('', {
                nonNullable: true,
                validators: [requiredText],
            }),
            firstName: new FormControl('', {
                nonNullable: true,
                validators: [requiredText],
            }),
            middleName: new FormControl('', {
                nonNullable: true,
            }),
            username: new FormControl('', {
                nonNullable: true,
                validators: [requiredText, Validators.minLength(3)],
            }),
            email: new FormControl('', {
                nonNullable: true,
                validators: [Validators.required, Validators.email],
            }),
            password: new FormControl('', {
                nonNullable: true,
                validators: [Validators.required, Validators.minLength(8)],
            }),
            passwordConfirmation: new FormControl('', {
                nonNullable: true,
                validators: [Validators.required],
            }),
        },
        { validators: matchingPasswords },
    );

    fieldError(name: keyof typeof this.form.controls): string | null {
        const control = this.form.controls[name];
        if (!control.touched && !control.dirty) return null;

        if (control.hasError('required')) {
            const messages: Record<keyof typeof this.form.controls, string> = {
                lastName: 'Введите фамилию.',
                firstName: 'Введите имя.',
                middleName: '',
                username: 'Введите логин.',
                email: 'Введите e-mail.',
                password: 'Введите пароль.',
                passwordConfirmation: 'Повторите пароль.',
            };
            return messages[name];
        }
        if (control.hasError('email'))
            return 'Введите корректный e-mail, например name@example.ru.';
        if (control.hasError('minlength')) {
            return name === 'username'
                ? 'Логин должен содержать не менее 3 символов.'
                : 'Пароль должен содержать не менее 8 символов.';
        }
        if (
            name === 'passwordConfirmation' &&
            this.form.hasError('passwordMismatch')
        ) {
            return 'Пароли не совпадают.';
        }
        return null;
    }

    submit(): void {
        if (this.store.isLoading()) return;

        for (const name of [
            'firstName',
            'lastName',
            'middleName',
            'username',
            'email',
        ] as const) {
            const control = this.form.controls[name];
            control.setValue(control.value.trim());
        }
        this.submitted.set(true);
        this.form.markAllAsTouched();

        if (this.form.invalid) {
            const firstInvalid = (
                Object.keys(this.form.controls) as Array<
                    keyof typeof this.form.controls
                >
            ).find((name) => this.fieldError(name));
            if (firstInvalid) {
                this.element.nativeElement
                    .querySelector<HTMLInputElement>(
                        `[formControlName="${firstInvalid}"]`,
                    )
                    ?.focus();
            }
            return;
        }

        const value = this.form.getRawValue();
        this.store.register({
            username: value.username.trim(),
            email: value.email.trim(),
            password: value.password,
            firstName: value.firstName.trim(),
            lastName: value.lastName.trim(),
            middleName: value.middleName.trim() || null,
        });
    }

    confirmPlayerLink(candidate: PlayerLinkCandidate): void {
        this.store.confirmPlayerLink(candidate);
    }

    getPlayerFullName(candidate: PlayerLinkCandidate): string {
        const { lastName, firstName, middleName } = candidate.player;

        return [lastName, firstName, middleName].filter(Boolean).join(' ');
    }
}
