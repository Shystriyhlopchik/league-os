import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrganizersComponent } from './organizers.component';

describe('OrganizersComponent', () => {
  let component: OrganizersComponent;
  let fixture: ComponentFixture<OrganizersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizersComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OrganizersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
