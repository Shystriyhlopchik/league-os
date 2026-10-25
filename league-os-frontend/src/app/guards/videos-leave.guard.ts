import { CanDeactivateFn } from '@angular/router';
import type { VideosManagementComponent } from '../pages/videos-management/videos-management.component';

export const videosLeaveGuard: CanDeactivateFn<VideosManagementComponent> = (
    component,
) => component.canLeave();
