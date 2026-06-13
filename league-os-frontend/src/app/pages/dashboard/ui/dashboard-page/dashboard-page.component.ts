import { Component, computed, inject } from '@angular/core';
import { SessionStore } from '../../../../entities/user/model/session.store';
import { DashboardAction } from '../../model/dashboard-action.model';
import { Router, RouterLink } from '@angular/router';
import { UserRole } from '../../../../entities/user/model/user-role.type';
import {InfoCardComponent} from '../../../../shared/ui/info-card/info-card.component';

@Component({
    selector: 'app-dashboard-page',
    imports: [RouterLink, InfoCardComponent],
    templateUrl: './dashboard-page.component.html',
    styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent {
    private readonly sessionStore = inject(SessionStore);
    private readonly router = inject(Router);

    readonly user = this.sessionStore.user;

    readonly actions: DashboardAction[] = [
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
            title: 'Регистрация игроков',
            description: 'Регистрация игроков различных команд',
            route: '/dashboard/team-players',
            roles: [UserRole.Admin, UserRole.SuperAdmin],
            variant: '#2ECC71',
        },
    ];

    readonly availableActions = computed(() => {
        return this.actions.filter((action) =>
            this.sessionStore.hasAnyRole(...action.roles),
        );
    });

    logout(): void {
        this.sessionStore.logout();
        this.router.navigate(['/']);
    }
}
