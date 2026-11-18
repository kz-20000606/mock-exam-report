'use strict';
/* Device-only PDF download: rasterize saved HTML with native browser text and SVG.
   No remote PDF service or additional libraries, no change to printing or IndexedDB. */
(() => {
 const W=1122,H=794,SCALE=2.1,MW=841.89,MH=595.28;
 let busy=false,progress={mode:'idle',done:0,total:0,error:'',scope:''};
 const utf8=s=>new TextEncoder().encode(s);
 function pageCSS(){
  let css='';
  for(const sheet of document.styleSheets){
   try{if(sheet.href&&new URL(sheet.href,location.href).origin!==location.origin)continue;
    for(const rule of sheet.cssRules)css+=rule.cssText+'\n';}catch(_){}
  }
  return css+[
  '*,*:before,*:after{box-sizing:border-box!important}',
  '.report-paper{width:1122px!important;height:794px!important;min-width:0!important;max-width:1122px!important;aspect-ratio:auto!important;box-shadow:none!important;border:0!important;padding:24px 27px!important;gap:10px!important;overflow:hidden!important;display:flex!important;flex-direction:column!important;background:white!important;color:#1f2933!important;font-family:"Yu Gothic","Meiryo","Hiragino Kaku Gothic ProN",sans-serif!important}',
  '.paper-head h2{font-size:24px!important}.paper-head p{font-size:13px!important}.paper-kpi{font-size:14px!important}.paper-kpi strong{font-size:22px!important}',
  '.report-paper .chart-pair{display:grid!important;grid-template-columns:3fr 2fr!important;gap:22px!important}',
  '.report-paper .chart-box{padding:0!important;border:0!important;background:white!important}',
  '.report-paper .chart-box h3{font-size:14px!important;margin:0 0 4px!important}',
  '.report-paper .chart-box > svg{height:225px!important;max-height:225px!important;width:100%!important}',
  '.report-paper .paper-table{font-size:12px!important}',
  '.report-paper .paper-table th,.report-paper .paper-table td{padding:6px 8px!important}',
  '.paper-comment{font-size:12px!important;min-height:48px!important}',
  '.report-paper .footer-note{font-size:11px!important}'
  ].join('\n');
 }
 function htmlSVG(html,css){
  const temp=document.createElement('template');temp.innerHTML=html;
  const paper=temp.content.querySelector('.report-paper');
  if(!paper)throw Error('成績表のデータを読み取れません。');
  const wrap=document.createElementNS('http://www.w3.org/1999/xhtml','div');
  wrap.setAttribute('style','width:1122px;height:794px;overflow:hidden;background:white');
  wrap.appendChild(paper.cloneNode(true));
  const content=new XMLSerializer().serializeToString(wrap);
  const style='<style xmlns="http://www.w3.org/1999/xhtml">'+css.replace(/<\/style/gi,'<\\/style')+'</style>';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'"><foreignObject width="'+W+'" height="'+H+'"><div xmlns="http://www.w3.org/1999/xhtml">'+style+content+'</div></foreignObject></svg>';
 }
 function imageFrom(url){
  return new Promise((resolve,reject)=>{
   const img=new Image();img.onload=()=>resolve(img);
   img.onerror=()=>reject(Error('成績表を画像化できませんでした。'));img.src=url;
  });
 }
 async function jpegPage(html,css){
  const url=URL.createObjectURL(new Blob([htmlSVG(html,css)],{type:'image/svg+xml'}));
  let img;
  try{img=await imageFrom(url);}finally{URL.revokeObjectURL(url);}
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(W*SCALE);canvas.height=Math.round(H*SCALE);
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('画像の描画領域を確保できません。');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const data=canvas.toDataURL('image/jpeg',0.94).split(',')[1];
  const binary=atob(data),bytes=new Uint8Array(binary.length);
  for(let j=0;j<binary.length;j++)bytes[j]=binary.charCodeAt(j);
  canvas.width=0;canvas.height=0;
  return {data:bytes,width:Math.round(W*SCALE),height:Math.round(H*SCALE)};
 }
 function pdfBlob(pages){
  const count=pages.length*3+2,offsets=new Array(count+1).fill(0),chunks=[];let position=0;
  const put=v=>{const bytes=typeof v==='string'?utf8(v):v;chunks.push(bytes);position+=bytes.length;};
  const obj=(n,str)=>{offsets[n]=position;put(n+' 0 obj\n'+str+'\nendobj\n');};
  put('%PDF-1.4\n');
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,'<< /Type /Pages /Kids [ '+pages.map((_,i)=>(3+3*i)+' 0 R').join(' ')+' ] /Count '+pages.length+' >>');
  pages.forEach((p,i)=>{
   const n=3+3*i,stream='q '+MW+' 0 0 '+MH+' 0 0 cm /Im0 Do Q\n';
   obj(n,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+MW+' '+MH+'] /Resources << /XObject << /Im0 '+(n+2)+' 0 R >> >> /Contents '+(n+1)+' 0 R >>');
   obj(n+1,'<< /Length '+utf8(stream).length+' >>\nstream\n'+stream+'endstream');
   offsets[n+2]=position;
   put((n+2)+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+p.width+' /Height '+p.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+p.data.length+' >>\nstream\n');
   put(p.data);put('\nendstream\nendobj\n');
  });
  const xref=position;put('xref\n0 '+(count+1)+'\n0000000000 65535 f \n');
  for(let i=1;i<=count;i++)put(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
  put('trailer\n<< /Size '+(count+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');
  return new Blob(chunks,{type:'application/pdf'});
 }
 function safeName(base){return safeReportFilename(base||'模試成績表')+'.pdf';}
 function archiveName(folder,papers){
  const suffix=papers.length===1?'_'+papers[0].name:papers.length===folder.papers.length?'':'_'+papers.length+'名';
  return safeReportFilename((folder.title||defaultFolderTitle(folder.year,folder.grade,folder.createdAt))+suffix);
 }
 function status(){
  if(progress.mode==='working')return '<div class="pdf-status pdf-working" role="status">PDFを生成中… '+progress.done+' / '+progress.total+'ページ<progress value="'+progress.done+'" max="'+progress.total+'"></progress></div>';
  if(progress.mode==='success')return '<div class="pdf-status pdf-success" role="status">✓ PDFの生成が完了し、ダウンロードを開始しました。保存先をご確認ください。</div>';
  if(progress.mode==='error')return '<div class="pdf-status pdf-error" role="alert">PDFの生成に失敗しました：'+escapeHTML(progress.error)+'</div>';
  return '';
 }
 function update(){
  const bar=document.querySelector('[data-pdf-status="'+progress.scope+'"]');
  if(bar)bar.innerHTML=status();
  document.querySelectorAll('[data-direct-pdf]').forEach(el=>{el.disabled=busy||el.dataset.noSelection==='1';});
 }
 async function download(papers,base,scope){
  if(busy)return;
  if(!papers.length){toast('PDFに出力する生徒がいません。','error');return;}
  busy=true;progress={mode:'working',done:0,total:papers.length,error:'',scope};update();
  try{
   await new Promise(resolve=>requestAnimationFrame(resolve));
   const css=pageCSS(),images=[];
   for(const [index,html] of papers.entries()){
    images.push(await jpegPage(html,css));
    progress.done=index+1;update();
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   const blob=pdfBlob(images),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=safeName(base);document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   progress.mode='success';
  }catch(e){progress.mode='error';progress.error=e?.message||'不明なエラー';}
  finally{busy=false;update();}
 }
 function button(after,id,label,action,scope){
  if(!after||document.getElementById(id))return;
  const el=document.createElement('button');
  el.type='button';el.id=id;el.className='btn primary';el.dataset.directPdf='1';el.textContent=label;
  el.onclick=action;after.insertAdjacentElement('afterend',el);
  if(!document.querySelector('[data-pdf-status="'+scope+'"]')){
   const statusEl=document.createElement('div');statusEl.dataset.pdfStatus=scope;
   statusEl.className='pdf-status-host';el.insertAdjacentElement('afterend',statusEl);
  }
 }
 function enhanceReport(){
  const print=document.getElementById('printButton');if(!print)return;
  print.textContent='印刷する';
  button(print,'directPdfReport','PDFをダウンロード',()=>{
   if(!reportExamIds().size)return toast('掲載する模試を選択してください。','error');
   const students=reportSelection();
   download(students.map(s=>paperMarkup(s)),filenameFor(students),'report');
  },'report');
  const b=document.getElementById('directPdfReport');
  if(b)b.dataset.noSelection=!reportExamIds().size||!reportSelection().length?'1':'0';
  update();
 }
 function enhanceArchive(){
  if(route!=='archive')return;
  const folder=currentFolder();
  if(!folder){
   document.querySelectorAll('[data-print-folder]').forEach(print=>{
    const id=print.dataset.printFolder;
    if(print.parentElement.querySelector('[data-direct-pdf]'))return;
    const b=document.createElement('button');b.type='button';b.className='btn small';
    b.dataset.directPdf='1';b.textContent='PDFをダウンロード';
    b.onclick=()=>{const f=savedReportsView.find(x=>x.id===id);if(f)download(f.papers.map(p=>p.html),archiveName(f,f.papers),'archive');};
    print.insertAdjacentElement('beforebegin',b);
   });
   const host=document.getElementById('folderListing')||document.getElementById('appView');
   if(host&&!document.querySelector('[data-pdf-status="archive"]')){
    const el=document.createElement('div');el.dataset.pdfStatus='archive';el.className='pdf-status-host';
    host.insertAdjacentElement('beforebegin',el);
   }
   update();return;
  }
  const person=currentPaper(folder);
  if(person){
   button(document.getElementById('printCurrentFolderPerson'),'directPdfPerson','PDFをダウンロード',()=>download([person.html],archiveName(folder,[person]),'archive'),'archive');
  }else{
   button(document.getElementById('folderPrintSelected'),'directPdfSelected','選択した生徒をPDF保存',()=>{
    const papers=folder.papers.filter(p=>reportFolderChecked.has(p.id));
    download(papers.map(p=>p.html),archiveName(folder,papers),'archive');
   },'archive');
   button(document.getElementById('folderPrintAll'),'directPdfAll','全員分をPDF保存',()=>download(folder.papers.map(p=>p.html),archiveName(folder,folder.papers),'archive'),'archive');
   const b=document.getElementById('directPdfSelected');
   if(b)b.dataset.noSelection=folder.papers.some(p=>reportFolderChecked.has(p.id))?'0':'1';
  }
  update();
 }
 const oldRender=render;
 render=function(){const result=oldRender();if(route==='report')enhanceReport();if(route==='archive')enhanceArchive();return result;};
 const oldArchiveRender=renderArchiveView;
 renderArchiveView=function(){const result=oldArchiveRender();enhanceArchive();return result;};
 render();
})();
