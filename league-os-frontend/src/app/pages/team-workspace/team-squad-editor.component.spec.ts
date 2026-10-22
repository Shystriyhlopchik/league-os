import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
    SquadPlayer,
    TournamentApplicationApi,
} from '../../entities/tournament-application/tournament-application.api';
import { TeamSquadEditorComponent } from './team-squad-editor.component';

describe('TeamSquadEditorComponent', () => {
    let fixture: ComponentFixture<TeamSquadEditorComponent>;
    let component: TeamSquadEditorComponent;
    let api: jasmine.SpyObj<TournamentApplicationApi>;
    const player: SquadPlayer = {
        id: 10,
        playerId: 20,
        shirtNumber: 7,
        isCaptain: false,
        player: {
            firstName: 'Иван',
            lastName: 'Иванов',
            birthDate: '2000-01-01',
        },
    };
    beforeEach(async () => {
        api = jasmine.createSpyObj<TournamentApplicationApi>(
            'TournamentApplicationApi',
            [
                'roster',
                'remove',
                'search',
                'add',
                'updatePlayer',
                'createPlayer',
            ],
        );
        api.roster.and.returnValue(of([player]));
        api.remove.and.returnValue(of({}));
        api.search.and.returnValue(of([]));
        api.updatePlayer.and.returnValue(of({}));
        api.createPlayer.and.returnValue(of({}));
        api.add.and.returnValue(of({ transferRequested: false }));
        await TestBed.configureTestingModule({
            imports: [TeamSquadEditorComponent],
            providers: [{ provide: TournamentApplicationApi, useValue: api }],
        }).compileComponents();
        fixture = TestBed.createComponent(TeamSquadEditorComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('communityId', 1);
        fixture.componentRef.setInput('teamId', 3);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    });
    it('renders a compact roster and hides search and creation until requested', () => {
        expect(fixture.nativeElement.textContent).toContain(
            '1 игроков · максимум 12',
        );
        expect(
            fixture.nativeElement.querySelector('.player-row'),
        ).not.toBeNull();
        expect(fixture.nativeElement.querySelector('input')).toBeNull();
        expect(fixture.nativeElement.querySelector('.row-menu')).not.toBeNull();
    });
    it('starts with search, then offers creating a player after searching', async () => {
        component.startAdd();
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('input[name="search"]'),
        ).not.toBeNull();
        expect(fixture.nativeElement.querySelector('.new-player')).toBeNull();
        component.search = 'Иванов';
        await component.searchPlayers();
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain(
            'Нужного игрока нет — создать карточку',
        );
        expect(component.shirtNumber).not.toBe(7);
    });
    it('does not remove a player when the named confirmation is cancelled', async () => {
        const confirm = spyOn(window, 'confirm').and.returnValue(false);
        await component.remove(player);
        expect(confirm.calls.mostRecent().args[0]).toContain('Иванов Иван');
        expect(confirm.calls.mostRecent().args[0]).toContain(
            'Утверждённые заявки',
        );
        expect(api.remove).not.toHaveBeenCalled();
    });
    it('removes a confirmed player using the community-scoped endpoint', async () => {
        spyOn(window, 'confirm').and.returnValue(true);
        await component.remove(player);
        expect(api.remove).toHaveBeenCalledOnceWith(1, 3, 10);
        expect(component.notice()).toContain(
            'Утверждённые заявки турниров и протоколы не изменены',
        );
    });
    it('preserves unfinished player creation after cancelling close', () => {
        component.startAdd();
        component.showNew.set(true);
        component.newPlayer.firstName = 'Пётр';
        spyOn(window, 'confirm').and.returnValue(false);
        component.closeAdd();
        expect(component.showAdd()).toBeTrue();
        expect(component.hasUnsavedChanges()).toBeTrue();
        expect(component.newPlayer.firstName).toBe('Пётр');
    });
    it('saves number and captain together without exposing extra per-row forms', async () => {
        component.startEdit(player);
        component.editNumber = 9;
        component.editCaptain = true;
        expect(component.hasUnsavedChanges()).toBeTrue();
        await component.update(
            player,
            component.editCaptain,
            component.editNumber,
        );
        expect(api.updatePlayer).toHaveBeenCalledWith(3, 10, {
            shirtNumber: 9,
            isCaptain: true,
        });
        expect(component.editingPlayer()).toBeNull();
    });
    it('keeps the transfer workflow instead of duplicating a player', async () => {
        api.add.and.returnValue(of({ transferRequested: true }));
        await component.add(20);
        expect(component.notice()).toContain(
            'До подтверждения игрок остаётся в прежней команде',
        );
        expect(api.createPlayer).not.toHaveBeenCalled();
    });
    it('prevents adding beyond the displayed squad limit', () => {
        component.roster.set(
            Array.from({ length: 12 }, (_, id) => ({ ...player, id })),
        );
        component.startAdd();
        expect(component.showAdd()).toBeFalse();
    });
});
