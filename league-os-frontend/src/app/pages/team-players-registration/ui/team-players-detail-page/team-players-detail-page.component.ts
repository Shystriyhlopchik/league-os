import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import { TeamPlayersDetailStore } from '../../model/team-players-detail.store';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import { TeamPlayer } from '../../../../entities/team-player/model/team-player.types';

const ALLOWED_PLAYER_PHOTO_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
]);

@Component({
    selector: 'app-team-players-detail-page',
    imports: [ReactiveFormsModule, RouterLink],
    templateUrl: './team-players-detail-page.component.html',
    styleUrl: './team-players-detail-page.component.scss',
    providers: [TeamPlayersDetailStore],
})
export class TeamPlayersDetailPageComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly fb = inject(FormBuilder);

    readonly store = inject(TeamPlayersDetailStore);
    readonly isFormOpened = signal(false);
    readonly editingPlayer = signal<TeamPlayer | null>(null);

    readonly teamId = Number(this.route.snapshot.paramMap.get('teamId'));
    readonly today = new Date().toISOString().slice(0, 10);

    readonly form = this.fb.nonNullable.group({
        lastName: ['', Validators.required],
        firstName: ['', Validators.required],
        middleName: [''],
        shirtNumber: this.fb.control<number | null>(null, [
            Validators.min(1),
            Validators.max(99),
        ]),
        position: [''],
        birthDate: ['', Validators.required],
        preferredFoot: [''],
        photo: this.fb.control<File | null>(null),
        isCaptain: [false],
    });

    readonly photoName = signal<string | null>(null);
    readonly photoError = signal<string | null>(null);

    ngOnInit(): void {
        this.store.loadPlayers(this.teamId);
    }

    openForm(): void {
        this.editingPlayer.set(null);
        this.store.createError.set(null);
        this.setPhotoRequired(true);
        this.isFormOpened.set(true);
    }

    editPlayer(teamPlayer: TeamPlayer): void {
        this.editingPlayer.set(teamPlayer);
        this.store.createError.set(null);
        this.isFormOpened.set(true);
        this.photoName.set(null);
        this.photoError.set(null);
        this.setPhotoRequired(!teamPlayer.player.photoUrl);
        this.form.reset({
            lastName: teamPlayer.player.lastName,
            firstName: teamPlayer.player.firstName,
            middleName: teamPlayer.player.middleName ?? '',
            shirtNumber: teamPlayer.shirtNumber ?? null,
            position: teamPlayer.position ?? teamPlayer.player.position ?? '',
            birthDate: teamPlayer.player.birthDate?.slice(0, 10) ?? '',
            preferredFoot: teamPlayer.player.preferredFoot ?? '',
            photo: null,
            isCaptain: teamPlayer.isCaptain,
        });

        queueMicrotask(() => {
            document.querySelector('.player-form')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        });
    }

    closeForm(): void {
        this.isFormOpened.set(false);
        this.editingPlayer.set(null);
        this.form.reset({
            lastName: '',
            firstName: '',
            middleName: '',
            shirtNumber: null,
            position: '',
            birthDate: '',
            preferredFoot: '',
            photo: null,
            isCaptain: false,
        });
        this.photoName.set(null);
        this.photoError.set(null);
    }

    onPhotoSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0] ?? null;

        if (file && !ALLOWED_PLAYER_PHOTO_TYPES.has(file.type)) {
            this.form.controls.photo.setValue(null);
            this.form.controls.photo.markAsTouched();
            this.photoName.set(null);
            this.photoError.set('Выберите файл в формате PNG, JPEG или WebP');
            input.value = '';
            return;
        }

        if (file && file.size > 5 * 1024 * 1024) {
            this.form.controls.photo.setValue(null);
            this.form.controls.photo.markAsTouched();
            this.photoName.set(null);
            this.photoError.set('Размер файла не должен превышать 5 МБ');
            input.value = '';
            return;
        }

        this.form.controls.photo.setValue(file);
        this.form.controls.photo.markAsTouched();
        this.form.controls.photo.updateValueAndValidity();
        this.photoName.set(file?.name ?? null);
        this.photoError.set(null);
    }

    submit(): void {
        if (this.form.invalid || this.store.isCreating()) {
            this.form.markAllAsTouched();
            return;
        }

        const value = this.form.getRawValue();

        const dto = {
            lastName: value.lastName.trim(),
            firstName: value.firstName.trim(),
            middleName: value.middleName.trim() || null,
            shirtNumber: value.shirtNumber,
            position: value.position || null,
            birthDate: value.birthDate || null,
            preferredFoot: (value.preferredFoot || null) as 'left' | 'right' | 'both' | null,
            photo: value.photo,
            isCaptain: value.isCaptain,
        };
        const editingPlayer = this.editingPlayer();

        if (editingPlayer) {
            this.store.updatePlayer(
                this.teamId,
                editingPlayer.id,
                dto,
                () => this.closeForm(),
            );
            return;
        }

        this.store.createPlayer(this.teamId, dto, () => this.closeForm());
    }

    getPlayerFullName(teamPlayer: {
        player: {
            lastName: string;
            firstName: string;
            middleName?: string | null;
        };
    }): string {
        const { lastName, firstName, middleName } = teamPlayer.player;

        return [lastName, firstName, middleName].filter(Boolean).join(' ');
    }

    getPhotoUrl(photoUrl: string): string {
        if (/^https?:\/\//i.test(photoUrl)) {
            return photoUrl;
        }

        return photoUrl.startsWith('/') ? photoUrl : `/${photoUrl}`;
    }

    formatBirthDate(birthDate?: string | null): string {
        if (!birthDate) {
            return '—';
        }

        const [year, month, day] = birthDate.slice(0, 10).split('-');

        return day && month && year ? `${day}.${month}.${year}` : birthDate;
    }

    getPreferredFootLabel(preferredFoot?: 'left' | 'right' | 'both' | null): string {
        const labels = {
            left: 'Левая',
            right: 'Правая',
            both: 'Обе',
        } as const;

        return preferredFoot ? labels[preferredFoot] : '—';
    }

    private setPhotoRequired(required: boolean): void {
        const photoControl = this.form.controls.photo;

        photoControl.setValidators(required ? [Validators.required] : []);
        photoControl.updateValueAndValidity();
    }
}
