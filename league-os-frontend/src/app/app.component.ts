import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './widgets/header/header.component';
import { HomeComponent } from './features/home/home.component';
import { FooterComponent } from './widgets/footer/footer.component';
import { BreadcrumbsComponent } from './shared/components/breadcrumbs/breadcrumbs.component';
import { MainComponent } from './features/main/main.component';
import { SessionStore } from './entities/user/model/session.store';

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
export class AppComponent implements OnInit {
    private readonly sessionStore = inject(SessionStore);

    ngOnInit(): void {
        this.sessionStore.init();
    }
}
