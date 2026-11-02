const { Chess } = require('chess.js');
const {
    parseInfo, legalEngineMove, engineMoveWithRetry
} = require('../scripts/mine-mate-in-three');

describe('Mineria de mat en tres · robustesa UCI', () => {
    const debug = jest.spyOn(console, 'warn').mockImplementation(() => {});
    afterAll(() => debug.mockRestore());

    test('interpreta les puntuacions de mat i la PV de Stockfish', () => {
        const a = parseInfo('info depth 20 multipv 1 score mate 3 nodes 1024 pv e2e4 e7e5 g1f3');
        expect(a).toMatchObject({
            depth:20, rank:1, evalType:'mate', eval:3, move:'e2e4',
            pv:['e2e4','e7e5','g1f3']
        });
        expect(parseInfo('info depth 10 score cp 25 lowerbound pv e2e4')).toBeNull();
    });

    test('no accepta un bestmove UCI il·legal ni 0000', () => {
        const chess = new Chess();
        expect(legalEngineMove(chess,'e2e4')).toBe(true);
        expect(legalEngineMove(chess,'e2e5')).toBe(false);
        expect(legalEngineMove(chess,'0000')).toBe(false);
        expect(legalEngineMove(chess,null)).toBe(false);
        expect(chess.history()).toEqual([]);
    });

    test('quan bestmove és null, reinicia i recupera la segona cerca', async () => {
        const engine = {
            name:'Lozza', reset:jest.fn(async()=>{}),
            search:jest.fn().mockResolvedValueOnce({best:null,rawBest:'(none)',alternatives:[]})
                .mockResolvedValueOnce({best:'e2e4',rawBest:'e2e4',alternatives:[]})
        };
        expect(await engineMoveWithRetry(engine,new Chess(),
            {ms:150,depth:6,multi:1},{game:2,ply:5})).toBe('e2e4');
        expect(engine.search).toHaveBeenCalledTimes(2);
        expect(engine.reset).toHaveBeenCalledTimes(1);
        expect(engine.search.mock.calls[0][1].ms).toBe(150);
        expect(engine.search.mock.calls[1][1].ms).toBe(300);
    });

    test('una PV calculada i legal permet recuperar la tercera cerca fallida', async () => {
        const engine = {
            name:'Lozza', reset:jest.fn(async()=>{}),
            search:jest.fn().mockResolvedValueOnce({best:null,rawBest:'(none)',alternatives:[]})
                .mockResolvedValueOnce({best:null,rawBest:'(none)',alternatives:[]})
                .mockResolvedValueOnce({best:null,rawBest:'(none)',
                    alternatives:[{move:'g1f3'}]})
        };
        expect(await engineMoveWithRetry(engine,new Chess(),
            {ms:150,depth:5,multi:1},{game:1,ply:5})).toBe('g1f3');
        expect(engine.reset).toHaveBeenCalledTimes(2);
    });

    test('després de tres jugades nul·les i sense PV, retorna null, mai inventa una jugada', async () => {
        const engine = {
            name:'Lozza', reset:jest.fn(async()=>{}),
            search:jest.fn(async()=>({best:null,rawBest:'(none)',alternatives:[]}))
        };
        const chess=new Chess();
        expect(await engineMoveWithRetry(engine,chess,
            {ms:150,depth:6,multi:1},{game:2,ply:5})).toBeNull();
        expect(engine.search).toHaveBeenCalledTimes(3);
        expect(engine.reset).toHaveBeenCalledTimes(2);
        expect(chess.history()).toEqual([]);
    });
});
