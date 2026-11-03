'use strict';
/* In-memory UI history only: never undo exams, comments, or saved reports. */
(() => {
  const stack=[], limit=20;
  let restoring=false;
  const snapshot=()=>({
    route, workspace:activeWorkspace, studentId:currentStudent,
    selectedIds:[...selected], reportIndex, searchText, gradeFilter, sortBy,
    folderId:typeof openReportFolderId!=='undefined'?openReportFolderId:null,
    paperId:typeof openedReportStudentId!=='undefined'?openedReportStudentId:null,
    checked:typeof reportFolderChecked!=='undefined'?[...reportFolderChecked]:[],
    folderQuery:typeof folderSearch!=='undefined'?folderSearch:''
  });
  function button(){
    let b=document.getElementById('appBackButton');
    const title=document.getElementById('viewTitle');
    if(!title)return null;
    if(!b){
      const row=document.createElement('div');row.className='view-heading-row';
      title.parentNode.insertBefore(row,title);
      b=document.createElement('button');b.type='button';b.id='appBackButton';
      b.className='btn app-back-button';
      b.textContent='← 戻る';b.addEventListener('click',goBack);
      row.append(b,title);
    }
    return b;
  }
  function update(){
    const b=button();if(!b)return;
    b.hidden=!stack.length;
    if(stack.length)b.title='前の画面に戻る';
  }
  function push(entry){
    if(restoring)return;
    stack.push(entry);
    if(stack.length>limit)stack.shift();
    update();
  }
  const baseGoto=goto;
  goto=function(next){
    const before=snapshot();
    const result=baseGoto(next);
    if(!restoring&&before.route!==next&&route===next)push(before);
    update();return result;
  };
  const baseSwitch=switchWorkspace;
  switchWorkspace=function(id){
    const before=snapshot();
    const result=baseSwitch(id);
    if(!restoring&&activeWorkspace!==before.workspace)push(before);
    update();return result;
  };
  const baseRender=render;
  render=function(){const result=baseRender();update();return result};
  async function restore(entry){
    restoring=true;
    try{
      route=entry.route;
      if(activeWorkspace!==entry.workspace)switchWorkspace(entry.workspace);
      route=entry.route;
      selected=new Set(entry.selectedIds.filter(id=>state.students.some(s=>s.id===id)));
      currentStudent=entry.studentId;
      reportIndex=entry.reportIndex;searchText=entry.searchText;
      gradeFilter=entry.gradeFilter;sortBy=entry.sortBy;
      if(typeof resetFolderView==='function')resetFolderView();
      if(typeof openReportFolderId!=='undefined')openReportFolderId=entry.folderId;
      if(typeof openedReportStudentId!=='undefined')openedReportStudentId=entry.paperId;
      if(typeof reportFolderChecked!=='undefined')reportFolderChecked=new Set(entry.checked);
      if(typeof folderSearch!=='undefined')folderSearch=entry.folderQuery;
      if(route==='detail'&&!state.students.some(s=>s.id===currentStudent))route='students';
      render();
      if(route==='archive'&&typeof refreshArchive==='function')await refreshArchive();
      window.scrollTo(0,0);
    }finally{restoring=false;update()}
  }
  async function goBack(){
    if(!stack.length||restoring)return;
    if(typeof batchDrafts!=='undefined'&&batchDrafts.length){
      if(!confirm('Excelの取り込みを中断して戻りますか？ 未登録の変更は破棄されます。'))return;
      batchDrafts=[];
    }
    try{
      await restore(stack[stack.length-1]);
      stack.pop();update();
    }catch(error){console.error(error);toast('前の画面に戻れませんでした。','error')}
  }
  // Folder transitions do not use goto(), so track them separately.
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-open-folder],[data-view-folder-person],#backToFolders,#backToFolder');
    if(!target||route!=='archive'||!document.getElementById('appView')?.contains(target)||restoring)return;
    if(target.id==='backToFolders'||target.id==='backToFolder'){
      if(stack.length){event.preventDefault();event.stopImmediatePropagation();goBack()}
      return;
    }
    push(snapshot());
    queueMicrotask(update);
  },true);
  update();
})();