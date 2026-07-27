import { Component, computed, inject } from '@angular/core';
import { SessionStore } from '../../../../entities/user/model/session.store';
import { DashboardAction } from '../../model/dashboard-action.model';
import { Router, RouterLink } from '@angular/router';
import { UserRole } from '../../../../entities/user/model/user-role.type';
import {InfoCardComponent} from '../../../../shared/ui/info-card/info-card.component';
import { FeatureFlagsApi } from '../../../../shared/api/feature-flags.api';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
    selector: 'app-dashboard-page',
    imports: [RouterLink, InfoCardComponent],
    templateUrl: './dashboard-page.component.html',
    styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent {
    private readonly sessionStore = inject(SessionStore);
    private readonly router = inject(Router);
    private readonly featureFlagsApi = inject(FeatureFlagsApi);

    readonly user = this.sessionStore.user;

    readonly actions: DashboardAction[] = [
        {
            title: 'Конструктор турниров',
            description: 'Создание формата, этапов, групп, правил и плей-офф',
            route: '/dashboard/tournaments/new',
            roles: [UserRole.Admin, UserRole.SuperAdmin],
            variant: '#72DF9C',
            feature: 'tournamentBuilder',
        },
        {
            title: 'Трансферы игроков',
            description: 'Переход игрока из одной команды в другую',
            route: '/dashboard/player-transfers',
            roles: [UserRole.Admin, UserRole.SuperAdmin],
            variant: '#2ECC71',
        },
        {
            title: 'Назначение судей',
            description: 'Выбор арбитров и подтверждение расписания',
            route: '/admin/referees',
            roles: [UserRole.Admin, UserRole.SuperAdmin],
            variant: '#F8D100',
        },
        {
            title: 'Начать обслуживание матча',
            description: 'Протокол, события, счет и завершение игры',
            route: '/dashboard/match-service',
            roles: [UserRole.Referee, UserRole.Admin, UserRole.SuperAdmin],
            variant: '#F04E55',
        },
        {
            title: 'Ввод результата матча вручную',
            description: 'Ручное внесение счёта и событий матча',
            route: '/dashboard/match-results',
            roles: [UserRole.Referee, UserRole.Admin, UserRole.SuperAdmin],
            variant: '#F04E55',
        },
        {
            title: 'Моя команда',
            description: 'Регистрация, редактирование общей заявки',
            route: '/dashboard/team-players',
            roles: [UserRole.Admin, UserRole.SuperAdmin, UserRole.Captain],
            variant: '#2ECC71',
        },
        {
            title: 'Регистрация на игру',
            description: 'Заявка команды на игру',
            route: '/dashboard/match-registrations',
            roles: [UserRole.Admin, UserRole.SuperAdmin, UserRole.Captain],
            variant: '#2ECC71',
        },
        {
            title: 'Написать новость',
            description: 'Создание, редактирование и публикация новостей сайта',
            route: '/dashboard/new-news',
            roles: [UserRole.Admin, UserRole.SuperAdmin],
            variant: '#2ECC71',
        },
        {
            title: 'Редактирование протокола',
            description: 'Редактирование уже подписанных протоколов',
            route: '/dashboard/editing-protocol',
            roles: [UserRole.Admin, UserRole.SuperAdmin],
            variant: '#2ECC71',
        },
    ];

    readonly featureFlags = toSignal(this.featureFlagsApi.get(), {
        initialValue: {
            tournamentBuilder: false,
            multiStagePublicView: false,
        },
    });

    readonly availableActions = computed(() => {
        return this.actions.filter(
            (action) =>
                this.sessionStore.hasAnyRole(...action.roles) &&
                (!action.feature || this.featureFlags()[action.feature]),
        );
    });

    logout(): void {
        this.sessionStore.logout();
        this.router.navigate(['/']);
    }
}
