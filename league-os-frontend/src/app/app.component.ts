import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './widgets/header/header.component';
import { HomeComponent } from './features/home/home.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { BreadcrumbsComponent } from './shared/components/breadcrumbs/breadcrumbs.component';
import { MainComponent } from './features/main/main.component';

@Component({
    selector: 'app-root',
    imports: [
        RouterOutlet,
        HeaderComponent,
        HomeComponent,
        FooterComponent,
        BreadcrumbsComponent,
        MainComponent,
    ],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
})
export class AppComponent {
    title = 'arman';
}
