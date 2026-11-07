'use strict';
/* Edit labels of already imported mock exams; scores and exam IDs remain unchanged. */
(() => {
  function getRound(exam) {
    const explicit=Number(exam.round);
    if (Number.isInteger(explicit)&&explicit>0) return explicit;
    const m=String(exam.name||'').normalize('NFKC').match(/第\s*(\d+)\s*回/);
    return m?Number(m[1]):null;
  }
  function newName(base,exam) {
    const r=getRound(exam);
    return base+(r===null?'':' 第'+r+'回');
  }
  function renameExams(ids,base) {
    const name=String(base||'').trim().replace(/第\s*\d+\s*回\s*$/,'').trim();
    if (!name||name.length>80) return toast('模試名は1～80文字で入力してください。','error');
    const target=state.exams.filter(e=>ids.includes(e.id));
    if (!target.length)return;
    const updates=target.map(e=>({exam:e,name:newName(name,e)}));
    const signatures=updates.map(x=>x.exam.date+'|'+x.name);
    if(new Set(signatures).size!==signatures.length)return toast('同じ日付・回数の模試が重複します。選択範囲を確認してください。','error');
    for(const item of updates){
      if(state.exams.some(e=>!ids.includes(e.id)&&e.date===item.exam.date&&e.name===item.name))
        return toast('同じ日付・模試名の登録が既にあります。','error');
    }
    const oldNames=new Map(target.map(e=>[e.id,e.name]));
    for(const item of updates)item.exam.name=item.name;
    if(!save()){for(const e of target)e.name=oldNames.get(e.id);return}
    toast(target.length+'件の模試名を変更しました。');
    render();
  }
  function renameOne(id){
    const exam=state.exams.find(e=>e.id===id);if(!exam)return;
    const suggested=String(exam.name).replace(/第\s*\d+\s*回\s*$/,'').trim();
    const input=prompt('模試名を入力してください。回数は自動で付けます。',suggested);
    if(input!==null)renameExams([id],input);
  }
  function renameChecked(){
    const ids=[...document.querySelectorAll('.exam-rename-check:checked')].map(x=>x.dataset.examRenameCheck);
    if(!ids.length)return toast('変更したい模試にチェックを入れてください。','error');
    const name=prompt(ids.length+'件の模試に共通の名称を付けます。各回数は引き継ぎます。\n例：進研Sテスト','');
    if(name===null)return;
    if(!confirm(ids.length+'件の名前を変更します。偏差値データには影響しません。続行しますか？'))return;
    renameExams(ids,name);
  }
  window.renameImportedExamSeries = renameExams;
  const previousRender=render;
  render=function(){
    const out=previousRender();
    if(route==='report'){
      const panel=document.querySelector('#appView .report-exam-filter');
      if(panel&&!panel.querySelector('#renameReportExamSeries')){
        const button=document.createElement('button');
        button.id='renameReportExamSeries';button.type='button';button.className='btn small';
        button.textContent='選択した模試名をまとめて修正';
        button.style.marginTop='10px';
        button.addEventListener('click',()=>{
          const ids=[...document.querySelectorAll('#appView .report-exam-check:checked')].map(e=>e.dataset.examId);
          if(!ids.length)return toast('名前を修正する模試を選択してください。','error');
          const input=prompt(ids.length+'回分の模試に共通の正式名称を入力してください。第〇回の部分は各データから引き継ぎます。','');
          if(input===null)return;
          if(!confirm('選択した'+ids.length+'件の模試名を変更します。元の偏差値データは変更しません。続行しますか？'))return;
          renameExams(ids,input);
        });
        panel.append(button);
      }
      return out;
    }
    if(route!=='exams'||batchDrafts.length)return out;
    const table=document.querySelector('#appView .data-table');
    if(!table||table.dataset.renameReady==='1')return out;
    table.dataset.renameReady='1';
    const header=table.querySelector('thead tr');
    if(header){
      const cell=document.createElement('th');
      cell.textContent='選択';
      header.prepend(cell);
    }
    const rows=table.querySelectorAll('tbody tr');
    const listed=[...exams()].reverse();
    rows.forEach((tr,i)=>{
      const exam=listed[i];if(!exam)return;
      const cell=document.createElement('td');
      const check=document.createElement('input');
      check.type='checkbox';check.className='exam-rename-check';check.dataset.examRenameCheck=exam.id;
      check.setAttribute('aria-label',exam.name+'を名前変更対象にする');
      cell.append(check);tr.prepend(cell);
      const action=tr.querySelector('[data-deleteexam]')?.parentElement;
      if(action){
        const edit=document.createElement('button');edit.type='button';edit.className='btn small';
        edit.textContent='名前を変更';edit.dataset.renameExam=exam.id;
        action.insertBefore(edit,action.firstChild);
      }
      const title=tr.children[1];if(title){title.style.whiteSpace='normal';title.style.overflowWrap='anywhere';}
    });
    const area=table.closest('.section-body');
    if(area){
      const tools=document.createElement('div');tools.className='controls exam-name-actions';
      const button=document.createElement('button');button.type='button';button.className='btn small';
      button.id='renameExamsTogether';button.textContent='チェックした模試名をまとめて変更';
      tools.append(button);
      area.insertBefore(tools,table.parentElement);
      button.addEventListener('click',renameChecked);
    }
    table.querySelectorAll('[data-rename-exam]').forEach(btn=>btn.addEventListener('click',()=>renameOne(btn.dataset.renameExam)));
    return out;
  };
  render();
})();