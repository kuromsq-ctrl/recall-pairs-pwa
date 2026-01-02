
const $=id=>document.getElementById(id);
let pairs=[];

function genPairs(n){
  const base=[...Array(200)].map((_,i)=>"語"+(i+1));
  pairs=[];
  for(let i=0;i<n;i++){
    pairs.push({l:base[i*2], r:base[i*2+1]});
  }
}

$('#start').onclick=()=>{
  const n=Number($('#pairCount').value);
  genPairs(n);
  $('#setup').hidden=true;
  $('#memorize').hidden=false;
  const m=$('#memoList'); m.innerHTML="";
  pairs.forEach((p,i)=>{
    m.innerHTML+=`<div class="item"><div class="left">${i+1}. ${p.l}</div><div>${p.r}</div></div>`;
  });
  setTimeout(()=>{
    $('#memorize').hidden=true;
    $('#recall').hidden=false;
    const r=$('#recallList'); r.innerHTML="";
    pairs.forEach((p,i)=>{
      r.innerHTML+=`<div class="item"><div class="left">${i+1}. ${p.l}</div>
      <input data-i="${i}" placeholder="回答"></div>`;
    });
  }, Number($('#time').value)*1000);
};

$('#check').onclick=()=>{
  $('#recall').hidden=true;
  $('#result').hidden=false;
  const res=$('#resultList'); res.innerHTML="";
  pairs.forEach((p,i)=>{
    const v=document.querySelector(`input[data-i="${i}"]`).value;
    res.innerHTML+=`<div class="item"><div>${i+1}. ${p.l}</div>
    <div>あなた: ${v}</div><div>正解: ${p.r}</div></div>`;
  });
};
