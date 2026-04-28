import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { BreadcrumbsComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { HomeComponent } from '../home/home.component';

@Component({
    selector: 'app-main',
    imports: [RouterOutlet, BreadcrumbsComponent, HomeComponent],
    templateUrl: './main.component.html',
    styleUrl: './main.component.css',
})
export class MainComponent {
    get isHomePage(): boolean {
        return this.router.url === '/';
    }

    constructor(private router: Router) {}
}
