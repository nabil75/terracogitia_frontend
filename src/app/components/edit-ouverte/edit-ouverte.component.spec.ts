import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditOuverteComponent } from './edit-ouverte.component';

describe('EditOuverteComponent', () => {
  let component: EditOuverteComponent;
  let fixture: ComponentFixture<EditOuverteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditOuverteComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditOuverteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
