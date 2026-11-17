'use strict';
/* 小学生（小1〜小6）: supplied 成績総覧 format, column headers, and missing-exam handling.
   This module preserves all middle-school import and report functions. */
const ELEMENTARY_FIELDS=[['ja','国語'],['ma','算数'],['sc','理科'],['so','社会'],['two','2教科'],['three','3教科'],['total','総合']];
Object.assign(COLORS,{two:'#d08b35',three:'#815caa'});
function isElementaryGrade(value){return /^小[1-6]$/.test(String(value||'').normalize('NFKC'));}
function elementaryGradeFromRows(rows){
  const header=rows.slice(0,8).flatMap(r=>(r||[]).slice(0,10)).join(' ').normalize('NFKC');
  const m=header.match(/小\s*([1-6])/);
  return m?'小'+m[1]:'';
}
function fieldsForDraft(d){return isElementaryGrade(d?.meta?.grade)?[['ja','国語'],['ma','算数'],['sc','理科'],['so','社会'],['two','2教科'],['three','3教科'],['threeFour','3・4教科'],['totalRaw','総合（4教科）']]:SUBJECTS;}
const previousParseMeta=parseMeta;
parseMeta=function(rows,filename){
  const meta=previousParseMeta(rows,filename);
  const grade=elementaryGradeFromRows(rows);
  if(!grade)return meta;
  meta.grade=grade;
  const head=rows.slice(0,5).flatMap(r=>(r||[]).slice(0,8)).join(' ').normalize('NFKC');
  const m=head.match(/(?:^|[\s　])([^\s　()（）]{2,32}(?:テスト|模試))/);
  if(m)meta.name=m[1].replace(/第\s*\d+\s*回/g,'').trim()+(meta.round?' 第'+meta.round+'回':'');
  return meta;
};
const previousGuessMapping=guessMapping;
guessMapping=function(rows,maxCols){
  if(!elementaryGradeFromRows(rows))return previousGuessMapping(rows,maxCols);
  let best=null;
  const keyByLabel={'国語':'ja','算数':'ma','理科':'sc','社会':'so','2教科':'two','3教科':'three','3・4教科':'threeFour','総合':'totalRaw'};
  for(let ri=0;ri<Math.min(rows.length,20);ri++){
    const row=rows[ri]||[],next=rows[ri+1]||[];
    const group=[];
    for(let c=0;c<maxCols;c++){
      const label=CLEAN(row[c]);
      if(keyByLabel[label])group.push({c,key:keyByLabel[label]});
    }
    if(!group.length)continue;
    const mapping={name:-1};
    for(let c=0;c<maxCols;c++)if(CLEAN(row[c])==='氏名')mapping.name=c;
    for(let i=0;i<group.length;i++){
      const g=group[i],end=group[i+1]?.c??maxCols;
      for(let c=g.c;c<Math.min(end,g.c+6);c++){
        if(CLEAN(next[c]).includes('偏差値')){mapping[g.key]=c;break;}
      }
    }
    const count=Object.keys(mapping).filter(k=>k!=='name').length;
    const points=count*10+(mapping.name>=0?5:0);
    if(!best||points>best.points)best={points,headerRow:ri+1,mapping};
  }
  if(!best)return previousGuessMapping(rows,maxCols);
  // The display's 総合 is calculated per student from the appropriate Excel field.
  best.mapping.total=-1;
  return best;
};
function elementaryScoresFromRow(row,mapping){
  const scores={};
  const from=(key)=>{
    const idx=mapping[key];
    if(idx==null||idx<0)return null;
    const raw=row[idx];
    if(raw==null||String(raw).trim()==='')return null;
    return num(raw);
  };
  for(const [k] of ELEMENTARY_FIELDS)if(k!=='total')scores[k]=from(k);
  scores.threeFour=from('threeFour');
  scores.totalRaw=from('totalRaw');
  const count=['ja','ma','sc','so'].filter(k=>scores[k]!=null).length;
  scores.total=count===4?scores.totalRaw:count===3?scores.threeFour:count===2?scores.two:null;
  return scores;
}
const previousPreviewRows=previewRows;
previewRows=function(rows,mapping,headerRow){
  if(!mapping||!Object.prototype.hasOwnProperty.call(mapping,'totalRaw'))return previousPreviewRows(rows,mapping,headerRow);
  const result=[];
  for(let i=headerRow+1;i<rows.length;i++){
    const row=rows[i]||[],name=String(row[mapping.name]??'').trim();
    if(!name||name==='氏名'||name==='合計'||name==='平均')continue;
    const scores=elementaryScoresFromRow(row,mapping);
    if(ELEMENTARY_FIELDS.every(([k])=>scores[k]==null))continue;
    result.push({name,scores,excelRow:i+1});
  }
  return result;
};
const previousValidateBatchDraft=validateBatchDraft;
validateBatchDraft=function(d){
  if(!isElementaryGrade(d.meta?.grade))return previousValidateBatchDraft(d);
  if(d.error)return d.error;
  const m=d.mapping;
  if(m.name==null||m.name<0)return '氏名の列を指定してください。';
  if(!['ja','ma','sc','so','two','three','threeFour','totalRaw'].some(k=>m[k]>=0))return '偏差値の列が見つかりません。';
  const indices=Object.entries(m).filter(([k,v])=>k!=='total'&&v>=0).map(([k,v])=>v);
  if(new Set(indices).size!==indices.length)return '複数の項目に同じ列が指定されています。';
  d.people=previewRows(d.sheet.rows,m,d.headerRow);
  if(!d.people.length)return '偏差値が存在する生徒が見つかりません。';
  if(!d.meta.name?.trim()||d.meta.name.includes('模試名を確認してください'))return '模試名を確認・入力してください。';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d.meta.date))return '実施日を確認してください。';
  const names=new Set();
  for(const p of d.people){const key=norm(p.name);if(names.has(key))return '同名の生徒がいます：'+p.name;names.add(key);}
  return '';
};
function elementaryTableColumns(rows){
  return ELEMENTARY_FIELDS.filter(([k])=>rows.some(x=>x.score?.[k]!=null));
}
const previousChartMarkup=chartMarkup;
chartMarkup=function(student,mode,reportFiltered=false){
  if(!isElementaryGrade(student.grade))return previousChartMarkup(student,mode,reportFiltered);
  const rows=scoresOf(student.id,reportFiltered?reportExamIds():null);
  const possible=mode==='total'?ELEMENTARY_FIELDS.slice(4):ELEMENTARY_FIELDS.slice(0,4);
  const series=possible.filter(([k])=>rows.some(r=>r.score?.[k]!=null));
  return '<div class="chart-box"><h3>'+(mode==='total'?'2教科・3教科・総合偏差値の推移':'教科別偏差値の推移')+'</h3>'+svgChart(rows,series)+'</div>';
};
function elementaryTable(rows,cssClass){
  const cols=elementaryTableColumns(rows);
  return '<table class="'+cssClass+'"><thead><tr><th>実施日</th><th>模試</th>'+cols.map(x=>'<th>'+x[1]+'</th>').join('')+'</tr></thead><tbody>'+
   rows.map(r=>'<tr><td>'+escapeHTML(r.exam.date)+'</td><td>'+escapeHTML(r.exam.name)+'</td>'+cols.map(x=>'<td>'+(r.score?.[x[0]]==null?'—':fmt(r.score[x[0]]))+'</td>').join('')+'</tr>').join('')+
   '</tbody></table>';
}
const previousPaperMarkup=paperMarkup;
paperMarkup=function(student){
  if(!isElementaryGrade(student.grade))return previousPaperMarkup(student);
  const rows=scoresOf(student.id,reportExamIds());
  const valid=rows.filter(r=>r.score?.total!=null);
  const last=valid.at(-1)?.score.total??null;
  const prev=valid.at(-2)?.score.total??null;
  const difference=last!=null&&prev!=null?last-prev:null;
  const period=rows.length?rows[0].exam.date+' ～ '+rows.at(-1).exam.date:'—';
  const comment=state.comments[student.id]||'';
  return '<article class="report-paper"><div class="paper-head"><div><h2>模試個人成績表</h2><p>氏名：'+escapeHTML(student.name)+'　｜　学年：'+escapeHTML(student.grade)+'　｜　対象期間：'+escapeHTML(period)+'</p></div><div class="paper-kpi"><span>最新の総合偏差値<br><strong>'+fmt(last)+'</strong></span><span>前回差<br><strong>'+delta(difference)+'</strong></span></div></div>'+
    '<div class="chart-pair">'+chartMarkup(student,'subjects',true)+chartMarkup(student,'total',true)+'</div>'+
    '<div><strong style="font-size:11px;display:block;margin-bottom:5px">偏差値一覧</strong>'+elementaryTable(rows,'paper-table')+'</div>'+
    (state.settings.commentMode?'<div class="paper-comment"><strong>講師コメント</strong><div style="margin-top:3px">'+(escapeHTML(comment)||'　')+'</div></div>':'')+
    '<div class="footer-note">※ 総合偏差値は受験科目数に応じてExcelの2教科・3/4教科・総合を使用しています。未受験回はグラフの線をつなぎません。</div></article>';
};
const previousRenderDetail=renderDetail;
renderDetail=function(){
  const stu=state.students.find(s=>s.id===currentStudent);
  if(!stu||!isElementaryGrade(stu.grade))return previousRenderDetail();
  const sum=summary(stu),rows=scoresOf(stu.id);
  return '<div class="controls spread" style="margin-bottom:16px"><button class="btn" data-go="students">← 生徒一覧に戻る</button><button class="btn primary" data-detailreport="'+escapeHTML(stu.id)+'">この生徒の成績表を作成</button></div>'+
    '<div class="summary-grid"><div class="metric"><span class="caption">生徒名</span><strong>'+escapeHTML(stu.name)+'</strong></div><div class="metric"><span class="caption">最新総合偏差値</span><strong>'+fmt(sum.last)+'</strong></div><div class="metric"><span class="caption">前回差</span><strong>'+delta(sum.difference)+'</strong></div></div>'+
    section('全期間の偏差値推移','<div class="chart-pair">'+chartMarkup(stu,'subjects')+chartMarkup(stu,'total')+'</div>')+
    section('偏差値一覧','<div class="table-wrap">'+elementaryTable(rows,'data-table')+'</div>')+
    section('講師コメント','<div class="form-group"><label for="commentEditor">成績表に掲載するコメント</label><textarea class="field" id="commentEditor" placeholder="コメントを入力すると自動保存されます。">'+escapeHTML(state.comments[stu.id]||'')+'</textarea></div><span class="sheet-status">内容はブラウザ内に保存されます。</span>');
};
