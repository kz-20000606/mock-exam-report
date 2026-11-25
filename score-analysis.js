'use strict';
/* Read-only local exam trend analysis. All comparisons use saved deviation values
 * from the active year/grade, never grade students by a single score level. */
(() => {
  const SETTINGS_KEY='mock-exam-analysis-thresholds-v1';
  const defaults=Object.freeze({up:5,rapidUp:8,down:5,rapidDown:8,sustained:5,swing:12});
  const settingLabels=[
    ['up','直近上昇'],['rapidUp','直近大幅上昇'],
    ['down','直近下降'],['rapidDown','直近急落'],
    ['sustained','継続上昇・下降（合計）'],['swing','乱高下（最大・最小差）']
  ];
  function loadThresholds(){
    try{
      const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');
      if(!saved||typeof saved!=='object'||Array.isArray(saved))return {...defaults};
      const values={...defaults};
      for(const key of Object.keys(defaults)){
        const number=Number(saved[key]);
        if(saved[key]!==null&&saved[key]!==undefined&&Number.isFinite(number)&&number>0&&number<=50)
          values[key]=number;
      }
      if(values.rapidUp<values.up)values.rapidUp=values.up;
      if(values.rapidDown<values.down)values.rapidDown=values.down;
      return values;
    }catch(_){return {...defaults};}
  }
  let thresholds=loadThresholds(),settingsOpen=false;
  let subject=null,series=null,category='all',selectedId=null,query='',sort='auto';
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
      if(recent<=-thresholds.rapidDown)add('rapidDown','直近急落：'+recentReason);
      if(recent<=-thresholds.down)add('down','直近下降：'+recentReason);
      if(recent>=thresholds.rapidUp)add('rapidUp','直近大幅上昇：'+recentReason);
      if(recent>=thresholds.up)add('up','直近上昇：'+recentReason);
    }
    // 継続上昇・下降: 直近3回の模試（2区間）が同方向で、合計5以上。
    // 4回以上の連続上昇・下降も、この直近3回の判定に含まれる。
    const last4=values.slice(-4);
    const last3=values.slice(-3);
    const last3Compatible=!subjectCounts||subjectCounts.slice(-3).every(n=>n>=2&&n===subjectCounts.at(-1));
    if(last3.length===3&&last3.every(v=>v!=null)&&last3Compatible){
      const steps=last3.slice(1).map((v,i)=>v-last3[i]);
      const total=last3[2]-last3[0];
      if(steps.every(x=>x<0)&&total<=-thresholds.sustained)
        add('sustainedDown','直近3回の模試で連続下降：'+fmtDiff(total)+'（'+last3[0].toFixed(1)+' → '+last3[2].toFixed(1)+'）');
      if(steps.every(x=>x>0)&&total>=thresholds.sustained)
        add('sustainedUp','直近3回の模試で連続上昇：'+fmtDiff(total)+'（'+last3[0].toFixed(1)+' → '+last3[2].toFixed(1)+'）');
    }
    if(last4.length===4&&last4.every(v=>v!=null)&&
      (!subjectCounts||subjectCounts.slice(-4).every(n=>n>=2&&n===subjectCounts.at(-1)))){
      const span=Math.max(...last4)-Math.min(...last4);
      const steps=last4.slice(1).map((v,i)=>v-last4[i]);
      const changedDirection=steps.some(v=>v>0)&&steps.some(v=>v<0);
      if(span>=thresholds.swing&&changedDirection)add('unstable','上昇と下降を繰り返し、直近4回の最大・最小差 '+span.toFixed(1));
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
  // Automatic ordering follows the selected classification rather than the
  // global warning priority; manual sorting remains available at any time.
  const defaultSortForCategory=()=>({
    rapidDown:'drop',down:'drop',sustainedDown:'sustainedDrop',
    rapidUp:'rise',up:'rise',sustainedUp:'sustainedRise',
    unstable:'swing'
  })[category]||'priority';
  const recentTotal=row=>{
    const v=row.values.slice(-3);
    return v.length===3&&v.every(n=>n!=null)?v[2]-v[0]:null;
  };
  const recentSwing=row=>{
    const v=row.values.slice(-4);
    return v.length===4&&v.every(n=>n!=null)?Math.max(...v)-Math.min(...v):null;
  };
  const compareMissingLast=(a,b,direction)=>{
    if(a==null)return b==null?0:1;
    if(b==null)return -1;
    return direction*(a-b);
  };
  function filtered(rows){
    const result=rows.filter(row=>row.hasData&&matchesAnalysis(row)&&norm(row.student.name).includes(norm(query)));
    const effectiveSort=sort==='auto'?defaultSortForCategory():sort;
    result.sort((a,b)=>{
      let comparison=0;
      if(effectiveSort==='rise')comparison=compareMissingLast(a.recent,b.recent,-1);
      else if(effectiveSort==='drop')comparison=compareMissingLast(a.recent,b.recent,1);
      else if(effectiveSort==='sustainedRise')comparison=compareMissingLast(recentTotal(a),recentTotal(b),-1);
      else if(effectiveSort==='sustainedDrop')comparison=compareMissingLast(recentTotal(a),recentTotal(b),1);
      else if(effectiveSort==='swing')comparison=compareMissingLast(recentSwing(a),recentSwing(b),-1);
      else if(effectiveSort==='priority')comparison=priority(a)-priority(b)||(a.recent??0)-(b.recent??0);
      return comparison||a.student.name.localeCompare(b.student.name,'ja');
    });
    return result;
  }
  function updateThreshold(key,raw){
    if(!Object.prototype.hasOwnProperty.call(defaults,key))return false;
    const value=Number(raw);
    if(!Number.isFinite(value)||value<=0||value>50||Math.round(value*10)!==value*10){
      toast('判定基準は0より大きく50以下、0.1刻みの数値で入力してください。','error');
      return false;
    }
    const next={...thresholds,[key]:value};
    if(next.rapidUp<next.up||next.rapidDown<next.down){
      toast('大幅上昇・急落の基準は、通常の上昇・下降の基準以上にしてください。','error');
      return false;
    }
    thresholds=next;
    try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(thresholds));}
    catch(_){toast('判定基準をブラウザに保存できませんでした。','error');}
    return true;
  }
  function thresholdControls(){
    return '<details id="analysisThresholdPanel" class="analysis-threshold-panel" '+(settingsOpen?'open':'')+'>'+
      '<summary>判定基準を調整 <span>偏差値の変化幅を変更</span></summary>'+
      '<div class="analysis-threshold-body"><p class="muted tiny">変更すると抽出人数と判定理由をすぐに再計算します。設定はこのブラウザ内に保存され、すべての学年・科目の分析に共通で適用されます。</p>'+
      '<div class="analysis-threshold-grid">'+settingLabels.map(([key,label])=>
        '<label>'+label+'<div class="analysis-threshold-field"><input class="field" type="number" min="0.1" max="50" step="0.1" data-threshold="'+key+'" value="'+thresholds[key]+'"><span>以上</span></div></label>'
      ).join('')+'</div>'+
      '<div class="analysis-threshold-actions"><button class="btn small" id="analysisResetThresholds" type="button">初期値に戻す</button>'+
      '<span class="muted tiny">大幅上昇・急落の基準は通常の基準以上に設定してください。</span></div>'+
      '</div></details>';
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
      '<label>表示順<select id="analysisSort" class="field">'+[['auto','分類に合わせて自動'],['priority','確認優先度順'],['rise','直近上昇幅が大きい順'],['drop','直近下降幅が大きい順'],['sustainedRise','継続上昇幅が大きい順'],['sustainedDrop','継続下降幅が大きい順'],['swing','変動幅が大きい順'],['name','氏名順']].map(([k,l])=>opt(k,l,sort)).join('')+'</select></label></div>'+
      thresholdControls()+
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
      '</div><p class="muted tiny">判定基準：直近上昇 +'+thresholds.up+'以上・大幅上昇 +'+thresholds.rapidUp+'以上／直近下降 −'+thresholds.down+'以上・急落 −'+thresholds.rapidDown+'以上／直近3回の模試で連続上昇・下降（合計'+thresholds.sustained+'以上）／直近4回の変動幅'+thresholds.swing+'以上かつ上昇・下降が混在。同じ模試シリーズ内の連続する回を比較します。未受験は0点とみなさず、小学生の総合偏差値は受験科目数が異なる回を比較しません。</p></div>';
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
    const thresholdPanel=document.getElementById('analysisThresholdPanel');
    if(thresholdPanel)thresholdPanel.addEventListener('toggle',()=>{settingsOpen=thresholdPanel.open;});
    document.querySelectorAll('[data-threshold]').forEach(input=>{
      input.onchange=()=>{
        settingsOpen=true;
        if(updateThreshold(input.dataset.threshold,input.value))render();
        else input.value=thresholds[input.dataset.threshold];
      };
    });
    const reset=document.getElementById('analysisResetThresholds');
    if(reset)reset.onclick=()=>{
      thresholds={...defaults};settingsOpen=true;
      try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(thresholds));}
      catch(_){toast('判定基準をブラウザに保存できませんでした。','error');}
      render();
    };
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
      button.onclick=()=>{category=button.dataset.analysisCategory;sort='auto';selectedId=null;render()});
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
    // This route overrides the normal renderer, so the shared workspace
    // selectors must be mounted explicitly for the analysis screen.
    refreshWorkspaceControls();
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
