/* Trava por PIN: o primeiro aparelho cria o PIN, os outros precisam digitá-lo. */
(function(){
  var css='#pin{position:fixed;inset:0;z-index:99;background:#14181c;color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif}'
  +'#pin .b{width:100%;max-width:340px;display:grid;gap:14px;text-align:center}#pin h2{margin:0;font-size:26px;letter-spacing:.04em;text-transform:uppercase}'
  +'#pin p{margin:0;color:#b9c1c8;font-size:15px}#pin input{height:60px;border-radius:12px;border:1px solid #3a444d;background:#0f1316;color:#fff;font-size:30px;text-align:center;letter-spacing:.4em;width:100%}'
  +'#pin button{height:54px;border:0;border-radius:12px;background:#e4491f;color:#fff;font-size:18px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}#pin .e{color:#ff7a96;min-height:20px;font-size:14px}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  var el=document.createElement('div');el.id='pin';el.innerHTML='<div class="b"><h2>Trinca Metabólico</h2><p id="pm">Conectando…</p></div>';
  document.documentElement.appendChild(el);
  var box=el.firstChild,pm=el.querySelector('#pm');
  function hash(p){return crypto.subtle.digest('SHA-256',new TextEncoder().encode('trinca:'+p)).then(function(b){return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,'0')}).join('')})}
  function unlock(){el.remove()}
  function ask(msg,btn,cb,confirmMode){
    box.innerHTML='<h2>Trinca Metabólico</h2><p>'+msg+'</p><input id="pi" type="password" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="••••" aria-label="PIN">'
      +(confirmMode?'<input id="pc" type="password" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="repita" aria-label="Repetir PIN">':'')
      +'<div class="e" id="pe"></div><button id="pb">'+btn+'</button>';
    var go=function(){var a=document.getElementById('pi').value,c=confirmMode?document.getElementById('pc').value:a,e=document.getElementById('pe');
      if(!/^\d{4,6}$/.test(a)){e.textContent='Use de 4 a 6 números.';return}
      if(a!==c){e.textContent='Os dois PINs não são iguais.';return}
      cb(a,e)};
    document.getElementById('pb').onclick=go;
    box.querySelectorAll('input').forEach(function(i){i.onkeydown=function(ev){if(ev.key==='Enter')go()}});
    setTimeout(function(){var i=document.getElementById('pi');if(i)i.focus()},50);
  }
  function fail(){box.innerHTML='<h2>Sem conexão</h2><p>Não consegui falar com o servidor.</p><button id="pb">Tentar de novo</button>';document.getElementById('pb').onclick=function(){location.reload()}}
  var A=window.__auth;
  if(!A)return fail();
  function enter(r,e){
    if(r.st==='ok'){A.save(r.tok);unlock();return}
    if(r.st==='locked'){e.textContent='Muitas tentativas. Aguarde '+(r.wait>90?Math.ceil(r.wait/60)+' min':r.wait+' s')+'.';return}
    if(r.st==='bad'){e.textContent='PIN incorreto.'+(r.wait?' Aguarde '+(r.wait>90?Math.ceil(r.wait/60)+' min':r.wait+' s')+'.':(r.left<=2?' Restam '+r.left+' tentativas antes do bloqueio.':''));return}
    e.textContent='Não foi possível entrar. Tente de novo.';
  }
  A.status().then(function(s){
    if(s.ok)return unlock();
    if(!s.has){
      ask('Primeiro acesso: crie um PIN de 4 a 6 números.','Criar PIN',function(p,e){
        hash(p).then(function(h){return A.create(h)}).then(function(r){enter(r,e)}).catch(function(){e.textContent='Falha ao salvar. Tente de novo.'})
      },true);
    }else{
      ask('Digite o PIN para entrar.','Entrar',function(p,e){
        hash(p).then(function(h){return A.login(h)}).then(function(r){enter(r,e)}).catch(function(){e.textContent='Sem conexão. Tente de novo.'})
      });
    }
  }).catch(fail);
})();
