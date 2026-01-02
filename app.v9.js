
"use strict";

/** helpers **/
const $ = (id)=>document.getElementById(id);
const show = (id)=>$(id).hidden=false;
const hide = (id)=>$(id).hidden=true;

function nowIso(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
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
function formatMix(v){
  if (v === true) v = 0.2;
  if (v === false || v == null) v = 0;
  const n = Number(v);
  if (!n) return "OFF";
  return `${Math.round(n*100)}%`;
}

/** storage **/
const KEY_HISTORY="recall_pairs_history_v1";
const KEY_LAST="recall_pairs_last_session_v1";

function loadHistory(){
  try{ return JSON.parse(localStorage.getItem(KEY_HISTORY)||"[]"); }catch{ return []; }
}
function saveHistory(h){ localStorage.setItem(KEY_HISTORY, JSON.stringify(h.slice(0,200))); }
function saveLastSession(s){ localStorage.setItem(KEY_LAST, JSON.stringify(s)); }
function loadLastSession(){ try{ return JSON.parse(localStorage.getItem(KEY_LAST)||"null"); }catch{ return null; } }

/** word loading **/
async function loadWordFile(path){
  const r=await fetch(path, {cache:"no-store"});
  const t=await r.text();
  return uniq(t.split(/\r?\n/).map(x=>x.trim()).filter(Boolean));
}
let WORDS=null;
async function ensureWords(){
  if(WORDS) return WORDS;
  const [low,mid,high,abs] = await Promise.all([
    loadWordFile("words_low.txt"),
    loadWordFile("words_mid.txt"),
    loadWordFile("words_high.txt"),
    loadWordFile("words_abs.txt"),
  ]);
  WORDS={low,mid,high,abs};
  return WORDS;
}

function basePool(words, level){
  if(level==="low") return words.low;
  if(level==="high") return words.high;
  return words.mid;
}

function makePairs(words, level, pairCount, mixAbsRatio){
  const needed = pairCount*2;
  const base = basePool(words, level).slice();
  const abs = words.abs.slice();

  shuffle(base);
  shuffle(abs);

  let absCount = Math.floor(needed * (mixAbsRatio||0));
  if(absCount > abs.length) absCount = abs.length;
  const baseCount = needed - absCount;

  const picked = base.slice(0, Math.min(baseCount, base.length)).concat(abs.slice(0, absCount));
  // If base was too short (shouldn't happen), top up from abs
  while(picked.length < needed && abs.length > picked.length){
    picked.push(abs[picked.length]);
  }
  shuffle(picked);

  const pairs=[];
  for(let i=0;i<pairCount;i++){
    pairs.push({ left: picked[i*2], right: picked[i*2+1] });
  }
  return pairs;
}

/** timer **/
let timerInt=null;
function startTimer(seconds, onDone){
  stopTimer();
  let remain=seconds;
  const tick=()=>{
    const m=String(Math.floor(remain/60)).padStart(2,"0");
    const s=String(remain%60).padStart(2,"0");
    $("timerLabel").textContent = `${m}:${s}`;
    if(remain<=0){
      stopTimer();
      onDone && onDone();
      return;
    }
    remain--;
  };
  tick();
  timerInt=setInterval(tick,1000);
}
function stopTimer(){ if(timerInt){ clearInterval(timerInt); timerInt=null; } }

/** UI rendering **/
function goScreen(screen){
  // screens: setupCard, memorizeCard, recallCard, resultCard
  for(const id of ["setupCard","memorizeCard","recallCard","resultCard"]){
    if($(id)) $(id).hidden = (id!==screen);
  }
}

function renderHistory(){
  const hist = loadHistory();
  const body = $("historyBody");
  if(!body) return;
  body.innerHTML="";
  if(hist.length===0){
    body.innerHTML = `<tr><td colspan="6" class="muted">履歴はまだありません</td></tr>`;
    return;
  }
  for(const h of hist){
    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td class="dim">${h.when}</td>
      <td>${h.levelLabel}</td>
      <td class="dim">${h.pairCount}</td>
      <td class="dim">${h.memorizeSeconds}s</td>
      <td class="dim">${formatMix(h.mixAbs)}</td>
      <td><b>${h.scorePct}%</b> (${h.correct}/${h.total})</td>
    `;
    body.appendChild(tr);
  }
}

function setupUI(){
  // fill selects if not present
  renderHistory();
  $("startBtn").onclick = async ()=>{
    const pairCount = Number($("pairCount").value);
    const memorizeSeconds = Number($("memorizeSeconds").value);
    const level = $("difficulty").value; // low/mid/high
    const mixAbs = Number($("mixAbstract").value || "0");
    const words = await ensureWords();
    const pairs = makePairs(words, level, pairCount, mixAbs);

    const s = {
      phase:"memorize",
      when: nowIso(),
      pairCount,
      memorizeSeconds,
      level,
      mixAbs,
      pairs,
      answers: Array(pairCount).fill(""),
    };
    saveLastSession(s);
    showMemorize(s);
  };

  $("resumeBtn").onclick = ()=>{
    const s = loadLastSession();
    if(!s){ alert("再開できるセッションがありません"); return; }
    if(s.phase==="memorize") showMemorize(s);
    else if(s.phase==="recall") showRecall(s);
    else showResult(s);
  };

  $("clearHistoryBtn").onclick = ()=>{
    if(!confirm("履歴を削除しますか？")) return;
    saveHistory([]);
    renderHistory();
  };
}

function showMemorize(s){
  goScreen("memorizeCard");
  $("memorizeInfo").textContent = `ペア数: ${s.pairCount} / 難易度: ${labelLevel(s.level)} / 抽象: ${formatMix(s.mixAbs)}`;
  const tbody=$("memorizeTable");
  tbody.innerHTML="";
  s.pairs.forEach((p,i)=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `<td class="dim">${i+1}</td><td>${p.left}</td><td>${p.right}</td>`;
    tbody.appendChild(tr);
  });

  $("toRecallBtn").onclick = ()=>{
    s.phase="recall";
    saveLastSession(s);
    showRecall(s);
  };

  startTimer(s.memorizeSeconds, ()=>{
    // auto switch to recall
    s.phase="recall";
    saveLastSession(s);
    showRecall(s);
  });
}

function collectAnswers(pairCount){
  const arr=Array(pairCount).fill("");
  const inputs = Array.from(document.querySelectorAll("#recallTable input[data-idx]"));
  for(const inp of inputs){
    const i=Number(inp.dataset.idx);
    arr[i]=(inp.value||"").trim();
  }
  return arr;
}

function showRecall(s){
  stopTimer();
  goScreen("recallCard");
  $("recallInfo").textContent = `左の単語を見て、右の単語を思い出してください（難易度: ${labelLevel(s.level)} / 抽象: ${formatMix(s.mixAbs)}）`;

  const tbody=$("recallTable");
  tbody.innerHTML="";
  for(let i=0;i<s.pairCount;i++){
    const p=s.pairs[i];
    const tr=document.createElement("tr");
    const val = (s.answers && s.answers[i]) ? s.answers[i] : "";
    tr.innerHTML = `
      <td class="dim">${i+1}</td>
      <td>${p.left}</td>
      <td>
        <div class="input-wrap">
          <input type="text" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" data-idx="${i}" value="${escapeHtml(val)}" placeholder="ここに入力">
          <div class="reveal" data-idx="${i}" hidden></div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  $("showAnswersBtn").onclick = ()=>{
    if(!confirm("答えを表示しますか？（想起トレとしては非推奨）")) return;
    const answersNow = collectAnswers(s.pairCount);
    const reveals = Array.from(document.querySelectorAll("#recallTable .reveal"));
    reveals.forEach(div=>{
      const i=Number(div.dataset.idx);
      div.textContent = `正解：${s.pairs[i].right}（あなた：${answersNow[i]||""}）`;
      div.hidden=false;
    });
  };

  $("backToSetupBtn").onclick = ()=>{
    // save current answers
    s.answers = collectAnswers(s.pairCount);
    saveLastSession(s);
    stopTimer();
    goScreen("setupCard");
    renderHistory();
  };

  $("checkBtn").onclick = ()=>{
    s.answers = collectAnswers(s.pairCount);
    s.phase="result";
    saveLastSession(s);
    showResult(s);
  };
}

function labelLevel(level){
  if(level==="low") return "低";
  if(level==="high") return "高";
  return "中";
}
function escapeHtml(s){
  return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function scoreSession(s){
  const rows=[];
  let correct=0;
  for(let i=0;i<s.pairCount;i++){
    const left = s.pairs[i].left;
    const right = s.pairs[i].right;
    const input = (s.answers && s.answers[i]) ? s.answers[i].trim() : "";
    const ok = normalize(input) === normalize(right);
    if(ok) correct++;
    rows.push({idx:i+1,left,right,input,ok});
  }
  const total=s.pairCount;
  const pct = Math.round((correct/total)*100);
  return {rows, correct, total, pct};
}
function normalize(s){
  return String(s||"").trim()
    .replaceAll(/\s+/g,"")
    .toLowerCase();
}

function showResult(s){
  stopTimer();
  goScreen("resultCard");

  const sc = scoreSession(s);
  $("scoreMain").textContent = `${sc.pct}%`;
  $("scoreSub").textContent = `${sc.correct}/${sc.total} 正解`;

  // Fill table in the exact order requested:
  // ペア（左） | あなたの回答 | 正解 | 判定
  const tbody=$("reviewTable");
  tbody.innerHTML="";
  sc.rows.forEach(r=>{
    const tr=document.createElement("tr");
    tr.className = r.ok ? "ok-row" : "ng-row";
    tr.innerHTML = `
      <td class="dim">${r.idx}</td>
      <td>${escapeHtml(r.left)}</td>
      <td>${escapeHtml(r.input)}</td>
      <td>${escapeHtml(r.right)}</td>
      <td class="${r.ok?"ok":"ng"}">${r.ok?"○":"×"}</td>
    `;
    tbody.appendChild(tr);
  });

  $("retryBtn").onclick = ()=>{
    // reuse settings but new pairs
    (async ()=>{
      const words = await ensureWords();
      s.when = nowIso();
      s.phase="memorize";
      s.pairs = makePairs(words, s.level, s.pairCount, s.mixAbs);
      s.answers = Array(s.pairCount).fill("");
      saveLastSession(s);
      showMemorize(s);
    })();
  };

  $("resultToSetupBtn").onclick = ()=>{
    // save to history
    const hist = loadHistory();
    hist.unshift({
      when: s.when,
      levelLabel: labelLevel(s.level),
      pairCount: s.pairCount,
      memorizeSeconds: s.memorizeSeconds,
      mixAbs: s.mixAbs,
      correct: sc.correct,
      total: sc.total,
      scorePct: sc.pct,
    });
    saveHistory(hist);
    saveLastSession(null);
    goScreen("setupCard");
    renderHistory();
  };
}

/** boot **/
window.addEventListener("load", ()=>{
  // show version in console
  console.log("recall-pairs-pwa v9 loaded");
  setupUI();
  goScreen("setupCard");
});
