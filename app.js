
'use strict';
const $ = (id)=>document.getElementById(id);

const KEY_LAST = 'rp_last_v16';
const KEY_HIST = 'rp_hist_v16';

let state = null;
let timerInt = null;

const SEED_LOW = ["家", "猫", "犬", "水", "火", "木", "山", "川", "海", "空", "雨", "雪", "風", "春", "夏", "秋", "冬", "朝", "昼", "夜", "駅", "道", "橋", "本", "紙", "机", "椅子", "窓", "鍵", "袋", "靴", "服", "茶", "米", "塩", "砂糖", "皿", "箸", "鍋", "時計", "電話", "写真", "映画", "音楽", "公園", "病院", "会社", "学校", "駅前", "信号", "切符", "財布", "名刺", "郵便", "天気", "予定", "会議", "資料", "品質", "安全", "納期", "予算", "仕様", "図面", "部品", "工程", "工場", "設備"];

const SEED_MID = ["確認", "調整", "改善", "共有", "提案", "依頼", "報告", "連絡", "相談", "検討", "分析", "評価", "仮説", "要因", "根拠", "工程管理", "品質管理", "リスク", "課題", "対応", "合意", "方針", "優先度", "効率", "最適化", "自動化", "運用", "計画", "見積", "契約", "交渉", "要件", "設計", "実装", "検証", "監視", "保守", "予測", "需要", "供給", "電力", "価格", "市場", "入札", "落札", "実績", "指標", "KPI", "収益", "費用", "原価", "利益", "配分", "請求", "精算"];

const SEED_HIGH = ["抽象化", "再現性", "整合性", "因果関係", "前提条件", "トレードオフ", "意思決定", "最適解", "妥当性", "信頼性", "帰納推論", "演繹推論", "体系化", "概念設計", "制約条件", "境界条件", "不確実性", "感度分析", "ロバスト性", "制度設計", "インセンティブ", "ガバナンス", "コンプライアンス", "ステークホルダー", "アラインメント", "需給調整", "周波数制御", "調整力", "ベースライン", "アグリゲーション", "分散最適", "統計的推定", "シミュレーション", "期待値", "分散", "確率分布", "ベイズ更新", "目的関数", "ラグランジュ", "最適制御", "双対性", "漸近性"];

const SEED_ABS = ["意味", "価値", "目的", "本質", "概念", "抽象", "具体", "原因", "結果", "関係", "構造", "機能", "制度", "規範", "倫理", "自由", "責任", "信頼", "不安", "安心", "希望", "恐れ", "幸福", "成長", "学習", "理解", "記憶", "注意", "集中", "習慣", "効用", "利益", "損失", "選択", "戦略", "戦術", "優先", "判断", "推論", "認知", "直感", "創造", "秩序", "混沌", "多様性", "公平", "効率", "透明性", "一貫性", "妥協", "対立", "合意", "影響", "制約", "余力", "限界", "余裕", "複雑性", "不確実性"];


function nowIso(){
  const d=new Date();
  const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function shuffle(a){
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function uniq(a){
  const s=new Set(); const out=[];
  for(const x of a){ if(!s.has(x)){s.add(x); out.push(x);} }
  return out;
}

function expandTo(target, seeds){
  // 可能な範囲で「実在っぽい」複合語を生成して水増し（端末内・外部通信なし）
  const suffixes=['化','性','力','度','感','量','率','性質','条件','構造','体系','基準','方針','戦略','要素','指標','計画'];
  const prefixes=['再','超','準','新','高','低','多','少','反','逆','同','異','非'];
  const out = [...seeds];
  let i=0;
  while(out.length < target){
    const base = seeds[i % seeds.length];
    const sfx = suffixes[(i*7) % suffixes.length];
    const pfx = prefixes[(i*11) % prefixes.length];
    // 3パターン混ぜる
    const cand = (i%3===0) ? (base + sfx) : (i%3===1 ? (pfx + base) : (pfx + base + sfx));
    out.push(cand);
    i++;
    if(i>500000) break;
  }
  return uniq(out).slice(0,target);
}

const POOL_LOW  = expandTo(3500, SEED_LOW);
const POOL_MID  = expandTo(3500, SEED_MID);
const POOL_HIGH = expandTo(3500, SEED_HIGH);
const POOL_ABS  = expandTo(3500, SEED_ABS);

// 合計「10,000語相当」の候補（重複排除）
// 低/中/高/抽象は別プールで管理
// ※厳密に1万"実単語"ではなく「練習用語彙（複合語含む）」として10k規模を確保
const TOTAL_VOCAB_SIZE = uniq([...POOL_LOW, ...POOL_MID, ...POOL_HIGH, ...POOL_ABS]).length;

function basePool(level){
  if(level==='low') return POOL_LOW;
  if(level==='high') return POOL_HIGH;
  return POOL_MID;
}

function makePairs(pairCount, level, absMix){
  const needed = pairCount*2;
  const base = basePool(level).slice();
  const abs = POOL_ABS.slice();
  shuffle(base); shuffle(abs);

  const mix = Number(absMix||0);
  let absCount = Math.floor(needed*mix);
  if(absCount > abs.length) absCount = abs.length;
  let baseCount = needed - absCount;
  if(baseCount > base.length) baseCount = base.length;

  const picked = base.slice(0, baseCount).concat(abs.slice(0, absCount));
  // 足りなければベース/抽象から補充
  let bi=baseCount, ai=absCount;
  while(picked.length < needed){
    if(bi < base.length) picked.push(base[bi++]);
    else if(ai < abs.length) picked.push(abs[ai++]);
    else break;
  }
  shuffle(picked);

  const pairs=[];
  for(let i=0;i<pairCount;i++) pairs.push({l:picked[i*2], r:picked[i*2+1]});
  return pairs;
}

function pad2(n){ return String(n).padStart(2,'0'); }
function setTimerLabel(remain){
  const m=Math.floor(remain/60), s=remain%60;
  $('timerLabel').textContent = `${pad2(m)}:${pad2(s)}`;
}
function stopTimer(){ if(timerInt){clearInterval(timerInt); timerInt=null;} }
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

function go(screen){
  for(const id of ['setup','memorize','recall','result']) $(id).hidden=(id!==screen);
}

function escapeHtml(s){
  return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;');
}
function norm(s){ return String(s??'').trim().replace(/\s+/g,'').toLowerCase(); }

function renderMemorize(){
  const d = state.difficultyLabel;
  const m = state.absMixLabel;
  $('memoInfo').textContent = `ペア数:${state.pairCount} / 記憶:${state.seconds}秒 / 難易度:${d} / 抽象:${m}（語彙規模: 約 ${TOTAL_VOCAB_SIZE.toLocaleString()} ）`;
  const box=$('memoList'); box.innerHTML='';
  state.pairs.forEach((p,i)=>{
    box.insertAdjacentHTML('beforeend', `
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
    const val=state.answers[i] ?? '';
    box.insertAdjacentHTML('beforeend', `
      <div class="item">
        <div class="head"><span class="num">#${i+1}</span><span class="left">${escapeHtml(p.l)}</span></div>
        <input type="text" inputmode="text" autocomplete="off" spellcheck="false"
               data-i="${i}" value="${escapeHtml(val)}" placeholder="右の単語を入力">
      </div>
    `);
  });
  box.oninput=(e)=>{
    const t=e.target;
    if(t && t.matches('input[data-i]')){
      const i=Number(t.dataset.i);
      state.answers[i]=t.value;
      saveLast();
    }
  };
}

function score(){
  let correct=0;
  const rows=[];
  state.pairs.forEach((p,i)=>{
    const input=(state.answers[i] ?? '').trim();
    const ok=norm(input)===norm(p.r);
    if(ok) correct++;
    rows.push({i:i+1,left:p.l,input,right:p.r,ok});
  });
  return {correct,total:state.pairCount,pct:Math.round(correct/state.pairCount*100),rows};
}

function renderResult(){
  const sc=score();
  $('scorePct').textContent = `${sc.pct}%`;
  $('scoreCount').textContent = `${sc.correct}/${sc.total}`;
  const box=$('resultList'); box.innerHTML='';
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
  state.lastScore = sc;
  saveLast();
}

function labelDifficulty(v){ return v==='low'?'低':(v==='high'?'高':'中'); }
function labelAbsMix(v){ const n=Number(v||0); return n?`${Math.round(n*100)}%`:'OFF'; }

function startFlow(fromResume=false){
  const pairCount=Number($('pairCount').value);
  const seconds=Number($('time').value);
  const difficulty=$('difficulty').value;
  const absMix=Number($('absMix').value||0);

  state = {
    when: nowIso(),
    pairCount, seconds, difficulty, absMix,
    difficultyLabel: labelDifficulty(difficulty),
    absMixLabel: labelAbsMix(absMix),
    pairs: makePairs(pairCount, difficulty, absMix),
    answers: Array(pairCount).fill(''),
    phase: 'memorize'
  };

  saveLast();
  go('memorize');
  renderMemorize();
  startTimer(seconds, ()=>{
    state.phase='recall';
    saveLast();
    go('recall');
    renderRecall();
  });
}

function saveLast(){
  try{ localStorage.setItem(KEY_LAST, JSON.stringify(state)); }catch{}
}
function loadLast(){
  try{ return JSON.parse(localStorage.getItem(KEY_LAST)||'null'); }catch{ return null; }
}
function clearLast(){ localStorage.removeItem(KEY_LAST); }

function loadHist(){
  try{ return JSON.parse(localStorage.getItem(KEY_HIST)||'[]'); }catch{ return []; }
}
function saveHist(h){ localStorage.setItem(KEY_HIST, JSON.stringify(h.slice(0,50))); }

function renderHistory(){
  const h=loadHist();
  const box=$('history');
  box.innerHTML='';
  if(h.length===0){
    box.innerHTML = '<div class="muted">履歴はまだありません</div>';
    return;
  }
  h.forEach((x,idx)=>{
    box.insertAdjacentHTML('beforeend', `
      <div class="item">
        <div class="histRow">
          <div class="histScore">${x.pct}% (${x.correct}/${x.total})</div>
          <div class="muted small">${escapeHtml(x.when)}</div>
        </div>
        <div class="histMeta">
          <span>ペア:${x.pairCount}</span>
          <span>秒:${x.seconds}</span>
          <span>難易度:${escapeHtml(x.difficultyLabel)}</span>
          <span>抽象:${escapeHtml(x.absMixLabel)}</span>
        </div>
      </div>
    `);
  });
}

function applyStateToSetup(s){
  $('pairCount').value=String(s.pairCount);
  $('time').value=String(s.seconds);
  $('difficulty').value=s.difficulty;
  $('absMix').value=String(s.absMix);
}

function resume(){
  const s=loadLast();
  if(!s){ alert('再開できるセッションがありません'); return; }
  state=s;
  applyStateToSetup(s);
  if(s.phase==='memorize'){
    go('memorize'); renderMemorize();
    // 再開時はタイマーはリセット（簡潔に）
    startTimer(state.seconds, ()=>{ state.phase='recall'; saveLast(); go('recall'); renderRecall(); });
  }else if(s.phase==='recall'){
    go('recall'); renderRecall();
  }else{
    go('result'); renderResult();
  }
}

// wire
$('start').onclick = ()=> startFlow();
$('resume').onclick = ()=> resume();

$('toRecall').onclick = ()=>{ stopTimer(); state.phase='recall'; saveLast(); go('recall'); renderRecall(); };
$('backToSetup1').onclick = ()=>{ stopTimer(); go('setup'); };
$('backToSetup2').onclick = ()=>{ go('setup'); };

$('check').onclick = ()=>{ state.phase='result'; saveLast(); go('result'); renderResult(); };

$('retry').onclick = ()=>{
  // 同条件で新規問題
  $('pairCount').value=String(state.pairCount);
  $('time').value=String(state.seconds);
  $('difficulty').value=state.difficulty;
  $('absMix').value=String(state.absMix);
  startFlow();
};

$('finish').onclick = ()=>{
  // 履歴保存
  const sc = state.lastScore || score();
  const h = loadHist();
  h.unshift({
    when: state.when,
    pairCount: state.pairCount,
    seconds: state.seconds,
    difficultyLabel: state.difficultyLabel,
    absMixLabel: state.absMixLabel,
    correct: sc.correct,
    total: sc.total,
    pct: sc.pct
  });
  saveHist(h);
  clearLast();
  renderHistory();
  go('setup');
};

$('clearHistory').onclick = ()=>{
  if(!confirm('履歴を削除しますか？')) return;
  saveHist([]);
  renderHistory();
};

// init
renderHistory();
go('setup');

// minimal SW
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
