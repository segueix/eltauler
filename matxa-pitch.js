/* Pitch shifter de vocoder de fase (STFT). Mateixa durada, contorn F0 variable.
 * Experimental: preserva el ritme i compensa aproximadament l'embolcall espectral;
 * no equival a un model TTS amb control prosòdic ni garanteix tots els formants.
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
 const envelope=new Float64Array(half+1),prefix=new Float64Array(half+2);
 const expected=2*Math.PI*H/N;
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
// A la TV canviem el període dels trams sonors amb solapament de polsos.
// Això conserva les consonants i l'embolcall de cada pols de la veu.
function interpolate(points, x) {
    for (let i = 1; i < points.length; i++) {
        if (x <= points[i][0]) {
            const [a, y] = points[i - 1], [b, z] = points[i];
            return y + (z - y) * (x - a) / (b - a);
        }
    }
    return points[points.length - 1][1];
}
const QUESTION_ACCENTS = [[0, 4.4], [.09, 4.4], [.14, 3], [.25, 3.5],
    [.32, 2.1], [.41, -1.7], [.49, .7], [.56, 2.7], [.66, 1.4], [.74, 0], [1, 0]];
const QUESTION_END = [[.76, .87], [.81, .83], [.835, .82], [.87, 1.02],
    [.92, 1.24], [.97, 1.38], [1, 1.36]];
const FALLING_END = [[.76, 1.05], [.83, 1.13], [.90, .96], [1, .79]];

function questionRatio(mode, x, hz, reference) {
    const accent = 2 ** (interpolate(QUESTION_ACCENTS, x) / 12);
    if (x < .76) return accent;
    const end = tightenRatio(reference * interpolate(mode === 'fall' ? FALLING_END : QUESTION_END, x) / hz);
    const blend = Math.min(1, (x - .76) / .06);
    return accent + (end - accent) * blend;
}

function tightenRatio(ratio) {
    return Math.max(.68, Math.min(1.85, ratio));
}

function voicePeriods(samples, rate, hop) {
    const periods = new Float64Array(Math.ceil(samples.length / hop));
    const lo = Math.floor(rate / 440), hi = Math.ceil(rate / 75);
    const radius = Math.round(rate * .011);
    const corr = new Float64Array(hi + 2);
    for (let frame = 0; frame < periods.length; frame++) {
        const center = frame * hop;
        if (center < radius + hi || center + radius + hi >= samples.length) continue;
        let energy = 0;
        for (let i = center - radius; i < center + radius; i += 3) energy += samples[i] ** 2;
        if (energy < .000016 * (radius * 2 / 3)) continue;
        let best = .67;
        for (let lag = lo - 1; lag <= hi + 1; lag++) {
            let cross = 0, left = 0, right = 0;
            for (let i = center - radius - (lag >> 1); i < center + radius - (lag >> 1); i += 3) {
                const a = samples[i], b = samples[i + lag];
                cross += a * b;
                left += a * a;
                right += b * b;
            }
            corr[lag] = cross / (Math.sqrt(left * right) || 1);
            if (lag >= lo && lag <= hi) best = Math.max(best, corr[lag]);
        }
        for (let lag = lo; lag <= hi; lag++) {
            if (corr[lag] >= Math.max(.67, best * .92) &&
                corr[lag] > corr[lag - 1] && corr[lag] >= corr[lag + 1]) {
                periods[frame] = lag;
                break;
            }
        }
    }
    return periods;
}

function shiftVoicedRun(samples, out, periods, hop, from, to, ratio) {
    const start = from * hop, end = Math.min(samples.length, to * hop);
    const periodAt = pos => periods[Math.max(from, Math.min(to - 1, Math.round(pos / hop)))];
    const nearestPeak = (pos, radius) => {
        let best = Math.round(pos), peak = -Infinity;
        for (let i = Math.max(0, Math.ceil(pos - radius)); i <= Math.min(samples.length - 1, pos + radius); i++) {
            if (samples[i] > peak) { best = i; peak = samples[i]; }
        }
        return best;
    };
    const first = nearestPeak(start, periodAt(start) / 2);
    const pulses = [first];
    for (let pos = first; pos < end;) {
        const period = periodAt(pos);
        pos = nearestPeak(pos + period, period * .22);
        pulses.push(pos);
    }

    const wet = new Float64Array(end - start), weight = new Float64Array(end - start);
    let sourcePulse = 0;
    for (let pos = first; pos < end + periodAt(end); pos += periodAt(pos) / ratio(pos, periodAt(pos))) {
        while (sourcePulse + 1 < pulses.length &&
            Math.abs(pulses[sourcePulse + 1] - pos) <= Math.abs(pulses[sourcePulse] - pos)) sourcePulse++;
        const inputAt = pulses[sourcePulse], outputAt = Math.round(pos);
        const radius = periodAt(inputAt);
        for (let k = -radius + 1; k < radius; k++) {
            const i = outputAt + k - start, j = inputAt + k;
            if (i < 0 || i >= wet.length || j < 0 || j >= samples.length) continue;
            const w = .5 + .5 * Math.cos(Math.PI * k / radius);
            wet[i] += samples[j] * w;
            weight[i] += w;
        }
    }
    for (let i = 0; i < wet.length; i++) {
        if (weight[i] < .08) continue;
        const fade = Math.min(1, i / (hop * 1.25), (wet.length - i - 1) / (hop * 1.25));
        out[start + i] += fade * (wet[i] / weight[i] - samples[start + i]);
    }
}

function processQuestion(samples, rate, mode) {
    if (mode !== 'rise' && mode !== 'fall') return samples;
    if (rate < 16000 || rate > 48000 || samples.length > rate * 20) return samples;
    const hop = Math.round(rate * .01), periods = voicePeriods(samples, rate, hop);
    const first = periods.findIndex(Boolean);
    if (first < 0) return samples;
    let last = periods.length - 1;
    while (!periods[last]) last--;
    if (last - first < 14) return samples;
    const reference = Array.from(periods.subarray(first, last + 1))
        .filter(Boolean).map(period => rate / period).sort((a, b) => a - b);
    const median = reference[Math.floor(reference.length / 2)];
    const out = Float32Array.from(samples);
    const ratio = (pos, period) => questionRatio(mode,
        Math.max(0, Math.min(1, (pos / hop - first) / (last - first))), rate / period, median);
    for (let i = first; i <= last;) {
        if (!periods[i]) { i++; continue; }
        const start = i;
        while (periods[i]) i++;
        if (i - start >= 3) shiftVoicedRun(samples, out, periods, hop, start, i, ratio);
    }
    return out;
}

// Matxa serveix WAV PCM mono de 24 bits. També admetem PCM mono de 16 bits.
function modulateQuestionWav(buffer, mode) {
    const view = new DataView(buffer);
    const tag = at => String.fromCharCode(...new Uint8Array(buffer, at, 4));
    if (buffer.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return buffer;
    let rate = 0, width = 0;
    for (let at = 12; at + 8 <= buffer.byteLength;) {
        const size = view.getUint32(at + 4, true), start = at + 8;
        if (size > buffer.byteLength - start) return buffer;
        if (tag(at) === 'fmt ' && size >= 16) {
            if (view.getUint16(start, true) !== 1 || view.getUint16(start + 2, true) !== 1) return buffer;
            rate = view.getUint32(start + 4, true);
            width = view.getUint16(start + 14, true) / 8;
            if ((width !== 2 && width !== 3) || view.getUint16(start + 12, true) !== width) return buffer;
        } else if (tag(at) === 'data' && rate && width) {
            if (rate < 16000 || rate > 48000 || size > rate * width * 20 || size % width) return buffer;
            const scale = 2 ** (width * 8 - 1);
            const samples = Float32Array.from({ length: size / width }, (_, i) => {
                const at = start + i * width;
                return width === 2 ? view.getInt16(at, true) / scale
                    : ((view.getInt8(at + 2) << 16) | view.getUint16(at, true)) / scale;
            });
            const shifted = processQuestion(samples, rate, mode);
            if (shifted === samples) return buffer;
            const output = buffer.slice(0), dest = new DataView(output);
            shifted.forEach((sample, i) => {
                const at = start + i * width;
                const value = Math.min(scale - 1, Math.max(-scale, Math.round(sample * scale)));
                dest.setUint16(at, value & 0xffff, true);
                if (width === 3) dest.setUint8(at + 2, (value >> 16) & 0xff);
            });
            return output;
        }
        at = start + size + size % 2;
    }
    return buffer;
}

return {contour,process,modulate,processQuestion,modulateQuestionWav};
});
