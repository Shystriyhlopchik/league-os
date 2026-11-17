import { CanDeactivateFn } from '@angular/router';
import type { CalendarManagementComponent } from './calendar-management.component';
export const calendarManagementLeaveGuard: CanDeactivateFn<
    CalendarManagementComponent
> = (component) => component.canLeave();
