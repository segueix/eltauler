/* Pitch shifter de vocoder de fase (STFT). Mateixa durada, contorn F0 variable.
 * Experimental: preserva el ritme i compensa aproximadament l'embolcall espectral;\n * no equival a un model TTS amb control prosòdic ni garanteix tots els formants.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ElTaulerPitch=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
function contour(mode,x,intensity){
 x=Math.max(0,Math.min(1,x));const a=Math.max(0,Math.min(1,intensity));let st=0;
 if(mode==='question')st=-.2+2.3*Math.pow(Math.max(0,(x-.56)/.44),1.4);
 else if(mode==='statement')st=.1-2.1*Math.pow(Math.max(0,(x-.48)/.52),1.3);
 else if(mode==='surprise')st=.7+1.5*Math.sin(Math.PI*x);
 else if(mode==='tense')st=.2+.9*Math.sin(4*Math.PI*x);
 else if(mode==='finale')st=.6-1.9*x;
 return Math.pow(2,st*a/12);
}
function fft(re,im,inverse){
 const n=re.length;
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]}}
 for(let size=2;size<=n;size*=2){const a=(inverse?2:-2)*Math.PI/size,wr=Math.cos(a),wi=Math.sin(a);
 for(let start=0;start<n;start+=size){let cr=1,ci=0;for(let j=0;j<size/2;j++){
 const u=start+j,v=u+size/2,tr=cr*re[v]-ci*im[v],ti=cr*im[v]+ci*re[v];
 re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;
 const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr;
 }}}
 if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n}
}
function process(input,sr,mode,intensity){
 const N=2048,H=256,half=N/2,n=input.length;
 const out=new Float32Array(n),weights=new Float32Array(n);
 const window=new Float64Array(N);for(let i=0;i<N;i++)window[i]=.5-.5*Math.cos(2*Math.PI*i/(N-1));
 const oldPhase=new Float64Array(half+1),sumPhase=new Float64Array(half+1);
 const re=new Float64Array(N),im=new Float64Array(N),magn=new Float64Array(half+1),freq=new Float64Array(half+1);
 const magnOut=new Float64Array(half+1),freqOut=new Float64Array(half+1),counts=new Float64Array(half+1);
 const envelope=new Float64Array(half+1),prefix=new Float64Array(half+2);\n const expected=2*Math.PI*H/N;
 for(let start=-N/2;start<n;start+=H){
   const ratio=contour(mode,(start+N/2)/Math.max(1,n),intensity);
   re.fill(0);im.fill(0);magnOut.fill(0);freqOut.fill(0);counts.fill(0);
   for(let i=0;i<N;i++){const pos=start+i;if(pos>=0&&pos<n)re[i]=input[pos]*window[i]}
   fft(re,im,false);
   for(let k=0;k<=half;k++){
    magn[k]=Math.hypot(re[k],im[k]);
    const phase=Math.atan2(im[k],re[k]);
    let delta=phase-oldPhase[k]-expected*k;
    oldPhase[k]=phase;delta-=2*Math.PI*Math.round(delta/(2*Math.PI));
    freq[k]=k+delta*N/(2*Math.PI*H);
    // Trasllat dels parcials al nou bin mantenint el desplaçament sub-bin.
    const target=Math.round(k*ratio);
    if(target<=half){magnOut[target]+=magn[k];freqOut[target]+=magn[k]*freq[k]*ratio;counts[target]+=magn[k]}
   }
   re.fill(0);im.fill(0);
   for(let k=0;k<=half;k++){
     if(counts[k]>1e-12){const f=freqOut[k]/counts[k];sumPhase[k]+=2*Math.PI*H*f/N;
       re[k]=magnOut[k]*Math.cos(sumPhase[k]);im[k]=magnOut[k]*Math.sin(sumPhase[k])}
     if(k>0&&k<half){re[N-k]=re[k];im[N-k]=-im[k]}
   }
   fft(re,im,true);
   for(let i=0;i<N;i++){const pos=start+i;if(pos>=0&&pos<n){const w=window[i];out[pos]+=re[i]*w;weights[pos]+=w*w}}
 }
 for(let i=0;i<n;i++)if(weights[i]>1e-8)out[i]/=weights[i];
 return out;
}
async function modulate(blob,mode,intensity,Context){
 const C=Context||(typeof AudioContext!=='undefined'?AudioContext:typeof webkitAudioContext!=='undefined'?webkitAudioContext:null);
 if(!C)throw Error('Web Audio no disponible');
 const ctx=new C();
 try{
 const decoded=await ctx.decodeAudioData(await blob.arrayBuffer());
 const sr=decoded.sampleRate,n=decoded.length;
 if(n>sr*20)throw Error('Màxim 20 segons per al processament tonal');
 const out=ctx.createBuffer(Math.min(2,decoded.numberOfChannels),n,sr);
 for(let c=0;c<out.numberOfChannels;c++)out.copyToChannel(process(decoded.getChannelData(c),sr,mode,intensity),c);
 return out;
 }finally{await ctx.close()}
}
return {contour,process,modulate};
});
