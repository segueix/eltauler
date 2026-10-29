
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
    const c=testMove('4k3/4n3/8/8/8/8/8/R3K3 w - - 0 1','a1e1');
    const x=has(c,'pin');
    expect(x).toBeTruthy();
    expect(x.evidence).toMatchObject({front:'e7',rear:'e8',absolute:true});
    expect(x.text).not.toMatch(/guanya|forçat|decisiu/);
});
test('enfilada nova de dama i torre',()=>{
    const c=testMove('q6r/8/8/8/8/8/8/1R2K3 w - - 0 1','b1a1');
    const x=has(c,'skewer');
    expect(x).toBeTruthy();
    expect(x.evidence).toMatchObject({front:'a8',rear:'h8'});
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
