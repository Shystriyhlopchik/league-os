import { ApplicationRef } from '@angular/core';
import {
    ComponentFixture,
    fakeAsync,
    TestBed,
    tick,
} from '@angular/core/testing';
import {
    YAN_WINDOW,
    YandexAdComponent,
    YandexAdOptions,
    YandexAdWindow,
} from './yandex-ad.component';

describe('Yandex home-page advertising', () => {
    let win: YandexAdWindow | null;
    let render: jasmine.Spy;
    let destroy: jasmine.Spy;
    let fixtures: ComponentFixture<YandexAdComponent>[];
    beforeEach(() => {
        fixtures = [];
        render = jasmine.createSpy('render');
        destroy = jasmine.createSpy('destroy');
        win = {
            location: { hostname: 'liga-dvora.ru' },
            setTimeout: window.setTimeout.bind(window),
            clearTimeout: window.clearTimeout.bind(window),
            yaContextCb: [],
            Ya: { Context: { AdvManager: { render, destroy } } },
        };
        TestBed.configureTestingModule({
            imports: [YandexAdComponent],
            providers: [{ provide: YAN_WINDOW, useFactory: () => win }],
        });
    });
    afterEach(() => fixtures.forEach((fixture) => fixture.destroy()));

    function create() {
        const fixture = TestBed.createComponent(YandexAdComponent);
        fixtures.push(fixture);
        fixture.detectChanges();
        TestBed.inject(ApplicationRef).tick();
        fixture.detectChanges();
        return fixture;
    }
    function options(): YandexAdOptions {
        return render.calls.mostRecent().args[0];
    }

    it('renders the configured dark-theme block only after its target exists', () => {
        render.and.callFake((options: YandexAdOptions) => {
            expect(document.getElementById(options.renderTo)).not.toBeNull();
        });
        const fixture = create();
        expect(render).toHaveBeenCalledTimes(1);
        expect(options().blockId).toBe('R-A-20290516-1');
        expect(options().renderTo).toBe(fixture.componentInstance.containerId);
        expect(options().darkTheme).toBeTrue();
        expect(
            fixture.nativeElement
                .querySelector('aside')
                .getAttribute('aria-label'),
        ).toBe('Реклама');
        expect(fixture.nativeElement.querySelector('script')).toBeNull();
        fixture.detectChanges();
        TestBed.inject(ApplicationRef).tick();
        expect(render).toHaveBeenCalledTimes(1);
    });
    it('does not request real ads on localhost, IP addresses or unrelated domains', () => {
        for (const hostname of [
            'localhost',
            '127.0.0.1',
            '[::1]',
            'sport-cheb.ru',
            'liga-dvora.ru.example.com',
        ]) {
            win!.location.hostname = hostname;
            const fixture = create();
            expect(fixture.nativeElement.querySelector('aside')).toBeNull();
            expect(
                fixture.nativeElement.classList.contains('yan-ad--inactive'),
            ).toBeTrue();
        }
        expect(render).not.toHaveBeenCalled();
        expect(win!.yaContextCb).toEqual([]);
    });
    it('also supports the www mirror', () => {
        win!.location.hostname = 'www.liga-dvora.ru';
        create();
        expect(render).toHaveBeenCalledTimes(1);
    });
    it('does nothing without a browser window', () => {
        win = null;
        const fixture = create();
        expect(fixture.nativeElement.querySelector('aside')).toBeNull();
        expect(render).not.toHaveBeenCalled();
    });
    it('waits for the existing loader and invokes a queued callback at most once', fakeAsync(() => {
        win!.Ya = undefined;
        create();
        const queued = (win!.yaContextCb as (() => void)[])[0];
        expect(render).not.toHaveBeenCalled();
        win!.Ya = { Context: { AdvManager: { render, destroy } } };
        queued();
        queued();
        expect(render).toHaveBeenCalledTimes(1);
        tick(15_000);
        expect(destroy).not.toHaveBeenCalled();
    }));
    it('collapses if the loader is blocked and ignores a late callback', fakeAsync(() => {
        win!.Ya = undefined;
        const fixture = create();
        const queued = (win!.yaContextCb as (() => void)[])[0];
        tick(15_000);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('aside')).toBeNull();
        expect(win!.yaContextCb).toEqual([]);
        win!.Ya = { Context: { AdvManager: { render, destroy } } };
        queued();
        expect(render).not.toHaveBeenCalled();
    }));
    it('removes a pending callback and does not render after navigation', () => {
        win!.Ya = undefined;
        const fixture = create();
        const queued = (win!.yaContextCb as (() => void)[])[0];
        fixture.destroy();
        expect(win!.yaContextCb).toEqual([]);
        win!.Ya = { Context: { AdvManager: { render, destroy } } };
        queued();
        expect(render).not.toHaveBeenCalled();
    });
    it('collapses when no ad is selected using the SDK fallback argument', () => {
        const fixture = create();
        const fallback = render.calls.mostRecent().args[1];
        fallback();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('aside')).toBeNull();
        expect(destroy).toHaveBeenCalledOnceWith({
            renderTo: fixture.componentInstance.containerId,
        });
    });
    it('collapses for a fatal SDK error but not for a warning', () => {
        const fixture = create();
        options().onError({ type: 'warning' });
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('aside')).not.toBeNull();
        options().onError({ type: 'error' });
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('aside')).toBeNull();
    });
    it('does not hide an already displayed ad on a late error or timer', fakeAsync(() => {
        const fixture = create();
        options().onRender();
        options().onError({ type: 'error' });
        tick(60_000);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('aside')).not.toBeNull();
        expect(destroy).not.toHaveBeenCalled();
    }));
    it('isolates render and teardown exceptions from application navigation', () => {
        render.and.throwError('blocked');
        destroy.and.throwError('unavailable');
        const fixture = create();
        expect(fixture.componentInstance.unavailable()).toBeTrue();
        expect(() => fixture.destroy()).not.toThrow();
    });
    it('releases only its own slot and uses a new ID on route re-entry', () => {
        const first = create();
        const firstId = first.componentInstance.containerId;
        const lateError = options().onError;
        first.destroy();
        expect(destroy).toHaveBeenCalledOnceWith({ renderTo: firstId });
        const second = create();
        expect(second.componentInstance.containerId).not.toBe(firstId);
        expect(render).toHaveBeenCalledTimes(2);
        lateError({ type: 'error' });
        expect(second.componentInstance.unavailable()).toBeFalse();
        expect(destroy).toHaveBeenCalledTimes(1);
    });
});
