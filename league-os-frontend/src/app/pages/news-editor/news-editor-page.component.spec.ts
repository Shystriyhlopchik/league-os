import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { NewsApiService } from '../../entities/news/api/news.api.service';
import { NewsEditorPageComponent } from './news-editor-page.component';
import { News, NewsPublication } from '../../entities/news/model/news.types';

describe('NewsEditorPageComponent', () => {
    let fixture: ComponentFixture<NewsEditorPageComponent>;
    let api: jasmine.SpyObj<NewsApiService>;
    const news: News = {
        id: 11,
        communityId: 1,
        title: 'Итоги тура',
        content: 'Статья',
        slug: 'results',
        coverUrl: null,
        publishedAt: null,
        status: 'published',
        slugLocked: true,
    };
    const job: NewsPublication = {
        id: 1,
        status: 'queued',
        message: 'Анонс',
        imageUrl: null,
        articleUrl: 'https://liga-dvora.ru/news/results',
        postUrl: null,
        errorMessage: null,
        publishedAt: null,
        attempts: 0,
    };

    beforeEach(async () => {
        api = jasmine.createSpyObj('NewsApiService', [
            'getAdminById',
            'create',
            'update',
            'publish',
            'uploadCover',
            'communities',
            'vkConnection',
            'vkStatus',
            'sendVk',
            'retryVk',
            'checkVkConnection',
        ]);
        api.communities.and.returnValue(
            of([
                {
                    id: 1,
                    name: 'Лига',
                    slug: 'liga',
                    role: 'admin',
                    canManageMembers: false,
                    canManageTournaments: true,
                },
            ]),
        );
        api.vkConnection.and.returnValue(
            of({ configured: false, groupId: null, groupUrl: null }),
        );
        api.vkStatus.and.returnValue(of(null));
        api.create.and.returnValue(of(news));
        api.update.and.returnValue(of(news));
        api.publish.and.returnValue(of(news));
        api.sendVk.and.returnValue(of(job));
        api.retryVk.and.returnValue(of(job));
        await TestBed.configureTestingModule({
            imports: [NewsEditorPageComponent],
            providers: [
                provideRouter([]),
                { provide: NewsApiService, useValue: api },
            ],
        }).compileComponents();
        fixture = TestBed.createComponent(NewsEditorPageComponent);
        fixture.detectChanges();
    });

    afterEach(() => fixture.destroy());

    it('requires a title and article content', () => {
        fixture.componentInstance.save(false);
        fixture.detectChanges();

        expect(fixture.componentInstance.form.invalid).toBeTrue();
        expect(fixture.nativeElement.textContent).toContain(
            'Введите заголовок',
        );
        expect(fixture.nativeElement.textContent).toContain(
            'Введите текст новости',
        );
    });

    function ready() {
        const page = fixture.componentInstance;
        page.newsId.set(11);
        page.published.set(true);
        page.vkConnection.set({
            configured: true,
            groupId: '123',
            groupUrl: 'https://vk.com/club123',
        });
        page.form.patchValue({
            title: news.title,
            content: news.content,
            slug: news.slug,
            vkText: 'Анонс',
        });
        return page;
    }

    it('explains that VK receives text and a link without an attached image or card', () => {
        ready();
        fixture.detectChanges();
        const text = fixture.nativeElement.textContent.replace(/\s+/g, ' ');
        expect(text).toContain('Фотография и карточка ссылки не прикрепляются');
        expect(text).toContain('Картинка-превью в посте ВК не гарантируется');
        expect(text).not.toContain('ВК сам формирует карточку ссылки');
        expect(api.sendVk).not.toHaveBeenCalled();
    });

    it('does not send a draft or unsaved changes', () => {
        const page = ready();
        page.published.set(false);
        page.sendVk();
        page.published.set(true);
        page.form.markAsDirty();
        page.sendVk();
        expect(api.sendVk).not.toHaveBeenCalled();
        expect(page.vkError()).toContain('сохраните');
    });

    it('saves a separate teaser without automatically posting to VK', () => {
        const page = ready();
        page.form.patchValue({ vkTitle: 'Заголовок ВК', vkText: 'Анонс ВК' });
        page.save(false);
        expect(api.update).toHaveBeenCalledWith(
            11,
            jasmine.objectContaining({
                vkTitle: 'Заголовок ВК',
                vkText: 'Анонс ВК',
                communityId: 1,
            }),
        );
        expect(api.sendVk).not.toHaveBeenCalled();
        expect(page.form.pristine).toBeTrue();
    });

    it('does not create another article when publishing the first saved draft failed', () => {
        const page = fixture.componentInstance;
        page.form.patchValue({ title: news.title, content: news.content });
        api.publish.and.returnValue(
            throwError(() => ({ error: { message: 'Ошибка публикации' } })),
        );
        page.save(true);
        page.save(false);
        expect(api.create).toHaveBeenCalledTimes(1);
        expect(api.update).toHaveBeenCalledTimes(1);
    });

    it('requires confirmation and blocks double clicks while enqueuing', () => {
        const page = ready();
        const pending = new Subject<NewsPublication>();
        spyOn(window, 'confirm').and.returnValue(true);
        api.sendVk.and.returnValue(pending);
        page.sendVk();
        page.sendVk();
        expect(api.sendVk).toHaveBeenCalledTimes(1);
        pending.next(job);
        pending.complete();
        expect(page.vkPublication()?.status).toBe('queued');
        expect(page.vkBusy()).toBeFalse();
    });

    it('requires checking the VK wall before retrying an unknown result', () => {
        const page = ready();
        page.vkPublication.set({ ...job, status: 'unknown' });
        const confirm = spyOn(window, 'confirm').and.returnValue(false);
        page.sendVk(true);
        expect(api.retryVk).not.toHaveBeenCalled();
        confirm.and.returnValue(true);
        page.sendVk(true);
        expect(api.retryVk).toHaveBeenCalledWith(11, true);
    });

    it('marks cover-only edits as unsaved and rejects WebP for VK', () => {
        const page = ready();
        page.selectVkImage({
            target: {
                files: [new File(['x'], 'image.webp', { type: 'image/webp' })],
                value: '',
            },
        } as unknown as Event);
        expect(page.vkError()).toContain('JPEG или PNG');
        page.removeCover();
        expect(page.form.dirty).toBeTrue();
    });

    it('shows the confirmed post URL and does not offer another send', () => {
        const page = ready();
        page.vkPublication.set({
            ...job,
            status: 'published',
            postUrl: 'https://vk.com/wall-123_1',
        });
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector(
                'a[href="https://vk.com/wall-123_1"]',
            ),
        ).not.toBeNull();
        expect(fixture.nativeElement.textContent).toContain(
            'Опубликовано в ВК',
        );
        expect(fixture.nativeElement.textContent).not.toContain(
            'Отправить анонс в ВК',
        );
    });

    it('explains that an image belongs to the link card, not a separate VK photo', () => {
        ready();
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain(
            'Изображение карточки ссылки ВК',
        );
        expect(fixture.nativeElement.textContent).toContain(
            'Отдельная фотография к посту не прикрепляется',
        );
    });

    it('shows a community-key preflight result without creating a post', () => {
        const page = ready();
        api.checkVkConnection.and.returnValue(
            of({
                configured: true,
                groupId: '123',
                groupUrl: 'https://vk.com/club123',
                tokenType: 'community',
                publicationVerified: false,
                message: 'Ключ сообщества принят. Пост не создан.',
            }),
        );
        page.checkConnection();
        expect(page.notice()).toContain('Пост не создан');
        expect(api.sendVk).not.toHaveBeenCalled();
        expect(page.vkConnection()?.publicationVerified).toBeFalse();
    });
});
