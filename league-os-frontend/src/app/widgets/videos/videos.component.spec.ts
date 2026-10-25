import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
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
    function setup(result = of([video])) {
        const api = { featured: jasmine.createSpy().and.returnValue(result) };
        const close = jasmine.createSpy();
        const dialog = { open: jasmine.createSpy().and.returnValue({ close }) };
        TestBed.configureTestingModule({
            imports: [VideosComponent],
            providers: [
                { provide: VideoApi, useValue: api },
                { provide: Dialog, useValue: dialog },
            ],
        }).overrideProvider(Dialog, { useValue: dialog });
        const fixture = TestBed.createComponent(VideosComponent);
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
