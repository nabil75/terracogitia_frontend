import { Component, ViewChild, ViewContainerRef, ComponentRef, inject } from '@angular/core';
import { ApiService } from '../../api/api.service';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { EditFermeeSimpleComponent } from '../edit-fermee-simple/edit-fermee-simple.component';
import { EditFermeeMultipleComponent } from '../edit-fermee-multiple/edit-fermee-multiple.component';
import { AutosizeModule } from 'ngx-autosize';
import { EditOuverteComponent } from '../edit-ouverte/edit-ouverte.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';


@Component({
    selector: 'app-edit-questionnaire',
    imports: [MatCardModule, FormsModule, AutosizeModule, TranslateModule, MatIconModule],
    templateUrl: './edit-questionnaire.component.html',
    styleUrls: ['./edit-questionnaire.component.scss']
})
export class EditQuestionnaireComponent {

  questions: ComponentRef<any>[] = [];
  id_questionnary: any;
  isIDVisible: boolean = false;
  intituleQuestionnaire:string ="";
  statusQuestionnary:string="Saisie Questionnaire";
  path_img_save: string="assets/images/quaero/save-blanc.png";
  activeTheme: string = "";


  @ViewChild('question', { read: ViewContainerRef }) container!: ViewContainerRef;

  constructor(private route: ActivatedRoute,
              private apiService: ApiService,
              private translate: TranslateService,
              
              ) { }

  ngOnInit(){
    const id = this.route.snapshot.paramMap.get('id');
    this.id_questionnary = id;
  }

  ngAfterViewInit() {
    if (this.id_questionnary != undefined){
      this.editQuestion();
      
    }
  }


    // Method to update image paths when theme changes
    updateImagePaths(theme: string) {
      if (theme === 'dark') {
        this.path_img_save = "assets/images/quaero/save-blanc.png";
      } else {
        this.path_img_save = "assets/images/quaero/save-noir.png";
      }
    }
  
  editQuestion () {
    this.apiService.getQuestionnary(this.id_questionnary).subscribe(
      (data:any) => {
        // data = JSON.parse(data.content);
        this.intituleQuestionnaire = decodeURIComponent(data[0].intitule).replace(/''/g, "'");
        const data_questions = data[0].content;
        console.log(data_questions);
        for (let i=0; i<data_questions.length;i++){
          switch(data_questions[i].type){
            case 'FermeeSimpleComponent':{
              const questionComponentRef = this.container.createComponent(EditFermeeSimpleComponent);
              questionComponentRef.instance.libelleQuestion= decodeURIComponent(data_questions[i].question).replace(/''/g, "'");
              questionComponentRef.instance.modalites= data_questions[i].modalites.map((modalite: { libelle: string; }) => ({...modalite, libelle: decodeURIComponent(modalite.libelle).replace(/''/g, "'")}));
              this.container.insert(questionComponentRef.hostView);
              this.questions.push(questionComponentRef);
              break;
            }
            case 'FermeeMultipleComponent':{
              const questionComponentRef = this.container.createComponent(EditFermeeMultipleComponent);
              questionComponentRef.instance.libelleQuestion= decodeURIComponent(data_questions[i].question);
              questionComponentRef.instance.modalites= data_questions[i].modalites.map((modalite: { libelle: string; }) => ({...modalite, libelle: decodeURIComponent(modalite.libelle).replace(/''/g, "'")}));
              questionComponentRef.instance.maxReponses=data_questions[i].maxReponses;
              this.container.insert(questionComponentRef.hostView);
              this.questions.push(questionComponentRef);
              break;
            }
            case 'OuverteComponent':{
              const questionComponentRef = this.container.createComponent(EditOuverteComponent);
              questionComponentRef.instance.libelleQuestion= decodeURIComponent(data_questions[i].question);
              // questionComponentRef.instance.reponseQuestion= data_questions[i].reponse;
              this.container.insert(questionComponentRef.hostView);
              this.questions.push(questionComponentRef);
              break;
            }
          }
        }
      });
  }

  saveQuestionnary(): void{
    const content:any=[];
    const content_question: any=[];
    let libelle_question: string="";
    let content_modalites: any=[];
    for (let i = 0; i < this.questions.length; i++) {
      const componentRef: ComponentRef<any> = this.questions[i] as ComponentRef<any>;
      libelle_question=encodeURIComponent(componentRef.instance.libelleQuestion).replace(/'/g, "''");
      switch(componentRef.instance.typeComponent){
        case 'EditFermeeSimpleComponent':{
          content_modalites=[];
          for (let j = 0; j < componentRef.instance.modalites.length; j++) {
            let isChecked: boolean  =false
            if(componentRef.instance.content == j){
              isChecked = true;
            }
            content_modalites.push({
              "position": componentRef.instance.modalites[j].position, 
              "libelle":encodeURIComponent(componentRef.instance.modalites[j].libelle).replace(/'/g, "''"),
              "isChecked": isChecked
            });
          }
          content_question.push({
            "type": "FermeeSimpleComponent",
            "question": libelle_question,
            "modalites": content_modalites
          });
          break;
        }
        case 'EditFermeeMultipleComponent':{
          content_modalites=[];
          for (let j = 0; j < componentRef.instance.modalites.length; j++) {
            content_modalites.push(
              {
                "position": componentRef.instance.modalites[j].position, 
                "libelle":encodeURIComponent(componentRef.instance.modalites[j].libelle).replace(/'/g, "''"),
                "isChecked": componentRef.instance.modalites[j].isChecked
              }
            );
          }
          content_question.push({
            "type": "FermeeMultipleComponent", 
            "question": libelle_question,
            "modalites" :content_modalites
          });
          break;
        }
        case 'EditOuverteComponent':{
          content_question.push({
            "type": componentRef.instance.typeComponent, 
            "reponse": encodeURIComponent(componentRef.instance.reponseQuestion).replace(/'/g, "''"),
            "question": libelle_question
          })
          break;
        }
      }
    }
    const dateCreation: Date = new Date();
    content.push({"intitule": encodeURIComponent(this.intituleQuestionnaire).replace(/'/g, "''"), "date": dateCreation, "questions": content_question})
    this.apiService.insertResult(JSON.stringify(content), this.id_questionnary).subscribe(() => {});
  }
}
