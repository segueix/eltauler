const { Chess } = require('chess.js');
const P = require('../patrons');
const TV = require('../stockfishtv');
const JP = require('../jeropedagogia');
const HC = require('../hieroclosure');
const GB = require('../gamebroadcast');
const examples = require('../data/patrons-lichess-cc0.json');
const fs = require('fs');
const path = require('path');

function examine(fen, uci) {
    const g = new Chess(fen);
    const move = g.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] });
    if(!move) throw Error('Illegal fixture: '+uci);
    return { ChessCtor: Chess, fenBefore:fen, fenAfter:g.fen(), move, tier:'mid', ply:0 };
}
function ids(ctx){return P.detect(ctx).map(x=>x.id);}
describe('Fase 5: catàleg, fiabilitat i llengua', () => {
    test('60 conceptes exactes, 4 famílies, termes catalans únics i estat explícit', () => {
        expect(P.CATALOG).toHaveLength(60);
        const counts = P.CATALOG.reduce((a,x)=>{a[x.family]=(a[x.family]||0)+1;return a;},{});
        expect(counts).toEqual({tactica:22,posicional:18,defensa:10,finals:10});
        expect(new Set(P.CATALOG.map(x=>x.id)).size).toBe(60);
        expect(P.CATALOG.every(x=>x.name && ['detector','variant_certificada','pendent_de_validacio'].includes(x.status))).toBe(true);
        expect(P.CATALOG.find(x=>x.id==='zugzwang').status).toBe('pendent_de_validacio');
        expect(P.CATALOG.find(x=>x.id==='fork').status).toBe('detector');
        expect(P.CATALOG.find(x=>x.id==='bishopPair').status).toBe('pendent_de_validacio');
    });
    test('només s’enuncien patrons verificables amb moviments legals i FEN concordants',()=>{
        expect(P.detect({})).toEqual([]);
        const c = examine(new Chess().fen(),'g1f3');
        expect(P.detect({...c,fenAfter:c.fenBefore})).toEqual([]);
        expect(P.detect({...c,move:{...c.move,to:'z9'}})).toEqual([]);
        expect(P.detect({...c,ChessCtor:null})).toEqual([]);
        expect(P.detect({...c,move:{...c.move,san:'Qh5#'}}).length).toBeGreaterThanOrEqual(0);
    });
    test('forquilla geomètrica d’un cavall: les dues peces estan realment atacades',()=>{
        const ctx=examine('7k/8/2r5/5q2/8/5N2/8/K7 w - - 0 1','f3d4');
        const hits=P.detect(ctx);expect(hits.map(x=>x.id)).toEqual(expect.arrayContaining(['fork','doubleAttack']));
        const fork=hits.find(x=>x.id==='fork');expect(fork.evidence.targets.sort()).toEqual(['c6','f5']);
        expect(fork.text).not.toMatch(/guanya|decisiu|mate/i);
    });
    test('peó passat i finals sense confondre geometria amb avantatge',()=>{
        const c=examine('8/8/8/8/P7/8/8/4K2k w - - 0 1','a4a5');
        expect(ids(c)).toContain('passedPawn');
        expect(P.detect(c).find(x=>x.id==='passedPawn').text).toMatch(/peó passat avança/);
    });
    test('columnes obertes i setena fila tenen proves del tauler',()=>{
        const open=examine('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1','a1d1');
        expect(ids(open)).toContain('openFile');
        expect(P.candidates(open).some(x=>x.payload.patternId==='openFile')).toBe(true);
        const seventh=examine('4k3/8/8/8/8/8/R7/4K3 w - - 0 1','a2a7');
        expect(ids(seventh)).toContain('rookSeventh');
    });
    test('enroc, fianquet i captures sense atac visible',()=>{
        expect(ids(examine('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1','e1g1'))).toContain('castling');
        expect(ids(examine('4k3/8/8/8/8/1P6/8/2B1K3 w - - 0 1','c1b2'))).toContain('fianchetto');
        const cap=examine('4k3/8/8/8/8/8/8/R2rK3 w - - 0 1','a1d1');
        expect(ids(cap)).toContain('safeCapture');
    });
    test('la TV rep els patrons només com a candidats addicionals verificats',()=>{
        const c=examine('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1','a1d1');
        const base=TV.tvBroadcastStep(c);
        const enriched=TV.tvBroadcastStep({...c,patterns:P});
        expect(enriched.candidates.length).toBeGreaterThan(base.candidates.length);
        const x=enriched.candidates.find(x=>x.payload&&x.payload.patternId==='openFile');
        expect(x).toBeTruthy();expect(x.reliability).toBe('rules');
        expect(x.priority).toBeLessThan(70);
        expect(x.text).not.toMatch(/millor jugada|forçada|guanyador/i);
    });
    test('comentaris de partides i entrenament: només patrons JA realitzats',()=>{
        const ctx=examine('8/8/8/8/P7/8/8/4K2k w - - 0 1','a4a5');
        const result=GB.comment(Chess,TV,{fenBefore:ctx.fenBefore,fenAfter:ctx.fenAfter,
            move:'a5',scope:'training',playerColor:'w',patterns:P});
        expect(result.text).toMatch(/peó passat/);
        const before=GB.comment(Chess,TV,{fenBefore:ctx.fenBefore,fenAfter:ctx.fenAfter,
            move:'a5',scope:'training',playerColor:'b',patterns:P});
        expect(before.text).not.toMatch(/peó passat/);
    });
    test('els jeroglífics incorporen motius només després de la jugada verificada',()=>{
        const p={fen:'r5k1/8/8/8/8/8/8/R5K1 w - - 0 1',
            solutionMoves:['g1f2','f2e2','a1a8'],replyMoves:['g8f7','f7e7']};
        const inspected=HC.createVerifier(Chess).inspect(p);
        const item={...p,conclusion:{version:HC.VERSION,fen:p.fen,line:inspected.line,
            finalFen:inspected.finalFen,kind:inspected.kind,gain:inspected.gain}};
        const lesson=JP.build(item,Chess,HC,P);
        expect(lesson).toBeTruthy();
        expect(lesson.steps).toHaveLength(3);
        expect(lesson.steps[2].patterns.some(x=>x.id==='safeCapture')).toBe(true);
        expect(JP.solvedStep(item,1,Chess,HC,P)).not.toContain('a8');
        expect(JP.solvedStep(item,3,Chess,HC,P)).toBeNull();
    });
});
describe('Lichess CC0: imports de referència revisats',()=>{
    test('FEN descriu la posició ANTERIOR al primer moviment del rival',()=>{
        expect(examples.examples).toHaveLength(4);
        const IDs=new Set();
        for(const p of examples.examples){
            expect(IDs.has(p.id)).toBe(false);IDs.add(p.id);
            expect(p.themes.length).toBeGreaterThan(1);
            const g=new Chess(p.fen);
            const moves=p.moves.split(' ');
            for(let i=0;i<moves.length;i++){
                const m=moves[i], played=g.move({from:m.slice(0,2),to:m.slice(2,4),promotion:m[4]});
                expect(played).toBeTruthy();
            }
            expect(moves.length).toBeGreaterThanOrEqual(3);
        }
    });
    test('el format dels exemples és explícit i no es confonen etiquetes externes amb verificació local',()=>{
        expect(examples.source).toMatch(/CC0/);
        expect(examples.format).toMatch(/before opponent/);
        expect(P.INDEX.attraction.status).toBe('pendent_de_validacio');
        const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
        expect(html).toContain('<script src="patrons.js');
        expect(html.indexOf('<script src="patrons.js')).toBeLessThan(html.indexOf('<script src="stockfishtv.js'));
    });
});


describe('Importador local de Lichess: sense dependència en línia',()=>{
    const importer=require('../scripts/import-lichess-patrons');
    test('el CSV original es llegeix correctament amb camps entre cometes',()=>{
        expect(importer.fields('abc,"a,b",x')).toEqual(['abc','a,b','x']);
        expect(importer.fields('"a""b",c')).toEqual(['a"b','c']);
    });
    test('valida les jugades de la font, no només les etiquetes de tema',()=>{
        const e=examples.examples[0];
        const x=importer.parse([e.id,e.fen,e.moves,e.rating,80,99,50,e.themes.join(' '),'https://lichess.org/test'].join(','));
        expect(x).toBeTruthy();
        expect(importer.verify(x)).toBe(true);
        expect(importer.verify({...x,moves:'a1a8 b1b8 c1c8'})).toBe(false);
        expect(importer.parse('')).toBeNull();
    });
    test('extreu un fitxer local compacte i només manté les línies legals',async()=>{
        const os=require('os'), dir=fs.mkdtempSync(path.join(os.tmpdir(),'eltauler-lichess-'));
        const input=path.join(dir,'puzzles.csv'),output=path.join(dir,'selection.json');
        try{
            const e=examples.examples[0];
            const row=[e.id,e.fen,e.moves,e.rating,80,95,50,e.themes.join(' '),'https://lichess.org/example'].join(',');
            const fake=['00abc',e.fen,'a1a8 b1b8 c1c8',e.rating,80,95,50,e.themes.join(' '),''].join(',');
            fs.writeFileSync(input,'PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl\n'+row+'\n'+fake+'\n');
            const data=await importer.extract(input,output,{limit:10,minPopularity:70});
            expect(data.examples).toHaveLength(1);
            expect(data.examples[0].verifiedLine).toBe(true);
            expect(data.examples[0].firstMoveByOpponent).toBe(true);
            expect(fs.existsSync(output)).toBe(true);
        }finally{fs.rmSync(dir,{recursive:true,force:true});}
    });
});
