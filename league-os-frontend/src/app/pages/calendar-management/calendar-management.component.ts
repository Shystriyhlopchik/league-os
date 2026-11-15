import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
    ManagedCalendar,
    TournamentApplicationApi,
} from '../../entities/tournament-application/tournament-application.api';

type CalendarMatch = ManagedCalendar['matches'][number];
@Component({
    selector: 'app-calendar-management',
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './calendar-management.component.html',
    styleUrl: './calendar-management.component.scss',
})
export class CalendarManagementComponent {
    private readonly api = inject(TournamentApplicationApi);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    readonly tournaments = signal<{ id: number; name: string }[]>([]);
    readonly calendar = signal<ManagedCalendar | null>(null);
    readonly busy = signal(false);
    readonly error = signal('');
    readonly notice = signal('');
    readonly filter = signal('all');
    readonly round = signal('');
    readonly matches = computed(() =>
        (this.calendar()?.matches ?? []).filter(
            (m) =>
                (!this.round() || String(m.roundNumber) === this.round()) &&
                (this.filter() === 'all' ||
                    (this.filter() === 'postponed'
                        ? m.postponed
                        : m.status === this.filter())),
        ),
    );
    tournamentId =
        Number(this.route.snapshot.queryParamMap.get('tournamentId')) || 0;
    editing?: CalendarMatch;
    datetime = '';
    venueId = 0;
    duration = 60;
    reason = '';
    constructor() {
        void this.init();
    }
    private async init() {
        try {
            this.tournaments.set(
                await firstValueFrom(this.api.managedCalendars()),
            );
            if (this.tournamentId) await this.load();
        } catch (e: any) {
            this.error.set(e?.error?.message ?? 'Не удалось загрузить турниры');
        }
    }
    async load() {
        if (this.busy()) return;
        if (!this.tournamentId) { this.calendar.set(null); this.editing = undefined; return; }
        this.busy.set(true);
        this.error.set('');
        this.notice.set('');
        this.editing = undefined;
        try {
            this.calendar.set(
                await firstValueFrom(this.api.calendar(this.tournamentId)),
            );
            void this.router.navigate([], {
                relativeTo: this.route,
                queryParams: { tournamentId: this.tournamentId },
                queryParamsHandling: 'merge',
                replaceUrl: true,
            });
        } catch (e: any) {
            this.calendar.set(null);
            this.error.set(e?.error?.message ?? 'Нет доступа к календарю');
        } finally {
            this.busy.set(false);
        }
    }
    edit(match: CalendarMatch) {
        this.editing = match;
        this.datetime = match.matchDatetime?.slice(0, 16) ?? '';
        this.venueId = match.venueId ?? 0;
        this.duration = match.durationMinutes ?? 60;
        this.reason = '';
    }
    async save(postponed: boolean) {
        const match = this.editing;
        if (!match || this.busy()) return;
        if (
            !this.reason.trim() ||
            (!postponed && (!this.datetime || !this.venueId))
        ) {
            this.error.set(
                'Укажите причину. Для назначения матча также нужны дата, время и площадка',
            );
            return;
        }
        if (
            !confirm(
                postponed
                    ? 'Перенести матч на неопределённую дату? Составы сохранятся, подтверждение судьи потребуется заново.'
                    : 'Сохранить новое расписание? Подтверждение составов потребуется заново.',
            )
        )
            return;
        this.busy.set(true);
        this.error.set('');
        try {
            await firstValueFrom(
                this.api.schedule(
                    this.tournamentId,
                    match.id,
                    this.datetime,
                    Number(this.venueId),
                    {
                        postponed,
                        reason: this.reason.trim(),
                        expectedRevision: match.scheduleRevision ?? 0,
                        durationMinutes: Number(this.duration),
                    },
                ),
            );
            this.calendar.set(
                await firstValueFrom(this.api.calendar(this.tournamentId)),
            );
            this.editing = undefined;
            this.notice.set(
                postponed
                    ? 'Матч перенесён. Новая дата уточняется'
                    : 'Расписание обновлено',
            );
        } catch (e: any) {
            this.error.set(
                e?.error?.message ?? 'Не удалось изменить календарь',
            );
        } finally {
            this.busy.set(false);
        }
    }
}
