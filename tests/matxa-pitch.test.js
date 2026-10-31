const Pitch=require('../matxa-pitch');
describe('experimental pitch contours',()=>{
 test('questions rise and statements fall at the end',()=>{
   expect(Pitch.contour('question',.98,1)).toBeGreaterThan(Pitch.contour('question',.10,1));
   expect(Pitch.contour('statement',.98,1)).toBeLessThan(Pitch.contour('statement',.10,1));
 });
 test('zero intensity preserves original pitch',()=>{
   for(const mode of ['question','statement','surprise','tense','finale'])
     expect(Pitch.contour(mode,.95,0)).toBe(1);
 });
 test('all ratios are finite',()=>{
   for(let i=0;i<=100;i++)expect(Number.isFinite(Pitch.contour('question',i/100,1))).toBe(true);
 });
});
