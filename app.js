const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const APP = $('#app');
const FX = $('#fxLayer');
const STORAGE_KEY = 'fraudTraceProfile.v1';
const SCENE_ORDER = [
  ['secondhand','二手交易'],['parttime','兼职刷单'],['impersonate','冒充身份'],['ai','熟人冒充'],
  ['ticket','票务交易'],['loan','校园贷'],['game','游戏交易'],['delivery','快递理赔']
];
const SCENE_ICONS = {secondhand:'📱',parttime:'💸',impersonate:'🎓',ai:'🎙️',ticket:'🎫',loan:'☎️',game:'🎮',delivery:'📦'};
const app = {
  currentCase:null,
  game:null,
  lastResult:null,
  scanData:null,
  activeFilter:'全部',
  briefReturn:'home',
  resultReturn:'game',
  profile:null,
  audioCtx:null
};

const defaultProfile = () => ({mastery:{},records:{},history:[],settings:{sound:true}});
function loadProfile(){
  try{
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const merged = {...defaultProfile(),...(value || {})};
    merged.mastery = merged.mastery || {};
    merged.records = merged.records || {};
    merged.history = Array.isArray(merged.history) ? merged.history : [];
    merged.settings = {...defaultProfile().settings,...(merged.settings || {})};
    return merged;
  }catch(error){return defaultProfile();}
}
function saveProfile(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(app.profile));}catch(error){}
}
function escapeHTML(value){
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}
function formatTime(seconds){
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe/60)).padStart(2,'0')}:${String(safe%60).padStart(2,'0')}`;
}
function getCase(id){return CASES.find(item=>item.id===id);}
function getRecord(id){return app.profile.records[id] || null;}
function getSceneLabel(key){const found = SCENE_ORDER.find(item=>item[0]===key);return found ? found[1] : '自定义案例';}
function getCaseIndex(id){return CASES.findIndex(item=>item.id===id);}
function switchScreen(name, options={}){
  const target = document.getElementById(`${name}Screen`);
  if(!target) return;
  $$('.screen').forEach(screen=>{
    if(screen!==target) screen.classList.remove('is-active','is-leaving');
  });
  if(options.instant){target.classList.add('is-active');}
  else{
    requestAnimationFrame(()=>{
      target.classList.add('is-active');
      target.scrollTop = 0;
    });
  }
  if(name==='profile') renderProfile();
  if(name==='library') renderLibrary();
}
function showToast(message, duration=1800){
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(()=>toast.classList.remove('show'),duration);
}
function playTone(kind='tap'){
  const settings = app.profile?.settings || {sound:true};
  if(!settings.sound) return;
  try{
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if(!AudioContext) return;
    if(!app.audioCtx) app.audioCtx = new AudioContext();
    const ctx = app.audioCtx;
    if(ctx.state==='suspended') ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const frequencies = {tap:420,hit:760,miss:180,open:520,finish:920};
    osc.type = kind==='miss' ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(frequencies[kind] || 420,now);
    if(kind==='hit') osc.frequency.exponentialRampToValueAtTime(1040,now+.12);
    if(kind==='finish') osc.frequency.exponentialRampToValueAtTime(1320,now+.25);
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(kind==='miss' ? .035 : .05,now+.015);
    gain.gain.exponentialRampToValueAtTime(.0001,now+(kind==='finish'?.3:.14));
    osc.connect(gain);gain.connect(ctx.destination);
    osc.start(now);osc.stop(now+(kind==='finish'?.32:.16));
  }catch(error){}
}
function haptic(pattern=[8]){try{navigator.vibrate?.(pattern);}catch(error){}}
function spawnSpark(x,y,color='#f2b15d'){
  const rect = APP.getBoundingClientRect();
  for(let i=0;i<10;i++){
    const spark = document.createElement('i');
    spark.className='spark';
    spark.style.left = `${x-rect.left}px`;
    spark.style.top = `${y-rect.top}px`;
    spark.style.background=color;
    const angle = (Math.PI*2*i/10)+(Math.random()*.5);
    const distance = 24+Math.random()*36;
    spark.style.setProperty('--dx',`${Math.cos(angle)*distance}px`);
    spark.style.setProperty('--dy',`${Math.sin(angle)*distance}px`);
    FX.appendChild(spark);
    setTimeout(()=>spark.remove(),850);
  }
}
function launchConfetti(){
  const colors=['#f2b15d','#ff6b5f','#65e5b2','#6bb9ee','#ede1ca'];
  for(let i=0;i<38;i++){
    const piece=document.createElement('i');
    piece.className='confetti';
    piece.style.left=`${Math.random()*100}%`;
    piece.style.top='-16px';
    piece.style.background=colors[i%colors.length];
    piece.style.animationDelay=`${Math.random()*.55}s`;
    piece.style.setProperty('--dx',`${(Math.random()-.5)*180}px`);
    FX.appendChild(piece);
    setTimeout(()=>piece.remove(),2500);
  }
}
function showConfirm(title,copy,onOk,okText='确认'){
  $('#confirmTitle').textContent=title;
  $('#confirmCopy').textContent=copy;
  $('#confirmOk').textContent=okText;
  showConfirm.callback=onOk;
  $('#confirmModal').classList.remove('hidden');
  playTone('open');
}
function closeConfirm(){ $('#confirmModal').classList.add('hidden'); }
function updateSoundUI(){
  const enabled=app.profile.settings.sound;
  $('#soundIcon').textContent=enabled?'◉':'○';
  $('#soundBtn').setAttribute('aria-label',enabled?'关闭音效':'开启音效');
}
function openHome(){
  renderHomeCases();
  switchScreen('home');
}
function renderHomeCases(){
  const list=$('#homeCaseList');
  list.innerHTML='';
  CASES.slice(0,6).forEach((item,index)=>{
    const record=getRecord(item.id);
    const button=document.createElement('button');
    button.type='button';
    button.className='mini-case';
    button.dataset.caseId=item.id;
    button.dataset.code=item.code;
    button.style.animation=`fade-up .42s ${index*.045}s both`;
    button.innerHTML = `<div class='mini-icon'>${item.icon}</div><p>${escapeHTML(item.scene)} · ${escapeHTML(item.difficulty)}</p><h3>${escapeHTML(item.title)}</h3><div class='mini-foot'><span>${item.flaws.length} 处破绽</span><b>开始勘察 →</b></div>${record?`<span class='completion-mark'>${escapeHTML(record.grade)}</span>`:''}`;
    list.appendChild(button);
  });
}
function renderFeature(){
  const day=new Date().getDate();
  const feature=CASES[day % CASES.length];
  app.featureCase=feature;
  $('#featureCode').textContent=`CASE ${feature.code}`;
  $('#featureIcon').textContent=feature.icon;
  $('#featureScene').textContent=`${feature.scene} · ${feature.threat}`;
  $('#featureTitle').textContent=feature.title;
  $('#featureHook').textContent=feature.hook;
  $('#featureFlaws').textContent=String(feature.flaws.length);
  $('#featureDifficulty').textContent=feature.difficulty;
  $('#featureTime').textContent=`≈${feature.minutes} min`;
}
function renderFilters(){
  const bar=$('#filterBar');
  const filters=['全部',...SCENE_ORDER.map(item=>item[1])];
  bar.innerHTML='';
  filters.forEach(label=>{
    const button=document.createElement('button');
    button.type='button';
    button.className=`filter-pill${app.activeFilter===label?' is-active':''}`;
    button.dataset.filter=label;
    button.textContent=label;
    bar.appendChild(button);
  });
}
function renderLibrary(){
  renderFilters();
  const grid=$('#caseGrid');
  grid.innerHTML='';
  const filtered=app.activeFilter==='全部'?CASES:CASES.filter(item=>item.scene===app.activeFilter);
  $('#archiveCount').textContent=String(filtered.length).padStart(2,'0');
  if(!filtered.length){grid.innerHTML='<div class="empty-profile">没有找到相关案件</div>';return;}
  filtered.forEach((item,index)=>{
    const record=getRecord(item.id);
    const button=document.createElement('button');
    button.type='button';
    button.className='case-tile';
    button.dataset.caseId=item.id;
    button.dataset.code=item.code;
    button.style.animationDelay=`${index*.045}s`;
    button.innerHTML=`<div class='tile-icon'>${item.icon}</div><p class='tile-scene'>${escapeHTML(item.scene)}</p><h3>${escapeHTML(item.title)}</h3><div class='tile-bottom'><span class='difficulty ${escapeHTML(item.difficulty)}'>${escapeHTML(item.difficulty)}</span><span>${item.flaws.length} 处破绽</span></div>${record?`<span class='tile-grade'>${escapeHTML(record.grade)}</span>`:''}`;
    grid.appendChild(button);
  });
}
function openBrief(caseId, returnTo='home'){
  const caseData=getCase(caseId);
  if(!caseData) return;
  app.currentCase=caseData;
  app.briefReturn=returnTo;
  const record=getRecord(caseData.id);
  $('#briefCode').textContent=`CASE ${caseData.code}`;
  $('#briefThreat').textContent=caseData.threat;
  $('#briefIcon').textContent=caseData.icon;
  $('#briefEn').textContent=caseData.en;
  $('#briefTitle').textContent=caseData.title;
  $('#briefScene').textContent=caseData.scene;
  $('#briefDifficulty').textContent=caseData.difficulty;
  $('#briefTime').textContent=`≈${caseData.minutes} MIN`;
  $('#briefStamp').textContent=record ? record.grade : '待侦破';
  $('#briefBackground').textContent=caseData.background;
  $('#briefObjective').textContent=caseData.objective;
  $('#briefFlawCount').textContent=String(caseData.flaws.length);
  $('#briefCredit').textContent='100';
  switchScreen('brief');
  playTone('open');
}
function openProfile(){
  renderProfile();
  switchScreen('profile');
}

function startGame(){
  const caseData=app.currentCase;
  clearInterval(app.game?.timerId);
  const game={
    caseData,
    found:new Set(),
    foundOrder:[],
    wrongSegments:new Set(),
    wrongAttempts:0,
    hintUsed:0,
    hintIndex:0,
    elapsed:0,
    startTime:Date.now(),
    submitted:false,
    timerId:null,
    segments:[]
  };
  app.game=game;
  $('#gameCaseCode').textContent=`CASE ${caseData.code}`;
  $('#gameCaseTitle').textContent=caseData.title;
  $('#gameContext').textContent=caseData.background;
  $('#evidenceCount').textContent='0';
  $('#evidenceTotal').textContent=String(caseData.flaws.length);
  $('#evidenceBar').style.width='0%';
  $('#submitLabel').textContent=`还差 ${caseData.flaws.length} 处`;
  $('#hintBanner').classList.add('hidden');
  renderTranscript();
  updateGameStatus();
  startTimer();
  switchScreen('game');
  playTone('open');
}
function startTimer(){
  const timer=$('#timerValue');
  const box=timer.closest('.timer-box');
  clearInterval(app.game.timerId);
  timer.textContent='00:00';
  box.classList.remove('is-urgent');
  app.game.timerId=setInterval(()=>{
    if(!app.game || app.game.submitted) return;
    app.game.elapsed=Math.floor((Date.now()-app.game.startTime)/1000);
    timer.textContent=formatTime(app.game.elapsed);
    box.classList.toggle('is-urgent',app.game.elapsed>=300);
  },1000);
}
function buildSegments(message,caseData){
  const ranges=[];
  caseData.flaws.forEach(flaw=>{
    const start=message.text.indexOf(flaw.quote);
    if(start>=0) ranges.push({start,end:start+flaw.quote.length,flawId:flaw.id,quote:flaw.quote});
  });
  ranges.sort((a,b)=>a.start-b.start || b.end-a.end);
  const filtered=[];
  let lastEnd=-1;
  ranges.forEach(range=>{
    if(range.start>=lastEnd){filtered.push(range);lastEnd=range.end;}
  });
  const segments=[];
  let cursor=0;
  const addPlain=(start,end)=>{
    if(start>=end) return;
    const text=message.text.slice(start,end);
    const regex=/[^，。！？；：,.!?;:]+[，。！？；：,.!?;:]*/g;
    let match, local=0;
    while((match=regex.exec(text))!==null){
      const part=match[0];
      const segStart=start+local;
      const segEnd=segStart+part.length;
      segments.push({start:segStart,end:segEnd,text:part,flawId:null});
      local+=part.length;
    }
    if(local<text.length){
      segments.push({start:start+local,end,text:text.slice(local),flawId:null});
    }
  };
  filtered.forEach(range=>{
    addPlain(cursor,range.start);
    segments.push({start:range.start,end:range.end,text:range.quote,flawId:range.flawId});
    cursor=range.end;
  });
  addPlain(cursor,message.text.length);
  return segments.map((segment,index)=>({...segment,id:`${message.id}_${segment.start}_${index}`}));
}
function renderTranscript(){
  const container=$('#transcript');
  container.innerHTML='';
  const caseData=app.game.caseData;
  app.game.segments=[];
  caseData.messages.forEach((message,messageIndex)=>{
    const row=document.createElement('div');
    row.className=`message ${message.role}`;
    row.style.animationDelay=`${messageIndex*.075}s`;
    const avatar=document.createElement('div');
    avatar.className='msg-avatar';
    avatar.textContent=message.role==='fraud'?(message.type==='voice'?'🎙':'诈'):'我';
    const wrap=document.createElement('div');
    wrap.className='msg-wrap';
    const sender=document.createElement('p');
    sender.className='msg-sender';
    sender.textContent=message.sender;
    const bubble=document.createElement('div');
    bubble.className='msg-bubble';
    if(message.type==='voice'){
      const line=document.createElement('div');
      line.className='voice-line';
      const wave=document.createElement('span');
      wave.className='voice-wave';
      wave.textContent='▂▅▇▃▆▂';
      const duration=document.createElement('span');
      duration.className='voice-duration';
      duration.textContent='00:08';
      line.append(wave,duration);
      bubble.appendChild(line);
    }
    const textHost=document.createElement('div');
    const segments=buildSegments(message,caseData);
    segments.forEach(segment=>{
      const span=document.createElement('span');
      span.className='segment';
      span.dataset.segmentId=segment.id;
      span.textContent=segment.text;
      span.setAttribute('role','button');
      span.setAttribute('tabindex','0');
      span.setAttribute('aria-label',`标记可疑文字：${segment.text}`);
      span.addEventListener('click',event=>handleSegmentClick(segment,event));
      span.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();handleSegmentClick(segment,event);}
      });
      textHost.appendChild(span);
      app.game.segments.push({...segment,element:span,messageId:message.id});
    });
    bubble.appendChild(textHost);
    wrap.append(sender,bubble);
    row.append(avatar,wrap);
    container.appendChild(row);
  });
}
function handleSegmentClick(segment,event){
  const game=app.game;
  if(!game || game.submitted) return;
  const element=event.currentTarget;
  if(segment.flawId && game.found.has(segment.flawId)){
    showToast('这处证据已经收入档案');
    return;
  }
  if(game.wrongSegments.has(segment.id)){
    showToast('这句已经判断过，不是关键破绽');
    return;
  }
  if(segment.flawId){
    game.found.add(segment.flawId);
    game.foundOrder.push(segment.flawId);
    element.classList.add('is-hit');
    element.classList.add('is-locked');
    const flaw=game.caseData.flaws.find(item=>item.id===segment.flawId);
    showToast(`证据锁定：${flaw.type}`,1400);
    playTone('hit');
    haptic([12,20,12]);
    spawnSpark(event.clientX,event.clientY,'#f2b15d');
    updateGameStatus();
    if(game.found.size===game.caseData.flaws.length){
      setTimeout(()=>showToast('证据链完整，可以提交研判',2200),500);
    }
  }else{
    game.wrongSegments.add(segment.id);
    game.wrongAttempts+=1;
    element.classList.add('is-wrong');
    setTimeout(()=>element.classList.remove('is-wrong'),1300);
    showToast('这句不是关键破绽，再找找具体操作',1700);
    playTone('miss');
    haptic([18]);
    updateGameStatus();
  }
}
function updateGameStatus(){
  if(!app.game) return;
  const total=app.game.caseData.flaws.length;
  const found=app.game.found.size;
  const remaining=total-found;
  $('#evidenceCount').textContent=String(found);
  $('#evidenceBar').style.width=`${total?found/total*100:0}%`;
  $('#submitLabel').textContent=remaining?`还差 ${remaining} 处`:'证据链完整';
}
function showHint(){
  const game=app.game;
  if(!game) return;
  const missing=game.caseData.flaws.filter(flaw=>!game.found.has(flaw.id));
  if(!missing.length){showToast('所有破绽都找到了，直接提交吧');return;}
  if(game.hintUsed>=2){showToast('本局提示次数已用完');return;}
  const flaw=missing[game.hintIndex%missing.length];
  game.hintIndex+=1;
  game.hintUsed+=1;
  $('#hintText').textContent=`方向：这处异常与“${flaw.type}”有关。别直接找答案，先看对方想让你做什么。`;
  $('#hintBanner').classList.remove('hidden');
  playTone('open');
  haptic([8]);
}
function requestSubmit(){
  const game=app.game;
  if(!game || game.submitted) return;
  const remaining=game.caseData.flaws.length-game.found.size;
  if(remaining>0){
    showConfirm('还有线索没锁定',`目前还差 ${remaining} 处破绽。现在提交会按当前准确率结算，你确定吗？`,finishGame,'仍然提交');
  }else{
    finishGame();
  }
}
function getGrade(accuracy,found,total,wrong){
  if(found===total && wrong===0) return 'S';
  if(accuracy>=.8) return 'A';
  if(accuracy>=.6) return 'B';
  return 'C';
}
function finishGame(){
  closeConfirm();
  const game=app.game;
  if(!game || game.submitted) return;
  game.submitted=true;
  clearInterval(game.timerId);
  game.elapsed=Math.max(game.elapsed,Math.floor((Date.now()-game.startTime)/1000));
  const total=game.caseData.flaws.length;
  const found=game.found.size;
  const accuracy=total?found/total:0;
  const grade=getGrade(accuracy,found,total,game.wrongAttempts);
  const timeMultiplier=game.elapsed<180?1.2:game.elapsed>300?.9:1;
  const baseScore=Math.max(0,found*10-game.wrongAttempts*3-game.hintUsed*5);
  const score=Math.round(baseScore*timeMultiplier);
  const missedFlaws=game.caseData.flaws.filter(flaw=>!game.found.has(flaw.id));
  const foundFlaws=game.caseData.flaws.filter(flaw=>game.found.has(flaw.id));
  const result={caseData:game.caseData,found,total,wrong:game.wrongAttempts,hintUsed:game.hintUsed,elapsed:game.elapsed,accuracy,grade,score,missedFlaws,foundFlaws,date:new Date().toISOString()};
  app.lastResult=result;
  updateProfileWithResult(result);
  renderResult(result);
  switchScreen('result');
  playTone('finish');
  if(grade==='S'){setTimeout(launchConfetti,300);haptic([20,40,20,40,60]);}
}
function updateProfileWithResult(result){
  const id=result.caseData.id;
  const record=getRecord(id);
  if(!record || result.accuracy>record.accuracy || (result.accuracy===record.accuracy && result.score>record.score)){
    app.profile.records[id]={accuracy:result.accuracy,grade:result.grade,score:result.score,date:result.date};
  }
  const key=result.caseData.sceneKey;
  app.profile.mastery[key]=Math.max(app.profile.mastery[key] || 0,Math.round(result.accuracy*100));
  app.profile.history.unshift({id,title:result.caseData.title,accuracy:result.accuracy,grade:result.grade,score:result.score,date:result.date,elapsed:result.elapsed,found:result.found,total:result.total,wrong:result.wrong,sceneKey:key});
  app.profile.history=app.profile.history.slice(0,20);
  saveProfile();
}
function renderResult(result){
  const meta={
    S:['完美溯源','每一处破绽都被你锁定了。骗子这次没有留下任何可乘之机。','证据链完整'],
    A:['敏锐的观察者','你抓住了大部分关键破绽，再补上遗漏的细节就更稳了。','证据链完整'],
    B:['线索捕手','你已经看见主要套路，但还有几处话术藏在细节里。','基本还原'],
    C:['需要二次勘察','这次漏掉了较多关键信号，认真看完复盘会提升很快。','线索有缺口']
  }[result.grade];
  $('#gradeLetter').textContent=result.grade;
  $('#gradeStamp').textContent=meta[2];
  $('#gradeTitle').textContent=meta[0];
  $('#gradeSubtitle').textContent=meta[1];
  $('#resultHits').textContent=`${result.found}/${result.total}`;
  $('#resultMisses').textContent=String(result.wrong);
  $('#resultTime').textContent=formatTime(result.elapsed);
  $('#resultScore').textContent='0';
  animateNumber($('#resultScore'),result.score,620);
  const chain=$('#resultChain');
  chain.innerHTML='';
  result.caseData.chain.forEach(([label])=>{
    const node=document.createElement('div');
    node.className='chain-node';
    const span=document.createElement('span');
    span.textContent=label;
    node.appendChild(span);
    chain.appendChild(node);
  });
  $('#chainSteps').textContent=`${result.caseData.chain.length} STEPS`;
  $('#viewReportBtn').dataset.caseId=result.caseData.id;
}
function animateNumber(element,target,duration=500){
  const start=performance.now();
  const from=0;
  const step=now=>{
    const progress=Math.min(1,(now-start)/duration);
    const eased=1-Math.pow(1-progress,3);
    element.textContent=String(Math.round(from+(target-from)*eased));
    if(progress<1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function openNextCase(){
  const current=app.currentCase || app.lastResult?.caseData;
  if(!current) return openHome();
  const index=getCaseIndex(current.id);
  const next=CASES[(index+1+CASES.length)%CASES.length];
  openBrief(next.id,'result');
}

function openReport(){
  if(!app.lastResult) return openHome();
  renderReport(app.lastResult);
  switchScreen('report');
  playTone('open');
}
function renderReport(result){
  const caseData=result.caseData;
  $('#reportCode').textContent=`CASE ${caseData.code}`;
  $('#reportTitle').textContent=caseData.title;
  $('#reportDebrief').textContent=caseData.debrief;
  $('#evidenceSummary').textContent=`${result.found} / ${result.total}`;
  const map=$('#traceMap');
  map.innerHTML='';
  caseData.chain.forEach(([label,text],index)=>{
    const item=document.createElement('div');
    item.className='trace-item';
    item.style.animationDelay=`${index*.06}s`;
    const title=document.createElement('span');
    title.textContent=String(index+1).padStart(2,'0')+' · '+label;
    const copy=document.createElement('p');
    copy.textContent=text;
    item.append(title,copy);
    map.appendChild(item);
  });
  const list=$('#flawList');
  list.innerHTML='';
  caseData.flaws.forEach((flaw,index)=>{
    const found=result.foundFlaws.some(item=>item.id===flaw.id);
    const card=document.createElement('article');
    card.className=`flaw-card${found?'':' is-missed'}${index===0?' is-open':''}`;
    card.style.animationDelay=`${index*.035}s`;
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='flaw-toggle';
    toggle.innerHTML=`<span class='flaw-index'>${String(index+1).padStart(2,'0')}</span><span class='flaw-title'><b>${escapeHTML(flaw.type)} · Lv.${flaw.level}</b><span>${escapeHTML(flaw.quote)}</span></span><span class='flaw-status'>${found?'已锁定':'遗漏'}</span><i>+</i>`;
    const detail=document.createElement('div');
    detail.className='flaw-detail';
    detail.innerHTML=`<p class='flaw-quote'>“${escapeHTML(flaw.quote)}”</p><p><b>危险点：</b>${escapeHTML(flaw.danger)}</p><p><b>正确应对：</b>${escapeHTML(flaw.advice)}</p>`;
    toggle.addEventListener('click',()=>card.classList.toggle('is-open'));
    card.append(toggle,detail);
    list.appendChild(card);
  });
}
function getRank(solved){
  if(solved>=CASES.filter(item=>!String(item.id).startsWith('CUSTOM')).length) return ['骗局溯源专家','八类骗局全部纳入你的能力图谱'];
  if(solved>=6) return ['资深反诈侦探','你已经能稳定识别大多数校园骗局'];
  if(solved>=3) return ['骗术拆解师','继续补齐薄弱类型，证据链会越来越完整'];
  if(solved>=1) return ['线索收集者','你已经完成第一次主动溯源'];
  return ['见习观察员','从第一个案件开始建立你的防骗画像'];
}
function renderRadar(values){
  const cx=160, cy=108, radius=73;
  const points=[];
  const labels=[];
  const axes=SCENE_ORDER.map((item,index)=>{
    const angle=-Math.PI/2+index*Math.PI*2/SCENE_ORDER.length;
    const ratio=Math.max(.08,Math.min(1,(values[item[0]] || 20)/100));
    const x=cx+Math.cos(angle)*radius*ratio;
    const y=cy+Math.sin(angle)*radius*ratio;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    const lx=cx+Math.cos(angle)*(radius+28);
    const ly=cy+Math.sin(angle)*(radius+27);
    let anchor='middle';
    if(Math.cos(angle)>.3) anchor='start';
    if(Math.cos(angle)<-.3) anchor='end';
    labels.push(`<text class='radar-label' x='${lx.toFixed(1)}' y='${(ly+2).toFixed(1)}' text-anchor='${anchor}'>${escapeHTML(item[1])}</text>`);
  });
  const grids=[];
  [.25,.5,.75,1].forEach(level=>{
    const gridPoints=SCENE_ORDER.map((_,index)=>{
      const angle=-Math.PI/2+index*Math.PI*2/SCENE_ORDER.length;
      return `${(cx+Math.cos(angle)*radius*level).toFixed(1)},${(cy+Math.sin(angle)*radius*level).toFixed(1)}`;
    }).join(' ');
    grids.push(`<polygon points='${gridPoints}' fill='none' stroke='rgba(214,231,242,.09)' stroke-width='1'/>`);
  });
  const axisLines=SCENE_ORDER.map((_,index)=>{
    const angle=-Math.PI/2+index*Math.PI*2/SCENE_ORDER.length;
    return `<line x1='${cx}' y1='${cy}' x2='${(cx+Math.cos(angle)*radius).toFixed(1)}' y2='${(cy+Math.sin(angle)*radius).toFixed(1)}' stroke='rgba(214,231,242,.07)'/>`;
  }).join('');
  return `<svg viewBox='0 0 320 225' role='img' aria-label='八类骗局能力雷达图'>${grids.join('')}${axisLines}<polygon class='radar-polygon' points='${points.join(' ')}' fill='rgba(242,177,93,.18)' stroke='#f2b15d' stroke-width='2'/>${labels.join('')}<circle cx='${cx}' cy='${cy}' r='2' fill='#f2b177'/></svg>`;
}
function renderProfile(){
  const profile=app.profile;
  const solved=Object.keys(profile.records).length;
  const accuracyList=Object.values(profile.records).map(item=>item.accuracy);
  const average=accuracyList.length?Math.round(accuracyList.reduce((sum,value)=>sum+value,0)/accuracyList.length*100):0;
  const totalScore=Object.values(profile.records).reduce((sum,item)=>sum+(item.score||0),0);
  const rank=getRank(solved);
  const values={};
  SCENE_ORDER.forEach(([key])=>{values[key]=profile.mastery[key] || 20;});
  const rows=SCENE_ORDER.map(([key,label])=>`<div class='mastery-row'><span>${label}</span><div class='mastery-track'><i data-width='${values[key]}'></i></div><b>${values[key]}%</b></div>`).join('');
  const history=profile.history.length?profile.history.slice(0,8).map(item=>`<div class='history-item'><span class='history-grade'>${escapeHTML(item.grade)}</span><div class='history-copy'><b>${escapeHTML(item.title)}</b><span>${new Date(item.date).toLocaleDateString('zh-CN')} · 用时 ${formatTime(item.elapsed)} · 误标 ${item.wrong}</span></div><span class='history-score'>${item.score} 分</span></div>`).join(''):`<div class='empty-profile'>还没有完成案件。<br>完成一次推理后，这里会生成你的能力画像。</div>`;
  $('#profileContent').innerHTML=`
    <section class='profile-rank'><p class='rank-label'>DETECTIVE RANK</p><h1>${rank[0]}</h1><p>${rank[1]}</p><div class='profile-stats'><div><strong>${solved}</strong><span>已破案件</span></div><div><strong>${average}%</strong><span>平均准确率</span></div><div><strong>${totalScore}</strong><span>累计得分</span></div></div></section>
    <section class='radar-card'><p class='hud-label'>EIGHT SCENARIOS</p><h2>防骗能力雷达</h2><div class='radar-wrap'>${renderRadar(values)}</div><div class='mastery-list'>${rows}</div></section>
    <section class='history-card'><p class='hud-label'>RECENT CASES</p><h2>最近记录</h2>${history}</section>
  `;
  requestAnimationFrame(()=>{
    setTimeout(()=>$$('#profileContent .mastery-track i').forEach(bar=>{bar.style.width=`${bar.dataset.width}%`;}),80);
  });
}
function resetProfile(){
  showConfirm('清空能力记录？','所有案件评级、历史得分和能力画像都会被清除，且无法恢复。',()=>{
    app.profile=defaultProfile();
    saveProfile();
    renderProfile();
    renderHomeCases();
    renderLibrary();
    closeConfirm();
    showToast('能力记录已清空');
  },'确认清空');
}

const SCAN_RULES=[
  {regex:/(私下交易|私下转账|脱离平台|平台外|只支持微信|个人账户|安全账户|转到.*卡上)/g,type:'脱离平台/异常收款',danger:'绕开平台担保或个人账户收款，转账后难以追回。',advice:'停止转账，只走官方平台或本人实名账户。'},
  {regex:/(先转|先付|定金|保证金|垫付|解冻费|手续费|充值)/g,type:'诱导预付',danger:'先交钱才能继续交易或返利，是最常见的收割方式。',advice:'未见实物、未确认订单前，不支付任何预付款。'},
  {regex:/(扫码|二维码|陌生App|下载.*App|屏幕共享)/g,type:'诱导扫码下载/共享',danger:'陌生二维码和App可能窃取账号、验证码或直接扣款。',advice:'不扫陌生码，不下载指定App，不共享屏幕。'},
  {regex:/(验证码|银行卡号|身份证号|短信验证码|人脸识别)/g,type:'索取敏感信息',danger:'验证码和银行卡信息一旦泄露，账户资金可能被直接转走。',advice:'任何客服索要验证码，立即停止沟通。'},
  {regex:/(校园贷|注销.*账户|影响征信|征信.*记录|冻结额度)/g,type:'虚构征信焦虑',danger:'用影响征信、注销账户制造恐慌，诱导转账或贷款。',advice:'征信问题只通过官方平台或征信中心核实。'},
  {regex:/(日赚|高收益|返利|连本带利|原价出|双倍赔付|免费送)/g,type:'高收益诱惑',danger:'明显不合理的收益或赔偿，通常用来降低你的警惕。',advice:'先核实平台规则，不因低价和高收益冲动操作。'},
  {regex:/(马上|今晚\d|5分钟|五分钟|超时|名额有限|快点|急用|立刻)/g,type:'制造紧迫感',danger:'限时和催促让你来不及核实，是被骗的重要推手。',advice:'越催越停一下，至少换一个渠道确认。'},
  {regex:/(不要.*(问|挂断|告诉)|别告诉|不方便打电话|手机快没电|我在开会)/g,type:'阻断核实/信息隔离',danger:'阻止你联系家人、同学或官方客服，避免骗局被识破。',advice:'立即挂断，用原有联系方式或官方渠道核实。'}
];
const SAMPLE_SCAN='同学你好，这个号我出价1200，走我们平台有担保。\n先交288保证金，交易完成会和号款一起退给你。\n官方手续费高，你扫这个二维码下载担保App。\n5分钟内决定，不然我就卖给别人了。';
function setScanLoading(loading){
  const button=$('#analyzeBtn');
  button.disabled=loading;
  button.innerHTML=loading?'智能研判中<span>···</span>':'开始智能研判<span>⌁</span>';
}
function analyzeText(text){
  const matches=[];
  const seen=new Set();
  SCAN_RULES.forEach(rule=>{
    rule.regex.lastIndex=0;
    let match;
    while((match=rule.regex.exec(text))!==null){
      const quote=match[0].trim();
      const key=`${rule.type}:${quote}`;
      if(!seen.has(key)){
        seen.add(key);
        matches.push({quote,type:rule.type,danger:rule.danger,advice:rule.advice,index:match.index});
      }
      if(match[0].length===0) break;
    }
  });
  matches.sort((a,b)=>a.index-b.index);
  const hasMoney=/(元|转账|付款|定金|保证金|账户)/.test(text);
  const riskScore=Math.min(98,Math.round(18+matches.length*12+(hasMoney?8:0)));
  let riskLevel='低风险',riskColor='#65e5b2';
  if(riskScore>=70){riskLevel='极高风险';riskColor='#ff6b5f';}
  else if(riskScore>=45){riskLevel='高风险';riskColor='#ff8f83';}
  else if(riskScore>=25){riskLevel='中风险';riskColor='#f2b15d';}
  return {text,matches,riskScore,riskLevel,riskColor};
}
function renderScanResult(data){
  const section=$('#scanResult');
  section.classList.remove('hidden');
  const scoreEl=$('#riskScore');
  scoreEl.style.color=data.riskColor;
  scoreEl.textContent='0';
  animateNumber(scoreEl,data.riskScore,650);
  $('#riskLevel').textContent=data.riskLevel;
  $('#riskLevel').style.color=data.riskColor;
  const orbit=$('.risk-orbit');
  orbit.style.borderColor=`${data.riskColor}55`;
  orbit.style.setProperty('--risk-color',data.riskColor);
  $('#riskSummary').textContent=`发现 ${data.matches.length} 处可疑信号，建议立即停止转账并通过官方渠道核实。`;
  const list=$('#scanFlaws');
  list.innerHTML='';
  data.matches.slice(0,7).forEach((item,index)=>{
    const card=document.createElement('div');
    card.className='scan-flaw';
    card.style.animationDelay=`${index*.045}s`;
    card.innerHTML=`<b>${escapeHTML(item.type)}</b><p>“${escapeHTML(item.quote)}” · ${escapeHTML(item.danger)}</p>`;
    list.appendChild(card);
  });
  section.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function runScan(){
  const text=$('#scanText').value.trim();
  if(!text){showToast('请先粘贴可疑聊天文字');return;}
  setScanLoading(true);
  setTimeout(()=>{
    const data=analyzeText(text);
    app.scanData=data;
    renderScanResult(data);
    setScanLoading(false);
    $('#convertCaseBtn').disabled=data.matches.length===0;
    playTone('finish');
    haptic([10,20,10]);
  },760);
}
function splitScanMessages(text){
  let lines=text.split(/\n+/).map(line=>line.trim()).filter(Boolean);
  if(lines.length===1){
    lines=text.split(/(?<=[。！？!?；;])/).map(line=>line.trim()).filter(Boolean);
  }
  return lines.slice(0,10);
}
function convertScanToCase(){
  const data=app.scanData;
  if(!data || !data.matches.length){showToast('没有足够的可疑信号生成案件');return;}
  const lines=splitScanMessages(data.text);
  const messages=lines.map((line,index)=>{
    const suspicious=data.matches.some(match=>line.includes(match.quote));
    return {id:`cm${index+1}`,role:suspicious?'fraud':'victim',sender:suspicious?'可疑联系人':'你',text:line};
  });
  const flaws=[];
  const seen=new Set();
  data.matches.forEach((match,index)=>{
    if(seen.has(match.quote)) return;
    const message=messages.find(item=>item.text.includes(match.quote));
    if(!message) return;
    seen.add(match.quote);
    flaws.push({id:`cf${flaws.length+1}`,quote:match.quote,type:match.type,level:3,danger:match.danger,advice:match.advice});
  });
  if(!flaws.length){showToast('这段文字无法定位具体破绽');return;}
  const custom={
    id:`CUSTOM_${Date.now()}`,code:'NEW',title:'截图里的可疑聊天',en:'CASE FROM YOUR SCREENSHOT',scene:'自定义案例',sceneKey:'custom',icon:'⌁',difficulty:'实战',minutes:3,threat:'待核实',
    hook:'根据你提供的聊天生成',
    background:'这是一段由用户提供的可疑聊天记录。请找出其中所有高风险表达，并判断对方最终想诱导你做什么。',
    objective:`在这段聊天里找出 ${flaws.length} 处可疑话术。`,
    messages,flaws,
    chain:[
      ['引流接触','可疑联系人主动提及交易或赔付'],
      ['建立信任','使用担保、客服或真实身份包装'],
      ['制造焦虑','通过限时、征信或名额催促决策'],
      ['诱导操作','要求转账、扫码、提供验证码或共享屏幕'],
      ['完成收割','资金转出后继续加码或直接失联']
    ],
    debrief:'这段案例来自你输入的可疑聊天。正式产品中可接入 OCR 与云端大模型，自动完成角色识别和破绽抽取；当前离线版使用本地规则研判。'
  };
  CASES.push(custom);
  openBrief(custom.id,'scan');
  showToast('推理关已生成');
}
function shareResult(){
  if(!app.lastResult) return;
  const result=app.lastResult;
  const text=`我在《骗局溯源·反诈推理师》完成了「${result.caseData.title}」，评级 ${result.grade}，锁定 ${result.found}/${result.total} 处破绽。来试试你能不能识破？`;
  if(navigator.share){
    navigator.share({title:'骗局溯源·反诈推理师',text,url:/^https?:/.test(location.href)?location.href:undefined}).catch(()=>{});
  }else if(navigator.clipboard){
    navigator.clipboard.writeText(text).then(()=>showToast('战绩文字已复制')).catch(()=>showToast('当前环境不支持分享'));
  }else{showToast('当前环境不支持分享');}
}
function bindEvents(){
  $('#soundBtn').addEventListener('click',()=>{app.profile.settings.sound=!app.profile.settings.sound;saveProfile();updateSoundUI();if(app.profile.settings.sound)playTone('tap');});
  $('#featureStart').addEventListener('click',()=>openBrief(app.featureCase.id,'home'));
  $('#homeCaseList').addEventListener('click',event=>{const card=event.target.closest('[data-case-id]');if(card)openBrief(card.dataset.caseId,'home');});
  $('#viewAllBtn').addEventListener('click',()=>{app.activeFilter='全部';switchScreen('library');});
  $('#scanQuick').addEventListener('click',()=>switchScreen('scan'));
  $('#profileQuick').addEventListener('click',openProfile);
  $$('.nav-item').forEach(button=>button.addEventListener('click',()=>{
    const nav=button.dataset.nav;
    if(nav==='home')openHome();
    if(nav==='library'){app.activeFilter='全部';switchScreen('library');}
    if(nav==='profile')openProfile();
  }));
  $('#filterBar').addEventListener('click',event=>{const pill=event.target.closest('[data-filter]');if(!pill)return;app.activeFilter=pill.dataset.filter;renderLibrary();playTone('tap');});
  $('#caseGrid').addEventListener('click',event=>{const card=event.target.closest('[data-case-id]');if(card)openBrief(card.dataset.caseId,'library');});
  $('#briefBack').addEventListener('click',()=>{if(app.briefReturn==='result'||app.briefReturn==='scan')switchScreen(app.briefReturn);else switchScreen('library');});
  $('#startCaseBtn').addEventListener('click',startGame);
  $('#gameExit').addEventListener('click',()=>{
    if(!app.game || app.game.submitted){openHome();return;}
    showConfirm('退出本局？','当前找到的证据不会保存，退出后需要重新勘察。',()=>{clearInterval(app.game.timerId);closeConfirm();switchScreen('brief');},'确认退出');
  });
  $('#hintBtn').addEventListener('click',showHint);
  $('#hintClose').addEventListener('click',()=>$('#hintBanner').classList.add('hidden'));
  $('#submitBtn').addEventListener('click',requestSubmit);
  $('#resultBackHome').addEventListener('click',openHome);
  $('#resultShare').addEventListener('click',shareResult);
  $('#viewReportBtn').addEventListener('click',openReport);
  $('#nextCaseBtn').addEventListener('click',openNextCase);
  $('#reportBack').addEventListener('click',()=>switchScreen('result'));
  $('#reportProfile').addEventListener('click',openProfile);
  $('#reportNextBtn').addEventListener('click',openNextCase);
  $('#profileBack').addEventListener('click',openHome);
  $('#profileReset').addEventListener('click',resetProfile);
  $('#scanBack').addEventListener('click',openHome);
  $('#scanText').addEventListener('input',()=>{$('#scanCharCount').textContent=`${$('#scanText').value.length} 字`;});
  $('#sampleScanBtn').addEventListener('click',()=>{$('#scanText').value=SAMPLE_SCAN;$('#scanText').dispatchEvent(new Event('input'));showToast('示例已载入');playTone('tap');});
  $('#analyzeBtn').addEventListener('click',runScan);
  $('#convertCaseBtn').addEventListener('click',convertScanToCase);
  $('#screenshotInput').addEventListener('change',event=>{
    const file=event.target.files?.[0];
    if(!file) return;
    const preview=$('#uploadPreview');
    preview.src=URL.createObjectURL(file);
    preview.hidden=false;
    $('.upload-visual').hidden=true;
    showToast('截图已载入，请粘贴图中文字进行离线研判');
  });
  $('#confirmCancel').addEventListener('click',closeConfirm);
  $('#confirmOk').addEventListener('click',()=>{if(showConfirm.callback)showConfirm.callback();});
  $('#confirmModal').addEventListener('click',event=>{if(event.target.id==='confirmModal')closeConfirm();});
  $('#sheetBackdrop').addEventListener('click',event=>{if(event.target.id==='sheetBackdrop')$('#sheetBackdrop').classList.add('hidden');});
  $('#sheetAction').addEventListener('click',()=>$('#sheetBackdrop').classList.add('hidden'));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeConfirm();$('#sheetBackdrop').classList.add('hidden');}});
}
function init(){
  app.profile=loadProfile();
  renderFeature();
  renderHomeCases();
  renderFilters();
  renderLibrary();
  updateSoundUI();
  bindEvents();
  switchScreen('home',{instant:true});
}
init();

