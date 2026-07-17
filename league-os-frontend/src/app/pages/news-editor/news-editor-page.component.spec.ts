import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NewsApiService } from '../../entities/news/api/news.api.service';
import { NewsEditorPageComponent } from './news-editor-page.component';

describe('NewsEditorPageComponent', () => {
    let fixture: ComponentFixture<NewsEditorPageComponent>;

    beforeEach(async () => {
        const api = jasmine.createSpyObj('NewsApiService', [
            'getAdminById',
            'create',
            'update',
            'publish',
            'uploadCover',
        ]);
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
});
