import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MatchTableBlockComponent } from './match-table-block.component';

describe('MatchTableBlockComponent', () => {
  let component: MatchTableBlockComponent;
  let fixture: ComponentFixture<MatchTableBlockComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatchTableBlockComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MatchTableBlockComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
