'use strict';
/* Local workspaces, immutable report snapshots and PWA support. No network calls. */
const WORKSPACES_META_KEY='mock-exam-workspaces-v2';
const ACTIVE_WORKSPACE_KEY='mock-exam-active-workspace-v2';
const WORKSPACE_DATA_PREFIX='mock-exam-workspace-v2:';
const DEFAULT_DATA=()=>({students:[],exams:[],scores:[],comments:{},settings:{commentMode:false}});
const yearOfDate=(str)=>{const d=String(str||'').match(/^(\d{4})-(\d{2})/);return d?Number(d[1])-(Number(d[2])<=3?1:0):new Date().getFullYear()-(new Date().getMonth()<3?1:0)};
const validGrade=(s)=>{const m=String(s||'').normalize('NFKC').match(/中\s*([123])/);return m?'中'+m[1]:'未分類'};
const wk=(y,g)=>`${Number(y)}:${g}`;
const storageKey=(id)=>WORKSPACE_DATA_PREFIX+id;
let activeWorkspace=localStorage.getItem(ACTIVE_WORKSPACE_KEY)||wk(yearOfDate(new Date().toISOString().slice(0,10)),'中2');
let savedReportsView=[];
let archiveCurrentId=null;
let archiveDbPromise=null;

function copyStateIntoCurrent(data){const next=DEFAULT_DATA();Object.assign(next,data||{});for(const k of ['students','exams','scores'])if(!Array.isArray(next[k]))next[k]=[];next.comments=next.comments&&typeof next.comments==='object'?next.comments:{};next.settings=next.settings&&typeof next.settings==='object'?next.settings:{commentMode:false};Object.assign(state,next)}
function workspaceIds(){try{const a=JSON.parse(localStorage.getItem(WORKSPACES_META_KEY)||'[]');return Array.isArray(a)?a:[]}catch(_){return []}}
function registerWorkspace(id){const all=workspaceIds();if(!all.includes(id)){all.push(id);all.sort();localStorage.setItem(WORKSPACES_META_KEY,JSON.stringify(all))}}
function safeWriteWorkspace(id,data){localStorage.setItem(storageKey(id),JSON.stringify(data));registerWorkspace(id)}
function migrateLegacy(){
 if(localStorage.getItem(WORKSPACES_META_KEY))return;
 const raw=localStorage.getItem(KEY);
 if(!raw){registerWorkspace(activeWorkspace);return;}
 let old;try{old=JSON.parse(raw)}catch(_){registerWorkspace(activeWorkspace);return;}
 if(!old||!Array.isArray(old.exams)||!Array.isArray(old.students)||!Array.isArray(old.scores)){registerWorkspace(activeWorkspace);return;}
 const bundles=new Map();const get=(id)=>{if(!bundles.has(id))bundles.set(id,DEFAULT_DATA());return bundles.get(id)};
 for(const exam of old.exams){const id=wk(yearOfDate(exam.date),validGrade(exam.grade));get(id).exams.push({...exam});}
 const examToWorkspace=new Map([...bundles].flatMap(([id,b])=>b.exams.map(e=>[e.id,id])));
 for(const record of old.scores){const id=examToWorkspace.get(record.examId);if(id)get(id).scores.push({...record});}
 for(const [id,b] of bundles){const ids=new Set(b.scores.map(s=>s.studentId));b.students=(old.students||[]).filter(s=>ids.has(s.id)).map(s=>({...s}));b.comments=Object.fromEntries(Object.entries(old.comments||{}).filter(([s])=>ids.has(s)));b.settings={...(old.settings||{})}}
 // Write every workspace before marking the migration complete. The v1 data remains untouched.
 if(!bundles.size)get(activeWorkspace);
 for(const [id,b] of bundles)safeWriteWorkspace(id,b);
 const ids=[...bundles.keys()].sort();activeWorkspace=ids.includes(activeWorkspace)?activeWorkspace:ids[0];
 localStorage.setItem(ACTIVE_WORKSPACE_KEY,activeWorkspace);
 localStorage.setItem(WORKSPACES_META_KEY,JSON.stringify(ids));
}
migrateLegacy();
save=function(){try{safeWriteWorkspace(activeWorkspace,state);return true}catch(e){toast('保存できませんでした。空き容量を確認し、バックアップを取ってください。','error');return false}};
load=function(){const raw=localStorage.getItem(storageKey(activeWorkspace));if(!raw){copyStateIntoCurrent(DEFAULT_DATA());return;}try{copyStateIntoCurrent(JSON.parse(raw))}catch(_){toast('保存データを読み込めません。バックアップから復元してください。','error')}};
load();selected.clear();

function switchWorkspace(id){
 if(batchDrafts.length){toast('Excelの読み込みを完了または中止してから学年を切り替えてください。','error');return;}
 if(!/^\d{4}:(中[123]|未分類)$/.test(id))return;
 if(id===activeWorkspace)return;
 if(!save())return;
 activeWorkspace=id;localStorage.setItem(ACTIVE_WORKSPACE_KEY,id);registerWorkspace(id);load();
 selected.clear();currentStudent=null;reportIndex=0;searchText='';gradeFilter='all';archiveCurrentId=null;savedReportsView=[];
 // Keep the current workflow open when switching grades; a student detail needs a new selection.
 if(route==='detail')route='students';
 render();
}
function workspaceControls(){const [year,grade]=activeWorkspace.split(':');const years=new Set([Number(year),yearOfDate(new Date().toISOString().slice(0,10)),...workspaceIds().map(s=>Number(s.split(':')[0]))]);for(let y=Number(year)-1;y<=Number(year)+1;y++)years.add(y);return `<div class="workspace-controls"><label for="workspaceYear">年度</label><select id="workspaceYear" class="field">${[...years].sort((a,b)=>b-a).map(y=>`<option value="${y}" ${String(y)===year?'selected':''}>${y}年度</option>`).join('')}</select><label for="workspaceGrade">学年</label><select id="workspaceGrade" class="field">${['中1','中2','中3','未分類'].map(g=>`<option value="${g}" ${g===grade?'selected':''}>${g}</option>`).join('')}</select></div>`}
function refreshWorkspaceControls(){
 const old=$('#workspaceControlHost');if(old)old.remove();
 $('#currentYear').textContent='';
 // Student list owns the two selectors next to its search field.
 if(route==='students')return;
 const view=$('#appView');if(!view)return;
 const wrap=document.createElement('div');wrap.id='workspaceControlHost';wrap.className='workspace-context-bar';wrap.innerHTML=workspaceControls();
 view.prepend(wrap);
 for(const id of ['workspaceYear','workspaceGrade'])$('#'+id).addEventListener('change',()=>switchWorkspace(wk($('#workspaceYear').value,$('#workspaceGrade').value)));
}
function formatNow(){const d=new Date();return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`}
// Build default names from the exams actually represented in the selected reports.
function reportExamNameParts(students){
 const activeIds=reportExamIds();
 // The printed table contains every selected exam (even if one student was absent).
 const relevant=exams().filter(e=>activeIds.has(e.id));
 const groups=new Map();
 for(const exam of relevant){
   const label=String(exam.name||'模試').normalize('NFKC').trim();
   const roundInName=label.match(/第\s*(\d+)\s*回/);
   const round=Number.isInteger(Number(exam.round))&&Number(exam.round)>0?Number(exam.round):(roundInName?Number(roundInName[1]):null);
   // Importer includes the round in exam.name; remove it to avoid duplicate "第n回".
   const base=label.replace(/第\s*\d+\s*回/g,'').replace(/[\s　()（）・_\-]+$/g,'').trim()||'模試';
   if(!groups.has(base))groups.set(base,{rounds:new Set(),other:0});
   if(round!==null)groups.get(base).rounds.add(round);
   else groups.get(base).other++;
 }
 const roundText=nums=>{
   const sorted=[...nums].sort((a,b)=>a-b);
   if(!sorted.length)return '';
   if(sorted.length===1)return '第'+sorted[0]+'回';
   const consecutive=sorted.every((n,i)=>i===0||n===sorted[i-1]+1);
   return consecutive?'第'+sorted[0]+'回〜第'+sorted.at(-1)+'回':sorted.map(n=>'第'+n+'回').join('・');
 };
 const parts=[...groups].map(([name,value])=>name+(value.rounds.size?'_'+roundText(value.rounds):''));
 return parts.length?parts.join('_'):'模試未登録';
}
function reportDefaultBaseName(students){
 const [year,grade]=activeWorkspace.split(':');
 return [year+'年度',grade,reportExamNameParts(students)].join('_');
}
function safeReportFilename(s){return String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,170)}
function filenameFor(students){return safeReportFilename(reportDefaultBaseName(students))}

function openReportDB(){if(archiveDbPromise)return archiveDbPromise;archiveDbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('mock-exam-report-archive',1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('reports')){const store=db.createObjectStore('reports',{keyPath:'id'});store.createIndex('workspace','workspace',{unique:false});store.createIndex('createdAt','createdAt',{unique:false});}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});return archiveDbPromise;}
async function archiveAll(){const db=await openReportDB();return new Promise((resolve,reject)=>{const tx=db.transaction('reports','readonly');const req=tx.objectStore('reports').getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)})}
async function archivePutMany(items){if(!items.length)return;const db=await openReportDB();return new Promise((resolve,reject)=>{const tx=db.transaction('reports','readwrite');for(const r of items)tx.objectStore('reports').put(r);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
async function archiveClear(){const db=await openReportDB();return new Promise((resolve,reject)=>{const tx=db.transaction('reports','readwrite');tx.objectStore('reports').clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
async function archiveRemove(id){const db=await openReportDB();return new Promise((resolve,reject)=>{const tx=db.transaction('reports','readwrite');tx.objectStore('reports').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
function reportSelection(){const ids=selected.size?[...selected]:state.students.map(s=>s.id);return ids.map(id=>state.students.find(s=>s.id===id)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,'ja'))}
function snapshotReports(students){const now=new Date().toISOString();const [year,grade]=activeWorkspace.split(':');return students.map(s=>({id:makeId(),workspace:activeWorkspace,studentId:s.id,name:s.name,year:Number(year),grade,createdAt:now,title:filenameFor([s]),html:paperMarkup(s)}))}
async function saveSelectedReports(){const people=reportSelection();if(!people.length){toast('保存する生徒がいません。','error');return}try{await archivePutMany(snapshotReports(people));toast(`${people.length}名分の成績表を保存しました。`)}catch(e){toast('成績表の保存に失敗しました：'+e.message,'error')}}
function archiveMenu(){const menu=$('.sidebar nav');if(!menu||menu.querySelector('[data-route="archive"]'))return;const btn=document.createElement('button');btn.dataset.route='archive';btn.textContent='保存済み成績表';menu.insertBefore(btn,menu.querySelector('[data-route="settings"]'));btn.addEventListener('click',()=>{if(batchDrafts.length&& !confirm('Excelの取り込みを中断しますか？'))return;batchDrafts=[];goto('archive')})}
function archiveMarkup(){return `<div class="controls spread" style="margin-bottom:18px"><strong>保存済み成績表（${savedReportsView.length}件）</strong><span class="muted tiny">${escapeHTML(activeWorkspace.replace(':','年度・'))}　作成時点の内容を保存</span></div><div class="section"><div class="section-body"><div class="controls" style="margin-bottom:14px"><input id="archiveSearch" class="field search" placeholder="生徒名で検索" aria-label="生徒名で検索"></div><div id="archiveTable">${archiveTableMarkup(savedReportsView)}</div></div></div><p class="footer-note">新しい模試を追加しても保存済みの成績表は変わりません。ブラウザの保存データを削除すると失われるため、バックアップを取ってください。</p>`}
function archiveTableMarkup(items){return `<div class="table-wrap"><table class="data-table"><thead><tr><th>生徒氏名</th><th>作成日時</th><th>年度・学年</th><th>操作</th></tr></thead><tbody>${items.map(r=>`<tr><td>${escapeHTML(r.name)}</td><td>${escapeHTML(new Date(r.createdAt).toLocaleString('ja-JP'))}</td><td>${escapeHTML(r.year+'年度 '+r.grade)}</td><td><div class="controls"><button class="btn small" data-view-snapshot="${r.id}">閲覧</button><button class="btn small" data-print-snapshot="${r.id}">印刷</button><button class="btn small danger" data-delete-snapshot="${r.id}">削除</button></div></td></tr>`).join('')||'<tr><td colspan="4">この年度・学年の保存済み成績表はありません。</td></tr>'}</tbody></table></div>`}
async function refreshArchive(){try{savedReportsView=(await archiveAll()).filter(r=>r.workspace===activeWorkspace).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));if(route==='archive'){renderArchiveView();}}catch(e){toast('保存済み成績表を読み取れませんでした：'+e.message,'error')}}
function renderArchiveView(){header('保存済み成績表','作成済みの個人成績表を再表示・再印刷');$('#appView').innerHTML=archiveCurrentId?archivePreview():archiveMarkup();refreshWorkspaceControls();attachArchiveHandlers()}
function archivePreview(){const r=savedReportsView.find(x=>x.id===archiveCurrentId);if(!r){archiveCurrentId=null;return archiveMarkup()}return `<div class="controls spread" style="margin-bottom:12px"><button class="btn" id="archiveBack">← 一覧へ戻る</button><div class="controls"><strong>${escapeHTML(r.name)}　${escapeHTML(new Date(r.createdAt).toLocaleString('ja-JP'))}</strong><button class="btn primary" data-print-snapshot="${r.id}">この成績表を印刷</button></div></div><div class="paper-host"><div class="saved-paper-host">${r.html}</div></div>`}
function attachArchiveHandlers(){const search=$('#archiveSearch');if(search)search.addEventListener('input',e=>{$('#archiveTable').innerHTML=archiveTableMarkup(savedReportsView.filter(r=>norm(r.name).includes(norm(e.target.value))));attachArchiveRowHandlers()});const back=$('#archiveBack');if(back)back.onclick=()=>{archiveCurrentId=null;renderArchiveView()};attachArchiveRowHandlers()}
function attachArchiveRowHandlers(){$$('[data-view-snapshot]').forEach(el=>el.onclick=()=>{archiveCurrentId=el.dataset.viewSnapshot;renderArchiveView()});$$('[data-print-snapshot]').forEach(el=>el.onclick=()=>{const r=savedReportsView.find(x=>x.id===el.dataset.printSnapshot);if(r)printSavedReport(r)});$$('[data-delete-snapshot]').forEach(el=>el.onclick=async()=>{const r=savedReportsView.find(x=>x.id===el.dataset.deleteSnapshot);if(!r||!confirm(`${r.name} の保存済み成績表を削除しますか？`))return;await archiveRemove(r.id);archiveCurrentId=null;await refreshArchive()})}
function printSavedReport(r){printPaperHTML([r.html],r.title)}
function printPaperHTML(papers,filename){const old=document.title;document.title=filename;$('#printRoot').innerHTML=papers.join('');window.__priorReportTitle=old;requestAnimationFrame(()=>setTimeout(()=>window.print(),150))}
const nativeRender=render;
render=function(){if(route==='archive'){renderArchiveView();refreshArchive();return}nativeRender();archiveMenu();refreshWorkspaceControls();if(route==='report'&&reportSelection().length){const btn=$('#printButton');if(btn){const saveBtn=document.createElement('button');saveBtn.className='btn';saveBtn.style.cssText='width:100%;margin-top:10px';saveBtn.textContent='個別成績表をアプリ内に保存';saveBtn.addEventListener('click',saveSelectedReports);btn.insertAdjacentElement('afterend',saveBtn)}}if(route==='settings'){const dataBtn=document.createElement('p');dataBtn.className='footer-note';dataBtn.textContent='バックアップはすべての年度・学年と保存済み成績表を含みます。';$('#appView').prepend(dataBtn);const danger=$('#appView .btn.danger');if(danger)danger.textContent='現在の年度・学年の成績を削除'}};
const originalPrintReports=printReports;
printReports=function(){const list=reportSelection();if(!list.length)return toast('印刷する生徒がいません。','error');const proposed=filenameFor(list);if(!confirm(`${list.length}名分を印刷・PDF保存します。\n保存済み成績表にも個別に記録します。`))return;archivePutMany(snapshotReports(list)).catch(e=>toast('成績表の履歴保存に失敗しました：'+e.message,'error'));printPaperHTML(list.map(paperMarkup),proposed)};
window.addEventListener('afterprint',()=>{if(window.__priorReportTitle!==undefined){document.title=window.__priorReportTitle;delete window.__priorReportTitle}});
backup=async function(){try{save();const data={type:'mock-exam-report-backup',version:2,date:new Date().toISOString(),activeWorkspace,workspaces:Object.fromEntries(workspaceIds().map(id=>[id,JSON.parse(localStorage.getItem(storageKey(id))||'null')]).filter(([,v])=>v)),reports:await archiveAll()};download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`成績管理バックアップ_全学年_${formatNow()}.json`)}catch(e){toast('バックアップの作成に失敗しました：'+e.message,'error')}};
async function restoreAllWorkspaces(file){const data=JSON.parse(await file.text());if(data.type!=='mock-exam-report-backup')throw Error('成績管理のバックアップではありません');if(data.version===1){if(!Array.isArray(data.data?.exams))throw Error('旧形式のデータが不正です');const b=data.data;const id=activeWorkspace;if(!confirm('旧形式のバックアップを現在の年度・学年に復元しますか？（現在のデータは置き換え）'))return;safeWriteWorkspace(id,b);load();selected.clear();goto('home');return}
 if(data.version!==2||!data.workspaces||typeof data.workspaces!=='object'||!Array.isArray(data.reports))throw Error('バックアップ形式が不正です');for(const [id,v] of Object.entries(data.workspaces)){if(!/^\d{4}:(中[123]|未分類)$/.test(id)||!Array.isArray(v?.students)||!Array.isArray(v?.exams)||!Array.isArray(v?.scores))throw Error('年度・学年別のデータが不正です')}
 if(!confirm('バックアップ内の年度・学年データで現在の保存内容を置き換えます。続行しますか？'))return;
 // Put archived snapshots first, then replace all workspace records. Existing legacy v1 is not modified.
 await archiveClear();await archivePutMany(data.reports.filter(r=>r&&r.id&&(typeof r.html==='string'||(r.kind==='report-folder-title'&&typeof r.folderId==='string'&&typeof r.title==='string')||(r.kind==='report-folder'&&Array.isArray(r.papers)&&r.papers.every(p=>p&&p.id&&typeof p.html==='string')))));
 for(const [id,v] of Object.entries(data.workspaces))safeWriteWorkspace(id,v);
 activeWorkspace=data.activeWorkspace in data.workspaces?data.activeWorkspace:Object.keys(data.workspaces)[0]||activeWorkspace;
 localStorage.setItem(ACTIVE_WORKSPACE_KEY,activeWorkspace);load();selected.clear();archiveCurrentId=null;goto('home');toast('バックアップを復元しました。')
}
// Replace the old backup file-change listener by swapping the DOM input node.
const oldBackup=$('#backupInput');if(oldBackup){const fresh=oldBackup.cloneNode(true);oldBackup.replaceWith(fresh);fresh.addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{await restoreAllWorkspaces(file)}catch(err){toast('復元に失敗しました：'+err.message,'error')}})}
const oldClear=clearAll;
clearAll=function(){if(!confirm(`${activeWorkspace.replace(':','年度・')} の成績データだけを削除します。保存済みの成績表は残ります。続行しますか？`))return;if(prompt('削除する場合は「削除」と入力してください。')!=='削除')return;copyStateIntoCurrent(DEFAULT_DATA());selected.clear();save();goto('home');toast('現在の年度・学年の成績を削除しました。')};
// Route each imported Excel file to the grade/year detected from its own metadata.
// The current workspace is only a view filter; it is not an import restriction.
const originalBatchPreview = renderBatchImport;
renderBatchImport = function(){
  originalBatchPreview();
  const table = $('#appView .data-table');
  if (!table) return;
  const heading = table.querySelector('thead tr');
  if (heading) {
    const cell = document.createElement('th');
    cell.textContent = '自動登録先';
    heading.insertBefore(cell, heading.children[3] || null);
  }
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach((row,i)=>{
    const d=batchDrafts[i];
    if (!d) return;
    const cell=document.createElement('td');
    const grade=validGrade(d.meta?.grade);
    const year=d.meta?.date?yearOfDate(d.meta.date):null;
    cell.textContent=d.error?'—':year?`${year}年度・${grade}`:'要確認';
    if(grade==='未分類' || !year) cell.style.color='#a34e2e';
    row.insertBefore(cell,row.children[3]||null);
  });
  const intro = document.createElement('p');
  intro.className = 'notice';
  intro.textContent='Excelごとに年度・学年を判別し、別々の管理先へ一括登録します。画面上部の学年切り替えは不要です。認識が誤っている場合は「詳細」で修正してください。';
  const step=$('#appView .stepbar');
  if(step)step.insertAdjacentElement('afterend',intro);
};

commitBatchImport=function(){
  const chosen=batchDrafts.filter(d=>d.selected);
  if(!chosen.length)return toast('登録するファイルを選択してください。','error');
  const staged=new Map();
  let scoreCount=0,newCount=0;
  const destinations=new Map();
  const getStage=(id)=>{
    if(!staged.has(id)){
      const raw=localStorage.getItem(storageKey(id));
      let data;
      try{data=raw?JSON.parse(raw):DEFAULT_DATA()}catch(_){throw Error(`保存中の${id}のデータを読み込めません。バックアップを確認してください。`)}
      if(!Array.isArray(data.students)||!Array.isArray(data.exams)||!Array.isArray(data.scores))throw Error(`${id}の保存データが不正です。`);
      staged.set(id,{...data,students:data.students.map(s=>({...s})),exams:data.exams.map(e=>({...e})),scores:data.scores.map(s=>({...s}))});
    }
    return staged.get(id);
  };
  try {
    // Validate all files and their target workspaces before changing saved data.
    for(const d of chosen){
      const problem=validateBatchDraft(d);
      if(problem)throw Error(`${d.file.name}：${problem}`);
      const grade=validGrade(d.meta.grade);
      if(grade==='未分類')throw Error(`${d.file.name}：学年を判別できません。詳細画面で中1・中2・中3を指定してください。`);
      const id=wk(yearOfDate(d.meta.date),grade),bundle=getStage(id),m=d.meta;
      if(bundle.exams.some(e=>e.name===m.name && e.date===m.date && validGrade(e.grade)===grade)){
        throw Error(`${d.file.name}：${id.replace(':','年度・')}に同じ模試が登録されています。`);
      }
      const exam={id:makeId(),name:m.name,date:m.date,grade,round:m.round};
      bundle.exams.push(exam);
      for(const p of d.people){
        const matches=bundle.students.filter(s=>norm(s.name)===norm(p.name));
        if(matches.length>1)throw Error(`${d.file.name}：同姓同名の生徒を一意に照合できません（${p.name}）。`);
        let student=matches[0];
        if(!student){student={id:makeId(),name:p.name,grade};bundle.students.push(student);newCount++}
        bundle.scores.push({studentId:student.id,examId:exam.id,...p.scores});
        scoreCount++;
      }
      destinations.set(id,(destinations.get(id)||0)+1);
    }
    const targets=[...destinations].map(([id,n])=>`${id.replace(':','年度・')}：${n}ファイル`).join('\n');
    if(!confirm(`${chosen.length}ファイルを自動で年度・学年別に登録します。\n\n${targets}\n\n成績${scoreCount}件、新規生徒${newCount}名。\nこの内容で登録しますか？`))return;
    // localStorage has no multi-key transaction: retain old snapshots and roll back on errors.
    const oldMeta=localStorage.getItem(WORKSPACES_META_KEY);
    const oldValues=new Map([...staged.keys()].map(id=>[id,localStorage.getItem(storageKey(id))]));
    try{
      for(const [id,data] of staged)safeWriteWorkspace(id,data);
    }catch(e){
      for(const [id,value] of oldValues){try{if(value===null)localStorage.removeItem(storageKey(id));else localStorage.setItem(storageKey(id),value)}catch(_){}}
      try{if(oldMeta===null)localStorage.removeItem(WORKSPACES_META_KEY);else localStorage.setItem(WORKSPACES_META_KEY,oldMeta)}catch(_){}
      throw Error('保存に失敗したため登録を取り消しました。空き容量を確認してください。');
    }
    load();selected.clear();batchDrafts=[];goto('exams');
    toast(`${chosen.length}ファイル・${scoreCount}件を年度・学年別に登録しました。表示する学年は画面上部から切り替えられます。`);
  }catch(e){toast(e.message,'error')}
};
archiveMenu();render();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});