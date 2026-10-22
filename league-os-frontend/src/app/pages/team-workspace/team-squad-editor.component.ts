import {
    Component,
    DestroyRef,
    inject,
    input,
    OnChanges,
    output,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
    PlayerCandidate,
    SquadPlayer,
    TournamentApplicationApi,
} from '../../entities/tournament-application/tournament-application.api';

@Component({
    selector: 'app-team-squad-editor',
    imports: [FormsModule],
    templateUrl: './team-squad-editor.component.html',
    styleUrl: './team-workspace-page.component.scss',
})
export class TeamSquadEditorComponent implements OnChanges {
    readonly communityId = input.required<number>();
    readonly teamId = input.required<number>();
    readonly rosterChanged = output<SquadPlayer[]>();
    readonly busyChanged = output<boolean>();
    private readonly api = inject(TournamentApplicationApi);
    private destroyed = false;
    readonly roster = signal<SquadPlayer[]>([]);
    readonly candidates = signal<PlayerCandidate[]>([]);
    readonly busy = signal(false);
    readonly loaded = signal(false);
    readonly error = signal('');
    readonly notice = signal('');
    readonly showAdd = signal(false);
    readonly showNew = signal(false);
    readonly searched = signal(false);
    readonly editingPlayer = signal<SquadPlayer | null>(null);
    search = '';
    shirtNumber = 1;
    editNumber = 1;
    editCaptain = false;
    newPlayer = this.emptyPlayer();
    constructor() {
        inject(DestroyRef).onDestroy(() => {
            this.destroyed = true;
        });
    }
    private emptyPlayer() {
        return {
            firstName: '',
            lastName: '',
            middleName: '',
            birthDate: '',
            shirtNumber: 1,
            isCaptain: false,
        };
    }
    ngOnChanges() {
        this.roster.set([]);
        this.loaded.set(false);
        this.candidates.set([]);
        this.search = '';
        // The parent receives loading state after the initial change detection pass.
        void Promise.resolve().then(() => {
            if (!this.destroyed) void this.reload();
        });
    }
    private async refresh() {
        const c = this.communityId(),
            t = this.teamId();
        const roster = await firstValueFrom(this.api.roster(c, t));
        if (
            !this.destroyed &&
            c === this.communityId() &&
            t === this.teamId()
        ) {
            this.roster.set(roster);
            this.loaded.set(true);
            this.rosterChanged.emit(roster);
        }
    }
    reload() {
        return this.run(() => this.refresh());
    }
    hasUnsavedChanges() {
        const edit = this.editingPlayer();
        return (
            !!(
                edit &&
                (Number(this.editNumber) !== edit.shirtNumber ||
                    this.editCaptain !== edit.isCaptain)
            ) ||
            (this.showNew() &&
                !!(
                    this.newPlayer.firstName.trim() ||
                    this.newPlayer.lastName.trim() ||
                    this.newPlayer.middleName.trim() ||
                    this.newPlayer.birthDate
                ))
        );
    }
    startAdd() {
        if (this.busy() || !this.loaded() || this.roster().length >= 12) return;
        if (!this.cancelEdit()) return;
        this.resetAdd();
        this.shirtNumber =
            Array.from({ length: 99 }, (_, i) => i + 1).find(
                (n) => !this.roster().some((p) => p.shirtNumber === n),
            ) || 1;
        this.newPlayer.shirtNumber = this.shirtNumber;
        this.showAdd.set(true);
    }
    closeAdd() {
        if (
            this.hasUnsavedChanges() &&
            !window.confirm(
                'Закрыть добавление игрока без сохранения введённых данных?',
            )
        )
            return;
        this.resetAdd();
    }
    private resetAdd() {
        this.showAdd.set(false);
        this.showNew.set(false);
        this.searched.set(false);
        this.candidates.set([]);
        this.search = '';
        this.newPlayer = this.emptyPlayer();
    }
    searchPlayers() {
        return this.run(async () => {
            this.searched.set(false);
            this.candidates.set(
                await firstValueFrom(
                    this.api.search(
                        this.communityId(),
                        this.teamId(),
                        this.search,
                    ),
                ),
            );
            this.searched.set(true);
        });
    }
    add(playerId: number) {
        return this.run(async () => {
            const result = await firstValueFrom(
                this.api.add(
                    this.communityId(),
                    this.teamId(),
                    playerId,
                    Number(this.shirtNumber),
                ),
            );
            this.resetAdd();
            await this.refresh();
            this.notice.set(
                result.transferRequested
                    ? 'Запрос перехода отправлен администратору. До подтверждения игрок остаётся в прежней команде.'
                    : 'Игрок добавлен в текущий состав.',
            );
        });
    }
    remove(link: SquadPlayer) {
        if (
            this.busy() ||
            !window.confirm(
                `Исключить ${link.player.lastName} ${link.player.firstName} из текущего состава? Игрок станет свободным агентом в этом сообществе. Утверждённые заявки турниров и протоколы не изменятся.`,
            )
        )
            return;
        return this.run(async () => {
            await firstValueFrom(
                this.api.remove(this.communityId(), this.teamId(), link.id),
            );
            if (this.editingPlayer()?.id === link.id)
                this.editingPlayer.set(null);
            await this.refresh();
            this.notice.set(
                'Игрок исключён. Утверждённые заявки турниров и протоколы не изменены.',
            );
        });
    }
    startEdit(link: SquadPlayer) {
        if (this.busy() || !this.cancelEdit()) return;
        if (this.showAdd()) {
            if (
                this.hasUnsavedChanges() &&
                !window.confirm('Закрыть добавление игрока без сохранения?')
            )
                return;
            this.resetAdd();
        }
        this.editNumber = link.shirtNumber ?? 1;
        this.editCaptain = link.isCaptain;
        this.editingPlayer.set(link);
    }
    cancelEdit() {
        const edit = this.editingPlayer();
        if (
            edit &&
            this.hasUnsavedChanges() &&
            !window.confirm('Отменить изменения номера и отметки капитана?')
        )
            return false;
        this.editingPlayer.set(null);
        return true;
    }
    update(
        link: SquadPlayer,
        isCaptain: boolean,
        shirtNumber = link.shirtNumber,
    ) {
        return this.run(async () => {
            await firstValueFrom(
                this.api.updatePlayer(this.teamId(), link.id, {
                    isCaptain,
                    shirtNumber: Number(shirtNumber),
                }),
            );
            this.editingPlayer.set(null);
            await this.refresh();
            this.notice.set(
                'Номер и отметка капитана сохранены. Игровой капитан не получает права управления автоматически.',
            );
        });
    }
    create() {
        return this.run(async () => {
            await firstValueFrom(
                this.api.createPlayer(this.teamId(), this.newPlayer),
            );
            this.resetAdd();
            await this.refresh();
            this.notice.set(
                'Игрок создан и добавлен в текущий состав. Для участия в турнире выберите его в заявочном листе.',
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
        } catch (error) {
            const message = (
                error as { error?: { message?: string | string[] } }
            ).error?.message;
            this.error.set(
                Array.isArray(message)
                    ? message.join('. ')
                    : message || 'Не удалось изменить состав',
            );
        } finally {
            this.busy.set(false);
            if (!this.destroyed) this.busyChanged.emit(false);
        }
    }
}
