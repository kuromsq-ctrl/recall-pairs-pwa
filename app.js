// 想起トレ（単語ペア） v2
const LS={customWords:"recall_custom_words_v1",history:"recall_history_v2",lastSession:"recall_last_session_v2"};
const WORD_FILES={low:"./words_low.txt",mid:"./words_mid.txt",high:"./words_high.txt",abs:"./words_abs.txt"};
const $=(id)=>document.getElementById(id);
let deferredPrompt=null;

window.addEventListener("beforeinstallprompt",(e)=>{e.preventDefault();deferredPrompt=e;const btn=$("installBtn");btn.hidden=false;btn.addEventListener("click",async()=>{btn.hidden=true;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;},{once:true});});
if("serviceWorker"in navigator){window.addEventListener("load",()=>{navigator.serviceWorker.register("./sw.js").catch(()=>{});});}

const shuffle=(arr)=>{const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const normalize=(s)=>(s??"").toString().trim().replace(/\s+/g,"");
const nowIso=()=>{const d=new Date();const p=(n)=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;};

function formatMix(v){
  // v: number ratio (0, 0.2, 0.35, 0.5) or legacy boolean
  if (v === true) v = 0.2;
  if (v === false || v == null) v = 0;
  const n = Number(v);
  if (!n) return "OFF";
  return `${Math.round(n*100)}%`;
}


function loadCustomWords(){const raw=localStorage.getItem(LS.customWords);if(!raw)return[];try{const a=JSON.parse(raw);return Array.isArray(a)?a.filter(Boolean):[];}catch{return[];}}
function saveCustomWords(words){localStorage.setItem(LS.customWords,JSON.stringify(words));}

async function loadWordList(path){
  const res=await fetch(path,{cache:"force-cache"});
  if(!res.ok) throw new Error(`単語ファイルが見つかりません: ${path}`);
  const text=await res.text();
  return text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
}
function pickUnique(pool,count){
  let w=[];
  if(pool.length>=count){w=shuffle(pool).slice(0,count);}
  else{while(w.length<count){w=w.concat(shuffle(pool));}w=w.slice(0,count);}
  return w;
}
function pairsFromWords(words,pairCount){
  const pairs=[];
  for(let i=0;i<pairCount;i++){pairs.push({left:words[i*2],right:words[i*2+1]});}
  return pairs;
}
function getWordPoolSource(){return $("wordSource").value;} // files|custom

async function makePairs(pairCount,diff,mixAbs){
  const needed=pairCount*2;

  if(getWordPoolSource()==="custom"){
    const pool=loadCustomWords();
    if(pool.length<30) throw new Error("自分の単語リストが少なすぎます（30語以上推奨）。");
    const words=pickUnique(pool,needed);
    return pairsFromWords(words,pairCount);
  }

  const base=await loadWordList(WORD_FILES[diff]??WORD_FILES.low);

  if(!mixAbs){
    const words=pickUnique(base,needed);
    return pairsFromWords(words,pairCount);
  }

  const abs=await loadWordList(WORD_FILES.abs);
  let absCount=Math.floor(needed*mixAbs);
  absCount=Math.max(1,Math.min(absCount,needed-1));
  const baseCount=needed-absCount;

  const baseWords=pickUnique(base,baseCount);
  const absWords=pickUnique(abs,absCount);
  const words=shuffle([...baseWords,...absWords]);
  return pairsFromWords(words,pairCount);
}

// UI
function setVisible(sectionId){["setupCard","memorizeCard","recallCard","resultCard"].forEach(id=>{$(id).hidden=(id!==sectionId);});}
function renderMemorizeTable(pairs){
  const tbody=$("memorizeTable");tbody.innerHTML="";
  pairs.forEach((p,i)=>{const tr=document.createElement("tr");tr.innerHTML=`<td class="dim">${i+1}</td><td>${p.left}</td><td>${p.right}</td>`;tbody.appendChild(tr);});
}
function updateProgressPill(total){
  const inputs=Array.from(document.querySelectorAll("#recallTable input"));
  const filled=inputs.filter(i=>normalize(i.value).length>0).length;
  $("progressPill").textContent=`${filled}/${total}`;
}
function renderRecallTable(pairs,answers=[]){
  const tbody=$("recallTable");tbody.innerHTML="";
  pairs.forEach((p,i)=>{const tr=document.createElement("tr");const v=answers[i]??"";tr.innerHTML=`
    <td class="dim">${i+1}</td><td>${p.left}</td>
    <td><div class="input-wrap"><input type="text" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" data-idx="${i}" value="${v.replaceAll('"','&quot;')}" placeholder="ここに入力"><div class="reveal" data-idx="${i}" hidden></div></div></td>`;tbody.appendChild(tr);});
  updateProgressPill(pairs.length);
  tbody.addEventListener("input",()=>updateProgressPill(pairs.length),{once:true});
}
function collectAnswers(pairCount){
  const inputs=Array.from(document.querySelectorAll("#recallTable input"));
  const arr=new Array(pairCount).fill("");
  inputs.forEach(inp=>{arr[Number(inp.dataset.idx)]=inp.value??"";});
  return arr;
}
function score(pairs,answers){
  let correct=0;
  const rows=pairs.map((p,i)=>{const exp=normalize(p.right);const act=normalize(answers[i]);const ok=exp&&act===exp;if(ok)correct++;return{idx:i+1,left:p.left,right:p.right,input:answers[i]??"",ok};});
  return{correct,total:pairs.length,rows};
}

function saveHistory(entry){
  let hist=[];try{hist=JSON.parse(localStorage.getItem(LS.history)||"[]");}catch{hist=[];}
  if(!Array.isArray(hist))hist=[];
  hist.unshift(entry);hist=hist.slice(0,50);
  localStorage.setItem(LS.history,JSON.stringify(hist));
  renderHistory();
}
function renderHistory(){
  let hist=[];try{hist=JSON.parse(localStorage.getItem(LS.history)||"[]");}catch{hist=[];}
  if(!Array.isArray(hist))hist=[];
  const tbody=$("historyTable");tbody.innerHTML="";
  hist.forEach(h=>{const tr=document.createElement("tr");tr.innerHTML=`
    <td class="dim">${h.at}</td><td>${h.pairCount}</td><td>${h.memorizeSeconds}s</td>
    <td>${h.difficulty}</td><td>${formatMix(h.mixAbs)}</td><td>${h.accuracy}%</td><td>${h.correct}/${h.total}</td>`;tbody.appendChild(tr);});
}

function saveLastSession(s){localStorage.setItem(LS.lastSession,JSON.stringify(s));}
function loadLastSession(){try{return JSON.parse(localStorage.getItem(LS.lastSession)||"null");}catch{return null;}}
function clearLastSession(){localStorage.removeItem(LS.lastSession);}

const fmtMMSS=(sec)=>`${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;
let timerInterval=null;
function startTimer(seconds,onDone){
  clearInterval(timerInterval);let r=seconds;$("timerLabel").textContent=fmtMMSS(r);
  timerInterval=setInterval(()=>{r--; $("timerLabel").textContent=fmtMMSS(Math.max(0,r));
    if(r<=0){clearInterval(timerInterval);onDone?.();}},1000);
}

// flow
function resumeSession(s){
  if(!s?.pairs?.length){clearLastSession();return;}
  if(s.phase==="memorize") showMemorize(s);
  else if(s.phase==="recall") showRecall(s);
  else if(s.phase==="result") showResult(s);
  else showRecall(s);
}

async function startNew(){
  const pairCount=Number($("pairCount").value);
  const memorizeSeconds=Number($("memorizeSeconds").value);
  const mode=$("mode").value;
  const difficulty=$("difficulty").value;
  const mixAbs=parseFloat($("mixAbstract").value||"0");

  if(getWordPoolSource()==="custom"){
    const cw=loadCustomWords();
    if(cw.length<30){alert("自分の単語リストが少なすぎます（30語以上推奨）。単語を追加してください。");return;}
  }

  try{
    const pairs=await makePairs(pairCount,difficulty,mixAbs);
    const session={at:new Date().toISOString(),pairCount,memorizeSeconds,mode,difficulty,mixAbs,pairs,answers:new Array(pairCount).fill(""),phase:(mode==="memorize_then_recall")?"memorize":"recall"};
    saveLastSession(session);
    (session.phase==="memorize")?showMemorize(session):showRecall(session);
  }catch(e){alert(e?.message??String(e));}
}

function showMemorize(s){
  setVisible("memorizeCard");renderMemorizeTable(s.pairs);
  startTimer(s.memorizeSeconds, ()=>{ $("timerLabel").textContent="00:00";
  // 時間切れで自動的に想起へ
  s.phase="recall"; saveLastSession(s); showRecall(s);
});
  $("toRecallBtn").onclick=()=>{s.phase="recall";saveLastSession(s);showRecall(s);};
  $("restartBtn1").onclick=()=>{clearLastSession();setVisible("setupCard");$("continueBtn").hidden=true;};
}
function showRecall(s){
  setVisible("recallCard");renderRecallTable(s.pairs,s.answers);
  $("recallTable").addEventListener("input",()=>{s.answers=collectAnswers(s.pairCount);saveLastSession(s);updateProgressPill(s.pairCount);});
  $("checkBtn").onclick=()=>{s.answers=collectAnswers(s.pairCount);s.score=score(s.pairs,s.answers);s.phase="result";saveLastSession(s);showResult(s);};
  $("showAnswersBtn").onclick=()=>{if(!confirm("答えを表示しますか？（想起トレとしては非推奨）"))return;
  const answersNow = collectAnswers(s.pairCount);
  const reveals = Array.from(document.querySelectorAll("#recallTable .reveal"));
  reveals.forEach(div=>{const i=Number(div.dataset.idx);div.textContent = `正解：${s.pairs[i].right}（あなた：${answersNow[i]||""}）`;div.hidden=false;});
};
  $("restartBtn2").onclick=()=>{clearLastSession();setVisible("setupCard");$("continueBtn").hidden=true;};
}
function showResult(s){
  setVisible("resultCard");
  const sc=s.score??score(s.pairs,s.answers??[]);
  const acc=Math.round((sc.correct/sc.total)*100);
  $("scorePill").textContent=`${acc}%`;
  $("correctCount").textContent=sc.correct;
  $("totalCount").textContent=sc.total;
  $("accuracy").textContent=`${acc}%`;
  $("reviewTable").innerHTML="";
  sc.rows.forEach(r=>{const tr=document.createElement("tr");tr.innerHTML=`
    <td class="dim">${r.idx}</td><td>${r.left}</td>
    <td>${(r.input??"").replaceAll("<","&lt;").replaceAll(">","&gt;")}</td>
    <td>${r.right}</td>
    <td class="${r.ok?"ok":"ng"}">${r.ok?"○":"×"}</td>`; tr.className = r.ok ? "ok-row" : "ng-row";
    $("reviewTable").appendChild(tr);
  });

  saveHistory({at:nowIso(),pairCount:s.pairCount,memorizeSeconds:s.memorizeSeconds,difficulty:s.difficulty??"-",mixAbs:s.mixAbs,correct:sc.correct,total:sc.total,accuracy:acc});

  $("newSetBtn").onclick=()=>{clearLastSession();startNew();$("continueBtn").hidden=true;};
  $("backToSetupBtn").onclick=()=>{clearLastSession();setVisible("setupCard");$("continueBtn").hidden=true;};
}

function bindSetup(){
  const last=loadLastSession(); $("continueBtn").hidden=!last;

  $("wordSource").addEventListener("change",()=>{$("customWordsWrap").hidden=($("wordSource").value!=="custom");});
  const cw=loadCustomWords(); if(cw.length) $("customWords").value=cw.join("\n");
  $("saveCustomWords").addEventListener("click",()=>{const lines=$("customWords").value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);saveCustomWords(lines);alert(`保存しました（${lines.length}語）`);});
  $("clearCustomWords").addEventListener("click",()=>{saveCustomWords([]);$("customWords").value="";alert("削除しました");});
  $("startBtn").addEventListener("click",()=>{startNew();});
  $("continueBtn").addEventListener("click",()=>{const s=loadLastSession(); if(s) resumeSession(s);});
  renderHistory();
  $("clearHistoryBtn").addEventListener("click",()=>{if(confirm("履歴を削除しますか？")){localStorage.removeItem(LS.history);renderHistory();}});
}
bindSetup();
