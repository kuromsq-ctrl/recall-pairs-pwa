
"use strict";

const $ = (id)=>document.getElementById(id);

const KEY_HISTORY="rp_history_v10";
const KEY_LAST="rp_last_v10";

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
  const n = Number(v||0);
  if(!n) return "OFF";
  return `${Math.round(n*100)}%`;
}

function saveJSON(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function loadJSON(k,def){
  try{ const v=localStorage.getItem(k); return v?JSON.parse(v):def; }catch{ return def; }
}

function go(screen){
  for(const id of ["setupCard","memorizeCard","recallCard","resultCard"]){
    $(id).hidden = (id!==screen);
  }
}

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

function makePairs(words, level, pairCount, mixRatio){
  const needed = pairCount*2;
  const base = basePool(words, level).slice();
  const abs = words.abs.slice();
  shuffle(base); shuffle(abs);

  let absCount = Math.floor(needed * (Number(mixRatio)||0));
  if(absCount > abs.length) absCount = abs.length;
  const baseCount = needed - absCount;

  const picked = base.slice(0, Math.min(baseCount, base.length)).concat(abs.slice(0, absCount));
  while(picked.length < needed && picked.length < abs.length){
    picked.push(abs[picked.length]);
  }
  shuffle(picked);

  const pairs=[];
  for(let i=0;i<pairCount;i++){
    pairs.push({left:picked[i*2], right:picked[i*2+1]});
  }
  return pairs;
}

let timerInt=null;
function stopTimer(){ if(timerInt){ clearInterval(timerInt); timerInt=null; } }
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

function labelLevel(level){
  if(level==="low") return "低";
  if(level==="high") return "高";
  return "中";
}

function esc(s){
  return String(s??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function renderHistory(){
  const hist = loadJSON(KEY_HISTORY, []);
  const body = $("historyBody");
  body.innerHTML="";
  if(hist.length===0){
    body.innerHTML = `<tr><td colspan="6" class="muted">履歴はまだありません</td></tr>`;
    return;
  }
  for(const h of hist){
    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td class="dim">${esc(h.when)}</td>
      <td>${esc(h.levelLabel)}</td>
      <td class="dim">${h.pairCount}</td>
      <td class="dim">${h.memorizeSeconds}s</td>
      <td class="dim">${esc(h.mixLabel)}</td>
      <td><b>${h.scorePct}%</b> (${h.correct}/${h.total})</td>
    `;
    body.appendChild(tr);
  }
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

function normalize(s){
  return String(s||"").trim().replaceAll(/\s+/g,"").toLowerCase();
}

function scoreSession(s){
  const rows=[];
  let correct=0;
  for(let i=0;i<s.pairCount;i++){
    const left=s.pairs[i].left;
    const right=s.pairs[i].right;
    const input=(s.answers?.[i]||"").trim();
    const ok = normalize(input)===normalize(right);
    if(ok) correct++;
    rows.push({idx:i+1,left,right,input,ok});
  }
  const total=s.pairCount;
  const pct=Math.round((correct/total)*100);
  return {rows,correct,total,pct};
}

function showMemorize(s){
  go("memorizeCard");
  $("memorizeInfo").textContent = `ペア数:${s.pairCount} / 難易度:${labelLevel(s.level)} / 抽象:${formatMix(s.mixAbs)}`;

  const tb=$("memorizeTable");
  tb.innerHTML="";
  s.pairs.forEach((p,i)=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `<td class="dim">${i+1}</td><td>${esc(p.left)}</td><td>${esc(p.right)}</td>`;
    tb.appendChild(tr);
  });

  $("toRecallBtn").onclick=()=>{
    s.phase="recall";
    saveJSON(KEY_LAST,s);
    showRecall(s);
  };

  startTimer(s.memorizeSeconds, ()=>{
    s.phase="recall";
    saveJSON(KEY_LAST,s);
    showRecall(s);
  });
}

function showRecall(s){
  stopTimer();
  go("recallCard");
  $("recallInfo").textContent = `左の単語を見て右の単語を思い出してください（難易度:${labelLevel(s.level)} / 抽象:${formatMix(s.mixAbs)}）`;

  const tb=$("recallTable");
  tb.innerHTML="";
  for(let i=0;i<s.pairCount;i++){
    const p=s.pairs[i];
    const val = s.answers?.[i] || "";
    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td class="dim">${i+1}</td>
      <td>${esc(p.left)}</td>
      <td>
        <div class="input-wrap">
          <input type="text" data-idx="${i}" value="${esc(val)}" placeholder="ここに入力" />
          <div class="reveal" data-idx="${i}" hidden></div>
        </div>
      </td>
    `;
    tb.appendChild(tr);
  }

  $("showAnswersBtn").onclick=()=>{
    if(!confirm("答えを表示しますか？（想起トレとしては非推奨）")) return;
    const answersNow = collectAnswers(s.pairCount);
    const reveals = Array.from(document.querySelectorAll("#recallTable .reveal"));
    reveals.forEach(div=>{
      const i=Number(div.dataset.idx);
      div.textContent = `正解：${s.pairs[i].right}（あなた：${answersNow[i]||""}）`;
      div.hidden=false;
    });
  };

  $("checkBtn").onclick=()=>{
    s.answers = collectAnswers(s.pairCount);
    s.phase="result";
    saveJSON(KEY_LAST,s);
    showResult(s);
  };

  $("backBtn").onclick=()=>{
    s.answers = collectAnswers(s.pairCount);
    saveJSON(KEY_LAST,s);
    go("setupCard");
    renderHistory();
  };
}

function showResult(s){
  go("resultCard");
  const sc=scoreSession(s);
  $("scoreMain").textContent = `${sc.pct}%`;
  $("scoreSub").textContent = `${sc.correct}/${sc.total} 正解`;

  // EXACT ORDER: ペア｜あなた｜正解｜判定
  const tb=$("reviewTable");
  tb.innerHTML="";
  sc.rows.forEach(r=>{
    const tr=document.createElement("tr");
    tr.className = r.ok ? "ok-row" : "ng-row";
    tr.innerHTML = `
      <td class="dim">${r.idx}</td>
      <td>${esc(r.left)}</td>
      <td>${esc(r.input)}</td>
      <td>${esc(r.right)}</td>
      <td class="${r.ok?"ok":"ng"}">${r.ok?"○":"×"}</td>
    `;
    tb.appendChild(tr);
  });

  $("retryBtn").onclick = async ()=>{
    const words = await ensureWords();
    s.when = nowIso();
    s.phase="memorize";
    s.pairs = makePairs(words, s.level, s.pairCount, s.mixAbs);
    s.answers = Array(s.pairCount).fill("");
    saveJSON(KEY_LAST,s);
    showMemorize(s);
  };

  $("finishBtn").onclick = ()=>{
    const hist=loadJSON(KEY_HISTORY, []);
    hist.unshift({
      when:s.when,
      levelLabel:labelLevel(s.level),
      pairCount:s.pairCount,
      memorizeSeconds:s.memorizeSeconds,
      mixLabel:formatMix(s.mixAbs),
      correct:sc.correct,
      total:sc.total,
      scorePct:sc.pct
    });
    saveJSON(KEY_HISTORY, hist.slice(0,200));
    saveJSON(KEY_LAST, null);
    go("setupCard");
    renderHistory();
  };
}

async function startNew(){
  const pairCount = Number($("pairCount").value);
  const memorizeSeconds = Number($("memorizeSeconds").value);
  const level = $("difficulty").value;
  const mixAbs = Number($("mixAbstract").value || "0");

  const words = await ensureWords();
  const pairs = makePairs(words, level, pairCount, mixAbs);

  const s={
    phase:"memorize",
    when:nowIso(),
    pairCount,
    memorizeSeconds,
    level,
    mixAbs,
    pairs,
    answers:Array(pairCount).fill("")
  };
  saveJSON(KEY_LAST,s);
  showMemorize(s);
}

function resume(){
  const s=loadJSON(KEY_LAST, null);
  if(!s){ alert("再開できるセッションがありません"); return; }
  if(s.phase==="memorize") showMemorize(s);
  else if(s.phase==="recall") showRecall(s);
  else showResult(s);
}

window.addEventListener("load", ()=>{
  $("startBtn").onclick=startNew;
  $("resumeBtn").onclick=resume;
  $("clearHistoryBtn").onclick=()=>{
    if(!confirm("履歴を削除しますか？")) return;
    saveJSON(KEY_HISTORY, []);
    renderHistory();
  };
  renderHistory();
  go("setupCard");
  console.log("Recall Pairs v10 loaded");
});
