import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NewsApiService } from '../../entities/news/api/news.api.service';
import { NewsManagementPageComponent } from './news-management-page.component';

describe('NewsManagementPageComponent', () => {
    let fixture: ComponentFixture<NewsManagementPageComponent>;
    let api: jasmine.SpyObj<NewsApiService>;

    beforeEach(async () => {
        api = jasmine.createSpyObj('NewsApiService', [
            'getAdminPage',
            'publish',
            'unpublish',
            'remove',
        ]);
        api.getAdminPage.and.returnValue(
            of({
                items: [
                    {
                        id: 1,
                        title: 'Новость тура',
                        slug: 'novost-tura',
                        content: 'Текст',
                        coverUrl: null,
                        publishedAt: null,
                        status: 'draft',
                    },
                ],
                total: 1,
                page: 1,
                limit: 50,
            }),
        );
        await TestBed.configureTestingModule({
            imports: [NewsManagementPageComponent],
            providers: [
                provideRouter([]),
                { provide: NewsApiService, useValue: api },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(NewsManagementPageComponent);
        fixture.detectChanges();
    });

    it('shows drafts and links to creating and editing articles', () => {
        expect(fixture.nativeElement.textContent).toContain('Новость тура');
        expect(fixture.nativeElement.textContent).toContain('Черновик');
        expect(
            fixture.nativeElement.querySelector(
                'a[href="/dashboard/new-news/new"]',
            ),
        ).not.toBeNull();
        expect(
            fixture.nativeElement.querySelector(
                'a[href="/dashboard/new-news/1/edit"]',
            ),
        ).not.toBeNull();
    });
});
