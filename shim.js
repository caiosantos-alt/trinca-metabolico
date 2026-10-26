/* Adaptador: faz o app usar o banco Convex quando roda fora do Claude. */
(function(){
  if(window.claude&&window.claude.use)return;
  var cx=null,DEF='https://dynamic-malamute-684.eu-west-1.convex.cloud';
  try{cx=new URLSearchParams(location.search).get('cx')}catch(e){}
  try{if(cx)localStorage.setItem('trinca:cx',cx);else cx=localStorage.getItem('trinca:cx')}catch(e){}
  if(!cx)cx=DEF;
  var lastWrite=0,inflight=0,subs=[];
  function call(kind,path,args){
    return fetch(cx+'/api/'+kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:path,args:args,format:'json'})})
      .then(function(r){return r.json()})
      .then(function(j){if(j.status!=='success')throw new Error(j.errorMessage||'erro');return j.value});
  }
  function meta(){return{fromCache:false,hasPendingWrites:false}}
  function addSub(s){
    subs.push(s);s.run();
    return function(){var i=subs.indexOf(s);if(i>=0)subs.splice(i,1)};
  }
  function collSub(c,next){
    var s={c:c,last:null,run:function(){
      var t0=Date.now();
      call('query','docs:list',{col:c}).then(function(rows){
        if(lastWrite>t0||inflight>0)return;
        var key=JSON.stringify(rows);if(key===s.last)return;s.last=key;
        var docs=rows.map(function(r){return{id:r.id,data:function(){return JSON.parse(r.data)}}});
        next({docs:docs,size:docs.length,empty:!docs.length,metadata:meta()});
      }).catch(function(){});
    }};
    return addSub(s);
  }
  function docSub(c,id,next){
    var s={c:c,last:null,run:function(){
      var t0=Date.now();
      call('query','docs:get',{col:c,id:id}).then(function(row){
        if(lastWrite>t0||inflight>0)return;
        var key=JSON.stringify(row);if(key===s.last)return;s.last=key;
        next({id:id,exists:!!row,data:function(){return row?JSON.parse(row.data):undefined},metadata:meta()});
      }).catch(function(){});
    }};
    return addSub(s);
  }
  function wrote(c){lastWrite=Date.now();subs.filter(function(s){return s.c===c}).forEach(function(s){s.last=null;s.run()})}
  function collection(c){
    return{
      onSnapshot:function(next){return collSub(c,next)},
      doc:function(id){
        return{
          onSnapshot:function(next){return docSub(c,id,next)},
          set:function(d){inflight++;return call('mutation','docs:set',{col:c,id:id,data:JSON.stringify(d)}).then(function(){inflight--;wrote(c)},function(e){inflight--;throw e})},
          delete:function(){inflight++;return call('mutation','docs:remove',{col:c,id:id}).then(function(){inflight--;wrote(c)},function(e){inflight--;throw e})}
        };
      }
    };
  }
  function tick(){if(document.visibilityState==='visible')subs.slice().forEach(function(s){s.run()})}
  setInterval(tick,5000);
  document.addEventListener('visibilitychange',tick);
  var dl={save:function(o){
    var b=new Blob([o.data],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
    a.href=URL.createObjectURL(b);a.download=o.filename;document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000);return Promise.resolve({saved:true});
  }};
  window.claude={use:function(n){return Promise.resolve(n==='db'&&cx?{collection:collection}:n==='downloads'?dl:null)}};
})();
