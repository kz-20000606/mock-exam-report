'use strict';
/* Explicit report-set saves with visible, verified status and idempotent retries.
   UI-only state is in memory; report sets remain in the existing IndexedDB. */
let reportSaveBusy=false;
let reportSaveState={status:'ready',folder:null,key:'',message:''};
let reportPendingFolder=null;
function reportSaveKey(){
  const people=reportSelection();
  const ids=reportExamIds();
  const scores=state.scores.filter(s=>people.some(p=>p.id===s.studentId)&&ids.has(s.examId));
  return JSON.stringify({
    workspace:activeWorkspace,
    students:people.map(p=>[p.id,p.name,p.grade]).sort((a,b)=>a[0].localeCompare(b[0])),
    exams:[...ids].sort(),
    scores:scores.sort((a,b)=>(a.studentId+a.examId).localeCompare(b.studentId+b.examId)),
    comments:state.settings.commentMode?people.map(p=>[p.id,state.comments[p.id]||'']):[],
    includeComments:!!state.settings.commentMode
  });
}
function reportFolderContent(folder){
  return JSON.stringify({
    workspace:folder.workspace,
    papers:folder.papers.map(p=>[p.studentId,p.name,p.html])
      .sort((a,b)=>a[0].localeCompare(b[0]))
  });
}
function reportContentFingerprint(value){
  let a=2166136261,b=0x811c9dc5;
  for(let i=0;i<value.length;i++){
    const n=value.charCodeAt(i);
    a=Math.imul(a^n,16777619);
    b=Math.imul(b^(n+i%251),2246822519);
  }
  return [value.length,(a>>>0).toString(16),(b>>>0).toString(16)].join(':');
}
function matchingReportFolder(records,folder){
  const source=reportFolderContent(folder);
  const fingerprint=reportContentFingerprint(source);
  return records.find(record=>{
    if(record.kind!=='report-folder'||!Array.isArray(record.papers)||record.workspace!==folder.workspace)return false;
    const other=reportFolderContent(record);
    return (record.contentFingerprint===fingerprint||reportContentFingerprint(other)===fingerprint)
      &&other===source;
  });
}
function setReportSaveState(status,folder,key,message){
  reportSaveState={status,folder:folder||null,key:key||'',message:message||''};
  updateReportSaveUi();
}
function reportSaveStatusMarkup(){
  const x=reportSaveState;
  if(x.status==='saving')return '<div class="report-save-message" role="status" aria-live="polite">成績表セットを保存中です。重複操作を防止しています。</div>';
  if(x.status==='success'&&x.folder){
    return '<div class="report-save-message report-save-success" role="status" aria-live="polite"><strong>✓ 成績表セットを保存しました。</strong><div class="report-save-name">'+escapeHTML(x.folder.title)+'</div><div>'+x.folder.papers.length+'名分 ／ '+escapeHTML(folderDate(x.folder.createdAt))+'</div><div class="controls report-save-actions"><button type="button" class="btn small" id="openJustSavedFolder">保存したセットを開く</button><button type="button" class="btn small" id="resaveReportFolder">同じ内容を別セットとして保存</button></div></div>';
  }
  if(x.status==='error')return '<div class="report-save-message report-save-error" role="alert"><strong>成績表セットを保存・確認できませんでした。</strong><div>'+escapeHTML(x.message)+'</div><button type="button" class="btn small" id="retryReportSave">保存を再試行</button></div>';
  return '';
}
function openJustSavedReportFolder(){
  const folder=reportSaveState.folder;if(!folder)return;
  goto('archive');
  if(activeWorkspace!==folder.workspace)switchWorkspace(folder.workspace);
  openReportFolderId=folder.id;
  openedReportStudentId=null;
  reportFolderChecked.clear();
  refreshArchive();
}
function updateReportSaveUi(){
  if(route!=='report')return;
  const save=[...$$('#appView button')].find(b=>b.textContent.includes('成績表セットをアプリ内に保存')||b.id==='reportSaveAction');
  if(!save)return;
  const key=reportSaveKey();
  if(reportSaveState.status!=='saving'&&reportSaveState.key&&reportSaveState.key!==key){
    reportSaveState={status:'ready',folder:null,key:'',message:''};
    reportPendingFolder=null;
  }
  save.id='reportSaveAction';
  const status=reportSaveState.status;
  save.disabled=reportSaveBusy||status==='success'||!reportSelection().length||!reportExamIds().size;
  save.textContent=status==='saving'?'保存中…':status==='success'?'✓ 保存完了':status==='error'?'成績表セットをアプリ内に保存':'成績表セットをアプリ内に保存';
  let panel=$('#reportSaveStatus');
  if(!panel){panel=document.createElement('div');panel.id='reportSaveStatus';save.insertAdjacentElement('afterend',panel);}
  panel.innerHTML=reportSaveStatusMarkup();
  const open=$('#openJustSavedFolder');if(open)open.onclick=openJustSavedReportFolder;
  const retry=$('#retryReportSave');if(retry)retry.onclick=()=>saveSelectedReports(false,true);
  const again=$('#resaveReportFolder');if(again)again.onclick=()=>saveSelectedReports(true,false);
}
saveSelectedReports=async function(forceNew=false,retry=false){
  if(reportSaveBusy)return;
  if(!reportExamIds().size)return toast('掲載する模試を1つ以上選択してください。','error');
  const people=reportSelection();
  if(!people.length)return toast('保存する生徒を選択してください。','error');
  const key=reportSaveKey();
  if(!forceNew&&reportSaveState.status==='success'&&reportSaveState.key===key)return;
  reportSaveBusy=true;
  let folder;
  try{
    // Capture immutable HTML and selected exams before yielding to the browser.
    folder=retry&&reportPendingFolder&&reportSaveState.key===key?reportPendingFolder:createReportFolder(people);
    folder.contentFingerprint=reportContentFingerprint(reportFolderContent(folder));
    setReportSaveState('saving',folder,key,'');
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const saved=await archiveAll();
    const existing=saved.find(item=>item.id===folder.id);
    if(existing){
      if(reportFolderContent(existing)!==reportFolderContent(folder))throw Error('保存IDが既存の別データと重複しています。');
      folder=existing;
    }else{
      const match=matchingReportFolder(saved,folder);
      if(match&&!forceNew&&!retry){
        if(!confirm('同じ内容の成績表セットがすでに保存されています。新しいセットとしてもう一度保存しますか？')){
          reportSaveBusy=false;
          reportPendingFolder=null;
          setReportSaveState('ready',null,'','');
          return;
        }
      }
      await archivePutMany([folder]);
    }
    const verified=(await archiveAll()).find(item=>item.id===folder.id);
    if(!verified||!isReportFolder(verified)||reportFolderContent(verified)!==reportFolderContent(folder))
      throw Error('保存したデータを正常に読み取れませんでした。');
    reportPendingFolder=null;
    reportSaveBusy=false;
    setReportSaveState('success',verified,key,'');
  }catch(error){
    reportPendingFolder=folder||reportPendingFolder;
    reportSaveBusy=false;
    setReportSaveState('error',null,key,error?.message||'保存処理に失敗しました。');
    toast('成績表セットの保存に失敗しました。詳細を保存ボタン付近に表示しています。','error');
  }
};
const reportSavePreviousRender=render;
render=function(){
  const result=reportSavePreviousRender();
  updateReportSaveUi();
  return result;
};
render();
