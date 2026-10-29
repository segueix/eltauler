const { Chess } = require('chess.js');
const H = require('../hieroclosure');
const J = require('../jeropedagogia');
const fs = require('fs');
const path = require('path');

const mate3 = { fen: 'rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 9',
    solutionMoves: ['d3d8', 'd2g5', 'g5d8'], replyMoves: ['e8d8', 'd8c7'] };
const material3 = { fen: 'r5k1/8/8/8/8/8/8/R5K1 w - - 0 1',
    solutionMoves: ['g1f2', 'f2e2', 'a1a8'], replyMoves: ['g8f7', 'f7e7'] };
function certified(puzzle) {
    const inspected = H.createVerifier(Chess).inspect(puzzle);
    if (!inspected) throw new Error('Exemple de prova no validat');
    return { ...puzzle, conclusion: {
        version: H.VERSION, fen: puzzle.fen, line: inspected.line,
        finalFen: inspected.finalFen, kind: inspected.kind,
        gain: inspected.gain, checkedAlternatives: inspected.alternatives.length
    }};
}
describe('Pedagogia dels jeroglífics — explicacions verificables', () => {
    test('explica les tres jugades i dues rèpliques del mat en 3, sense alterar les peces', () => {
        const p = J.build(certified(mate3), Chess, H);
        expect(p.verified).toBe(true);
        expect(p.steps).toHaveLength(3);
        expect(p.steps.map(x => x.san)).toEqual(['Qd8+', 'Bg5+', 'Bd8#']);
        expect(p.steps.map(x => x.replySan)).toEqual(['Kxd8', 'Kc7', null]);
        expect(p.steps[0].text).toMatch(/escac/i);
        expect(p.steps[0].reply).toContain('Kxd8');
        expect(p.steps[2].text).toContain('escac i mat');
        expect(p.outcome).toContain('escac i mat');
        expect(p.alternatives).toMatch(/alternatives legals/);
    });
    test('material: no confon guany amb mat ni promet una victòria assegurada', () => {
        const p = J.build(certified(material3), Chess, H);
        expect(p.finalKind).toBe('material');
        expect(p.steps[2].san).toBe('Rxa8');
        expect(p.steps[2].text).toMatch(/captura.*torre/);
        expect(p.outcome).toContain('5 punts de material');
        expect(p.outcome).not.toMatch(/guanya la partida|escac i mat/i);
    });
    test('els aclariments intermedis no revelen cap resposta futura', () => {
        const c = certified(mate3);
        const first = J.solvedStep(c, 1, Chess, H);
        expect(first).toContain('escac');
        expect(first).not.toContain('Bg5');
        expect(first).not.toContain('Bd8');
        expect(J.solvedStep(c, 0, Chess, H)).toBeNull();
        expect(J.solvedStep(c, 3, Chess, H)).toBeNull();
    });
    test('ni un jeroglífic antic o no verificat ni una prova manipulada es pot explicar com a certa', () => {
        const p = certified(mate3);
        expect(J.build(mate3, Chess, H)).toBeNull();
        expect(J.build({ ...p, solutionMoves: ['a2a3', ...p.solutionMoves.slice(1)] }, Chess, H)).toBeNull();
        expect(J.build({ ...p, conclusion: { ...p.conclusion, finalFen: mate3.fen } }, Chess, H)).toBeNull();
        expect(J.build({ ...p, conclusion: { ...p.conclusion, kind: 'material', gain: 3 } }, Chess, H)).toBeNull();
    });
    test('les frases han d’estar enganxades a la interfície i només mostrades després del pas', () => {
        const s = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
        expect(s).toContain('ElTaulerJeroPedagogia.solvedStep');
        expect(s).toContain('Ja has trobat un moviment:');
        expect(s).toContain("const lesson = P && P.build(currentHieroglyphicPuzzle, Chess, window.ElTaulerHieroClosure, window.ElTaulerPatrons)");
        expect(s).toContain('Per què funciona aquesta combinació?');
    });
});
