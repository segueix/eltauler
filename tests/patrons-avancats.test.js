
const {Chess}=require('chess.js');
const P=require('../patrons');
const H=require('../hieroclosure');
const J=require('../jeropedagogia');
function testMove(fen,uci) {
    const g=new Chess(fen),m=g.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]});
    if(!m)throw Error('Test move illegal: '+uci);
    return {ChessCtor:Chess,fenBefore:fen,fenAfter:g.fen(),move:m};
}
const has=(c,id)=>P.detect(c).find(x=>x.id===id);
test('els 4 nous detectors geomètrics són automàtics, però desviació i interferència demanen certificat',()=>{
    for(const id of ['pin','skewer','discoveredAttack','discoveredCheck']) {
        expect(P.INDEX[id].status).toBe('detector');
    }
    for(const id of ['deflection','interference']) {
        expect(P.INDEX[id].status).toBe('variant_certificada');
        expect(P.AUTOMATIC).not.toContain(id);
    }
    expect(P.CATALOG.filter(x=>x.status==='detector')).toHaveLength(30);
    expect(P.CATALOG.filter(x=>x.status==='variant_certificada')).toHaveLength(2);
    expect(P.CATALOG.filter(x=>x.status==='pendent_de_validacio')).toHaveLength(28);
});
test('clavada absoluta nova, sense afirmar guany de peça',()=>{
    const c=testMove('4k3/4n3/8/8/8/8/8/R5K1 w - - 0 1','a1e1');
    const x=has(c,'pin');
    expect(x).toBeTruthy();
    expect(x.evidence).toMatchObject({front:'e7',rear:'e8',absolute:true});
    expect(x.text).not.toMatch(/guanya|forçat|decisiu/);
});
test('enfilada nova de dama i torre',()=>{
    const c=testMove('r7/8/q7/8/8/8/8/1R2K3 w - - 0 1','b1a1');
    const x=has(c,'skewer');
    expect(x).toBeTruthy();
    expect(x.evidence).toMatchObject({front:'a6',rear:'a8'});
    expect(x.text).not.toMatch(/guanya|forçat|decisiu/);
});
test('línia que no és nova no produeix falses clavades',()=>{
    const c=testMove('4k3/4n3/8/8/8/8/8/4R1K1 w - - 0 1','g1h1');
    expect(has(c,'pin')).toBeFalsy();
});
test('descoberta real: una peça pròpia abandona la línia de la torre',()=>{
    const c=testMove('7k/8/8/8/8/8/N7/R5K1 w - - 0 1','a2b4');
    const x=has(c,'discoveredAttack');
    // El rei de h8 no és a la mateixa columna; no hi ha peça rival a a8.
    expect(x).toBeFalsy();
    const d=testMove('r6k/8/8/8/8/8/N7/R5K1 w - - 0 1','a2b4');
    expect(has(d,'discoveredAttack')?.evidence).toMatchObject({attacker:'a1',uncovered:'a2',target:'a8'});
});
test('escac a la descoberta només quan la línia destapada ataca el rei',()=>{
    const c=testMove('k7/8/8/8/8/8/N7/R5K1 w - - 0 1','a2b4');
    expect(has(c,'discoveredCheck')?.evidence).toMatchObject({attacker:'a1',uncovered:'a2',target:'a8'});
    expect(has(c,'discoveredAttack')).toBeFalsy();
});
test('cap desviació ni interferència sense una variant certificada',()=>{
    expect(P.detectCertifiedLine({})).toEqual([]);
    const candidate={fen:new Chess().fen(),conclusion:{requestedDepth:16}};
    expect(P.detectCertifiedLine({candidate,ChessCtor:Chess,Hieroclosure:H})).toEqual([]);
    const c=testMove('4k3/8/8/8/8/8/8/R3K3 w - - 0 1','a1a7');
    expect(P.detect(c).some(x=>['deflection','interference'].includes(x.id))).toBe(false);
});
test('les explicacions pedagògiques conserven el retorn segur quan no hi ha certificat',()=>{
    expect(J.build({fen:new Chess().fen()},Chess,H,P)).toBeNull();
});


function mechanicallyClosed(base) {
    // El certificat reflecteix una verificació del desenllaç; la CI no
    // substitueix Stockfish i comprova només l'extracció del motiu.
    const end=H.createVerifier(Chess).inspect(base);
    expect(end).not.toBeNull();
    return {...base,conclusion:{
        version:H.VERSION,fen:base.fen,line:H.lineOf(base),
        finalFen:end.finalFen,kind:end.kind,gain:end.gain,
        minDepth:14,requestedDepth:16
    }};
}
test('desviació: el defensor atacat abandona la protecció de la torre capturada',()=>{
    const candidate=mechanicallyClosed({
        fen:'r5k1/1b6/8/8/8/8/8/R1R3K1 w - - 0 1',
        solutionMoves:['c1c7','g1f2','a1a8'],
        replyMoves:['b7c8','g8f8']
    });
    const hits=P.detectCertifiedLine({candidate,ChessCtor:Chess,Hieroclosure:H});
    expect(hits.map(h=>h.id)).toContain('deflection');
    const hint=hits.find(h=>h.id==='deflection');
    expect(hint.evidence).toMatchObject({defender:'b7',target:'a8'});
    const explanation=J.build(candidate,Chess,H,P);
    expect(explanation.advancedPatterns.map(x=>x.id)).toContain('deflection');
    expect(explanation.learn).toMatch(/Desviació demostrada/);
    expect(J.solvedStep(candidate,1,Chess,H,P)).not.toMatch(/desviació/i);
});
test('interferència: una peça se situa entre la torre defensora i la dama capturada',()=>{
    const candidate=mechanicallyClosed({
        fen:'q6r/7k/5B2/8/8/8/8/R5K1 w - - 0 1',
        solutionMoves:['f6d8','g1f2','a1a8'],
        replyMoves:['h7g6','g6f5']
    });
    const hits=P.detectCertifiedLine({candidate,ChessCtor:Chess,Hieroclosure:H});
    expect(hits.map(h=>h.id)).toContain('interference');
    expect(hits.find(h=>h.id==='interference').evidence)
        .toMatchObject({defender:'h8',blocking:'d8',target:'a8'});
    // Canviar la prova o la línia no pot activar el motiu.
    expect(P.detectCertifiedLine({
        candidate:{...candidate,solutionMoves:['f6d8','g1f2','a1a7']},
        ChessCtor:Chess,Hieroclosure:H
    })).toEqual([]);
    expect(J.solvedStep(candidate,1,Chess,H,P)).not.toMatch(/interferència/i);
});
