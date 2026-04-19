import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditFermeeMultipleComponent } from './edit-fermee-multiple.component';

describe('EditFermeeMultipleComponent', () => {
  let component: EditFermeeMultipleComponent;
  let fixture: ComponentFixture<EditFermeeMultipleComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EditFermeeMultipleComponent]
    });
    fixture = TestBed.createComponent(EditFermeeMultipleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
