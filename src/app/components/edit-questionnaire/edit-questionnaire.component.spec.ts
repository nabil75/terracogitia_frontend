import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditQuestionnaireComponent } from './edit-questionnaire.component';
import { setupStandaloneComponentTest } from 'src/test/setup-test';
import { provideMockStore } from '@ngrx/store/testing';

describe('EditQuestionnaireComponent', () => {
  let component: EditQuestionnaireComponent;
  let fixture: ComponentFixture<EditQuestionnaireComponent>;

  beforeEach(() => {
    setupStandaloneComponentTest(EditQuestionnaireComponent);
    TestBed.configureTestingModule({
      providers: [provideMockStore({})]
    });
    fixture = TestBed.createComponent(EditQuestionnaireComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
