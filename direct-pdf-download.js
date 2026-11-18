'use strict';
/* Device-only PDF download: rasterize saved HTML with native browser text and SVG.
   No remote PDF service or additional libraries, no change to printing or IndexedDB. */
(() => {
 const W=1122,H=794,SCALE=2.1,MW=841.89,MH=595.28;
 let busy=false,progress={mode:'idle',done:0,total:0,error:'',scope:''},lastJob=null;
 const utf8=s=>new TextEncoder().encode(s);
 function font(ctx,size,bold=false){
  ctx.font=(bold?'700 ':'')+size+'px "Yu Gothic","Meiryo","Hiragino Kaku Gothic ProN",sans-serif';
 }
 function clippedText(ctx,value,x,y,maxWidth,align='left'){
  const original=String(value??'');
  let str=original;
  while(str.length&&ctx.measureText(str).width>maxWidth)str=str.slice(0,-1);
  if(str!==original)str=str.slice(0,-1)+'…';
  ctx.textAlign=align;ctx.fillText(str,x,y);
 }
 function line(ctx,x1,y1,x2,y2,color='#d9e1e8',width=1){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
 }
 async function svgOnCanvas(ctx,svg,x,y,w,h){
  if(!svg)return;
  const xml=new XMLSerializer().serializeToString(svg);
  const uri=URL.createObjectURL(new Blob([xml],{type:'image/svg+xml;charset=utf-8'}));
  try{
   const img=await imageFrom(uri);
   const view=svg.viewBox?.baseVal;
   const ratio=view?.width&&view?.height?view.width/view.height:2.4;
   const height=Math.min(h,w/ratio),width=height*ratio;
   ctx.drawImage(img,x+(w-width)/2,y,width,height);
  }finally{URL.revokeObjectURL(uri);}
 }
 function imageFrom(url){
  return new Promise((resolve,reject)=>{
   const img=new Image();img.onload=()=>resolve(img);
   img.onerror=()=>reject(Error('偏差値グラフを画像化できませんでした。'));
   img.src=url;
  });
 }
 function drawTable(ctx,table,y,endY){
  if(!table)return y;
  const dual=table.classList.contains('score-dual-table');
  const first=[...table.querySelectorAll('thead tr:first-child th')];
  const second=[...table.querySelectorAll('thead tr:nth-child(2) th')];
  const rows=[...table.querySelectorAll('tbody tr')].map(tr=>[...tr.querySelectorAll('td')]);
  const headers=dual?[
    ...first.filter(th=>th.rowSpan===2).map(th=>th.textContent.trim()),
    ...second.map(th=>th.textContent.trim())
  ]:first.map(th=>th.textContent.trim());
  if(!headers.length)return y;
  const x=30,w=W-60,metaCount=2;
  const fixed=headers.length>=3?[108,Math.min(210,Math.max(155,w*.20))]:[];
  const available=Math.max(0,w-fixed.reduce((a,b)=>a+b,0));
  const widths=headers.map((_,i)=>i<fixed.length?fixed[i]:available/Math.max(1,headers.length-fixed.length));
  const headerHeight=dual?49:26;
  const rowHeight=Math.min(dual?26:27,Math.max(6,(endY-y-headerHeight)/Math.max(1,rows.length)));
  const cellSize=dual?Math.max(7.5,Math.min(10,rowHeight*.57)):Math.max(7,Math.min(13,rowHeight*.66));
  ctx.fillStyle='#edf2f6';ctx.fillRect(x,y,w,headerHeight);
  line(ctx,x,y,x+w,y);
  let left=x;
  if(dual){
    font(ctx,10,true);ctx.fillStyle='#30465c';
    for(let i=0;i<metaCount;i++){
      clippedText(ctx,headers[i],left+widths[i]/2,y+29,widths[i]-5,'center');
      left+=widths[i];
    }
    for(let i=0;i<second.length;i+=2){
      const wi=widths[metaCount+i]+widths[metaCount+i+1];
      clippedText(ctx,first[metaCount+i/2]?.textContent.trim()||'',left+wi/2,y+16,wi-6,'center');
      left+=wi;
    }
    line(ctx,x+fixed.reduce((a,b)=>a+b,0),y+24,x+w,y+24);
    left=x+fixed.reduce((a,b)=>a+b,0);
    second.forEach((head,i)=>{
      const width=widths[i+metaCount];
      ctx.fillStyle=i%2===0?'#205783':'#a45b19';
      clippedText(ctx,head.textContent.trim(),left+width/2,y+40,width-3,'center');
      left+=width;
    });
  }else{
    left=x;
    first.forEach((head,i)=>{
      font(ctx,Math.max(9,cellSize),true);ctx.fillStyle='#30465c';
      clippedText(ctx,head.textContent.trim(),left+widths[i]/2,y+headerHeight/2+4,widths[i]-6,'center');
      left+=widths[i];
    });
  }
  line(ctx,x,y+headerHeight,x+w,y+headerHeight);
  left=x;
  for(const width of widths){line(ctx,left,y,left,y+headerHeight+rows.length*rowHeight);left+=width;}
  line(ctx,x+w,y,x+w,y+headerHeight+rows.length*rowHeight);
  rows.forEach((cells,index)=>{
    const top=y+headerHeight+index*rowHeight;
    if(index%2){ctx.fillStyle='#f9fbfc';ctx.fillRect(x,top,w,rowHeight);}
    let cx=x;
    cells.slice(0,headers.length).forEach((cell,i)=>{
      const width=widths[i],cls=cell.classList;
      if(dual&&i>=metaCount){
        ctx.fillStyle=cls.contains('score-deviation-value')?'#edf5fb':'#fff3e7';
        ctx.fillRect(cx+1,top+1,Math.max(0,width-2),Math.max(0,rowHeight-2));
      }
      font(ctx,cellSize,dual&&i>=metaCount);
      ctx.fillStyle=dual&&cls.contains('score-deviation-value')?'#205783':dual&&cls.contains('score-points-value')?'#a45b19':'#293949';
      clippedText(ctx,cell.textContent.trim(),cx+width/2,top+rowHeight/2+cellSize*.33,width-4,'center');
      cx+=width;
    });
    line(ctx,x,top+rowHeight,x+w,top+rowHeight);
  });
  return y+headerHeight+rows.length*rowHeight;
 }
 function wrapText(ctx,value,width){
  const lines=[];
  for(const raw of String(value??'').split('\n')){
   let lineText='';
   for(const char of raw){
    if(ctx.measureText(lineText+char).width>width&&lineText){lines.push(lineText);lineText='';}
    lineText+=char;
   }
   lines.push(lineText);
  }
  return lines;
 }
 async function jpegPage(html){
  const template=document.createElement('template');template.innerHTML=html;
  const report=template.content.querySelector('.report-paper');
  if(!report)throw Error('成績表の内容を読み取れませんでした。');
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(W*SCALE);canvas.height=Math.round(H*SCALE);
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw Error('PDFの画像領域を確保できません。');
  ctx.setTransform(SCALE,0,0,SCALE,0,0);
  ctx.fillStyle='white';ctx.fillRect(0,0,W,H);
  const title=report.querySelector('.paper-head h2')?.textContent||'模試個人成績表';
  const detail=report.querySelector('.paper-head p')?.textContent||'';
  font(ctx,23,true);ctx.fillStyle='#1f2933';clippedText(ctx,title,30,61,620);
  font(ctx,12);ctx.fillStyle='#617286';clippedText(ctx,detail,30,88,720);
  const kpi=[...report.querySelectorAll('.paper-kpi span')];
  for(let i=0;i<Math.min(2,kpi.length);i++){
   const block=kpi[i],num=block.querySelector('strong')?.textContent||'—';
   const label=block.textContent.replace(num,'').trim();
   const px=815+i*140;
   font(ctx,12);ctx.fillStyle='#607082';clippedText(ctx,label,px,41,135);
   font(ctx,22,true);ctx.fillStyle='#263e56';clippedText(ctx,num,px,72,135);
  }
  line(ctx,30,110,W-30,110,'#264665',2);
  const charts=[...report.querySelectorAll('.chart-box')].slice(0,2);
  const chartX=[30,700],chartWidth=[642,392];
  for(let i=0;i<charts.length;i++){
   const c=charts[i],x=chartX[i],width=chartWidth[i];
   font(ctx,14,true);ctx.fillStyle='#293949';
   clippedText(ctx,c.querySelector('h3')?.textContent||'',x,143,width);
   await svgOnCanvas(ctx,c.querySelector('svg'),x,158,width,225);
  }
  const table=report.querySelector('table');
  const comment=report.querySelector('.paper-comment');
  const footer=report.querySelector('.footer-note')?.textContent||'';
  const tableStart=427,tableBottom=comment?670:725;
  font(ctx,14,true);ctx.fillStyle='#293949';ctx.fillText('偏差値一覧',30,414);
  const bottom=drawTable(ctx,table,tableStart,tableBottom);
  if(comment){
   ctx.textAlign='left';
   const top=Math.max(bottom+12,680);
   ctx.fillStyle='#fff';ctx.fillRect(30,top,W-60,Math.max(0,747-top));
   ctx.strokeStyle='#dce2e8';ctx.strokeRect(30,top,W-60,Math.max(0,747-top));
   font(ctx,12,true);ctx.fillStyle='#263e56';ctx.fillText('講師コメント',40,top+17);
   const value=comment.textContent.replace(/^\s*講師コメント\s*/,'').trim();
   font(ctx,11);ctx.fillStyle='#293949';
   wrapText(ctx,value,W-94).slice(0,3).forEach((l,i)=>clippedText(ctx,l,40,top+34+i*14,W-94));
  }
  font(ctx,10);ctx.fillStyle='#71818f';clippedText(ctx,footer,W-30,H-18,W-60,'right');
  const base64=canvas.toDataURL('image/jpeg',0.94).split(',')[1];
  const raw=atob(base64),bytes=new Uint8Array(raw.length);
  for(let j=0;j<raw.length;j++)bytes[j]=raw.charCodeAt(j);
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
  if(progress.mode==='error')return '<div class="pdf-status pdf-error" role="alert">PDFの生成に失敗しました：'+escapeHTML(progress.error)+'<div><button type="button" class="btn small" id="retryDirectPdf">再試行</button></div></div>';
  return '';
 }
 function update(){
  const bar=document.querySelector('[data-pdf-status="'+progress.scope+'"]');
  if(bar){bar.innerHTML=status();const retry=bar.querySelector('#retryDirectPdf');if(retry)retry.onclick=()=>{if(lastJob&&!busy)download(lastJob.papers,lastJob.base,lastJob.scope);};}
  document.querySelectorAll('[data-direct-pdf]').forEach(el=>{el.disabled=busy||el.dataset.noSelection==='1';});
 }
 async function download(papers,base,scope){
  if(busy)return;
  if(!papers.length){toast('PDFに出力する生徒がいません。','error');return;}
  lastJob={papers,base,scope};busy=true;progress={mode:'working',done:0,total:papers.length,error:'',scope};update();
  try{
   await new Promise(resolve=>requestAnimationFrame(resolve));
   const images=[];
   for(const [index,html] of papers.entries()){
    images.push(await jpegPage(html));
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
 const oldFolderBindings=bindFolderHandlers;
 bindFolderHandlers=function(){const output=oldFolderBindings();enhanceArchive();return output;};
 const oldArchiveRender=renderArchiveView;
 renderArchiveView=function(){const result=oldArchiveRender();enhanceArchive();return result;};
 render();
})();
