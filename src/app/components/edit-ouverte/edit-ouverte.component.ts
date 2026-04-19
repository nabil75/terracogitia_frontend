import { Component } from '@angular/core';

import { UtilsService } from 'src/app/shared/services/utils.service';
import { FormsModule } from '@angular/forms';
import { AutosizeModule } from 'ngx-autosize';

@Component({
    selector: 'app-edit-ouverte',
    imports: [FormsModule, AutosizeModule],
    templateUrl: './edit-ouverte.component.html',
    styleUrl: './edit-ouverte.component.scss'
})
export class EditOuverteComponent {
  typeComponent: string="EditOuverteComponent";
  componentId: any;
  libelleQuestion = "";
  reponseQuestion: string="";

  constructor(private utilsService: UtilsService,){
    this.componentId = this.utilsService.generateUniqueId();
  }

}
