import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowUpRightComponent } from '../../shared/ui/arrow-up-right/arrow-up-right.component';

@Component({
    selector: 'app-league-history',
    imports: [RouterLink, ArrowUpRightComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './league-history.component.html',
    styleUrl: './league-history.component.scss',
})
export class LeagueHistoryComponent {}
