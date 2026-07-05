import { Component, inject } from '@angular/core';
import {
    FormControl,
    FormGroup,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import { PlayerLinkCandidate } from '../../../../../entities/user/model/auth.types';
import { RegisterStore } from '../../model/register.store';

@Component({
    selector: 'app-register-form',
    imports: [ReactiveFormsModule, RouterLink],
    templateUrl: './register-form.component.html',
    styleUrl: './register-form.component.scss',
    providers: [RegisterStore],
})
export class RegisterFormComponent {
    readonly store = inject(RegisterStore);

    readonly form = new FormGroup({
        lastName: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required],
        }),
        firstName: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required],
        }),
        middleName: new FormControl('', {
            nonNullable: true,
        }),
        username: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required, Validators.minLength(3)],
        }),
        email: new FormControl('', {
            nonNullable: true,
            validators: [Validators.email],
        }),
        password: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required, Validators.minLength(6)],
        }),
        passwordConfirmation: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required],
        }),
    });

    submit(): void {
        if (this.form.invalid || this.store.isLoading()) {
            this.form.markAllAsTouched();
            return;
        }

        const value = this.form.getRawValue();

        if (value.password !== value.passwordConfirmation) {
            this.form.controls.passwordConfirmation.setErrors({
                passwordMismatch: true,
            });
            return;
        }

        this.store.register({
            username: value.username.trim(),
            email: value.email.trim() || null,
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
