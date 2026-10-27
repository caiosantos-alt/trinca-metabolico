const PROFILES={
  caio:{pid:'caio',nome:'Caio',pfx:'',ls:'trinca:v2',sex:'M',mode:'perder',attr:'',sub:'Perda de gordura, força e ombros'},
  munique:{pid:'munique',nome:'Munique',pfx:'m_',ls:'trinca:v2:m',sex:'F',mode:'manter',attr:'m',sub:'Condicionamento, corrida e saúde'}
};
const DAYS=[['Seg','Segunda',1],['Ter','Terça',2],['Qua','Quarta',3],['Qui','Quinta',4],['Sex','Sexta',5],['Sáb','Sábado',6],['Dom','Domingo',0]];
const LETTER={Seg:'A',Qua:'B',Sex:'C','Sáb':'D'};
const LET=['A','B','C','D'];
const CIRC=[['ombros','Ombros','up'],['peito','Peito','up'],['braco','Braço','up'],['cintura','Cintura','down'],['abdomen','Abdômen','down'],['quadril','Quadril','down'],['coxa','Coxa','up'],['panturrilha','Panturrilha','flat'],['pescoco','Pescoço','flat']];
const CN=Object.fromEntries(CIRC.map(c=>[c[0],c[1]]));
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const f1=n=>n.toFixed(1).replace('.',',');
const f2=n=>n.toFixed(2).replace('.',',');
const sgn=d=>(d>0.049?'+':d<-0.049?'−':'')+f1(Math.abs(d));
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const tms=s=>Date.parse(s+'T00:00:00Z');
const br=s=>{const[y,m,d]=s.split('-');return d+'/'+m+'/'+y};
const brs=s=>{const[y,m,d]=s.split('-');return d+'/'+m};
const num=v=>parseFloat(String(v).replace(',','.'));
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const todayS=()=>ymd(new Date());
const TODAY=DAYS.findIndex(d=>d[2]===new Date().getDay());
function mondayOf(s){const d=new Date(tms(s));d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10)}
function addDays(s,n){return new Date(tms(s)+n*864e5).toISOString().slice(0,10)}

/* ---------- estado e salvamento ---------- */
const fresh=()=>({log:{},sets:{},loads:{},prefs:{},diary:{},meals:{},foods:{}});
let P=null,D=null,S=fresh();
let db=null,dbState='init',ro=false,unsubs=[];
const pend=new Map(),chain=new Map(),dirty=new Set();
let first={log:false,sets:false,diary:false,meals:false};
const sexOf=()=>S.prefs.sex||P.sex;
const isF=()=>sexOf()==='F';
const modeOf=()=>S.prefs.mode||P.mode;
function saveLocal(){if(!P)return;try{localStorage.setItem(P.ls,JSON.stringify(S))}catch(e){}}
function loadLocal(){
  try{const v=JSON.parse(localStorage.getItem(P.ls)||'null');if(v)S=Object.assign(fresh(),v)}catch(e){}
  if(P.pid!=='caio')return;
  try{ if(localStorage.getItem('migrated2'))return;
    const ol=JSON.parse(localStorage.getItem('log')||'null');
    if(ol&&ol.length)ol.forEach(r=>{if(!S.log[r.d])S.log[r.d]={d:r.d,kg:r.kg,c:r.c||{}};if(r.cm)S.prefs.cm=r.cm});
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);
      if(k.startsWith('kg:'))S.loads[k.slice(3)]=JSON.parse(localStorage.getItem(k));
      const m=k.match(/^d:(\d+):(\S+)$/);if(m&&LETTER[m[2]])S.sets[m[1]+'_'+LETTER[m[2]]]={w:+m[1],L:LETTER[m[2]],done:JSON.parse(localStorage.getItem(k))}}
    localStorage.setItem('migrated2','1')}catch(e){}
}
function dataFor(p){
  const[c,id]=p.split('/');
  if(c==='log')return S.log[id]||null;
  if(c==='sets')return S.sets[id]||null;
  if(c==='diary')return S.diary[id]||null;
  if(c==='meals')return S.meals[id]||null;
  return id==='loads'?{m:S.loads}:id==='foods'?{m:S.foods}:S.prefs;
}
function persist(path){
  saveLocal();
  if(!db){setStatus();return}
  const o=pend.get(path);if(o)clearTimeout(o.t);
  dirty.add(path);
  pend.set(path,{t:setTimeout(()=>flush(path),500)});
  setStatus();
}
function flush(path){
  pend.delete(path);
  const pfx=P.pfx,raw=dataFor(path),data=raw===null?null:JSON.parse(JSON.stringify(raw));
  const prev=chain.get(path)||Promise.resolve();
  const p=prev.then(async()=>{
    const[c,id]=path.split('/'),ref=db.collection(pfx+c).doc(id);
    try{
      if(data===null)await ref.delete();else await ref.set(data);
      if(!pend.has(path))dirty.delete(path);
      if(dbState==='error'&&dirty.size===0)dbState='ok';
    }catch(e){dbState='error'}
    setStatus();
  });
  chain.set(path,p);
}
function setStatus(){
  const b=$('#sync');if(!b)return;let t,c;
  if(dbState==='local'){t='Só neste aparelho';c='warn'}
  else if(dbState==='error'){t=ro?'Sem permissão':'Falha · tocar';c='bad'}
  else if(dbState==='init'){t='Conectando';c='info'}
  else if(dirty.size){t='Salvando';c='info'}
  else{t='Salvo';c='ok'}
  b.textContent=t;b.dataset.s=c;
}
let needRender=false;
function softRender(){
  const a=document.activeElement;
  if(a&&a.tagName==='INPUT'){needRender=true;return}
  render();
}
document.addEventListener('focusout',()=>{if(needRender){needRender=false;setTimeout(()=>{if(!document.activeElement||document.activeElement.tagName!=='INPUT')render()},50)}});
function applyColl(name,snap){
  const next={};snap.docs.forEach(x=>{const v=x.data();if(v)next[x.id]=v});
  for(const p of pend.keys()){if(p.startsWith(name+'/')){const id=p.slice(name.length+1);if(S[name][id])next[id]=S[name][id];else delete next[id]}}
  if(!snap.metadata.fromCache&&!first[name]){first[name]=true;for(const id in S[name])if(!next[id]){next[id]=S[name][id];persist(name+'/'+id)}}
  const ch=JSON.stringify(next)!==JSON.stringify(S[name]);
  S[name]=next;saveLocal();
  if(dbState==='init')dbState='ok';
  setStatus();if(ch)softRender();
}
function seedDefaults(){
  if(!P||P.pid!=='munique'||S.prefs.seeded)return;
  const st=mondayOf(todayS());
  S.prefs=Object.assign({cm:172,sex:'F',mode:'manter',start:st,seeded:true},S.prefs);
  if(!Object.keys(S.log).length){S.log[st]={d:st,kg:61,c:{}};persist('log/'+st)}
  persist('state/prefs');softRender();
}
function applyDoc(kind,snap){
  const path='state/'+kind,pending=pend.has(path),mk=kind==='loads'?'loads':kind==='foods'?'foods':null;
  const d=snap.exists?snap.data():null;
  if(!pending){
    if(d){
      const v=mk?(d.m||{}):d,cur=mk?S[mk]:S.prefs;
      if(JSON.stringify(v)!==JSON.stringify(cur)){if(mk)S[mk]=v;else S.prefs=v;saveLocal();softRender()}
    }else if(!snap.metadata.fromCache){
      if(kind==='prefs'&&!Object.keys(S.prefs).length)seedDefaults();
      else{const loc=mk?S[mk]:S.prefs;if(Object.keys(loc).length)persist(path)}
    }
  }
  if(dbState==='init')dbState='ok';setStatus();
}
function subscribe(){
  unsubs.forEach(f=>{try{f()}catch(e){}});unsubs=[];
  if(!db||!P)return;
  const pid=P.pid,pf=P.pfx,g=fn=>s=>{if(P&&P.pid===pid)fn(s)};
  const err=()=>{dbState='error';setStatus()};
  try{
    ['log','sets','diary','meals'].forEach(n=>unsubs.push(db.collection(pf+n).onSnapshot(g(s=>applyColl(n,s)),err)));
    ['loads','prefs','foods'].forEach(k=>unsubs.push(db.collection(pf+'state').doc(k).onSnapshot(g(s=>applyDoc(k,s)),err)));
  }catch(e){err()}
}
async function initDb(){
  let d=null;
  try{d=window.claude&&window.claude.use?await window.claude.use('db'):null}catch(e){}
  if(!d){dbState='local';setStatus();seedDefaults();return}
  db=d;
  try{const u=window.claude.use?await window.claude.use('user'):null;if(u&&u.can&&(await u.can('data.write'))===false){ro=true;softRender()}}catch(e){}
  subscribe();
}
function setProfile(pid){
  if(P&&P.pid===pid){view='treino';render();return}
  if(P&&db)[...pend.keys()].forEach(p=>{clearTimeout(pend.get(p).t);flush(p)});
  unsubs.forEach(f=>{try{f()}catch(e){}});unsubs=[];
  P=PROFILES[pid];D=DATA[pid];S=fresh();first={log:false,sets:false,diary:false,meals:false};
  pend.clear();chain.clear();dirty.clear();
  document.documentElement.dataset.p=P.attr;
  try{localStorage.setItem('trinca:pid',pid)}catch(e){}
  loadLocal();
  if(dbState==='local')seedDefaults();
  view='treino';actDate=null;nutDate=null;nutSel=null;nutQ='';sel='cintura';formOpen=false;weekTouched=false;compSel='lean';
  week=curWeek();di=TODAY;
  subscribe();render();
}

/* ---------- séries e cálculos ---------- */
function series(key){
  return Object.values(S.log).filter(r=>key==='kg'?r.kg!=null:(r.c||{})[key]!=null)
    .map(r=>({d:r.d,v:key==='kg'?r.kg:r.c[key]})).sort((a,b)=>a.d<b.d?-1:1);
}
function wdir(){return modeOf()==='manter'?0:((S.prefs.goal!=null&&wstats()&&S.prefs.goal>wstats().first.v)?1:-1)}
function wstats(){
  const ws=series('kg');if(!ws.length)return null;
  const first=ws[0],last=ws[ws.length-1],prev=ws.length>1?ws[ws.length-2]:null;
  const days=(tms(last.d)-tms(first.d))/864e5,total=last.v-first.v;
  const rate=days>=6?total/(days/7):null;
  const ref=ws.filter(x=>x.d<=addDays(last.d,-7)).pop();
  return{ws,first,last,prev,days,total,rate,wk:ref?last.v-ref.v:null};
}
function wGood(d){const w=wdir();return w===0?null:d*w>0}
function weekOf(d){return S.prefs.start?Math.floor((tms(d)-tms(S.prefs.start))/(7*864e5))+1:null}
function ensureStart(d){if(!S.prefs.start){S.prefs.start=mondayOf(d||todayS());persist('state/prefs')}}
function dirOf(k){const b=CIRC.find(c=>c[0]===k)[2];return modeOf()==='manter'&&b==='down'?'hold':b}
function goodFor(k,d){
  const dir=dirOf(k);
  if(dir==='up')return d>0.3?true:d<-0.3?false:null;
  if(dir==='down')return d<-0.3?true:d>0.3?false:null;
  if(dir==='hold')return Math.abs(d)<=1.5?true:false;
  return null;
}
function zoneState(key){
  const s=series(key);
  if(!s.length)return'none';
  if(s.length<2)return'flat';
  const g=goodFor(key,s[s.length-1].v-s[0].v);
  return g===null?'flat':g?'good':'bad';
}
function curWeek(){const w=weekOf(todayS());return w==null?1:clamp(w,1,8)}

/* ---------- composição estimada ---------- */
function latestOn(key,date,maxDays){
  const rs=Object.values(S.log).filter(r=>r.d<=date&&(r.c||{})[key]!=null&&(tms(date)-tms(r.d))/864e5<=maxDays).sort((a,b)=>a.d<b.d?-1:1);
  return rs.length?rs[rs.length-1].c[key]:null;
}
function weightOn(date,maxDays){
  const rs=Object.values(S.log).filter(r=>r.d<=date&&r.kg!=null&&(tms(date)-tms(r.d))/864e5<=maxDays).sort((a,b)=>a.d<b.d?-1:1);
  return rs.length?rs[rs.length-1].kg:null;
}
function bfNavy(waist,neck,hip,h,F){
  if(!(waist&&neck&&h))return null;
  if(F&&!hip)return null;
  const x=F?waist+hip-neck:waist-neck;if(x<=0)return null;
  const bf=F?495/(1.29579-0.35004*Math.log10(x)+0.221*Math.log10(h))-450:495/(1.0324-0.19077*Math.log10(x)+0.15456*Math.log10(h))-450;
  return bf>3&&bf<60?bf:null;
}
function waistKey(){return isF()?'cintura':'abdomen'}
function compSeries(){
  const h=S.prefs.cm,F=isF(),out=[];
  if(!h)return out;
  const wk=waistKey(),alt=F?null:'cintura';
  const dates=[...new Set(Object.values(S.log).filter(r=>(r.c||{})[wk]!=null||(alt&&(r.c||{})[alt]!=null)).map(r=>r.d))].sort();
  dates.forEach(d=>{
    const waist=latestOn(wk,d,0)??(alt?latestOn(alt,d,0):null);
    const kg=weightOn(d,10);if(!waist||!kg)return;
    const neck=latestOn('pescoco',d,45),hip=latestOn('quadril',d,45);
    let bf=bfNavy(waist,neck,hip,h,F),m='marinha';
    if(bf==null&&S.prefs.age){const bmi=kg/((h/100)**2);bf=1.2*bmi+0.23*S.prefs.age-10.8*(F?0:1)-5.4;m='imc';if(!(bf>3&&bf<60))bf=null}
    if(bf==null)return;
    const fat=kg*bf/100,lean=kg-fat;
    out.push({d,kg,bf,fat,lean,water:lean*0.73,m});
  });
  return out;
}
function compMissing(){
  const m=[],F=isF();
  if(!S.prefs.cm)m.push('a altura (em Ajustes)');
  if(!series('kg').length)m.push('o peso');
  if(!series(waistKey()).length&&!(!F&&series('cintura').length))m.push(F?'a cintura':'o abdômen (na altura do umbigo)');
  if(!series('pescoco').length&&!S.prefs.age)m.push('o pescoço');
  if(F&&!series('quadril').length)m.push('o quadril');
  return m;
}

/* ---------- treino ---------- */
let actDate=null;
let week=1,di=TODAY,view='escolha',sel='cintura',formOpen=false,weekTouched=false,compSel='lean';
function bandIdx(){const i=D.bands.findIndex(b=>week<=b);return i<0?D.bands.length-1:i}
function presc(e){return e.p[bandIdx()]}
function parse(p){const m=p.match(/^(\d+)(?:–(\d+))?\s*x\s*(.+)$/);return{min:+m[1],max:+(m[2]||m[1]),reps:m[3]}}
const isTimeReps=r=>/(\ss|\smin)(\/lado)?$/.test(r);
function restSec(s){const n=[...s.matchAll(/\d+/g)].map(x=>+x[0]);return n.length?Math.max(...n):0}
const setsRec=(w,L)=>S.sets[w+'_'+L];
function progressOf(w,L){
  const rec=setsRec(w,L),done=rec?rec.done:{};let tot=0,got=0;
  D.ex.filter(e=>e.dia===L).forEach(e=>{
    const sv=week;week=w;const p=parse(presc(e));week=sv;
    tot+=p.min;got+=(done[e.nome]||[]).slice(0,p.min).filter(Boolean).length});
  return{got,tot};
}
function renderHeader(){
  $('#weeks').innerHTML=D.prog.map(p=>`<button aria-pressed="${p.sem===week}" data-w="${p.sem}" aria-label="Semana ${p.sem}">${p.sem}</button>`).join('');
  $('#days').innerHTML=DAYS.map((d,i)=>`<button aria-pressed="${i===di}" class="${i===TODAY?'today':''}" data-d="${i}"><b>${LETTER[d[0]]||'·'}</b><small>${d[0]}</small></button>`).join('');
}
function kneeMsg(n){
  if(n==null)return null;
  if(n<=2)return['good','Tudo certo para treinar. Mantenha o joelho alinhado ao pé.'];
  if(n===3)return['warn','No limite do tolerável (até 3/10). Reduza carga ou amplitude e observe como fica amanhã.'];
  return['bad','Acima de 3/10: pelo plano, reduza ou pare e procure avaliação de fisioterapeuta ou médico.'];
}
function diaryPatch(patch,date){
  const t=date||todayS(),r=S.diary[t]||(S.diary[t]={d:t});
  Object.keys(patch).forEach(k=>{if(patch[k]==null)delete r[k];else r[k]=patch[k]});
  persist('diary/'+t);
}
function checkin(){
  const r=S.diary[todayS()]||{};
  const km=D.knee?kneeMsg(r.knee):null;
  let h=`<section class="card"><div class="head"><h3>Check-in de hoje</h3></div><div class="form">
    <label>Sono (h)<input type="text" inputmode="decimal" id="ci-sono" value="${r.sono!=null?f1(r.sono):''}" placeholder="7,5"></label>
    <label>Cardio (min)<input type="text" inputmode="numeric" id="ci-cardio" value="${r.cardio!=null?r.cardio:''}" placeholder="0"></label>
    <div class="wide lbl">Energia</div>
    <div class="en wide">${[1,2,3,4,5].map(n=>`<button data-en="${n}" aria-pressed="${r.en===n}">${n}</button>`).join('')}</div>`;
  if(D.knee)h+=`<div class="wide lbl">Dor no joelho hoje (0 a 10)</div>
    <div class="kn wide">${Array.from({length:11},(_,n)=>`<button data-knee="${n}" class="${n<=2?'good':n===3?'warn':'bad'}" aria-pressed="${r.knee===n}">${n}</button>`).join('')}</div>
    ${km?`<p class="kmsg wide ${km[0]}">${km[1]}</p>`:''}`;
  return h+`</div></section>`;
}
function roNote(){return ro?`<div class="note ro"><b>Seu acesso é só leitura</b><span>Peça ao Caio para compartilhar o app com você como Editor, sem link público. Enquanto isso, o que você lançar não será salvo.</span></div>`:''}
function renderDay(){
  const d=DAYS[di],row=D.sem[di],pr=D.prog[week-1],L=LETTER[d[0]];
  let h=roNote()+`<div class="daytitle"><h2>${esc(row.dia.split(' — ')[0])}</h2><div class="count" id="count"></div></div>`;
  if(D.alert.length&&(L||row.key==='ter'))h+=`<div class="note warnbox"><b>Atenção</b>${D.alert.map(a=>`<span>${esc(a)}</span>`).join('')}</div>`;
  if(di===TODAY)h+=checkin();
  if(L){
    const rec=setsRec(week,L),done=rec?rec.done:{};
    h+=`<div class="bar"><i id="barfill"></i></div>`;
    h+=`<div class="note"><b>${esc(row.mus)}</b><span>Semana ${week} · ${esc(pr.fase)} · ${esc(pr.esforco)}. ${esc(pr.volume)}.</span><span>Cardio: ${esc(pr.cardio)}.</span><span>${esc(pr.tec)}</span></div>`;
    h+=D.ex.filter(e=>e.dia===L).map(e=>{
      const p=parse(presc(e)),isTime=isTimeReps(p.reps),kg=S.loads[e.nome]||'';
      const sets=Array.from({length:p.max},(_,i)=>`<button data-ex="${esc(e.nome)}" data-set="${i}" class="${i>=p.min?'opt':''}" aria-pressed="${!!(done[e.nome]||[])[i]}" aria-label="Série ${i+1}">${i+1}</button>`).join('');
      return `<section class="card" data-card="${esc(e.nome)}">
        <div class="head"><h3>${esc(e.nome)}</h3><div class="presc">${esc(presc(e))}</div></div>
        <div class="meta">${e.desc&&e.desc!=='—'?`<span class="chip">Descanso ${esc(e.desc)}</span>`:''}<span class="chip">${esc(e.rpe||pr.esforco)}</span></div>
        <div class="sets">${sets}${isTime?'':`<label class="kg"><input type="text" inputmode="decimal" id="kg-${esc(e.nome)}" data-kg="${esc(e.nome)}" value="${esc(kg)}" placeholder="0" aria-label="Carga em kg"><span>kg</span></label>`}</div>
        <details><summary>Técnica</summary><p>${esc(e.obs)}</p></details>
      </section>`}).join('');
    h+=`<button class="reset" id="reset">Limpar marcações do dia</button>`;
  }else{
    const aer=row.key?pr[row.key]:row.aer,hab=row.key?pr.crit:row.hab;
    h+=`<div class="note"><b>${esc(row.mus)}</b>${aer?`<span>${esc(aer)}</span>`:''}${hab?`<span>${esc(hab)}</span>`:''}</div>`;
    if(pr.mov)h+=`<div class="note"><b>Semana ${week}</b><span>Movimento diário: ${esc(pr.mov)}.</span></div>`;
    if(row.key==='ter'&&D.intervalo&&week>=5&&week<=7)h+=`<section class="card"><div class="head"><h3>Corrida intervalada</h3></div>
      <p class="fine" style="font-size:14px">${esc(D.intervalo.texto)}.</p><p class="fine">${esc(D.intervalo.cond)}</p>
      <button class="ivbtn" id="ivstart">Iniciar ${D.intervalo.reps} × (${D.intervalo.trote/60} min trote + ${D.intervalo.cam/60} min caminhada)</button></section>`;
  }
  $('#main').innerHTML=h;
  if(L)updateProgress();
}
function updateProgress(){
  const L=LETTER[DAYS[di][0]],rec=setsRec(week,L),done=rec?rec.done:{};let tot=0,got=0;
  D.ex.filter(e=>e.dia===L).forEach(e=>{
    const p=parse(presc(e)),n=(done[e.nome]||[]).slice(0,p.min).filter(Boolean).length;
    tot+=p.min;got+=n;
    const c=document.querySelector(`[data-card="${CSS.escape(e.nome)}"]`);if(c)c.classList.toggle('complete',n>=p.min)});
  const c=$('#count');if(c)c.textContent=`${got}/${tot} séries`;
  const b=$('#barfill');if(b)b.style.width=(tot?got/tot*100:0)+'%';
}
let timer=null,left=0;
const fmt=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
function vib(){try{navigator.vibrate&&navigator.vibrate([300,150,300])}catch(e){}}
function tick(){left--;if(left<=0){clearInterval(timer);timer=null;$('#clock').textContent='0:00';$('#rest').classList.add('end');$('#restlbl').textContent='próxima série';vib()}else $('#clock').textContent=fmt(left)}
function startRest(sec,name){$('#rest').classList.remove('iv');left=sec;$('#rest').classList.add('on');$('#rest').classList.remove('end');$('#restlbl').textContent='descanso · '+name;$('#clock').textContent=fmt(left);clearInterval(timer);timer=setInterval(tick,1000)}
function startInterval(){
  const c=D.intervalo;let rep=1,ph='trote';left=c.trote;
  const R=$('#rest');R.classList.add('on','iv');R.classList.remove('end');
  const show=()=>{$('#restlbl').textContent=(ph==='trote'?'TROTE':'CAMINHADA')+' · '+rep+'/'+c.reps;$('#clock').textContent=fmt(left)};
  show();clearInterval(timer);
  timer=setInterval(()=>{
    left--;
    if(left<=0){
      if(ph==='trote'){ph='cam';left=c.cam}
      else{rep++;if(rep>c.reps){clearInterval(timer);timer=null;$('#clock').textContent='0:00';$('#restlbl').textContent='concluído';R.classList.add('end');vib();return}ph='trote';left=c.trote}
      vib();
    }
    show();
  },1000);
}
$('#plus').onclick=()=>{left=Math.max(left,0)+15;$('#rest').classList.remove('end');$('#clock').textContent=fmt(left);if(!timer)timer=setInterval(tick,1000)};
$('#stop').onclick=()=>{clearInterval(timer);timer=null;$('#rest').classList.remove('on','iv','end')};

/* ---------- atividade (Apple Watch / Saúde, lançamento manual) ---------- */
const GOAL0={move:500,ex:30,steps:8000};
const goalsOf=()=>Object.assign({},GOAL0,S.prefs.goals||{});
const WD=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const wdOf=d=>WD[new Date(tms(d)).getUTCDay()];
const ACT=[['move','Movimento','kcal',5000,'500'],['ex','Exercício','min',600,'30'],['steps','Passos','',100000,'8000'],['km','Distância','km',200,'5,0'],['fl','Lances de escada','',1000,'10'],['wk','Calorias do treino','kcal',5000,'250']];
function actWin(end,n){return Array.from({length:n},(_,i)=>addDays(end,-i)).map(d=>Object.assign({d},S.diary[d]||{}))}
function avgOf(rows,k){const v=rows.filter(r=>r[k]!=null);return v.length?v.reduce((a,r)=>a+r[k],0)/v.length:null}
const sumOf=(rows,k)=>rows.reduce((a,r)=>a+(r[k]||0),0);
const fi=n=>Math.round(n).toLocaleString('pt-BR');
function actTips(){
  const g=goalsOf(),cur=actWin(actDate,7),prev=actWin(addDays(actDate,-7),7),out=[];
  const logged=cur.filter(r=>ACT.some(a=>r[a[0]]!=null)).length;
  if(logged<3){out.push({t:'info',x:'Lance a atividade de pelo menos 3 dias da semana para as dicas aparecerem.'});return out}
  const am=avgOf(cur,'move'),ae=avgOf(cur,'ex'),as=avgOf(cur,'steps'),ps=avgOf(prev,'steps');
  const exDays=cur.filter(r=>r.ex!=null&&r.ex>=g.ex).length;
  if(am!=null){const p=am/g.move;
    out.push(p>=1?{t:'good',x:`Movimento médio de ${fi(am)} kcal por dia, acima da meta de ${fi(g.move)}.`}
      :p<0.7?{t:'warn',x:`Movimento médio de ${fi(am)} kcal por dia, abaixo de 70% da meta (${fi(g.move)}). Uma caminhada de 20 a 30 minutos nos dias mais parados ajuda a recuperar.`}
      :{t:'info',x:`Movimento médio de ${fi(am)} kcal por dia, perto da meta de ${fi(g.move)}.`})}
  if(ae!=null)out.push(exDays>=5?{t:'good',x:`${exDays} de 7 dias com ${g.ex} minutos de exercício ou mais.`}
    :exDays>=3?{t:'info',x:`${exDays} de 7 dias com ${g.ex} minutos de exercício ou mais. Mais um dia leve já ajuda.`}
    :{t:'warn',x:`Só ${exDays} de 7 dias com ${g.ex} minutos de exercício. Os treinos e as caminhadas leves contam.`});
  if(as!=null&&ps!=null&&ps>0){const ch=(as-ps)/ps*100;
    if(ch<=-15)out.push({t:'warn',x:`Passos médios ${fi(as)} por dia, ${fi(Math.abs(ch))}% menos que na semana anterior.`});
    else if(ch>=15){
      if(D.knee&&ch>=30)out.push({t:'warn',x:`Passos médios subiram ${fi(ch)}% em relação à semana anterior. Aumente aos poucos e observe o joelho no dia seguinte.`});
      else out.push({t:'good',x:`Passos médios ${fi(as)} por dia, ${fi(ch)}% a mais que na semana anterior.`})}
  }else if(as!=null)out.push({t:as>=g.steps?'good':'info',x:`Passos médios de ${fi(as)} por dia${as>=g.steps?', acima da meta':' (meta '+fi(g.steps)+')'}.`});
  const st=wstats();
  if(modeOf()==='perder'&&st&&st.wk!=null&&Math.abs(st.wk)<0.2&&am!=null&&am<g.move)out.push({t:'warn',x:'Peso parado há uma semana e Movimento abaixo da meta. Antes de mexer no treino, tente subir o movimento diário.'});
  const sono=avgOf(cur,'sono');
  if(sono!=null&&sono<6.5)out.push({t:'info',x:`Sono médio de ${f1(sono)} h na semana. Com pouco sono a recuperação cai: evite aumentar a carga junto.`});
  const wk=sumOf(cur,'wk'),km=sumOf(cur,'km'),fl=sumOf(cur,'fl'),pt=[];
  if(wk>0)pt.push(fi(wk)+' kcal em treinos');if(km>0)pt.push(f1(km)+' km percorridos');if(fl>0)pt.push(fi(fl)+' lances de escada');
  if(pt.length)out.push({t:'info',x:'Na semana: '+pt.join(', ')+'.'});
  const fp=sumOf(prev,'fl');
  if(D.knee&&fl>=30&&fl>fp*1.3)out.push({t:'warn',x:'Muitos lances de escada para o joelho nesta semana. Se doer, prefira o elevador por alguns dias e siga a regra de dor do plano.'});
  return out;
}
function renderAtiv(){
  if(!actDate)actDate=todayS();
  const r=S.diary[actDate]||{},g=goalsOf(),isToday=actDate===todayS();
  const bar=(k,v,goal,unit)=>goal?`<div class="goal"><div class="row"><span id="at-${k}">${v!=null?fi(v)+' de '+fi(goal)+' '+unit:'Meta '+fi(goal)+' '+unit}</span></div><div class="bar"><i id="ab-${k}" style="width:${v!=null?clamp(v/goal*100,0,100):0}%"></i></div></div>`:'';
  let h=roNote()+`<div class="daytitle"><h2>Atividade</h2><div class="count">${isToday?'hoje':wdOf(actDate)+' '+brs(actDate)}</div></div>`;
  h+=`<section class="card"><div class="head"><button class="ghost" data-actd="-1" aria-label="Dia anterior">‹ Anterior</button><button class="ghost" data-actd="1" ${isToday?'disabled':''} aria-label="Próximo dia">Próximo ›</button></div>
    <p class="fine">Copie do app Saúde (iPhone) ou do Apple Watch. Tudo é opcional.</p>
    <div class="form">${ACT.map(([k,n,u,mx,ph],i)=>`<label>${n}${u?' ('+u+')':''}<input type="text" inputmode="decimal" id="a-${k}" value="${r[k]!=null?(k==='km'?f1(r[k]):r[k]):''}" placeholder="${ph}"></label>`).join('')}</div>
    ${bar('move',r.move,g.move,'kcal')}${bar('ex',r.ex,g.ex,'min')}${bar('steps',r.steps,g.steps,'passos')}</section>`;
  const ti=actTips();
  h+=`<section class="card"><div class="head"><h3>Leitura da semana</h3></div><ul class="ins">${ti.map(i=>`<li class="${i.t}">${esc(i.x)}</li>`).join('')}</ul></section>`;
  const rows=actWin(actDate,7);
  h+=`<section class="card"><div class="head"><h3>Últimos 7 dias</h3></div><div class="hist2"><div class="arow ahead"><span>Dia</span><span>Mov.</span><span>Min</span><span>Passos</span><span>Km</span></div>`
    +rows.map(x=>`<div class="arow"><span>${wdOf(x.d)} ${brs(x.d)}</span><span>${x.move!=null?fi(x.move):'–'}</span><span>${x.ex!=null?fi(x.ex):'–'}</span><span>${x.steps!=null?fi(x.steps):'–'}</span><span>${x.km!=null?f1(x.km):'–'}</span></div>`).join('')
    +`<div class="arow ahead"><span>Média</span><span>${avgOf(rows,'move')!=null?fi(avgOf(rows,'move')):'–'}</span><span>${avgOf(rows,'ex')!=null?fi(avgOf(rows,'ex')):'–'}</span><span>${avgOf(rows,'steps')!=null?fi(avgOf(rows,'steps')):'–'}</span><span>${avgOf(rows,'km')!=null?f1(avgOf(rows,'km')):'–'}</span></div></div></section>`;
  h+=`<section class="card"><details id="gl"><summary>Metas diárias</summary><div class="form" style="margin-top:12px">
    <label>Movimento (kcal)<input type="text" inputmode="numeric" id="g-move" value="${g.move}"></label>
    <label>Exercício (min)<input type="text" inputmode="numeric" id="g-ex" value="${g.ex}"></label>
    <label class="wide">Passos<input type="text" inputmode="numeric" id="g-steps" value="${g.steps}"></label>
    <button class="save" id="savegoals">Salvar metas</button></div></details></section>`;
  $('#main').innerHTML=h;
}
function updateAct(){
  const r=S.diary[actDate]||{},g=goalsOf();
  [['move','kcal'],['ex','min'],['steps','passos']].forEach(([k,u])=>{
    const t=document.getElementById('at-'+k),b=document.getElementById('ab-'+k);
    if(t)t.textContent=r[k]!=null?fi(r[k])+' de '+fi(g[k])+' '+u:'Meta '+fi(g[k])+' '+u;
    if(b)b.style.width=(r[k]!=null?clamp(r[k]/g[k]*100,0,100):0)+'%'});
}

/* ---------- nutrição ---------- */
let nutDate=null,nutMeal=null,nutSel=null,nutQ='',nutG='100';
const MEALS=[['cafe','Café da manhã'],['alm','Almoço'],['lan','Lanche'],['jan','Jantar'],['out','Outros']];
const defMeal=()=>{const h=new Date().getHours();return h<10?'cafe':h<14?'alm':h<18?'lan':'jan'};
const fold=t=>String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const TACOI=new Map(TACO.map(r=>[r[0],r]));
function foodGet(key){
  if(key[0]==='t'){const r=TACOI.get(+key.slice(1));return r?{key,n:r[1],k:r[2],p:r[3],c:r[4],l:r[5],f:r[6]}:null}
  const c=S.foods[key];return c?{key,n:c.n,k:c.k,p:c.p,c:c.c,l:c.l,f:c.f||0,mine:true}:null;
}
function foodSearch(q){
  const ts=fold(q).split(/\s+/).filter(Boolean);if(!ts.length)return[];
  const all=Object.keys(S.foods).map(k=>foodGet(k)).concat(TACO.map(r=>({key:'t'+r[0],n:r[1],k:r[2],p:r[3],c:r[4],l:r[5],f:r[6]})));
  return all.map(x=>({x,h:fold(x.n)})).filter(o=>ts.every(t=>o.h.includes(t)))
    .sort((a,b)=>(b.x.mine?1:0)-(a.x.mine?1:0)||(a.h.startsWith(ts[0])?0:1)-(b.h.startsWith(ts[0])?0:1)||a.x.n.length-b.x.n.length).slice(0,8).map(o=>o.x);
}
function nutTot(date){
  const it=(S.meals[date]||{}).items||[];
  return it.reduce((a,x)=>({k:a.k+x.k,p:a.p+x.p,c:a.c+x.c,l:a.l+x.l,f:a.f+x.f}),{k:0,p:0,c:0,l:0,f:0});
}
function nutTargets(){
  const st=wstats(),h=S.prefs.cm,a=S.prefs.age;
  if(!st||!h||!a)return{missing:[!st?'o peso (aba Corpo)':null,!h?'a altura':null,!a?'a idade':null].filter(Boolean)};
  const w=st.last.v,F=isF(),bmr=10*w+6.25*h-5*a+(F?-161:5);
  const am=avgOf(actWin(todayS(),7),'move');
  const tdee=am!=null?bmr*1.2+am:bmr*1.4;
  const perder=modeOf()==='perder',adj=S.prefs.adj!=null?S.prefs.adj:(perder?-20:5);
  const kcal=Math.max(tdee*(1+adj/100),bmr);
  const prot=w*(perder?2.0:1.6),fat=0.25*kcal/9,carb=Math.max(0,(kcal-prot*4-fat*9)/4);
  return{w,bmr,tdee,adj,kcal,prot,fat,carb,fib:14*kcal/1000,am,perder};
}
function nutTips(t,T,date){
  const out=[],it=(S.meals[date]||{}).items||[];
  if(!it.length){out.push({t:'info',x:'Lance as refeições do dia para ver o saldo de calorias e proteína.'});return out}
  const rk=t.kcal-T.k;
  if(rk>=0)out.push({t:'info',x:`Restam cerca de ${fi(rk)} kcal para a meta do dia.`});
  else out.push({t:Math.abs(rk)>t.kcal*0.1?'warn':'info',x:`${fi(-rk)} kcal acima da meta do dia. Um dia fora não muda a tendência da semana.`});
  const rp=t.prot-T.p;
  if(rp>5){const fr=foodGet('t410'),g=fr?rp/fr.p*100:null;
    out.push({t:'info',x:`Faltam ${fi(rp)} g de proteína.${g?` Cerca de ${fi(g)} g de peito de frango grelhado dariam isso (${f1(fr.p)} g de proteína por 100 g na Tabela TACO).`:''}`})}
  else out.push({t:'good',x:'Meta de proteína do dia atingida.'});
  if(T.k>t.kcal*0.5&&T.f<t.fib*0.6)out.push({t:'info',x:`Pouca fibra até agora (${fi(T.f)} g, referência ${fi(t.fib)} g). Feijão, frutas, legumes e verduras ajudam.`});
  if(t.perder&&T.k>0&&T.k<t.bmr*0.8&&T.k>t.kcal*0.7)out.push({t:'warn',x:'Total do dia bem abaixo do seu metabolismo basal estimado. Cortes extremos custam massa muscular e energia.'});
  const wk=Array.from({length:7},(_,i)=>addDays(date,-i)).filter(d=>((S.meals[d]||{}).items||[]).length);
  if(wk.length>=3){const ak=wk.reduce((a,d)=>a+nutTot(d).k,0)/wk.length,ap=wk.reduce((a,d)=>a+nutTot(d).p,0)/wk.length;
    out.push({t:'info',x:`Média dos últimos ${wk.length} dias lançados: ${fi(ak)} kcal e ${fi(ap)} g de proteína (metas ${fi(t.kcal)} kcal e ${fi(t.prot)} g).`})}
  return out;
}
function nres(){
  const r=foodSearch(nutQ);
  if(!nutQ.trim())return'';
  if(!r.length)return'<p class="fine">Nada encontrado. Use "Alimento personalizado" abaixo com os valores do rótulo.</p>';
  return r.map(x=>`<button data-fsel="${esc(x.key)}"><b>${esc(x.n)}${x.mine?' (meu)':''}</b><small>${fi(x.k)} kcal · P ${f1(x.p)} · C ${f1(x.c)} · G ${f1(x.l)} (100 g)</small></button>`).join('');
}
function npv(){
  const f=nutSel?foodGet(nutSel):null,g=num(nutG);if(!f||!(g>0))return'';
  const m=g/100;return`${fi(f.k*m)} kcal · P ${f1(f.p*m)} g · C ${f1(f.c*m)} g · G ${f1(f.l*m)} g`;
}
function renderNut(){
  if(!nutDate)nutDate=todayS();if(!nutMeal)nutMeal=defMeal();
  const t=nutTargets(),isToday=nutDate===todayS(),T=nutTot(nutDate);
  let h=roNote()+`<div class="daytitle"><h2>Nutrição</h2><div class="count">${isToday?'hoje':wdOf(nutDate)+' '+brs(nutDate)}</div></div>`;
  if(t.missing){
    h+=`<section class="card"><div class="head"><h3>Para calcular suas metas</h3></div><p class="fine" style="font-size:14px">Falta lançar ${t.missing.join(', ')}.</p>
      <div class="form"><label>Altura (cm)<input type="text" inputmode="numeric" id="n-cm" value="${S.prefs.cm||''}" placeholder="175"></label>
      <label>Idade<input type="text" inputmode="numeric" id="n-age" value="${S.prefs.age||''}" placeholder="anos"></label>
      <button class="save" id="savenut">Salvar</button></div></section>`;
  }else{
    const sel=[-25,-20,-15,-10,0,5,10].map(v=>`<option value="${v}" ${v===t.adj?'selected':''}>${v>0?'+':''}${v}%</option>`).join('');
    h+=`<section class="card"><div class="head"><h3>Metas do dia</h3></div>
      <div class="stats4"><div class="stat"><small>Calorias</small><b>${fi(t.kcal)} kcal</b><span>${t.perder?'para perder gordura':'manter e ganhar massa magra'}</span></div>
      <div class="stat"><small>Proteína</small><b>${fi(t.prot)} g</b><span>${f1(t.prot/t.w)} g por kg</span></div>
      <div class="stat"><small>Carboidrato</small><b>${fi(t.carb)} g</b><span>o restante das calorias</span></div>
      <div class="stat"><small>Gordura</small><b>${fi(t.fat)} g</b><span>cerca de 25% das calorias</span></div></div>
      <label class="lbl" style="display:grid;gap:4px">Ajuste sobre o gasto estimado<select id="n-adj">${sel}</select></label>
      <p class="fine">Gasto diário estimado: ${fi(t.tdee)} kcal (metabolismo basal ${fi(t.bmr)} kcal pela equação de Mifflin-St Jeor${t.am!=null?', mais o Movimento médio de '+fi(t.am)+' kcal da aba Atividade':', com fator de atividade leve; lance o Movimento na aba Atividade para refinar'}). É uma estimativa, com margem de erro de 10 a 15%. Proteína dentro da faixa de 1,4 a 2,0 g/kg da posição da ISSN para quem treina. Fibra de referência: ${fi(t.fib)} g.</p></section>`;
  }
  const pbar=(lbl,v,g,u)=>g?`<div class="goal"><div class="row"><span>${lbl}</span><span>${fi(v)} de ${fi(g)} ${u}</span></div><div class="bar"><i style="width:${clamp(v/g*100,0,100)}%"></i></div></div>`:`<div class="goal"><div class="row"><span>${lbl}</span><span>${fi(v)} ${u}</span></div></div>`;
  h+=`<section class="card"><div class="head"><button class="ghost" data-nutd="-1">‹ Anterior</button><button class="ghost" data-nutd="1" ${isToday?'disabled':''}>Próximo ›</button></div>
    ${pbar('Calorias',T.k,t.kcal,'kcal')}${pbar('Proteína',T.p,t.prot,'g')}${pbar('Carboidrato',T.c,t.carb,'g')}${pbar('Gordura',T.l,t.fat,'g')}${pbar('Fibra',T.f,t.fib,'g')}</section>`;
  if(!t.missing){const ti=nutTips(t,T,nutDate);h+=`<section class="card"><div class="head"><h3>Leitura do dia</h3></div><ul class="ins">${ti.map(i=>`<li class="${i.t}">${esc(i.x)}</li>`).join('')}</ul></section>`}
  const f=nutSel?foodGet(nutSel):null;
  h+=`<section class="card"><div class="head"><h3>Adicionar alimento</h3></div>
    <div class="chips" role="group" aria-label="Refeição">${MEALS.map(([k,n])=>`<button data-nm="${k}" aria-pressed="${nutMeal===k}">${n}</button>`).join('')}</div>
    <input type="text" id="n-q" class="srch" placeholder="Buscar: arroz, frango, ovo, banana…" value="${esc(nutQ)}" autocomplete="off" aria-label="Buscar alimento">
    <div class="fres" id="nres">${nres()}</div>
    <div id="nsel">${f?`<div class="panel"><h4>${esc(f.n)}</h4><div class="q"><input type="text" inputmode="decimal" id="n-g" value="${esc(nutG)}" aria-label="Quantidade em gramas"><button data-nadd="1">Adicionar</button></div><p class="fine" id="npv">${npv()}</p><p class="fine">Quantidade em gramas, como vem na balança. Os valores da Tabela TACO são por 100 g.</p></div>`:''}</div>
    <details id="cf"><summary>Alimento personalizado (valores do rótulo, por 100 g)</summary><div class="form" style="margin-top:12px">
      <label class="wide">Nome<input type="text" id="cf-n" placeholder="Whey, pão da padaria…"></label>
      <label>Calorias (kcal)<input type="text" inputmode="decimal" id="cf-k"></label><label>Proteína (g)<input type="text" inputmode="decimal" id="cf-p"></label>
      <label>Carboidrato (g)<input type="text" inputmode="decimal" id="cf-c"></label><label>Gordura (g)<input type="text" inputmode="decimal" id="cf-l"></label>
      <label class="wide">Fibra (g, opcional)<input type="text" inputmode="decimal" id="cf-f"></label>
      <button class="save" id="savefood">Salvar alimento</button></div>
      ${Object.keys(S.foods).length?`<div class="hist" style="margin-top:8px">${Object.entries(S.foods).map(([k,x])=>`<div><span>${esc(x.n)}</span><b>${fi(x.k)} kcal</b><button class="del" data-fdel="${k}">Excluir</button></div>`).join('')}</div>`:''}</details></section>`;
  const items=(S.meals[nutDate]||{}).items||[];
  h+=`<section class="card"><div class="head"><h3>Refeições</h3></div>`+(items.length?MEALS.map(([k,n])=>{
    const L=items.filter(x=>x.m===k);if(!L.length)return'';
    const sk=L.reduce((a,x)=>a+x.k,0);
    return`<div class="meal"><div class="mh"><b>${n}</b><span>${fi(sk)} kcal</span></div>${L.map(x=>`<div class="mi"><span>${esc(x.n)}<small>${fi(x.g)} g · P ${f1(x.p)} · C ${f1(x.c)} · G ${f1(x.l)}</small></span><b>${fi(x.k)}</b><button class="del" data-mdel="${x.u}">Excluir</button></div>`).join('')}</div>`}).join(''):'<p class="fine">Nada lançado neste dia.</p>')+`</section>`;
  h+=`<section class="card"><details id="sup"><summary>Suplementação: o que tem evidência</summary><div class="sup">
    <p class="fine">Informação geral baseada em posições de sociedades científicas. Não substitui consulta com nutricionista, nutrólogo ou médico. Se você tem doença (principalmente renal, cardíaca ou hipertensão), usa medicamentos, está grávida ou amamentando, converse com um profissional antes de qualquer suplemento.</p>
    <div class="sp"><b>Creatina monohidratada, 3 a 5 g por dia</b><span>É o suplemento com mais evidência para força e massa magra e é considerado seguro para adultos saudáveis. Vale tomar todos os dias, com ou sem treino. <a href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5469049/" target="_blank" rel="noopener">ISSN, 2017</a></span></div>
    <div class="sp"><b>Proteína em pó (whey), só para completar a meta${t.missing?'':' · hoje faltam '+fi(Math.max(0,t.prot-T.p))+' g'}</b><span>Não é obrigatória. Serve quando a comida não fecha a meta de proteína do dia. A faixa de 1,4 a 2,0 g/kg é a referência para quem treina. <a href="https://pubmed.ncbi.nlm.nih.gov/28642676/" target="_blank" rel="noopener">ISSN, 2017</a></span></div>
    <div class="sp"><b>Cafeína, 3 a 6 mg por kg, cerca de 60 minutos antes do treino${t.missing?'':' · '+fi(3*t.w)+' a '+fi(6*t.w)+' mg para você'}</b><span>Melhora o desempenho em vários tipos de exercício. Comece pela dose baixa. Evite no fim da tarde e à noite por causa do sono. A autoridade europeia (EFSA) considera seguro até 400 mg por dia e 200 mg de uma vez para adultos saudáveis; na gravidez e amamentação o limite é 200 mg por dia. <a href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7777221/" target="_blank" rel="noopener">ISSN, 2021</a> · <a href="https://efsa.europa.eu/en/efsajournal/pub/4102" target="_blank" rel="noopener">EFSA</a></span></div>
    <div class="sp"><b>Vitamina D, ferro, ômega-3, multivitamínico e outros</b><span>Só com exame de sangue ou indicação profissional. Sem deficiência comprovada, o benefício não é garantido e alguns têm risco em excesso. Por isso o app não sugere doses.</span></div></div></details></section>`;
  h+=`<p class="fine">Valores dos alimentos: Tabela Brasileira de Composição de Alimentos (TACO), NEPA/Unicamp, por 100 g. Alguns itens, como o leite, não têm valores na tabela: use "Alimento personalizado" com o rótulo. O app é uma ferramenta de acompanhamento, não prescrição de dieta.</p>`;
  $('#main').innerHTML=h;
}
function updateNutRes(){const r=document.getElementById('nres');if(r)r.innerHTML=nres()}

/* ---------- gráficos ---------- */
function chart(ser,unit,target){
  if(ser.length<2)return'<p class="fine">Lance pelo menos dois registros para ver o gráfico.</p>';
  const W=320,H=150,l=34,r=12,tp=12,bt=26,ks=ser.map(x=>x.v);
  if(target!=null)ks.push(target);
  const lo=Math.floor(Math.min(...ks)-1),hi=Math.ceil(Math.max(...ks)+1);
  const t0=tms(ser[0].d),t1=tms(ser[ser.length-1].d);
  const X=d=>l+(t1===t0?0.5:(tms(d)-t0)/(t1-t0))*(W-l-r);
  const Y=k=>tp+(hi-k)/(hi-lo)*(H-tp-bt);
  const mid=(lo+hi)/2;
  return`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${unit} ao longo do tempo">
    ${[hi,mid,lo].map(v=>`<line class="gr" x1="${l}" x2="${W-r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${l-6}" y="${Y(v)+4}" text-anchor="end">${v%1?f1(v):v}</text>`).join('')}
    ${target!=null?`<line class="tg" x1="${l}" x2="${W-r}" y1="${Y(target)}" y2="${Y(target)}"/><text x="${W-r}" y="${Y(target)-4}" text-anchor="end">meta</text>`:''}
    <polyline class="ln" points="${ser.map(x=>X(x.d).toFixed(1)+','+Y(x.v).toFixed(1)).join(' ')}"/>
    ${ser.map(x=>`<circle class="pt" cx="${X(x.d).toFixed(1)}" cy="${Y(x.v).toFixed(1)}" r="4"/>`).join('')}
    <text x="${l}" y="${H-6}" text-anchor="start">${brs(ser[0].d)}</text>
    <text x="${W-r}" y="${H-6}" text-anchor="end">${brs(ser[ser.length-1].d)}</text></svg>`;
}

/* ---------- corpo ---------- */
function imcClass(i){return i<18.5?'abaixo do peso':i<25?'peso normal':i<30?'sobrepeso':'obesidade'}
function pill(d,good){const c=Math.abs(d)<0.05||good===null||good===undefined?'flat':(good?'good':'bad');return`<span class="pill ${c}">${d>0.049?'▲':d<-0.049?'▼':'•'} ${f1(Math.abs(d))}</span>`}
function insights(){
  const out=[],st=wstats(),manter=modeOf()==='manter';
  if(!st||st.ws.length<2)out.push({t:'info',x:'Lance o peso pelo menos duas vezes, com uma semana de intervalo, para calcular a tendência.'});
  else if(manter){
    const a=Math.abs(st.total);
    if(a<=1.5)out.push({t:'good',x:`Peso estável (${sgn(st.total)} kg desde o início), alinhado ao objetivo de manter.`});
    else out.push({t:'info',x:`O peso variou ${sgn(st.total)} kg desde o início. Se não era a intenção, vale olhar alimentação, sono e a rotina de treino.`});
  }else if(st.rate==null)out.push({t:'info',x:'Ainda não há uma semana de dados. O ritmo semanal aparece a partir de 7 dias entre o primeiro e o último peso.'});
  else{
    const pct=st.rate/st.last.v*100,a=Math.abs(pct),dir=wdir();
    if(st.rate*dir>0&&a>=0.05){
      if(a<0.25)out.push({t:'info',x:`Ritmo de ${f2(Math.abs(st.rate))} kg por semana. É lento, o que é comum nas primeiras semanas. Compare a média de duas semanas antes de mudar algo.`});
      else if(a<=1)out.push({t:'good',x:`Ritmo de ${f2(Math.abs(st.rate))} kg por semana (${f2(a)}% do peso). Fica na faixa em que o músculo costuma ser preservado.`});
      else out.push({t:'warn',x:`Ritmo de ${f2(Math.abs(st.rate))} kg por semana passa de 1% do peso. Perdas rápidas demais podem custar massa muscular. Vale manter a proteína e não cortar calorias demais.`});
    }else if(a<0.05)out.push({t:'info',x:'Peso estável desde o início. Veja se a cintura está caindo: o corpo pode estar mudando sem a balança mexer.'});
    else out.push({t:'warn',x:`O peso foi na direção contrária da meta (${sgn(st.total)} kg). Oscilações de 1 a 2 kg por líquido são comuns. Olhe a média semanal e a cintura antes de concluir.`});
  }
  const cs=series('cintura');
  if(cs.length>=2){const d=cs[cs.length-1].v-cs[0].v;
    if(manter){if(d>=2)out.push({t:'warn',x:`Cintura ${f1(d)} cm maior desde o início. Vale conferir se foi uma oscilação pontual.`})}
    else if(d<=-0.5)out.push({t:'good',x:`Cintura ${f1(Math.abs(d))} cm menor desde o início. É um dos melhores sinais de perda de gordura abdominal.`});
    else if(d>=0.5)out.push({t:'warn',x:`Cintura ${f1(d)} cm maior desde o início. Confira sono, sódio e consistência da dieta antes de ajustar o treino.`})}
  const cp=compSeries();
  if(cp.length>=2){const a=cp[0],b=cp[cp.length-1],dl=b.lean-a.lean,df=b.fat-a.fat;
    if(dl>=0.3&&df<=0.3)out.push({t:'good',x:`Massa magra estimada ${sgn(dl)} kg e gordura ${sgn(df)} kg desde o início. É o padrão de recomposição: ganhar músculo sem ganhar gordura.`});
    else if(dl<=-0.5)out.push({t:'warn',x:`Massa magra estimada ${sgn(dl)} kg desde o início. É uma estimativa, mas confira proteína, sono e progressão de cargas.`});
    else out.push({t:'info',x:`Composição estimada estável (massa magra ${sgn(dl)} kg, gordura ${sgn(df)} kg). Mudanças pequenas ficam dentro da margem de erro da fita métrica.`})}
  const lost=['ombros','peito','braco','coxa'].map(k=>{const s=series(k);return s.length>1?[k,s[s.length-1].v-s[0].v]:null}).filter(x=>x&&x[1]<=-1.5);
  if(lost.length)out.push({t:'warn',x:`${lost.map(x=>CN[x[0]]).join(', ')} ${lost.length>1?'perderam':'perdeu'} mais de 1,5 cm. Pode indicar perda de massa magra. Confira proteína, sono e se as cargas estão subindo.`});
  const w=curWeek(),pr=LET.map(L=>progressOf(w,L)),n=pr.filter(p=>p.got>=p.tot&&p.tot>0).length,any=pr.some(p=>p.got>0);
  if(any||S.prefs.start)out.push({t:n>=3?'good':'info',x:`Semana ${w}: ${n} de 4 treinos concluídos.`});
  return out;
}
function bodySVG(){
  const off=60,F=isF();
  const Z={
    pescoco:{sh:[['rect',92,49,16,14,6]],lx:92,zy:56,ly:50,side:'L'},
    ombros:{sh:[F?['rect',62,69,76,15,7]:['rect',58,69,84,15,7]],lx:202,zy:76,ly:70,side:'R'},
    peito:{sh:[['rect',68,90,64,22,10]],lx:192,zy:101,ly:101,side:'R'},
    braco:{sh:[['ell',50,114,8,15],['ell',150,114,8,15]],lx:101,zy:114,ly:114,side:'L'},
    cintura:{sh:[['rect',70,138,60,14,7]],lx:190,zy:145,ly:137,side:'R'},
    abdomen:{sh:[['rect',68,156,64,20,9]],lx:192,zy:166,ly:169,side:'R'},
    quadril:{sh:[F?['rect',58,190,84,18,9]:['rect',62,190,76,18,9]],lx:198,zy:199,ly:204,side:'R'},
    coxa:{sh:[['ell',80,262,15,30],['ell',120,262,15,30]],lx:125,zy:262,ly:262,side:'L'},
    panturrilha:{sh:[['ell',77,348,10,22],['ell',123,348,10,22]],lx:127,zy:348,ly:348,side:'L'}
  };
  const shape=s=>s[0]==='rect'?`<rect class="sh" x="${s[1]}" y="${s[2]}" width="${s[3]}" height="${s[4]}" rx="${s[5]}"/>`:`<ellipse class="sh" cx="${s[1]}" cy="${s[2]}" rx="${s[3]}" ry="${s[4]}"/>`;
  const arm='M56 76C46 80 41 96 39 116C37 140 35 160 33 180L43 183C47 164 51 144 55 126C59 110 63 96 67 86Z';
  const leg='M62 206C57 242 59 280 64 312C67 342 67 372 66 398L85 398C86 372 89 342 93 312C97 280 99 252 100 222Z';
  const torsoM='M92 62C80 64 64 66 56 76C52 90 58 110 66 128C70 142 70 156 66 172C62 188 60 200 62 212L100 222L138 212C140 200 138 188 134 172C130 156 130 142 134 128C142 110 148 90 144 76C136 66 120 64 108 62Z';
  const torsoF='M93 62C82 64 68 66 62 76C60 90 62 108 68 126C71 140 70 154 65 170C58 186 56 200 58 212L100 222L142 212C144 200 142 186 135 170C130 154 129 140 132 126C138 108 140 90 138 76C132 66 118 64 107 62Z';
  const half=`<g transform="translate(${F?4:0},0)"><path d="${arm}"/></g><path d="${leg}"/>`;
  let s=`<svg class="fig" viewBox="0 0 320 410" role="group" aria-label="Mapa de medidas do corpo">
   <g class="body" transform="translate(${off},0)">
    <ellipse cx="100" cy="30" rx="16" ry="20"/><rect x="93" y="48" width="14" height="16" rx="5"/>
    <path d="${F?torsoF:torsoM}"/>
    ${half}<g transform="translate(200,0) scale(-1,1)">${half}</g>
   </g><g transform="translate(${off},0)">`;
  let lab='';
  for(const[k,z]of Object.entries(Z)){
    const st=zoneState(k),ser=series(k),has=ser.length>0;
    const v=has?ser[ser.length-1].v:null,d=ser.length>1?v-ser[0].v:null;
    const g=d==null?null:goodFor(k,d),dc=g===null?'f':g?'g':'b';
    s+=`<g class="zone ${st} ${sel===k?'sel':''}" data-z="${k}" tabindex="0" role="button" aria-label="${CN[k]}${has?' '+f1(v)+' cm':', sem medida'}">${z.sh.map(shape).join('')}</g>`;
    const R=z.side==='R',tx=R?238:4,x1=z.lx+off,x2=R?232:90;
    lab+=`<line class="lead" x1="${x1}" y1="${z.zy}" x2="${x2}" y2="${z.ly+5}"/><text class="nm" x="${tx}" y="${z.ly-3}">${CN[k]}</text><text class="vl" x="${tx}" y="${z.ly+12}">${has?f1(v):'–'}${d!=null?`<tspan class="${dc}" dx="4">${sgn(d)}</tspan>`:''}</text>`;
  }
  return s+'</g>'+lab+'</svg>';
}
function panel(){
  const isW=sel==='kg',ser=series(isW?'kg':sel),name=isW?'Peso':CN[sel],unit=isW?'kg':'cm';
  let h=`<div class="panel"><h4>${name}</h4>`;
  if(ser.length){
    const last=ser[ser.length-1],fst=ser[0],prev=ser.length>1?ser[ser.length-2]:null;
    const good=isW?wGood:(d=>goodFor(sel,d));
    h+=`<div class="stats"><div class="stat"><small>Atual</small><b>${f1(last.v)}</b><span>${unit} · ${brs(last.d)}</span></div>
      <div class="stat"><small>Desde o início</small><b>${ser.length>1?pill(last.v-fst.v,good(last.v-fst.v)):'–'}</b><span>${unit}</span></div>
      <div class="stat"><small>Vs. anterior</small><b>${prev?pill(last.v-prev.v,good(last.v-prev.v)):'–'}</b><span>${prev?unit+' · '+brs(prev.d):'sem anterior'}</span></div></div>`;
    h+=chart(ser,name,isW&&S.prefs.goal!=null?S.prefs.goal:null);
  }else h+=`<p class="fine">Ainda sem registro. Meça e lance abaixo.</p>`;
  h+=`<div class="q"><input type="text" inputmode="decimal" id="q-val" placeholder="Novo valor (${unit})" aria-label="Novo valor de ${name}"><button data-qsave="1">Salvar hoje</button></div></div>`;
  return h;
}
function compCard(){
  const cs=compSeries();
  let h=`<section class="card"><div class="head"><h3>Composição estimada</h3></div>`;
  if(!cs.length){
    const m=compMissing();
    return h+`<p class="fine" style="font-size:14px">Para estimar gordura, massa magra e água, lance ${m.length?m.join(', '):'as medidas na mesma semana'}.</p><p class="fine">A estimativa usa a fita métrica (pescoço, ${isF()?'cintura e quadril':'abdômen na altura do umbigo'}) e a altura.</p></section>`;
  }
  const a=cs[0],b=cs[cs.length-1],multi=cs.length>1;
  const defs={lean:['Massa magra','lean',true],fat:['Gordura','fat',false],water:['Água','water',null]};
  h+=`<div class="chips" role="group" aria-label="Componente">${Object.entries(defs).map(([k,v])=>`<button data-comp="${k}" aria-pressed="${compSel===k}">${v[0]}</button>`).join('')}</div>`;
  const dv=defs[compSel];
  const dl=multi?b[dv[1]]-a[dv[1]]:null;
  h+=`<div class="stats4">
    <div class="stat"><small>Gordura corporal</small><b>${f1(b.bf)}%</b><span>${multi?sgn(b.bf-a.bf)+' pontos desde o início':'primeira estimativa'}</span></div>
    <div class="stat"><small>Gordura</small><b>${f1(b.fat)} kg</b><span>${multi?sgn(b.fat-a.fat)+' kg':'—'}</span></div>
    <div class="stat"><small>Massa magra</small><b>${f1(b.lean)} kg</b><span>${multi?sgn(b.lean-a.lean)+' kg':'—'}</span></div>
    <div class="stat"><small>Água (aprox.)</small><b>${f1(b.water)} kg</b><span>${Math.round(b.water/b.kg*100)}% do peso</span></div></div>`;
  h+=chart(cs.map(x=>({d:x.d,v:x[dv[1]]})),dv[0]);
  h+=`<p class="fine">${b.m==='marinha'?'Método da Marinha dos EUA (fita métrica).':'Estimativa pelo IMC e idade, menos precisa. Lance o pescoço para usar a fita métrica.'} Água estimada como 73% da massa magra. São aproximações com margem de erro de alguns pontos percentuais: vale a tendência ao longo das semanas, não o valor de um dia. Meça sempre no mesmo local e horário.</p></section>`;
  return h;
}
function renderCorpo(){
  const st=wstats(),cm=S.prefs.cm,log=Object.values(S.log).sort((a,b)=>a.d<b.d?-1:1);
  let h=roNote()+`<div class="daytitle"><h2>${esc(P.nome)}</h2><div class="count">${log.length} registro${log.length===1?'':'s'}</div></div>`;
  if(st){
    const gd=wGood;
    h+=`<section class="card hero"><div class="big"><b>${f1(st.last.v)}</b><span>kg</span>${log.length>1?pill(st.total,gd(st.total)):''}</div>
     <div class="stats">
      <div class="stat"><small>Último registro</small><b>${st.prev?pill(st.last.v-st.prev.v,gd(st.last.v-st.prev.v)):'–'}</b><span>${st.prev?'vs '+brs(st.prev.d):'primeiro peso'}</span></div>
      <div class="stat"><small>7 dias</small><b>${st.wk!=null?pill(st.wk,gd(st.wk)):'–'}</b><span>${st.wk!=null?'kg':'precisa de 1 semana'}</span></div>
      <div class="stat"><small>Ritmo</small><b>${st.rate!=null?f2(st.rate):'–'}</b><span>${st.rate!=null?'kg por semana':'precisa de 1 semana'}</span></div></div>`;
    if(cm){const m=cm/100,imc=st.last.v/(m*m);
      h+=`<div class="stats"><div class="stat"><small>IMC</small><b>${f1(imc)}</b><span>${imcClass(imc)}</span></div>
      <div class="stat" style="grid-column:span 2"><small>Faixa de peso normal para ${cm} cm</small><b>${f1(18.5*m*m)} a ${f1(24.9*m*m)} kg</b><span>IMC 18,5 a 24,9</span></div></div>`}
    else h+=`<p class="fine">Informe a altura em Ajustes para calcular o IMC.</p>`;
    const g=S.prefs.goal;
    if(g!=null){
      const span=st.first.v-g,done=st.first.v-st.last.v,pc=span===0?100:clamp(done/span*100,0,100),rem=st.last.v-g;
      let eta='';
      if(st.rate!=null&&rem*st.rate<0){const wks=Math.abs(rem/st.rate);eta=` · previsão ${brs(addDays(st.last.d,Math.round(wks*7)))}`}
      h+=`<div class="goal"><div class="row"><span>Meta ${f1(g)} kg</span><span>${Math.abs(rem)<0.05?'meta atingida':f1(Math.abs(rem))+' kg '+(rem>0?'para perder':'para ganhar')}${eta}</span></div><div class="bar"><i style="width:${pc}%"></i></div></div>`;
    }
    h+=`</section>`;
  }else h+=`<section class="card"><p class="fine" style="font-size:14px">Nenhum registro ainda. Lance o peso abaixo ou toque numa região do corpo para começar.</p></section>`;
  h+=compCard();
  const ins=insights();
  h+=`<section class="card"><div class="head"><h3>Leitura</h3></div><ul class="ins">${ins.map(i=>`<li class="${i.t}">${esc(i.x)}</li>`).join('')}</ul></section>`;
  h+=`<section class="card"><div class="head"><h3>Mapa do corpo</h3></div>
    <div class="chips" role="group" aria-label="Medida">${[['kg','Peso'],...CIRC.map(c=>[c[0],c[1]])].map(([k,n])=>`<button data-sel="${k}" aria-pressed="${sel===k}">${n}</button>`).join('')}</div>
    ${bodySVG()}${panel()}
    <p class="fine">Verde: mudou na direção desejada desde o início. Vermelho: foi no sentido contrário. Cinza: estável ou sem meta. Tracejado: sem medida.</p></section>`;
  const open=formOpen||!log.length;
  h+=`<section class="card"><details id="fm" ${open?'open':''}><summary>Registrar várias medidas de uma vez</summary><div class="form" style="margin-top:12px">
    <label class="wide">Data<input type="date" id="f-date" value="${todayS()}"></label>
    <label>Peso (kg)<input type="text" inputmode="decimal" id="f-kg" placeholder="${st?f1(st.last.v):'0,0'}"></label>
    <label>Altura (cm)<input type="text" inputmode="numeric" id="f-cm" value="${cm||''}" placeholder="175"></label>
    ${CIRC.map(([k,n])=>{const s=series(k);return`<label>${n} (cm)<input type="text" inputmode="decimal" id="f-c-${k}" placeholder="${s.length?f1(s[s.length-1].v):'0,0'}"></label>`}).join('')}
    <button class="save" id="savelog">Salvar medidas</button></div></details></section>`;
  if(log.length)h+=`<section class="card"><div class="head"><h3>Histórico</h3></div><div class="hist">`+log.slice().reverse().map(r=>{
    const cs=CIRC.filter(([k])=>(r.c||{})[k]!=null).map(([k,n])=>n+' '+f1(r.c[k])).join(' · ');
    return`<div><span>${br(r.d)}</span><b>${r.kg!=null?f1(r.kg)+' kg':'–'}</b><button class="del" data-del="${r.d}">Excluir</button>${cs?`<span class="sub">${cs}</span>`:''}</div>`}).join('')+`</div></section>`;
  h+=`<section class="card"><details id="aj"><summary>Ajustes de ${esc(P.nome)}</summary><div class="form" style="margin-top:12px">
    <label>Início da semana 1<input type="date" id="s-start" value="${S.prefs.start||''}"></label>
    <label>Meta de peso (kg)<input type="text" inputmode="decimal" id="s-goal" value="${S.prefs.goal!=null?f1(S.prefs.goal):''}" placeholder="opcional"></label>
    <label>Altura (cm)<input type="text" inputmode="numeric" id="s-cm" value="${cm||''}" placeholder="175"></label>
    <label>Idade<input type="text" inputmode="numeric" id="s-age" value="${S.prefs.age||''}" placeholder="anos"></label>
    <label>Sexo<select id="s-sex"><option value="M" ${isF()?'':'selected'}>Masculino</option><option value="F" ${isF()?'selected':''}>Feminino</option></select></label>
    <label>Objetivo<select id="s-mode"><option value="perder" ${modeOf()==='perder'?'selected':''}>Perder gordura</option><option value="manter" ${modeOf()==='manter'?'selected':''}>Manter e ganhar massa magra</option></select></label>
    <button class="save" id="saveset">Salvar ajustes</button>
    <button class="ghost" id="goal5" ${st?'':'disabled'}>Usar meta de −5 kg</button>
    <button class="ghost" id="csv" ${log.length?'':'disabled'}>Baixar CSV</button></div></details></section>`;
  $('#main').innerHTML=h;
}

/* ---------- jornada ---------- */
function renderJornada(){
  const cw=S.prefs.start?weekOf(todayS()):null;
  let h=roNote()+`<div class="daytitle"><h2>Jornada</h2><div class="count">${S.prefs.start?'início '+br(S.prefs.start):'sem data de início'}</div></div>`;
  h+=`<section class="card"><div class="jh"><span>Sem</span><span>Treinos A B C D</span><span>Peso médio</span><span>Cintura</span></div>`;
  let prevAvg=null;
  for(let w=1;w<=8;w++){
    const pr=D.prog[w-1],pips=LET.map(L=>{const p=progressOf(w,L);const c=p.tot&&p.got>=p.tot?'full':p.got>0?'half':'';return`<div class="pip ${c}">${L}</div>`}).join('');
    const rs=Object.values(S.log).filter(r=>weekOf(r.d)===w);
    const kgs=rs.filter(r=>r.kg!=null).map(r=>r.kg),avg=kgs.length?kgs.reduce((a,b)=>a+b,0)/kgs.length:null;
    const cin=rs.filter(r=>(r.c||{}).cintura!=null).sort((a,b)=>a.d<b.d?-1:1).pop();
    const dv=avg!=null&&prevAvg!=null?avg-prevAvg:null;if(avg!=null)prevAvg=avg;
    const ds=Object.values(S.diary).filter(r=>weekOf(r.d)===w);
    const sum=k=>ds.filter(r=>r[k]!=null).map(r=>r[k]);
    const cardio=sum('cardio').reduce((a,b)=>a+b,0),sono=sum('sono'),en=sum('en'),kn=sum('knee');
    const bits=[];
    if(sum('cardio').length)bits.push('Cardio '+cardio+' min');
    if(sum('steps').length)bits.push('Passos méd. '+fi(sum('steps').reduce((a,b)=>a+b,0)/sum('steps').length));
    if(sum('move').length)bits.push('Mov. méd. '+fi(sum('move').reduce((a,b)=>a+b,0)/sum('move').length)+' kcal');
    if(sono.length)bits.push('Sono '+f1(sono.reduce((a,b)=>a+b,0)/sono.length)+' h');
    if(en.length)bits.push('Energia '+f1(en.reduce((a,b)=>a+b,0)/en.length));
    if(D.knee&&kn.length)bits.push('Joelho máx '+Math.max(...kn));
    h+=`<div class="jr ${cw===w?'cur':''} ${cw!=null&&w>cw?'fut':''}"><div class="w">${w}</div><div><div class="ph">${esc(pr.fase)} · ${esc(pr.esforco)}</div><div class="pips">${pips}</div>${bits.length?`<div class="ph" style="margin-top:4px">${bits.join(' · ')}</div>`:''}</div>
      <div class="n"><b>${avg!=null?f1(avg):'–'}</b><small>${dv!=null?sgn(dv)+' kg':'kg'}</small></div>
      <div class="n"><b>${cin?f1(cin.c.cintura):'–'}</b><small>cm</small></div></div>`;
  }
  h+=`</section><p class="fine">Os treinos contam quando todas as séries mínimas do dia estão marcadas. Peso e cintura vêm dos registros do Corpo e cardio, sono e energia vêm do check-in, tudo agrupado pela semana do programa.</p>`;
  $('#main').innerHTML=h;
}
function renderEscolha(){
  $('#main').innerHTML=`<div class="pick"><h2>Quem vai treinar agora?</h2><p>Cada um tem seu plano, suas medidas e sua cor. Dá para trocar a qualquer momento tocando no nome lá em cima.</p>
    <button class="c" data-pick="caio"><span class="n">Caio</span><small>${PROFILES.caio.sub}</small></button>
    <button class="m" data-pick="munique"><span class="n">Munique</span><small>${PROFILES.munique.sub}</small></button></div>`;
}
function render(){
  const esc_=view==='escolha'||!P;
  $('#tabs').hidden=esc_;
  $('#whoname').textContent=P?P.nome:'Escolher';
  if(esc_){renderEscolha();setStatus();return}
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===view));
  $('#trainnav').hidden=view!=='treino';
  if(view==='treino'){renderHeader();renderDay()}else if(view==='corpo')renderCorpo();else if(view==='ativ')renderAtiv();else if(view==='nut')renderNut();else renderJornada();
  setStatus();
}

/* ---------- ações ---------- */
function applyMeasure(date,patch){
  const r=S.log[date]||(S.log[date]={d:date,c:{}});
  if(patch.kg!=null)r.kg=patch.kg;
  r.c=Object.assign(r.c||{},patch.c||{});
  ensureStart(date);persist('log/'+date);
}
const nv=id=>{const e=document.getElementById(id);return e&&e.value.trim()!==''?num(e.value):NaN};
function csvText(){
  const rows=Object.values(S.log).sort((a,b)=>a.d<b.d?-1:1),cm=S.prefs.cm,cmp=Object.fromEntries(compSeries().map(x=>[x.d,x]));
  const head=['Data','Peso (kg)','Altura (cm)','IMC',...CIRC.map(c=>c[1]+' (cm)'),'Gordura (%)','Gordura (kg)','Massa magra (kg)','Água (kg)'];
  const c2=v=>v==null?'':String(v).replace('.',',');
  const lines=[head.join(';')].concat(rows.map(r=>{const c=cmp[r.d];return[r.d,c2(r.kg),cm||'',r.kg!=null&&cm?f1(r.kg/((cm/100)**2)):'',...CIRC.map(([k])=>c2((r.c||{})[k])),c?f1(c.bf):'',c?f1(c.fat):'',c?f1(c.lean):'',c?f1(c.water):''].join(';')}));
  return'﻿'+lines.join('\n');
}
document.addEventListener('click',async ev=>{
  const z=ev.target.closest('[data-z]');
  if(z){sel=z.dataset.z;renderCorpo();document.querySelector('.panel')?.scrollIntoView({block:'nearest',behavior:'smooth'});return}
  const t=ev.target.closest('button');if(!t)return;
  if(t.dataset.pick){setProfile(t.dataset.pick);window.scrollTo(0,0);return}
  if(t.id==='who'){view='escolha';render();window.scrollTo(0,0);return}
  if(t.id==='sync'){if(dbState==='error'&&db){dirty.forEach(p=>flush(p));dbState='ok';setStatus()}return}
  if(t.dataset.view){view=t.dataset.view;render();window.scrollTo(0,0);return}
  if(t.dataset.w){week=+t.dataset.w;weekTouched=true;renderHeader();renderDay();t.scrollIntoView({inline:'center',block:'nearest'});return}
  if(t.dataset.d){di=+t.dataset.d;renderHeader();renderDay();return}
  if(t.dataset.en){const n=+t.dataset.en,r=S.diary[todayS()]||{};diaryPatch({en:r.en===n?null:n});renderDay();return}
  if(t.dataset.knee){const n=+t.dataset.knee,r=S.diary[todayS()]||{};diaryPatch({knee:r.knee===n?null:n});renderDay();return}
  if(t.dataset.actd){const n=addDays(actDate||todayS(),+t.dataset.actd);if(n<=todayS()){actDate=n;renderAtiv()}return}
  if(t.id==='savegoals'){
    const m=nv('g-move'),e=nv('g-ex'),s=nv('g-steps'),g=Object.assign({},S.prefs.goals||{});
    if(m>0&&m<5000)g.move=Math.round(m);if(e>0&&e<600)g.ex=Math.round(e);if(s>0&&s<100000)g.steps=Math.round(s);
    S.prefs.goals=g;persist('state/prefs');renderAtiv();return}
  if(t.dataset.nutd){const n=addDays(nutDate||todayS(),+t.dataset.nutd);if(n<=todayS()){nutDate=n;renderNut()}return}
  if(t.dataset.nm){nutMeal=t.dataset.nm;renderNut();return}
  if(t.dataset.fsel){nutSel=t.dataset.fsel;nutG='100';renderNut();setTimeout(()=>{const g=document.getElementById('n-g');if(g){g.focus();g.select()}},50);return}
  if(t.dataset.nadd){
    const f=nutSel?foodGet(nutSel):null,g=nv('n-g');
    if(!f||!(g>0&&g<=5000)){t.textContent='Confira a quantidade';setTimeout(()=>{t.textContent='Adicionar'},1800);return}
    const m=g/100,r1=x=>Math.round(x*10)/10,date=nutDate||todayS(),doc=S.meals[date]||(S.meals[date]={d:date,items:[]});
    doc.items.push({u:Date.now().toString(36)+Math.floor(Math.random()*1e3).toString(36),m:nutMeal||defMeal(),k:Math.round(f.k*m),p:r1(f.p*m),c:r1(f.c*m),l:r1(f.l*m),f:r1(f.f*m),n:f.n,g:Math.round(g*10)/10});
    persist('meals/'+date);nutSel=null;nutQ='';renderNut();window.scrollTo(0,0);return}
  if(t.dataset.mdel){const date=nutDate||todayS(),doc=S.meals[date];if(doc){doc.items=doc.items.filter(x=>x.u!==t.dataset.mdel);persist('meals/'+date);renderNut()}return}
  if(t.id==='savefood'){
    const n=(document.getElementById('cf-n').value||'').trim(),k=nv('cf-k'),p=nv('cf-p'),c=nv('cf-c'),l=nv('cf-l'),fb=nv('cf-f');
    if(!n||!(k>=0&&k<1000)||[p,c,l].some(x=>!(x>=0&&x<=100))){t.textContent='Confira os valores';setTimeout(()=>{t.textContent='Salvar alimento'},2000);return}
    const id='c'+Date.now().toString(36);S.foods[id]={n,k:Math.round(k),p,c,l,f:isNaN(fb)?0:fb};persist('state/foods');nutSel=id;nutG='100';renderNut();return}
  if(t.dataset.fdel){delete S.foods[t.dataset.fdel];if(nutSel===t.dataset.fdel)nutSel=null;persist('state/foods');renderNut();return}
  if(t.id==='savenut'){
    const cm=nv('n-cm'),age=nv('n-age');
    if(!isNaN(cm)&&cm>100&&cm<250)S.prefs.cm=Math.round(cm);
    if(!isNaN(age)&&age>10&&age<110)S.prefs.age=Math.round(age);
    persist('state/prefs');renderNut();return}
  if(t.id==='ivstart'){startInterval();return}
  if(t.dataset.comp){compSel=t.dataset.comp;renderCorpo();return}
  if(t.dataset.set!==undefined){
    const L=LETTER[DAYS[di][0]],key=week+'_'+L,e=D.ex.find(x=>x.nome===t.dataset.ex&&x.dia===L),p=parse(presc(e));
    const rec=S.sets[key]||(S.sets[key]={w:week,L,done:{}});
    const arr=Array.from({length:p.max},(_,j)=>!!(rec.done[e.nome]||[])[j]);
    const i=+t.dataset.set;arr[i]=!arr[i];rec.done[e.nome]=arr;
    t.setAttribute('aria-pressed',arr[i]);
    ensureStart(todayS());persist('sets/'+key);updateProgress();
    const rs=restSec(e.desc);if(arr[i]&&rs>0)startRest(rs,e.nome);
    return}
  if(t.id==='reset'){
    if(t.classList.contains('arm')){const L=LETTER[DAYS[di][0]],key=week+'_'+L;delete S.sets[key];persist('sets/'+key);renderDay()}
    else{t.classList.add('arm');t.textContent='Toque de novo para limpar';setTimeout(()=>{t.classList.remove('arm');t.textContent='Limpar marcações do dia'},3000)}
    return}
  if(t.dataset.sel){sel=t.dataset.sel;renderCorpo();return}
  if(t.dataset.qsave){
    const v=nv('q-val'),w=sel==='kg';
    if(!(w?(v>20&&v<400):(v>5&&v<300))){t.textContent='Confira o valor';setTimeout(()=>{t.textContent='Salvar hoje'},1800);return}
    applyMeasure(todayS(),w?{kg:Math.round(v*10)/10}:{c:{[sel]:Math.round(v*10)/10}});renderCorpo();return}
  if(t.id==='savelog'){
    const d=document.getElementById('f-date').value,kg=nv('f-kg'),cm=nv('f-cm'),c={};
    let bad=!d;
    if(!isNaN(kg)&&!(kg>20&&kg<400))bad=true;
    if(!isNaN(cm)&&!(cm>100&&cm<250))bad=true;
    CIRC.forEach(([k])=>{const v=nv('f-c-'+k);if(!isNaN(v)){if(v>5&&v<300)c[k]=Math.round(v*10)/10;else bad=true}});
    if(bad||(isNaN(kg)&&isNaN(cm)&&!Object.keys(c).length)){t.textContent='Confira os valores';setTimeout(()=>{t.textContent='Salvar medidas'},2000);return}
    if(!isNaN(cm)){S.prefs.cm=Math.round(cm);persist('state/prefs')}
    if(!isNaN(kg)||Object.keys(c).length)applyMeasure(d,{kg:isNaN(kg)?null:Math.round(kg*10)/10,c});
    formOpen=false;renderCorpo();return}
  if(t.dataset.del){
    if(t.classList.contains('arm')){delete S.log[t.dataset.del];persist('log/'+t.dataset.del);renderCorpo()}
    else{t.classList.add('arm');t.textContent='Confirmar';setTimeout(()=>{t.classList.remove('arm');t.textContent='Excluir'},3000)}
    return}
  if(t.id==='saveset'){
    const s=document.getElementById('s-start').value,g=nv('s-goal'),cm=nv('s-cm'),age=nv('s-age');
    if(s)S.prefs.start=s;
    if(!isNaN(g)&&g>20&&g<400)S.prefs.goal=Math.round(g*10)/10;else if(document.getElementById('s-goal').value.trim()==='')delete S.prefs.goal;
    if(!isNaN(cm)&&cm>100&&cm<250)S.prefs.cm=Math.round(cm);
    if(!isNaN(age)&&age>10&&age<110)S.prefs.age=Math.round(age);
    S.prefs.sex=document.getElementById('s-sex').value;S.prefs.mode=document.getElementById('s-mode').value;
    persist('state/prefs');if(!weekTouched)week=curWeek();renderCorpo();return}
  if(t.id==='goal5'){const st=wstats();if(st){S.prefs.goal=Math.round((st.first.v-5)*10)/10;persist('state/prefs');renderCorpo()}return}
  if(t.id==='csv'){
    let dl=null;try{dl=window.claude&&window.claude.use?await window.claude.use('downloads'):null}catch(e){}
    if(!dl){t.textContent='Download indisponível aqui';return}
    try{await dl.save({filename:'medidas-'+P.pid+'.csv',data:csvText()})}catch(e){}
    return}
});
document.addEventListener('keydown',ev=>{const z=ev.target.closest&&ev.target.closest('[data-z]');if(z&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();sel=z.dataset.z;renderCorpo()}});
document.addEventListener('input',ev=>{
  const i=ev.target;if(!i.id&&!(i.dataset&&i.dataset.kg!==undefined))return;
  if(i.dataset&&i.dataset.kg!==undefined){S.loads[i.dataset.kg]=i.value;persist('state/loads');return}
  if(i.id==='n-q'){nutQ=i.value;updateNutRes();return}
  if(i.id==='n-g'){nutG=i.value;const p=document.getElementById('npv');if(p)p.textContent=npv();return}
  if(i.id&&i.id.startsWith('a-')){const k=i.id.slice(2),a=ACT.find(x=>x[0]===k);if(a){const v=num(i.value);
    diaryPatch({[k]:i.value.trim()===''?null:(v>=0&&v<=a[3]?(k==='km'?Math.round(v*100)/100:Math.round(v)):undefined)},actDate||todayS());updateAct()}return}
  if(i.id==='ci-sono'){const v=num(i.value);diaryPatch({sono:i.value.trim()===''?null:(v>0&&v<24?v:undefined)});return}
  if(i.id==='ci-cardio'){const v=num(i.value);diaryPatch({cardio:i.value.trim()===''?null:(v>=0&&v<600?Math.round(v):undefined)})}
});
document.addEventListener('focusout',ev=>{if(view==='ativ'&&ev.target.id&&ev.target.id.startsWith('a-'))setTimeout(()=>{if(view==='ativ'&&(!document.activeElement||document.activeElement.tagName!=='INPUT'))renderAtiv()},80)});
document.addEventListener('change',ev=>{if(ev.target.id==='n-adj'){S.prefs.adj=+ev.target.value;persist('state/prefs');renderNut()}});
document.addEventListener('toggle',ev=>{if(ev.target.id==='fm')formOpen=ev.target.open},true);
async function wake(){try{if(navigator.wakeLock&&document.visibilityState==='visible')await navigator.wakeLock.request('screen')}catch(e){}}
document.addEventListener('visibilitychange',wake);wake();

/* início: lembra quem usou por último neste aparelho */
let saved=null;try{saved=localStorage.getItem('trinca:pid')}catch(e){}
render();
initDb();
if(saved&&PROFILES[saved])setProfile(saved);
