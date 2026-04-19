import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditFermeeSimpleComponent } from './edit-fermee-simple.component';

describe('EditFermeeSimpleComponent', () => {
  let component: EditFermeeSimpleComponent;
  let fixture: ComponentFixture<EditFermeeSimpleComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EditFermeeSimpleComponent]
    });
    fixture = TestBed.createComponent(EditFermeeSimpleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
