import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatchCardVm } from '../../model/match-card.vm';
import { MatchScheduleRowComponent } from './match-schedule-row.component';

describe('MatchScheduleRowComponent', () => {
    let fixture: ComponentFixture<MatchScheduleRowComponent>;
    const record: MatchCardVm = {
        id: 91,
        round: 'Группа А, тур 1',
        status: 'scheduled',
        matchDateTime: '2026-07-21T18:30:00',
        homeTeamId: 1,
        homeTeamName: 'Арман',
        homeTeamLogoUrl: '/brand/logos/mark_white.svg',
        homeTeamScore: 0,
        awayTeamId: 2,
        awayTeamName: 'Соперник',
        awayTeamLogoUrl: '/images/teams/other.png',
        awayTeamScore: 0,
        venueName: 'Поле №53',
        competitionName: 'Дворовая лига',
        seasonYear: 2026,
    };
    const render = (overrides: Partial<MatchCardVm> = {}): void => {
        fixture.componentRef.setInput('match', { ...record, ...overrides });
        fixture.detectChanges();
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [MatchScheduleRowComponent],
        }).compileComponents();
        fixture = TestBed.createComponent(MatchScheduleRowComponent);
    });

    it('shows the scheduled kick-off instead of a misleading zero score', () => {
        render();
        expect(
            fixture.nativeElement
                .querySelector('.match-schedule__time strong')
                .textContent.trim(),
        ).toBe('18:30');
        expect(
            fixture.nativeElement.querySelector('.match-schedule__score'),
        ).toBeNull();
        expect(fixture.nativeElement.textContent).toContain('Начало матча');
    });

    it('preserves a completed zero score and kick-off time', () => {
        render({ status: 'finished', homeTeamScore: 0, awayTeamScore: 2 });
        expect(
            fixture.nativeElement
                .querySelector('.match-schedule__score')
                .textContent.replace(/\s/g, ''),
        ).toBe('Счёт0:2');
        expect(fixture.nativeElement.textContent).toContain('Матч окончен');
        expect(
            fixture.nativeElement.querySelector('time').textContent,
        ).toContain('18:30');
    });

    it('does not invent a result when completed scores are unavailable', () => {
        render({
            status: 'finished',
            homeTeamScore: null,
            awayTeamScore: null,
        });
        expect(
            fixture.nativeElement.querySelector('.match-schedule__score')
                .textContent,
        ).toContain('—');
    });

    it('labels live and cancelled matches correctly', () => {
        render({ status: 'live', homeTeamScore: 1 });
        expect(
            fixture.nativeElement.querySelector('.match-schedule--live'),
        ).not.toBeNull();
        expect(fixture.nativeElement.textContent).toContain('Идёт матч');
        render({ status: 'cancelled' });
        expect(
            fixture.nativeElement.querySelector('.match-schedule__score'),
        ).toBeNull();
        expect(fixture.nativeElement.textContent).toContain('Отменён');
    });

    it('localises play-off round names without changing group labels', () => {
        render({ round: 'semi_final:SF-1' });
        expect(
            fixture.nativeElement
                .querySelector('.match-schedule__round')
                .textContent.trim(),
        ).toBe('Полуфинал №1');
        render();
        expect(
            fixture.nativeElement.querySelector('.match-schedule__round')
                .textContent,
        ).toContain('Группа А, тур 1');
    });

    it('removes internal final positions and explains two-legged ties', () => {
        render({ round: 'final:FINAL' });
        expect(fixture.componentInstance.roundLabel()).toBe('Финал');
        render({ round: 'third_place:THIRD_PLACE' });
        expect(fixture.componentInstance.roundLabel()).toBe('За 3-е место');
        render({ round: 'quarter_final:QF-2-L2' });
        expect(fixture.componentInstance.roundLabel()).toBe(
            'Четвертьфинал №2 · ответный матч',
        );
    });

    it('uses the matching dark fallback mark for the light schedule surface', () => {
        render();
        expect(
            fixture.nativeElement
                .querySelector('.match-schedule__team img')
                .getAttribute('src'),
        ).toBe('/brand/logos/mark_black.svg');
    });

    it('handles broken team logos and unknown venues', () => {
        render({ venueName: null });
        fixture.nativeElement
            .querySelector('.match-schedule__team img')
            .dispatchEvent(new Event('error'));
        fixture.detectChanges();
        expect(
            fixture.nativeElement
                .querySelector('.match-schedule__fallback')
                .textContent.trim(),
        ).toBe('А');
        expect(fixture.nativeElement.textContent).toContain(
            'Площадка уточняется',
        );
    });

    it('uses a native button and emits the existing match id for protocol navigation', () => {
        render({
            homeTeamName: 'Команда с очень длинным названием без сокращения',
        });
        const ids: number[] = [];
        fixture.componentInstance.cardClick.subscribe((id) => ids.push(id));
        const button: HTMLButtonElement =
            fixture.nativeElement.querySelector('button');
        expect(button.type).toBe('button');
        expect(button.textContent).toContain(
            'Команда с очень длинным названием без сокращения',
        );
        button.click();
        expect(ids).toEqual([91]);
    });
});
