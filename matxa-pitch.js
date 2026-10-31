/* Modulació tonal experimental per solapament de fragments (OLA).
 * Manté aproximadament la durada original i varia l'altura tonal al llarg del temps.
 * No modifica els pesos neuronals; l'efecte pot introduir artefactes.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ElTaulerPitch=api})(typeof self!=='undefined'?self:this,function(){
'use strict';
function contour(mode,position,intensity){
  const x=Math.max(0,Math.min(1,position)),a=Math.max(0,Math.min(1,intensity));
  // canvis en semitons: contorn prosòdic simplificat, no universal
  let semitones=0;
  if(mode==='question')semitones=-.35+4.5*Math.pow(Math.max(0,(x-.60)/.40),1.4);
  else if(mode==='statement')semitones=.5-3.3*Math.pow(Math.max(0,(x-.45)/.55),1.25);
  else if(mode==='surprise')semitones=1.4+2.2*Math.sin(Math.PI*x);
  else if(mode==='tense')semitones=.3+1.5*Math.sin(4*Math.PI*x);
  else if(mode==='finale')semitones=1.1-3.2*x;
  return Math.pow(2,(semitones*a)/12);
}
async function modulate(blob,mode,intensity,Context){
  const AudioCtx=Context||(typeof AudioContext!=='undefined'?AudioContext:typeof webkitAudioContext!=='undefined'?webkitAudioContext:null);
  if(!AudioCtx)throw Error('Aquest navegador no admet Web Audio');
  const context=new AudioCtx();
  try{
    const decoded=await context.decodeAudioData(await blob.arrayBuffer());
    const sampleRate=decoded.sampleRate,n=decoded.length;
    if(n>sampleRate*35)throw Error('Text massa llarg per a la modulació local (màxim 35 s)');
    const length=n+Math.ceil(sampleRate*.04),channels=Math.min(2,decoded.numberOfChannels);
    const out=context.createBuffer(channels,length,sampleRate);
    const windowSize=Math.max(512,Math.round(sampleRate*.045)),hop=Math.round(windowSize/4);
    const weights=new Float32Array(length);
    const sources=Array.from({length:channels},(_,c)=>decoded.getChannelData(c));
    const targets=Array.from({length:channels},(_,c)=>out.getChannelData(c));
    // Cada gra és llegit a velocitat tonal pròpia, però situat sobre una
    // graella de temps fixa. La normalització de finestres conserva el volum.
    for(let start=0;start<n;start+=hop){
      const ratio=contour(mode,(start+windowSize*.5)/n,intensity);
      for(let j=0;j<windowSize&&start+j<length;j++){
        const dst=start+j,relative=(j-windowSize/2)*ratio;
        const srcPos=start+windowSize/2+relative;
        if(srcPos<0||srcPos>=n-1)continue;
        const i=Math.floor(srcPos),frac=srcPos-i;
        const w=.5-.5*Math.cos(2*Math.PI*j/(windowSize-1));
        weights[dst]+=w;
        for(let c=0;c<channels;c++)targets[c][dst]+=((1-frac)*sources[c][i]+frac*sources[c][i+1])*w;
      }
    }
    for(let i=0;i<length;i++){const w=weights[i];if(w>1e-5)for(let c=0;c<channels;c++)targets[c][i]/=w;}
    return out;
  }finally{await context.close()}
}
return {contour,modulate};
});
