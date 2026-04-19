import { Component } from '@angular/core';

import { UtilsService } from 'src/app/shared/services/utils.service';
import { FormsModule } from '@angular/forms';
import { AutosizeModule } from 'ngx-autosize';

@Component({
    selector: 'app-edit-fermee-multiple',
    imports: [FormsModule, AutosizeModule],
    templateUrl: './edit-fermee-multiple.component.html',
    styleUrls: ['./edit-fermee-multiple.component.scss']
})
export class EditFermeeMultipleComponent {

  typeComponent: string="EditFermeeMultipleComponent";
  componentId: any;
  libelleQuestion = "";
  modalites: any ;
  maxReponses: number =0;

  constructor(private utilsService: UtilsService,){
    this.componentId = this.utilsService.generateUniqueId();
  }
}
