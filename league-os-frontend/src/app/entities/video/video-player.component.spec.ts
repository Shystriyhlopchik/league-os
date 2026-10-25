import { TestBed } from '@angular/core/testing';
import { ApplicationRef } from '@angular/core';
import {
    DIALOG_DATA,
    Dialog,
    DialogModule,
    DialogRef,
} from '@angular/cdk/dialog';
import { VideoPlayerComponent, trustedVkEmbed } from './video-player.component';

describe('Video player safety', () => {
    it('only trusts normalized VK embed URLs', () => {
        expect(
            trustedVkEmbed('https://vkvideo.ru/video_ext.php?oid=-1&id=2'),
        ).toContain('autoplay=0');
        for (const value of [
            'javascript:alert(1)',
            'https://vkvideo.ru.evil.test/video_ext.php?oid=-1&id=2',
            'https://vk.com/video-1_2',
            'https://vkvideo.ru/video_ext.php?oid=1&id=2&foo=bar',
            'https://x@vkvideo.ru/video_ext.php?oid=1&id=2',
            'https://vkvideo.ru/video_ext.php?oid=1&id=2&id=3',
        ]) {
            expect(trustedVkEmbed(value)).withContext(value).toBeNull();
        }
    });
    it('destroys the iframe with the dialog and exposes a close button', () => {
        const close = jasmine.createSpy();
        TestBed.configureTestingModule({
            imports: [VideoPlayerComponent],
            providers: [
                {
                    provide: DIALOG_DATA,
                    useValue: {
                        title: 'Матч',
                        embedUrl:
                            'https://vkvideo.ru/video_ext.php?oid=-1&id=2',
                    },
                },
                { provide: DialogRef, useValue: { close } },
            ],
        });
        const fixture = TestBed.createComponent(VideoPlayerComponent);
        fixture.detectChanges();
        const iframe = fixture.nativeElement.querySelector('iframe');
        expect(iframe.title).toBe('Матч');
        fixture.nativeElement.querySelector('button').click();
        expect(close).toHaveBeenCalled();
        fixture.destroy();
        expect(fixture.componentRef.hostView.destroyed).toBeTrue();
    });
    it('removes the iframe from the document when the real dialog closes', () => {
        TestBed.configureTestingModule({ imports: [DialogModule] });
        const dialog = TestBed.inject(Dialog);
        const ref = dialog.open(VideoPlayerComponent, {
            data: {
                title: 'Матч',
                embedUrl: 'https://vkvideo.ru/video_ext.php?oid=-1&id=2',
            },
        });
        TestBed.inject(ApplicationRef).tick();
        expect(
            document.querySelector('.cdk-overlay-container iframe'),
        ).not.toBeNull();
        ref.close();
        expect(
            document.querySelector('.cdk-overlay-container iframe'),
        ).toBeNull();
    });
});
