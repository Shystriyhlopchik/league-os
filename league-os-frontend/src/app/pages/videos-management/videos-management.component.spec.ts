import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CommunityApi } from '../../entities/community/community.api';
import { VideoApi, Video } from '../../entities/video/video.api';
import { VideosManagementComponent } from './videos-management.component';

describe('Video management', () => {
    let api: any;
    const video: Video = {
        id: 3,
        communityId: 2,
        title: 'Обзор',
        embedUrl: 'https://vkvideo.ru/video_ext.php?oid=-1&id=2',
        coverUrl: null,
        status: 'draft',
        showOnHome: true,
        sortOrder: 0,
        publishedAt: null,
        tournamentId: null,
        matchId: null,
    };
    async function setup() {
        api = {
            list: jasmine
                .createSpy()
                .and.returnValue(
                    of({
                        items: [video],
                        total: 1,
                        homeCount: 0,
                        page: 1,
                        limit: 20,
                    }),
                ),
            options: jasmine
                .createSpy()
                .and.returnValue(of({ tournaments: [], matches: [] })),
            save: jasmine.createSpy().and.returnValue(of(video)),
            upload: jasmine.createSpy(),
            archive: jasmine.createSpy().and.returnValue(of(null)),
        };
        TestBed.configureTestingModule({
            imports: [VideosManagementComponent],
            providers: [
                provideRouter([]),
                { provide: VideoApi, useValue: api },
                {
                    provide: CommunityApi,
                    useValue: {
                        list: () =>
                            of([
                                {
                                    id: 2,
                                    name: 'Лига',
                                    canManageTournaments: true,
                                },
                                {
                                    id: 9,
                                    name: 'Чужое',
                                    canManageTournaments: false,
                                },
                            ]),
                    },
                },
            ],
        });
        const fixture = TestBed.createComponent(VideosManagementComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        return fixture;
    }
    it('offers only communities the user can manage', async () => {
        const fixture = await setup();
        expect(
            fixture.componentInstance.communities().map((c) => c.id),
        ).toEqual([2]);
        expect(api.list).toHaveBeenCalledWith(2);
    });
    it('explains invalid fields and does not send a request', async () => {
        const fixture = await setup();
        fixture.componentInstance.create();
        await fixture.componentInstance.save();
        fixture.detectChanges();
        expect(api.save).not.toHaveBeenCalled();
        expect(fixture.nativeElement.textContent).toContain(
            'Проверьте название',
        );
        expect(
            fixture.componentInstance.form.controls.title.touched,
        ).toBeTrue();
    });
    it('requires a cover for publication', async () => {
        const fixture = await setup();
        const component = fixture.componentInstance;
        component.create();
        component.form.patchValue({
            title: 'Матч',
            source: 'https://vk.com/video-1_2',
            status: 'published',
        });
        await component.save();
        expect(api.save).not.toHaveBeenCalled();
        expect(component.error()).toContain('нужна обложка');
    });
    it('saves a draft in the selected community without an uploaded cover', async () => {
        const fixture = await setup();
        const component = fixture.componentInstance;
        component.create();
        component.form.patchValue({
            title: 'Матч',
            source: 'https://vk.com/video-1_2',
        });
        await component.save();
        expect(api.save).toHaveBeenCalledWith(
            2,
            null,
            jasmine.objectContaining({
                title: 'Матч',
                status: 'draft',
                coverUrl: null,
            }),
        );
        expect(component.editorOpen()).toBeFalse();
        expect(component.notice()).toContain('Черновик сохранён');
    });
    it('keeps form contents and explains server errors', async () => {
        const fixture = await setup();
        const component = fixture.componentInstance;
        component.create();
        component.form.patchValue({ title: 'Матч', source: 'wrong' });
        api.save.and.returnValue(
            throwError(() => ({ error: { message: 'Вставьте ссылку ВК' } })),
        );
        await component.save();
        expect(component.editorOpen()).toBeTrue();
        expect(component.error()).toContain('ссылку ВК');
        expect(component.form.controls.title.value).toBe('Матч');
        expect(component.saving()).toBeFalse();
    });
    it('warns before losing unsaved changes', async () => {
        const fixture = await setup();
        const component = fixture.componentInstance;
        component.create();
        component.form.markAsDirty();
        spyOn(window, 'confirm').and.returnValue(false);
        expect(component.canLeave()).toBeFalse();
        component.cancel();
        expect(component.editorOpen()).toBeTrue();
    });
    it('clears the match when selecting another tournament', async () => {
        const fixture = await setup();
        const component = fixture.componentInstance;
        component.form.patchValue({ tournamentId: 7, matchId: 123 });
        await component.tournamentChanged();
        expect(component.form.controls.matchId.value).toBeNull();
        expect(api.options).toHaveBeenCalledWith(2, 7);
    });
});
