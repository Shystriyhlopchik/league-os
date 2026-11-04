import { CommonModule } from '@angular/common';
import {
    Component,
    DestroyRef,
    OnChanges,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
    PlayerCorrection,
    PlayerProfile,
    PlayerProfilesApi,
} from '../../../entities/player/api/player-profiles.api';

@Component({
    selector: 'app-player-profile-editor',
    imports: [CommonModule, FormsModule],
    templateUrl: './player-profile-editor.component.html',
    styleUrl: './player-profile-editor.component.scss',
})
export class PlayerProfileEditorComponent implements OnChanges {
    readonly communityId = input.required<number>();
    readonly playerId = input.required<number>();
    readonly teamId = input<number>();
    readonly changed = output<void>();
    readonly closed = output<void>();
    readonly busyChanged = output<boolean>();
    private readonly api = inject(PlayerProfilesApi);
    private destroyed = false;
    private generation = 0;
    readonly view = signal<PlayerProfile | null>(null);
    readonly busy = signal(false);
    readonly error = signal('');
    readonly notice = signal('');
    readonly preview = signal('');
    photo: File | null = null;
    form = {
        firstName: '',
        lastName: '',
        middleName: '',
        birthDate: '',
        reason: '',
    };
    private saved = '';
    readonly today = new Date().toISOString().slice(0, 10);
    readonly labels: Record<string, string> = {
        submitted: 'На рассмотрении',
        approved: 'Исправление подтверждено',
        changes_requested: 'Возвращено на доработку',
        identity_submitted: 'Исправление отправлено',
        identity_approved: 'Личные данные исправлены',
        identity_returned: 'Исправление возвращено',
        photo_updated: 'Фотография обновлена',
    };
    constructor() {
        inject(DestroyRef).onDestroy(() => {
            this.destroyed = true;
            this.clearPreview();
        });
    }
    ngOnChanges() {
        this.generation++;
        this.view.set(null);
        this.clearPreview();
        this.photo = null;
        this.form = {
            firstName: '',
            lastName: '',
            middleName: '',
            birthDate: '',
            reason: '',
        };
        this.saved = JSON.stringify(this.form);
        void Promise.resolve().then(() => {
            if (!this.destroyed) void this.reload();
        });
    }
    hasUnsavedChanges() {
        return !!this.photo || JSON.stringify(this.form) !== this.saved;
    }
    identityChanged() {
        const p = this.view()?.player;
        return (
            !!p &&
            (this.form.firstName.trim() !== p.firstName ||
                this.form.lastName.trim() !== p.lastName ||
                (this.form.middleName.trim() || '') !== (p.middleName || '') ||
                this.form.birthDate !== (p.birthDate || ''))
        );
    }
    revise(change: Pick<PlayerCorrection, 'after' | 'reason'>) {
        if (this.busy() || this.view()?.pending) return;
        if (
            this.hasUnsavedChanges() &&
            !window.confirm(
                'Заменить введённые данные возвращённым исправлением?',
            )
        )
            return;
        this.form = {
            firstName: change.after.firstName,
            lastName: change.after.lastName,
            middleName: change.after.middleName || '',
            birthDate: change.after.birthDate || '',
            reason: change.reason,
        };
        this.notice.set(
            'Загружены данные возвращённого исправления. Учтите комментарий организатора и отправьте новый запрос.',
        );
    }
    close() {
        if (
            this.busy() ||
            (this.hasUnsavedChanges() &&
                !window.confirm(
                    'Закрыть профиль без сохранения введённых изменений?',
                ))
        )
            return;
        this.closed.emit();
    }
    private apply(view: PlayerProfile) {
        this.view.set(view);
        this.form = {
            firstName: view.player.firstName,
            lastName: view.player.lastName,
            middleName: view.player.middleName || '',
            birthDate: view.player.birthDate || '',
            reason: '',
        };
        this.saved = JSON.stringify(this.form);
    }
    reload() {
        return this.run(async () => {
            const generation = this.generation;
            const view = await firstValueFrom(
                this.api.profile(
                    this.communityId(),
                    this.playerId(),
                    this.teamId(),
                ),
            );
            if (!this.destroyed && generation === this.generation)
                this.apply(view);
        });
    }
    selectPhoto(event: Event) {
        const input = event.target as HTMLInputElement,
            file = input.files?.[0];
        this.error.set('');
        this.clearPreview();
        this.photo = null;
        if (!file) return;
        if (
            !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
            file.size > 5 * 1024 * 1024 ||
            !file.size
        ) {
            this.error.set('Выберите PNG, JPEG или WebP размером до 5 МБ');
            input.value = '';
            return;
        }
        this.photo = file;
        this.preview.set(URL.createObjectURL(file));
    }
    private clearPreview() {
        if (this.preview()) URL.revokeObjectURL(this.preview());
        this.preview.set('');
    }
    uploadPhoto() {
        const photo = this.photo,
            view = this.view();
        if (!photo || !view) return;
        return this.run(async () => {
            const result = await firstValueFrom(
                this.api.photo(
                    this.communityId(),
                    this.playerId(),
                    photo,
                    view.player.photoUrl || '',
                    this.teamId(),
                ),
            );
            this.view.set({
                ...view,
                player: { ...view.player, photoUrl: result.photoUrl },
            });
            this.photo = null;
            this.clearPreview();
            this.notice.set('Фотография обновлена. Согласование не требуется.');
            this.changed.emit();
        });
    }
    submit() {
        const view = this.view();
        if (!view || view.pending) return;
        if (
            !this.form.firstName.trim() ||
            !this.form.lastName.trim() ||
            !this.form.birthDate ||
            !this.form.reason.trim() ||
            !this.identityChanged()
        ) {
            this.error.set(
                'Измените личные данные, укажите имя, фамилию, дату рождения и причину исправления',
            );
            return;
        }
        return this.run(async () => {
            const change = await firstValueFrom(
                this.api.submit(this.communityId(), this.playerId(), {
                    ...this.form,
                    expectedVersion: view.player.identityVersion,
                    ...(this.teamId() ? { teamId: this.teamId() } : {}),
                }),
            );
            this.apply({
                ...view,
                pending: true,
                changes: [change, ...view.changes],
            });
            this.notice.set(
                'Исправление отправлено организатору. До подтверждения действуют прежние данные.',
            );
        });
    }
    private async run(action: () => Promise<void>) {
        if (this.busy() || this.destroyed) return;
        this.busy.set(true);
        this.busyChanged.emit(true);
        this.error.set('');
        this.notice.set('');
        try {
            await action();
        } catch (e) {
            const m = (e as { error?: { message?: string | string[] } }).error
                ?.message;
            this.error.set(
                Array.isArray(m)
                    ? m.join('. ')
                    : m || 'Не удалось сохранить профиль',
            );
        } finally {
            this.busy.set(false);
            if (!this.destroyed) this.busyChanged.emit(false);
        }
    }
}
