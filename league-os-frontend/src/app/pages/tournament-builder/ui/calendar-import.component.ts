import {
    ChangeDetectionStrategy,
    Component,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TournamentApplicationApi } from '../../../entities/tournament-application/tournament-application.api';
import {
    CalendarImportKind,
    CalendarImportMapping,
    CalendarImportPreview,
    CalendarImportRequest,
} from '../../../entities/tournament-application/calendar-import.types';

@Component({
    selector: 'app-calendar-import',
    imports: [FormsModule],
    templateUrl: './calendar-import.component.html',
    styleUrl: './calendar-import.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarImportComponent {
    readonly tournamentId = input(0);
    readonly stageId = input(0);
    readonly disabled = input(false);
    readonly busyChange = output<boolean>();
    readonly calendarImported = output<void>();
    private readonly api = inject(TournamentApplicationApi);
    readonly busy = signal(false);
    readonly preview = signal<CalendarImportPreview | null>(null);
    readonly needsCheck = signal(false);
    readonly error = signal('');
    readonly notice = signal('');
    readonly fileName = signal('');
    readonly mappingKinds: { kind: CalendarImportKind; label: string }[] = [
        { kind: 'group', label: 'Группы' },
        { kind: 'team', label: 'Команды' },
        { kind: 'venue', label: 'Площадки' },
    ];
    mode: 'append' | 'replace' = 'append';
    replaceConfirmed = false;
    mappings: CalendarImportMapping[] = [];

    private unavailable() {
        return (
            this.busy() ||
            this.disabled() ||
            !this.tournamentId() ||
            !this.stageId()
        );
    }
    private setBusy(value: boolean) {
        this.busy.set(value);
        this.busyChange.emit(value);
    }

    async downloadTemplate(): Promise<void> {
        if (this.unavailable()) return;
        this.setBusy(true);
        this.error.set('');
        try {
            const blob = await firstValueFrom(
                this.api.calendarTemplate(this.tournamentId(), this.stageId()),
            );
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `calendar-${this.tournamentId()}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            await this.showError(error);
        } finally {
            this.setBusy(false);
        }
    }

    async readFile(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file || this.unavailable()) return;
        this.preview.set(null);
        this.notice.set('');
        this.error.set('');
        this.fileName.set(file.name);
        this.mode = 'append';
        this.replaceConfirmed = false;
        this.mappings = [];
        if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
            this.error.set('Выберите файл .xlsx размером не более 5 МБ.');
            return;
        }
        this.setBusy(true);
        try {
            this.acceptPreview(
                await firstValueFrom(
                    this.api.readCalendarImport(
                        this.tournamentId(),
                        this.stageId(),
                        file,
                    ),
                ),
            );
        } catch (error) {
            await this.showError(error);
        } finally {
            this.setBusy(false);
        }
    }

    sources(kind: CalendarImportKind) {
        return this.preview()?.sources.filter((s) => s.kind === kind) ?? [];
    }
    options(kind: CalendarImportKind) {
        const refs = this.preview()?.references;
        return !refs
            ? []
            : kind === 'group'
              ? refs.groups
              : kind === 'team'
                ? refs.teams
                : refs.venues;
    }
    mappedId(kind: CalendarImportKind, source: string) {
        return (
            this.mappings.find((m) => m.kind === kind && m.source === source)
                ?.id ?? 0
        );
    }
    changeMapping(kind: CalendarImportKind, source: string, id: number): void {
        this.mappings = this.mappings.filter(
            (m) => m.kind !== kind || m.source !== source,
        );
        if (id) this.mappings.push({ kind, source, id });
        this.invalidate();
    }
    invalidate(): void {
        this.needsCheck.set(true);
        this.replaceConfirmed = false;
        this.error.set('');
    }
    private request(): CalendarImportRequest {
        return {
            mode: this.mode,
            rows: this.preview()!.sourceRows,
            mappings: this.mappings,
        };
    }
    private acceptPreview(preview: CalendarImportPreview): void {
        this.preview.set(preview);
        this.mappings = preview.sources
            .filter((s): s is CalendarImportMapping => s.id !== null)
            .map((s) => ({ ...s }));
        this.needsCheck.set(false);
    }
    async check(): Promise<void> {
        if (this.unavailable() || !this.preview()) return;
        this.setBusy(true);
        this.error.set('');
        try {
            this.acceptPreview(
                await firstValueFrom(
                    this.api.previewCalendarImport(
                        this.tournamentId(),
                        this.stageId(),
                        this.request(),
                    ),
                ),
            );
        } catch (error) {
            this.needsCheck.set(true);
            await this.showError(error);
        } finally {
            this.setBusy(false);
        }
    }
    async confirm(): Promise<void> {
        const preview = this.preview();
        if (
            this.unavailable() ||
            !preview?.valid ||
            this.needsCheck() ||
            (this.mode === 'replace' && !this.replaceConfirmed)
        )
            return;
        this.setBusy(true);
        this.error.set('');
        try {
            const result = await firstValueFrom(
                this.api.confirmCalendarImport(
                    this.tournamentId(),
                    this.stageId(),
                    {
                        ...this.request(),
                        expectedVersion: preview.version,
                        ...(this.mode === 'replace'
                            ? { confirmation: 'REPLACE_PREPARED_SCHEDULE' }
                            : {}),
                    },
                ),
            );
            this.preview.set(null);
            this.mappings = [];
            this.replaceConfirmed = false;
            this.notice.set(
                `Импорт завершён. Добавлено: ${result.createdMatches}, пропущено: ${result.skippedMatches}, отменено прежних матчей: ${result.cancelledMatches}.`,
            );
            this.calendarImported.emit();
        } catch (error) {
            this.needsCheck.set(true);
            await this.showError(error);
        } finally {
            this.setBusy(false);
        }
    }
    private async showError(error: unknown): Promise<void> {
        let body = (error as { error?: unknown })?.error as
            | { message?: string | string[] }
            | Blob
            | undefined;
        if (body instanceof Blob) {
            try {
                body = JSON.parse(await body.text());
            } catch {
                body = undefined;
            }
        }
        const message =
            body && !(body instanceof Blob) ? body.message : undefined;
        this.error.set(
            Array.isArray(message)
                ? message.join('. ')
                : (message ??
                      'Не удалось выполнить импорт. Проверьте подключение и повторите попытку.'),
        );
    }
}
