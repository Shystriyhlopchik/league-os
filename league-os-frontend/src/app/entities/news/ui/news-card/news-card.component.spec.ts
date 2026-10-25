import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NewsCardComponent } from './news-card.component';

describe('News brand fallback', () => {
    let fixture: ComponentFixture<NewsCardComponent>;
    const news = {
        id: 1,
        slug: 'news',
        title: 'Новости лиги',
        publishedAt: '2026-10-24',
        imageAlt: 'Футбольный матч',
        imageUrl: '/photo.jpg',
    };
    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [NewsCardComponent],
            providers: [provideRouter([])],
        }).compileComponents();
        fixture = TestBed.createComponent(NewsCardComponent);
        fixture.componentRef.setInput('news', news);
        fixture.detectChanges();
    });
    it('preserves uploaded photos and article links', () => {
        expect(
            fixture.nativeElement
                .querySelector('.news-card__image')
                .getAttribute('src'),
        ).toBe('/photo.jpg');
        expect(
            fixture.nativeElement.querySelector('a').getAttribute('href'),
        ).toBe('/news/news');
    });
    it('shows a decorative brand fallback for missing photos', () => {
        fixture.componentRef.setInput('news', { ...news, imageUrl: null });
        fixture.detectChanges();
        expect(
            fixture.nativeElement
                .querySelector('.news-card__placeholder')
                .getAttribute('aria-hidden'),
        ).toBe('true');
        expect(
            fixture.nativeElement.querySelector('img').getAttribute('src'),
        ).toBe('brand/logos/stacked_white.svg');
        expect(fixture.nativeElement.textContent).toContain('Новости лиги');
    });
    it('replaces broken photos without losing the title', () => {
        fixture.nativeElement
            .querySelector('img')
            .dispatchEvent(new Event('error'));
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('.news-card__placeholder'),
        ).not.toBeNull();
        expect(fixture.nativeElement.textContent).toContain('Новости лиги');
    });
    it('tries a new photo when the component input changes', () => {
        fixture.nativeElement
            .querySelector('img')
            .dispatchEvent(new Event('error'));
        fixture.detectChanges();
        fixture.componentRef.setInput('news', {
            ...news,
            imageUrl: '/replacement.jpg',
        });
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector('.news-card__placeholder'),
        ).toBeNull();
        expect(
            fixture.nativeElement.querySelector('img').getAttribute('src'),
        ).toBe('/replacement.jpg');
    });
});
