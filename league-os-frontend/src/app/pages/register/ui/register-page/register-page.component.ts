import { Component } from '@angular/core';

import { RegisterFormComponent } from '../../../../features/auth/register/ui/register-form/register-form.component';

@Component({
    selector: 'app-register-page',
    imports: [RegisterFormComponent],
    templateUrl: './register-page.component.html',
    styleUrl: './register-page.component.scss',
})
export class RegisterPageComponent {}
