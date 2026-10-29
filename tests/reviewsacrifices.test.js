const fs=require('fs'),vm=require('vm');
const {Chess}=require('chess.js');
const S=require('../reviewsacrifices');
const src=fs.readFileSync(require.resolve('../app.js'),'utf8');

const moves=['e4','e5','Qh5','Nc6','Qxe5+','Nxe5'];
function gameEntry(list=moves) {
    const g=new Chess();
    for(const san of list.slice(0,4))g.move(san);
    return {id:'fixture',playerColor:'w',
        moveReviews:[{
            fen:g.fen(),playerMove:'h5e5',playerMoveSan:'Qxe5+',
            color:'w',moveNumber:3,quality:'excellent'
        }]};
}
test('identifica la peça capturada pel rival i el dèficit de material real',()=>{
    const candidates=S.collect(gameEntry(),moves,Chess);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
        move:'h5e5',reply:'c6e5',san:'Qxe5+',replySan:'Nxe5',
        offered:'q',loss:8,moveNumber:3,ply:4
    });
    expect(new Chess(candidates[0].fen).turn()).toBe('w');
});
test('no atribueix jugades al color equivocat, a revisions absents o a FEN falses',()=>{
    expect(S.collect({...gameEntry(),playerColor:'b'},moves,Chess)).toEqual([]);
    expect(S.collect({...gameEntry(),moveReviews:[]},moves,Chess)).toEqual([]);
    expect(S.collect({...gameEntry(),moveReviews:[{fen:'invalid',playerMove:'h5e5'}]},moves,Chess)).toEqual([]);
    expect(S.collect({...gameEntry(),moveReviews:[{...gameEntry().moveReviews[0],playerMove:'a2a4'}]},moves,Chess)).toEqual([]);
});
test('una oferta rebutjada no és un sacrifici acceptat',()=>{
    const refused=[...moves.slice(0,5),'Qe7'];
    expect(S.collect(gameEntry(),refused,Chess)).toEqual([]);
});
test('cap PGN truncat o invàlid publica un sacrifici que no es produeix',()=>{
    expect(S.collect(gameEntry(),moves.slice(0,5),Chess)).toEqual([]);
    expect(S.collect(gameEntry(),['e4','e5','Qh5','Nc6','Qxe5+','notamove'],Chess)).toEqual([]);
    expect(S.collect(gameEntry(),null,Chess)).toEqual([]);
});
test('les proves desades caduquen quan canvia la partida o la versió',()=>{
    const entry=gameEntry();
    const saved={version:S.VERSION,key:S.cacheKey(entry,moves),checked:1,candidates:1,results:[]};
    entry.positionalSacrificeReview=saved;
    expect(S.cached(entry,moves)).toBe(saved);
    expect(S.cached(entry,moves.slice(0,4))).toBeNull();
    expect(S.cached({...entry,playerColor:'b'},moves)).toBeNull();
    expect(S.cached({...entry,positionalSacrificeReview:{...saved,version:0}},moves)).toBeNull();
});
test('la ressenya mostra el botó sota demanda sense executar Stockfish al render',()=>{
    const a=src.indexOf('// Sacrificis posicionals de partides reals:');
    const b=src.indexOf('// =================== RESSENYA LOCAL EN HTML',a);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    const context=vm.createContext({
        window:{ElTaulerReviewSacrifices:S},
        historyEntryReviewCount:()=>1,
        historyEntryIsHydrated:()=>true,
        getHistoryMoves:()=>moves,
        escapeHtml:x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
    });
    vm.runInContext(src.slice(a,b),context);
    const entry=gameEntry();
    context.entry=entry;
    const first=vm.runInContext('renderReviewPositionalSacrificesHtml(entry)',context);
    expect(first).toContain('history-check-positional');
    expect(first).toContain('Analitza sacrificis posicionals');
    expect(first).not.toContain('hist-positional-sacrifice-link');
    entry.positionalSacrificeReview={
        version:S.VERSION,key:S.cacheKey(entry,moves),checked:1,candidates:1,
        results:[{fen:'test',move:'h5e5',san:'Qxe5+',moveNumber:3,offered:'q',
            analysis:{type:'positional_sacrifice',loss:9,text:'Compensació documentada',
                evaluations:[{depth:18,cp:25},{depth:22,cp:20}],
                initiative:{checks:1,captures:0},structure:{doubled:0,passed:[]}}}]
    };
    const rerender=vm.runInContext('renderReviewPositionalSacrificesHtml(entry)',context);
    expect(rerender).toContain('hist-positional-sacrifice-link');
    expect(rerender).toContain('jugada 3');
    expect(rerender).toContain('profunditat 22');
});
test('el codi de revisió usa el verificador profund a demanda i permet navegar a la jugada',()=>{
    expect(src).toContain('H.createPositionalVerifier(Chess,analyzeFenRobust)');
    expect(src).toContain("reviewContent.find('.history-check-positional')");
    expect(src).toContain("reviewContent.find('.hist-positional-sacrifice-link')");
    expect(src).toContain('jumpToHistoryMove(moveNumber,san,fen,uci)');
    const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
    expect(html).toContain('reviewsacrifices.js?v=');
    expect(html.indexOf('reviewsacrifices.js')).toBeLessThan(html.indexOf('app.js?v='));
});
