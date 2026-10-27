import { ArrowUpRightComponent } from '../../shared/ui/arrow-up-right/arrow-up-right.component';
import { DOCUMENT } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    inject,
    signal,
    ViewChild,
} from '@angular/core';
import { TEAMS_MAP_MARKERS } from './model/teams-map.data';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-teams-map',
    imports: [ArrowUpRightComponent, RouterLink],
    templateUrl: './teams-map.component.html',
    styleUrl: './teams-map.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamsMapComponent {
    private readonly document = inject(DOCUMENT);
    @ViewChild('spotlight') private spotlight?: ElementRef<HTMLElement>;
    readonly teams = TEAMS_MAP_MARKERS;
    readonly selectedTeamId = signal(this.teams[0].id);
    readonly selectedTeam = computed(
        () =>
            this.teams.find((team) => team.id === this.selectedTeamId()) ??
            this.teams[0],
    );
    readonly failedLogoIds = signal<Set<number>>(new Set());
    readonly failedPhotos = signal<Set<string>>(new Set());
    readonly archivePhotos = [
        {
            src: '/brand/photos/match-action.jpg',
            alt: 'Борьба за мяч в матче Дворовой лиги',
        },
        {
            src: '/brand/photos/match-duel.jpg',
            alt: 'Игровой эпизод на поле Дворовой лиги',
        },
        {
            src: '/brand/photos/team-emotion.jpg',
            alt: 'Игроки поддерживают свою команду у поля',
        },
    ];
    readonly selectedPhoto = computed(
        () =>
            this.archivePhotos[
                this.teams.findIndex(
                    (team) => team.id === this.selectedTeamId(),
                ) % this.archivePhotos.length
            ],
    );

    selectTeam(id: number, reveal = false): void {
        if (!this.teams.some((team) => team.id === id)) return;
        this.selectedTeamId.set(id);
        const view = this.document.defaultView;
        const panel = this.spotlight?.nativeElement;
        if (reveal && view?.matchMedia('(max-width: 900px)').matches && panel) {
            const rect = panel.getBoundingClientRect();
            if (rect.top < 0 || rect.bottom > view.innerHeight) {
                panel.scrollIntoView({
                    block: 'start',
                    behavior: view.matchMedia(
                        '(prefers-reduced-motion: reduce)',
                    ).matches
                        ? 'instant'
                        : 'smooth',
                });
            }
        }
    }

    markLogoFailed(id: number): void {
        this.failedLogoIds.update((ids) => new Set([...ids, id]));
    }

    markPhotoFailed(src: string): void {
        this.failedPhotos.update((photos) => new Set([...photos, src]));
    }
}
