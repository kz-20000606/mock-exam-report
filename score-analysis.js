'use strict';
/* Read-only local exam trend analysis. All comparisons use saved deviation values
 * from the active year/grade, never grade students by a single score level. */
(() => {
  const RISE=5,RAPID=8,SWING=12;
  let subject=null,series=null,category='all',selectedId=null,query='',sort='priority';
  const labels={
    rapidDown:'直近急落',down:'直近下降',sustainedDown:'継続下降',
    rapidUp:'直近大幅上昇',up:'直近上昇',sustainedUp:'継続上昇',
    unstable:'変動が大きい'
  };
  const categories=[
    ['all','すべて'],['rapidDown','直近急落'],['down','直近下降'],
    ['sustainedDown','継続下降'],['rapidUp','直近大幅上昇'],
    ['up','直近上昇'],['sustainedUp','継続上昇'],['unstable','乱高下']
  ];
  const fmtDiff=n=>n==null?'—':(n>0?'+':'')+Number(n).toFixed(1);
  const nameOf=e=>String(e?.name||'').normalize('NFKC')
    .replace(/第\s*\d+\s*回/g,'').replace(/\(?\d{4}[-\/年]\d{1,2}.*?\)?/g,'')
    .replace(/[\s　_＿\-‐－]+/g,'').trim()||'名称未設定';
  const showNameOf=key=>key==='__all__'?'全模試（比較は同一系列内）':key;
  const compatibleFields=()=>isElementaryGrade(activeWorkspace.split(':')[1])?ELEMENTARY_FIELDS:SUBJECTS;
  function groups(){
    const map=new Map();
    for(const exam of exams()){
      const key=nameOf(exam);
      if(!map.has(key))map.set(key,[]);
      map.get(key).push(exam);
    }
    return [...map.entries()].sort((a,b)=>
      String(b[1].at(-1)?.date||'').localeCompare(String(a[1].at(-1)?.date||'')));
  }
  function ensureSelected(){
    const fields=compatibleFields();
    if(!fields.some(([key])=>key===subject))subject=fields[0]?.[0]||'total';
    const matches=groups();
    if(!matches.some(([key])=>key===series))series=matches[0]?.[0]||'';
  }
  function scoreNumber(row,key){
    const value=row?.score?.[key];
    return value===null||value===undefined||!Number.isFinite(Number(value))?null:Number(value);
  }
  function analyzeSeries(student,key,group){
    const all=scoresOf(student.id,new Set(group.map(e=>e.id)));
    // Only a consecutive pair of exam rounds counts as a 'recent change'.
    const values=all.map(row=>scoreNumber(row,key));
    const latest=values.at(-1)??null,previous=values.at(-2)??null;
    const subjectCounts=key==='total'&&isElementaryGrade(activeWorkspace.split(':')[1])
      ?all.map(r=>['ja','ma','sc','so'].filter(k=>scoreNumber(r,k)!=null).length):null;
    const comparable=(i,j)=>!subjectCounts||(subjectCounts[i]>=2&&subjectCounts[i]===subjectCounts[j]);
    const recent=latest!=null&&previous!=null&&comparable(values.length-2,values.length-1)?latest-previous:null;
    const available=values.filter(v=>v!=null);
    const flags=[],reasons=[];
    const add=(flag,text)=>{flags.push(flag);reasons.push(text)};
    const recentReason=recent==null?'':('前回 '+previous.toFixed(1)+' → 今回 '+latest.toFixed(1)+'（'+fmtDiff(recent)+'）');
    if(recent!=null){
      if(recent<=-RAPID)add('rapidDown','直近急落：'+recentReason);
      else if(recent<=-RISE)add('down','直近下降：'+recentReason);
      if(recent>=RAPID)add('rapidUp','直近大幅上昇：'+recentReason);
      else if(recent>=RISE)add('up','直近上昇：'+recentReason);
    }
    const last4=values.slice(-4);
    const last3=values.slice(-4); // 4 results are necessary for three successive moves.
    if(last3.length===4&&last3.every(v=>v!=null)&&
      (!subjectCounts||subjectCounts.slice(-4).every(n=>n>=2&&n===subjectCounts.at(-1)))){
      const steps=last3.slice(1).map((v,i)=>v-last3[i]);
      const total=last3[3]-last3[0];
      if(steps.every(x=>x<0)&&total<=-5)
        add('sustainedDown','3回連続下降：'+fmtDiff(total)+'（'+last3[0].toFixed(1)+' → '+last3[3].toFixed(1)+'）');
      if(steps.every(x=>x>0)&&total>=5)
        add('sustainedUp','3回連続上昇：'+fmtDiff(total)+'（'+last3[0].toFixed(1)+' → '+last3[3].toFixed(1)+'）');
    }
    if(last4.length===4&&last4.every(v=>v!=null)&&
      (!subjectCounts||subjectCounts.slice(-4).every(n=>n>=2&&n===subjectCounts.at(-1)))){
      const span=Math.max(...last4)-Math.min(...last4);
      if(span>=SWING)add('unstable','直近4回の最大・最小差 '+span.toFixed(1));
    }
    return {student,series:key,all,values,latest,previous,recent,flags,reasons,
      hasData:available.length>=2,available:available.length};
  }
  function matchesAnalysis(row){
    return category==='all'||row.flags.includes(category);
  }
  function entries(){
    ensureSelected();
    const selectedGroup=groups().find(([key])=>key===series);
    if(!selectedGroup)return [];
    return state.students.map(stu=>analyzeSeries(stu,subject,selectedGroup[1]));
  }
  function priority(row){
    if(row.flags.includes('rapidDown'))return 0;
    if(row.flags.includes('sustainedDown'))return 1;
    if(row.flags.includes('down'))return 2;
    if(row.flags.includes('rapidUp'))return 3;
    if(row.flags.includes('sustainedUp'))return 4;
    if(row.flags.includes('up'))return 5;
    if(row.flags.includes('unstable'))return 6;
    return 7;
  }
  function filtered(rows){
    const result=rows.filter(row=>row.hasData&&matchesAnalysis(row)&&norm(row.student.name).includes(norm(query)));
    result.sort((a,b)=>{
      if(sort==='rise')return (b.recent??-Infinity)-(a.recent??-Infinity)||a.student.name.localeCompare(b.student.name,'ja');
      if(sort==='drop')return (a.recent??Infinity)-(b.recent??Infinity)||a.student.name.localeCompare(b.student.name,'ja');
      if(sort==='name')return a.student.name.localeCompare(b.student.name,'ja');
      return priority(a)-priority(b)||(a.recent??0)-(b.recent??0)||a.student.name.localeCompare(b.student.name,'ja');
    });
    return result;
  }
  const opt=(val,label,chosen)=>'<option value="'+escapeHTML(val)+'" '+(val===chosen?'selected':'')+'>'+escapeHTML(label)+'</option>';
  function badge(flag){
    const positive=flag==='rapidUp'||flag==='up'||flag==='sustainedUp';
    const danger=flag==='rapidDown'||flag==='down'||flag==='sustainedDown';
    return '<span class="analysis-tag '+(positive?'is-up':danger?'is-down':'is-neutral')+'">'+escapeHTML(labels[flag]||flag)+'</span>';
  }
  function linesFor(row){
    if(!row)return '<p class="muted">生徒を選択してください。</p>';
    const subjectName=compatibleFields().find(([k])=>k===subject)?.[1]||subject;
    const chart=svgChart(row.all,[[subject,subjectName]]);
    return '<div class="analysis-detail-top"><h3>'+escapeHTML(row.student.name)+'</h3><span>'+escapeHTML(subjectName)+' ／ '+escapeHTML(showNameOf(row.series))+'</span></div>'+
      '<div class="analysis-kpis"><div>最新偏差値<strong>'+fmt(row.latest)+'</strong></div><div>直近前回差<strong class="'+(row.recent<0?'is-drop':row.recent>0?'is-rise':'')+'">'+fmtDiff(row.recent)+'</strong></div><div>有効データ<strong>'+row.available+'回</strong></div></div>'+
      '<div class="analysis-chart">'+chart+'</div>'+
      '<div class="analysis-explanations"><strong>判定理由</strong>'+(
        row.reasons.length?row.reasons.map(r=>'<p>'+escapeHTML(r)+'</p>').join(''):
        '<p>設定された抽出条件に該当する大きな変化はありません。</p>'
      )+'</div>'+
      '<div class="table-wrap"><table class="data-table analysis-history"><thead><tr><th>模試</th><th>実施日</th><th>点数</th><th>偏差値</th><th>前回差</th></tr></thead><tbody>'+
      row.all.map((r,i)=>{
        const v=row.values[i],prev=i?row.values[i-1]:null;
        const diff=v!=null&&prev!=null?v-prev:null;
        const point=r.score?.points?.[subject];
        return '<tr><td>'+escapeHTML(r.exam.name)+'</td><td>'+escapeHTML(r.exam.date)+'</td><td>'+(point==null?'—':escapeHTML(point))+'</td><td>'+fmt(v)+'</td><td>'+fmtDiff(diff)+'</td></tr>';
      }).join('')+'</tbody></table></div>'+
      '<p class="muted tiny">※ 模試間の変化は確認のきっかけです。指導上の判断は授業・学習状況と併せて行ってください。</p>';
  }
  function view(){
    ensureSelected();
    const rows=entries(),matches=filtered(rows);
    if(!matches.some(r=>r.student.id===selectedId))selectedId=matches[0]?.student.id||null;
    const chosen=matches.find(r=>r.student.id===selectedId);
    const [year,grade]=activeWorkspace.split(':');
    const counts=Object.fromEntries(categories.map(([k])=>[k,rows.filter(r=>r.hasData&&(k==='all'||r.flags.includes(k))).length]));
    const cats=categories.map(([key,label])=>
      '<button class="analysis-category '+(category===key?'selected':'')+'" data-analysis-category="'+key+'"><span>'+label+'</span><strong>'+counts[key]+'名</strong></button>').join('');
    return '<div class="analysis-view">'+
      '<div class="analysis-intro"><strong>偏差値の変化から生徒を抽出</strong><p>上昇・下降・乱高下を同じ画面で確認できます。'+escapeHTML(year)+'年度・'+escapeHTML(grade)+'の登録済み模試を対象にしています。</p></div>'+
      '<div class="analysis-controls"><label>分析科目<select id="analysisSubject" class="field">'+compatibleFields().map(([k,l])=>opt(k,l,subject)).join('')+'</select></label>'+
      '<label>模試シリーズ<select id="analysisSeries" class="field">'+(groups().length?groups().map(([k])=>opt(k,k,series)).join(''):opt('','模試が未登録',''))+'</select></label>'+
      '<label>表示順<select id="analysisSort" class="field">'+[['priority','確認優先度順'],['rise','直近上昇幅が大きい順'],['drop','直近下降幅が大きい順'],['name','氏名順']].map(([k,l])=>opt(k,l,sort)).join('')+'</select></label></div>'+
      '<div class="analysis-category-grid">'+cats+'</div>'+
      '<div class="analysis-layout">'+
      '<aside class="analysis-roster"><div class="analysis-roster-top"><strong>該当生徒</strong><span>'+matches.length+'名</span></div>'+
      '<input id="analysisSearch" class="field" type="search" placeholder="氏名で絞り込み" value="'+escapeHTML(query)+'">'+
      '<div class="analysis-roster-list">'+(matches.length?matches.map(row=>
        '<button class="analysis-person '+(selectedId===row.student.id?'active':'')+'" data-analysis-student="'+escapeHTML(row.student.id)+'" type="button"><span class="analysis-person-name">'+escapeHTML(row.student.name)+'</span>'+
        '<span class="analysis-person-delta '+(row.recent==null?'':row.recent<0?'is-drop':row.recent>0?'is-rise':'')+'">'+fmtDiff(row.recent)+'</span><small>'+row.flags.map(flag=>labels[flag]).join('・')+'</small></button>').join(''):
        '<p class="muted">この条件に該当する生徒はいません。</p>')+'</div></aside>'+
      '<section class="analysis-details"><div class="analysis-detail-heading"><strong>分析詳細</strong><div class="analysis-navigator"><button id="analysisPrev" class="btn small" type="button">← 前へ</button><span id="analysisPosition">'+(chosen?matches.indexOf(chosen)+1:0)+' / '+matches.length+'名</span><button id="analysisNext" class="btn small" type="button">次へ →</button></div></div>'+
      '<div id="analysisDetailsContent">'+linesFor(chosen)+'</div></section>'+
      '</div><p class="muted tiny">判定基準：直近 ±5以上／急変 ±8以上／3回連続上昇・下降（計5以上）／直近4回の変動幅12以上。同じ模試シリーズ内の連続する回を比較します。未受験は0点とみなさず、小学生の総合偏差値は受験科目数が異なる回を比較しません。</p></div>';
  }
  function navigate(step){
    const list=filtered(entries()),idx=list.findIndex(r=>r.student.id===selectedId);
    const row=list[idx+step];
    if(row)selectStudent(row.student.id);
  }
  function selectStudent(id){
    const list=filtered(entries()),row=list.find(x=>x.student.id===id);
    if(!row)return;
    selectedId=id;
    const panel=document.getElementById('analysisDetailsContent');
    if(panel)panel.innerHTML=linesFor(row);
    document.querySelectorAll('[data-analysis-student]').forEach(button=>
      button.classList.toggle('active',button.dataset.analysisStudent===id));
    const counter=document.getElementById('analysisPosition');
    if(counter)counter.textContent=(list.indexOf(row)+1)+' / '+list.length+'名';
    const prev=document.getElementById('analysisPrev'),next=document.getElementById('analysisNext');
    if(prev)prev.disabled=list.indexOf(row)===0;
    if(next)next.disabled=list.indexOf(row)===list.length-1;
  }
  function bind(){
    const subjectInput=document.getElementById('analysisSubject');
    if(subjectInput)subjectInput.onchange=()=>{subject=subjectInput.value;selectedId=null;render()};
    const seriesInput=document.getElementById('analysisSeries');
    if(seriesInput)seriesInput.onchange=()=>{series=seriesInput.value;selectedId=null;render()};
    const sortInput=document.getElementById('analysisSort');
    if(sortInput)sortInput.onchange=()=>{sort=sortInput.value;selectedId=null;render()};
    const search=document.getElementById('analysisSearch');
    if(search)search.oninput=()=>{
      query=search.value;const pos=search.selectionStart;render();
      const next=document.getElementById('analysisSearch');
      if(next){next.focus();next.setSelectionRange(pos,pos);}
    };
    document.querySelectorAll('[data-analysis-category]').forEach(button=>
      button.onclick=()=>{category=button.dataset.analysisCategory;selectedId=null;render()});
    document.querySelectorAll('[data-analysis-student]').forEach(button=>
      button.onclick=()=>selectStudent(button.dataset.analysisStudent));
    const prev=document.getElementById('analysisPrev'),next=document.getElementById('analysisNext');
    if(prev)prev.onclick=()=>navigate(-1);
    if(next)next.onclick=()=>navigate(1);
    if(selectedId)selectStudent(selectedId);
    else{if(prev)prev.disabled=true;if(next)next.disabled=true;}
  }
  const previousRender=render;
  render=function(){
    if(route!=='analysis')return previousRender();
    header('成績分析','上昇・下降・急変の自動抽出と科目別の推移確認');
    document.getElementById('appView').innerHTML=view();
    bind();
  };
  document.addEventListener('keydown',event=>{
    if(route!=='analysis'||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey)return;
    if(event.target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
      event.preventDefault();navigate(event.key==='ArrowLeft'?-1:1);
    }
  });
})();
