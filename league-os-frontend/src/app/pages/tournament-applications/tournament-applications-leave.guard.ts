import { CanDeactivateFn } from '@angular/router';
import type { TournamentApplicationsPageComponent } from './tournament-applications-page.component';

export const tournamentApplicationsLeaveGuard: CanDeactivateFn<
    TournamentApplicationsPageComponent
> = (component) => component.canLeavePage();
