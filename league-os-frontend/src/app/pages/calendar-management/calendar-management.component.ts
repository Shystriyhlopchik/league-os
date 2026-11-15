import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';
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
    readonly fieldErrors = signal<Record<string, string>>({});
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
                await firstValueFrom(this.api.managedCalendars().pipe(timeout(20000))),
            );
            if (this.tournamentId) await this.load();
        } catch (e: any) {
            this.error.set(this.errorMessage(e, 'Не удалось загрузить турниры'));
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
                await firstValueFrom(this.api.calendar(this.tournamentId).pipe(timeout(20000))),
            );
            void this.router.navigate([], {
                relativeTo: this.route,
                queryParams: { tournamentId: this.tournamentId },
                queryParamsHandling: 'merge',
                replaceUrl: true,
            });
        } catch (e: any) {
            this.calendar.set(null);
            this.error.set(this.errorMessage(e, 'Не удалось загрузить календарь'));
        } finally {
            this.busy.set(false);
        }
    }
    edit(match: CalendarMatch) {
        this.dismissFeedback();
        this.fieldErrors.set({});
        this.editing = match;
        this.datetime = match.matchDatetime?.slice(0, 16) ?? '';
        this.venueId = match.venueId ?? 0;
        // Keep an explicitly saved slot; the DB's initial 60 minutes is not a rule.
        this.duration = (match.scheduleRevision ?? 0) > 0
            ? match.durationMinutes ?? match.defaultDurationMinutes ?? 60
            : match.defaultDurationMinutes ?? match.durationMinutes ?? 60;
        this.reason = '';
    }
    dismissFeedback() {
        this.error.set('');
        this.notice.set('');
    }
    private errorMessage(error: any, fallback: string): string {
        if (error?.name === 'TimeoutError')
            return 'Сервер не ответил вовремя. Обновите календарь, чтобы проверить, сохранились ли изменения, прежде чем повторять действие.';
        if (error?.status === 0)
            return 'Нет связи с сервером. Проверьте интернет и обновите календарь перед повторным сохранением.';
        const message = error?.error?.message;
        if (Array.isArray(message)) return message.join('. ');
        return typeof message === 'string' && message.trim() ? message : fallback;
    }
    async save(postponed: boolean) {
        const match = this.editing;
        if (!match || this.busy()) return;
        this.dismissFeedback();
        const errors: Record<string, string> = {};
        if (!this.reason.trim()) errors['reason'] = 'Укажите причину изменения';
        else if (this.reason.trim().length > 1000) errors['reason'] = 'Не более 1000 символов';
        if (!postponed) {
            if (!this.datetime || !Number.isFinite(new Date(this.datetime).getTime()))
                errors['datetime'] = 'Укажите корректные дату и время матча';
            if (!this.calendar()?.venues.some((v) => v.id === Number(this.venueId)))
                errors['venue'] = 'Выберите площадку';
        }
        if (!Number.isInteger(Number(this.duration)) || Number(this.duration) < 1 || Number(this.duration) > 480)
            errors['duration'] = 'Укажите целое число от 1 до 480 минут';
        this.fieldErrors.set(errors);
        if (Object.keys(errors).length) {
            this.error.set('Не удалось сохранить: проверьте отмеченные поля формы.');
            return;
        }
        this.busy.set(true);
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
                ).pipe(timeout(20000)),
            );
            this.editing = undefined;
            this.notice.set(
                postponed
                    ? `Матч «${match.home} — ${match.away}» перенесён. Новая дата уточняется.`
                    : `Расписание матча «${match.home} — ${match.away}» успешно обновлено.`,
            );
            // A failed refresh must not be reported as a failed save.
            try {
                this.calendar.set(
                    await firstValueFrom(this.api.calendar(this.tournamentId).pipe(timeout(20000))),
                );
            } catch {
                this.error.set('Изменения сохранены, но список матчей не обновился. Нажмите «Обновить».');
            }
        } catch (e: any) {
            this.error.set(
                this.errorMessage(e, 'Не удалось изменить календарь. Попробуйте ещё раз.'),
            );
        } finally {
            this.busy.set(false);
        }
    }
}
