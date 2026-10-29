const B = require('../bulletpractice');
const REAL = require('../bulletbank');
const { Chess } = require('chess.js');
const bank = B.buildBank(Chess, REAL);
const seeds = bank.filter(t => !t.puzzle);
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
        expect(new Set(task.answers).size).toBe(task.answers.length);
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
            expect(task.answers.slice().sort()).toEqual(all.sort());
        } else {
            // Cap resposta fora de la regla de l'objectiu (guany immediat o sortida segura).
            const rule = B.solutions(Chess, task);
            task.answers.forEach(u => expect(rule).toContain(u));
        }
        if (task.puzzle) {
            // La jugada anterior del rival acaba en una peça seva.
            const piece = c.get(task.last.slice(2, 4));
            expect(piece && piece.color).toBe(c.turn() === 'w' ? 'b' : 'w');
        }
    });
    test('banc real: entrades vàlides, úniques i repartides per objectiu i dificultat', () => {
        const real = bank.filter(t => t.puzzle);
        expect(real).toHaveLength(REAL.length);
        expect(new Set(real.map(t => t.id)).size).toBe(real.length);
        expect(new Set(real.map(t => t.fen.split(' ').slice(0, 2).join(' '))).size).toBe(real.length);
        B.KINDS.forEach(kind => expect(real.filter(t => t.kind === kind).length).toBeGreaterThanOrEqual(100));
        expect(new Set(real.map(t => t.fen.split(' ')[1])).size).toBe(2);
        // Cada nivell té prou posicions de cada objectiu per a una contrarellotge sense repetir.
        for (let level = 1; level <= 5; level++) {
            const pool = B.levelPool(bank, level);
            expect(new Set(pool.map(t => t.family)).size).toBeGreaterThanOrEqual(B.MODES.rush.count);
            B.KINDS.forEach(kind => expect(pool.filter(t => t.kind === kind).length).toBeGreaterThanOrEqual(10));
        }
        expect(B.realTask(['x', 'm', 'fen', 'e2e4', 'e7e5', 900])).toBeNull();
        expect(B.realTask(['abcde', 'z', '8/8/8/8/8/8/8/8 w - - 0 1', 'e2e4', 'e7e5', 900])).toBeNull();
        expect(B.realTask(['abcde', 'm', '8/8/8/8/8/8/8/8 w - - 0 1', 'e2e4', '', 900])).toBeNull();
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
    test.each([1, 2, 3, 4, 5])('nivell %s: posicions dins la franja de dificultat', level => {
        const cap = B.LEVEL_CAP[level], floor = level > 1 ? B.LEVEL_CAP[level - 1] - 250 : 0;
        const deck = B.makeDeck(bank, 'sprint', [], () => .3, level);
        expect(deck).toHaveLength(B.MODES.sprint.count);
        deck.forEach(t => { expect(t.rating).toBeLessThanOrEqual(cap); expect(t.rating).toBeGreaterThanOrEqual(floor); });
    });
    test('contrarellotge: quaranta posicions diferents de dificultat creixent', () => {
        const deck = B.makeDeck(bank, 'rush', [], () => .7, 3);
        expect(deck).toHaveLength(40);
        expect(new Set(deck.map(t => t.family)).size).toBe(40);
        deck.slice(1).forEach((t, i) => expect(t.rating).toBeGreaterThanOrEqual(deck[i].rating));
    });
    test('només amb les posicions bàsiques també es pot fer una sèrie', () => {
        const basic = B.buildBank(Chess);
        expect(basic).toHaveLength(seeds.length);
        expect(B.makeDeck(basic, 'scan', [], () => .5, 5)).toHaveLength(8);
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
    test.each(['scan', 'radar', 'sprint', 'rush'])('%s: llegir l’enunciat abans de ▶ no consumeix temps', mode => {
        const { s, advance, correct } = fixture(mode, 30);
        expect(s.prepare()).toBe(true);
        const before = s.state();
        expect(before.status).toBe('ready');
        advance(120000); // lectura sense límit
        expect(s.tick()).toBeNull();
        expect(s.submit(before.task.answers[0])).toBeNull();
        expect(s.state().clockMs).toBe(before.clockMs);
        expect(s.state().remainingMs).toBe(30000);
        expect(s.state().rows).toHaveLength(0);
        expect(s.begin()).toBe(true); // clic a ▶
        expect(s.begin()).toBe(false); // doble clic no reinicia el rellotge
        advance(500);
        correct();
        expect(s.state().rows[0].reactionMs).toBe(500);
        expect(s.state().remainingMs).toBe(mode === 'rush' || mode === 'sprint' ? 29500 : 30000);
    });
    test.each(['scan', 'radar', 'sprint', 'rush'])('%s: cada posició torna a esperar el ▶', mode => {
        const { s, advance, correct } = fixture(mode, 60);
        expect(s.prepare()).toBe(true);
        expect(s.begin()).toBe(true);
        advance(600); correct();
        if (s.state().status === 'recall') s.recall(Math.ceil(s.state().clockMs / 1000));
        expect(s.state().status).toBe('feedback');
        expect(s.prepare()).toBe(true);
        const waiting = s.state();
        advance(30000);
        expect(s.state().status).toBe('ready');
        expect(s.state().clockMs).toBe(waiting.clockMs);
        expect(s.begin()).toBe(true);
        advance(300); correct();
        expect(s.state().rows[1].reactionMs).toBe(300);
        expect(s.state().remainingMs).toBe(mode === 'rush' || mode === 'sprint' ? 59100 : 60000);
    });
    test('la capa de play amaga el tauler, no permet interacció abans de començar i es retira després', () => {
        const fs = require('fs'), path = require('path');
        const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
        const css = fs.readFileSync(path.join(__dirname, '../bulletpractice.css'), 'utf8');
        const js = fs.readFileSync(path.join(__dirname, '../bulletpractice.js'), 'utf8');
        expect(html).toContain('id="bp-start-overlay"');
        expect(html).toContain('id="bp-start-play"');
        expect(html).toContain('bulletpractice.js?v=1.2.0');
        expect(html).toContain('bulletpractice.css?v=1.2.0');
        expect(css).toContain('.bp-board-wrap.bp-awaiting-start #bp-board');
        expect(css).toContain('filter: blur(');
        expect(css).toContain('pointer-events: none');
        expect(css).toContain('.bp-start-overlay');
        expect(js).toContain("el('start-play').onclick = beginRound");
        expect(js).toContain("el('start-overlay').hidden = false;");
        expect(js).toContain("el('start-overlay').hidden = true;");
        expect(js).toContain("if (!session.begin()) return false;");
        expect(js).not.toContain("el('stage').style.visibility = ''; session.begin()");
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

describe('contrarellotge: temps compartit i penalització per error', () => {
    function rush(seconds = 30) {
        let time = 0;
        const s = B.createSession({ mode: 'rush', seconds, level: 2, deck: B.makeDeck(bank, 'rush', [], () => .5, 2), now: () => time });
        return { s, advance: ms => { time += ms; } };
    }
    test.each([30, 60])('%s s: encerts i errors consumeixen el mateix rellotge; l’error resta temps extra', seconds => {
        const { s, advance } = rush(seconds), penalty = B.PENALTY_MS[seconds];
        s.prepare(); expect(s.state().limitMs).toBe(seconds * 1000);
        s.begin(); advance(1500); s.submit(s.state().task.answers[0]);
        expect(s.state().status).toBe('feedback'); expect(s.state().remainingMs).toBe(seconds * 1000 - 1500);
        s.prepare(); s.begin(); advance(800); s.submit('a1a1');
        const row = s.state().rows[1];
        expect(row).toMatchObject({ correct: false, timeout: false, penaltyMs: penalty, clockMs: seconds * 1000 - 2300 });
        expect(s.state().remainingMs).toBe(seconds * 1000 - 2300 - penalty);
        expect(s.state().rows.some(r => 'clockCorrect' in r)).toBe(false);
    });
    test('la penalització no deixa el rellotge en negatiu i la sèrie s’acaba a zero', () => {
        const { s, advance } = rush(30);
        s.prepare(); s.begin(); advance(28000); s.submit('a1a1');
        expect(s.state().rows[0].penaltyMs).toBe(2000); expect(s.state().remainingMs).toBe(0);
        expect(s.prepare()).toBe(false); expect(s.state().status).toBe('done');
        expect(B.summary(s.state().rows)).toMatchObject({ correct: 0, penaltyMs: 2000 });
    });
    test('la posició a mitges quan s’acaba el temps tanca la prova i no compta com a error', () => {
        const { s, advance } = rush(30);
        s.prepare(); s.begin(); advance(2000); s.submit(s.state().task.answers[0]);
        s.prepare(); s.begin(); advance(31000);
        expect(s.tick()).toMatchObject({ timeout: true, correct: false });
        expect(s.state().rows).toHaveLength(1); expect(s.state().remainingMs).toBe(0);
        // Una jugada tardana tampoc no compta.
        expect(s.submit(s.state().task.answers[0])).toBeNull();
        expect(s.prepare()).toBe(false); expect(s.state().status).toBe('done');
        expect(B.summary(s.state().rows)).toMatchObject({ attempts: 1, correct: 1, accuracy: 1 });
    });
    test('tota una contrarellotge d’encerts ràpids: més posicions que una sèrie normal', () => {
        const { s, advance } = rush(60);
        while (s.prepare()) { s.begin(); advance(1400); s.submit(s.state().task.answers[0]); }
        const a = B.summary(s.state().rows);
        expect(a.correct).toBe(40); expect(a.accuracy).toBe(1);
    });
});

describe('estratègia: nivell, rècords, pla diari, ratxa i fase', () => {
    const row = (extra = {}) => ({ taskId: 't', kind: 'mate', correct: true, timeout: false, reactionMs: 1500, targetMs: 30000, clockMs: 15000, ...extra });
    const day = (d, h = 18) => new Date(2026, 9, d, h).getTime();
    let n = 0;
    const session = (mode, at, extra = {}) => ({ id: 's' + (n++), at, mode, seconds: 60, level: 1, complete: true, rows: Array.from({ length: mode === 'rush' ? 10 : B.MODES[mode].count }, () => row()), ...extra });
    test('contrarellotge: puja amb precisió i prou encerts; persisteix fins a 60 files amb la penalització', () => {
        const good = () => session('rush', day(1), { rows: Array.from({ length: 10 }, () => row()) });
        const few = () => session('rush', day(1), { rows: Array.from({ length: 6 }, () => row()) });
        expect(B.suggestedLevel({ sessions: [good(), good(), good()] }, 'rush', 60)).toBe(2);
        expect(B.suggestedLevel({ sessions: [good(), good(), few()] }, 'rush', 60)).toBe(1);
        expect(B.suggestedLevel({ sessions: [few(), few(), few()].map(s => ({ ...s, seconds: 30 })) }, 'rush', 30)).toBe(2);
        const long = session('rush', day(1), { rows: Array.from({ length: 70 }, () => row({ correct: false, penaltyMs: 5000 })) });
        const p = B.normalizeProgress(JSON.parse(JSON.stringify({ sessions: [long] })));
        expect(p.sessions[0].rows).toHaveLength(60); expect(p.sessions[0].rows[0].penaltyMs).toBe(5000);
        expect(B.normalizeProgress({ sessions: [session('rush', 1, { rows: [row({ penaltyMs: 99999 })] })] }).sessions[0].rows[0].penaltyMs).toBeUndefined();
    });
    test('rècords per ritme: només contrarellotges acabades; en cas d’empat, la més ràpida', () => {
        const p = { sessions: [
            session('rush', day(1), { rows: Array.from({ length: 8 }, () => row({ reactionMs: 2000 })) }),
            session('rush', day(2), { rows: Array.from({ length: 8 }, () => row({ reactionMs: 1500 })), level: 2 }),
            session('rush', day(3), { rows: Array.from({ length: 20 }, () => row()), complete: false }),
            session('rush', day(4), { seconds: 30, rows: Array.from({ length: 5 }, () => row()) }),
            session('sprint', day(4), { rows: Array.from({ length: 10 }, () => row()) })
        ] };
        const r = B.records(p);
        expect(r[60]).toMatchObject({ score: 8, level: 2, medianMs: 1500 });
        expect(r[30]).toMatchObject({ score: 5 });
        expect(B.records({ sessions: [] })).toEqual({ 30: null, 60: null });
    });
    test('pla d’avui: compta les sèries acabades d’avui en ordre i marca el pas següent', () => {
        const now = day(10, 20);
        expect(B.planToday({ sessions: [] }, now)).toMatchObject({ next: 'scan', complete: false });
        const p = { sessions: [session('scan', day(9)), session('scan', day(10, 9)), session('radar', day(10, 10)), session('sprint', day(10, 11), { complete: false })] };
        let plan = B.planToday(p, now);
        expect(plan.steps.map(s => s.done)).toEqual([1, 1, 0, 0]); expect(plan.next).toBe('sprint');
        p.sessions.push(session('sprint', day(10, 12)), session('rush', day(10, 13)));
        plan = B.planToday(p, now); expect(plan.next).toBe('rush'); expect(plan.steps[3].done).toBe(1);
        p.sessions.push(session('rush', day(10, 14)), session('rush', day(10, 15)));
        plan = B.planToday(p, now); expect(plan).toMatchObject({ complete: true, next: null }); expect(plan.steps[3].done).toBe(2);
    });
    test('ratxa de dies: avui o fins ahir, i un forat la talla', () => {
        const p = { sessions: [session('scan', day(5)), session('scan', day(6)), session('scan', day(8, 9)), session('radar', day(9, 23)), session('scan', day(9, 1), { complete: false })] };
        expect(B.streak(p, day(9, 23))).toBe(2);
        expect(B.streak(p, day(10, 8))).toBe(2);
        expect(B.streak(p, day(11, 8))).toBe(0);
        expect(B.streak({ sessions: [] }, day(9))).toBe(0);
        expect(B.activeDays(p, day(9, 23))).toBe(4);
    });
    test('fase: precisió → rellotge → velocitat → passa a 30 segons', () => {
        const p = { sessions: [] };
        expect(B.phase(p, 60)).toMatchObject({ step: 1, mode: 'scan' });
        p.sessions.push(session('scan', day(1)), session('scan', day(2)), session('scan', day(3)));
        expect(B.phase(p, 60)).toMatchObject({ step: 2, mode: 'radar' });
        const radar = extra => session('radar', day(4), { rows: Array.from({ length: 8 }, () => row({ clockCorrect: true, clockErrorMs: 0 })), ...extra });
        p.sessions.push(radar(), radar(), radar());
        expect(B.phase(p, 60)).toMatchObject({ step: 3, mode: 'rush' });
        expect(B.phase(p, 30)).toMatchObject({ step: 1 });
        p.sessions.push(session('rush', day(5), { rows: Array.from({ length: 12 }, () => row()) }));
        expect(B.phase(p, 60)).toMatchObject({ step: 4 });
    });
    test('punt feble: el tipus d’objectiu amb menys encerts recents, si n’hi ha prou dades', () => {
        const now = day(20);
        const rows = [...Array.from({ length: 8 }, () => row({ kind: 'mate' })), ...Array.from({ length: 8 }, (_, i) => row({ kind: 'escape', correct: i < 4 })), row({ kind: 'capture', correct: false })];
        const ks = B.kindStats({ sessions: [session('scan', day(19), { rows })] }, now);
        expect(ks.weakest).toBe('escape');
        expect(ks.byKind.mate.accuracy).toBe(1); expect(ks.byKind.capture.attempts).toBe(1);
        // Fora de la finestra de 30 dies no compta.
        expect(B.kindStats({ sessions: [session('scan', new Date(2026, 7, 1).getTime(), { rows })] }, now).weakest).toBeNull();
    });
});
