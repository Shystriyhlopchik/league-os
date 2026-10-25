import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NewsPreviewComponent } from './news-preview.component';
import { NewsPreviewStore } from '../../model/news-preview.store';
import { NewsCardVm } from '../../../../entities/news/model/news-card.vm';

describe('Editorial news layout', () => {
    const items: NewsCardVm[] = Array.from({ length: 6 }, (_, i) => ({
        id: i + 1,
        slug: `article-${i + 1}`,
        title: `Новость ${i + 1}`,
        imageUrl: null,
        imageAlt: null,
        publishedAt: '2026-10-25',
    }));
    async function setup(count = 6, variant: 'preview' | 'page' = 'preview') {
        const news = signal(items.slice(0, count));
        const store = {
            news,
            isLoading: signal(false),
            isEmpty: signal(!count),
            error: signal(null),
            loadLatest: jasmine.createSpy(),
            loadMore: jasmine.createSpy(),
        };
        await TestBed.configureTestingModule({
            imports: [NewsPreviewComponent],
            providers: [provideRouter([])],
        })
            .overrideComponent(NewsPreviewComponent, {
                set: {
                    providers: [{ provide: NewsPreviewStore, useValue: store }],
                },
            })
            .compileComponents();
        const fixture = TestBed.createComponent(NewsPreviewComponent);
        fixture.componentRef.setInput('variant', variant);
        fixture.detectChanges();
        return { fixture, store };
    }
    it('keeps only three articles alongside the featured one and places the rest below', async () => {
        const { fixture } = await setup();
        const root = fixture.nativeElement;
        expect(root.querySelectorAll('.news-preview__featured').length).toBe(1);
        expect(
            root.querySelectorAll('.news-preview__side-list app-news-card')
                .length,
        ).toBe(3);
        expect(
            root.querySelectorAll('.news-preview__remaining app-news-card')
                .length,
        ).toBe(2);
        expect(
            Array.from(root.querySelectorAll('a')).map((a) =>
                (a as HTMLAnchorElement).getAttribute('href'),
            ),
        ).toEqual(items.map((item) => `/news/${item.slug}`));
    });
    it('does not duplicate or hide articles as the data changes', async () => {
        const { fixture, store } = await setup();
        store.news.set(items.slice(0, 4));
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelectorAll('app-news-card').length,
        ).toBe(4);
        expect(
            fixture.nativeElement.querySelector('.news-preview__remaining'),
        ).toBeNull();
        store.news.set(items);
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelectorAll('app-news-card').length,
        ).toBe(6);
    });
    it('keeps the single-article layout without empty side or bottom wrappers', async () => {
        const { fixture } = await setup(1);
        expect(
            fixture.nativeElement.querySelector('.news-preview__grid--single'),
        ).not.toBeNull();
        expect(
            fixture.nativeElement.querySelector('.news-preview__side-list'),
        ).toBeNull();
        expect(
            fixture.nativeElement.querySelector('.news-preview__remaining'),
        ).toBeNull();
    });
    it('preserves the separate full news page layout', async () => {
        const { fixture } = await setup(6, 'page');
        expect(
            fixture.nativeElement.querySelectorAll(
                '.news-preview__side-list app-news-card',
            ).length,
        ).toBe(5);
        expect(
            fixture.nativeElement.querySelector('.news-preview__remaining'),
        ).toBeNull();
    });
    it('preserves the empty state', async () => {
        const { fixture } = await setup(0);
        expect(fixture.nativeElement.textContent).toContain(
            'Новостей пока нет',
        );
        expect(
            fixture.nativeElement.querySelectorAll('app-news-card').length,
        ).toBe(0);
    });
});
