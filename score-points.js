'use strict';
/* Raw scores from the same Excel column groups as deviation scores.
 * Saved under score.points; deviation score keys and graphs are unchanged. */
(() => {
 const POINTS_FIELDS_MIDDLE=SUBJECTS;
 function pointValue(value){
   if(value===null||value===undefined||String(value).trim()==='')return null;
   const n=Number(String(value).replace(/,/g,''));
   return Number.isFinite(n)?n:null;
 }
 function pointColumn(mapping,key,rows,headerRow){
   const col=mapping?.[key];
   if(!Number.isInteger(col)||col<2)return -1;
   for(const lineIndex of [headerRow,headerRow+1,headerRow-1]){
     const header=rows[lineIndex]||[];
     if(CLEAN(header[col]).includes('偏差値')&&/^(得点|点数)$/.test(CLEAN(header[col-2])))return col-2;
   }
   return -1; // Do not infer a score from an unlabeled adjacent column.
 }
 function collectPoints(row,mapping,rows,headerRow,keys){
   const values={};
   for(const key of keys){
     const col=pointColumn(mapping,key,rows,headerRow);
     values[key]=col<0?null:pointValue(row[col]);
   }
   return values;
 }
 function attachRawPoints(people,rows,mapping,headerRow,elementary){
   const keys=elementary?['ja','ma','sc','so','two','three','threeFour','totalRaw']:POINTS_FIELDS_MIDDLE.map(x=>x[0]);
   for(const person of people){
     const row=rows[person.excelRow-1]||[];
     const values=collectPoints(row,mapping,rows,headerRow,keys);
     if(elementary){
       const count=['ja','ma','sc','so'].filter(k=>person.scores[k]!=null).length;
       values.total=count===4?values.totalRaw:count===3?values.threeFour:count===2?values.two:null;
     }
     person.scores.points=values;
   }
   return people;
 }
 const oldPreviewRows=previewRows;
 previewRows=function(rows,mapping,headerRow){
   const people=oldPreviewRows(rows,mapping,headerRow);
   const isElementary=Object.prototype.hasOwnProperty.call(mapping||{},'totalRaw');
   return attachRawPoints(people,rows,mapping,headerRow,isElementary);
 };
 function formatPoint(value){
   if(value==null||!Number.isFinite(Number(value)))return '—';
   const n=Number(value);
   return Number.isInteger(n)?String(n):String(Math.round(n*10)/10);
 }
 function pairedCell(deviation,points){
   const hasDeviation=deviation!=null;
   const hasPoints=points!=null;
   return '<td class="score-pair-cell"><span class="score-deviation"><span class="score-kind">偏</span> '+(hasDeviation?fmt(deviation):'—')+'</span>'+
    '<span class="score-points"><span class="score-kind">点</span> '+(hasPoints?formatPoint(points):'—')+'</span></td>';
 }
 function pairedTable(rows,elementary,cls,order='date'){
   const choices=elementary?ELEMENTARY_FIELDS:SUBJECTS;
   // Elementary school: do not show a column that is missing throughout the selected exams.
   const fields=elementary?choices.filter(([k])=>rows.some(r=>r.score?.[k]!=null||r.score?.points?.[k]!=null)):choices;
   const main=order==='name'?[['name','模試'],['date','実施日']]:[['date','実施日'],['name','模試']];
   const head='<thead><tr>'+main.map(x=>'<th>'+x[1]+'</th>').join('')+
    fields.map(x=>'<th>'+escapeHTML(x[1])+'</th>').join('')+'</tr></thead>';
   const body='<tbody>'+rows.map(r=>'<tr>'+main.map(([k])=>'<td>'+escapeHTML(k==='date'?r.exam.date:r.exam.name)+'</td>').join('')+
    fields.map(([k])=>pairedCell(r.score?.[k],r.score?.points?.[k])).join('')+'</tr>').join('')+'</tbody>';
   return '<table class="'+cls+' score-dual-table">'+head+body+'</table>';
 }
 function replaceTable(html,cls,table){
   const find=new RegExp('<table class="'+cls+'[^\"]*">[\\s\\S]*?<\\/table>');
   return html.replace(find,()=>table);
 }
 function updateHeading(html){
   return html.replace('偏差値一覧','成績一覧（偏差値・得点）');
 }
 const oldPaperMarkup=paperMarkup;
 paperMarkup=function(student){
   const html=oldPaperMarkup(student);
   const rows=scoresOf(student.id,reportExamIds());
   return updateHeading(replaceTable(html,'paper-table',pairedTable(rows,isElementaryGrade(student.grade),'paper-table')));
 };
 const oldRenderDetail=renderDetail;
 renderDetail=function(){
   const html=oldRenderDetail();
   const stu=state.students.find(s=>s.id===currentStudent);
   if(!stu)return html;
   const rows=scoresOf(stu.id);
   return updateHeading(replaceTable(html,'data-table',pairedTable(rows,isElementaryGrade(stu.grade),'data-table','name')));
 };
})();
