import { CanDeactivateFn } from '@angular/router';
import { MatchProtocolPageComponent } from '../ui/match-protocol-page/match-protocol-page.component';

export const matchProtocolLeaveGuard: CanDeactivateFn<
    MatchProtocolPageComponent
> = (component, currentRoute, currentState, nextState) => {
    if (component.canLeavePage()) {
        return true;
    }

    return confirm(
        'Матч ещё не закрыт: протокол не подписан. Вы действительно хотите покинуть страницу?',
    );
};
