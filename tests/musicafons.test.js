const M = require('../musicafons');

// Rellotge i temporitzadors simulats: res no depèn de la velocitat de la màquina.
function clock() {
    let t = 0, id = 0;
    const timers = new Map();
    return {
        now: () => t,
        setTimeout: (fn, ms) => { timers.set(++id, { fn, at: t + (ms || 0) }); return id; },
        clearTimeout: (k) => { timers.delete(k); },
        advance(ms) {
            const end = t + ms;
            for (;;) {
                let next = null;
                for (const [k, v] of timers) if (v.at <= end && (!next || v.at < next[1].at)) next = [k, v];
                if (!next) break;
                timers.delete(next[0]); t = next[1].at; next[1].fn();
            }
            t = end;
        },
        pending: () => timers.size
    };
}
function fakePlayer() {
    const p = { active: false, melody: null, volume: null, ducked: false, unlocks: 0, fades: 0,
        update: jest.fn((raw, enabled, opts) => {
            p.active = !!enabled; p.volume = raw.volume;
            if (raw.melody) p.melody = raw.melody;
            if (!enabled && opts && opts.fade) p.fades++;
        }),
        duck: jest.fn(on => { p.ducked = on; }),
        unlock: jest.fn(() => { p.unlocks++; }),
        status: () => (p.active ? 'playing' : 'off'),
        playing: () => (p.active ? p.melody : null)
    };
    return p;
}
function setup(over = {}) {
    const c = clock(), player = fakePlayer();
    let picks = 0, stored = over.stored || null, others = false;
    const ambient = {
        pickMelody: jest.fn(() => ['theme', 'lofi', 'celta'][picks++ % 3]),
        setAllowed: jest.fn(),
        othersPlaying: jest.fn(() => others)
    };
    let hidden = false, page = over.page === undefined ? null : over.page;
    const coord = M.createCoordinator({ ambient, createPlayer: () => player, now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout,
        isHidden: () => hidden, pageKey: () => page, loadPrefs: () => stored, savePrefs: p => { stored = p; } });
    return { c, player, ambient, coord, saved: () => stored, setHidden: v => { hidden = v; }, setOthers: v => { others = v; }, setPage: v => { page = v; } };
}

describe('preferències de veu i música', () => {
    test('per defecte, veu i música; el volum es limita', () => {
        expect(M.normalizePrefs()).toEqual({ voice: true, music: true, volume: 20 });
        expect(M.normalizePrefs({ voice: false, volume: 140 })).toEqual({ voice: false, music: true, volume: 100 });
        expect(M.normalizePrefs({ volume: NaN }).volume).toBe(20);
    });
    test.each([
        ['both', true, true], ['voice', true, false], ['music', false, true], ['none', false, false]
    ])('mode %s', (mode, voice, music) => {
        const p = M.withMode({ volume: 35 }, mode);
        expect(p).toEqual({ voice, music, volume: 35 });
        expect(M.modeOf(p)).toBe(mode);
    });
    test('un mode desconegut torna a veu i música', () => {
        expect(M.modeOf(M.withMode(null, 'xxx'))).toBe('both');
    });
    test('la durada estimada creix amb el text i baixa amb la velocitat', () => {
        const short = M.estimateSpeechMs('Cavall a f3.'), long = M.estimateSpeechMs('x'.repeat(280));
        expect(short).toBeGreaterThanOrEqual(700);
        expect(long).toBeGreaterThan(short);
        expect(M.estimateSpeechMs('x'.repeat(280), 2)).toBeLessThan(long);
        expect(M.estimateSpeechMs('x'.repeat(100000))).toBe(60000);
    });
});

describe('la música acompanya la veu a tota l’app', () => {
    test('comença amb la veu, baixa mentre parla i s’esvaeix quan fa estona que calla', () => {
        const { c, player, coord } = setup();
        expect(player.update).not.toHaveBeenCalled();
        const end = coord.begin();
        expect(player.active).toBe(true);
        expect(player.melody).toBe('theme');
        expect(player.ducked).toBe(true);
        expect(player.unlocks).toBe(0); // ja sona (el reproductor simulat no necessita context)
        c.advance(3000); end();
        expect(player.active).toBe(true);
        expect(player.ducked).toBe(false);
        c.advance(M.LINGER_MS - 1000);
        expect(player.active).toBe(true);
        c.advance(1500);
        expect(player.active).toBe(false);
        expect(player.fades).toBe(1);
        // Quan torna la veu, una altra melodia.
        coord.begin();
        expect(player.active).toBe(true);
        expect(player.melody).toBe('lofi');
    });
    test('dues veus seguides no canvien la melodia', () => {
        const { c, player, coord } = setup();
        const a = coord.begin(); c.advance(1000); a();
        c.advance(2000);
        const b = coord.begin(); c.advance(1000); b();
        expect(player.melody).toBe('theme');
    });
    test('només música: les locucions silencioses no abaixen el fons', () => {
        const { player, coord } = setup();
        coord.setMode('music');
        coord.begin({ muted: true });
        expect(player.active).toBe(true);
        expect(player.ducked).toBe(false);
    });
    test('només veu o cap: la música no sona i l’interruptor general s’apaga', () => {
        const { player, coord, ambient, saved } = setup();
        const end = coord.begin();
        expect(player.active).toBe(true);
        coord.setMode('voice');
        expect(ambient.setAllowed).toHaveBeenLastCalledWith(false);
        expect(player.active).toBe(false);
        expect(saved()).toEqual({ voice: true, music: false, volume: 20 });
        end();
        coord.begin();
        expect(player.active).toBe(false);
        coord.setMode('none');
        expect(coord.voiceEnabled()).toBe(false);
        expect(coord.musicEnabled()).toBe(false);
    });
    test('les preferències desades es recuperen i el volum s’aplica al moment', () => {
        const { player, coord, ambient } = setup({ stored: { voice: false, music: true, volume: 55 } });
        expect(coord.mode()).toBe('music');
        expect(ambient.setAllowed).toHaveBeenCalledWith(true);
        coord.begin({ muted: true });
        expect(player.volume).toBe(55);
        coord.setPrefs({ volume: 10 });
        expect(player.volume).toBe(10);
    });
    test('amb la pestanya amagada no sona', () => {
        const { player, coord, setHidden } = setup();
        coord.begin();
        setHidden(true); coord.refresh();
        expect(player.active).toBe(false);
    });
    test('tàctiques: una sola melodia mentre no es canvia de pàgina, encara que la veu calli', () => {
        const { c, player, coord } = setup({ page: 'game-screen' });
        const a = coord.begin(); c.advance(2000); a();
        expect(player.melody).toBe('theme');
        // Entre exercici i exercici la veu calla una bona estona.
        c.advance(5 * 60000);
        expect(player.active).toBe(true);
        const b = coord.begin(); c.advance(2000); b();
        expect(player.active).toBe(true);
        expect(player.melody).toBe('theme');
        expect(player.fades).toBe(0);
    });
    test('en tornar a l’inici o canviar de pàgina la música s’atura i la pàgina nova en tria una altra', () => {
        const { c, player, coord, setPage } = setup({ page: 'game-screen' });
        const a = coord.begin(); c.advance(2000);
        setPage('start-screen'); coord.refresh();
        expect(player.active).toBe(false);
        expect(player.fades).toBe(1);
        // La veu que ja parlava no la torna a engegar a la pàgina nova.
        c.advance(3000);
        expect(player.active).toBe(false);
        a(); c.advance(60000);
        expect(player.active).toBe(false);
        setPage('opening-screen'); coord.refresh();
        coord.begin();
        expect(player.active).toBe(true);
        expect(player.melody).toBe('lofi');
    });
    test('si fa molta estona que no parla ningú a la pàgina, calla; si hi torna, la mateixa melodia', () => {
        const { c, player, coord } = setup({ page: 'game-screen' });
        const a = coord.begin(); a();
        c.advance(M.PAGE_IDLE_MS + 1000);
        expect(player.active).toBe(false);
        coord.begin();
        expect(player.active).toBe(true);
        expect(player.melody).toBe('theme');
    });
    test('la pestanya amagada fa callar la música, però en tornar continua la mateixa', () => {
        const { player, coord, setHidden } = setup({ page: 'game-screen' });
        const a = coord.begin(); a();
        setHidden(true); coord.refresh();
        expect(player.active).toBe(false);
        setHidden(false); coord.refresh();
        expect(player.active).toBe(true);
        expect(player.melody).toBe('theme');
    });
    test('si la TV ja fa sonar la seva música de Matxa Ràdio, s’hi deixa pas', () => {
        const { c, player, coord, setOthers } = setup();
        coord.begin();
        setOthers(true); c.advance(1000);
        expect(player.active).toBe(false);
        setOthers(false); c.advance(1000);
        expect(player.active).toBe(true);
    });
    test('un reproductor que espera es desbloqueja; sense veu ni música no hi ha pols', () => {
        const { c, player, coord } = setup();
        player.status = () => (player.active ? 'waiting' : 'off');
        coord.begin();
        expect(player.unlocks).toBeGreaterThan(0);
        coord.setMode('none');
        const { c: c2, coord: idle } = setup();
        idle.refresh();
        expect(c2.pending()).toBe(0);
        expect(c.pending()).toBeGreaterThan(0);
    });
});

describe('partides amb rellotge: ni veu ni música', () => {
    test('mentre dura no sona la música, la veu queda silenciada i en acabar tot torna', () => {
        const { c, player, coord } = setup({ page: 'game-screen' });
        let timed = false;
        coord.setQuietCheck(() => timed);
        const a = coord.begin();
        expect(player.active).toBe(true);
        expect(coord.voiceEnabled()).toBe(true);
        // Comença una partida amb rellotge: la música s'atura al moment (al pols següent).
        timed = true;
        c.advance(1000);
        expect(player.active).toBe(false);
        expect(player.fades).toBe(1);
        expect(coord.voiceEnabled()).toBe(false);
        a();
        coord.begin({ muted: true });
        expect(player.active).toBe(false);
        // S'acaba la partida: la veu i la música tornen amb la veu següent.
        timed = false;
        c.advance(1000);
        expect(coord.voiceEnabled()).toBe(true);
        coord.begin();
        expect(player.active).toBe(true);
    });
    test('amb la veu apagada per la partida, speechSynthesis no parla de debò', () => {
        const s = setup(), sy = { speaking: false, pending: false, spoken: [], speak: jest.fn(function (u) { this.spoken.push(u); }), cancel: jest.fn() };
        s.coord.setQuietCheck(() => true);
        M.hookSpeechSynthesis(sy, s.coord, { setTimeout: s.c.setTimeout, clearTimeout: s.c.clearTimeout, fire: () => {} });
        sy.speak({ text: 'Escac', rate: 1, addEventListener() {} });
        expect(sy.spoken).toHaveLength(0);
        expect(s.player.active).toBe(false);
    });
});

describe('veu del dispositiu (speechSynthesis)', () => {
    function utterance(text) {
        const listeners = {};
        const u = { text, rate: 1, events: [],
            addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
            emit(type, ev) { u.events.push(type); (listeners[type] || []).forEach(fn => fn(ev || { type })); if (typeof u['on' + type] === 'function') u['on' + type](ev || { type }); }
        };
        return u;
    }
    function synth() {
        return { speaking: false, pending: false, spoken: [], speak: jest.fn(function (u) { this.spoken.push(u); }), cancel: jest.fn() };
    }
    function hooked(mode) {
        const s = setup(), c = s.c, sy = synth();
        s.coord.setMode(mode);
        M.hookSpeechSynthesis(sy, s.coord, { setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, fire: (u, type, error) => u.emit(type, { type, error }) });
        return Object.assign(s, { sy });
    }
    test('una locució real engega la música en començar i l’allibera en acabar', () => {
        const { sy, coord, player } = hooked('both');
        const u = utterance('Bona jugada.');
        sy.speak(u);
        expect(sy.spoken).toEqual([u]);
        expect(coord.speaking()).toBe(false);
        u.emit('start');
        expect(coord.speaking()).toBe(true);
        expect(player.active).toBe(true);
        u.emit('end');
        expect(coord.speaking()).toBe(false);
    });
    test('si el navegador no avisa del final, el pols la dona per acabada', () => {
        const { sy, coord, c } = hooked('both');
        const u = utterance('Bona jugada.');
        sy.speak(u); u.emit('start'); sy.speaking = true;
        c.advance(1000);
        expect(coord.speaking()).toBe(true);
        sy.speaking = false;
        c.advance(1000);
        expect(coord.speaking()).toBe(false);
    });
    test('amb la veu apagada no parla, però fa start i end amb la durada que tindria', () => {
        const { sy, coord, c, player } = hooked('music');
        const u = utterance('Les blanques tenen avantatge.');
        let ended = 0;
        u.onend = () => { ended++; };
        sy.speak(u);
        expect(sy.speak).not.toBe(undefined);
        expect(sy.spoken).toEqual([]);
        c.advance(1);
        expect(u.events).toEqual(['start']);
        expect(player.active).toBe(true);
        expect(player.ducked).toBe(false);
        c.advance(M.estimateSpeechMs(u.text, 1));
        expect(u.events).toEqual(['start', 'end']);
        expect(ended).toBe(1);
        expect(coord.speaking()).toBe(false);
    });
    test('cancel·lar una locució silenciosa avisa amb un error «interrupted»', () => {
        const { sy, c } = hooked('none');
        const u = utterance('Escac.');
        let error = null;
        u.onerror = ev => { error = ev.error; };
        sy.speak(u); c.advance(1);
        sy.cancel();
        expect(error).toBe('interrupted');
        c.advance(60000);
        expect(u.events).toEqual(['start', 'error']);
    });
});

describe('veu neuronal Matxa', () => {
    function speaker() {
        let resolveSpeak = null;
        const s = { calls: 0, stops: 0,
            speak: jest.fn(function () { this.stop(); s.calls++; return new Promise(r => { resolveSpeak = r; }); }),
            stop: jest.fn(() => { s.stops++; if (resolveSpeak) { const r = resolveSpeak; resolveSpeak = null; r({ spoken: false, reason: 'stopped' }); } }),
            pause: jest.fn(), resume: jest.fn(), isSpeaking: () => !!resolveSpeak,
            finish: () => { const r = resolveSpeak; resolveSpeak = null; r({ spoken: true, reason: 'end' }); }
        };
        return s;
    }
    function hooked(mode) {
        const s = setup(), c = s.c, sp = speaker();
        s.coord.setMode(mode);
        const V = { sharedSpeaker: () => sp };
        M.hookNeural(V, s.coord, { setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, now: c.now });
        expect(M.hookNeural(V, s.coord)).toBe(false);
        return Object.assign(s, { sp, speaker: V.sharedSpeaker() });
    }
    test('mentre Matxa parla hi ha música i en acabar s’allibera', async () => {
        const { speaker: s, sp, coord, player } = hooked('both');
        const p = s.speak('Hola', 'matxa-central-grau', {});
        expect(sp.calls).toBe(1);
        expect(coord.speaking()).toBe(true);
        expect(player.active).toBe(true);
        expect(player.ducked).toBe(true);
        sp.finish();
        await expect(p).resolves.toEqual({ spoken: true, reason: 'end' });
        expect(coord.speaking()).toBe(false);
    });
    test('amb la veu apagada no es demana res al servidor i es resol a temps', async () => {
        const { speaker: s, sp, coord, c, player } = hooked('music');
        const done = jest.fn();
        s.speak('Una explicació llarga de la jugada.', 'matxa-central-grau', { rate: 1 }).then(done);
        expect(sp.calls).toBe(0);
        expect(s.isSpeaking()).toBe(true);
        expect(player.active).toBe(true);
        // Pausa i represa (com a les ressenyes): el temps aturat no compta.
        c.advance(500); s.pause(); c.advance(60000);
        await Promise.resolve();
        expect(done).not.toHaveBeenCalled();
        s.resume();
        c.advance(M.estimateSpeechMs('Una explicació llarga de la jugada.', 1));
        await Promise.resolve();
        expect(done).toHaveBeenCalledWith({ spoken: true, reason: 'end' });
        expect(coord.speaking()).toBe(false);
    });
    test('aturar una locució silenciosa la resol com a «stopped»', async () => {
        const { speaker: s } = hooked('none');
        const p = s.speak('Text', 'matxa-central-grau');
        s.stop();
        await expect(p).resolves.toEqual({ spoken: false, reason: 'stopped' });
        expect(s.isSpeaking()).toBe(false);
    });
});
