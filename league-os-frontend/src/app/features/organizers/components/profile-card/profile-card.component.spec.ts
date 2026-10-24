import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProfileCardComponent } from './profile-card.component';

describe('ProfileCardComponent', () => {
    let component: ProfileCardComponent;
    let fixture: ComponentFixture<ProfileCardComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ProfileCardComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(ProfileCardComponent);
        component = fixture.componentInstance;
        fixture.componentRef.setInput('data', {
            id: 'test-organizer',
            fullName: 'Организатор лиги',
            photoUrl: '/brand/logos/mark_white.svg',
            bio: 'Команда организаторов',
            route: '/organizers/test-organizer',
        });
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
