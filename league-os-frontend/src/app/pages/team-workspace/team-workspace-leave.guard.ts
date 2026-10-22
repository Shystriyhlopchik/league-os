import { CanDeactivateFn } from '@angular/router';
import { TeamWorkspacePageComponent } from './team-workspace-page.component';

export const teamWorkspaceLeaveGuard: CanDeactivateFn<
    TeamWorkspacePageComponent
> = (component) => component.canLeavePage();
