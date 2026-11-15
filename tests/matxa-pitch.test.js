const Pitch=require('../matxa-pitch');
describe('pitch shifting with phase vocoder',()=>{
 test('question rises and statement falls',()=>{
  expect(Pitch.contour('question',.95,1)).toBeGreaterThan(1.09);
  expect(Pitch.contour('statement',.95,1)).toBeLessThan(.94);
 });
 test('no intensity means no shift',()=>{for(const mode of ['question','statement','surprise'])expect(Pitch.contour(mode,.9,0)).toBe(1)});
 test('pitch actually shifts sustained tone',()=>{
  const sr=16000,n=sr*2,input=new Float32Array(n);
  for(let i=0;i<n;i++)input[i]=.4*Math.sin(2*Math.PI*180*i/sr);
  const up=Pitch.process(input,sr,'question',1);
  const down=Pitch.process(input,sr,'statement',1);
  function crossingFreq(samples,start,end){
    let count=0;for(let i=start+1;i<end;i++)if(samples[i-1]<0&&samples[i]>=0)count++;
    return count*sr/(end-start);
  }
  const a=Math.round(sr*1.5),b=Math.round(sr*1.85);
  const fUp=crossingFreq(up,a,b),fDown=crossingFreq(down,a,b);
  expect(fUp).toBeGreaterThan(180);
  expect(fDown).toBeLessThan(180);
  expect(up.length).toBe(n);
 });
});

const rate = 22050;
const speechLike = Float32Array.from({ length: rate }, (_, i) => {
    if (i < .09 * rate || i > .92 * rate || i > .46 * rate && i < .57 * rate) return 0;
    return .2 * Math.sin(2 * Math.PI * 160 * i / rate) + .08 * Math.sin(4 * Math.PI * 160 * i / rate);
});

function pitchWithin(audio, from, to) {
    let previous;
    const rises = [];
    for (let i = Math.ceil(from * rate); i < to * rate; i++) {
        if (audio[i - 1] > 0 || audio[i] <= 0) continue;
        if (previous !== undefined) rises.push(i - previous);
        previous = i;
    }
    rises.sort((a, b) => a - b);
    return rate / rises[Math.floor(rises.length / 2)];
}

test('el to puja al principi i al final, i manté la durada i els silencis', () => {
    const output = Pitch.processQuestion(speechLike, rate, 'rise');
    expect(output).toHaveLength(speechLike.length);
    expect(output.every(Number.isFinite)).toBe(true);
    expect(pitchWithin(output, .15, .27)).toBeGreaterThan(184);
    expect(pitchWithin(output, .84, .90)).toBeGreaterThan(184);
    expect(output.slice(.49 * rate, .53 * rate).every(x => x === 0)).toBe(true);
});

test('la interrogativa parcial conserva el relleu inicial i tanca cap avall', () => {
    const output = Pitch.processQuestion(speechLike, rate, 'fall');
    expect(pitchWithin(output, .15, .27)).toBeGreaterThan(184);
    expect(pitchWithin(output, .85, .90)).toBeLessThan(155);
});

test.each([16, 24])('modula el WAV PCM de %i bits de Matxa sense canviar-ne la capçalera', bits => {
    const width = bits / 8;
    const wav = Buffer.alloc(44 + speechLike.length * width);
    wav.write('RIFF');
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(rate, 24);
    wav.writeUInt32LE(rate * width, 28);
    wav.writeUInt16LE(width, 32);
    wav.writeUInt16LE(bits, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(speechLike.length * width, 40);
    speechLike.forEach((sample, i) => wav.writeIntLE(Math.round(sample * 2 ** (bits - 1)), 44 + i * width, width));
    const bytes = Uint8Array.from(wav).buffer;
    const out = Buffer.from(Pitch.modulateQuestionWav(bytes, 'rise'));
    expect(out).toHaveLength(wav.length);
    expect(out.subarray(0, 44).equals(wav.subarray(0, 44))).toBe(true);
    expect(out.equals(wav)).toBe(false);
    expect(Buffer.from(bytes).equals(wav)).toBe(true);
    expect(Pitch.modulateQuestionWav(bytes, '')).toBe(bytes);
    const truncated = bytes.slice(0, 64);
    expect(Pitch.modulateQuestionWav(truncated, 'rise')).toBe(truncated);
});
