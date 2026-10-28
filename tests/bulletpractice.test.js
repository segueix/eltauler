const B = require('../bulletpractice');
const { Chess } = require('chess.js');
const bank = B.buildBank(Chess);
const move = u => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

describe('banc de lectura immediata', () => {
    test.each(bank.map(t => [t.id, t]))('%s: posició legal, objectiu resoluble i totes les alternatives acceptades', (_, task) => {
        const c = new Chess(task.fen), p = task.fen.split(' ');
        expect(c.validate_fen(task.fen).valid).toBe(true);
        expect(c.board().flat().filter(x => x && x.type === 'k')).toHaveLength(2);
        p[1] = p[1] === 'w' ? 'b' : 'w'; p[3] = '-';
        // No pot estar en escac el jugador que acaba de moure.
        expect(new Chess(p.join(' ')).in_check()).toBe(false);
        expect(task.answers.length).toBeGreaterThan(0);
        if (task.kind === 'escape') expect(c.in_check()).toBe(true);
        for (const u of task.answers) {
            const m = c.move(move(u)); expect(m).not.toBeNull();
            if (task.kind === 'mate') expect(c.in_checkmate()).toBe(true);
            if (task.kind === 'capture') expect(m.captured).toBeTruthy();
            if (task.kind === 'escape') expect(c.moves({ verbose: true }).some(r => r.captured && r.to === m.to)).toBe(false);
            c.undo();
        }
        if (task.kind === 'mate') {
            const all = c.moves({ verbose: true }).filter(m => { c.move(m); const ok = c.in_checkmate(); c.undo(); return ok; }).map(m => m.from + m.to + (m.promotion || ''));
            expect(task.answers.sort()).toEqual(all.sort());
        }
    });
    test('simetria reversible incloent enroc i captura al pas', () => {
        for (const [, fen] of B.SEEDS) expect(B.mirrorFen(B.mirrorFen(fen))).toBe(fen);
        expect(bank.some(t => t.answers.some(u => u.endsWith('n')))).toBe(true);
        expect(bank.some(t => new Chess(t.fen).moves({ verbose: true }).some(m => m.flags.includes('e')))).toBe(true);
    });
    test('no accepta un canvi de peces d’igual valor com a guany', () => {
        const task = { kind: 'capture', fen: '4k3/8/2p5/3p4/4P3/8/8/4K3 w - - 0 1' };
        expect(B.solutions(Chess, task)).not.toContain('e4d5');
    });
    test.each(Object.keys(B.MODES))('%s: objectius variats, ambdós colors i cap patró duplicat', mode => {
        let seed = 12; const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
        const deck = B.makeDeck(bank, mode, [], random);
        expect(deck).toHaveLength(B.MODES[mode].count);
        expect(new Set(deck.map(t => t.family)).size).toBe(deck.length);
        expect(new Set(deck.map(t => t.kind)).size).toBe(3);
        expect(new Set(deck.map(t => t.fen.split(' ')[1])).size).toBe(2);
        expect(deck.filter(t => t.probe)).toHaveLength(mode === 'radar' ? 8 : mode === 'sprint' ? 3 : 0);
    });
    test('evita posicions recents quan queden alternatives', () => {
        const deck = B.makeDeck(bank, 'scan', [], () => .5);
        const fresh = B.makeDeck(bank, 'scan', deck.map(t => t.id), () => .5);
        expect(fresh.some(t => deck.some(old => old.id === t.id))).toBe(false);
    });
});

function fixture(mode = 'sprint', seconds = 30, level = 1) {
    let time = 0;
    const s = B.createSession({ mode, seconds, level, deck: B.makeDeck(bank, mode, [], () => .5), now: () => time });
    return { s, advance: ms => { time += ms; }, correct: () => s.submit(s.state().task.answers[0]) };
}
describe('rellotge i primera decisió', () => {
    test.each([30, 60])('%s segons: només consumeix temps quan el tauler ja és jugable', seconds => {
        const { s, advance, correct } = fixture('sprint', seconds);
        advance(30000); s.prepare(); advance(30000);
        expect(s.state().clockMs).toBe(seconds * 1000);
        expect(s.submit('a2a3')).toBeNull(); s.begin(); advance(1200); correct();
        expect(s.state().remainingMs).toBe(seconds * 1000 - 1200);
        advance(50000); expect(s.state().clockMs).toBe(seconds * 1000 - 1200);
        expect(s.submit(s.state().task.answers[0])).toBeNull();
        s.prepare(); s.begin(); advance(700); correct();
        expect(s.state().remainingMs).toBe(seconds * 1000 - 1900);
    });
    test('primer error definitiu: repetir no el converteix en encert', () => {
        const { s, advance, correct } = fixture('scan'); s.prepare(); s.begin(); advance(200);
        s.submit('a2a3'); correct();
        expect(s.state().rows).toHaveLength(1); expect(s.state().rows[0].correct).toBe(false);
    });
    test('el termini es comprova a submit, encara que no s’hagi executat el tick', () => {
        const { s, advance, correct } = fixture(); s.prepare(); s.begin(); advance(s.state().limitMs); correct();
        expect(s.state().rows[0]).toMatchObject({ timeout: true, correct: false, uci: null });
        expect(s.state().status).toBe('feedback');
    });
    test('el retard d’un timer no cobra més que el límit de la decisió', () => {
        const { s, advance } = fixture(); s.prepare(); s.begin(); const limit = s.state().limitMs;
        advance(90000); s.tick(); s.tick(); expect(s.state().rows).toHaveLength(1);
        expect(s.state().remainingMs).toBe(30000 - limit);
    });
    test('sprint s’acaba quan s’esgota el pressupost compartit', () => {
        const { s, advance } = fixture();
        while (s.prepare()) { s.begin(); advance(8000); s.tick(); }
        expect(s.state().status).toBe('done'); expect(s.state().remainingMs).toBe(0);
        expect(s.state().rows.length).toBeLessThan(10);
        expect(s.state().rows.reduce((n, r) => n + r.reactionMs, 0)).toBe(30000);
    });
    test('radar: la pregunta congela el rellotge i no permet saltar-la', () => {
        const { s, advance, correct } = fixture('radar'); s.prepare(); s.begin(); advance(715); correct();
        const clock = s.state().clockMs;
        expect(s.state().status).toBe('recall'); expect(s.prepare()).toBe(false);
        advance(15000); expect(s.state().clockMs).toBe(clock);
        expect(s.recall(NaN)).toBe(false); expect(s.recall(61)).toBe(false);
        expect(s.recall(Math.ceil(clock / 1000))).toBe(true);
        expect(s.state().rows[0].clockCorrect).toBe(true); expect(s.recall(0)).toBe(false);
        expect(s.state().rows[0].reactionMs).toBe(715);
    });
    test('interrompre atura el rellotge i no reprèn la mateixa posició', () => {
        const { s, advance, correct } = fixture(); s.prepare(); s.begin(); advance(1000); s.abort(); advance(10000);
        expect(s.state().status).toBe('aborted'); expect(s.begin()).toBe(false); expect(s.prepare()).toBe(false);
        expect(correct()).toBeNull(); expect(s.state().rows).toHaveLength(0);
    });
    test('els nivells escurcen el límit i 30 s exigeix més ritme que 60 s', () => {
        for (let level = 1; level <= 5; level++) {
            expect(B.targetMs(30, level)).toBeLessThan(B.targetMs(60, level));
            if (level > 1) expect(B.targetMs(60, level)).toBeLessThan(B.targetMs(60, level - 1));
        }
    });
    test.each([0, 1, 999, 16500, 29999, 30000, 59999, 60000])('record a %s ms: tres opcions distintes, coherents amb el rellotge visible', ms => {
        const seconds = ms <= 30000 ? 30 : 60, options = B.clockChoices(ms, seconds);
        expect(options).toHaveLength(3); expect(new Set(options).size).toBe(3);
        expect(options).toContain(Math.ceil(ms / 1000));
        expect(options.every(n => n >= 0 && n <= seconds)).toBe(true);
    });
});

describe('progrés: rapidesa, precisió i atenció separades', () => {
    const row = (extra = {}) => ({ taskId: '0-0', kind: 'mate', correct: true, timeout: false, reactionMs: 1000, targetMs: 4500, clockMs: 15000, clockCorrect: true, clockErrorMs: 0, ...extra });
    const saved = (extra = {}) => ({ id: Math.random().toString(), at: Date.now(), mode: 'radar', seconds: 30, level: 1, complete: true, rows: Array.from({ length: 8 }, () => row()), ...extra });
    test('mediana exclou errors ràpids i temps exhaurits', () => {
        expect(B.summary([row({ reactionMs: 1000 }), row({ reactionMs: 3000 }), row({ correct: false, reactionMs: 1 }), row({ correct: false, timeout: true, reactionMs: 4500 })])).toMatchObject({ accuracy: .5, medianMs: 2000, timeouts: 1 });
        expect(B.summary([]).medianMs).toBeNull();
    });
    test('calen 3 sèries completes bones del mateix mode, ritme i nivell', () => {
        const p = { sessions: [saved(), saved()] }; expect(B.suggestedLevel(p, 'radar', 30)).toBe(1);
        p.sessions.push(saved({ complete: false })); expect(B.suggestedLevel(p, 'radar', 30)).toBe(1);
        p.sessions.push(saved({ seconds: 60 })); expect(B.suggestedLevel(p, 'radar', 30)).toBe(1);
        p.sessions.push(saved()); expect(B.suggestedLevel(p, 'radar', 30)).toBe(2);
        p.sessions.push(saved({ level: 2 })); expect(B.suggestedLevel(p, 'radar', 30)).toBe(2);
    });
    test('no puja per rapidesa si falla el rellotge, ni per una sèrie massa curta', () => {
        expect(B.suggestedLevel({ sessions: [saved(), saved(), saved({ rows: Array.from({ length: 8 }, () => row({ clockCorrect: false })) })] }, 'radar', 30)).toBe(1);
        expect(B.suggestedLevel({ sessions: [saved(), saved(), saved({ rows: [row()] })] }, 'radar', 30)).toBe(1);
    });
    test('baixa després de tres sèries amb menys de 60% i respecta sostre i terra', () => {
        const bad = Array.from({ length: 3 }, () => saved({ level: 3, rows: Array.from({ length: 8 }, () => row({ correct: false })) }));
        expect(B.suggestedLevel({ sessions: bad }, 'radar', 30)).toBe(2);
        expect(B.suggestedLevel({ sessions: bad.map(s => ({ ...s, level: 1 })) }, 'radar', 30)).toBe(1);
        expect(B.suggestedLevel({ sessions: Array.from({ length: 3 }, () => saved({ level: 5 })) }, 'radar', 30)).toBe(5);
    });
    test('persistència acotada, deduplicada i tolerant a dades corruptes', () => {
        expect(B.normalizeProgress(null).sessions).toEqual([]);
        const s = saved({ id: 'unique' });
        expect(B.normalizeProgress({ sessions: [null, {}, s, s, saved({ rows: [row({ reactionMs: -5 })] })] }).sessions).toHaveLength(1);
        const many = Array.from({ length: 130 }, (_, i) => saved({ id: String(i), at: i }));
        const p = B.normalizeProgress(JSON.parse(JSON.stringify({ sessions: many })));
        expect(p.sessions).toHaveLength(120); expect(p.sessions[0].id).toBe('10');
        expect(B.normalizeProgress(p)).toEqual(p);
    });
});
