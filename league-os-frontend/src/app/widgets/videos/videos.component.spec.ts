import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of, Subject, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';
import { VideoApi, PublicVideo } from '../../entities/video/video.api';
import { VideosComponent } from './videos.component';

describe('Home videos', () => {
    const video: PublicVideo = {
        id: 1,
        title: 'Наш матч',
        coverUrl: '/uploads/videos/cover.jpg',
        embedUrl: 'https://vkvideo.ru/video_ext.php?oid=-1&id=2',
        publishedAt: null,
        tournamentId: null,
        matchId: null,
    };
    function setup(result = of([video]), archive = false) {
        const api = {
            featured: jasmine.createSpy().and.returnValue(result),
            catalog: jasmine
                .createSpy()
                .and.returnValue(
                    of({ items: [video], total: 13, page: 1, limit: 12 }),
                ),
        };
        const close = jasmine.createSpy();
        const dialog = { open: jasmine.createSpy().and.returnValue({ close }) };
        TestBed.configureTestingModule({
            imports: [VideosComponent],
            providers: [
                provideRouter([]),
                { provide: VideoApi, useValue: api },
                { provide: Dialog, useValue: dialog },
            ],
        }).overrideProvider(Dialog, { useValue: dialog });
        const fixture = TestBed.createComponent(VideosComponent);
        fixture.componentRef.setInput('archive', archive);
        fixture.detectChanges();
        return { fixture, api, dialog, close };
    }
    it('renders covers without loading VK iframes until clicked', () => {
        const { fixture, dialog } = setup();
        expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
        expect(dialog.open).not.toHaveBeenCalled();
        fixture.nativeElement.querySelector('.video-card').click();
        expect(dialog.open).toHaveBeenCalled();
    });
    it('closes any previous player and closes on navigation/destruction', () => {
        const { fixture, close } = setup();
        fixture.componentInstance.play(video);
        fixture.componentInstance.play(video);
        expect(close).toHaveBeenCalledTimes(1);
        fixture.destroy();
        expect(close).toHaveBeenCalledTimes(2);
    });
    it('hides an empty block, without fake content', () => {
        const { fixture } = setup(of([]));
        expect(fixture.nativeElement.querySelector('section')).toBeNull();
    });
    it('links the home selection to the public video page', () => {
        const { fixture } = setup();
        expect(
            fixture.nativeElement.querySelector('a[href="/videos"]'),
        ).not.toBeNull();
    });
    it('loads the catalog rather than the featured selection on the video page', () => {
        const { fixture, api, dialog } = setup(of([]), true);
        expect(api.featured).not.toHaveBeenCalled();
        expect(api.catalog).toHaveBeenCalledOnceWith(1);
        expect(fixture.nativeElement.querySelector('h1').textContent).toContain(
            'Видео лиги',
        );
        expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
        fixture.nativeElement.querySelector('.video-card').click();
        expect(dialog.open).toHaveBeenCalled();
    });
    it('paginates and disables navigation while loading and at the boundaries', () => {
        const { fixture, api } = setup(of([]), true);
        let buttons = fixture.nativeElement.querySelectorAll(
            '.videos__pagination button',
        );
        expect(buttons[0].disabled).toBeTrue();
        const pending = new Subject();
        api.catalog.and.returnValue(pending);
        buttons[1].click();
        fixture.detectChanges();
        expect(api.catalog).toHaveBeenCalledWith(2);
        expect(buttons[1].disabled).toBeTrue();
        pending.next({
            items: [{ ...video, id: 2 }],
            total: 13,
            page: 2,
            limit: 12,
        });
        pending.complete();
        fixture.detectChanges();
        buttons = fixture.nativeElement.querySelectorAll(
            '.videos__pagination button',
        );
        expect(buttons[0].disabled).toBeFalse();
        expect(buttons[1].disabled).toBeTrue();
        expect(fixture.nativeElement.textContent).toContain('13–13 из 13');
    });
    it('keeps the archive heading and an empty state when nothing is published', () => {
        const { fixture, api } = setup(of([]), true);
        api.catalog.and.returnValue(
            of({ items: [], total: 0, page: 1, limit: 12 }),
        );
        fixture.componentInstance.load();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('h1')).not.toBeNull();
        expect(fixture.nativeElement.textContent).toContain(
            'Пока нет опубликованных видео',
        );
        expect(
            fixture.nativeElement.querySelector('.videos__pagination'),
        ).toBeNull();
    });
    it('retries the failed catalog page without switching to the home selection', () => {
        const { fixture, api } = setup(of([]), true);
        api.catalog.and.returnValue(throwError(() => new Error('offline')));
        fixture.componentInstance.load(2);
        fixture.detectChanges();
        api.catalog.and.returnValue(
            of({ items: [video], total: 13, page: 2, limit: 12 }),
        );
        fixture.nativeElement.querySelector('.videos__state button').click();
        fixture.detectChanges();
        expect(api.catalog).toHaveBeenCalledWith(2);
        expect(api.featured).not.toHaveBeenCalled();
        expect(fixture.componentInstance.failed()).toBeFalse();
    });
    it('lets visitors retry a failed request', () => {
        const { fixture, api } = setup(throwError(() => new Error('offline')));
        expect(fixture.nativeElement.textContent).toContain(
            'Не удалось загрузить',
        );
        api.featured.and.returnValue(of([video]));
        fixture.nativeElement.querySelector('button').click();
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelectorAll('.video-card').length,
        ).toBe(1);
    });
});
