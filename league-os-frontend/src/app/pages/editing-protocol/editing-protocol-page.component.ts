import { DatePipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { InfoCardComponent } from '../../shared/ui/info-card/info-card.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { EditingProtocolStore } from './editing-protocol.store';

@Component({
    selector: 'app-editing-protocol-page',
    imports: [DatePipe, InfoCardComponent, PageHeaderComponent],
    templateUrl: './editing-protocol-page.component.html',
    styleUrl: '../match-service/ui/match-service-page/match-service-page.component.scss',
    providers: [EditingProtocolStore],
})
export class EditingProtocolPageComponent implements OnInit {
    private readonly router = inject(Router);
    readonly store = inject(EditingProtocolStore);

    ngOnInit(): void {
        this.store.loadMatches();
    }

    goBack(): void {
        void this.router.navigate(['/dashboard']);
    }

    editProtocol(matchId: number): void {
        void this.router.navigate(['/dashboard/editing-protocol', matchId]);
    }
}
