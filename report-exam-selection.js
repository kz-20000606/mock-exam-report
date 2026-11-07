'use strict';
/* Exam selection for report creation. Starts with all registered exams selected. */
let reportExamExcludedIds=new Set();
let reportExamWorkspace=null;
function reportExamIds(){
  if(reportExamWorkspace!==activeWorkspace){
    reportExamWorkspace=activeWorkspace;
    reportExamExcludedIds.clear();
  }
  return new Set(state.exams.filter(e=>!reportExamExcludedIds.has(e.id)).map(e=>e.id));
}
function reportExamFilterMarkup(){
  const list=exams(),included=reportExamIds();
  const options=list.map(e=>'<label class="report-exam-option"><input type="checkbox" class="report-exam-check" data-exam-id="'+escapeHTML(e.id)+'" '+(included.has(e.id)?'checked':'')+'><span>'+escapeHTML(e.name)+' <small>('+escapeHTML(e.date)+')</small></span></label>').join('');
  return '<div class="report-exam-filter"><div class="controls spread"><strong>成績表に掲載する模試（'+included.size+' / '+list.length+'回）</strong><div class="controls"><button type="button" class="btn small" id="renameReportExamSeries">模試名を一括修正</button><button type="button" class="btn small" id="reportExamsAll">すべて選択</button><button type="button" class="btn small" id="reportExamsNone">選択解除</button></div></div><p class="muted tiny">初期状態では全回を選択しています。グラフ・偏差値一覧・ファイル名も連動します。</p><div class="report-exam-options">'+(options||'<span class="muted tiny">登録済みの模試がありません。</span>')+'</div>'+(!included.size?'<p class="error" role="status">模試を1つ以上選択してください。成績表の保存・PDF出力はできません。</p>':'')+'</div>';
}
const reportExamPreviousRender=render;
render=function(){
  const result=reportExamPreviousRender();
  if(route!=='report')return result;
  $$('.report-exam-check').forEach(el=>el.addEventListener('change',()=>{
    if(el.checked)reportExamExcludedIds.delete(el.dataset.examId);
    else reportExamExcludedIds.add(el.dataset.examId);
    render();
  }));
  const rename=$('#renameReportExamSeries');
  if(rename)rename.addEventListener('click',()=>{
    const ids=$('.report-exam-check').filter(el=>el.checked).map(el=>el.dataset.examId);
    if(!ids.length)return toast('名前を変更する模試を選択してください。','error');
    const input=prompt(ids.length+'件の模試に共通する正式名称を入力してください。回数はそれぞれ維持します。','');
    if(input===null)return;
    if(!input.trim())return toast('模試名を入力してください。','error');
    if(!confirm(ids.length+'件の模試名を変更します。偏差値は変更されません。続行しますか？'))return;
    if(typeof window.renameImportedExamSeries==='function')window.renameImportedExamSeries(ids,input);
    else toast('名前変更機能が読み込まれていません。再起動してください。','error');
  });
  const all=$('#reportExamsAll'),none=$('#reportExamsNone');
  if(all)all.addEventListener('click',()=>{reportExamExcludedIds.clear();render()});
  if(none)none.addEventListener('click',()=>{reportExamExcludedIds=new Set(state.exams.map(e=>e.id));render()});
  if(!reportExamIds().size){
    const print=$('#printButton');if(print)print.disabled=true;
    const save=[...$$('#appView button')].find(b=>b.textContent.includes('成績表セットをアプリ内に保存'));
    if(save)save.disabled=true;
  }
  return result;
};
