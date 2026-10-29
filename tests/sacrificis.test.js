const { Chess } = require('chess.js');
const H = require('../hieroclosure');
const P = require('../patrons');
const JP = require('../jeropedagogia');

const mate3 = {
    fen: 'rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 9',
    solutionMoves: ['d3d8','d2g5','g5d8'], replyMoves: ['e8d8','d8c7']
};
const a = (move, value, type = 'mate') => ({
    move,eval:value,evalType:type,depth:16,pv:[move]
});
const rows = [
    [a('d3d8',3),a('d1e1',136,'cp')],
    [a('e8d8',-2)],
    [a('d2g5',2),a('d2f4',-1098,'cp')],
    [a('d8c7',-1)],
    [a('g5d8',1),a('g1f3',-1585,'cp')]
];
function stockfishDoubleChecked(overrides={}) {
    const byFen=new Map(), g=new Chess(mate3.fen);
    H.lineOf(mate3).forEach((u,i)=>{
        byFen.set(g.fen(),i);
        const move=g.move({from:u.slice(0,2),to:u.slice(2,4)});
        if(!move) throw Error('Invalid mate fixture: '+u);
    });
    return jest.fn(async (fen,depth,multiPv)=>{
        const index=byFen.get(fen);
        if(index===undefined)return null;
        const base=rows[index],best=base[0];
        if(index%2===1&&multiPv>1){
            if(overrides.noDefenses)return {bestMove:best,alternatives:[best]};
            const game=new Chess(fen);
            const others=game.moves({verbose:true})
                .map(m=>m.from+m.to+(m.promotion||''))
                .filter(u=>u!==best.move);
            const alternatives=[best,...others.slice(0,2).map(u=>a(u,-3))];
            return {bestMove:best,alternatives};
        }
        const next = index===2&&overrides.losingReply
            ? [a('d2g5',-100,'cp'),a('d2f4',-1000,'cp')] : base;
        return {bestMove:next[0],alternatives:next};
    });
}
async function verified(overrides){
    return H.createVerifier(Chess,stockfishDoubleChecked(overrides)).verify(mate3);
}

test('catàleg: 30 automàtics, 3 de variant i 27 pendents',()=>{
    expect(P.INDEX.sacrifice).toMatchObject({
        status:'variant_certificada',verification:'stockfish_i_variant'
    });
    const counts = P.CATALOG.reduce((acc,p)=>(acc[p.status]=(acc[p.status]||0)+1,acc),{});
    expect(counts).toEqual({
        detector:30,variant_certificada:3,pendent_de_validacio:27
    });
    expect(P.AUTOMATIC).not.toContain('sacrifice');
});
test('una dama lliurada i acceptada abans del mat és sacrifici material, no un simple atac',()=>{
    const offers=H.materialOffers(mate3,Chess);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
        step:1,offered:'q',offerUci:'d3d8',replyUci:'e8d8',
        square:'d8',loss:9
    });
    const result=await verified();
    expect(result).not.toBeNull();
    expect(result.conclusion.sacrifices).toHaveLength(1);
    const evidence=H.certifiedSacrifices(result,Chess);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
        step:1,loss:9,compensationKind:'mate'
    });
    const hits=P.detectCertifiedLine({candidate:result,ChessCtor:Chess,Hieroclosure:H});
    expect(hits.some(x=>x.id==='sacrifice')).toBe(true);
    const lesson=JP.build(result,Chess,H,P);
    expect(lesson.advancedPatterns.map(x=>x.id)).toContain('sacrifice');
    expect(lesson.learn).toMatch(/Sacrifici verificat/);
    expect(JP.solvedStep(result,1,Chess,H,P)).not.toMatch(/sacrifici/i);
});
test('un intercanvi de dames equivalent no es confon amb un sacrifici',()=>{
    const exchange={
        fen:'3qr1k1/8/8/8/8/8/8/3Q2K1 w - - 0 1',
        solutionMoves:['d1d8','g1f2','f2e3'],
        replyMoves:['e8d8','g8f7']
    };
    expect(H.materialOffers(exchange,Chess)).toEqual([]);
});
test('un simple tema importat o certificat incomplet no és un sacrifici',()=>{
    const counterfeit={
        ...mate3,theme:['sacrifice'],
        conclusion:{version:H.VERSION,fen:mate3.fen,line:H.lineOf(mate3),
            kind:'mate',requestedDepth:16,minDepth:14,
            sacrifices:[{step:1,offerUci:'d3d8',replyUci:'e8d8'}]}
    };
    expect(H.certifiedSacrifices(counterfeit,Chess)).toEqual([]);
    expect(P.detectCertifiedLine({
        candidate:counterfeit,ChessCtor:Chess,Hieroclosure:H
    })).toEqual([]);
});
test('no es publica el sacrifici si es falsifica la compensació després de la captura',async()=>{
    const valid=await verified();
    expect(valid.conclusion.sacrifices).toHaveLength(1);
    const tampered=JSON.parse(JSON.stringify(valid));
    tampered.stepAlternatives[1][0].eval = -100;
    expect(H.certifiedSacrifices(tampered,Chess)).toEqual([]);
    expect(P.detectCertifiedLine({
        candidate:tampered,ChessCtor:Chess,Hieroclosure:H
    }).some(x=>x.id==='sacrifice')).toBe(false);
});
test('el motor o les defenses incompletes no poden avalar un sacrifici',async()=>{
    expect(await H.createVerifier(Chess,async()=>null).verify(mate3)).toBeNull();
    const valid=await verified();
    expect(valid.conclusion.sacrifices.every(s=>s.checkedDefenses>=1)).toBe(true);
    // Els resultats d'una posició inicial sense línia acreditada no són prova.
    expect(H.certifiedSacrifices({...mate3,conclusion:{sacrifices:[]}},Chess)).toEqual([]);
});
