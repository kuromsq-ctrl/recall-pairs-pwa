'use strict';
const $ = (id)=>document.getElementById(id);

const KEY_LAST = 'rp_last_v23';
const KEY_HIST = 'rp_hist_v23';

let state = null;
let timerInt = null;

/* ===== utility ===== */
function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function uniq(a){
  const s=new Set(); const out=[];
  for(const x of a){ if(!s.has(x)){ s.add(x); out.push(x); } }
  return out;
}
function nowIso(){
  const d=new Date(); const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function escapeHtml(s){
  return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;');
}
function norm(s){ return String(s??'').trim().replace(/\s+/g,'').toLowerCase(); }

/* ===== timer ===== */
function pad2(n){ return String(n).padStart(2,'0'); }
function setTimerLabel(remain){
  const m=Math.floor(remain/60), s=remain%60;
  $('timerLabel').textContent = `${pad2(m)}:${pad2(s)}`;
}
function stopTimer(){ if(timerInt){ clearInterval(timerInt); timerInt=null; } }
function startTimer(seconds,onDone){
  stopTimer();
  let remain=seconds;
  setTimerLabel(remain);
  timerInt=setInterval(()=>{
    remain--;
    setTimerLabel(Math.max(0,remain));
    if(remain<=0){ stopTimer(); onDone && onDone(); }
  },1000);
}

/* ===== navigation ===== */
function go(screen){
  ['setup','memorize','recall','result'].forEach(id=>{
    $(id).hidden = (id!==screen);
  });
}

/* ===== word lists (required) ===== */
let WORDS = { daily:null, business:null, abstract:null };

async function loadWordFile(fname){
  const res = await fetch(fname,{cache:'no-store'});
  if(!res.ok) throw new Error(`failed to load ${fname}`);
  const text = await res.text();
  return uniq(text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean));
}

async function ensureWordLists(){
  $('subtitle').textContent = '語彙を読み込み中…';
  try{
    const [d,b,a] = await Promise.all([
      loadWordFile('words_daily.txt'),
      loadWordFile('words_business.txt'),
      loadWordFile('words_abstract.txt'),
    ]);
    WORDS.daily=d; WORDS.business=b; WORDS.abstract=a;
    $('subtitle').textContent = `語彙: ${(d.length+b.length+a.length).toLocaleString()}語`;
    return true;
  }catch(e){
    $('subtitle').textContent = '語彙の読み込みに失敗しました';
    alert('words_*.txt を読み込めませんでした。ファイル名と配置を確認してください。');
    console.error(e);
    return false;
  }
}

function basePool(level){
  if(level==='low') return WORDS.daily;
  if(level==='high') return WORDS.abstract;
  return WORDS.business;
}

function makePairs(pairCount, level, absMix){
  const needed = pairCount*2;
  const base = basePool(level).slice();
  const abs  = WORDS.abstract.slice();
  shuffle(base); shuffle(abs);

  const mix = Number(absMix||0);
  let absCount = Math.floor(needed*mix);
  absCount = Math.min(absCount, abs.length);
  let baseCount = needed - absCount;
  baseCount = Math.min(baseCount, base.length);

  const picked = base.slice(0,baseCount).concat(abs.slice(0,absCount));
  shuffle(picked);

  const pairs=[];
  for(let i=0;i<pairCount;i++){
    pairs.push({l:picked[i*2], r:picked[i*2+1]});
  }
  return pairs;
}

/* ===== render ===== */
function renderMemorize(){
  const sec = state.round===2 ? state.seconds2 : state.seconds1;
  $('memoInfo').textContent = `ラウンド:${state.round} / 記憶:${sec}秒`;
  const box=$('memoList'); box.innerHTML='';
  state.pairs.forEach((p,i)=>{
    box.insertAdjacentHTML('beforeend',`
      <div class="item">
        <div class="head"><span class="num">#${i+1}</span><span class="left">${escapeHtml(p.l)}</span></div>
        <div class="small">→ ${escapeHtml(p.r)}</div>
      </div>
    `);
  });
}

function renderRecall(){
  const box=$('recallList'); box.innerHTML='';
  state.pairs.forEach((p,i)=>{
    const answers = state.round===2 ? state.answers2 : state.answers1;
    box.insertAdjacentHTML('beforeend',`
      <div class="item">
        <div class="head"><span class="num">#${i+1}</span><span class="left">${escapeHtml(p.l)}</span></div>
        <input data-i="${i}" value="${escapeHtml(answers[i]||'')}" placeholder="右の単語を入力">
      </div>
    `);
  });
  box.oninput=e=>{
    const t=e.target;
    if(t.dataset.i!=null){
      const i=Number(t.dataset.i);
      const answers = state.round===2 ? state.answers2 : state.answers1;
      answers[i]=t.value;
    }
  };
}

function score(){
  const answers = state.round===2 ? state.answers2 : state.answers1;
  let correct=0;
  const rows=[];
  state.pairs.forEach((p,i)=>{
    const ok = norm(answers[i])===norm(p.r);
    if(ok) correct++;
    rows.push({i:i+1,left:p.l,input:answers[i]||'',right:p.r,ok});
  });
  return {correct,total:state.pairCount,pct:Math.round(correct/state.pairCount*100),rows};
}

function renderResult(){
  const sc = state.lastScore;
  $('scorePct').textContent = `${sc.pct}%`;
  $('scoreCount').textContent = `${sc.correct}/${sc.total}`;
  const box=$('resultList'); box.innerHTML='';
  sc.rows.forEach(r=>{
    box.insertAdjacentHTML('beforeend',`
      <div class="item ${r.ok?'okRow':'ngRow'}">
        <div class="head"><span class="num">#${r.i}</span><span class="left">${escapeHtml(r.left)}</span></div>
        <div class="small">あなた：${escapeHtml(r.input)}</div>
        <div class="small">正解：${escapeHtml(r.right)}</div>
      </div>
    `);
  });
}

/* ===== flow ===== */
async function startFlow(){
  const ok = await ensureWordLists();
  if(!ok) return;

  const pairCount=Number($('pairCount').value);
  const seconds1=Number($('time').value);
  const seconds2El=$('time2');
  const seconds2=seconds2El?Number(seconds2El.value):seconds1;
  const difficulty=$('difficulty').value;
  const absMix=Number($('absMix').value||0);

  state={
    when:nowIso(),
    pairCount,seconds1,seconds2,difficulty,absMix,
    round:1,
    pairs:makePairs(pairCount,difficulty,absMix),
    answers1:Array(pairCount).fill(''),
    answers2:Array(pairCount).fill(''),
    phase:'memorize'
  };

  go('memorize'); renderMemorize();
  startTimer(state.seconds1,()=>{
    state.phase='recall';
    go('recall'); renderRecall();
  });
}

/* ===== wiring ===== */
$('start').onclick=()=>startFlow();
$('check').onclick=()=>{
  state.lastScore=score();
  go('result'); renderResult();
};
$('finish').onclick=()=>{
  if(state.round===1){
    state.round=2;
    go('memorize'); renderMemorize();
    startTimer(state.seconds2,()=>{
      state.phase='recall';
      go('recall'); renderRecall();
    });
  }else{
    go('setup');
  }
};

/* ===== init ===== */
go('setup');

/* ===== register NEW service worker ===== */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw_v23.js').catch(()=>{});
}
