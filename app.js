// 想起トレ（単語ペア）
// 目的：20/40ペアを生成 → 記憶(任意) → 左だけ表示して右を入力 → 採点
// データは端末内(localStorage)保存のみ

const LS = {
  customWords: "recall_custom_words_v1",
  history: "recall_history_v1",
  lastSession: "recall_last_session_v1"
};

const builtinWords = [
  "砂漠","電卓","冷蔵庫","雷","封筒","鉄道","月","ハンマー","歯ブラシ","地図","火山","カーテン","鉛筆","交差点","雨","ピアノ","靴","望遠鏡","時計","キャベツ",
  "湖","郵便局","梯子","彫刻","枕","信号","鍵","スープ","階段","宇宙船","カメラ","風船","新聞","砂時計","布団","磁石","橋","蜂蜜","絵の具","腕時計",
  "畳","郵便受け","電球","牛乳","畑","マスク","自転車","封印","花火","顕微鏡","消しゴム","銀河","引き出し","氷山","手袋","黒板","鏡","電柱","団子","空港",
  "階層","道路","船","ランタン","湯呑み","換気扇","洗濯ばさみ","カーテンレール","金庫","目覚まし","椅子","牛","針","バケツ","砂利","タブレット","鍋","分度器","切符","灯台",
  "湯気","レモン","椿","鉱石","回覧板","風鈴","釣り竿","標識","額縁","紙飛行機","傘","巻尺","接着剤","レンズ","階段下","水筒","毛布","腕章","小瓶","郵便車"
];

const $ = (id) => document.getElementById(id);

let deferredPrompt = null;

// PWA install (Android/Chrome中心。iOSは「共有→ホーム画面に追加」)
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = $("installBtn");
  btn.hidden = false;
  btn.addEventListener("click", async () => {
    btn.hidden = true;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }, { once:true });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}

function nowIso(){
  const d = new Date();
  const pad = (n)=> String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function shuffle(arr){
  const a = [...arr];
  for (let i=a.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function normalize(s){
  return (s ?? "").toString().trim().replace(/\s+/g,"");
}

function loadCustomWords(){
  const raw = localStorage.getItem(LS.customWords);
  if(!raw) return [];
  try{
    const arr = JSON.parse(raw);
    if(Array.isArray(arr)) return arr.filter(Boolean);
  }catch(e){}
  return [];
}

function saveCustomWords(words){
  localStorage.setItem(LS.customWords, JSON.stringify(words));
}

function getWordPool(){
  const source = $("wordSource").value;
  if(source === "custom"){
    const cw = loadCustomWords();
    if(cw.length >= 30) return cw;
  }
  return builtinWords;
}

function makePairs(pairCount){
  const pool = getWordPool();
  // 同一セット内の重複を減らす（完全排除はpoolサイズ次第）
  const needed = pairCount * 2;
  let words = [];
  if(pool.length >= needed){
    words = shuffle(pool).slice(0, needed);
  }else{
    // 足りない場合は繰り返し利用
    while(words.length < needed){
      words = words.concat(shuffle(pool));
    }
    words = words.slice(0, needed);
  }
  const pairs = [];
  for(let i=0; i<pairCount; i++){
    pairs.push({ left: words[i*2], right: words[i*2+1] });
  }
  return pairs;
}

function setVisible(sectionId){
  ["setupCard","memorizeCard","recallCard","resultCard"].forEach(id=>{
    $(id).hidden = (id !== sectionId);
  });
}

function renderMemorizeTable(pairs){
  const tbody = $("memorizeTable");
  tbody.innerHTML = "";
  pairs.forEach((p, idx)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="dim">${idx+1}</td><td>${p.left}</td><td>${p.right}</td>`;
    tbody.appendChild(tr);
  });
}

function renderRecallTable(pairs, answers = []){
  const tbody = $("recallTable");
  tbody.innerHTML = "";
  pairs.forEach((p, idx)=>{
    const tr = document.createElement("tr");
    const val = answers[idx] ?? "";
    tr.innerHTML = `
      <td class="dim">${idx+1}</td>
      <td>${p.left}</td>
      <td><input type="text" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" data-idx="${idx}" value="${val.replaceAll('"','&quot;')}" placeholder="ここに入力"></td>
    `;
    tbody.appendChild(tr);
  });

  // 進捗
  updateProgressPill(pairs.length);

  tbody.addEventListener("input", () => updateProgressPill(pairs.length), { once:true });
}

function updateProgressPill(total){
  const inputs = Array.from(document.querySelectorAll("#recallTable input"));
  const filled = inputs.filter(i => normalize(i.value).length > 0).length;
  $("progressPill").textContent = `${filled}/${total}`;
}

function collectAnswers(pairCount){
  const inputs = Array.from(document.querySelectorAll("#recallTable input"));
  const arr = new Array(pairCount).fill("");
  inputs.forEach(inp=>{
    const idx = Number(inp.dataset.idx);
    arr[idx] = inp.value ?? "";
  });
  return arr;
}

function score(pairs, answers){
  let correct = 0;
  const rows = pairs.map((p, idx)=>{
    const expected = normalize(p.right);
    const actual = normalize(answers[idx]);
    const ok = expected.length > 0 && actual === expected;
    if(ok) correct += 1;
    return { idx: idx+1, left: p.left, right: p.right, input: answers[idx] ?? "", ok };
  });
  return { correct, total: pairs.length, rows };
}

function saveHistory(entry){
  const raw = localStorage.getItem(LS.history);
  let hist = [];
  try{ hist = raw ? JSON.parse(raw) : []; }catch(e){ hist = []; }
  if(!Array.isArray(hist)) hist = [];
  hist.unshift(entry);
  hist = hist.slice(0, 50); // 最大50件
  localStorage.setItem(LS.history, JSON.stringify(hist));
  renderHistory();
}

function renderHistory(){
  const raw = localStorage.getItem(LS.history);
  let hist = [];
  try{ hist = raw ? JSON.parse(raw) : []; }catch(e){ hist = []; }
  if(!Array.isArray(hist)) hist = [];

  const tbody = $("historyTable");
  tbody.innerHTML = "";
  hist.forEach(h=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="dim">${h.at}</td>
      <td>${h.pairCount}</td>
      <td>${h.memorizeSeconds}s</td>
      <td>${h.accuracy}%</td>
      <td>${h.correct}/${h.total}</td>
    `;
    tbody.appendChild(tr);
  });
}

function saveLastSession(session){
  localStorage.setItem(LS.lastSession, JSON.stringify(session));
}

function loadLastSession(){
  const raw = localStorage.getItem(LS.lastSession);
  if(!raw) return null;
  try{ return JSON.parse(raw); }catch(e){ return null; }
}

function clearLastSession(){
  localStorage.removeItem(LS.lastSession);
}

function fmtMMSS(seconds){
  const m = Math.floor(seconds/60);
  const s = seconds%60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

let timerInterval = null;
function startTimer(seconds, onDone){
  clearInterval(timerInterval);
  let remaining = seconds;
  $("timerLabel").textContent = fmtMMSS(remaining);
  timerInterval = setInterval(()=>{
    remaining -= 1;
    $("timerLabel").textContent = fmtMMSS(Math.max(0, remaining));
    if(remaining <= 0){
      clearInterval(timerInterval);
      onDone?.();
    }
  }, 1000);
}

// ---- UI events ----

function bindSetup(){
  const last = loadLastSession();
  $("continueBtn").hidden = !last;

  $("wordSource").addEventListener("change", ()=>{
    const isCustom = $("wordSource").value === "custom";
    $("customWordsWrap").hidden = !isCustom;
  });

  // custom words UI
  const cw = loadCustomWords();
  if(cw.length){
    $("customWords").value = cw.join("\n");
  }
  $("saveCustomWords").addEventListener("click", ()=>{
    const lines = $("customWords").value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    saveCustomWords(lines);
    alert(`保存しました（${lines.length}語）`);
  });
  $("clearCustomWords").addEventListener("click", ()=>{
    saveCustomWords([]);
    $("customWords").value = "";
    alert("削除しました");
  });

  $("startBtn").addEventListener("click", ()=>{
    startNew();
  });

  $("continueBtn").addEventListener("click", ()=>{
    const s = loadLastSession();
    if(!s) return;
    resumeSession(s);
  });

  renderHistory();

  $("clearHistoryBtn").addEventListener("click", ()=>{
    if(confirm("履歴を削除しますか？")){
      localStorage.removeItem(LS.history);
      renderHistory();
    }
  });
}

function startNew(){
  const pairCount = Number($("pairCount").value);
  const memorizeSeconds = Number($("memorizeSeconds").value);
  const mode = $("mode").value;

  // custom words validation
  if($("wordSource").value === "custom"){
    const cw = loadCustomWords();
    if(cw.length < 30){
      alert("自分の単語リストが少なすぎます（30語以上推奨）。内蔵リストを使うか、単語を追加してください。");
      return;
    }
  }

  const pairs = makePairs(pairCount);
  const session = {
    at: new Date().toISOString(),
    pairCount, memorizeSeconds, mode,
    pairs,
    answers: new Array(pairCount).fill(""),
    phase: (mode === "memorize_then_recall") ? "memorize" : "recall"
  };
  saveLastSession(session);

  if(session.phase === "memorize"){
    showMemorize(session);
  }else{
    showRecall(session);
  }
}

function resumeSession(session){
  // session shape guard
  if(!session?.pairs?.length) { clearLastSession(); return; }
  if(session.phase === "memorize"){
    showMemorize(session);
  }else if(session.phase === "recall"){
    showRecall(session);
  }else if(session.phase === "result"){
    showResult(session);
  }else{
    showRecall(session);
  }
}

function showMemorize(session){
  setVisible("memorizeCard");
  renderMemorizeTable(session.pairs);

  // timer
  startTimer(session.memorizeSeconds, ()=>{
    // 自動遷移は好みが分かれるので、ここではボタンで遷移（終わったことを視覚化）
    $("timerLabel").textContent = "00:00";
  });

  $("toRecallBtn").onclick = ()=>{
    session.phase = "recall";
    saveLastSession(session);
    showRecall(session);
  };

  $("restartBtn1").onclick = ()=>{
    clearLastSession();
    setVisible("setupCard");
    $("continueBtn").hidden = true;
  };
}

function showRecall(session){
  setVisible("recallCard");
  renderRecallTable(session.pairs, session.answers);

  // 入力の保存（入力のたびに保存。軽い）
  $("recallTable").addEventListener("input", ()=>{
    session.answers = collectAnswers(session.pairCount);
    saveLastSession(session);
    updateProgressPill(session.pairCount);
  });

  $("checkBtn").onclick = ()=>{
    session.answers = collectAnswers(session.pairCount);
    const sc = score(session.pairs, session.answers);
    session.score = sc;
    session.phase = "result";
    saveLastSession(session);
    showResult(session);
  };

  $("showAnswersBtn").onclick = ()=>{
    // 答えを入力欄に薄く表示（学習用。採点前でも確認できる）
    if(!confirm("答えを表示しますか？（想起トレとしては非推奨）")) return;
    const inputs = Array.from(document.querySelectorAll("#recallTable input"));
    inputs.forEach((inp)=>{
      const idx = Number(inp.dataset.idx);
      inp.placeholder = session.pairs[idx].right;
    });
  };

  $("restartBtn2").onclick = ()=>{
    clearLastSession();
    setVisible("setupCard");
    $("continueBtn").hidden = true;
  };
}

function showResult(session){
  setVisible("resultCard");
  const sc = session.score ?? score(session.pairs, session.answers ?? []);
  const acc = Math.round((sc.correct / sc.total) * 100);
  $("scorePill").textContent = `${acc}%`;
  $("correctCount").textContent = sc.correct;
  $("totalCount").textContent = sc.total;
  $("accuracy").textContent = `${acc}%`;

  $("reviewTable").innerHTML = "";
  sc.rows.forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="dim">${r.idx}</td>
      <td>${r.left}</td>
      <td>${r.right}</td>
      <td>${(r.input ?? "").replaceAll("<","&lt;").replaceAll(">","&gt;")}</td>
      <td class="${r.ok ? "ok" : "ng"}">${r.ok ? "○" : "×"}</td>
    `;
    $("reviewTable").appendChild(tr);
  });

  // 履歴保存
  saveHistory({
    at: nowIso(),
    pairCount: session.pairCount,
    memorizeSeconds: session.memorizeSeconds,
    correct: sc.correct,
    total: sc.total,
    accuracy: acc
  });

  $("newSetBtn").onclick = ()=>{
    clearLastSession();
    startNew();
    $("continueBtn").hidden = true;
  };

  $("backToSetupBtn").onclick = ()=>{
    clearLastSession();
    setVisible("setupCard");
    $("continueBtn").hidden = true;
  };
}

bindSetup();
