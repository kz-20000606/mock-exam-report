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
 // Non-destructive raw-score backfill for files previously imported without points.
 // Require a unique exam match and consistent student deviation scores.
 const oldCommitBatchImport=commitBatchImport;
 commitBatchImport=function(){
   const drafts=batchDrafts.filter(d=>d.selected);
   if(!drafts.length)return oldCommitBatchImport();
   const plans=[],unmatched=[];
   for(const d of drafts){
     if(d.problem)return oldCommitBatchImport();
     const grade=validGrade(d.meta.grade),id=wk(yearOfDate(d.meta.date),grade);
     const raw=localStorage.getItem(storageKey(id));
     if(!raw){unmatched.push(d);continue;}
     let bundle;
     try{bundle=JSON.parse(raw);}catch(e){toast('既存データを読み込めません。','error');return;}
     if(!Array.isArray(bundle?.exams)||!Array.isArray(bundle?.scores)||!Array.isArray(bundle?.students)){
       toast('既存の成績データが不正です。','error');return;
     }
     let candidates=bundle.exams.filter(e=>e.date===d.meta.date&&validGrade(e.grade)===grade);
     const exact=candidates.filter(e=>norm(e.name)===norm(d.meta.name));
     if(exact.length===1)candidates=exact;
     else if(d.meta.round!=null){
       const byRound=candidates.filter(e=>Number(e.round)===Number(d.meta.round));
       if(byRound.length===1)candidates=byRound;
     }
     if(candidates.length>1){
       toast('同じ実施日の模試が複数あります。模試名と回数を確認してください：'+d.file.name,'error');return;
     }
     if(!candidates.length){unmatched.push(d);continue;}
     plans.push({d,id,bundle,exam:candidates[0]});
   }
   if(!plans.length)return oldCommitBatchImport();
   if(unmatched.length){
     toast('新規模試と得点補完のファイルは、分けて登録してください。','error');return;
   }
   let count=0,added=0;
   const staged=new Map(),updatedFiles=new Set();
   try{
     for(const plan of plans){
       let b=staged.get(plan.id);
       if(!b){
         b=plan.bundle;
         staged.set(plan.id,b);
       }
       const exam=b.exams.find(e=>e.id===plan.exam.id);
       if(!exam)throw Error('照合先の模試を特定できません。');
       const scoreByStudent=new Map(b.scores.filter(x=>x.examId===exam.id).map(x=>[x.studentId,x]));
       let matched=0;
       for(const p of plan.d.people){
         const students=b.students.filter(x=>norm(x.name)===norm(p.name));
         if(students.length!==1)throw Error('生徒の氏名を一意に照合できません：'+p.name);
         const target=scoreByStudent.get(students[0].id);
         if(!target)throw Error('登録済みの偏差値がありません：'+p.name);
         // Protect against a wrong workbook or an accidentally identical exam date.
         const shared=['ja','ma','en','sc','so','total','two','three'].filter(k=>target[k]!=null&&p.scores[k]!=null);
         if(shared.some(k=>Math.abs(Number(target[k])-Number(p.scores[k]))>0.15))
           throw Error('偏差値が一致しないため更新を中止しました：'+p.name);
         if(!shared.length)throw Error('偏差値の照合ができません：'+p.name);
         const points=p.scores.points||{};
         const values=Object.entries(points).filter(([k,v])=>v!=null);
         if(!values.length)continue;
         target.points={...(target.points||{}),...Object.fromEntries(values)};
         matched++;
       }
       if(!matched)throw Error('得点を補完できる生徒がいません：'+plan.d.file.name);
       count+=matched;added++;
       updatedFiles.add(plan.d.file.name);
     }
     if(!confirm('登録済み模試'+added+'件・'+count+'名分の得点だけを補完します。\n既存の偏差値・模試名・生徒ID・コメントは変更しません。続行しますか？'))return;
     const original=new Map([...staged.keys()].map(id=>[id,localStorage.getItem(storageKey(id))]));
     const oldMeta=localStorage.getItem(WORKSPACES_META_KEY);
     try{
       for(const [id,bundle] of staged)safeWriteWorkspace(id,bundle);
     }catch(e){
       for(const [id,old] of original)try{if(old==null)localStorage.removeItem(storageKey(id));else localStorage.setItem(storageKey(id),old);}catch(_){}
       if(oldMeta!==null)try{localStorage.setItem(WORKSPACES_META_KEY,oldMeta)}catch(_){}
       throw Error('得点の保存に失敗しました。バックアップを確認してください。');
     }
     load();batchDrafts=[];selected.clear();goto('exams');
     toast('登録済み模試'+added+'件・'+count+'名分に得点を補完しました。');
   }catch(e){toast('得点の補完を中止しました：'+e.message,'error');}
 };

})();
