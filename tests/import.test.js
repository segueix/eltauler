const Core = require('../core.js');
const { Chess } = require('chess.js');

// PGN real d'exemple (estil Lichess): capçaleres, comentaris amb rellotge,
// anotacions i resultat.
const LICHESS_PGN = `[Event "Rated blitz game"]
[Site "https://lichess.org/AbCdEfGh"]
[Date "2024.03.15"]
[White "DanielMas"]
[Black "rival_fort"]
[Result "0-1"]
[TimeControl "180+2"]

1. e4 { [%clk 0:03:00] } e5 { [%clk 0:03:00] } 2. Nf3?! { [%clk 0:02:58] }
Nc6 3. Bc4 Bc5 4. b4!? Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O 0-1`;

// Dues partides al mateix fitxer, la segona amb variants niades i NAGs.
const MULTI_PGN = `[Event "Torneig social"]
[White "Alba"]
[Black "Bernat"]
[Result "1-0"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 1-0

[Event "Torneig social"]
[White "Bernat"]
[Black "Alba"]
[Result "1/2-1/2"]

1. e4 e5 2. Nf3 $1 Nc6 (2... d6 3. d4 (3. Bc4) 3... exd4) 3. Bb5 a6 1/2-1/2`;

describe('splitPgnGames', () => {
    test('un sol bloc amb capçaleres es retorna sencer', () => {
        const games = Core.splitPgnGames(LICHESS_PGN);
        expect(games).toHaveLength(1);
        expect(games[0]).toContain('[White "DanielMas"]');
        expect(games[0]).toContain('1. e4');
    });

    test('separa un fitxer amb diverses partides', () => {
        const games = Core.splitPgnGames(MULTI_PGN);
        expect(games).toHaveLength(2);
        expect(games[0]).toContain('[White "Alba"]');
        expect(games[0]).toContain('1. d4');
        expect(games[1]).toContain('[White "Bernat"]');
        expect(games[1]).toContain('1. e4');
    });

    test('movetext sense capçaleres és una única partida', () => {
        const games = Core.splitPgnGames('1. e4 e5 2. Nf3 Nc6');
        expect(games).toHaveLength(1);
    });

    test('entrada buida o no textual dona llista buida', () => {
        expect(Core.splitPgnGames('')).toEqual([]);
        expect(Core.splitPgnGames(null)).toEqual([]);
        expect(Core.splitPgnGames(undefined)).toEqual([]);
        expect(Core.splitPgnGames('   \n \n ')).toEqual([]);
    });

    test('respecta els salts de línia de Windows (\\r\\n)', () => {
        const crlf = MULTI_PGN.replace(/\n/g, '\r\n');
        expect(Core.splitPgnGames(crlf)).toHaveLength(2);
    });
});

describe('parsePgnHeaders', () => {
    test('llegeix les capçaleres i en separa el movetext', () => {
        const { headers, moveText } = Core.parsePgnHeaders(LICHESS_PGN);
        expect(headers.White).toBe('DanielMas');
        expect(headers.Black).toBe('rival_fort');
        expect(headers.Result).toBe('0-1');
        expect(headers.Date).toBe('2024.03.15');
        expect(moveText).toContain('1. e4');
        expect(moveText).not.toContain('[White');
    });

    test('desescapa cometes dins del valor', () => {
        const { headers } = Core.parsePgnHeaders('[Event "Memorial \\"Pau\\" 2024"]\n\n1. e4 *');
        expect(headers.Event).toBe('Memorial "Pau" 2024');
    });

    test('bloc sense capçaleres dona headers buits i tot com a movetext', () => {
        const { headers, moveText } = Core.parsePgnHeaders('1. e4 e5');
        expect(headers).toEqual({});
        expect(moveText).toBe('1. e4 e5');
    });
});

describe('sanitizePgnMoveText', () => {
    test('treu comentaris de rellotge, anotacions i resultat', () => {
        const { moveText } = Core.parsePgnHeaders(LICHESS_PGN);
        const tokens = Core.sanitizePgnMoveText(moveText);
        expect(tokens).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4', 'Bxb4', 'c3', 'Ba5', 'd4', 'exd4', 'O-O']);
    });

    test('treu variants niades i NAGs', () => {
        const tokens = Core.sanitizePgnMoveText('1. e4 e5 2. Nf3 $1 Nc6 (2... d6 3. d4 (3. Bc4) 3... exd4) 3. Bb5 a6 1/2-1/2');
        expect(tokens).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    });

    test('treu comentaris de línia amb «;»', () => {
        const tokens = Core.sanitizePgnMoveText('1. e4 e5 ; la meva preferida\n2. Nf3 Nc6');
        expect(tokens).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    });

    test('normalitza l\'enroc amb zeros i conserva escac i mat', () => {
        expect(Core.sanitizePgnMoveText('12. 0-0 0-0-0 13. Qxf7#')).toEqual(['O-O', 'O-O-O', 'Qxf7#']);
    });

    test('gestiona números de jugada enganxats («1.e4») i el·lipsis', () => {
        expect(Core.sanitizePgnMoveText('1.e4 c5 2.Nf3 ... d6')).toEqual(['e4', 'c5', 'Nf3', 'd6']);
    });

    test('entrada buida dona llista buida', () => {
        expect(Core.sanitizePgnMoveText('')).toEqual([]);
        expect(Core.sanitizePgnMoveText(null)).toEqual([]);
        expect(Core.sanitizePgnMoveText('*')).toEqual([]);
    });

    test('els tokens netejats es poden rejugar amb chess.js real', () => {
        const { moveText } = Core.parsePgnHeaders(LICHESS_PGN);
        const tokens = Core.sanitizePgnMoveText(moveText);
        const game = new Chess();
        for (const tok of tokens) {
            expect(game.move(tok, { sloppy: true })).not.toBeNull();
        }
        expect(game.history()).toHaveLength(tokens.length);
    });
});

describe('pgnResultToLabel', () => {
    test('mapa el resultat segons el color del jugador', () => {
        expect(Core.pgnResultToLabel('1-0', 'w')).toBe('Victòria');
        expect(Core.pgnResultToLabel('1-0', 'b')).toBe('Derrota');
        expect(Core.pgnResultToLabel('0-1', 'w')).toBe('Derrota');
        expect(Core.pgnResultToLabel('0-1', 'b')).toBe('Victòria');
        expect(Core.pgnResultToLabel('1/2-1/2', 'w')).toBe('Taules');
        expect(Core.pgnResultToLabel('1/2-1/2', 'b')).toBe('Taules');
    });

    test('resultat desconegut o partida inacabada dona null', () => {
        expect(Core.pgnResultToLabel('*', 'w')).toBeNull();
        expect(Core.pgnResultToLabel('', 'w')).toBeNull();
        expect(Core.pgnResultToLabel(undefined, 'b')).toBeNull();
    });

    test('l\'etiqueta encaixa amb entryOutcome de l\'historial (victòr/derrot/tau)', () => {
        // Mateixa lògica que entryOutcome d'app.js: la detecció és per subcadena.
        expect(Core.pgnResultToLabel('1-0', 'w').toLowerCase()).toContain('victòr');
        expect(Core.pgnResultToLabel('1-0', 'b').toLowerCase()).toContain('derrot');
        expect(Core.pgnResultToLabel('1/2-1/2', 'w').toLowerCase()).toContain('tau');
    });
});

describe('pgnPlayersLabel', () => {
    test('amb capçaleres White/Black retorna «Blanques – Negres»', () => {
        expect(Core.pgnPlayersLabel({ White: 'Kasparov, Garry', Black: 'Topalov, Veselin' }, null))
            .toBe('Kasparov, Garry – Topalov, Veselin');
    });

    test('les capçaleres tenen prioritat sobre el nom del fitxer', () => {
        expect(Core.pgnPlayersLabel({ White: 'Alba', Black: 'Bernat' }, 'partida_club.pgn'))
            .toBe('Alba – Bernat');
    });

    test('amb només un nom conegut, l\'altre costat queda genèric', () => {
        expect(Core.pgnPlayersLabel({ White: 'Morphy, Paul', Black: '?' }, null)).toBe('Morphy, Paul – Negres');
        expect(Core.pgnPlayersLabel({ Black: 'Carlsen, Magnus' }, null)).toBe('Blanques – Carlsen, Magnus');
    });

    test('sense noms al PGN es recorre al nom del fitxer netejat', () => {
        expect(Core.pgnPlayersLabel({}, 'kasparov_vs_karpov-1990.pgn')).toBe('kasparov vs karpov 1990');
        expect(Core.pgnPlayersLabel({ White: '?', Black: '?' }, 'Fischer-Spassky.PGN')).toBe('Fischer Spassky');
    });

    test('sense noms ni fitxer dona null', () => {
        expect(Core.pgnPlayersLabel({}, null)).toBeNull();
        expect(Core.pgnPlayersLabel(null, '')).toBeNull();
        expect(Core.pgnPlayersLabel({ White: ' ', Black: '?' }, '   ')).toBeNull();
    });
});

describe('guessPlayerColorFromPgnHeaders', () => {
    const headers = { White: 'DanielMas', Black: 'rival_fort' };

    test('troba el color per coincidència exacta (ignorant majúscules)', () => {
        expect(Core.guessPlayerColorFromPgnHeaders(headers, 'danielmas')).toBe('w');
        expect(Core.guessPlayerColorFromPgnHeaders(headers, 'RIVAL_FORT')).toBe('b');
    });

    test('accepta coincidència parcial (nom d\'usuari dins del nom del PGN)', () => {
        expect(Core.guessPlayerColorFromPgnHeaders({ White: 'Daniel Mas i Deixaxars', Black: 'X' }, 'Daniel Mas')).toBe('w');
    });

    test('sense coincidència clara dona null', () => {
        expect(Core.guessPlayerColorFromPgnHeaders(headers, 'Montse')).toBeNull();
        expect(Core.guessPlayerColorFromPgnHeaders({ White: 'Anna', Black: 'Anna' }, 'Anna')).toBeNull();
        expect(Core.guessPlayerColorFromPgnHeaders({ White: '?', Black: '?' }, '?')).toBeNull();
        expect(Core.guessPlayerColorFromPgnHeaders(headers, '')).toBeNull();
        expect(Core.guessPlayerColorFromPgnHeaders(null, 'DanielMas')).toBeNull();
    });
});
