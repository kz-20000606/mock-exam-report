'use strict';
/* Batch report folders. Stored locally in the existing IndexedDB 'reports' store.
 * Previously saved per-student snapshots are displayed as virtual folders;
 * no destructive migration, network access, or loss of older backups.
 */
let openReportFolderId = null;
let openedReportStudentId = null;
let reportFolderChecked = new Set();
let folderSearch = '';

const isReportFolder = item => item?.kind === 'report-folder' && Array.isArray(item.papers);
function folderDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso || '') : d.toLocaleString('ja-JP');
}
function defaultFolderTitle(year, grade, createdAt) {
  return `模試成績表_${year}年度_${grade}_${folderDate(createdAt).replace(/[\\/:*?"<>|]/g, '-')}`;
}
function createReportFolder(people) {
  const now = new Date().toISOString();
  const [year, grade] = activeWorkspace.split(':');
  const id = makeId();
  const papers = people.map(person => ({
    id: makeId(), studentId: person.id, name: person.name, html: paperMarkup(person)
  }));
  return {
    id, kind: 'report-folder', workspace: activeWorkspace,
    createdAt: now, year: Number(year), grade,
    title: defaultFolderTitle(year, grade, now), papers
  };
}
function groupedArchivedRecords(records) {
  const folders = [];
  const groupedOld = new Map();
  const legacyTitles = new Map(records.filter(r=>r?.kind==='report-folder-title' && r.workspace===activeWorkspace).map(r=>[r.folderId,r.title]));
  for (const record of records) {
    if (record.workspace !== activeWorkspace) continue;
    if (isReportFolder(record)) {
      folders.push(record);
    } else if (typeof record.html === 'string') {
      // The previous version generated one identical creation timestamp per batch.
      const groupKey = `${record.workspace}|${record.createdAt || record.id}`;
      if (!groupedOld.has(groupKey)) groupedOld.set(groupKey, []);
      groupedOld.get(groupKey).push(record);
    }
  }
  for (const [key, records] of groupedOld) {
    const first = records[0];
    const year = first.year ?? Number(first.workspace.split(':')[0]);
    const grade = first.grade || first.workspace.split(':')[1];
    folders.push({
      id: `legacy-folder:${key}`, legacy: true, workspace: first.workspace,
      createdAt: first.createdAt || '', year, grade,
      title: legacyTitles.get(`legacy-folder:${key}`) || defaultFolderTitle(year, grade, first.createdAt),
      papers: records.map(r => ({id: r.id, studentId: r.studentId, name: r.name, html: r.html, title: r.title}))
    });
  }
  return folders.sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
function currentFolder() { return savedReportsView.find(f => f.id === openReportFolderId); }
function currentPaper(folder) { return folder?.papers.find(p => p.id === openedReportStudentId); }
function resetFolderView() {
  openReportFolderId = null;
  openedReportStudentId = null;
  reportFolderChecked.clear();
  folderSearch = '';
}
const priorSwitchWorkspaceFolder = switchWorkspace;
switchWorkspace = function(id) {
  if (id !== activeWorkspace && !batchDrafts.length) resetFolderView();
  return priorSwitchWorkspaceFolder(id);
};

saveSelectedReports = async function() {
  const people = reportSelection();
  if (!people.length) return toast('保存する生徒を選択してください。', 'error');
  const folder = createReportFolder(people);
  try {
    await archivePutMany([folder]);
    // Do not report success until the saved set is readable from IndexedDB.
    const found=(await archiveAll()).find(item=>item.id===folder.id);
    if(!found || !isReportFolder(found) || found.papers.length!==people.length)
      throw Error('保存後の読み取り確認に失敗しました。');
    toast(`${people.length}名分の成績表セットを保存しました。保存済み成績表から閲覧できます。`);
  } catch(e) { toast('成績表セットを保存・確認できませんでした：' + e.message, 'error'); }
};
printReports = function() {
  const people = reportSelection();
  if (!people.length) return toast('印刷対象の生徒がいません。', 'error');
  if (!confirm(`${people.length}名分をA4横でPDF出力・印刷します。\nアプリ内の保存済み成績表には追加されません。`)) return;
  // Printing must never write to IndexedDB. Saving is a separate explicit action.
  printPaperHTML(people.map(person => paperMarkup(person)), filenameFor(people));
};

function folderListMarkup(folders) {
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>成績表セット</th><th>作成日時</th><th class="numeric">人数</th><th>操作</th></tr></thead><tbody>${folders.map(f=>`<tr><td><button class="btn ghost" data-open-folder="${escapeHTML(f.id)}">▣ ${escapeHTML(f.title)}</button></td><td>${escapeHTML(folderDate(f.createdAt))}</td><td class="numeric">${f.papers.length}名</td><td><div class="controls"><button class="btn small" data-open-folder="${escapeHTML(f.id)}">開く</button><button class="btn small" data-rename-folder="${escapeHTML(f.id)}">名前を変更</button><button class="btn small" data-print-folder="${escapeHTML(f.id)}">全員印刷</button><button class="btn small danger" data-delete-folder="${escapeHTML(f.id)}">削除</button></div></td></tr>`).join('')||'<tr><td colspan="4">保存済みの成績表セットはありません。</td></tr>'}</tbody></table></div>`;
}
archiveMarkup = function() {
  const folders = savedReportsView.filter(f => norm(f.title).includes(norm(folderSearch)) || f.papers.some(p => norm(p.name).includes(norm(folderSearch))));
  return `<div class="controls spread" style="margin-bottom:18px"><strong>保存済み成績表セット（${savedReportsView.length}件）</strong><span class="muted tiny">${escapeHTML(activeWorkspace.replace(':','年度・'))} ／ 作成時点の成績を保存</span></div>
  <section class="section"><div class="section-body"><div class="controls" style="margin-bottom:14px"><input id="folderSearch" class="field search" placeholder="セット名・生徒名で検索" value="${escapeHTML(folderSearch)}"></div><div id="folderListing">${folderListMarkup(folders)}</div></div></section>
  <p class="footer-note">セットを開くと生徒を複数選択して印刷できます。成績表の内容は作成時点で固定され、模試の追加後も変わりません。</p>`;
};
function folderContentsMarkup(folder) {
  const names = folder.papers;
  const allSelected = names.length > 0 && names.every(p => reportFolderChecked.has(p.id));
  return `<div class="controls spread" style="margin-bottom:15px"><button class="btn" id="backToFolders">← 成績表セット一覧に戻る</button><div><strong>▣ ${escapeHTML(folder.title)}</strong><p class="muted tiny" style="margin:4px 0 0">${names.length}名 ／ ${escapeHTML(folderDate(folder.createdAt))}</p></div></div>
  <section class="section"><div class="section-head"><h2>保存した生徒の成績表</h2><div class="controls"><button class="btn small" id="folderSelectAll">全員選択</button><button class="btn small" id="folderSelectNone">選択解除</button></div></div><div class="section-body">
  <div class="controls spread" style="margin-bottom:14px"><span class="muted tiny">${names.filter(p=>reportFolderChecked.has(p.id)).length}名選択中</span><div class="controls"><button class="btn primary" id="folderPrintSelected" ${!names.some(p=>reportFolderChecked.has(p.id))?'disabled':''}>選択した生徒を印刷</button><button class="btn" id="folderPrintAll">全員を一括印刷（${names.length}名）</button></div></div>
  <div class="table-wrap"><table class="data-table"><thead><tr><th><input type="checkbox" id="folderToggleAll" ${allSelected?'checked':''}></th><th>氏名</th><th>操作</th></tr></thead><tbody>${names.map(p=>`<tr><td><input type="checkbox" class="folder-person-check" data-paper-id="${escapeHTML(p.id)}" ${reportFolderChecked.has(p.id)?'checked':''}></td><td>${escapeHTML(p.name)}</td><td><div class="controls"><button class="btn small" data-view-folder-person="${escapeHTML(p.id)}">閲覧</button><button class="btn small" data-print-folder-person="${escapeHTML(p.id)}">個別印刷</button></div></td></tr>`).join('')}</tbody></table></div></div></section>`;
}
function folderPersonPreview(folder, paper) {
  return `<div class="controls spread" style="margin-bottom:12px"><button class="btn" id="backToFolder">← セット内の生徒一覧へ</button><div class="controls"><strong>${escapeHTML(paper.name)}</strong><button class="btn primary" id="printCurrentFolderPerson">この生徒を印刷</button></div></div><div class="paper-host"><div class="saved-paper-host">${paper.html}</div></div>`;
}
archivePreview = function() {
  const folder=currentFolder();
  if (!folder) { resetFolderView(); return archiveMarkup(); }
  const paper=currentPaper(folder);
  return paper ? folderPersonPreview(folder,paper) : folderContentsMarkup(folder);
};
renderArchiveView = function() {
  header('保存済み成績表','成績表セットを開き、個別・複数・全員を印刷');
  $('#appView').innerHTML = openReportFolderId ? archivePreview() : archiveMarkup();
  refreshWorkspaceControls();
  bindFolderHandlers();
};
refreshArchive = async function() {
  try {
    savedReportsView = groupedArchivedRecords(await archiveAll());
    if (route === 'archive') renderArchiveView();
  } catch(e) { toast('保存済み成績表の読み込みに失敗しました：' + e.message, 'error'); }
};
function folderPrint(folder,papers) {
  if (!papers.length) return toast('印刷する成績表が選択されていません。', 'error');
  const safeName = s => String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\s+/g,'').slice(0,45);
  const name = papers.length===1 ? safeName(papers[0].name) : `${papers.length}名`;
  const basename = `保存済み成績表_${folder.year}年度_${folder.grade}_${name}_${String(folder.createdAt).replace(/[^0-9]/g,'').slice(0,14)}`;
  printPaperHTML(papers.map(p=>p.html), basename);
}
function bindFolderHandlers() {
  const backList=$('#backToFolders');if(backList)backList.onclick=()=>{resetFolderView();renderArchiveView()};
  const backFolder=$('#backToFolder');if(backFolder)backFolder.onclick=()=>{openedReportStudentId=null;renderArchiveView()};
  const search=$('#folderSearch');if(search)search.oninput=e=>{folderSearch=e.target.value;$('#folderListing').innerHTML=folderListMarkup(savedReportsView.filter(f=>norm(f.title).includes(norm(folderSearch))||f.papers.some(p=>norm(p.name).includes(norm(folderSearch)))));bindFolderHandlers()};
  $$('[data-open-folder]').forEach(el=>el.onclick=()=>{openReportFolderId=el.dataset.openFolder;openedReportStudentId=null;reportFolderChecked.clear();renderArchiveView()});
  $$('[data-print-folder]').forEach(el=>el.onclick=()=>{const f=savedReportsView.find(x=>x.id===el.dataset.printFolder);if(f)folderPrint(f,f.papers)});
  $$('[data-rename-folder]').forEach(el=>el.onclick=async()=>{
    const folder=savedReportsView.find(f=>f.id===el.dataset.renameFolder);
    if(!folder)return;
    const input=prompt('成績表セットの新しい名前を入力してください。',folder.title);
    if(input===null)return;
    const title=input.trim();
    if(!title)return toast('名前を入力してください。','error');
    if(title.length>100)return toast('名前は100文字以内で入力してください。','error');
    if(title===folder.title)return;
    try {
      if(folder.legacy){
        await archivePutMany([{id:'folder-title:'+folder.id,kind:'report-folder-title',folderId:folder.id,workspace:folder.workspace,title}]);
      }else{
        await archivePutMany([{...folder,title}]);
      }
      await refreshArchive();
      toast('成績表セットの名前を変更しました。');
    }catch(e){toast('名前を変更できませんでした：'+e.message,'error')}
  });
  $$('[data-delete-folder]').forEach(el=>el.onclick=async()=>{
    const f=savedReportsView.find(x=>x.id===el.dataset.deleteFolder);
    if(!f||!confirm(`「${f.title}」（${f.papers.length}名分）を削除しますか？\nこの操作は取り消せません。`))return;
    try{
      if(f.legacy){for(const p of f.papers)await archiveRemove(p.id);await archiveRemove('folder-title:'+f.id)}
      else await archiveRemove(f.id);
      resetFolderView();await refreshArchive();
    }catch(e){toast('削除できませんでした：'+e.message,'error')}
  });
  $$('[data-view-folder-person]').forEach(el=>el.onclick=()=>{openedReportStudentId=el.dataset.viewFolderPerson;renderArchiveView()});
  $$('[data-print-folder-person]').forEach(el=>el.onclick=()=>{const f=currentFolder(),p=f?.papers.find(x=>x.id===el.dataset.printFolderPerson);if(p)folderPrint(f,[p])});
  const printCurrent=$('#printCurrentFolderPerson');if(printCurrent)printCurrent.onclick=()=>{const f=currentFolder(),p=currentPaper(f);if(p)folderPrint(f,[p])};
  $$('.folder-person-check').forEach(el=>el.onchange=e=>{e.target.checked?reportFolderChecked.add(el.dataset.paperId):reportFolderChecked.delete(el.dataset.paperId);renderArchiveView()});
  const toggle=$('#folderToggleAll');if(toggle)toggle.onchange=e=>{reportFolderChecked=e.target.checked?new Set(currentFolder().papers.map(p=>p.id)):new Set();renderArchiveView()};
  const all=$('#folderSelectAll');if(all)all.onclick=()=>{reportFolderChecked=new Set(currentFolder().papers.map(p=>p.id));renderArchiveView()};
  const none=$('#folderSelectNone');if(none)none.onclick=()=>{reportFolderChecked.clear();renderArchiveView()};
  const selectedBtn=$('#folderPrintSelected');if(selectedBtn)selectedBtn.onclick=()=>{const f=currentFolder();if(f)folderPrint(f,f.papers.filter(p=>reportFolderChecked.has(p.id)))};
  const allBtn=$('#folderPrintAll');if(allBtn)allBtn.onclick=()=>{const f=currentFolder();if(f)folderPrint(f,f.papers)};
}

// The original render hook already delegates archive pages to these now-overridden functions.
// Replace the wording of the batch save action without duplicating the button.
const priorRenderReportFolders = render;
render = function() {
  priorRenderReportFolders();
  const btn = $('#appView .report-layout button');
  const saveButton = [...$$('#appView button')].find(x => x.textContent.includes('個別成績表をアプリ内に保存'));
  if (route==='report') {
    if (saveButton) saveButton.textContent='成績表セットをアプリ内に保存';
    const printButton = $('#printButton');
    if (printButton) {
      printButton.textContent='PDF出力・印刷（アプリ内には保存しない）';
      printButton.title='PDF保存または印刷のみ。保存済み成績表には追加しません。';
    }
  }
};
// When switching grades, use the new folder-specific state (even before archive reload).
render();