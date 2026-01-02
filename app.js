
'use strict';
const $ = (id)=>document.getElementById(id);

let state = null; // {pairCount, seconds, pairs:[{l,r}], answers:[]}
let timerInt = null;

function genPairs(n){
  // まずは固定ダミー（Cで辞書化する）
  const base = Array.from({length: 400}, (_,i)=>'単語'+(i+1));
  const pairs=[];
  for(let i=0;i<n;i++){
    pairs.push({ l: base[i*2], r: base[i*2+1] });
  }
  return pairs;
}

function pad2(n){ return String(n).padStart(2,'0'); }
function setTimerLabel(remain){
  const m = Math.floor(remain/60);
  const s = remain%60;
  $('timerLabel').textContent = `${pad2(m)}:${pad2(s)}`;
}
function stopTimer(){
  if(timerInt){ clearInterval(timerInt); timerInt=null; }
}
function startTimer(seconds, onDone){
  stopTimer();
  let remain = seconds;
  setTimerLabel(remain);
  timerInt = setInterval(()=>{
    remain--;
    setTimerLabel(Math.max(0,remain));
    if(remain<=0){
      stopTimer();
      onDone && onDone();
    }
  }, 1000);
}

function go(screen){
  for(const id of ['setup','memorize','recall','result']){
    $(id).hidden = (id!==screen);
  }
}

function renderMemorize(){
  $('memoInfo').textContent = `ペア数: ${state.pairCount} / 記憶時間: ${state.seconds}秒（時間切れで自動的に想起へ）`;
  const box = $('memoList');
  box.innerHTML = '';
  state.pairs.forEach((p,i)=>{
    box.insertAdjacentHTML('beforeend', `
      <div class="item">
        <div class="head"><span class="num">#${i+1}</span><span class="left">${p.l}</span></div>
        <div class="small">→ ${p.r}</div>
      </div>
    `);
  });
}

function renderRecall(){
  const box = $('recallList');
  box.innerHTML = '';
  state.pairs.forEach((p,i)=>{
    const val = state.answers[i] ?? '';
    box.insertAdjacentHTML('beforeend', `
      <div class="item">
        <div class="head"><span class="num">#${i+1}</span><span class="left">${p.l}</span></div>
        <input type="text" inputmode="text" autocomplete="off" spellcheck="false"
               data-i="${i}" value="${escapeHtml(val)}" placeholder="右の単語を入力">
      </div>
    `);
  });

  // 入力を自動保存（イベント委任）
  box.oninput = (e)=>{
    const t = e.target;
    if(t && t.matches('input[data-i]')){
      const i = Number(t.dataset.i);
      state.answers[i] = t.value;
    }
  };
}

function escapeHtml(s){
  return String(s??'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;');
}

function norm(s){
  return String(s??'').trim().replace(/\s+/g,'').toLowerCase();
}

function score(){
  let correct=0;
  const rows=[];
  state.pairs.forEach((p,i)=>{
    const input = (state.answers[i] ?? '').trim();
    const ok = norm(input) === norm(p.r);
    if(ok) correct++;
    rows.push({i:i+1, left:p.l, input, right:p.r, ok});
  });
  return {correct, total: state.pairCount, pct: Math.round(correct/state.pairCount*100), rows};
}

function renderResult(){
  const sc = score();
  $('scorePct').textContent = `${sc.pct}%`;
  $('scoreCount').textContent = `${sc.correct}/${sc.total}`;

  const box = $('resultList');
  box.innerHTML = '';
  sc.rows.forEach(r=>{
    box.insertAdjacentHTML('beforeend', `
      <div class="item ${r.ok?'okRow':'ngRow'}">
        <div class="head">
          <span class="num">#${r.i}</span>
          <span class="left">${escapeHtml(r.left)}</span>
          <span class="${r.ok?'badgeOk':'badgeNg'}">${r.ok?'○':'×'}</span>
        </div>
        <div class="small">あなた：${escapeHtml(r.input)}</div>
        <div class="small">正解：${escapeHtml(r.right)}</div>
      </div>
    `);
  });
}

function startFlow(){
  const pairCount = Number($('pairCount').value);
  const seconds = Number($('time').value);

  state = {
    pairCount,
    seconds,
    pairs: genPairs(pairCount),
    answers: Array(pairCount).fill('')
  };

  go('memorize');
  renderMemorize();
  startTimer(seconds, ()=>{
    go('recall');
    renderRecall();
  });
}

// wire
$('start').onclick = ()=> startFlow();

$('toRecall').onclick = ()=>{
  stopTimer();
  go('recall');
  renderRecall();
};

$('backToSetup1').onclick = ()=>{
  stopTimer();
  go('setup');
};

$('backToSetup2').onclick = ()=>{
  go('setup');
};

$('check').onclick = ()=>{
  go('result');
  renderResult();
};

$('retry').onclick = ()=>{
  // 同条件で新規問題
  $('pairCount').value = String(state.pairCount);
  $('time').value = String(state.seconds);
  startFlow();
};

$('finish').onclick = ()=>{
  go('setup');
};

// service worker (最低限)
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
