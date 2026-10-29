// pantallaactiva.js — evita el repòs de pantalla mentre El Tauler és visible.
// Un sol bloqueig global per document (també Stockfish vs Lozza TV).
// El navegador o el sistema operatiu sempre poden denegar/revocar la petició.
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        root.ElTaulerPantallaActiva = api;
        api.start(root);
    }
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    const VERSION = '1.0.0';
    const STORAGE_KEY = 'chess_app_keep_screen_on';

    function safeRead(storage) {
        try { return storage && storage.getItem(STORAGE_KEY); }
        catch (err) { return null; }
    }
    function safeWrite(storage, value) {
        try { if (storage) storage.setItem(STORAGE_KEY, value ? '1' : '0'); }
        catch (err) { /* Mode privat: preferència només en memòria. */ }
    }

    function start(host) {
        const w = host || {};
        const doc = w.document;
        const nav = w.navigator;
        if (!doc) return null;
        let storage = null;
        try { storage = w.localStorage; } catch (err) { /* Emmagatzematge bloquejat. */ }
        const supported = !!(nav && nav.wakeLock && typeof nav.wakeLock.request === 'function');
        // Activat per defecte, també si la preferència local no és accessible.
        let enabled = safeRead(storage) !== '0';
        let sentinel = null;
        let pending = null;
        let generation = 0;
        let lastFailure = false;
        let destroyed = false;

        function visible() {
            return !destroyed && doc.visibilityState !== 'hidden'
                && doc.hidden !== true && doc.prerendering !== true;
        }
        function status() {
            if (!supported) return 'unsupported';
            if (!enabled) return 'off';
            if (sentinel && !sentinel.released) return 'active';
            if (pending) return 'requesting';
            return lastFailure ? 'blocked' : 'inactive';
        }
        function refreshUI() {
            if (typeof doc.getElementById !== 'function') return;
            const control = doc.getElementById('keep-screen-on-toggle');
            if (control) {
                control.disabled = !supported;
                control.checked = supported && enabled;
            }
            const label = doc.getElementById('keep-screen-on-status');
            if (!label) return;
            const messages = {
                unsupported: 'Aquest navegador no admet mantenir la pantalla encesa automàticament.',
                off: 'Desactivat: el mòbil seguirà el temps habitual de repòs.',
                active: 'Pantalla activa mentre utilitzis El Tauler, inclosa la TV.',
                requesting: 'Activant la pantalla sempre encesa…',
                blocked: 'El dispositiu ha denegat la petició (pot ser per estalvi de bateria).',
                inactive: 'Es mantindrà encesa quan l’aplicació sigui visible.'
            };
            label.textContent = messages[status()];
        }

        function drop() {
            generation += 1;
            // Permet demanar-ne un de nou en tornar de segon pla encara que
            // una petició anterior no s'hagi resolt.
            pending = null;
            const old = sentinel;
            sentinel = null;
            if (old && !old.released) {
                try { Promise.resolve(old.release()).catch(function () {}); }
                catch (err) { /* El sistema pot haver revocat el bloqueig. */ }
            }
            refreshUI();
        }

        function acquire() {
            if (!supported || !enabled || !visible()) {
                refreshUI();
                return Promise.resolve(false);
            }
            if (sentinel && !sentinel.released) return Promise.resolve(true);
            if (pending) return pending;
            const ticket = generation;
            lastFailure = false;
            // La crida al navegador es fa immediatament: si cal un gest
            // d'usuari, no es perd l'activació amb un setTimeout.
            const op = (async function () {
                try {
                    const lock = await nav.wakeLock.request('screen');
                    if (ticket !== generation || !enabled || !visible()) {
                        if (lock && !lock.released) {
                            try { await lock.release(); } catch (err) { /* Ja revocat. */ }
                        }
                        return false;
                    }
                    sentinel = lock;
                    if (typeof lock.addEventListener === 'function') {
                        lock.addEventListener('release', function () {
                            if (sentinel !== lock) return;
                            sentinel = null;
                            refreshUI();
                            // El sistema ha revocat el bloqueig. No entrem en
                            // bucles de reintents: el proper gest/focus el recupera.
                        });
                    }
                    return true;
                } catch (err) {
                    if (ticket === generation) lastFailure = true;
                    return false;
                }
            })();
            pending = op;
            refreshUI();
            op.then(function () {
                if (pending === op) pending = null;
                refreshUI();
            });
            return op;
        }

        function setEnabled(next) {
            enabled = !!next;
            safeWrite(storage, enabled);
            lastFailure = false;
            if (enabled) return acquire();
            drop();
            return Promise.resolve(false);
        }

        function mount() {
            const control = typeof doc.getElementById === 'function'
                ? doc.getElementById('keep-screen-on-toggle') : null;
            if (control && !control.dataset.keepScreenReady) {
                control.dataset.keepScreenReady = '1';
                control.addEventListener('change', function () {
                    setEnabled(control.checked);
                });
            }
            refreshUI();
        }

        if (typeof doc.addEventListener === 'function') {
            doc.addEventListener('visibilitychange', function () {
                if (visible()) acquire();
                else drop();
            });
            if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount);
            else mount();
        } else mount();

        if (typeof w.addEventListener === 'function') {
            w.addEventListener('pagehide', drop);
            w.addEventListener('freeze', drop);
            w.addEventListener('pageshow', function () { acquire(); });
            w.addEventListener('resume', function () { acquire(); });
            w.addEventListener('focus', function () { acquire(); });
            w.addEventListener('fullscreenchange', function () { acquire(); });
            // Reintenta quan el navegador requereixi una interacció per concedir
            // el bloqueig, però no envia peticions repetides mentre ja és actiu.
            w.addEventListener('pointerdown', function () { acquire(); }, { passive: true });
            w.addEventListener('keydown', function () { acquire(); });
            w.addEventListener('touchstart', function () { acquire(); }, { passive: true });
            w.addEventListener('beforeunload', drop);
        }

        acquire();
        return Object.freeze({
            isSupported: () => supported,
            isEnabled: () => enabled,
            getStatus: status,
            acquire,
            release: drop,
            setEnabled,
            refreshUI: mount,
            destroy: function () { destroyed = true; drop(); }
        });
    }

    return Object.freeze({ VERSION, STORAGE_KEY, start });
});
