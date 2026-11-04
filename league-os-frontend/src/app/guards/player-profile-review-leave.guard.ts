import { CanDeactivateFn } from '@angular/router';
import { PlayerProfileReviewPageComponent } from '../pages/player-profile-review/player-profile-review-page.component';
export const playerProfileReviewLeaveGuard: CanDeactivateFn<
    PlayerProfileReviewPageComponent
> = (component) => component.canLeavePage();
