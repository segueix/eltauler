// canviapp.js — Pas a Remigi lliscant el dit (2026-10-31).
// El Tauler (eltauler.cat) i Remigi (eltauler.cat/remigi/) són apps germanes. Al mòbil, a la portada, lliscar el dit
// cap a l'esquerra o la dreta pel mig de la pantalla fa entrar un panell «Remigi» des del costat que segueix el dit;
// si es deixa anar passat el llindar, s'obre Remigi (a la mateixa pestanya). És la mateixa animació que el pas de
// Segueix! a Segueix! Música (js/features/app-switch.js de segueix/segueix); el sentit contrari, de Remigi cap a
// El Tauler, és a apps/web/src/appSwitch/ de segueix/remigi.
// Només a la portada (#start-screen): a la resta de pantalles el dit és per als taulers, les peces i els menús.
// Tampoc no s'activa des de les vores (hi ha l'enrere del sistema), damunt de fileres amb scroll lateral, camps de
// text o finestres obertes, ni si el moviment és sobretot vertical. Les tres primeres vegades que s'obre l'app al
// mòbil, un avís amb una mà que llisca ho explica (uns 3 s).
// La lògica de decisió (zona d'inici, direcció, llindar) és pura i es prova a tests/canviapp.test.js.
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        root.ElTaulerCanviApp = api;
        api.start(root);
    }
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    const VERSION = '1.0.0';
    const TARGET_URL = '/remigi/';
    const TARGET_NAME = 'Remigi';
    // Zona central on ha de començar el gest (fraccions de la pantalla): fora de les vores del sistema
    const START_ZONE = { left: 0.12, right: 0.88, top: 0.15, bottom: 0.88 };
    const LOCK_DISTANCE = 12; // px abans de decidir si el gest és horitzontal o vertical
    const HORIZONTAL_RATIO = 1.8; // |dx| ha de ser 1,8 vegades |dy| perquè compti com a horitzontal
    const COMMIT_FRACTION = 0.35; // cal arrossegar el 35 % de l'ample de la pantalla
    const MIN_COMMIT_PX = 110;
    // Damunt d'aquests elements el gest no fa res (tenen gestos propis o s'hi escriu)
    const BLOCKED = [
        'input',
        'textarea',
        'select',
        '[contenteditable]',
        '[data-no-app-swipe]',
        '.modal-overlay',
        '[role="dialog"]',
        'dialog',
        '.cookie-consent',
        '.board-b72b1',
    ].join(',');

    // ---------- Lògica pura ----------

    function startAllowed({ x, y, width, height }) {
        if (!(width > 0) || !(height > 0)) return false;
        return (
            x >= width * START_ZONE.left &&
            x <= width * START_ZONE.right &&
            y >= height * START_ZONE.top &&
            y <= height * START_ZONE.bottom
        );
    }

    // 'h' (horitzontal), 'v' (vertical) o '' (encara no se sap)
    function lockAxis(dx, dy) {
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        if (ax < LOCK_DISTANCE && ay < LOCK_DISTANCE) return '';
        return ax > ay * HORIZONTAL_RATIO ? 'h' : 'v';
    }

    function commitDistance(width) {
        return Math.max(MIN_COMMIT_PX, width * COMMIT_FRACTION);
    }

    // Fins on ha entrat el panell (0–1)
    function progress(dx, width) {
        return Math.max(0, Math.min(1, Math.abs(dx) / commitDistance(width)));
    }

    function shouldCommit({ dx, dy, width }) {
        return Math.abs(dx) >= commitDistance(width) && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_RATIO;
    }

    // Avís de les primeres vegades
    const HINT_KEY = 'eltauler_app_switch_hint_v1';
    const HINT_TIMES = 3;
    const HINT_MS = 3000;
    const HINT_WAIT_MS = 20000; // si en 20 s no s'arriba a la portada (p. ex. un enllaç a una partida), no surt

    function shouldShowHint(count) {
        const n = Number(count);
        return !Number.isFinite(n) || n < HINT_TIMES;
    }

    // Dues fitxes de Remigi, el 7 vermell i el 8 blau, com a la seva icona
    const ICON =
        '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
        '<rect x="6" y="12" width="24" height="34" rx="4" transform="rotate(-8 18 29)"/>' +
        '<rect x="34" y="18" width="24" height="34" rx="4" transform="rotate(8 46 35)"/>' +
        '<text x="18" y="37" transform="rotate(-8 18 29)" class="app-switch__n1">7</text>' +
        '<text x="46" y="43" transform="rotate(8 46 35)" class="app-switch__n2">8</text></svg>';

    // Una mà amb el dit índex estirat (traç blanc; forma de la icona «pointer» de Lucide, ISC)
    const HAND =
        '<svg class="app-switch-hint__hand" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M22 14a8 8 0 0 1-8 8"/><path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1"/><path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>';

    // ---------- DOM ----------

    function start(host) {
        const w = host || {};
        const doc = w.document;
        if (!doc || typeof doc.addEventListener !== 'function') return null;
        if (doc.documentElement && doc.documentElement.dataset.appSwitch === 'on') return null;
        if (doc.documentElement) doc.documentElement.dataset.appSwitch = 'on';

        const state = { tracking: false, axis: '', x0: 0, y0: 0, dx: 0, dy: 0, panel: null, leaving: false };

        function isMobile() {
            return Boolean(w.matchMedia && w.matchMedia('(max-width: 768px)').matches);
        }

        function shown(el) {
            return Boolean(el) && el.offsetHeight > 0 && w.getComputedStyle(el).display !== 'none';
        }

        function anyOpenOverlay() {
            if (doc.querySelector('dialog[open]')) return true;
            const overlays = doc.querySelectorAll('.modal-overlay');
            for (let i = 0; i < overlays.length; i += 1) if (shown(overlays[i])) return true;
            return false;
        }

        // La portada, i res a sobre
        function onHome() {
            return shown(doc.getElementById('start-screen')) && !anyOpenOverlay();
        }

        // Un element (o un pare) que ja fa scroll lateral: el dit és per a ell, no per canviar d'app
        function insideHorizontalScroller(target) {
            for (let node = target; node && node !== doc.body; node = node.parentElement) {
                if (node.nodeType !== 1) continue;
                const overflowX = w.getComputedStyle(node).overflowX;
                if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 2)
                    return true;
            }
            return false;
        }

        function blocked(target) {
            if (!target || typeof target.closest !== 'function') return true;
            if (target.closest(BLOCKED)) return true;
            if (!onHome()) return true;
            return insideHorizontalScroller(target);
        }

        function ensurePanel() {
            if (state.panel && state.panel.isConnected) return state.panel;
            const panel = doc.createElement('div');
            panel.className = 'app-switch';
            panel.setAttribute('aria-hidden', 'true');
            panel.innerHTML = `<div class="app-switch__card">${ICON}<strong>${TARGET_NAME}</strong><em class="app-switch__go">Deixa anar per anar-hi</em></div>`;
            doc.body.appendChild(panel);
            state.panel = panel;
            return panel;
        }

        function paint(dx) {
            const panel = ensurePanel();
            const p = progress(dx, w.innerWidth);
            // Lliscant cap a l'esquerra el panell entra per la dreta, i a l'inrevés
            const from = dx < 0 ? 1 : -1;
            panel.classList.add('is-active');
            panel.classList.toggle('is-ready', p >= 1);
            panel.style.transition = 'none';
            panel.style.transform = `translateX(${from * (1 - p) * 100}%)`;
        }

        function reset({ animate = true } = {}) {
            const panel = state.panel;
            state.tracking = false;
            state.axis = '';
            if (!panel) return;
            const from = state.dx < 0 ? 1 : -1;
            panel.style.transition = animate ? '' : 'none';
            panel.style.transform = `translateX(${from * 100}%)`;
            panel.classList.remove('is-ready');
            w.setTimeout(() => panel.classList.remove('is-active'), animate ? 260 : 0);
        }

        function leave() {
            const panel = ensurePanel();
            state.leaving = true;
            panel.classList.add('is-active', 'is-ready', 'is-leaving');
            panel.style.transition = '';
            panel.style.transform = 'translateX(0)';
            w.setTimeout(() => w.location.assign(TARGET_URL), 180);
        }

        function onStart(event) {
            if (state.leaving || !isMobile() || event.touches.length !== 1) return;
            const touch = event.touches[0];
            if (!startAllowed({ x: touch.clientX, y: touch.clientY, width: w.innerWidth, height: w.innerHeight }))
                return;
            if (blocked(event.target)) return;
            state.tracking = true;
            state.axis = '';
            state.x0 = touch.clientX;
            state.y0 = touch.clientY;
            state.dx = 0;
            state.dy = 0;
        }

        function onMove(event) {
            if (!state.tracking) return;
            if (event.touches.length !== 1) {
                reset();
                return;
            }
            const touch = event.touches[0];
            state.dx = touch.clientX - state.x0;
            state.dy = touch.clientY - state.y0;
            if (!state.axis) state.axis = lockAxis(state.dx, state.dy);
            if (state.axis === 'v') {
                state.tracking = false;
                return;
            }
            if (state.axis === 'h') paint(state.dx);
        }

        function onEnd() {
            if (!state.tracking) return;
            if (state.axis === 'h' && shouldCommit({ dx: state.dx, dy: state.dy, width: w.innerWidth })) {
                state.tracking = false;
                leave();
                return;
            }
            reset();
        }

        // ---------- Avís de les primeres vegades (mòbil) ----------
        // Les tres primeres vegades que s'obre l'app al mòbil, a la portada, una mà blanca amb el dit estirat
        // llisca cap als costats amb «Remigi» a sota durant uns 3 s. No bloqueja res (pointer-events: none).
        // Només compta si s'ha arribat a mostrar.

        function readHintCount() {
            try {
                return Number(w.localStorage.getItem(HINT_KEY)) || 0;
            } catch (error) {
                return HINT_TIMES; // sense emmagatzematge no es pot comptar: millor no repetir-lo a cada obertura
            }
        }

        function saveHintCount(count) {
            try {
                w.localStorage.setItem(HINT_KEY, String(count));
            } catch (error) {
                // sense emmagatzematge
            }
        }

        function homeReady() {
            if (!onHome()) return false;
            // Sense l'avís de galetes a sobre (el primer dia): l'avís sortirà una altra vegada
            return !shown(doc.getElementById('cookie-consent'));
        }

        function showHint() {
            const hint = doc.createElement('div');
            hint.className = 'app-switch-hint';
            hint.setAttribute('role', 'status');
            hint.innerHTML = `<div class="app-switch-hint__stage" aria-hidden="true"><span class="app-switch-hint__arrow app-switch-hint__arrow--left">‹</span>${HAND}<span class="app-switch-hint__arrow app-switch-hint__arrow--right">›</span></div><strong>${TARGET_NAME}</strong><span class="app-switch-hint__sr">Llisca el dit cap a un costat per anar a ${TARGET_NAME}</span>`;
            doc.body.appendChild(hint);
            w.requestAnimationFrame(() => hint.classList.add('is-visible'));
            w.setTimeout(() => hint.classList.remove('is-visible'), HINT_MS - 300);
            w.setTimeout(() => hint.remove(), HINT_MS);
            return true;
        }

        function scheduleHint() {
            if (!isMobile() || !shouldShowHint(readHintCount())) return;
            const started = Date.now();
            const tick = () => {
                if (state.leaving || !isMobile()) return;
                if (homeReady()) {
                    // Mig segon després que la portada sigui a punt, perquè es vegi la pantalla abans
                    w.setTimeout(() => {
                        if (homeReady() && showHint()) saveHintCount(readHintCount() + 1);
                    }, 500);
                    return;
                }
                if (Date.now() - started < HINT_WAIT_MS) w.setTimeout(tick, 300);
            };
            tick();
        }

        function init() {
            doc.addEventListener('touchstart', onStart, { passive: true });
            doc.addEventListener('touchmove', onMove, { passive: true });
            doc.addEventListener('touchend', onEnd, { passive: true });
            doc.addEventListener('touchcancel', () => reset(), { passive: true });
            // En tornar enrere des de Remigi el navegador pot restaurar la pàgina tal com era: sense el panell
            w.addEventListener('pageshow', () => {
                state.leaving = false;
                if (state.panel) {
                    state.panel.classList.remove('is-leaving');
                    reset({ animate: false });
                }
            });
            scheduleHint();
        }

        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init, { once: true });
        else init();
        return { state };
    }

    return {
        VERSION,
        TARGET_URL,
        TARGET_NAME,
        START_ZONE,
        startAllowed,
        lockAxis,
        commitDistance,
        progress,
        shouldCommit,
        shouldShowHint,
        HINT_KEY,
        HINT_TIMES,
        start,
    };
});
