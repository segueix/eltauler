// Pantalla encesa a totes les seccions, inclosa Stockfish vs Lozza TV.
const fs = require('fs');
const path = require('path');
const Screen = require('../pantallaactiva');

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function fixture(options = {}) {
    const calls = [];
    const events = { win: {}, doc: {}, check: {} };
    const values = new Map(Object.entries(options.stored || {}));
    const storage = {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
    };
    const check = {
        checked: false, disabled: false, dataset: {},
        addEventListener: (name, cb) => { events.check[name] = cb; }
    };
    const hint = { textContent: '' };
    const doc = {
        visibilityState: options.visibilityState || 'visible',
        readyState: 'loading',
        addEventListener: (name, cb) => { events.doc[name] = cb; },
        getElementById: id => id === 'keep-screen-on-toggle'
            ? check : id === 'keep-screen-on-status' ? hint : null
    };
    const makeSentinel = () => {
        const hooks = {};
        const sentinel = {
            released: false, release: jest.fn(async () => {
                sentinel.released = true;
                if (hooks.release) hooks.release();
            }),
            addEventListener: (name, cb) => { hooks[name] = cb; },
            notifyRelease: () => {
                sentinel.released = true;
                if (hooks.release) hooks.release();
            }
        };
        return sentinel;
    };
    const request = jest.fn(() => {
        const result = options.nextRequest ? options.nextRequest(calls.length) : Promise.resolve(makeSentinel());
        calls.push(result);
        return result;
    });
    const nav = options.unsupported ? {} : { wakeLock: { request } };
    const host = {
        document: doc, navigator: nav, localStorage: options.storage || storage,
        addEventListener: (name, cb) => { events.win[name] = cb; }
    };
    const instance = Screen.start(host);
    events.doc.DOMContentLoaded();
    return { instance, events, doc, check, hint, request, calls, values, makeSentinel };
}
async function settle() {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
}
describe('Pantalla sempre activa', () => {
    test('s’activa per defecte en obrir El Tauler i només requereix un bloqueig', async () => {
        const x = fixture();
        expect(x.request).toHaveBeenCalledTimes(1);
        expect(x.request).toHaveBeenCalledWith('screen');
        await settle();
        expect(x.instance.getStatus()).toBe('active');
        expect(x.check.checked).toBe(true);
        expect(x.hint.textContent).toContain('inclosa la TV');
        x.events.win.focus();
        x.events.win.pointerdown();
        x.events.win.fullscreenchange();
        x.events.win.pageshow();
        await settle();
        expect(x.request).toHaveBeenCalledTimes(1);
    });

    test('sense navegació nova: les seccions SPA, les partides i la TV comparteixen el bloqueig', async () => {
        const x = fixture();
        await settle();
        x.events.win.pointerdown(); // Entra a la TV
        x.events.win.keydown(); // Controls de reproducció
        x.events.win.touchstart(); // Canvia de pantalla
        x.instance.refreshUI(); // Obre configuració
        await settle();
        expect(x.request).toHaveBeenCalledTimes(1);
        expect(x.instance.getStatus()).toBe('active');
    });

    test('en segon pla allibera; en tornar reobre amb un sol bloqueig', async () => {
        const x = fixture();
        await settle();
        const previous = await x.calls[0];
        x.doc.visibilityState = 'hidden';
        x.events.doc.visibilitychange();
        await settle();
        expect(previous.release).toHaveBeenCalledTimes(1);
        expect(x.instance.getStatus()).toBe('inactive');
        x.events.win.focus();
        expect(x.request).toHaveBeenCalledTimes(1); // Mai mentre és oculta
        x.doc.visibilityState = 'visible';
        x.events.doc.visibilitychange();
        x.events.win.pageshow();
        x.events.win.resume();
        await settle();
        expect(x.request).toHaveBeenCalledTimes(2);
        expect(x.instance.getStatus()).toBe('active');
    });

    test('el sistema revoca el bloqueig: un gest següent el torna a obtenir', async () => {
        const x = fixture();
        await settle();
        const lock = await x.calls[0];
        lock.notifyRelease();
        expect(x.instance.getStatus()).toBe('inactive');
        x.events.win.pointerdown();
        await settle();
        expect(x.request).toHaveBeenCalledTimes(2);
        expect(x.instance.getStatus()).toBe('active');
    });

    test('no duplica peticions pendents amb esdeveniments simultanis', async () => {
        const slow = deferred();
        const x = fixture({ nextRequest: () => slow.promise });
        x.events.win.pointerdown();
        x.events.win.focus();
        x.events.win.fullscreenchange();
        expect(x.request).toHaveBeenCalledTimes(1);
        slow.resolve(x.makeSentinel());
        await settle();
        expect(x.instance.getStatus()).toBe('active');
    });

    test('resposta tardana de segon pla: no conserva un bloqueig obsolet', async () => {
        const slow = deferred();
        const x = fixture({ nextRequest: i => i === 0 ? slow.promise : Promise.resolve(x.makeSentinel()) });
        x.doc.visibilityState = 'hidden';
        x.events.doc.visibilitychange();
        x.doc.visibilityState = 'visible';
        x.events.doc.visibilitychange();
        await settle();
        expect(x.request).toHaveBeenCalledTimes(2);
        const stale = x.makeSentinel();
        slow.resolve(stale);
        await settle();
        expect(stale.release).toHaveBeenCalledTimes(1);
        expect(x.instance.getStatus()).toBe('active');
    });

    test('també funciona en restaurar de bfcache i en reprendre després de freeze', async () => {
        const x = fixture();
        await settle();
        x.events.win.pagehide();
        await settle();
        expect(x.instance.getStatus()).toBe('inactive');
        x.events.win.pageshow({ persisted: true });
        await settle();
        expect(x.instance.getStatus()).toBe('active');
        x.events.win.freeze();
        await settle();
        x.events.win.resume();
        await settle();
        expect(x.request).toHaveBeenCalledTimes(3);
    });

    test('l’usuari el pot desactivar i la preferència persisteix', async () => {
        const x = fixture();
        await settle();
        const old = await x.calls[0];
        x.check.checked = false;
        x.events.check.change();
        await settle();
        expect(old.release).toHaveBeenCalledTimes(1);
        expect(x.instance.isEnabled()).toBe(false);
        expect(x.values.get(Screen.STORAGE_KEY)).toBe('0');
        x.events.win.pointerdown();
        expect(x.request).toHaveBeenCalledTimes(1);
        x.check.checked = true;
        x.events.check.change();
        await settle();
        expect(x.values.get(Screen.STORAGE_KEY)).toBe('1');
        expect(x.request).toHaveBeenCalledTimes(2);
        const y = fixture({ stored: { [Screen.STORAGE_KEY]: '0' } });
        await settle();
        expect(y.request).not.toHaveBeenCalled();
        expect(y.check.checked).toBe(false);
    });

    test('els navegadors sense Wake Lock no generen errors ni controls enganyosos', async () => {
        const x = fixture({ unsupported: true });
        await settle();
        expect(x.instance.isSupported()).toBe(false);
        expect(x.instance.getStatus()).toBe('unsupported');
        expect(x.check.disabled).toBe(true);
        expect(x.check.checked).toBe(false);
        expect(x.hint.textContent).toContain('no admet');
        x.events.win.pointerdown();
    });

    test('si el sistema denega la petició, l’app segueix funcionant i reintenta amb gest', async () => {
        let attempt = 0;
        const x = fixture({ nextRequest: () => {
            attempt++;
            return attempt === 1 ? Promise.reject(new Error('Battery saver')) : Promise.resolve(x.makeSentinel());
        } });
        await settle();
        expect(x.instance.getStatus()).toBe('blocked');
        expect(x.hint.textContent).toContain('denegat');
        x.events.win.touchstart();
        await settle();
        expect(x.instance.getStatus()).toBe('active');
    });

    test('en tancar, el bloqueig s’allibera i no hi ha més peticions', async () => {
        const x = fixture();
        await settle();
        const lock = await x.calls[0];
        x.instance.destroy();
        await settle();
        expect(lock.release).toHaveBeenCalledTimes(1);
        x.events.win.focus();
        await settle();
        expect(x.request).toHaveBeenCalledTimes(1);
    });

    test('el mòdul es carrega a la PWA i a les altres pàgines pròpies', () => {
        const main = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
        expect(main).toContain('<script src="pantallaactiva.js?v=1.0.0"></script>');
        expect(main).toContain('id="keep-screen-on-toggle"');
        expect(main).toContain('id="keep-screen-on-status"');
        expect(main).toContain('Stockfish vs Lozza TV');
        ['catalans-vs-stockfish', 'nova-partida', 'obertures'].forEach(dir => {
            const html = fs.readFileSync(path.join(__dirname, '../', dir, 'index.html'), 'utf8');
            expect(html).toContain('<script src="../pantallaactiva.js?v=1.0.0"></script>');
        });
    });
});
