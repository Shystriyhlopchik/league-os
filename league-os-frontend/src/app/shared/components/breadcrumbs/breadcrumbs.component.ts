import { Component, computed, signal } from '@angular/core';
import {
    ActivatedRoute,
    NavigationEnd,
    Router,
    RouterLink,
} from '@angular/router';
import { filter } from 'rxjs';

interface Breadcrumb {
    label: string;
    url: string;
}

@Component({
    selector: 'app-breadcrumbs',
    imports: [RouterLink],
    templateUrl: './breadcrumbs.component.html',
    styleUrl: './breadcrumbs.component.scss',
})
export class BreadcrumbsComponent {
    private currentUrl = signal<NavigationEnd | null>(null);

    breadcrumbs = computed(() => {
        const event = this.currentUrl();
        console.log(event, this.route.root);
        if (!event || event.url === '/') return [];
        return this.buildBreadcrumbs(this.route.root);
    });

    constructor(
        private router: Router,
        private route: ActivatedRoute,
    ) {
        this.router.events
            .pipe(filter((event) => event instanceof NavigationEnd))
            .subscribe((event) => this.currentUrl.set(event as NavigationEnd));
    }

    private buildBreadcrumbs(
        route: ActivatedRoute,
        url: string = '',
        breadcrumbs: Breadcrumb[] = [],
    ): Breadcrumb[] {
        const children = route.children;

        for (const child of children) {
            const routeURL = child.snapshot.url
                .map((segment) => segment.path)
                .join('/');
            const nextUrl = routeURL ? `${url}/${routeURL}` : url;

            const label = child.snapshot.data['breadcrumb'];
            if (label) {
                breadcrumbs.push({ label, url: nextUrl });
            }

            this.buildBreadcrumbs(child, nextUrl, breadcrumbs);
        }

        return breadcrumbs;
    }
}
