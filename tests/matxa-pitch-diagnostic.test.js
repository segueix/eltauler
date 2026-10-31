const D=require('../matxa-pitch-diagnostic');
describe('Matxa F0 diagnostic',()=>{
 test('estimates a 180Hz sine wave',()=>{
  const rate=16000,n=rate,signal=new Float32Array(n);
  for(let i=0;i<n;i++)signal[i]=.5*Math.sin(2*Math.PI*180*i/rate);
  const points=D.estimate({sampleRate:rate,getChannelData:()=>signal});
  expect(points.length).toBeGreaterThan(3);
  expect(D.summarize(points,1)[1]).toBeGreaterThan(170);
  expect(D.summarize(points,1)[1]).toBeLessThan(190);
 });
 test('no voiced samples returns empty values',()=>{
  const points=D.estimate({sampleRate:16000,getChannelData:()=>new Float32Array(16000)});
  expect(D.summarize(points,1)).toEqual([null,null,null]);
 });
});