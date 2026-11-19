'use strict';
/* Fast saved report browser: preview snapshots in-place; no IndexedDB writes. */
(() => {
 let search='',expanded=false,bulk=false,folderKey=null,lastPaperId=null;
 const sameFolder=folder=>{
  if(folderKey===folder.id)return;
  folderKey=folder.id;search='';expanded=false;bulk=false;lastPaperId=null;
 };
 const normalized=html=>typeof window.normalizeReportScoreColumns==='function'
   ?window.normalizeReportScoreColumns(html):html;
 function getVisible(folder){
  const q=norm(search.trim());
  return folder.papers.filter(p=>norm(p.name).includes(q));
 }
 function shown(folder){
  return folder.papers.find(p=>p.id===openedReportStudentId)||folder.papers[0]||null;
 }
 function paperContent(paper){return normalized(paper.html);}
 const originalPreview=archivePreview;
 archivePreview=function(){
  const folder=currentFolder();
  if(!folder)return originalPreview();
  sameFolder(folder);
  if(bulk){
   openedReportStudentId=null;
   return '<div class="archive-bulk-return"><button class="btn" type="button" id="archiveBrowseMode">← 一覧＋プレビューに戻る</button></div>'+folderContentsMarkup(folder);
  }
  if(!folder.papers.length)return originalPreview();
  const selected=shown(folder);
  if(!openedReportStudentId)openedReportStudentId=selected.id;
  const index=folder.papers.findIndex(p=>p.id===selected.id);
  const visible=getVisible(folder);
  return '<div class="archive-browser'+(expanded?' archive-browser-expanded':'')+'" id="archiveBrowser">'+
   '<div class="archive-browser-header"><button class="btn small" id="backToFolders" type="button">← セット一覧</button>'+
   '<div class="archive-browser-title"><strong>'+escapeHTML(folder.title)+'</strong><span>'+folder.papers.length+'名 ／ '+escapeHTML(folderDate(folder.createdAt))+'</span></div>'+
   '<button class="btn small" id="archiveBulkMode" type="button">複数選択・一括印刷</button></div>'+
   '<div class="archive-browser-grid">'+
   '<aside class="archive-person-panel" aria-label="生徒一覧"><label for="archiveFilterInput">生徒を検索</label>'+
   '<input class="field" type="search" id="archiveFilterInput" placeholder="氏名で検索" autocomplete="off" value="'+escapeHTML(search)+'">'+
   '<div class="archive-person-list" id="archivePersonList" role="list">'+
   folder.papers.map((p,i)=>'<button type="button" class="archive-person-item'+(p.id===selected.id?' is-current':'')+'" data-archive-paper="'+escapeHTML(p.id)+'" role="listitem" '+(visible.includes(p)?'':'hidden')+' aria-current="'+(p.id===selected.id?'true':'false')+'">'+
      '<span>'+escapeHTML(p.name)+'</span><small>'+(i+1)+'</small></button>').join('')+
   '</div><p id="archiveNoMatches" class="muted tiny" '+(visible.length?'hidden':'')+'>該当する生徒はいません。</p></aside>'+
   '<section class="archive-preview-panel" aria-label="成績表プレビュー">'+
   '<div class="archive-preview-toolbar"><div class="archive-preview-heading"><strong id="archiveActiveName">'+escapeHTML(selected.name)+'</strong><span id="archivePosition">'+(index+1)+' / '+folder.papers.length+'名</span></div>'+
   '<div class="archive-preview-actions"><button class="btn small" id="archivePrev" type="button">← 前へ</button>'+
   '<button class="btn small" id="archiveNext" type="button">次へ →</button>'+
   '<button class="btn small" id="archiveExpand" type="button" aria-pressed="'+expanded+'">'+(expanded?'縮小表示':'拡大表示')+'</button>'+
   '<button class="btn small primary" id="printCurrentFolderPerson" type="button">個別印刷</button></div></div>'+
   '<div class="archive-paper-scroller" id="archivePaperScroller"><div id="archivePreviewPaper" class="saved-paper-host">'+paperContent(selected)+'</div></div>'+
   '<p class="archive-browser-hint">生徒名をクリックするか、← → キーで成績表を切り替えられます。</p>'+
   '</section></div></div>';
 };
 function refreshNavigation(folder){
  const papers=getVisible(folder),current=shown(folder),i=papers.findIndex(p=>p.id===current?.id);
  const prev=document.getElementById('archivePrev'),next=document.getElementById('archiveNext');
  if(prev)prev.disabled=i<=0;
  if(next)next.disabled=i<0||i>=papers.length-1;
  const noMatches=document.getElementById('archiveNoMatches');
  if(noMatches)noMatches.hidden=!!papers.length;
 }
 function switchPaper(paperId){
  const folder=currentFolder();
  const paper=folder?.papers.find(p=>p.id===paperId);
  if(!paper||!document.getElementById('archiveBrowser'))return;
  openedReportStudentId=paper.id;lastPaperId=paper.id;
  const host=document.getElementById('archivePreviewPaper');
  if(host)host.innerHTML=paperContent(paper);
  const title=document.getElementById('archiveActiveName');
  if(title)title.textContent=paper.name;
  const counter=document.getElementById('archivePosition');
  if(counter)counter.textContent=(folder.papers.indexOf(paper)+1)+' / '+folder.papers.length+'名';
  document.querySelectorAll('[data-archive-paper]').forEach(b=>{
   const active=b.dataset.archivePaper===paper.id;
   b.classList.toggle('is-current',active);
   b.setAttribute('aria-current',String(active));
  });
  // The old print handler resolves currentPaper() at click time.
  // The direct PDF handler is rebound to this snapshot, never to the previous one.
  const pdf=document.getElementById('directPdfPerson');
  if(pdf&&typeof window.downloadArchivedIndividualPDF==='function'){
    pdf.onclick=()=>window.downloadArchivedIndividualPDF(folder,paper);
  }
  const item=[...document.querySelectorAll('[data-archive-paper]')].find(b=>b.dataset.archivePaper===paper.id);
  if(item&&!item.hidden)item.scrollIntoView({block:'nearest'});
  refreshNavigation(folder);
 }
 function navigate(step){
  const folder=currentFolder();if(!folder)return;
  const list=getVisible(folder),index=list.findIndex(p=>p.id===openedReportStudentId);
  const target=list[index+step];
  if(target)switchPaper(target.id);
 }
 const originalBind=bindFolderHandlers;
 bindFolderHandlers=function(){
  originalBind();
  const folder=currentFolder();
  if(!folder)return;
  if(bulk){
    const back=document.getElementById('archiveBrowseMode');
    if(back)back.onclick=()=>{
      bulk=false;openedReportStudentId=folder.papers.find(p=>p.id===lastPaperId)?.id||folder.papers[0]?.id||null;
      renderArchiveView();
    };
    document.querySelectorAll('[data-view-folder-person]').forEach(button=>{
      button.onclick=()=>{bulk=false;openedReportStudentId=button.dataset.viewFolderPerson;renderArchiveView()};
    });
    return;
  }
  const browser=document.getElementById('archiveBrowser');if(!browser)return;
  const current=shown(folder);
  if(current)lastPaperId=current.id;
  const searchInput=document.getElementById('archiveFilterInput');
  if(searchInput)searchInput.oninput=()=>{
    search=searchInput.value;
    const shownPapers=getVisible(folder);
    document.querySelectorAll('[data-archive-paper]').forEach(b=>{b.hidden=!shownPapers.some(p=>p.id===b.dataset.archivePaper)});
    if(shownPapers.length&&!shownPapers.some(p=>p.id===openedReportStudentId))switchPaper(shownPapers[0].id);
    refreshNavigation(folder);
  };
  document.querySelectorAll('[data-archive-paper]').forEach(b=>{
    b.onclick=()=>switchPaper(b.dataset.archivePaper);
  });
  const prev=document.getElementById('archivePrev'),next=document.getElementById('archiveNext');
  if(prev)prev.onclick=()=>navigate(-1);
  if(next)next.onclick=()=>navigate(1);
  const expand=document.getElementById('archiveExpand');
  if(expand)expand.onclick=()=>{
    expanded=!expanded;
    browser.classList.toggle('archive-browser-expanded',expanded);
    expand.textContent=expanded?'縮小表示':'拡大表示';
    expand.setAttribute('aria-pressed',String(expanded));
  };
  const bulkBtn=document.getElementById('archiveBulkMode');
  if(bulkBtn)bulkBtn.onclick=()=>{bulk=true;lastPaperId=openedReportStudentId;renderArchiveView()};
  const pdf=document.getElementById('directPdfPerson');
  if(pdf&&current&&typeof window.downloadArchivedIndividualPDF==='function'){
    pdf.onclick=()=>window.downloadArchivedIndividualPDF(folder,current);
  }
  refreshNavigation(folder);
 };
 document.addEventListener('keydown',event=>{
  if(route!=='archive'||!document.getElementById('archiveBrowser'))return;
  if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  const target=event.target;
  if(target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName))return;
  if(event.key==='Escape'&&expanded){
    expanded=false;document.getElementById('archiveBrowser')?.classList.remove('archive-browser-expanded');
    const button=document.getElementById('archiveExpand');
    if(button){button.textContent='拡大表示';button.setAttribute('aria-pressed','false');}
  }else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
    event.preventDefault();
    navigate(event.key==='ArrowLeft'?-1:1);
  }
 });
})();
