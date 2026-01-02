
const $ = id => document.getElementById(id);
let pairs = [];

function generatePairs(n){
  pairs = [];
  for(let i=0;i<n;i++){
    pairs.push({
      left: "単語" + (i*2+1),
      right: "単語" + (i*2+2)
    });
  }
}

$("start").onclick = () => {
  const n = Number($("pairCount").value);
  generatePairs(n);

  $("setup").hidden = true;
  $("memorize").hidden = false;

  const box = $("memoList");
  box.innerHTML = "";
  pairs.forEach((p,i)=>{
    box.innerHTML += `<div class="item">
      <div class="left">${i+1}. ${p.left}</div>
      <div>${p.right}</div>
    </div>`;
  });
};

$("check").onclick = () => {
  $("memorize").hidden = true;
  $("recall").hidden = true;
  $("result").hidden = false;

  const box = $("resultList");
  box.innerHTML = "";
  pairs.forEach((p,i)=>{
    box.innerHTML += `<div class="item">
      <div>${i+1}. ${p.left}</div>
      <div>正解: ${p.right}</div>
    </div>`;
  });
};
