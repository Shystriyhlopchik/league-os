import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TeamLogosComponent } from './team-logos.component';

describe('TeamLogosComponent', () => {
    let component: TeamLogosComponent;
    let fixture: ComponentFixture<TeamLogosComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TeamLogosComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(TeamLogosComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
