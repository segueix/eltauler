const { Chess } = require('chess.js');
const H = require('../hieroclosure');
const P = require('../patrons');

const refused = {
    fen:'r5k1/8/8/8/8/8/8/5QK1 w - - 0 1',
    solutionMoves:['f1a6','g1f2','f2e3'],
    replyMoves:['g8f7','f7f8']
};
const start=refused.fen;
const uci = m=>m.from+m.to+(m.promotion||'');
function positionAfter(...moves) {
    const g=new Chess(start);
    for(const m of moves) {
        const res=g.move({from:m.slice(0,2),to:m.slice(2,4)});
        if(!res)throw Error('Fixture not legal '+m);
    }
    return g.fen();
}
const offerFen=positionAfter('f1a6');
const capturedFen=positionAfter('f1a6','a8a6');
const position=()=>({fen:start,move:'f1a6',reply:'a8a6'});
const pv=['g1f2','g8f7','f2e3','f7e6'];

function analyzed({low=40,high=45,illegal=false,missing=false,score='cp',original='f1a6'}={}) {
    return jest.fn(async (fen,depth,multipv)=>{
        if(missing) return null;
        if(fen===start)return {bestMove:{move:original,eval:10,evalType:'cp',depth:22},
            alternatives:[{move:original,eval:10,evalType:'cp',depth:22}]};
        if(fen===offerFen) return {bestMove:{move:'a8a6',eval:-40,evalType:'cp',depth:22},
            alternatives:[{move:'a8a6',eval:-40,evalType:'cp',depth:22}]};
        if(fen===capturedFen)return {bestMove:{
            move:'g1f2',eval:depth===18?low:high,evalType:score,
            depth,bound:null,pv:illegal?['g1f8','g8f7','f2e3','f7e6']:pv
        },alternatives:[]};
        return null;
    });
}
describe('Ofertes de sacrifici refusades',()=>{
    test('la captura és legal, però el rival no l’executa',()=>{
        const offers=H.refusedOffers(refused,Chess);
        expect(offers).toHaveLength(1);
        expect(offers[0]).toMatchObject({
            step:1,offered:'q',offerUci:'f1a6',replyUci:'g8f7',
            captureUci:'a8a6',square:'a6',loss:9,acceptedFen:capturedFen
        });
    });
    test('una oferta sense una captura legal o un intercanvi no s’etiqueta',()=>{
        const game={...refused,fen:'7k/8/8/8/8/8/8/5QK1 w - - 0 1'};
        expect(H.refusedOffers(game,Chess)).toEqual([]);
        expect(H.refusedOffers({},Chess)).toEqual([]);
    });
    test('l’etiqueta sense la verificació final de l’exercici no es publica',()=>{
        const candidate={...refused,theme:['sacrifice'],
            conclusion:{version:H.VERSION,fen:refused.fen,line:H.lineOf(refused),
                kind:'material',minDepth:14,requestedDepth:18,
                sacrifices:[{kind:'refused',offerUci:'f1a6',captureUci:'a8a6'}]}};
        expect(H.certifiedSacrifices(candidate,Chess)).toEqual([]);
        expect(P.detectCertifiedLine({candidate,ChessCtor:Chess,Hieroclosure:H})).toEqual([]);
    });
});

describe('Compensació posicional: contracte amb Stockfish injectat',()=>{
    test('accepta la peça cedida i avalua dues profunditats sense recuperació immediata',async()=>{
        const result=await H.createPositionalVerifier(Chess,analyzed()).verify(position());
        expect(result).toMatchObject({
            type:'positional_sacrifice',move:'f1a6',reply:'a8a6',
            accepted:true,loss:9,kingInCheck:false
        });
        expect(result.evaluations.map(x=>x.depth)).toEqual([18,22]);
        expect(result.initiative.pv).toEqual(pv);
        expect(result.structure).toMatchObject({pawns:0,doubled:0,islands:0,passed:[]});
        expect(result.text).not.toMatch(/forçat|guany assegurat|sacrifici correcte a totes les variants/i);
    });
    test('no accepta valoració feble, inconsistent o no centipeons',async()=>{
        for(const params of [
            {low:-95,high:-95},{low:60,high:-75},{low:20,high:230},
            {score:'mate'},{illegal:true},{missing:true},{original:'g1f2'}
        ])expect(await H.createPositionalVerifier(Chess,analyzed(params)).verify(position()))
            .toBeNull();
    });
    test('no certifica una jugada il·legal, oferta sense captura o una negativa del rival',async()=>{
        const verify=H.createPositionalVerifier(Chess,analyzed());
        expect(await verify.verify({fen:start,move:'f1a8',reply:'a8a6'})).toBeNull();
        expect(await verify.verify({...position(),reply:'g8f7'})).toBeNull();
        expect(await verify.verify({...position(),move:'g1f2'})).toBeNull();
    });
    test('cancel·lació i fallada del motor no publiquen res',async()=>{
        expect(await H.createPositionalVerifier(Chess,analyzed()).verify(position(),{
            shouldAbort:()=>true
        })).toBeNull();
        expect(await H.createPositionalVerifier(Chess,()=>Promise.reject(new Error('offline')))
            .verify(position())).toBeNull();
    });
    test('estructura de peons és observació del tauler, no inferència estratègica',()=>{
        const engine=H.createPositionalVerifier(Chess,analyzed());
        const st=engine.pawnStructure(new Chess('7k/p7/1p6/8/3P4/8/P7/7K w - - 0 1'),'w');
        expect(st).toMatchObject({pawns:2,doubled:0,islands:2});
        expect(st.passed).toContain('d4');
    });
});
