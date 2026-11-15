import { of, throwError } from 'rxjs';
import { MatchResultTeamsComponent } from './match-result-teams.component';

describe('Manual protocol event retries', () => {
    const setup = () => {
        const api = { createFinishedMatchEvent: jasmine.createSpy('create').and.returnValue(
            throwError(() => ({ error: { message: 'Связь прервалась' } }))), };
        const component: MatchResultTeamsComponent = Object.assign(Object.create(MatchResultTeamsComponent.prototype), {
            selectedTeamId: 1, selectedEventType: 'goal', eventMinute: 10, selectedHalf: 1,
            selectedPlayerId: 9, selectedAssistPlayerId: null, isSavingEvent: false,
            events: [], matchId: 7, isCorrectionMode: true, rosterApi: api,
            resetPenaltyShootoutForm: () => {}, resetEventForm: () => {}, store: { load: () => {} },
        });
        return { component, api };
    };
    it('reuses the same UUID after a lost response and allocates a fresh UUID for the next event', () => {
        const { component, api } = setup();
        component.addEvent();
        const first = api.createFinishedMatchEvent.calls.mostRecent().args[1].clientEventId;
        component.addEvent();
        expect(api.createFinishedMatchEvent.calls.mostRecent().args[1].clientEventId).toBe(first);
        api.createFinishedMatchEvent.and.returnValue(of({ id: 17, half: 1, minute: 10 }));
        component.addEvent();
        component.addEvent();
        expect(api.createFinishedMatchEvent.calls.mostRecent().args[1].clientEventId).not.toBe(first);
        expect(component.events.length).toBe(1);
    });
    it('does not reuse an old UUID when the organizer changes the event details after an error', () => {
        const { component, api } = setup();
        component.addEvent();
        const first = api.createFinishedMatchEvent.calls.mostRecent().args[1].clientEventId;
        component.eventMinute = 11;
        component.addEvent();
        expect(api.createFinishedMatchEvent.calls.mostRecent().args[1].clientEventId).not.toBe(first);
    });
});
