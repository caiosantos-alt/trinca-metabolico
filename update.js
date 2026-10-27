/* Atualização automática: compara a versão carregada com a publicada e recarrega se mudou. */
(function(){
  var cur=window.APP_V;if(!cur)return;
  function check(){
    fetch('./version.json?'+Date.now(),{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){
      if(j&&j.v&&String(j.v)!==String(cur)){
        var a=document.activeElement;if(a&&a.tagName==='INPUT')return;
        location.replace('./?v='+encodeURIComponent(j.v));
      }
    }).catch(function(){});
  }
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')check()});
  setTimeout(check,2000);setInterval(check,300000);
})();
