const { Chess } = require('chess.js');
const X = require('../boardexperience');
const fs = require('fs'), vm = require('vm');
const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');

describe('marques i narració només de jugades reals', () => {
    test.each([
        [new Chess().fen(), 'e4'],
        ['4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'O-O'],
        ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', 'exd6'],
        ['4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a8=N'],
        ['4k3/8/8/8/8/8/p7/4K3 b - - 0 32', 'a1=Q+']
    ])('reconeix el moviment legal %s → %s sense modificar-lo', (before, san) => {
        const g = new Chess(before), move = g.move(san), after = g.fen();
        expect(X.transition(Chess, before, after, move)).toMatchObject({ from: move.from, to: move.to });
        expect(X.transition(Chess, before, after)).toMatchObject({ from: move.from, to: move.to });
        expect(g.fen()).toBe(after);
    });
    test('un salt de diverses jugades, un reset o un editor no es narren com un moviment', () => {
        const g = new Chess(), start = g.fen(); g.move('e4'); g.move('e5');
        expect(X.transition(Chess, start, g.fen())).toBeNull();
        expect(X.transition(Chess, g.fen(), start)).toBeNull();
        expect(X.transition(Chess, start, start)).toBeNull();
        expect(X.transition(Chess, null, start)).toBeNull();
        expect(X.transition(Chess, 'editor', start)).toBeNull();
    });
    test('una marca antiga no s’atribueix a una altra posició ni a un altre torn', () => {
        const g = new Chess(), start = g.fen();g.move('e4');
        expect(X.transition(Chess, start, g.fen(), { from: 'd2', to: 'd4' })).toBeNull();
        expect(X.transition(Chess, start, g.fen().replace(' b ', ' w '))).toBeNull();
    });
});
function openingHarness() {
    const pending = [];
    const context = vm.createContext({ openingPracticeGame: new Chess(), openingPracticeEngineThinking: false,
        window: { ElTaulerBoardExperience: { preview: jest.fn((id, move, valid) => new Promise(resolve => pending.push({ id, move, valid, resolve }))) } } });
    const a = app.indexOf('let openingPresentationSerial ='), b = app.indexOf('function playOpeningLessonOpponentMove()', a);
    vm.runInContext(app.slice(a, b), context);
    return { context, pending };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
describe('previsualització d’una resposta d’obertura', () => {
    test('bloqueja l’entrada però manté intacta la posició fins que acaba la marca', async () => {
        const { context: c, pending } = openingHarness(), before = c.openingPracticeGame.fen();
        c.presentOpeningReply('e4', () => c.openingPracticeGame.move('e4'));
        expect(c.openingPracticeEngineThinking).toBe(true); expect(c.openingPracticeGame.fen()).toBe(before);
        expect(pending[0].id).toBe('opening-board');pending[0].resolve(true);await flush();
        expect(c.openingPracticeGame.history()).toEqual(['e4']);expect(c.openingPracticeEngineThinking).toBe(false);
    });
    test('cancel·lar o abandonar la secció no aplica la jugada', async () => {
        const { context: c, pending } = openingHarness(), apply = jest.fn();
        c.presentOpeningReply('e4', apply); pending[0].resolve(false); await flush();
        expect(apply).not.toHaveBeenCalled();expect(c.openingPracticeEngineThinking).toBe(false);
    });
    test('una posició nova invalida una previsualització antiga, encara que sigui la mateixa FEN', async () => {
        const { context: c, pending } = openingHarness(), apply = jest.fn();
        c.presentOpeningReply('e4', apply);c.openingPracticeGame = new Chess();
        pending[0].resolve(true); await flush();expect(apply).not.toHaveBeenCalled();
    });
    test('només la petició més recent pot aplicar-se i una lliçó tancada no continua', async () => {
        const { context: c, pending } = openingHarness(), old = jest.fn(), current = jest.fn();
        c.presentOpeningReply('e4', old);c.presentOpeningReply('d4', current, () => false);
        pending[0].resolve(true);pending[1].resolve(true);await flush();
        expect(old).not.toHaveBeenCalled();expect(current).not.toHaveBeenCalled();
    });
});

describe('pausa i represa sense callbacks antics', () => {
    function deferredExperience() {
        const jobs = [];
        return { jobs, api: { preview: jest.fn(() => new Promise(resolve => jobs.push(resolve))),
            cancel: jest.fn(), unlock: jest.fn(), settled: () => Promise.resolve() } };
    }
    test('la reproducció de partides no deixa que una pausa anterior aturi la nova', async () => {
        const { jobs, api } = deferredExperience();
        const replay = { game: new Chess(), moves: ['e4', 'e5'], moveIndex: 0, isPlaying: false };
        const c = vm.createContext({ tvReplay: replay, window: { ElTaulerBoardExperience: api }, tvJeroglyphicsActive: false,
            shouldTriggerTvJeroglyphics: () => false, updateTvControls() {}, updateTvBoard() {}, clearInterval });
        vm.runInContext(app.slice(app.indexOf('function stopTvPlayback()'), app.indexOf('function updateTvControls()'))
            + app.slice(app.indexOf('async function tvStepForward()'), app.indexOf('function resetTvReplay()')), c);
        const old = c.startTvPlayback(); c.stopTvPlayback(); const fresh = c.startTvPlayback();
        jobs[0](false); await old; expect(replay.isPlaying).toBe(true);
        jobs[1](true); await flush(); expect(replay.game.history()).toEqual(['e4']);
        c.stopTvPlayback(); jobs[2](false); await fresh;
        expect(replay.game.history()).toEqual(['e4']); expect(replay.isPlaying).toBe(false);
    });
    test('el reproductor col·lectiu també conserva la nova reproducció en una represa ràpida', async () => {
        const { jobs, api } = deferredExperience();
        const replay = { moves: ['e4', 'e5'], idx: 0, playing: false };
        const c = vm.createContext({ replay, window: { ElTaulerBoardExperience: api }, replayRender() {}, clearInterval });
        const source = fs.readFileSync(require.resolve('../catalans.js'), 'utf8');
        vm.runInContext(source.slice(source.indexOf('  function replayStopPlay()'), source.indexOf('  function closeReplay()')), c);
        const old = c.replayTogglePlay(); c.replayStopPlay(); const fresh = c.replayTogglePlay();
        jobs[0](false); await old; expect(replay.playing).toBe(true);
        jobs[1](true); await flush(); expect(replay.idx).toBe(1);
        c.replayStopPlay(); jobs[2](false); await fresh; expect(replay.idx).toBe(1);
    });
});

// chessboard.js 1.0.0 implementa fen() com a position('fen') i start()/clear()
// també passen per position(). L'embolcall dels taulers no pot tractar aquestes
// lectures com una posició nova: abans es tornava a cridar fen() sense fi, el
// tauler de la partida no arrencava (ni rellotge ni peces) i aturar la narració
// des de l'historial tallava «Reprodueix».
describe('embolcall del tauler de chessboard.js', () => {
    const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
    function fakeElement(id = '') {
        const kids = {};
        return { id, hidden: false, isConnected: true, parentElement: null, style: {}, textContent: '', value: '',
            classList: { contains: () => false, add() {}, remove() {} }, innerHTML: '',
            getAttribute: () => null, querySelector: sel => kids[sel] || (kids[sel] = fakeElement()),
            querySelectorAll: () => [], closest: () => null, insertAdjacentElement() {}, appendChild() {} };
    }
    function fakeChessboard(id, config) {
        let placement = config.position === 'start' ? START : config.position.split(' ')[0];
        const board = {};
        board.position = function (target) {
            if (!arguments.length) return { placement };
            if (typeof target === 'string' && target.toLowerCase() === 'fen') return placement;
            placement = target === 'start' ? START : typeof target === 'string' ? target.split(' ')[0] : '8/8/8/8/8/8/8/8';
        };
        board.fen = function () { return board.position('fen'); };
        board.start = animate => board.position('start', animate);
        board.clear = animate => board.position({}, animate);
        board.resize = () => {}; board.destroy = () => {};
        return board;
    }
    function load(voiceOn = false) {
        const sandboxSpeak = jest.fn(() => Promise.resolve({ spoken: true }));
        const boardEl = Object.assign(fakeElement('myBoard'), { querySelector: () => null });
        const elements = { myBoard: boardEl };
        const sandbox = {
            document: { hidden: false, getElementById: id => elements[id] || null, createElement: () => fakeElement(),
                querySelectorAll: () => [], addEventListener() {} },
            MutationObserver: class { observe() {} disconnect() {} },
            localStorage: { getItem: () => null, setItem() {} },
            getComputedStyle: () => ({ display: 'block' }), addEventListener() {},
            Chessboard: jest.fn(fakeChessboard),
            ElTaulerStockfishTV: { TV_CONFIG: { SPEEDS: { calm: { label: 'Tranquil' } }, MOVE_ANIMATION_MS: 750 },
                tvNormalizePrefs: () => ({ speed: 'calm' }),
                createTvVoice: () => ({ isOn: () => voiceOn, unlock() {}, stop() {} }),
                tvSpeechText: t => t, tvSpeechMaxWaitMs: () => 4000,
                createBroadcastAudioControls: () => ({ bind() {}, render() {}, dispose() {}, sync() {} }),
                applyBroadcastHighlights: jest.fn() },
            ElTaulerGameBroadcast: { createNarrator: () => ({ stop() {}, speak: sandboxSpeak }), comment: () => null }
        };
        sandbox.self = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(fs.readFileSync(require.resolve('../boardexperience.js'), 'utf8'), sandbox);
        const api = sandbox.ElTaulerBoardExperience;
        api.configure({ Chess, bridge: {} });
        return { api, sandbox, speak: sandboxSpeak };
    }

    test('crear el tauler, llegir-ne la FEN i moure-hi peces no entra en bucle', () => {
        const { api, sandbox } = load();
        const game = new Chess();
        const board = api.createBoard('myBoard', { position: 'start' }, () => ({ chess: game, key: game, timed: true }));
        expect(sandbox.Chessboard).toHaveBeenCalledTimes(1);
        expect(board.fen()).toBe(START);
        game.move('e4');
        board.position(game.fen());
        expect(board.fen()).toBe(game.fen().split(' ')[0]);
        expect(board.position('FEN')).toBe(game.fen().split(' ')[0]);
        board.start(false);
        expect(board.fen()).toBe(START);
        board.clear(false);
        expect(board.fen()).toBe('8/8/8/8/8/8/8/8');
    });

    test('aturar totes les narracions (p. ex. en prémer Reprodueix a l’historial) no falla', () => {
        const { api } = load();
        const game = new Chess();
        api.createBoard('myBoard', { position: 'start' }, () => ({ chess: game, key: game }));
        expect(() => { api.stopAll(); api.cancel('myBoard'); api.refresh('myBoard'); }).not.toThrow();
    });

    test('say llegeix un text (la màxima d\'un exercici) només amb la veu activada', async () => {
        const off = load(false);
        off.api.createBoard('myBoard', { position: 'start' }, () => ({ chess: new Chess() }));
        expect(await off.api.say('myBoard', 'Una màxima.')).toMatchObject({ spoken: false });
        expect(off.speak).not.toHaveBeenCalled();

        const on = load(true);
        on.api.createBoard('myBoard', { position: 'start' }, () => ({ chess: new Chess() }));
        expect(await on.api.say('myBoard', 'Una màxima.')).toMatchObject({ spoken: true });
        expect(on.speak).toHaveBeenCalledWith('Una màxima.', { maxWaitMs: 4000 });
        expect(await on.api.say('myBoard', '')).toMatchObject({ spoken: false });
        expect(await on.api.say('cap-tauler', 'Text.')).toMatchObject({ spoken: false, reason: 'no-board' });
    });
});
