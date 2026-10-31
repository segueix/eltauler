(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ElTaulerPitchDiagnostic=api})(typeof self!=='undefined'?self:this,function(){
'use strict';
// Autocorrelació simplificada de F0 amb llindar de veu: útil per comparar, no és una mesura clínica.
function estimate(buffer,opts={}){
 const sr=buffer.sampleRate,src=buffer.getChannelData(0),step=Math.round(sr*.08),size=Math.round(sr*.05);
 const minLag=Math.floor(sr/450),maxLag=Math.ceil(sr/75),out=[];
 for(let start=0;start+size<src.length;start+=step){
   let energy=0;for(let j=0;j<size;j++)energy+=src[start+j]*src[start+j];
   const rms=Math.sqrt(energy/size);if(rms<.012)continue;
   let best=0,bestLag=0;
   for(let lag=minLag;lag<=maxLag;lag+=1){
     let cross=0,a=0,b=0;for(let j=0;j<size-lag;j+=2){const x=src[start+j],y=src[start+j+lag];cross+=x*y;a+=x*x;b+=y*y}
     const corr=cross/Math.sqrt(a*b+1e-10);
     if(corr>best){best=corr;bestLag=lag}
   }
   if(best>.73&&bestLag)out.push({time:(start+size/2)/sr,hz:sr/bestLag,confidence:best});
 }
 return out;
}
function summarize(points,duration){
 const bins=[[],[],[]];for(const p of points){const k=Math.min(2,Math.floor(p.time/Math.max(.01,duration)*3));bins[k].push(p.hz)}
 const med=a=>{if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y);return Math.round(b[Math.floor(b.length/2)]*10)/10};
 return bins.map(med);
}
return {estimate,summarize};
});