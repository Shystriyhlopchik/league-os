import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header.component';
import { MatchRegistrationPlayer } from '../../../../entities/match-service/model/match-service.types';
import { MatchRegistrationDetailStore } from '../../model/match-registration-detail.store';

@Component({
    selector: 'app-match-registration-detail-page',
    imports: [PageHeaderComponent, DatePipe],
    templateUrl: './match-registration-detail-page.component.html',
    styleUrl: './match-registration-detail-page.component.scss',
    providers: [MatchRegistrationDetailStore],
})
export class MatchRegistrationDetailPageComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);

    readonly store = inject(MatchRegistrationDetailStore);
    readonly matchId = Number(this.route.snapshot.paramMap.get('matchId'));
    readonly teamId = Number(this.route.snapshot.paramMap.get('teamId'));
    readonly isRefereeFlow = this.router.url.startsWith('/dashboard/match-results/');
    readonly isCorrectionMode = this.router.url.startsWith(
        '/dashboard/editing-protocol/',
    );
    readonly pageTitle = this.isCorrectionMode
        ? 'Корректировка протокола участников'
        : 'Формирование заявки';
    readonly pageDescription = this.isCorrectionMode
        ? 'Уточните фактический состав команды в завершённом матче'
        : 'Выберите игроков команды для участия в матче';

    readonly availablePlayers = computed(() =>
        (this.store.registration()?.players ?? []).filter(
            (player) => player.eligibilityStatus !== 'not_allowed',
        ),
    );

    readonly unavailablePlayers = computed(() =>
        (this.store.registration()?.players ?? []).filter(
            (player) => player.eligibilityStatus === 'not_allowed',
        ),
    );

    ngOnInit(): void {
        this.store.load(
            this.matchId,
            this.teamId,
            this.isCorrectionMode,
        );
    }

    goBack(): void {
        if (this.isRefereeFlow) {
            this.router.navigate(['/dashboard/match-results', this.matchId]);
            return;
        }
        if (this.isCorrectionMode) {
            this.router.navigate([
                '/dashboard/editing-protocol',
                this.matchId,
            ]);
            return;
        }

        this.router.navigate(['/dashboard/match-registrations']);
    }

    onPlayerToggle(player: MatchRegistrationPlayer, event: Event): void {
        const checked = (event.target as HTMLInputElement).checked;
        this.store.toggle(player.teamPlayerId, checked);
    }

    save(): void {
        this.store.save(
            this.matchId,
            this.teamId,
            this.isCorrectionMode,
        );
    }

    approve(): void {
        this.store.approve(this.matchId, this.teamId);
    }

    getPlayerName(player: MatchRegistrationPlayer): string {
        return [player.lastName, player.firstName, player.middleName]
            .filter(Boolean)
            .join(' ');
    }

    getSuspensionText(player: MatchRegistrationPlayer): string {
        const labels = {
            four_yellows_suspension: 'Дисквалификация: 4 жёлтые карточки',
            red_card_suspension: 'Дисквалификация: прямая красная карточка',
            second_yellow_suspension: 'Дисквалификация: вторая жёлтая карточка',
            three_yellows: 'Предупреждение: 3 жёлтые карточки',
            none: '',
        } as const;

        return labels[player.eligibilityReason];
    }

    getPhotoUrl(photoUrl: string): string {
        if (/^https?:\/\//i.test(photoUrl)) return photoUrl;

        return photoUrl.startsWith('/') ? photoUrl : `/${photoUrl}`;
    }
}
