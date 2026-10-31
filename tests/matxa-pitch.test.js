const Pitch=require('../matxa-pitch');
describe('pitch shifting with phase vocoder',()=>{
 test('question rises and statement falls',()=>{
  expect(Pitch.contour('question',.95,1)).toBeGreaterThan(1.3);
  expect(Pitch.contour('statement',.95,1)).toBeLessThan(.85);
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
  expect(fUp).toBeGreaterThan(210);
  expect(fDown).toBeLessThan(165);
  expect(up.length).toBe(n);
 });
});