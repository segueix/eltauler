/* Adaptador Matxa ONNX: servei propi compatible amb /api/tts del projecte AINA.
   No s'envien textos a ONNX fins que es configura explícitament un endpoint.
   La instància ONNX ha de desplegar-se per separat; GitHub Pages és estàtic. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ElTaulerONNX=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const KEY='eltauler_matxa_onnx_endpoint';
function endpoint(){try{return localStorage.getItem(KEY)||''}catch{return ''}}
function configure(value){const url=new URL(String(value||''));if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Cal HTTPS (o localhost).');if(url.username||url.password||url.search||url.hash)throw Error('URL no admesa');const base=url.href.replace(/\/$/,'');try{localStorage.setItem(KEY,base)}catch(e){throw Error('No es pot desar l’adreça del servidor')}return base}
function clear(){try{localStorage.removeItem(KEY)}catch{}}
async function synthesize(text,options={}){const base=endpoint();if(!base)throw Error('Configura primer el servidor Matxa ONNX');const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);
try{const res=await fetch(base+'/api/tts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:String(text).slice(0,480),voice:options.speaker||'elia',language:({'central':'ca-es','nord-occidental':'ca-nw','valencia':'ca-va','balear':'ca-ba'})[options.accent]||'ca-es',type:'text'}),signal:controller.signal});if(!res.ok)throw Error('El servidor ha retornat '+res.status);const type=res.headers.get('content-type')||'';if(!type.includes('audio/'))throw Error('El servidor no ha retornat àudio WAV.');return await res.blob();}finally{clearTimeout(timer)}}
return {endpoint,configure,clear,synthesize};
});
