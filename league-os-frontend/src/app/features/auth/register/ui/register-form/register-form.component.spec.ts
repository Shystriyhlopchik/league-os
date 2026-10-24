import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { RegisterStore } from '../../model/register.store';
import { RegisterFormComponent } from './register-form.component';

describe('RegisterFormComponent', () => {
    let fixture: ComponentFixture<RegisterFormComponent>;
    let component: RegisterFormComponent;
    let store: {
        register: jasmine.Spy;
        isLoading: ReturnType<typeof signal<boolean>>;
        error: ReturnType<typeof signal<string | null>>;
        hasPlayerLinkCandidates: () => boolean;
    };

    const validValue = {
        firstName: 'Иван',
        lastName: 'Иванов',
        middleName: '',
        username: 'ivan',
        email: 'ivan@example.ru',
        password: 'password123',
        passwordConfirmation: 'password123',
    };

    beforeEach(async () => {
        store = {
            register: jasmine.createSpy('register'),
            isLoading: signal(false),
            error: signal<string | null>(null),
            hasPlayerLinkCandidates: () => false,
        };
        await TestBed.configureTestingModule({
            imports: [RegisterFormComponent],
            providers: [provideRouter([])],
        })
            .overrideComponent(RegisterFormComponent, {
                set: {
                    providers: [{ provide: RegisterStore, useValue: store }],
                },
            })
            .compileComponents();
        fixture = TestBed.createComponent(RegisterFormComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    function submitForm() {
        fixture.nativeElement.querySelector('button[type="submit"]').click();
        fixture.detectChanges();
    }

    it('shows requirements without errors before the user interacts', () => {
        expect(fixture.nativeElement.textContent).toContain(
            'Не менее 3 символов',
        );
        expect(fixture.nativeElement.textContent).toContain(
            'Не менее 8 символов',
        );
        expect(
            fixture.nativeElement.querySelector('[role="alert"]'),
        ).toBeNull();
        expect(
            fixture.nativeElement.querySelector('.register-form__field-error'),
        ).toBeNull();
        expect(
            fixture.nativeElement.querySelector('button[type="submit"]')
                .disabled,
        ).toBeFalse();
    });

    it('explains every missing required field on submit and focuses the first one', () => {
        const firstInput = fixture.nativeElement.querySelector(
            '[formControlName="lastName"]',
        );
        const focus = spyOn(firstInput, 'focus');
        submitForm();
        expect(store.register).not.toHaveBeenCalled();
        expect(
            fixture.nativeElement.querySelector('[role="alert"]').textContent,
        ).toContain('Регистрация не отправлена');
        expect(
            fixture.nativeElement.querySelectorAll(
                '.register-form__field-error',
            ).length,
        ).toBe(6);
        expect(firstInput.getAttribute('aria-invalid')).toBe('true');
        expect(firstInput.getAttribute('aria-describedby')).toBe(
            'register-last-name-error',
        );
        expect(focus).toHaveBeenCalled();
    });

    it('shows required feedback after leaving a blank field', () => {
        fixture.nativeElement
            .querySelector('[formControlName="firstName"]')
            .dispatchEvent(new Event('blur'));
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Введите имя.');
        expect(
            fixture.nativeElement.querySelector('[role="alert"]'),
        ).toBeNull();
    });

    it('explains invalid email and minimum username and password lengths', () => {
        component.form.setValue({
            ...validValue,
            username: 'ab',
            email: 'invalid',
            password: '1234567',
            passwordConfirmation: '1234567',
        });
        submitForm();
        expect(store.register).not.toHaveBeenCalled();
        expect(fixture.nativeElement.textContent).toContain(
            'Введите корректный e-mail',
        );
        expect(fixture.nativeElement.textContent).toContain(
            'Логин должен содержать не менее 3 символов.',
        );
        expect(fixture.nativeElement.textContent).toContain(
            'Пароль должен содержать не менее 8 символов.',
        );
    });

    it('rejects whitespace-only names and username', () => {
        component.form.setValue({
            ...validValue,
            firstName: '   ',
            lastName: '   ',
            username: '   ',
        });
        submitForm();
        expect(store.register).not.toHaveBeenCalled();
        expect(fixture.nativeElement.textContent).toContain('Введите имя.');
        expect(fixture.nativeElement.textContent).toContain('Введите фамилию.');
        expect(fixture.nativeElement.textContent).toContain('Введите логин.');
    });

    it('validates username length after trimming', () => {
        component.form.setValue({ ...validValue, username: ' ab ' });
        submitForm();
        expect(store.register).not.toHaveBeenCalled();
        expect(fixture.nativeElement.textContent).toContain(
            'Логин должен содержать не менее 3 символов.',
        );
    });

    it('explains mismatched passwords and clears the error when the original password is corrected', () => {
        component.form.setValue({
            ...validValue,
            passwordConfirmation: 'different123',
        });
        submitForm();
        expect(store.register).not.toHaveBeenCalled();
        expect(fixture.nativeElement.textContent).toContain(
            'Пароли не совпадают.',
        );

        component.form.controls.password.setValue('different123');
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).not.toContain(
            'Пароли не совпадают.',
        );
        expect(
            fixture.nativeElement.querySelector('[role="alert"]'),
        ).toBeNull();
        submitForm();
        expect(store.register).toHaveBeenCalledTimes(1);
    });

    it('clears mismatch feedback when the confirmation is corrected', () => {
        component.form.setValue({
            ...validValue,
            passwordConfirmation: 'different123',
        });
        submitForm();
        component.form.controls.passwordConfirmation.setValue(
            validValue.password,
        );
        submitForm();
        expect(store.register).toHaveBeenCalledTimes(1);
        expect(fixture.nativeElement.textContent).not.toContain(
            'Пароли не совпадают.',
        );
    });

    it('shows newly introduced mismatches after a password change', () => {
        component.form.setValue(validValue);
        component.form.controls.passwordConfirmation.markAsTouched();
        component.form.controls.password.setValue('different123');
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain(
            'Пароли не совпадают.',
        );
        expect(component.form.invalid).toBeTrue();
    });

    it('submits trimmed details, accepts optional middle name and preserves password spaces', () => {
        component.form.setValue({
            ...validValue,
            firstName: ' Иван ',
            lastName: ' Иванов ',
            username: ' ivan ',
            email: ' ivan@example.ru ',
            middleName: '   ',
            password: ' password123 ',
            passwordConfirmation: ' password123 ',
        });
        submitForm();
        expect(store.register).toHaveBeenCalledOnceWith({
            firstName: 'Иван',
            lastName: 'Иванов',
            middleName: null,
            username: 'ivan',
            email: 'ivan@example.ru',
            password: ' password123 ',
        });
        expect(
            fixture.nativeElement.querySelector('[role="alert"]'),
        ).toBeNull();
    });

    it('prevents duplicate submissions while a request is running', () => {
        component.form.setValue(validValue);
        store.isLoading.set(true);
        component.submit();
        fixture.detectChanges();
        expect(store.register).not.toHaveBeenCalled();
        expect(
            fixture.nativeElement.querySelector('button[type="submit"]')
                .disabled,
        ).toBeTrue();
        expect(fixture.nativeElement.textContent).toContain('Регистрируем...');
    });

    it('continues displaying server errors as an alert', () => {
        store.error.set('Этот e-mail уже зарегистрирован');
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('[role="alert"]').textContent,
        ).toContain('Этот e-mail уже зарегистрирован');
    });
});
