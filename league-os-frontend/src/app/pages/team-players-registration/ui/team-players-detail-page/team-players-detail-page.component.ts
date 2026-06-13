import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import { TeamPlayersDetailStore } from '../../model/team-players-detail.store';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';

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

    readonly teamId = Number(this.route.snapshot.paramMap.get('teamId'));

    readonly form = this.fb.nonNullable.group({
        lastName: ['', Validators.required],
        firstName: ['', Validators.required],
        middleName: [''],
        shirtNumber: this.fb.control<number | null>(null, [
            Validators.min(1),
            Validators.max(99),
        ]),
        position: [''],
        isCaptain: [false],
    });

    ngOnInit(): void {
        this.store.loadPlayers(this.teamId);
    }

    openForm(): void {
        this.isFormOpened.set(true);
    }

    closeForm(): void {
        this.isFormOpened.set(false);
        this.form.reset({
            lastName: '',
            firstName: '',
            middleName: '',
            shirtNumber: null,
            position: '',
            isCaptain: false,
        });
    }

    submit(): void {
        if (this.form.invalid || this.store.isCreating()) {
            this.form.markAllAsTouched();
            return;
        }

        const value = this.form.getRawValue();

        this.store.createPlayer(
            this.teamId,
            {
                lastName: value.lastName.trim(),
                firstName: value.firstName.trim(),
                middleName: value.middleName.trim() || null,
                shirtNumber: value.shirtNumber,
                position: value.position || null,
                isCaptain: value.isCaptain,
            },
            () => {
                this.closeForm();
            },
        );
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
}
