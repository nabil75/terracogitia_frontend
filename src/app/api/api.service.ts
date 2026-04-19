import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';


@Injectable({
  providedIn: 'root'
})

export class ApiService {

  constructor(private http: HttpClient) {}

  baseurl = "http://localhost:8002";
  httpHeaders_json = new HttpHeaders({'Content-Type':'application/json'});
  httpHeaders_text = new HttpHeaders({'Content-Type':'text/plain'});

  getAllThemes(){
    return this.http.get(this.baseurl+"/themes/all_themes", {headers: this.httpHeaders_json});
  }

  getQuestionnary(id_questionnary: number){
    return this.http.get(this.baseurl+"/themes/get_questionnary/"+id_questionnary, {headers: this.httpHeaders_json});
  }

  getQuestionsBySubTheme(idSubTheme: string){
    return this.http.get(this.baseurl+"/themes/getQuestionsBySubTheme/"+idSubTheme, {headers: this.httpHeaders_json});
  }

  evaluateResponse(subtheme: string, question: string, response: string){
    return this.http.post(
      this.baseurl+"/evaluations/evaluate_response",
      { subtheme, question, response },
      {headers: this.httpHeaders_json, responseType: 'text'}
    );
  }

  storeEvaluation(evaluation: string, note: number, points_cles: string[]){
    return this.http.post(
      this.baseurl+"/evaluations/store_evaluation",
      { evaluation, note, points_cles },
      {headers: this.httpHeaders_json}
    );
  }

  insertResult(content: any, id_questionnary: number){
    return this.http.get(this.baseurl+"/evaluations/post_result", {headers: this.httpHeaders_json});
  }

}