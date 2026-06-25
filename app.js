// El Tauler - Entrenador d'Escacs PWA
// app.js - Lògica principal de l'aplicació

const APP_VERSION = window.APP_VERSION || 'dev';
const STOCKFISH_URL = `stockfish.js?v=${APP_VERSION}`;
const DEBUG_ENRICHED_ANALYSIS = false;

const DEBUG_WEAK_AI = false;
const WEAK_AI_CONFIG = {
    // Corba específica per ROC baixos: per sota del terra real d'UCI_Elo el motor no baixa més,
    // així que aquesta capa força errors humans controlats sense sortir de les jugades legals MultiPV.
    rocPoints: [
        { roc: 200, offPathChance: 0.75, maxCandidates: 12, tolerableLossPawns: 5.8, cpLossWindow: 1150, minAltCpLoss: 45, temperature: 5.2, rankPower: 0.12 },
        { roc: 400, offPathChance: 0.60, maxCandidates: 12, tolerableLossPawns: 5.1, cpLossWindow: 950, minAltCpLoss: 35, temperature: 4.5, rankPower: 0.18 },
        { roc: 600, offPathChance: 0.43, maxCandidates: 10, tolerableLossPawns: 4.3, cpLossWindow: 760, minAltCpLoss: 25, temperature: 3.8, rankPower: 0.28 },
        { roc: 800, offPathChance: 0.28, maxCandidates: 8, tolerableLossPawns: 3.5, cpLossWindow: 560, minAltCpLoss: 15, temperature: 3.1, rankPower: 0.45 },
        { roc: 1000, offPathChance: 0.12, maxCandidates: 6, tolerableLossPawns: 2.8, cpLossWindow: 360, minAltCpLoss: 10, temperature: 2.5, rankPower: 0.75 }
    ],
    multipv: {
        below600: 12,
        below1000: 8,
        defaultLow: 6
    },
    queenHangLossPawns: 8.5,
    reasonableFallbackLossPawns: 6.2
};

let game = null;
let board = null;
let stockfish = null;
let stockfishReady = false;
let pendingEngineFirstMove = false;
let userELO = 50; 
let engineELO = 50;
let savedErrors = [];
let currentReview = [];
let reviewHistory = [];
let reviewChart = null;
let currentGameErrors = [];
let matchErrorQueue = [];
let currentMatchError = null;
let isMatchErrorReviewSession = false;
let reviewAutoCloseTimer = null;
let reviewOpenDelayTimer = null;
let openingBundleBoard = null;
let openingPracticeGame = null;
let openingPracticeUserColor = 'w';
let openingPracticeMoveCount = 0;
const OPENING_PRACTICE_MAX_PLIES = 20;
let openingPracticeEngineThinking = false;
let openingMaximPending = false;
let openingMaximRequestCounter = 0;
let lastOpeningMaxim = null;
let openingPracticeHintPending = false;
let openingPracticeBestMove = null;
// Variables per a la precisió del tauler d'obertures
let openingPracticeGoodMoves = 0;
let openingPracticeTotalMoves = 0;
let openingPracticeAnalysisPending = false;
let openingPracticeLastFen = null;
let openingPracticeLastMove = null;
let openingPracticePendingAnalysis = null; // Guardar anàlisi pendent mentre l'engine pensa
let openingPracticeHistory = []; // Historial de moviments per undo
// Variables per a l'anàlisi de precisió en dos passos (com partida lliure)
let openingAnalysisStep = 0; // 0 = no actiu, 1 = analitzant posició abans, 2 = analitzant posició després
let openingEvalBefore = null;
let openingEvalAfter = null;
let openingBestMove = null;
let openingTempScore = null;
let openingFenAfterMove = null; // FEN després del moviment per a la segona anàlisi
// Sistema de feedback instantani per obertures
let openingPreCalcBestMove = null; // Millor moviment pre-calculat per a la posició actual
let openingPreCalcPending = false; // Indica si estem calculant el millor moviment
let openingPreCalcFen = null; // FEN per al qual s'ha calculat el millor moviment
let openingLastMoveQuality = null; // Qualitat de l'últim moviment ('correct', 'good', 'incorrect')
// Sistema de callback per assegurar precisió abans del moviment de l'engine
let openingPendingUserMove = null; // {movePlayed, from, to} - Moviment de l'usuari pendent d'avaluar
let openingNeedsEngineMove = false; // Indica si cal demanar moviment de l'engine després de la precisió
// Sistema de tokens per evitar conflictes entre handlers de Stockfish
let stockfishRequestor = null; // Identificador de qui ha fet l'última petició

// Sistema d'obertures per calcular precisió
let openingTrie = null; // Estructura trie per cercar obertures
let openingCurrentSequence = []; // Seqüència actual de moviments (SAN)
let openingMatchedOpenings = []; // Obertures que coincideixen amb la seqüència actual
let openingSelectedOpening = null; // Obertura seleccionada (la més llarga que coincideix)
let openingNextMoveHint = null; // Següent moviment de l'obertura per a la pista
let openingPracticeLastDetected = null; // Últim tipus d'obertura detectat a la pràctica lliure (per avisar de canvis amb negres)
let openingPracticeOpponentMode = 'theory'; // 'theory' o 'adaptive'

// Pràctica d'errors d'obertura
let openingErrorPracticeActive = false;
// Lliçons guiades d'obertures ("Aprèn una obertura")
let openingLessonActive = false;
let openingLessonLine = [];
let openingLessonStep = 0;
let openingLessonInfo = null;
let openingLessonCurrentIndex = null;
let openingLessonUserColor = 'w';
let openingLessonLastDetected = null; // Últim tipus d'obertura detectat (per avisar de canvis amb negres)
let openingErrorCurrentPositions = []; // Posicions d'error disponibles
let openingErrorCurrentFen = null; // FEN actual que s'està practicant
let openingErrorBestMove = null; // Millor moviment esperat
let openingErrorColorFilter = null; // 'w' o 'b'
let openingErrorMoveFilter = null; // Número de moviment
let openingErrorMovesRemaining = 2; // Jugades restants per completar
let openingErrorCurrentIndex = -1; // Índex de la posició actual

let gameHistory = [];
let historyBoard = null;
let historyReplay = null;
let lastBundleOpenAIHint = null
let tvBoard = null;
let tvReplay = null;
let tvJeroglyphicsActive = false;
let tvJeroglyphicsAnalyzing = false;
let tvJeroglyphicsHinting = false;
let tvJeroglyphicsTopMoves = [];
let tvJeroglyphicsPvMoves = {};
let tvJeroglyphicsTargetIndex = null;
let tvJeroglyphicsActualMove = null;
let tvJeroglyphicsResumePlayback = false;
let tvJeroglyphicsSolved = false;
let tvJeroglyphicsIncorrect = false;

// Sistema d'IA Adaptativa
let recentGames = []; 
let aiDifficulty = 8; 
const ADAPTIVE_CONFIG = {
    MIN_LEVEL: 50,
    MAX_LEVEL: 3000,
    DEFAULT_LEVEL: 75,
    WIN_PRECISION_HIGH: 80,
    WIN_PRECISION_MID: 65,
    LOSS_PRECISION_HIGH: 60,
    LOSS_PRECISION_MID: 45,
    BOOST_HIGH: 50,
    BOOST_MID: 35,
    BOOST_LOW: 15,
    PENALTY_SOFT: -15,
    PENALTY_MID: -30,
    PENALTY_STRONG: -50,
    DRAW_BONUS: 10,
    STREAK_WIN_BONUS: 30,
    STREAK_LOSS_PENALTY: -25,
    FLOW_WINDOW_MIN: 5,
    FLOW_SAMPLE_SIZE: 10,
    FLOW_WINRATE_HIGH: 0.6,
    FLOW_WINRATE_LOW: 0.4,
    FLOW_DELTA: 30,
    MAX_DELTA: 60
};
const CONTINUOUS_ADJUST_CONFIG = {
    WINDOW_SIZE: 3,
    WIN_THRESHOLD: 2,
    LOSS_THRESHOLD: 2,
    WIN_ELO: 50,
    LOSS_ELO: -50,
    MAX_CYCLE_DELTA: 100,
    QUALITY_HIGH: 0.7,
    ERROR_PRECISION_MAX: 60,
    ERROR_CPLOSS_MIN: 140,
    ERROR_BLUNDERS_MIN: 2,
    LOSS_STREAK_TRIGGER: 3,
    LOSS_STREAK_DELTA: -70
};
const ELO_MILESTONES = [800, 1000, 1200, 1400, 1600, 1800, 2000];
const ERROR_WINDOW_N = 30;
const TH_ERR = 80;
const ELO_MIN = 200;
const ELO_MAX = 2000;
const CALIBRATION_GAME_COUNT = 5;
// El calibratge és una CERCA ADAPTATIVA del nivell del jugador, no una escala fixa que sempre
// puja. Es parteix d'un ROC inicial i, després de cada partida, el rival s'adapta al resultat:
// si el jugador guanya, puja; si perd, baixa; amb passos decreixents per convergir cap al seu
// nivell real en 5 partides. La força de cada rival es deriva del seu ROC amb el MATEIX model
// en dues etapes que el joc lliure (rocToEngineElo + eloToSearchDepth + selecció humana de
// moviments), de manera que el nivell estimat reflecteix el que el jugador trobarà realment.
const CALIBRATION_START_ROC = 300;            // punt de partida de la cerca (partida 1)
const CALIBRATION_STEPS = [220, 160, 110, 80]; // passos decreixents (transicions partida 1→2…4→5)
const CALIBRATION_ROCS = [200, 350, 500, 650, 800]; // referència/llindar de compatibilitat
const CALIBRATION_ROC_MIN = 200;
const CALIBRATION_ROC_MAX = 2000;
const LEAGUE_UNLOCK_MIN_GAMES = CALIBRATION_GAME_COUNT + 1;
// Rang REAL de UCI_Elo que accepta el binari de Stockfish inclòs. El build
// (niklasf/stockfish.js, fork ddugovic) té un terra al voltant de 1350: per sota,
// Stockfish retalla el valor silenciosament i juga sempre a la mateixa força. Aquests
// valors es detecten dinàmicament en rebre la llista d'opcions UCI ('option name UCI_Elo
// ... min X max Y'); els valors per defecte són només un fallback robust.
let engineEloMin = 1350;
let engineEloMax = 2850;
let engineRangeDetected = false;
let recentErrors = [];
let currentElo = clampEngineElo(ADAPTIVE_CONFIG.DEFAULT_LEVEL);
aiDifficulty = levelToDifficulty(currentElo);
let consecutiveWins = 0;
let consecutiveLosses = 0;
let freeAdjustmentWindow = [];
let adjustmentLog = [];
let adaptationReport = [];
let currentGameEngineDepth = null;
let currentGameActiveStrengthElo = null;
let lastAdaptationGameRecord = null;
let lastAdjustmentQualityAvg = null;
let freeLossStreak = 0;
let calibrationRocFloor = null;
let unlockedEloMilestones = [];
let isCalibrating = true;
let calibrationGames = [];
let calibrationProfile = null;
let calibratgeComplet = false;
let isCalibrationGame = false;
let currentCalibrationOpponentRoc = null;
let isEngineThinking = false;
let engineMoveCandidates = [];
let openingEngineMoveCandidates = [];
let lastReviewSnapshot = null;
// Rellotge de partida (mode contrarellotge)
const TIME_CONTROLS = [
    { id: 'none', label: 'Sense rellotge' },
    { id: '3+2', label: 'Blitz 3+2', base: 180, inc: 2 },
    { id: '5+0', label: 'Blitz 5+0', base: 300, inc: 0 },
    { id: '10+0', label: 'Ràpid 10+0', base: 600, inc: 0 },
    { id: '15+10', label: 'Clàssic 15+10', base: 900, inc: 10 }
];
const TIME_CONTROL_KEY = 'chess_timeControl';
// Ritme escollit per a la propera partida lliure/assistida. Comença sempre "sense rellotge";
// es tria a la pantalla de joc abans de cada nova partida. La lliga té el seu propi ritme
// fixat (currentLeague.timeControl), independent d'aquest.
let pendingFreeTimeControl = 'none';
let gameClock = { enabled: false, white: 0, black: 0, inc: 0, active: null, interval: null, lastTs: 0 };
let calibrationResultsChart = null;
let currentGameStartTs = null;

let lastPosition = null; 
let blunderMode = false;
let currentBundleFen = null;
let currentBundleSeverity = null;
let currentBundleSource = null;
let matchErrorReturnReviewSnapshot = null;
let playerColor = 'w';
let isRandomBundleSession = false;
// Repetició espaiada (SRS) i repte diari
let isSrsReviewSession = false;
let isDailyPuzzleSession = false;
let dailyPuzzle = { date: null, solved: false, streak: 0, best: 0, fen: null, lastSolved: null };
// Progrés d'aprenentatge d'obertures (ids ECO completats) i tàctiques resoltes
let completedOpenings = [];
let tacticsStats = { solved: 0, attempts: 0, best: 0, streak: 0 };
let isTacticsSession = false;

// Entrenador invisible: domini temàtic, recomanacions i estadístiques de creixement
const TARGET_SUCCESS_RATE = 0.72;
const THEME_MASTERY_KEY = 'chess_themeMastery';
const GROWTH_TASK_HISTORY_KEY = 'eltauler_growth_task_history';
const GROWTH_STATS_KEY = 'chess_growthStats';
const THEME_MASTERY_DEFAULTS = {
    fork: 0.0,
    pin: 0.0,
    skewer: 0.0,
    king_attack: 0.0,
    material: 0.0,
    center: 0.0,
    opening: 0.0,
    endgame: 0.0,
    general: 0.0
};
let themeMastery = { ...THEME_MASTERY_DEFAULTS };
let growthStats = {
    tasksRecommended: 0,
    tasksStarted: 0,
    tasksCompleted: 0,
    personalErrorsConverted: 0,
    srsCompleted: 0,
    weaknessSessionsCompleted: 0,
    openingDrillsCompleted: 0,
    mateDrillsCompleted: 0,
    lastRecommendedAt: null
};
let currentGrowthTask = null;
// Cau en memòria de respostes OpenAI (per FEN+tipus) per estalviar crides
const openaiResponseCache = {};
let bundleSequenceStep = 1;
let bundleSequenceStartFen = null;
let bundleStepStartFen = null;
let bundleStrictPvLine = [];
let bundleStrictPvDepth = 0;
let bundleFixedSequence = null;
let bundleAutoReplyPending = false;
let bundleOpenAIHintPending = false;
const LEAGUE_QUOTES = [
    "“El millor moment per jugar és ara.”",
    "“La sort somriu als valents.”",
    "“El tauler és teu, confia en el teu pla.”",
    "“Cada partida és una oportunitat de créixer.”",
    "“Aprofita la iniciativa!”",
    "“La preparació és mitja victòria.”",
    "“El rival també dubta; lidera tu.”",
    "“Juga amb calma, acaba amb força.”"
];

let totalPlayerMoves = 0;
let goodMoves = 0;
let pendingMoveEvaluation = false;
let totalEngineMoves = 0;
let goodEngineMoves = 0;

// Controls tàctils (tap-to-move)
let tapSelectedSquare = null;
let tapMoveEnabled = false;
let lastTapEventTs = 0;
let tvTapSelectedSquare = null;
let tvTapMoveEnabled = false;
let tvLastTapEventTs = 0;

// Controls tàctils per al tauler d'obertures
let openingTapSelectedSquare = null;
let openingTapMoveEnabled = false;
let openingLastTapEventTs = 0;

let deviceType = 'desktop';

function detectDeviceType() {
    const ua = (navigator && navigator.userAgent ? navigator.userAgent : '').toLowerCase();
    const minSide = Math.min(window.innerWidth || 0, window.innerHeight || 0);
    const touch = isTouchDevice();

    const isTabletUA = /ipad|tablet|kindle|silk|playbook/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua));
    const isMobileUA = /mobi|iphone|ipod|android.*mobile|windows phone/.test(ua);

    if (isTabletUA || (touch && minSide >= 600 && minSide <= 1100)) return 'tablet';
    if (isMobileUA || (touch && minSide < 600)) return 'mobile';
    return 'desktop';
}

function applyDeviceType(type) {
    deviceType = type;
    document.body.dataset.device = type;
    document.body.classList.remove('device-mobile', 'device-tablet', 'device-desktop');
    document.body.classList.add(`device-${type}`);
}

function updateDeviceType() {
    const detected = detectDeviceType();
    if (detected !== deviceType) {
        applyDeviceType(detected);
        resizeBoardToViewport();
        updateTvBoardInteractivity();        
    } else if (!document.body.classList.contains(`device-${detected}`)) {
        applyDeviceType(detected);
        updateTvBoardInteractivity();
    }
}

function isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
}

// Control del tauler (Tocar / Arrossegar)
const CONTROL_MODE_KEY = 'eltauler_control_mode';
let controlMode = null;

const FONT_SIZE_KEY = 'eltauler_font_size';
function loadFontSize() {
    try {
        const v = localStorage.getItem(FONT_SIZE_KEY);
        if (!v) return 100;
        const legacy = { small: 85, medium: 100, large: 118, xlarge: 135 };
        if (legacy[v]) return legacy[v];
        const n = parseInt(v, 10);
        return (n >= 70 && n <= 150) ? n : 100;
    } catch (e) { return 100; }
}
function applyFontSize(pct) {
    document.documentElement.style.setProperty('--font-scale', pct / 100);
    const label = document.getElementById('font-size-value');
    if (label) label.textContent = pct + '%';
    const slider = document.getElementById('font-size-range');
    if (slider && +slider.value !== +pct) slider.value = pct;
    try { localStorage.setItem(FONT_SIZE_KEY, pct); } catch (e) {}
    // El canvi de mida de lletra pot alterar l'amplada disponible: re-ajustar taulers
    // perquè tot segueixi visible (sobretot el tauler de l'historial).
    if (typeof scheduleBoardResize === 'function') scheduleBoardResize();
}

// Navigation history management for mobile back gesture
let navStack = [];
function getCurrentScreen() {
    const screens = ['game-screen', 'stats-screen', 'history-screen', 'league-screen', 'catalans-screen', 'opening-screen', 'calibration-result-screen', 'settings-screen'];
    for (const s of screens) {
        const el = document.getElementById(s);
        if (el && el.style.display !== 'none' && (s !== 'game-screen' || el.classList.contains('active'))) return s;
    }
    return 'start-screen';
}
function navPush(screenId) {
    navStack.push(screenId);
    history.pushState({ screen: screenId }, '');
}
function navGoBack() {
    const current = getCurrentScreen();
    if (current === 'start-screen') return;
    if (current === 'game-screen') {
        $('#game-screen').removeClass('active').hide();
        $('#start-screen').show();
    } else if (current === 'stats-screen') {
        $('#stats-screen').hide();
        $('#start-screen').show();
    } else if (current === 'history-screen') {
        if (typeof stopHistoryPlayback === 'function') stopHistoryPlayback();
        $('#history-screen').hide();
        $('#start-screen').show();
    } else if (current === 'league-screen') {
        $('#league-screen').hide();
        $('#start-screen').show();
    } else if (current === 'catalans-screen') {
        if (window.CatalansMode && typeof window.CatalansMode.close === 'function') window.CatalansMode.close();
        else $('#catalans-screen').hide();
        $('#start-screen').show();
    } else if (current === 'opening-screen') {
        $('#opening-screen').hide();
        $('#start-screen').show();
    } else if (current === 'settings-screen') {
        $('#settings-screen').hide();
        $('#start-screen').show();
    } else if (current === 'calibration-result-screen') {
        $('#calibration-result-screen').hide();
        $('#start-screen').show();
    }
    navStack.pop();
}
window.addEventListener('popstate', function(e) {
    const current = getCurrentScreen();
    if (current === 'start-screen') {
        history.pushState({ screen: 'start-screen' }, '');
        return;
    }
    navGoBack();
});

/* ============ NOTIFICACIONS INTERNES (toast + confirm) ============ */
// Mostra un missatge intern de l'app (substitueix les finestres del sistema).
function showToast(message, type = 'info', duration = null) {
    const text = (message === undefined || message === null) ? '' : String(message);
    if (!text) return;
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    container.appendChild(toast);
    // Durada proporcional a la longitud del missatge; els errors/avisos es queden més estona
    const cap = (type === 'error' || type === 'warn') ? 10000 : 7000;
    const ms = duration || Math.max(2500, Math.min(cap, 1500 + text.length * 55));
    requestAnimationFrame(() => toast.classList.add('show'));
    const dismiss = () => {
        toast.classList.remove('show');
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    };
    toast.addEventListener('click', dismiss);
    setTimeout(dismiss, ms);
}

// Internalitza qualsevol alert() del sistema com a toast de l'app.
window.alert = function(message) { showToast(message, 'info'); };

// En mòbil, el "click" sintètic que segueix un toc es pot perdre (els gestors
// tàctils del tauler el suprimeixen) o duplicar. Patró robust: gestionem el toc
// amb 'touchend' i cancel·lem el click sintètic posterior amb preventDefault;
// 'click' queda per a ratolí/teclat. Un segell de temps evita que el click
// sintètic torni a disparar l'acció just després d'un toc.
function onModalAction(target, handler) {
    let touchHandledAt = 0;
    $(target)
        .off('click touchend pointerup')
        .on('touchend', function (e) {
            e.preventDefault();
            e.stopPropagation();
            touchHandledAt = Date.now();
            handler.call(this, e);
        })
        .on('click', function (e) {
            // Ignora el click sintètic si el toc ja ha gestionat l'acció.
            if (Date.now() - touchHandledAt < 700) return;
            e.preventDefault();
            e.stopPropagation();
            handler.call(this, e);
        });
}

// Executa feina pesada (persistència, generació d'informes, redibuix de gràfics)
// DESPRÉS que el navegador hagi pogut pintar un canvi visual immediat —un
// moviment al tauler, el tancament d'un modal—, perquè aquests no es percebin
// congelats mentre es processa. El doble requestAnimationFrame garanteix que el
// fotograma amb el canvi visual s'ha pintat abans d'executar la feina.
function runAfterPaint(fn) {
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(() => fn()));
    } else {
        setTimeout(fn, 0);
    }
}

// Confirmació interna (asíncrona, amb callbacks) que substitueix confirm().
function showAppConfirm(message, onConfirm, opts = {}) {
    const modal = document.getElementById('app-confirm-modal');
    if (!modal) {
        // Fallback segur si el modal no existeix
        if (typeof onConfirm === 'function') onConfirm();
        return;
    }
    document.getElementById('app-confirm-title').textContent = opts.title || 'Confirmar';
    document.getElementById('app-confirm-message').textContent = message || '';
    const yesBtn = $('#app-confirm-yes');
    const noBtn = $('#app-confirm-no');
    yesBtn.text(opts.confirmText || "D'acord");
    noBtn.text(opts.cancelText || 'Cancel·la');
    const close = () => { modal.style.display = 'none'; yesBtn.off('click touchend pointerup'); noBtn.off('click touchend pointerup'); };
    onModalAction(yesBtn, () => { close(); if (typeof onConfirm === 'function') onConfirm(); });
    onModalAction(noBtn, () => { close(); if (typeof opts.onCancel === 'function') opts.onCancel(); });
    modal.style.display = 'flex';
}

// Revisió d'errors (Bundle): validar només la millor jugada o les 2 millors
const BUNDLE_ACCEPT_MODE_KEY = 'eltauler_bundle_accept_mode';
let bundleAcceptMode = 'top1'; // 'top1' o 'top2'
const bundleAnswerCache = new Map();

const OPENAI_MODEL_ID = 'gpt-5-mini';
let openaiApiKey = null;

const EPAPER_MODE_KEY = 'eltauler_epaper_mode';
let epaperEnabled = false;
const TV_JEROGLYPHICS_KEY = 'eltauler_tv_jeroglyphics';
const TV_JEROGLYPHICS_START = 15;
const TV_JEROGLYPHICS_INTERVAL = 20;
const TV_JEROGLYPHICS_END_BUFFER = 5;
let tvJeroglyphicsEnabled = false;
const BACKUP_DIR_DB = 'eltauler_backup_dir_db';
const BACKUP_DIR_STORE = 'handles';
const BACKUP_DIR_KEY = 'backupDir';
let backupDirHandle = null;

function loadBundleAcceptMode() {
    try {
        const v = localStorage.getItem(BUNDLE_ACCEPT_MODE_KEY);
        if (v === 'top1' || v === 'top2') return v;
        if (v === 'any') return 'top1';
    } catch (e) {}
    return 'top1';
}

function saveBundleAcceptMode(mode) {
    bundleAcceptMode = (mode === 'top2') ? 'top2' : 'top1';
    try { localStorage.setItem(BUNDLE_ACCEPT_MODE_KEY, bundleAcceptMode); } catch (e) {}
    const sel = document.getElementById('bundle-accept-select');
    if (sel) sel.value = bundleAcceptMode;
}

function loadEpaperPreference() {
    try { return localStorage.getItem(EPAPER_MODE_KEY) === 'on'; }
    catch (e) { return false; }
}

function saveEpaperPreference(enabled) {
    try { localStorage.setItem(EPAPER_MODE_KEY, enabled ? 'on' : 'off'); } catch (e) {}
}

function applyEpaperMode(enabled, options = {}) {
    epaperEnabled = !!enabled;
    document.body.classList.toggle('epaper-mode', epaperEnabled);
    const toggle = document.getElementById('epaper-toggle');
    if (toggle) toggle.checked = epaperEnabled;
    // ePaper i mode dia són incompatibles: activar ePaper desactiva el mode dia
    if (epaperEnabled && dayModeEnabled) applyDayMode(false);
    if (!options.skipSave) {
        saveEpaperPreference(epaperEnabled);
    }
    if (eloChart) updateEloChart();
    if (reviewChart) updateReviewChart();
}

const DAY_MODE_KEY = 'eltauler_day_mode';
let dayModeEnabled = false;

function loadDayModePreference() {
    try { return localStorage.getItem(DAY_MODE_KEY) === 'on'; }
    catch (e) { return false; }
}

function applyDayMode(enabled, options = {}) {
    dayModeEnabled = !!enabled;
    document.body.classList.toggle('day-mode', dayModeEnabled);
    const toggle = document.getElementById('daymode-toggle');
    if (toggle) toggle.checked = dayModeEnabled;
    // Mode dia i ePaper són incompatibles
    if (dayModeEnabled && epaperEnabled) applyEpaperMode(false);
    if (!options.skipSave) {
        try { localStorage.setItem(DAY_MODE_KEY, dayModeEnabled ? 'on' : 'off'); } catch (e) {}
    }
    if (eloChart) updateEloChart();
    if (reviewChart) updateReviewChart();
}

/* ===========================================================================
   Temes del tauler i de les peces (color/material) + mode "Sempre tinc sort".
   Els temes s'apliquen amb una classe a <body> (definides al CSS) i afecten
   tots els taulers alhora. La preferència de l'usuari es desa a localStorage.
   El mode "sort" no sobreescriu la preferència desada: aplica un tema a l'atzar
   de manera transitòria a cada partida o problema.
   =========================================================================== */
const BOARD_THEME_KEY = 'eltauler_board_theme';
const PIECE_THEME_KEY = 'eltauler_piece_theme';
const LUCKY_MODE_KEY  = 'eltauler_lucky_mode';

const BOARD_THEMES = ['classic', 'green', 'blue', 'gray', 'walnut', 'purple', 'coral', 'night'];
const PIECE_THEMES = ['classic', 'gold', 'wood', 'marble', 'ice', 'neon'];

let boardTheme = 'classic';
let pieceTheme = 'classic';
let luckyModeEnabled = false;

function loadBoardTheme() {
    try {
        const v = localStorage.getItem(BOARD_THEME_KEY);
        return BOARD_THEMES.includes(v) ? v : 'classic';
    } catch (e) { return 'classic'; }
}

function loadPieceTheme() {
    try {
        const v = localStorage.getItem(PIECE_THEME_KEY);
        return PIECE_THEMES.includes(v) ? v : 'classic';
    } catch (e) { return 'classic'; }
}

function loadLuckyMode() {
    try { return localStorage.getItem(LUCKY_MODE_KEY) === 'on'; }
    catch (e) { return false; }
}

function applyBoardTheme(theme, options = {}) {
    if (!BOARD_THEMES.includes(theme)) theme = 'classic';
    BOARD_THEMES.forEach(t => document.body.classList.remove('board-theme-' + t));
    if (theme !== 'classic') document.body.classList.add('board-theme-' + theme);
    if (!options.transient) {
        boardTheme = theme;
        const sel = document.getElementById('board-theme-select');
        if (sel) sel.value = theme;
        if (!options.skipSave) {
            try { localStorage.setItem(BOARD_THEME_KEY, theme); } catch (e) {}
        }
    }
}

function applyPieceTheme(theme, options = {}) {
    if (!PIECE_THEMES.includes(theme)) theme = 'classic';
    PIECE_THEMES.forEach(t => document.body.classList.remove('piece-theme-' + t));
    if (theme !== 'classic') document.body.classList.add('piece-theme-' + theme);
    if (!options.transient) {
        pieceTheme = theme;
        const sel = document.getElementById('piece-theme-select');
        if (sel) sel.value = theme;
        if (!options.skipSave) {
            try { localStorage.setItem(PIECE_THEME_KEY, theme); } catch (e) {}
        }
    }
}

function applyLuckyMode(enabled, options = {}) {
    luckyModeEnabled = !!enabled;
    const toggle = document.getElementById('lucky-toggle');
    if (toggle) toggle.checked = luckyModeEnabled;
    if (!options.skipSave) {
        try { localStorage.setItem(LUCKY_MODE_KEY, luckyModeEnabled ? 'on' : 'off'); } catch (e) {}
    }
    // En desactivar la sort, recupera el tema escollit per l'usuari.
    if (!luckyModeEnabled) {
        applyBoardTheme(boardTheme, { skipSave: true });
        applyPieceTheme(pieceTheme, { skipSave: true });
    } else if (!options.skipRoll) {
        rollLuckyThemes();
    }
}

// Aplica un tauler i unes peces a l'atzar sense tocar la preferència desada.
function rollLuckyThemes() {
    const rndBoard = BOARD_THEMES[Math.floor(Math.random() * BOARD_THEMES.length)];
    const rndPiece = PIECE_THEMES[Math.floor(Math.random() * PIECE_THEMES.length)];
    applyBoardTheme(rndBoard, { transient: true });
    applyPieceTheme(rndPiece, { transient: true });
}

// A cada partida o problema: si el mode "sort" està actiu, estrena temes a l'atzar.
function maybeRollLuckyThemes() {
    if (luckyModeEnabled) rollLuckyThemes();
}

function loadTvJeroglyphicsPreference() {
    try { return localStorage.getItem(TV_JEROGLYPHICS_KEY) === 'on'; }
    catch (e) { return false; }
}

function saveTvJeroglyphicsPreference(enabled) {
    try { localStorage.setItem(TV_JEROGLYPHICS_KEY, enabled ? 'on' : 'off'); } catch (e) {}
}

function openBackupDirDb() {
    return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            reject(new Error('IndexedDB no disponible'));
            return;
        }
        const request = indexedDB.open(BACKUP_DIR_DB, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(BACKUP_DIR_STORE)) {
                db.createObjectStore(BACKUP_DIR_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function loadBackupDirHandle() {
    try {
        const db = await openBackupDirDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(BACKUP_DIR_STORE, 'readonly');
            const store = tx.objectStore(BACKUP_DIR_STORE);
            const req = store.get(BACKUP_DIR_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.warn('No es pot carregar la carpeta de backups', e);
        return null;
    }
}

async function saveBackupDirHandle(handle) {
    try {
        const db = await openBackupDirDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(BACKUP_DIR_STORE, 'readwrite');
            const store = tx.objectStore(BACKUP_DIR_STORE);
            const req = store.put(handle, BACKUP_DIR_KEY);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.warn('No es pot guardar la carpeta de backups', e);
    }
}

function supportsDirectoryPicker() {
    return 'showDirectoryPicker' in window;
}

function supportsFilePicker() {
    return 'showOpenFilePicker' in window;
}

async function verifyHandlePermission(handle, mode = 'readwrite') {
    if (!handle || !handle.queryPermission) return 'granted';
    let status = await handle.queryPermission({ mode });
    if (status === 'prompt' && handle.requestPermission) {
        status = await handle.requestPermission({ mode });
    }
    return status;
}

async function selectBackupDirHandle(mode = 'readwrite') {
    if (!supportsDirectoryPicker()) return null;
    try {
        const handle = await window.showDirectoryPicker({ id: 'eltauler-backups', mode });
        backupDirHandle = handle;
        await saveBackupDirHandle(handle);
        if (navigator.storage && navigator.storage.persist) {
            await navigator.storage.persist();
        }
        return handle;
    } catch (e) {
        console.log('Selecció de carpeta cancel·lada');
        return null;
    }
}

async function ensureBackupDirHandle({ prompt = false, mode = 'readwrite', force = false } = {}) {
    if (!force && !backupDirHandle) {
        backupDirHandle = await loadBackupDirHandle();
    }
    if (!force && backupDirHandle) {
        const status = await verifyHandlePermission(backupDirHandle, mode);
        if (status === 'granted') return backupDirHandle;
    }
    if (!prompt || !supportsDirectoryPicker()) return null;
    return selectBackupDirHandle(mode);
}

async function writeBackupToDirectory(data, filename, { prompt = true, forceDirectorySelection = false } = {}) {
    const handle = await ensureBackupDirHandle({
        prompt,
        mode: 'readwrite',
        force: forceDirectorySelection
    });
    if (!handle) return null;
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    return fileHandle;
}

// No filtrem el selector d'importació per MIME/extensió: alguns navegadors
// (sobretot mòbil/Android) no classifiquen els backups .json com application/json
// i els deixen grisos. Mostrem tots els fitxers i validem després a JS.
const BACKUP_FILE_ACCEPT = '';

async function importBackupFromPicker() {
    if (!supportsFilePicker()) return null;
    const handle = await ensureBackupDirHandle({ prompt: false, mode: 'read' });
    try {
        const pickerOptions = { multiple: false, excludeAcceptAllOption: false };
        if (handle) pickerOptions.startIn = handle;
        const [fileHandle] = await window.showOpenFilePicker(pickerOptions);
        return await fileHandle.getFile();
    } catch (e) {
        console.log('Importació cancel·lada');
        return null;
    }
}

function buildBackupData({ includeGameHistory = false } = {}) {
    const base = {
        elo: userELO, bundles: savedErrors, streak: currentStreak, lastPracticeDate: lastPracticeDate,
        totalStars: totalStars, unlockedBadges: unlockedBadges, todayMissions: todayMissions, missionsDate: missionsDate,
        sessionStats: sessionStats, eloHistory: eloHistory, totalGamesPlayed: totalGamesPlayed,
        totalWins: totalWins, maxStreak: maxStreak,
        aiDifficulty: aiDifficulty, currentElo: currentElo, recentGames: recentGames, consecutiveWins: consecutiveWins,
        consecutiveLosses: consecutiveLosses, currentLeague: currentLeague, leagueActiveMatch: leagueActiveMatch,
        reviewHistory: reviewHistory, date: new Date().toLocaleDateString(),
        isCalibrating: isCalibrating,
        calibrationGames: calibrationGames,
        calibrationProfile: calibrationProfile,
        calibratgeComplet: calibratgeComplet,
        freeAdjustmentWindow: freeAdjustmentWindow,
        adjustmentLog: adjustmentLog,
        adaptationReport: adaptationReport,
        freeLossStreak: freeLossStreak,
        calibrationRocFloor: calibrationRocFloor,
        eloMilestones: unlockedEloMilestones,
        lastAdjustmentQualityAvg: lastAdjustmentQualityAvg,
        completedOpenings: completedOpenings,
        tacticsStats: tacticsStats,
        hieroglyphicStats: hieroglyphicStats
    };
    if (includeGameHistory) base.gameHistory = gameHistory;
    return base;
}


function normalizeAdaptationReport(report) {
    return (Array.isArray(report) ? report : [])
        .filter(entry => entry && typeof entry === 'object')
        .map((entry, index) => Object.assign({ id: entry.id || `adapt_legacy_${index}` }, entry));
}

function getAdaptationWinRate(windowSize, extraResultScore = null) {
    const historical = adaptationReport
        .filter(entry => typeof entry.resultScore === 'number')
        .map(entry => entry.resultScore);
    if (typeof extraResultScore === 'number') historical.push(extraResultScore);
    const slice = historical.slice(-windowSize);
    if (!slice.length) return null;
    return Math.round((slice.reduce((sum, score) => sum + score, 0) / slice.length) * 1000) / 1000;
}

function getLastAdjustmentSummary(startIndex) {
    const entries = adjustmentLog.slice(Math.max(0, startIndex || 0));
    if (!entries.length) {
        return { appliedDelta: 0, reason: 'Sense ajust adaptatiu', adjustments: [] };
    }
    const appliedDelta = entries.reduce((sum, item) => sum + (typeof item.delta === 'number' ? item.delta : 0), 0);
    const reason = entries.map(item => item.reason).filter(Boolean).join(' · ') || 'Ajust adaptatiu';
    return { appliedDelta, reason, adjustments: entries };
}

function buildAdaptationGameRecord({
    timestamp,
    mode,
    color,
    resultLabel,
    resultScore,
    playerEloBefore,
    playerEloAfter,
    currentEloBefore,
    currentEloAfter,
    engineRocOrElo,
    appliedDelta,
    adjustmentReason,
    precision,
    avgCpLoss,
    counts,
    moveCount,
    durationSeconds,
    freeLossStreakValue,
    calibrationGameNumber,
    engineDepth,
    activeStrengthElo,
    adjustments
}) {
    return {
        id: `adapt_${Date.parse(timestamp) || Date.now()}_${adaptationReport.length + 1}`,
        timestamp,
        mode,
        playerColor: color,
        result: resultLabel,
        resultScore,
        playerEloBefore,
        playerEloAfter,
        engineRocOrElo,
        currentEloBefore,
        currentEloAfter,
        appliedDelta,
        adjustmentReason,
        precision,
        avgCpLoss,
        blunders: (counts || {}).blunder || 0,
        mistakes: (counts || {}).mistake || 0,
        inaccuracies: (counts || {}).inaccuracy || 0,
        moveCount,
        durationSeconds,
        winRateLast5: getAdaptationWinRate(5, resultScore),
        winRateLast10: getAdaptationWinRate(10, resultScore),
        winRateLast20: getAdaptationWinRate(20, resultScore),
        freeLossStreak: freeLossStreakValue,
        calibrationGameNumber: calibrationGameNumber || null,
        engineDepth: engineDepth || null,
        activeStrengthElo: activeStrengthElo || engineRocOrElo || null,
        adjustments: adjustments || []
    };
}

function recordAdaptationGame(entry) {
    if (!entry || blunderMode) return null;
    adaptationReport.push(entry);
    lastAdaptationGameRecord = entry;
    return entry;
}

function diagnoseAdaptation(reportGames = adaptationReport, adjustments = adjustmentLog) {
    const diagnostics = [];
    const games = Array.isArray(reportGames) ? reportGames : [];
    const recent10 = games.slice(-10);
    const winRateLast10 = recent10.length
        ? recent10.reduce((sum, game) => sum + (typeof game.resultScore === 'number' ? game.resultScore : 0), 0) / recent10.length
        : null;

    if (winRateLast10 !== null && winRateLast10 > 0.65) diagnostics.push({ code: 'too_easy', label: 'massa fàcil', severity: 'warning', detail: `Win-rate últimes ${recent10.length}: ${Math.round(winRateLast10 * 100)}%.` });
    if (winRateLast10 !== null && winRateLast10 < 0.35) diagnostics.push({ code: 'too_hard', label: 'massa difícil', severity: 'warning', detail: `Win-rate últimes ${recent10.length}: ${Math.round(winRateLast10 * 100)}%.` });

    const adjustmentDirections = (Array.isArray(adjustments) ? adjustments : [])
        .filter(item => typeof item.delta === 'number' && item.delta !== 0)
        .map(item => Math.sign(item.delta));
    let sameDirectionCount = 1;
    for (let i = adjustmentDirections.length - 1; i > 0; i--) {
        if (adjustmentDirections[i] !== adjustmentDirections[i - 1]) break;
        sameDirectionCount++;
    }
    if (sameDirectionCount > 3) diagnostics.push({ code: 'same_direction_streak', label: 'possible oscil·lació', severity: 'warning', detail: `${sameDirectionCount} ajustos seguits en la mateixa direcció.` });

    if (games.length >= 6) {
        const window = games.slice(-10);
        const half = Math.floor(window.length / 2);
        const first = window.slice(0, half);
        const second = window.slice(half);
        const avg = list => list.reduce((sum, game) => sum + (typeof game.precision === 'number' ? game.precision : 0), 0) / (list.length || 1);
        const precisionImproves = second.length && avg(second) > avg(first) + 2;
        if (precisionImproves && winRateLast10 !== null && winRateLast10 >= 0.40 && winRateLast10 <= 0.60) {
            diagnostics.push({ code: 'good_adaptation', label: 'adaptació bona', severity: 'success', detail: 'La precisió mitjana puja i el win-rate es manté entre el 40% i el 60%.' });
        }
    }

    const recentAdjustments = (Array.isArray(adjustments) ? adjustments : []).filter(item => typeof item.delta === 'number').slice(-10);
    const largeAdjustments = recentAdjustments.filter(item => Math.abs(item.delta) >= 50);
    const avgAbsDelta = recentAdjustments.length
        ? recentAdjustments.reduce((sum, item) => sum + Math.abs(item.delta), 0) / recentAdjustments.length
        : 0;
    if (largeAdjustments.length >= 4 || (recentAdjustments.length >= 5 && avgAbsDelta > 45)) {
        diagnostics.push({ code: 'too_aggressive', label: 'ajust massa agressiu', severity: 'warning', detail: 'Els deltes recents són grans i freqüents.' });
    }

    if (!diagnostics.length) diagnostics.push({ code: 'no_flags', label: 'sense alertes', severity: 'info', detail: 'No hi ha prou senyals problemàtics en les dades locals actuals.' });
    return diagnostics;
}

function buildAdaptationReport() {
    const games = normalizeAdaptationReport(adaptationReport);
    const completedGames = games.length;
    const avg = (field) => completedGames
        ? Math.round((games.reduce((sum, game) => sum + (typeof game[field] === 'number' ? game[field] : 0), 0) / completedGames) * 100) / 100
        : 0;
    const latest = games[games.length - 1] || null;
    const wins = games.filter(game => game.resultScore === 1).length;
    const losses = games.filter(game => game.resultScore === 0).length;
    const draws = games.filter(game => game.resultScore === 0.5).length;
    return {
        metadata: {
            appName: 'El Tauler',
            appVersion: APP_VERSION,
            generatedAt: new Date().toISOString(),
            source: 'localStorage',
            privacy: 'Informe generat localment; no s’envia cap dada a cap servidor.'
        },
        summary: {
            completedGames,
            wins,
            losses,
            draws,
            winRate: completedGames ? Math.round(((wins + draws * 0.5) / completedGames) * 1000) / 1000 : null,
            avgPrecision: avg('precision'),
            avgCpLoss: avg('avgCpLoss'),
            avgAppliedDelta: avg('appliedDelta'),
            currentPlayerElo: userELO,
            currentAdaptiveElo: currentElo,
            currentFreeLossStreak: freeLossStreak,
            latestGame: latest ? { timestamp: latest.timestamp, result: latest.result, winRateLast10: latest.winRateLast10 } : null
        },
        games,
        adjustments: Array.isArray(adjustmentLog) ? adjustmentLog.slice() : [],
        diagnostics: diagnoseAdaptation(games, adjustmentLog)
    };
}

function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildAdaptationReportCsv(report = buildAdaptationReport()) {
    const fields = [
        'timestamp', 'mode', 'playerColor', 'result', 'playerEloBefore', 'playerEloAfter', 'engineRocOrElo',
        'currentEloBefore', 'currentEloAfter', 'appliedDelta', 'adjustmentReason', 'precision', 'avgCpLoss',
        'blunders', 'mistakes', 'inaccuracies', 'moveCount', 'durationSeconds', 'winRateLast5', 'winRateLast10',
        'winRateLast20', 'freeLossStreak', 'calibrationGameNumber', 'engineDepth', 'activeStrengthElo'
    ];
    const rows = [fields.join(',')];
    (report.games || []).forEach(game => {
        rows.push(fields.map(field => csvEscape(game[field])).join(','));
    });
    return rows.join('\n');
}

function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportAdaptationReport() {
    const report = buildAdaptationReport();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadTextFile(`eltauler_informe_adaptacio_${stamp}.json`, JSON.stringify(report, null, 2), 'application/json;charset=utf-8');
    downloadTextFile(`eltauler_informe_adaptacio_${stamp}.csv`, buildAdaptationReportCsv(report), 'text/csv;charset=utf-8');
    showToast(`Informe d’adaptació exportat (${report.games.length} partides)`, 'success');
}

function importBackupData(data) {
    if (!data || typeof data !== 'object') return;
    userELO = data.elo || 50; savedErrors = data.bundles || [];
    currentStreak = data.streak || 0; lastPracticeDate = data.lastPracticeDate || null;
    totalStars = data.totalStars || 0; unlockedBadges = data.unlockedBadges || [];
    todayMissions = restoreMissions(data.todayMissions || []); missionsDate = data.missionsDate || null;
    sessionStats = data.sessionStats || { 
        gamesPlayed: 0, gamesWon: 0, bundlesSolved: 0, 
        bundlesSolvedLow: 0, bundlesSolvedMed: 0, bundlesSolvedHigh: 0,
        highPrecisionGames: 0, perfectGames: 0, blackWins: 0,
        leagueGamesPlayed: 0, freeGamesPlayed: 0
    };
    eloHistory = data.eloHistory || []; totalGamesPlayed = data.totalGamesPlayed || 0; totalWins = data.totalWins || 0; maxStreak = data.maxStreak || 0;
       const importedElo = (typeof data.currentElo === 'number') ? data.currentElo
        : (typeof data.adaptiveLevel === 'number') ? data.adaptiveLevel
            : (typeof data.aiDifficulty === 'number') ? difficultyToLevel(data.aiDifficulty)
                : userELO;
    currentElo = clampEngineElo(importedElo);
    aiDifficulty = levelToDifficulty(currentElo); recentGames = data.recentGames || []; consecutiveWins = data.consecutiveWins || 0; consecutiveLosses = data.consecutiveLosses || 0;
    currentLeague = data.currentLeague || null;
    leagueActiveMatch = data.leagueActiveMatch || null;
    reviewHistory = data.reviewHistory || [];
    gameHistory = data.gameHistory || [];
    if (Array.isArray(data.completedOpenings)) completedOpenings = data.completedOpenings;
    if (data.tacticsStats && typeof data.tacticsStats === 'object') tacticsStats = Object.assign({ solved: 0, attempts: 0, best: 0, streak: 0 }, data.tacticsStats);
    if (data.hieroglyphicStats && typeof data.hieroglyphicStats === 'object') hieroglyphicStats = Object.assign(hieroglyphicStats, data.hieroglyphicStats);
       isCalibrating = typeof data.isCalibrating === 'boolean' ? data.isCalibrating : isCalibrating;
    calibrationGames = Array.isArray(data.calibrationGames) ? data.calibrationGames : calibrationGames;
    calibrationProfile = data.calibrationProfile || calibrationProfile;
    calibratgeComplet = typeof data.calibratgeComplet === 'boolean' ? data.calibratgeComplet : calibratgeComplet;
    freeAdjustmentWindow = Array.isArray(data.freeAdjustmentWindow) ? data.freeAdjustmentWindow : freeAdjustmentWindow;
    adjustmentLog = Array.isArray(data.adjustmentLog) ? data.adjustmentLog : adjustmentLog;
    adaptationReport = Array.isArray(data.adaptationReport) ? normalizeAdaptationReport(data.adaptationReport) : adaptationReport;
    freeLossStreak = typeof data.freeLossStreak === 'number' ? data.freeLossStreak : freeLossStreak;
    calibrationRocFloor = typeof data.calibrationRocFloor === 'number' ? data.calibrationRocFloor : calibrationRocFloor;
    unlockedEloMilestones = Array.isArray(data.eloMilestones) ? data.eloMilestones : unlockedEloMilestones;
    lastAdjustmentQualityAvg = typeof data.lastAdjustmentQualityAvg === 'number' ? data.lastAdjustmentQualityAvg : lastAdjustmentQualityAvg;
    if (calibrationGames.length >= CALIBRATION_GAME_COUNT || calibratgeComplet || calibrationProfile) {
        isCalibrating = false;
        calibratgeComplet = true;
        if (calibrationRocFloor === null && calibrationProfile && typeof (calibrationProfile.roc ?? calibrationProfile.elo) === 'number') {
            calibrationRocFloor = calibrationProfile.roc ?? calibrationProfile.elo;
        }
    }
    currentCalibrationOpponentRoc = null;
    if (!isCalibrating) {
        userELO = Math.max(50, currentElo);
        syncEngineEloFromUser();
    }
    saveStorage(); updateDisplay(); showToast('Dades importades!', 'success');
}

async function handleBackupImportFile(file) {
    if (!file) return;
    const fileName = file.name || '';
    if (fileName && !fileName.toLowerCase().endsWith('.json')) {
        showToast('Selecciona una còpia de seguretat en format .json', 'error');
        return;
    }
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('El backup no és un objecte JSON vàlid');
        }
        showAppConfirm(
            `Importar dades? ELO: ${data.elo || 50}, Estrelles: ${data.totalStars || 0}`,
            () => importBackupData(data),
            { title: 'Importar dades', confirmText: 'Importar' }
        );
    } catch (err) {
        console.error('Error important backup JSON:', err);
        showToast('No s’ha pogut llegir el .json. Comprova que sigui una còpia de seguretat vàlida d’El Tauler.', 'error');
    }
}

function applyTvJeroglyphicsMode(enabled, options = {}) {
    tvJeroglyphicsEnabled = !!enabled;
    const toggle = document.getElementById('tv-jeroglyphics-toggle');
    if (toggle) toggle.checked = tvJeroglyphicsEnabled;
    if (!options.skipSave) {
        saveTvJeroglyphicsPreference(tvJeroglyphicsEnabled);
    }
    if (!tvJeroglyphicsEnabled && tvJeroglyphicsActive) {
        cancelTvJeroglyphics('Jeroglífics desactivats.');
    }
    updateTvControls();
}

// Estat de validació estricta al Bundle
let isBundleStrictAnalysis = false;
let bundleBestMove = null;
let bundlePvMoves = {};
let bundlePvLines = {};
let lastHumanMoveUci = null;

let dragGuardBound = false;
let dragGuardHandler = null;

function getDefaultControlMode() {
    return isTouchDevice() ? 'tap' : 'drag';
}

function loadControlMode() {
    try {
        const v = localStorage.getItem(CONTROL_MODE_KEY);
        if (v === 'tap' || v === 'drag') return v;
    } catch (e) {}
    return getDefaultControlMode();
}

function setBodyControlClass(mode) {
    document.body.classList.toggle('control-tap', mode === 'tap');
    document.body.classList.toggle('control-drag', mode === 'drag');
}

function detachDragGuards() {
    const el = document.getElementById('myBoard');
    if (!el || !dragGuardBound || !dragGuardHandler) return;
    el.removeEventListener('touchmove', dragGuardHandler);
    el.removeEventListener('gesturestart', dragGuardHandler);
    dragGuardBound = false;
    dragGuardHandler = null;
}

function attachDragGuards() {
    if (!isTouchDevice()) return;
    const el = document.getElementById('myBoard');
    if (!el) return;

    detachDragGuards();
    dragGuardHandler = (e) => {
        if (controlMode === 'drag') e.preventDefault();
    };
    el.addEventListener('touchmove', dragGuardHandler, { passive: false });
    el.addEventListener('gesturestart', dragGuardHandler, { passive: false });
    dragGuardBound = true;
}

function disableTapToMove() {
    tapMoveEnabled = false;
    $('#myBoard').off('.tapmove');
    const boardEl = document.getElementById('myBoard');
    if (boardEl && controlMode !== 'drag') boardEl.style.touchAction = '';
    clearTapSelection();
}

function rebuildBoardForControlMode() {
    if (!game) return;
    const fen = game.fen();

    if (board) board.destroy();
    board = Chessboard('myBoard', {
        draggable: (controlMode === 'drag'),
        position: fen,
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd,
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });

    setTimeout(() => { resizeBoardToViewport(); }, 0);

    if (controlMode === 'tap') {
        detachDragGuards();
        enableTapToMove();
    } else {
        disableTapToMove();
        attachDragGuards();
    }
}

function applyControlMode(mode, opts) {
    const o = opts || {};
    if (mode !== 'tap' && mode !== 'drag') mode = getDefaultControlMode();

    controlMode = mode;
    setBodyControlClass(mode);

    if (o.save !== false) {
        try { localStorage.setItem(CONTROL_MODE_KEY, mode); } catch (e) {}
    }

    const sel = document.getElementById('control-mode-select');
    if (sel) sel.value = mode;

    if (o.rebuild) rebuildBoardForControlMode();
    updateTvBoardInteractivity();
    updateOpeningBoardInteractivity();
}

// Resize del tauler perquè ocupi el màxim possible
let resizeTimer = null;

function resizeBoardToViewport() {
    const boardEl = document.getElementById('myBoard');
    const gameScreen = document.getElementById('game-screen');
    if (!boardEl || !gameScreen) return;

    const isVisible = (gameScreen.style.display !== 'none') && (gameScreen.offsetParent !== null);
    if (!isVisible) return;

    const headerEl = gameScreen.querySelector('.header');
    const precisionEl = gameScreen.querySelector('.precision-panel');
    const controlsEl = gameScreen.querySelector('.controls');

    const isDesktopLayout = deviceType === 'desktop';
    const used = isDesktopLayout ? 0 : (headerEl ? headerEl.getBoundingClientRect().height : 0)
        + (precisionEl ? precisionEl.getBoundingClientRect().height : 0)
        + (controlsEl ? controlsEl.getBoundingClientRect().height : 0);

    const availableW = window.innerWidth;
    const isSmall = availableW <= 520;
    const isPortrait = window.innerHeight >= availableW;

    let size = 0;

    if (isSmall && isPortrait) {
        size = Math.floor(Math.max(240, availableW));
        boardEl.style.marginLeft = '0';
        boardEl.style.marginRight = '0';
    } else {
        const verticalGaps = 24;
        const availableH = window.innerHeight - used - verticalGaps;
        size = Math.floor(Math.max(240, Math.min(availableW, availableH)));
        boardEl.style.marginLeft = 'auto';
        boardEl.style.marginRight = 'auto';
    }

    boardEl.style.width = size + 'px';
    boardEl.style.height = size + 'px';

    if (board && typeof board.resize === 'function') board.resize();
}

function resizeTvBoardToViewport() {
    const boardEl = document.getElementById('tv-board');
    const tvScreen = document.getElementById('tv-screen');
    if (!boardEl || !tvScreen) return;

    const isVisible = (tvScreen.style.display !== 'none') && (tvScreen.offsetParent !== null);
    if (!isVisible) return;

    const container = boardEl.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    let size = Math.floor(rect.width);
    const availableHeight = window.innerHeight - rect.top - 24;

       if (availableHeight > 0) {
        size = Math.min(size, Math.floor(availableHeight));
    }

    size = Math.max(240, size);
    boardEl.style.width = `${size}px`;
    boardEl.style.height = `${size}px`;

    if (tvBoard && typeof tvBoard.resize === 'function') tvBoard.resize();
}

function resizeHistoryBoardToViewport() {
    const historyScreen = document.getElementById('history-screen');
    if (!historyScreen || !historyBoard) return;
    const isVisible = (historyScreen.style.display !== 'none') && (historyScreen.offsetParent !== null);
    if (!isVisible) return;
    if (typeof historyBoard.resize === 'function') historyBoard.resize();
}

function scheduleBoardResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        resizeBoardToViewport();
        resizeTvBoardToViewport();
        resizeHistoryBoardToViewport();
    }, 60);
}

window.addEventListener('resize', () => { updateDeviceType(); scheduleBoardResize(); }, { passive: true });
window.addEventListener('orientationchange', () => {
    updateDeviceType();
    setTimeout(() => resizeBoardToViewport(), 140);
}, { passive: true });

function clearTapSelection() {
    tapSelectedSquare = null;
    $('#myBoard .square-55d63').removeClass('tap-selected tap-move');
}

function clearTvTapSelection() {
    tvTapSelectedSquare = null;
    applyEpaperMode(loadEpaperPreference(), { skipSave: true });
}

function clearEngineMoveHighlights() {
    $('#myBoard .square-55d63').removeClass('engine-move');
}

function highlightEngineMove(from, to) {
    clearEngineMoveHighlights();
    [from, to].forEach((sq) => {
        if (sq) {
            $(`#myBoard .square-55d63[data-square='${sq}']`).addClass('engine-move');
        }
    });
}

function highlightTapSelection(square) {
    $('#myBoard .square-55d63').removeClass('tap-selected tap-move');
    const moves = game ? game.moves({ square: square, verbose: true }) : [];
    if (moves.length === 0) return false;

    const sel = $(`#myBoard .square-55d63[data-square='${square}']`);
    sel.addClass('tap-selected');

    for (const mv of moves) {
        $(`#myBoard .square-55d63[data-square='${mv.to}']`).addClass('tap-move');
    }
    return true;
}

function highlightTvTapSelection(square) {
    $('#tv-board .square-55d63').removeClass('tap-selected tap-move');
    if (!square) return;
    const sel = $(`#tv-board .square-55d63[data-square='${square}']`);
    sel.addClass('tap-selected');
}

/* Selector de peça per a la promoció de peons de l'usuari */
let promotionPickerCallback = null;

function isUserPromotionMove(chessInstance, from, to) {
    if (!chessInstance || !from || !to) return false;
    const piece = chessInstance.get(from);
    if (!piece || piece.type !== 'p' || piece.color !== chessInstance.turn()) return false;
    return chessInstance.moves({ square: from, verbose: true }).some(m => m.to === to && m.promotion);
}

function showPromotionPicker(color, callback) {
    const modal = document.getElementById('promotion-modal');
    if (!modal) { callback('q'); return; }
    promotionPickerCallback = callback;
    const prefix = color === 'b' ? 'b' : 'w';
    modal.querySelectorAll('.promotion-option').forEach((btn) => {
        const piece = (btn.getAttribute('data-piece') || 'q').toUpperCase();
        const img = btn.querySelector('img');
        if (img) img.src = `https://chessboardjs.com/img/chesspieces/wikipedia/${prefix}${piece}.png`;
    });
    $('#promotion-modal').css('display', 'flex');
}

function resolvePromotionPicker(piece) {
    const callback = promotionPickerCallback;
    promotionPickerCallback = null;
    $('#promotion-modal').hide();
    if (callback && piece) callback(piece);
}

function commitHumanMove(from, to, promotionPiece) {
    $('#blunder-alert').hide();
    if (engineMoveTimeout) clearTimeout(engineMoveTimeout);

    $('.square-55d63').removeClass('highlight-hint');
    if (!promotionPiece && isUserPromotionMove(game, from, to)) {
        showPromotionPicker(game.turn(), (piece) => commitHumanMove(from, to, piece));
        return true;
    }
    const prevFen = game.fen();
    const move = game.move({ from: from, to: to, promotion: promotionPiece || 'q' });
    if (move === null) { showIllegalMoveFeedback(from); return false; }
    clearEngineMoveHighlights();
    onErrorContextPlayerMoved();
    clockOnMove();
    lastHumanMoveUci = move.from + move.to + (move.promotion ? move.promotion : '');

    lastPosition = prevFen;
    totalPlayerMoves++;
    pendingMoveEvaluation = true;

    board.position(game.fen());
    updateStatus();

    if (game.game_over()) {
        if (blunderMode) {
            handleBundleGameOver();
        } else {
            pendingGameOverAfterMoveAnalysis = true;
            $('#status').text('Analitzant l’última jugada…');
            armGameOverWatchdog();
            analyzeMove();
        }
        return true;
    }

    analyzeMove();
    return true;
}

function enableTapToMove() {
    if (tapMoveEnabled) return;
    tapMoveEnabled = true;
    const boardEl = document.getElementById('myBoard');
    if (boardEl) boardEl.style.touchAction = 'none';

    $('#myBoard').off('.tapmove')
        .on(`pointerdown.tapmove touchstart.tapmove`, '.square-55d63', function(e) {
        if (!game || game.game_over() || isEngineThinking) return;

        if (e && e.preventDefault) e.preventDefault();

        const nowTs = Date.now();
        if (nowTs - lastTapEventTs < 180) return;
        lastTapEventTs = nowTs;

        const square = $(this).attr('data-square');
        if (!square) return;

        if (!tapSelectedSquare) {
            const p = game.get(square);
            if (!p || p.color !== game.turn()) return;
            if (highlightTapSelection(square)) {
                tapSelectedSquare = square;
            }
            return;
        }

        if (square === tapSelectedSquare) {
            clearTapSelection();
            return;
        }

        const moved = commitHumanMove(tapSelectedSquare, square);
        if (moved) {
            clearTapSelection();
            return;
        }

        const p2 = game.get(square);
        if (p2 && p2.color === game.turn()) {
            if (highlightTapSelection(square)) {
                tapSelectedSquare = square;
            } else {
                tapSelectedSquare = null;
            }
        }
    });
}

function enableTvTapToMove() {
    if (tvTapMoveEnabled) return;
    tvTapMoveEnabled = true;
    const boardEl = document.getElementById('tv-board');
    if (boardEl) boardEl.style.touchAction = 'none';

    $('#tv-board').off('.tv-tapmove')
        .on(`pointerdown.tv-tapmove touchstart.tv-tapmove`, '.square-55d63', function(e) {
            if (!tvJeroglyphicsActive || tvJeroglyphicsAnalyzing || tvJeroglyphicsSolved || tvJeroglyphicsIncorrect) return;
            if (!tvReplay || !tvReplay.game) return;

            if (e && e.preventDefault) e.preventDefault();

            const nowTs = Date.now();
            if (nowTs - tvLastTapEventTs < 180) return;
            tvLastTapEventTs = nowTs;

            const square = $(this).attr('data-square');
            if (!square) return;

            if (!tvTapSelectedSquare) {
                const p = tvReplay.game.get(square);
                if (!p || p.color !== tvReplay.game.turn()) return;
                tvTapSelectedSquare = square;
                highlightTvTapSelection(square);
                return;
            }

            if (square === tvTapSelectedSquare) {
                clearTvTapSelection();
                return;
            }

            tvOnDrop(tvTapSelectedSquare, square);
            clearTvTapSelection();
        });
}

function disableTvTapToMove() {
    if (!tvTapMoveEnabled) return;
    tvTapMoveEnabled = false;
    $('#tv-board').off('.tv-tapmove');
    const boardEl = document.getElementById('tv-board');
    if (boardEl) boardEl.style.touchAction = '';
    clearTvTapSelection();
}

// =====================================================
// SISTEMA D'OBERTURES - Funcions per calcular precisió
// =====================================================

// Parseja un PGN d'obertura a un array de moviments SAN
function parsePgnToMoves(pgn) {
    // ex: "1. e4 e5 2. Nf3" -> ["e4", "e5", "Nf3"]
    return ElTaulerCore.parsePgnToMoves(pgn);
}

// Construeix el trie d'obertures per cerca eficient
function buildOpeningTrie() {
    if (typeof OPENINGS_DATA === 'undefined') {
        console.warn('[Openings] OPENINGS_DATA no disponible');
        return null;
    }

    const trie = ElTaulerCore.buildOpeningTrie(OPENINGS_DATA, parsePgnToMoves);

    console.log(`[Openings] Trie construït amb ${OPENINGS_DATA.length} obertures`);
    console.log(`[Openings] Primers moviments vàlids: [${Object.keys(trie.children).join(', ')}]`);
    return trie;
}

// Inicialitza el sistema d'obertures (només construeix el trie si no existeix)
function initOpeningSystem() {
    if (!openingTrie) {
        openingTrie = buildOpeningTrie();
        if (openingTrie) {
            console.log('[Openings] Sistema d\'obertures inicialitzat correctament');
        } else {
            console.error('[Openings] ERROR: No s\'ha pogut construir el trie d\'obertures');
        }
    }
    // NO resetejar openingCurrentSequence aquí - només es reseteja a resetOpeningPracticeBoard
}

function isOpeningUserTurn() {
    return openingPracticeGame && openingPracticeGame.turn() === openingPracticeUserColor;
}

function isOpeningOpponentTurn() {
    return openingPracticeGame && openingPracticeGame.turn() !== openingPracticeUserColor;
}

// Obté els moviments vàlids d'obertura per a la posició actual
function getValidOpeningMoves(sequence) {
    return ElTaulerCore.getValidOpeningMoves(openingTrie, sequence);
}

// Analitza fins on una partida ha seguit la teoria d'obertures
// Retorna { depth, name, eco, deviationMove, deviationBy, theoryMoves } o null
function analyzeGameOpening(moves) {
    return ElTaulerCore.analyzeGameOpening(openingTrie, moves);
}

// Comprova si un moviment és vàlid dins d'alguna obertura
function isValidOpeningMove(sequence, move) {
    return ElTaulerCore.isValidOpeningMove(openingTrie, sequence, move);
}

// Obté les obertures que coincideixen amb la seqüència actual
function getMatchingOpenings(sequence) {
    return ElTaulerCore.getMatchingOpenings(openingTrie, sequence);
}

// Selecciona la millor obertura quan hi ha múltiples opcions
// Basat en el moviment de l'engine
function selectBestOpeningByEngine(sequence, engineMove) {
    const validMoves = getValidOpeningMoves(sequence);

    if (validMoves.length === 0) return null;
    if (validMoves.length === 1) return validMoves[0];

    // Si el moviment de l'engine coincideix amb una obertura, preferir-la
    if (validMoves.includes(engineMove)) {
        return engineMove;
    }

    // Sinó, retornar el primer moviment vàlid (ordre del fitxer d'obertures)
    return validMoves[0];
}

// Actualitza l'obertura seleccionada basant-se en la seqüència actual
// Selecciona l'obertura més llarga que coincideix exactament amb la seqüència
function updateSelectedOpening() {
    if (!openingTrie || openingCurrentSequence.length === 0) {
        openingMatchedOpenings = [];
        openingSelectedOpening = null;
        openingNextMoveHint = null;
        return;
    }

    let node = openingTrie;
    let lastMatchingOpening = null;

    // Recórrer la seqüència i trobar l'obertura que coincideix
    for (let i = 0; i < openingCurrentSequence.length; i++) {
        const move = openingCurrentSequence[i];
        if (!node.children[move]) {
            break; // Hem sortit de les obertures conegudes
        }
        node = node.children[move];

        // Si aquest node té obertures, guardar la més llarga
        if (node.openings && node.openings.length > 0) {
            // Preferir l'obertura amb més moviments (més específica)
            lastMatchingOpening = node.openings.reduce((best, current) => {
                return (!best || current.moves.length > best.moves.length) ? current : best;
            }, null);
        }
    }

    openingMatchedOpenings = getMatchingOpenings(openingCurrentSequence);
    if (!lastMatchingOpening) {
        lastMatchingOpening = openingMatchedOpenings.reduce((best, current) => {
            return (!best || current.moves.length > best.moves.length) ? current : best;
        }, null);
    }
    openingSelectedOpening = lastMatchingOpening;

    // Calcular el següent moviment de l'obertura (pista)
    if (openingSelectedOpening && openingSelectedOpening.moves.length > openingCurrentSequence.length) {
        openingNextMoveHint = openingSelectedOpening.moves[openingCurrentSequence.length];
        console.log(`[Openings] Obertura seleccionada: ${openingSelectedOpening.name}`);
        console.log(`[Openings] Següent moviment (pista): ${openingNextMoveHint}`);
    } else {
        // Buscar qualsevol moviment vàlid d'obertura
        const validMoves = getValidOpeningMoves(openingCurrentSequence);
        openingNextMoveHint = validMoves.length > 0 ? validMoves[0] : null;
        if (openingNextMoveHint) {
            console.log(`[Openings] Fora d'obertura específica, pista genèrica: ${openingNextMoveHint}`);
        }
    }
}

// Obté el següent moviment de l'obertura per a la pista
// Retorna { move: 'Nf3', from: 'g1', to: 'f3', openingName: 'Italian Game' } o null
function getOpeningHint() {
    if (!openingNextMoveHint || !openingPracticeGame) return null;

    // Buscar el moviment en format verbose per obtenir from/to
    const moves = openingPracticeGame.moves({ verbose: true });
    const matchingMove = moves.find(m => m.san === openingNextMoveHint);

    if (matchingMove) {
        return {
            move: openingNextMoveHint,
            from: matchingMove.from,
            to: matchingMove.to,
            openingName: openingSelectedOpening ? openingSelectedOpening.name : null
        };
    }

    return null;
}

// Avalua la precisió d'un moviment basat en obertures
// Retorna: { quality: 'correct'|'good'|'incorrect', isOpeningMove: boolean, validMoves: [] }
function evaluateOpeningMovePrecision(sequence, movePlayed) {
    const validMoves = getValidOpeningMoves(sequence);

    console.log(`[OpeningEval] Seqüència: [${sequence.join(', ')}]`);
    console.log(`[OpeningEval] Moviment jugat: "${movePlayed}"`);
    console.log(`[OpeningEval] Moviments vàlids (${validMoves.length}): [${validMoves.slice(0, 10).join(', ')}${validMoves.length > 10 ? '...' : ''}]`);
    console.log(`[OpeningEval] Moviment "${movePlayed}" està a la llista: ${validMoves.includes(movePlayed)}`);

    // Si és el primer moviment i no hi ha cap obertura que comenci així
    if (sequence.length === 0 && validMoves.length > 0 && !validMoves.includes(movePlayed)) {
        // Primer moviment no estàndard: 50% (ni bo ni dolent)
        return { quality: 'unknown', isOpeningMove: false, validMoves: validMoves };
    }

    // Si el moviment és vàlid dins d'alguna obertura
    if (validMoves.includes(movePlayed)) {
        return { quality: 'correct', isOpeningMove: true, validMoves: validMoves };
    }

    // Si no hi ha moviments vàlids d'obertura (hem sortit de les obertures)
    if (validMoves.length === 0) {
        // Ja no estem dins d'obertures conegudes - usar engine
        return { quality: 'engine', isOpeningMove: false, validMoves: [] };
    }

    // Hi havia moviments d'obertura vàlids però l'usuari n'ha fet un altre
    return { quality: 'incorrect', isOpeningMove: false, validMoves: validMoves };
}

// =====================================================
// FI SISTEMA D'OBERTURES
// =====================================================

// Funcions per a la pista visual del tauler d'obertures
function clearOpeningHintHighlight() {
    $('#opening-board .square-55d63').removeClass('highlight-hint');
}

function highlightOpeningHint(from, to) {
    clearOpeningHintHighlight();
    if (from) {
        $(`#opening-board .square-55d63[data-square='${from}']`).addClass('highlight-hint');
    }
    if (to) {
        $(`#opening-board .square-55d63[data-square='${to}']`).addClass('highlight-hint');
    }
}

// Retorna la jugada de la teoria que toca a l'usuari en una lliçó (format verbose
// de chess.js, amb from/to), o null si no és el seu torn o la línia ja s'ha acabat.
function getOpeningLessonExpectedMove() {
    if (!openingLessonActive || !openingPracticeGame) return null;
    if (openingLessonStep >= openingLessonLine.length) return null;
    if (openingPracticeGame.turn() !== openingLessonUserColor) return null;
    const expected = openingLessonLine[openingLessonStep];
    if (!expected) return null;
    const norm = s => (s || '').replace(/[+#!?]/g, '');
    const target = norm(expected);
    const moves = openingPracticeGame.moves({ verbose: true });
    return moves.find(m => norm(m.san) === target) || null;
}

// Marca en lila la casella destí de la jugada que toca a l'usuari en una lliçó.
// Si no és el seu torn, neteja qualsevol marca anterior.
function showOpeningLessonTargetHint() {
    const mv = getOpeningLessonExpectedMove();
    if (!mv) { clearOpeningHintHighlight(); return; }
    highlightOpeningHint(null, mv.to);
}

// Vist-i-plau verd persistent per a la jugada correcta d'una lliçó. A diferència de
// showOpeningMoveVisualFeedback no s'esvaeix sol: es manté fins que l'enginy mou
// (quan es crida clearOpeningMoveVisualFeedback).
function showOpeningLessonCorrectMark(square) {
    clearOpeningMoveVisualFeedback();
    const squareEl = $(`#opening-board .square-55d63[data-square='${square}']`);
    if (!squareEl.length) return;
    squareEl.addClass('move-correct');
    const iconEl = $('<div class="opening-move-icon opening-move-icon-correct">✓</div>');
    squareEl.append(iconEl);
    setTimeout(() => iconEl.addClass('show'), 10);
}

// Funcions de precisió per al tauler d'obertures
// Mostra el resultat del MOVIMENT ACTUAL (no la mitjana)
function updateOpeningPrecisionDisplay(animate = false) {
    const precisionEl = $('#opening-precision-value');
    const barEl = $('#opening-precision-bar');
    const panelEl = $('#opening-precision-panel');
    if (!precisionEl.length || !barEl.length) return;

    // Estat inicial - sense moviments o esperant dades de Stockfish
    if (openingPracticeTotalMoves === 0 || openingLastMoveQuality === null || openingLastMoveQuality === 'unknown') {
        precisionEl.text('—');
        barEl.css('width', '0%').removeClass('good warning danger move-correct move-incorrect move-good');
        // Actualitzar estadístiques de sessió (pot ser 0/0 o valors restaurats per undo)
        updateOpeningSessionStats();
        return;
    }

    // Mostrar resultat del MOVIMENT ACTUAL
    barEl.removeClass('good warning danger move-correct move-incorrect move-good');

    if (openingLastMoveQuality === 'correct') {
        // ═══════════════════════════════════════
        // MOVIMENT CORRECTE - Barra verda al 100%
        // ═══════════════════════════════════════
        precisionEl.text('✓');
        barEl.css('width', '100%').addClass('move-correct');
        if (animate) {
            barEl.addClass('precision-correct-anim');
            setTimeout(() => barEl.removeClass('precision-correct-anim'), 600);
        }
    } else if (openingLastMoveQuality === 'good') {
        // ═══════════════════════════════════════
        // MOVIMENT ACCEPTABLE - Barra taronja al 100%
        // ═══════════════════════════════════════
        precisionEl.text('~');
        barEl.css('width', '100%').addClass('move-good');
        if (animate) {
            barEl.addClass('precision-good-anim');
            setTimeout(() => barEl.removeClass('precision-good-anim'), 600);
        }
    } else {
        // ═══════════════════════════════════════
        // MOVIMENT INCORRECTE - Barra vermella al 100%
        // ═══════════════════════════════════════
        precisionEl.text('✗');
        barEl.css('width', '100%').addClass('move-incorrect');
        if (animate) {
            barEl.addClass('precision-error-anim');
            setTimeout(() => barEl.removeClass('precision-error-anim'), 600);
        }
    }

    // Actualitzar estadístiques de sessió
    updateOpeningSessionStats();
}

// Crea l'element d'estadístiques de sessió si no existeix
function createSessionStatsElement() {
    if (document.getElementById('opening-session-stats')) return;

    const panelEl = document.getElementById('opening-precision-panel');
    if (!panelEl) return;

    const statsEl = document.createElement('div');
    statsEl.id = 'opening-session-stats';
    statsEl.className = 'opening-session-stats';
    statsEl.innerHTML = `
        <span class="stats-label">Sessió:</span>
        <span class="stats-value" id="session-stats-value">0/0</span>
        <span class="stats-percent" id="session-stats-percent">(—%)</span>
    `;
    panelEl.appendChild(statsEl);
}

// Actualitza l'indicador d'estadístiques acumulades de la sessió
function updateOpeningSessionStats() {
    let statsEl = document.getElementById('opening-session-stats');

    // Crear si no existeix
    if (!statsEl) {
        createSessionStatsElement();
        statsEl = document.getElementById('opening-session-stats');
    }

    if (!statsEl) return;

    const valueEl = document.getElementById('session-stats-value');
    const percentEl = document.getElementById('session-stats-percent');

    const lessonTarget = openingLessonActive ? getOpeningLessonUserMoveTarget() : 0;
    const denominator = lessonTarget > 0 ? lessonTarget : openingPracticeTotalMoves;

    // No mostrar estadístiques fins tenir dades vàlides, excepte a les lliçons:
    // allà sí que volem ensenyar el comptador 0/N des del primer torn, també amb negres.
    const hasValidData = denominator > 0 && (
        lessonTarget > 0 ||
        (openingPracticeTotalMoves > 0 && openingLastMoveQuality !== null && openingLastMoveQuality !== 'unknown')
    );

    if (!hasValidData) {
        if (valueEl) valueEl.textContent = '—/—';
        if (percentEl) percentEl.textContent = '(—%)';
        statsEl.className = 'opening-session-stats';
        return;
    }

    const avgPrecision = Math.round((openingPracticeGoodMoves / denominator) * 100);

    if (valueEl) valueEl.textContent = `${openingPracticeGoodMoves}/${denominator}`;
    if (percentEl) percentEl.textContent = `(${avgPrecision}%)`;

    // Color segons el percentatge
    statsEl.className = 'opening-session-stats';
    if (avgPrecision >= 80) {
        statsEl.classList.add('stats-good');
    } else if (avgPrecision >= 50) {
        statsEl.classList.add('stats-warning');
    } else {
        statsEl.classList.add('stats-danger');
    }
}

function getOpeningLessonUserMoveTarget() {
    if (!Array.isArray(openingLessonLine) || !openingLessonLine.length) return 0;
    const userColor = openingLessonUserColor || 'w';
    return openingLessonLine.reduce((total, _san, idx) => {
        const moveColor = idx % 2 === 0 ? 'w' : 'b';
        return total + (moveColor === userColor ? 1 : 0);
    }, 0);
}

function registerOpeningLessonAttempt(quality) {
    openingLastMoveQuality = quality;
    openingPracticeTotalMoves++;
    if (quality === 'correct' || quality === 'good') {
        openingPracticeGoodMoves++;
    }
    updateOpeningPrecisionDisplay(true);
}

// ========== SISTEMA DE FEEDBACK INSTANTANI PER OBERTURES ==========

// Pre-calcula el millor moviment per a la posició actual (quan és el torn de l'usuari)
// DESACTIVAT: Interfereix amb l'anàlisi en dos passos (sobreescriu stockfishRequestor)
function preCalculateOpeningBestMove() {
    // La precisió ara es calcula amb el sistema d'anàlisi en dos passos (com partida lliure)
    return;
}

// Processa el resultat del pre-càlcul del millor moviment
// NOTA: Aquest sistema ja no s'utilitza per la precisió (ara usem anàlisi en dos passos)
// Només guardem el resultat per si es vol usar per pistes o feedback visual futur
function processOpeningPreCalcResult(bestMove) {
    if (!openingPreCalcPending) return;
    openingPreCalcPending = false;
    openingPreCalcBestMove = bestMove;
    console.log(`[OpeningInstant] Pre-calculat millor moviment: ${bestMove} (no afecta precisió)`);
    // No fem res més - la precisió es calcula amb l'anàlisi en dos passos
}

// Avalua instantàniament si el moviment de l'usuari és correcte
function evaluateOpeningMoveInstantly(movePlayed, moveFrom, moveTo) {
    // Inicialitzar sistema d'obertures si cal
    if (!openingTrie) {
        initOpeningSystem();
    }

    // Convertir moviment UCI a SAN per comparar amb obertures
    // El movePlayed ja és en format SAN (ex: "e4", "Nf3")
    const moveSAN = movePlayed;

    // Avaluar el moviment segons el sistema d'obertures
    const evaluation = evaluateOpeningMovePrecision(openingCurrentSequence, moveSAN);
    let quality = evaluation.quality;

    console.log(`[OpeningInstant] Seqüència actual: [${openingCurrentSequence.join(', ')}], Moviment: ${moveSAN}`);
    console.log(`[OpeningInstant] Moviments vàlids d'obertura: [${evaluation.validMoves.join(', ')}]`);
    console.log(`[OpeningInstant] Avaluació obertura: ${quality}, isOpeningMove: ${evaluation.isOpeningMove}`);

    // Si el moviment és d'obertura vàlid
    if (quality === 'correct') {
        openingLastMoveQuality = 'correct';
        showOpeningMoveVisualFeedback(moveFrom, moveTo, 'correct');
        openingPracticeTotalMoves++;
        openingPracticeGoodMoves++;
        updateOpeningPrecisionDisplay(true);
        // Afegir moviment a la seqüència actual
        openingCurrentSequence.push(moveSAN);
        console.log(`[OpeningInstant] Moviment d'obertura correcte: ${moveSAN}`);
        return 'correct';
    }

    // Si és el primer moviment i no coincideix amb cap obertura coneguda
    if (quality === 'unknown' && openingCurrentSequence.length === 0) {
        // Donar 50%: comptar com a mig punt
        openingLastMoveQuality = 'good';
        showOpeningMoveVisualFeedback(moveFrom, moveTo, 'good');
        openingPracticeTotalMoves += 2; // Comptem com 2 moviments
        openingPracticeGoodMoves += 1; // Però només 1 correcte = 50%
        updateOpeningPrecisionDisplay(true);
        // Afegir moviment a la seqüència (tot i no ser obertura estàndard)
        openingCurrentSequence.push(moveSAN);
        console.log(`[OpeningInstant] Primer moviment no estàndard: ${moveSAN} - 50%`);
        return 'good';
    }

    // Si hem sortit de les obertures conegudes, usar engine per avaluar
    if (quality === 'engine' || evaluation.validMoves.length === 0) {
        // Fallback: usar el pre-càlcul de l'engine si existeix
        const playedNorm = movePlayed.toLowerCase().substring(0, 4);
        const bestNorm = openingPreCalcBestMove ? openingPreCalcBestMove.toLowerCase().substring(0, 4) : null;

        if (bestNorm) {
            if (playedNorm === bestNorm) {
                quality = 'correct';
            } else if (playedNorm.substring(2, 4) === bestNorm.substring(2, 4)) {
                quality = 'good';
            } else {
                quality = 'incorrect';
            }
        } else {
            // Sense pre-càlcul i fora d'obertures, assumir acceptable
            quality = 'good';
        }

        openingLastMoveQuality = quality;
        showOpeningMoveVisualFeedback(moveFrom, moveTo, quality);
        openingPracticeTotalMoves++;
        if (quality === 'correct' || quality === 'good') {
            openingPracticeGoodMoves++;
        }
        updateOpeningPrecisionDisplay(true);
        openingCurrentSequence.push(moveSAN);
        console.log(`[OpeningInstant] Fora d'obertures, avaluació engine: ${quality}`);
        openingPreCalcBestMove = null;
        openingPreCalcFen = null;
        return quality;
    }

    // Hi havia moviments d'obertura vàlids però l'usuari n'ha fet un altre
    openingLastMoveQuality = 'incorrect';
    showOpeningMoveVisualFeedback(moveFrom, moveTo, 'incorrect');
    openingPracticeTotalMoves++;
    updateOpeningPrecisionDisplay(true);
    openingCurrentSequence.push(moveSAN);
    console.log(`[OpeningInstant] Moviment incorrecte: ${moveSAN}, esperats: [${evaluation.validMoves.join(', ')}]`);

    openingPreCalcBestMove = null;
    openingPreCalcFen = null;
    return 'incorrect';
}

function setOpeningPracticeUserMoveNote(quality, validMoves = []) {
    const noteEl = document.getElementById('opening-practice-note');
    if (!noteEl) return;

    if (quality === 'correct') {
        noteEl.textContent = 'Correcte: aquesta jugada segueix la teoria.';
    } else if (quality === 'good') {
        noteEl.textContent = 'Acceptable: no és la línia principal, però és jugable.';
    } else if (quality === 'incorrect') {
        const continuations = validMoves.length ? validMoves.slice(0, 5).join(', ') : 'cap continuació teòrica disponible';
        noteEl.textContent = `Has sortit de la teoria. Continuacions habituals: ${continuations}.`;
    }
}

// Gestiona el flux complet: primer precisió, després moviment de l'engine
// Utilitza el sistema d'anàlisi en dos passos (igual que partida lliure)
function handleOpeningUserMove(movePlayed, from, to, needsOpponentMove) {
    console.log(`[OpeningAnalysis] handleOpeningUserMove cridat amb movePlayed="${movePlayed}"`);

    // Inicialitzar sistema d'obertures si cal
    if (!openingTrie) {
        console.log('[OpeningAnalysis] Inicialitzant sistema d\'obertures...');
        initOpeningSystem();
    }

    // Guardar si cal moure el rival després de l'anàlisi
    openingNeedsEngineMove = needsOpponentMove;

    // Usar el sistema d'obertures per avaluar el moviment
    const validMovesDebug = getValidOpeningMoves(openingCurrentSequence);
    console.log(`[OpeningAnalysis] DEBUG - Trie existeix: ${!!openingTrie}, Moviments vàlids des de seqüència [${openingCurrentSequence.join(', ')}]: [${validMovesDebug.join(', ')}]`);

    const evaluation = evaluateOpeningMovePrecision(openingCurrentSequence, movePlayed);
    let quality = evaluation.quality;

    console.log(`[OpeningAnalysis] Seqüència: [${openingCurrentSequence.join(', ')}], Moviment: ${movePlayed}`);
    console.log(`[OpeningAnalysis] Moviments vàlids: [${evaluation.validMoves.join(', ')}], Avaluació: ${quality}`);

    // Si el moviment és d'obertura vàlid
    if (quality === 'correct') {
        openingLastMoveQuality = 'correct';
        showOpeningMoveVisualFeedback(from, to, 'correct');
        openingPracticeTotalMoves++;
        openingPracticeGoodMoves++;
        updateOpeningPrecisionDisplay(true);
        setOpeningPracticeUserMoveNote('correct', evaluation.validMoves);
        openingCurrentSequence.push(movePlayed);
        updateSelectedOpening();
        console.log(`[OpeningAnalysis] Moviment d'obertura correcte: ${movePlayed}`);

        if (needsOpponentMove) {
            setTimeout(() => requestOpeningPracticeEngineMove(), 700);
        }
        return;
    }

    // Si és el primer moviment i no coincideix amb cap obertura coneguda (50%)
    if (quality === 'unknown' && openingCurrentSequence.length === 0) {
        openingLastMoveQuality = 'good';
        showOpeningMoveVisualFeedback(from, to, 'good');
        // 50%: comptem com 2 moviments però només 1 correcte
        openingPracticeTotalMoves += 2;
        openingPracticeGoodMoves += 1;
        updateOpeningPrecisionDisplay(true);
        setOpeningPracticeUserMoveNote('good', evaluation.validMoves);
        openingCurrentSequence.push(movePlayed);
        updateSelectedOpening();
        console.log(`[OpeningAnalysis] Primer moviment no estàndard: ${movePlayed} - 50%`);

        if (needsOpponentMove) {
            setTimeout(() => requestOpeningPracticeEngineMove(), 700);
        }
        return;
    }

    // Si hem sortit de les obertures conegudes, usar engine per avaluar
    if (quality === 'engine' || evaluation.validMoves.length === 0) {
        // Fallback a l'anàlisi de l'engine
        const fenAfter = openingPracticeGame.fen();
        let fenBefore = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        if (openingPracticeHistory.length > 0) {
            fenBefore = openingPracticeHistory[openingPracticeHistory.length - 1].fen;
        }
        openingCurrentSequence.push(movePlayed);
        updateSelectedOpening();
        setOpeningPracticeUserMoveNote('good', evaluation.validMoves);
        console.log(`[OpeningAnalysis] Fora d'obertures, usant engine per: ${movePlayed}`);
        analyzeOpeningMoveQuality(fenBefore, movePlayed, fenAfter);
        return;
    }

    // Hi havia moviments d'obertura vàlids però l'usuari n'ha fet un altre
    openingLastMoveQuality = 'incorrect';
    showOpeningMoveVisualFeedback(from, to, 'incorrect');
    openingPracticeTotalMoves++;
    updateOpeningPrecisionDisplay(true);
    setOpeningPracticeUserMoveNote('incorrect', evaluation.validMoves);
    openingCurrentSequence.push(movePlayed);
    updateSelectedOpening();
    console.log(`[OpeningAnalysis] Moviment incorrecte: ${movePlayed}, esperats: [${evaluation.validMoves.join(', ')}]`);

    if (needsOpponentMove) {
        setTimeout(() => requestOpeningPracticeEngineMove(), 700);
    }
}

// Mostra feedback visual sobre el tauler
function showOpeningMoveVisualFeedback(from, to, quality) {
    // Netejar feedback anterior
    clearOpeningMoveVisualFeedback();

    const toSquare = $(`#opening-board .square-55d63[data-square='${to}']`);
    if (!toSquare.length) return;

    // Afegir classe segons qualitat
    if (quality === 'correct') {
        toSquare.addClass('move-correct');
        showOpeningMoveIcon(to, '✓', 'correct');
    } else if (quality === 'good') {
        toSquare.addClass('move-good');
        showOpeningMoveIcon(to, '~', 'good');
    } else if (quality === 'incorrect') {
        toSquare.addClass('move-incorrect');
        showOpeningMoveIcon(to, '✗', 'incorrect');
    }

    // Eliminar feedback després d'un temps
    setTimeout(() => {
        toSquare.removeClass('move-correct move-good move-incorrect');
    }, 2000);
}

// Mostra una icona sobre la casella
function showOpeningMoveIcon(square, icon, type) {
    // Eliminar icones anteriors
    $('.opening-move-icon').remove();

    const squareEl = $(`#opening-board .square-55d63[data-square='${square}']`);
    if (!squareEl.length) return;

    const iconEl = $(`<div class="opening-move-icon opening-move-icon-${type}">${icon}</div>`);
    squareEl.append(iconEl);

    // Animació d'entrada
    setTimeout(() => iconEl.addClass('show'), 10);

    // Eliminar després d'un temps
    setTimeout(() => {
        iconEl.removeClass('show');
        setTimeout(() => iconEl.remove(), 300);
    }, 1500);
}

// Neteja el feedback visual
function clearOpeningMoveVisualFeedback() {
    $('#opening-board .square-55d63').removeClass('move-correct move-good move-incorrect');
    $('.opening-move-icon').remove();
}

function showMainMoveVisualFeedback(to, quality) {
    clearMainMoveVisualFeedback();
    const toSquare = $(`#myBoard .square-55d63[data-square='${to}']`);
    if (!toSquare.length) return;
    if (quality === 'correct') {
        toSquare.addClass('move-correct');
    } else if (quality === 'incorrect') {
        toSquare.addClass('move-incorrect');
    }
    setTimeout(() => {
        toSquare.removeClass('move-correct move-incorrect');
    }, 1200);
}

function clearMainMoveVisualFeedback() {
    $('#myBoard .square-55d63').removeClass('move-correct move-incorrect');
}

function analyzeOpeningMoveQuality(fenBefore, movePlayed, fenAfter) {
    if (!fenBefore || !movePlayed || !fenAfter) return;

    // Si l'engine està pensant, guardem l'anàlisi per després
    if (openingPracticeEngineThinking) {
        openingPracticePendingAnalysis = { fen: fenBefore, move: movePlayed, fenAfter: fenAfter };
        return;
    }

    // Si ja hi ha una anàlisi en curs, la substituïm
    if (openingPracticeAnalysisPending) {
        openingPracticePendingAnalysis = { fen: fenBefore, move: movePlayed, fenAfter: fenAfter };
        return;
    }

    executeOpeningMoveAnalysis(fenBefore, movePlayed, fenAfter);
}

function executeOpeningMoveAnalysis(fenBefore, movePlayed, fenAfter) {
    if (!stockfish) {
        if (!ensureStockfish()) return;
    }

    openingPracticeAnalysisPending = true;
    openingPracticeLastFen = fenBefore;
    openingPracticeLastMove = movePlayed;
    openingFenAfterMove = fenAfter;
    openingAnalysisStep = 1; // Pas 1: analitzar posició ABANS del moviment
    openingTempScore = null;
    openingEvalBefore = null;
    openingEvalAfter = null;
    openingBestMove = null;

    // Timeout de seguretat: si no rebem resposta en 8 segons, processar igualment
    setTimeout(() => {
        if (openingPracticeAnalysisPending && openingPracticeLastMove === movePlayed) {
            console.warn('[OpeningPrecision] Timeout esperant resposta Stockfish');
            finalizeOpeningMoveAnalysis(); // Processar amb el que tenim
        }
    }, 8000);

    stockfishRequestor = 'opening-analysis';
    try { stockfish.postMessage('setoption name MultiPV value 1'); } catch (e) {}
    stockfish.postMessage(`position fen ${fenBefore}`);
    stockfish.postMessage('go depth 10');
}

// Processa el resultat del pas 1 (posició abans del moviment)
function processOpeningAnalysisStep1(bestMove) {
    if (openingAnalysisStep !== 1) return;

    openingBestMove = bestMove;
    openingEvalBefore = openingTempScore;
    openingTempScore = null;

    // Pas 2: analitzar posició DESPRÉS del moviment
    openingAnalysisStep = 2;

    if (!openingFenAfterMove) {
        // Si no tenim FEN després, finalitzem amb el que tenim
        finalizeOpeningMoveAnalysis();
        return;
    }

    stockfishRequestor = 'opening-analysis';
    try { stockfish.postMessage('setoption name MultiPV value 1'); } catch (e) {}
    stockfish.postMessage(`position fen ${openingFenAfterMove}`);
    stockfish.postMessage('go depth 10');
}

// Processa el resultat del pas 2 (posició després del moviment)
function processOpeningAnalysisStep2() {
    if (openingAnalysisStep !== 2) return;

    openingEvalAfter = openingTempScore;
    finalizeOpeningMoveAnalysis();
}

// Finalitza l'anàlisi i calcula la qualitat del moviment
function finalizeOpeningMoveAnalysis() {
    if (!openingPracticeAnalysisPending) return;
    openingPracticeAnalysisPending = false;
    openingAnalysisStep = 0;

    let moveQuality = 'good'; // Default a acceptable

    try {
        // Calcular swing igual que a la partida lliure
        // swing = evalAfter + evalBefore (el signe és oposat perquè canvia de perspectiva)
        let swing = null;
        if (openingEvalBefore !== null && openingEvalAfter !== null) {
            swing = openingEvalAfter + openingEvalBefore;
        }

        // Classificar la qualitat del moviment usant la mateixa funció que partida lliure
        moveQuality = classifyMoveQuality(
            swing !== null ? Math.abs(swing) : null,
            openingPracticeLastMove,
            openingBestMove
        );

        // Guardar per feedback visual
        openingLastMoveQuality = moveQuality;

        // Comptar com a bon moviment si és 'excel' o 'good'
        if (moveQuality === 'excel' || moveQuality === 'good') {
            openingPracticeGoodMoves++;
        }
        openingPracticeTotalMoves++;
        updateOpeningPrecisionDisplay();

        console.log(`[OpeningPrecision] Move: ${openingPracticeLastMove}, Best: ${openingBestMove}, ` +
                   `EvalBefore: ${openingEvalBefore}, EvalAfter: ${openingEvalAfter}, ` +
                   `Swing: ${swing}, Quality: ${moveQuality}`);
    } catch (e) {
        // En cas d'error, almenys comptem el moviment com acceptable
        openingPracticeTotalMoves++;
        openingPracticeGoodMoves++;
        updateOpeningPrecisionDisplay();
        console.error('[OpeningPrecision] Error processant anàlisi:', e);
    } finally {
        // Netejar variables d'anàlisi
        openingPracticeLastFen = null;
        openingPracticeLastMove = null;
        openingFenAfterMove = null;
        openingTempScore = null;
        openingEvalBefore = null;
        openingEvalAfter = null;
        openingBestMove = null;
    }

    // Executar anàlisi pendent si n'hi ha (i l'engine no està pensant)
    if (openingPracticePendingAnalysis && !openingPracticeEngineThinking) {
        const pending = openingPracticePendingAnalysis;
        openingPracticePendingAnalysis = null;
        setTimeout(() => {
            executeOpeningMoveAnalysis(pending.fen, pending.move, pending.fenAfter);
        }, 50);
        return; // No moure l'engine encara, esperar la següent anàlisi
    }

    // Després de l'anàlisi, fer moure l'engine si cal
    if (openingNeedsEngineMove) {
        openingNeedsEngineMove = false;
        setTimeout(() => requestOpeningPracticeEngineMove(), 500);
    }
}

function handleOpeningPracticeUserMove(from, to) {
    if (!openingPracticeGame || openingPracticeGame.game_over()) return 'snapback';
    if (openingPracticeMoveCount >= OPENING_PRACTICE_MAX_PLIES) return 'snapback';
    if (!isOpeningUserTurn()) {
        const noteEl = document.getElementById('opening-practice-note');
        if (noteEl) noteEl.textContent = 'Espera la jugada del rival.';
        return 'snapback';
    }

    const fenBefore = openingPracticeGame.fen();
    const sequenceBeforeMove = [...openingCurrentSequence];

    saveOpeningPracticeState();

    const move = openingPracticeGame.move({ from: from, to: to, promotion: 'q' });
    if (!move) {
        openingPracticeHistory.pop();
        openingCurrentSequence = sequenceBeforeMove;
        return 'snapback';
    }

    openingCurrentSequence = sequenceBeforeMove;
    const movePlayed = move.san;
    clearOpeningHintHighlight();
    openingPracticeBestMove = null;
    openingPracticeMoveCount += 1;

    if (openingBundleBoard) openingBundleBoard.position(openingPracticeGame.fen());
    updateOpeningPracticeStatus();

    const needsOpponentMove =
        openingPracticeMoveCount < OPENING_PRACTICE_MAX_PLIES &&
        !openingPracticeGame.game_over() &&
        openingPracticeGame.turn() !== openingPracticeUserColor;

    console.log(`[OpeningPracticeMove] fenBefore=${fenBefore}, sequenceBefore=[${sequenceBeforeMove.join(', ')}], san=${movePlayed}, needsOpponentMove=${needsOpponentMove}`);
    handleOpeningUserMove(movePlayed, from, to, needsOpponentMove);
    return true;
}

// Funcions tap-to-move per al tauler d'obertures
function clearOpeningTapSelection() {
    openingTapSelectedSquare = null;
    $('#opening-board .square-55d63').removeClass('tap-selected tap-move');
}

function highlightOpeningTapSelection(square) {
    $('#opening-board .square-55d63').removeClass('tap-selected tap-move');
    if (!square) return;
    const sel = $(`#opening-board .square-55d63[data-square='${square}']`);
    sel.addClass('tap-selected');

    const moves = openingPracticeGame ? openingPracticeGame.moves({ square: square, verbose: true }) : [];
    for (const mv of moves) {
        $(`#opening-board .square-55d63[data-square='${mv.to}']`).addClass('tap-move');
    }
}

function handleOpeningLessonUserMove(from, to) {
    if (!openingLessonActive || !openingPracticeGame) return false;
    if (openingPracticeGame.turn() !== openingLessonUserColor) {
        const noteEl = document.getElementById('opening-practice-note');
        if (noteEl) noteEl.textContent = 'Observa la resposta del rival...';
        return false;
    }

    const expected = openingLessonLine[openingLessonStep];
    const fenBefore = openingPracticeGame.fen();
    const move = openingPracticeGame.move({ from: from, to: to, promotion: 'q' });
    if (!move) return false;

    clearOpeningHintHighlight();
    if (move.san !== expected) {
        showOpeningMoveVisualFeedback(from, to, 'incorrect');
        registerOpeningLessonAttempt('incorrect');
        const noteEl = document.getElementById('opening-practice-note');
        if (noteEl && openingLessonInfo) {
            noteEl.innerHTML = `<div class="opening-maxim-box"><div class="maxim-title">📖 ${openingLessonInfo.name}</div><div class="maxim-text">La jugada teòrica aquí és <strong>${expected}</strong>. Torna-ho a provar.</div></div>`;
        }
        void requestOpeningLessonExplanation(fenBefore, expected, move.san);
        setTimeout(() => {
            openingPracticeGame.undo();
            openingBundleBoard.position(openingPracticeGame.fen());
            clearOpeningMoveVisualFeedback();
            // Torna a marcar en lila la casella correcta perquè ho torni a provar
            showOpeningLessonTargetHint();
        }, 700);
        return true;
    }

    // Jugada correcta: vist-i-plau verd que es manté fins que l'enginy mou
    showOpeningLessonCorrectMark(to);
    registerOpeningLessonAttempt('correct');
    openingLessonStep++;
    openingBundleBoard.position(openingPracticeGame.fen());
    if (openingLessonStep >= openingLessonLine.length) {
        setTimeout(() => completeOpeningLesson(), 500);
        return true;
    }
    updateOpeningLessonNote();
    setTimeout(() => playOpeningLessonOpponentMove(), 650);
    return true;
}

/* ===================== EXPLICACIONS DE TEORIA A LES LLIÇONS D'OBERTURA =====================
   Quan l'alumne s'equivoca en una lliçó, el missatge estàtic surt a l'instant i
   OpenAI hi afegeix després el perquè de la jugada de la teoria. Amb cau per
   posició perquè repetir la mateixa errada no torni a cridar l'API. */

let openingLessonExplainToken = 0;

function buildOpeningLessonExplanationPrompt(fen, expectedSan, playedSan, openingName) {
    return `Ets un professor d'obertures d'escacs que parla en català i tuteja l'alumne.
Obertura: ${openingName}
Posició abans de la jugada (FEN): ${fen}
L'alumne ha jugat ${playedSan}, però la teoria recomana ${expectedSan}.

Explica en 2 frases (màxim 45 paraules) quina idea d'obertura segueix ${expectedSan} i què deixa de fer ${playedSan}. Sense markdown, llistes ni cometes: només text pla.`;
}

async function requestOpeningLessonExplanation(fen, expectedSan, playedSan) {
    if (!openaiApiKey || !openingLessonInfo || !fen) return;
    const lessonName = openingLessonInfo.name;
    const stepAtRequest = openingLessonStep;
    const myToken = ++openingLessonExplainToken;
    const cacheKey = `openinglesson:${fen}:${expectedSan}:${playedSan}`;
    let text = getCachedOpenAI(cacheKey);
    if (!text) {
        const prompt = buildOpeningLessonExplanationPrompt(fen, expectedSan, playedSan, lessonName);
        const result = await callOpenAI(prompt, { generationConfig: { maxOutputTokens: 400 } });
        if (!result.ok || !result.text) return;
        text = result.text.replace(/\*\*/g, '').replace(/["«»]/g, '').trim();
        if (!text) return;
        setCachedOpenAI(cacheKey, text);
    }
    // Només actualitza si seguim a la mateixa lliçó i al mateix pas, i cap petició més nova
    if (myToken !== openingLessonExplainToken) return;
    if (!openingLessonActive || !openingLessonInfo || openingLessonInfo.name !== lessonName) return;
    if (openingLessonStep !== stepAtRequest) return;
    const noteEl = document.getElementById('opening-practice-note');
    if (!noteEl) return;
    noteEl.innerHTML = `<div class="opening-maxim-box"><div class="maxim-title">📖 ${openingLessonInfo.name}</div><div class="maxim-text">La jugada teòrica aquí és <strong>${escapeHtml(expectedSan)}</strong>. Torna-ho a provar.</div><div class="maxim-text" style="opacity:0.92; margin-top:6px;">💬 ${escapeHtml(text)}</div></div>`;
}

function commitOpeningMoveFromTap(from, to) {
    if (!openingPracticeGame) return false;
    if (openingPracticeGame.game_over()) return false;
    if (!openingLessonActive && !openingErrorPracticeActive && !hieroglyphicExerciseActive && openingPracticeGame.turn() !== openingPracticeUserColor) {
        const noteEl = document.getElementById('opening-practice-note');
        if (noteEl) noteEl.textContent = 'Espera la jugada del rival.';
        return false;
    }

    // Mode exercici jeroglífic: en mode tocar també ha de consumir l'intent.
    if (hieroglyphicExerciseActive) {
        const legalAttempt = openingPracticeGame.moves({ square: from, verbose: true }).some(m => m.to === to);
        const result = handleHieroglyphicMove(from, to);
        return legalAttempt || result !== 'snapback';
    }

    // Mode lliçó guiada
    if (openingLessonActive) {
        return handleOpeningLessonUserMove(from, to);
    }

    // Mode pràctica d'errors d'obertura
    if (openingErrorPracticeActive) {
        const move = openingPracticeGame.move({ from: from, to: to, promotion: 'q' });
        if (!move) return false;

        const moveUci = from + to;
        openingBundleBoard.position(openingPracticeGame.fen());

        if (openingErrorBestMove && moveUci === openingErrorBestMove.substring(0, 4)) {
            // Moviment correcte
            showOpeningMoveVisualFeedback(from, to, 'correct');
            setTimeout(() => handleOpeningErrorSuccess(), 800);
        } else {
            // Moviment incorrecte
            showOpeningMoveVisualFeedback(from, to, 'incorrect');
            setTimeout(() => {
                openingPracticeGame.undo();
                openingBundleBoard.position(openingPracticeGame.fen());
            }, 600);
        }
        return true;
    }

    return handleOpeningPracticeUserMove(from, to) === true;
}

function enableOpeningTapToMove() {
    if (openingTapMoveEnabled) return;
    openingTapMoveEnabled = true;
    const boardEl = document.getElementById('opening-board');
    if (boardEl) boardEl.style.touchAction = 'none';

    $('#opening-board').off('.opening-tapmove')
        .on(`pointerdown.opening-tapmove touchstart.opening-tapmove`, '.square-55d63', function(e) {
            if (!openingPracticeGame || openingPracticeGame.game_over()) return;
            if (!hieroglyphicExerciseActive && openingPracticeMoveCount >= OPENING_PRACTICE_MAX_PLIES) return;
            if (openingPracticeEngineThinking) return;

            if (e && e.preventDefault) e.preventDefault();

            const nowTs = Date.now();
            if (nowTs - openingLastTapEventTs < 180) return;
            openingLastTapEventTs = nowTs;

            const square = $(this).attr('data-square');
            if (!square) return;

            if (!openingTapSelectedSquare) {
                if (!openingLessonActive && !openingErrorPracticeActive && !hieroglyphicExerciseActive && openingPracticeGame.turn() !== openingPracticeUserColor) {
                    const noteEl = document.getElementById('opening-practice-note');
                    if (noteEl) noteEl.textContent = 'Espera la jugada del rival.';
                    return;
                }
                const p = openingPracticeGame.get(square);
                if (!p || p.color !== openingPracticeGame.turn()) return;
                openingTapSelectedSquare = square;
                highlightOpeningTapSelection(square);
                return;
            }

            if (square === openingTapSelectedSquare) {
                clearOpeningTapSelection();
                return;
            }

            const moved = commitOpeningMoveFromTap(openingTapSelectedSquare, square);
            if (moved) {
                clearOpeningTapSelection();
                return;
            }

            const p2 = openingPracticeGame.get(square);
            if (p2 && p2.color === openingPracticeGame.turn() && (openingLessonActive || openingErrorPracticeActive || hieroglyphicExerciseActive || openingPracticeGame.turn() === openingPracticeUserColor)) {
                openingTapSelectedSquare = square;
                highlightOpeningTapSelection(square);
            }
        });
}

function disableOpeningTapToMove() {
    if (!openingTapMoveEnabled) return;
    openingTapMoveEnabled = false;
    $('#opening-board').off('.opening-tapmove');
    const boardEl = document.getElementById('opening-board');
    if (boardEl) boardEl.style.touchAction = '';
    clearOpeningTapSelection();
}

function updateOpeningBoardInteractivity() {
    if (!openingBundleBoard) return;
    const shouldUseTap = controlMode === 'tap';
    openingBundleBoard.draggable = !shouldUseTap;
    if (shouldUseTap) {
        enableOpeningTapToMove();
    } else {
        disableOpeningTapToMove();
    }
}

let currentStreak = 0;
let lastPracticeDate = null;
let todayCompleted = false;
let missionsCompletionTime = null; // Guardarà l'hora de finalització

let totalStars = 0;
let todayMissions = [];
let missionsDate = null;
let unlockedBadges = [];

let sessionStats = { 
    gamesPlayed: 0, 
    gamesWon: 0, 
    bundlesSolved: 0,
    bundlesSolvedLow: 0,
    bundlesSolvedMed: 0,
    bundlesSolvedHigh: 0,
    highPrecisionGames: 0, 
    perfectGames: 0, 
    blackWins: 0,
    leagueGamesPlayed: 0,
    freeGamesPlayed: 0
};

let isAnalyzingHint = false;
let waitingForBlunderAnalysis = false;
let analysisStep = 0;
let tempAnalysisScore = 0;
let pendingBestMove = null;
let pendingEvalBefore = null;
let pendingEvalAfter = null;
let pendingAnalysisFen = null;
// Variables per captura enriquida de Stockfish
let pendingAnalysisDepth = null;
let pendingBestMovePv = [];
let pendingAlternatives = [];
let enrichedAnalysisBuffer = {};
let pendingGameOverAfterMoveAnalysis = false;
let gameOverWatchdogTimer = null;

// Xarxa de seguretat: si per qualsevol motiu l'anàlisi de l'última jugada no
// acaba (p. ex. el motor no respon), el final de partida (resultat + revisió)
// es mostra igualment passat un temps en lloc de quedar-se penjat indefinidament.
function armGameOverWatchdog() {
    if (gameOverWatchdogTimer) clearTimeout(gameOverWatchdogTimer);
    gameOverWatchdogTimer = setTimeout(() => {
        gameOverWatchdogTimer = null;
        if (pendingGameOverAfterMoveAnalysis && game && game.game_over()) {
            finalizeGameOver();
        }
    }, 6000);
}

// Punt únic de tancament de partida després de la jugada del jugador. Neteja el
// watchdog i evita que handleGameOver s'executi dues vegades.
function finalizeGameOver() {
    if (!pendingGameOverAfterMoveAnalysis) return;
    pendingGameOverAfterMoveAnalysis = false;
    if (gameOverWatchdogTimer) { clearTimeout(gameOverWatchdogTimer); gameOverWatchdogTimer = null; }
    waitingForBlunderAnalysis = false;
    runAfterPaint(() => handleGameOver());
}

let eloHistory = [];
let totalGamesPlayed = 0;
let totalWins = 0;
let maxStreak = 0;

// Lliga (mode escacs)
let currentLeague = null; 
let leagueActiveMatch = null; 

let currentGameMode = 'free';
let currentOpponent = null;
let eloChart = null;
let engineMoveTimeout = null;

const MISSION_TEMPLATES = [
    { id: 'play1', text: 'Juga 1 partida', stars: 1, check: () => sessionStats.gamesPlayed >= 1 },
    { id: 'playLeague', text: 'Juga 1 partida de lliga', stars: 1, check: () => sessionStats.leagueGamesPlayed >= 1 },
    { id: 'playFree', text: 'Juga 1 partida lliure', stars: 1, check: () => sessionStats.freeGamesPlayed >= 1 },
    { id: 'bundle1', text: 'Resol 1 errada', stars: 1, check: () => sessionStats.bundlesSolved >= 1 },
    { id: 'bundleLow', text: 'Resol 1 errada lleu', stars: 1, check: () => sessionStats.bundlesSolvedLow >= 1 },
    { id: 'precision70', text: 'Precisió +70%', stars: 1, check: () => sessionStats.highPrecisionGames >= 1 },
    
    { id: 'play3', text: 'Juga 3 partides', stars: 2, check: () => sessionStats.gamesPlayed >= 3 },
    { id: 'win2', text: 'Guanya 2 partides', stars: 2, check: () => sessionStats.gamesWon >= 2 },
    { id: 'bundle3', text: 'Resol 3 errades', stars: 2, check: () => sessionStats.bundlesSolved >= 3 },
    { id: 'bundleMed', text: 'Resol 1 errada mitjana', stars: 2, check: () => sessionStats.bundlesSolvedMed >= 1 },
    { id: 'precision85', text: 'Precisió +85%', stars: 2, check: () => sessionStats.perfectGames >= 1 },
    
    { id: 'play5', text: 'Juga 5 partides', stars: 3, check: () => sessionStats.gamesPlayed >= 5 },
    { id: 'win4', text: 'Guanya 4 partides', stars: 3, check: () => sessionStats.gamesWon >= 4 },
    { id: 'bundleHigh', text: 'Resol 1 errada greu', stars: 3, check: () => sessionStats.bundlesSolvedHigh >= 1 },
    { id: 'blackwin', text: 'Guanya amb negres', stars: 3, check: () => sessionStats.blackWins >= 1 }
];

const BADGES = [
    { id: 'rookie', name: 'Novell', stars: 5, icon: '🌱' },
    { id: 'apprentice', name: 'Aprenent', stars: 20, icon: '📚' },
    { id: 'skilled', name: 'Competent', stars: 50, icon: '⚔️' },
    { id: 'expert', name: 'Expert', stars: 100, icon: '🎖️' },
    { id: 'master', name: 'Mestre', stars: 200, icon: '👑' },
    { id: 'grandmaster', name: 'Gran mestre', stars: 400, icon: '🏆' },
    { id: 'legend', name: 'Llegenda', stars: 750, icon: '⭐' },
    { id: 'immortal', name: 'Immortal', stars: 1500, icon: '🔥' }
];

function getToday() { return new Date().toISOString().split('T')[0]; }

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
}

function generateLeagueName() {
    const a = ['Lliga', 'Copa', 'Circuit', 'Temporada', 'Torneig'];
    const b = ['del Tauler', 'dels Alfiles', 'de la Dama', 'del Cavall', 'dels Naips', 'del Rei', 'de l\'Escac'];
    const c = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
    const partA = a[randInt(0, a.length - 1)];
    const partB = b[randInt(0, b.length - 1)];
    const partC = c[randInt(0, c.length - 1)];
    return `${partA} ${partB} ${partC}`;
}

function buildRoundRobinSchedule(playerIds) {
    const ids = playerIds.slice();
    const fixed = ids[0];
    let rest = ids.slice(1);
    const rounds = [];
    const n = ids.length;

    for (let r = 0; r < n - 1; r++) {
        const roundArr = [fixed, ...rest];
        const pairings = [];
        for (let i = 0; i < n / 2; i++) {
            const aId = roundArr[i];
            const bId = roundArr[n - 1 - i];
            pairings.push([aId, bId]);
        }
        rounds.push(pairings);
        const last = rest.pop();
        rest = [last, ...rest];
    }
    return rounds;
}

function createNewLeague(force = false) {
    if (currentLeague && !force) return currentLeague;

    const baseNames = [
        'RocaNegra', 'AlfilFosc', 'CavallViu', 'DamaRàpida', 'ReiCalm', 'PeóFerm',
        'TorreVella', 'Gambit', 'Finalista', 'TrampaDolça', 'VellaGuàrdia', 'LíniaSòlida',
        'EscacIAnem', 'Fletxa', 'Diagonal', 'CasellaClara', 'CasellaFosca', 'XecMate'
    ];
    shuffleArray(baseNames);

    const bots = [];
    for (let i = 0; i < 9; i++) {
        const name = baseNames[i] || `Rival${i + 1}`;
        const elo = Math.max(50, userELO + randInt(-25, 25));
        bots.push({ id: `bot${i + 1}`, name: name, elo: elo, pj: 0, pg: 0, pp: 0, pe: 0, pts: 0 });
    }

    const me = { id: 'me', name: 'Tu', elo: userELO, pj: 0, pg: 0, pp: 0, pe: 0, pts: 0 };
    const players = [me, ...bots];

    const ids = ['me', ...shuffleArray(bots.map(b => b.id))];
    const schedule = buildRoundRobinSchedule(ids);

    currentLeague = {
        id: 'league_' + Date.now(),
        name: generateLeagueName(),
        createdAt: Date.now(),
        players: players,
        schedule: schedule,
        currentRound: 1,
        completed: false,
        history: [],
        // Ritme de la temporada. Es pot triar mentre no s'hagi jugat cap partit;
        // un cop començada, queda fixat (vegeu isLeagueTimeControlLocked).
        timeControl: 'none'
    };
    leagueActiveMatch = null;
    saveStorage();
    return currentLeague;
}

function getLeaguePlayer(id) {
    if (!currentLeague) return null;
    return currentLeague.players.find(p => p.id === id) || null;
}

function getCurrentUserLeagueRoc() {
    const value = (typeof userELO === 'number') ? userELO : currentElo;
    return Math.max(50, Math.round(value || 50));
}

function syncLeagueUserRoc() {
    const me = getLeaguePlayer('me');
    if (!me) return;
    // La lliga congela el ROC dels rivals quan es crea, però el jugador ha de
    // mostrar sempre el seu ROC actual si ha pujat o baixat fora de la lliga.
    me.elo = getCurrentUserLeagueRoc();
}

function getLeagueOpponentRoc(match = leagueActiveMatch) {
    if (match && typeof match.opponentRoc === 'number') return match.opponentRoc;
    const opponent = match ? getLeaguePlayer(match.opponentId) : null;
    if (opponent && typeof opponent.elo === 'number') return opponent.elo;
    return (currentOpponent && typeof currentOpponent.elo === 'number') ? currentOpponent.elo : currentElo;
}

function getLeaguePlayerElo(id) {
    const player = getLeaguePlayer(id);
    return player && typeof player.elo === 'number' ? player.elo : userELO;
}

function formatPts(v) {
    const isInt = Math.abs(v - Math.round(v)) < 1e-9;
    if (isInt) return String(Math.round(v));
    return (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
}

function leagueSort(players) {
    return players.slice().sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.pg !== a.pg) return b.pg - a.pg;
        if (b.elo !== a.elo) return b.elo - a.elo;
        return a.name.localeCompare(b.name);
    });
}

function getMyOpponentForRound(roundIndex) {
    if (!currentLeague) return null;
    const pairings = currentLeague.schedule[roundIndex];
    for (const [aId, bId] of pairings) {
        if (aId === 'me') return bId;
        if (bId === 'me') return aId;
    }
    return null;
}

function cloneLeaguePlayers() {
    if (!currentLeague) return [];
    return currentLeague.players.map(p => ({ ...p }));
}

function findPlayerRank(players, id) {
    const sorted = leagueSort(players);
    const idx = sorted.findIndex(p => p.id === id);
    return idx >= 0 ? idx + 1 : null;
}

function simulateRankAfterWin(opponentId) {
    if (!currentLeague) return null;
    const playersCopy = cloneLeaguePlayers();
    const me = playersCopy.find(p => p.id === 'me');
    const opp = playersCopy.find(p => p.id === opponentId);
    if (!me || !opp) return null;

    me.pj++; me.pg++; me.pts += 1;
    opp.pj++; opp.pp++;

    return findPlayerRank(playersCopy, 'me');
}

function isLeagueUnlocked() {
    return calibrationGames.length >= CALIBRATION_GAME_COUNT
        && totalGamesPlayed >= LEAGUE_UNLOCK_MIN_GAMES
        && !isCalibrationActive();
}

function updateLeagueAccessUI() {
    const leagueBtn = $('#btn-league');
    const unlocked = isLeagueUnlocked();
    if (leagueBtn.length) {
        leagueBtn.prop('disabled', !unlocked);
        leagueBtn.toggleClass('btn-disabled', !unlocked);
        if (unlocked) leagueBtn.removeAttr('title');
        else leagueBtn.attr('title', `Disponible després de ${LEAGUE_UNLOCK_MIN_GAMES} partides un cop calibrat.`);
    }
    if (!unlocked) $('#league-banner').hide();
    else updateLeagueBanner();
}

function updateLeagueBanner() {
    const banner = $('#league-banner');
    if (!banner.length) return;

     if (!isLeagueUnlocked()) {
        banner.hide();
        return;
    }

    createNewLeague(false);
    syncLeagueUserRoc();
    if (!currentLeague || currentLeague.completed) {
        banner.hide();
        return;
    }

    const roundIdx = currentLeague.currentRound - 1;
    const oppId = getMyOpponentForRound(roundIdx);
    const opp = oppId ? getLeaguePlayer(oppId) : null;
    if (!opp) { banner.hide(); return; }

    const myRank = findPlayerRank(currentLeague.players, 'me');
    const oppRank = findPlayerRank(currentLeague.players, opp.id);
    const projectedRank = simulateRankAfterWin(opp.id);

    $('#league-banner-opponent').text(opp.name);
    $('#league-banner-elo').text(opp.elo);
    $('#league-banner-opp-rank').text(oppRank ? `#${oppRank}` : '—');
    $('#league-banner-my-rank').text(myRank ? `#${myRank}` : '—');
    $('#league-banner-projected').text(projectedRank ? `#${projectedRank}` : '—');

    const quote = LEAGUE_QUOTES[Math.floor(Math.random() * LEAGUE_QUOTES.length)];
    $('#league-banner-quote').text(quote);

    banner.show();
}

function openLeague() {
    if (!isLeagueUnlocked()) {
        alert(`La lliga s'activa després de ${LEAGUE_UNLOCK_MIN_GAMES} partides un cop calibrat.`);
        return;
    }
    createNewLeague(false);
    $('#start-screen').hide(); $('#stats-screen').hide(); $('#settings-screen').hide(); $('#game-screen').removeClass('active').hide();
    $('#league-screen').show();
    renderLeague();
}

// La lliga queda fixada en el ritme escollit tan bon punt s'ha jugat el primer partit
// (o si ja ha acabat). Abans d'això, el ritme encara es pot canviar.
function isLeagueTimeControlLocked() {
    if (!currentLeague) return false;
    if (currentLeague.completed) return true;
    if (currentLeague.currentRound > 1) return true;
    const me = currentLeague.players ? currentLeague.players.find(p => p.id === 'me') : null;
    return !!(me && me.pj > 0);
}

function renderLeagueTimeControl() {
    if (!currentLeague) return;
    const id = currentLeague.timeControl || 'none';
    const cfg = TIME_CONTROLS.find(t => t.id === id) || TIME_CONTROLS[0];
    const locked = isLeagueTimeControlLocked();
    const sel = $('#league-tc-select');
    const lockedEl = $('#league-tc-locked');
    if (sel.length) {
        sel.val(id);
        sel.prop('disabled', locked).toggle(!locked);
    }
    if (lockedEl.length) {
        if (locked) lockedEl.text(`Rellotge: ${cfg.label} · fixat 🔒`).show();
        else lockedEl.hide();
    }
}

function renderLeague() {
    if (!currentLeague) return;
    syncLeagueUserRoc();

    $('#league-name').text(currentLeague.name);
    renderLeagueTimeControl();

    if (currentLeague.completed) {
        $('#league-round').text('Lliga acabada');
        $('#league-next').text('Proper rival: —');
        $('#btn-league-play').hide();
        $('#btn-league-new').show();
    } else {
        $('#league-round').text(`Jornada ${currentLeague.currentRound}/9`);
        const oppId = getMyOpponentForRound(currentLeague.currentRound - 1);
        const opp = oppId ? getLeaguePlayer(oppId) : null;
        $('#league-next').text(`Proper rival: ${opp ? opp.name : '—'}`);
        $('#btn-league-play').show();
        $('#btn-league-new').hide();
    }

    const sorted = leagueSort(currentLeague.players);
    const tbody = $('#league-table-body');
    tbody.empty();

    sorted.forEach((p, idx) => {
        const tr = $('<tr></tr>');
        if (p.id === 'me') tr.addClass('league-row-me');

        if (currentLeague.completed) {
            if (idx === 0) tr.addClass('league-podium-1');
            else if (idx === 1) tr.addClass('league-podium-2');
            else if (idx === 2) tr.addClass('league-podium-3');
        }

        const displayElo = (isCalibrationActive() && p.id === 'me') ? '—' : p.elo;
        tr.append(`
            <td class="league-player-cell">
                <span class="league-player-name">${p.name}</span>
            </td>
        `);
        tr.append(`<td class="league-elo-cell num">${displayElo}</td>`);
        tr.append(`<td class="num">${p.pj}</td>`);
        tr.append(`<td class="num">${p.pg}</td>`);
        tr.append(`<td class="num">${p.pp}</td>`);
        tr.append(`<td class="num">${p.pe}</td>`);
        tr.append(`<td class="num">${formatPts(p.pts)}</td>`);
        tbody.append(tr);
    });

    renderLeagueHistory();
}

function renderLeagueHistory() {
    const container = document.getElementById('league-history');
    if (!container) return;
    const hist = (currentLeague && Array.isArray(currentLeague.history)) ? currentLeague.history : [];
    if (!hist.length) {
        container.innerHTML = '<div class="league-history-empty">Encara no has jugat cap jornada en aquesta lliga.</div>';
        return;
    }
    const label = { win: 'Victòria', loss: 'Derrota', draw: 'Taules' };
    const cls = { win: 'lh-win', loss: 'lh-loss', draw: 'lh-draw' };
    let html = '<div class="league-history-title">Les teves jornades</div>';
    hist.slice().reverse().forEach(h => {
        html += `<div class="league-history-row">
            <span class="lh-round">J${h.round}</span>
            <span class="lh-opp">vs ${h.oppName}${h.oppElo ? ` · ${h.oppElo}` : ''}</span>
            <span class="lh-result ${cls[h.outcome] || ''}">${label[h.outcome] || '—'}</span>
        </div>`;
    });
    container.innerHTML = html;
}

function simulateOutcomeByElo(eloA, eloB) {
    const ea = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
    const diff = Math.abs(eloA - eloB);
    const drawBase = 0.20;
    const drawExtra = 0.15 * (1 - Math.min(diff / 350, 1));
    const pDraw = Math.min(0.45, Math.max(0.10, drawBase + drawExtra));

    const r = Math.random();
    if (r < pDraw) return 'draw';

    const r2 = (r - pDraw) / (1 - pDraw);
    return r2 < ea ? 'A' : 'B';
}

function applyResult(aId, bId, outcome) {
    const a = getLeaguePlayer(aId);
    const b = getLeaguePlayer(bId);
    if (!a || !b) return;

    a.pj++; b.pj++;

    if (outcome === 'draw') {
        a.pe++; b.pe++;
        a.pts += 0.5; b.pts += 0.5;
        return;
    }

    if (outcome === 'winA') {
        a.pg++; b.pp++;
        a.pts += 1;
        return;
    }

    if (outcome === 'winB') {
        b.pg++; a.pp++;
        b.pts += 1;
        return;
    }
}

function startLeagueRound() {
    if (!isLeagueUnlocked()) {
        alert(`La lliga s'activa després de ${LEAGUE_UNLOCK_MIN_GAMES} partides un cop calibrat.`);
        return;
    }   
    if (!currentLeague) createNewLeague(false);
    syncLeagueUserRoc();
    if (currentLeague.completed) return;

    const roundIdx = currentLeague.currentRound - 1;
    const oppId = getMyOpponentForRound(roundIdx);
    if (!oppId) { alert('No s\'ha pogut trobar rival'); return; }

    const opp = getLeaguePlayer(oppId);
    const opponentRoc = opp && typeof opp.elo === 'number' ? opp.elo : getCurrentUserLeagueRoc();
    leagueActiveMatch = {
        leagueId: currentLeague.id,
        round: currentLeague.currentRound,
        opponentId: oppId,
        opponentRoc,
        opponentName: opp ? opp.name : 'Rival'
    };
    currentGameMode = 'league';
    currentOpponent = { id: oppId, name: opp ? opp.name : 'Rival', elo: opponentRoc };
    saveStorage();

    startGame(false);
}

function applyLeagueAfterGame(myOutcome) {
    if (!currentLeague || !leagueActiveMatch) return;
    if (leagueActiveMatch.leagueId !== currentLeague.id) { leagueActiveMatch = null; saveStorage(); return; }

    const roundNumber = leagueActiveMatch.round;
    const roundIdx = roundNumber - 1;
    const oppId = leagueActiveMatch.opponentId;

    if (myOutcome === 'win') applyResult('me', oppId, 'winA');
    else if (myOutcome === 'loss') applyResult('me', oppId, 'winB');
    else applyResult('me', oppId, 'draw');

    // Desa el resultat de la meva ronda per a l'historial de la lliga
    const oppForHist = getLeaguePlayer(oppId);
    if (!Array.isArray(currentLeague.history)) currentLeague.history = [];
    currentLeague.history.push({
        round: roundNumber,
        oppName: oppForHist ? oppForHist.name : 'Rival',
        oppElo: oppForHist ? oppForHist.elo : null,
        outcome: myOutcome
    });

    const pairings = currentLeague.schedule[roundIdx] || [];
    for (const [aId, bId] of pairings) {
        if ((aId === 'me' || bId === 'me')) continue;

        const a = getLeaguePlayer(aId);
        const b = getLeaguePlayer(bId);
        if (!a || !b) continue;

        const sim = simulateOutcomeByElo(a.elo, b.elo);
        if (sim === 'draw') applyResult(aId, bId, 'draw');
        else if (sim === 'A') applyResult(aId, bId, 'winA');
        else applyResult(aId, bId, 'winB');
    }

    currentLeague.currentRound++;
    if (currentLeague.currentRound > 9) {
        currentLeague.completed = true;
    }

    leagueActiveMatch = null;
    saveStorage();
}

function generateDailyMissions() {
    const today = getToday();
    const now = Date.now();
    const oneHour = 3600 * 1000; // 1 hora en mil·lisegons

    // Comprovem si ha passat 1 hora des que es van completar
    let timePassed = false;
    if (missionsCompletionTime && (now - missionsCompletionTime > oneHour)) {
        timePassed = true;
    }

    // Si estem al mateix dia, tenim missions, i NO ha passat l'hora, no fem res.
    if (missionsDate === today && todayMissions.length === 3 && !timePassed) {
        updateMissionsDisplay();
        return;
    }

    // Si ha passat l'hora, resetegem el temps per la pròxima tanda
    if (timePassed) {
        missionsCompletionTime = null;
    }

    missionsDate = today;
    
    // MODIFICACIÓ CLAU: La "seed" ara inclou l'hora per garantir que les noves missions siguin diferents
    // encara que sigui el mateix dia.
    const seedString = today.split('-').join('') + (timePassed ? 'v2' : ''); 
    // Nota: 'v2' és un exemple, cada cop que es completin canviarà l'atzar lleugerament
    
    // Per fer-ho senzill i que variï sempre si regenerem, fem servir un random pur si regenerem intra-dia
    const rng = timePassed ? Math.random : mulberry32(parseInt(today.split('-').join('')));

    const easy = MISSION_TEMPLATES.filter(m => m.stars === 1);
    const medium = MISSION_TEMPLATES.filter(m => m.stars === 2);
    const hard = MISSION_TEMPLATES.filter(m => m.stars === 3);
    
    // Funció auxiliar per triar random
    const pick = (arr) => arr[Math.floor((timePassed ? Math.random() : rng()) * arr.length)];

    todayMissions = [
        { ...pick(easy), completed: false },
        { ...pick(medium), completed: false },
        { ...pick(hard), completed: false }
    ];

    // Reiniciem estadístiques parcials de sessió per a les noves missions
    sessionStats = { 
        gamesPlayed: 0, gamesWon: 0, bundlesSolved: 0, 
        bundlesSolvedLow: 0, bundlesSolvedMed: 0, bundlesSolvedHigh: 0,
        highPrecisionGames: 0, perfectGames: 0, blackWins: 0,
        leagueGamesPlayed: 0, freeGamesPlayed: 0
    };
    
    saveStorage();
    updateMissionsDisplay();
}

function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

function updateMissionsDisplay() {
    const container = $('#missions-list'); container.empty();
    const targets = { 
        play1: 1, play3: 3, play5: 5, win2: 2, win4: 4, 
        bundle1: 1, bundle3: 3, precision70: 1, precision85: 1, blackwin: 1,
        playLeague: 1, playFree: 1, bundleLow: 1, bundleMed: 1, bundleHigh: 1
    };
    const getValue = (id) => {
        if (id === 'playLeague') return sessionStats.leagueGamesPlayed;
        if (id === 'playFree') return sessionStats.freeGamesPlayed;
        if (id === 'bundleLow') return sessionStats.bundlesSolvedLow;
        if (id === 'bundleMed') return sessionStats.bundlesSolvedMed;
        if (id === 'bundleHigh') return sessionStats.bundlesSolvedHigh;
        
        if (id.startsWith('play')) return sessionStats.gamesPlayed;
        if (id.startsWith('win')) return sessionStats.gamesWon;
        if (id.startsWith('bundle')) return sessionStats.bundlesSolved;
        if (id === 'precision70') return sessionStats.highPrecisionGames;
        if (id === 'precision85') return sessionStats.perfectGames;
        if (id === 'blackwin') return sessionStats.blackWins;
        return 0;
    };
    todayMissions.forEach((mission) => {
        const stars = '★'.repeat(mission.stars);
        const completedClass = mission.completed ? 'completed' : '';
        const target = targets[mission.id] || 1;
        const val = getValue(mission.id);
        const stepsDone = Math.min(val, target);
        const trophies = '🏆'.repeat(stepsDone);
        const trophiesClass = stepsDone === 0 ? 'empty' : '';
        const progressText = mission.completed ? 'Fet' : `${stepsDone}/${target}`;
        container.append(
            `<div class="mission-item ${completedClass}">
                <div class="mission-stars">${stars}</div>
                <div class="mission-text">
                    <div class="mission-label">${mission.text}</div>
                    <div class="mission-progress">${progressText}</div>
                </div>
                <div class="mission-check">★</div>
                <div class="mission-trophies ${trophiesClass}">${trophies}</div>
            </div>`
        );
    });
}

function checkMissions() {
    let newStarsEarned = 0;
    let allCompletedBefore = todayMissions.every(m => m.completed); // Estat abans de comprovar

    todayMissions.forEach((mission, idx) => {
        if (!mission.completed && mission.check()) {
            mission.completed = true; newStarsEarned += mission.stars;
        }
    });

    // NOVA LÒGICA: Si totes estan completes i abans no ho estaven (o no tenim temps guardat)
    if (todayMissions.every(m => m.completed) && !missionsCompletionTime) {
        missionsCompletionTime = Date.now(); // Guardem el moment actual
        saveStorage();
    }

    if (newStarsEarned > 0) {
        const oldStars = totalStars; totalStars += newStarsEarned;
        saveStorage(); updateMissionsDisplay(); updateDisplay(); checkNewBadges(oldStars, totalStars);
    }
}

function checkNewBadges(oldStars, newStars) {
    BADGES.forEach(badge => {
        if (oldStars < badge.stars && newStars >= badge.stars) {
            if (!unlockedBadges.includes(badge.id)) {
                unlockedBadges.push(badge.id); showNewBadge(badge); saveStorage();
            }
        }
    });
}

// Trofeus d'obertures i de tàctiques (categories addicionals)
const OPENING_BADGES = [
    { id: 'op_first', name: 'Primera obertura', req: 1, icon: '📖' },
    { id: 'op_five', name: 'Repertori inicial', req: 5, icon: '📚' },
    { id: 'op_ten', name: 'Estudiós', req: 10, icon: '🎓' },
    { id: 'op_twenty', name: 'Teòric', req: 20, icon: '🧠' },
    { id: 'op_all', name: 'Mestre d\'obertures', req: 28, icon: '👑' }
];
const TACTICS_BADGES = [
    { id: 'tac_first', name: 'Primera tàctica', req: 1, icon: '⚡' },
    { id: 'tac_ten', name: 'Combinador', req: 10, icon: '🗡️' },
    { id: 'tac_fifty', name: 'Tàctic afinat', req: 50, icon: '🎯' },
    { id: 'tac_streak', name: 'Ratxa de foc (5 seguides)', req: 5, icon: '🔥', kind: 'streak' }
];

function checkOpeningBadges() {
    const count = completedOpenings.filter(e => CURATED_OPENINGS.some(op => op.eco === e)).length;
    OPENING_BADGES.forEach(b => {
        if (count >= b.req && !unlockedBadges.includes(b.id)) {
            unlockedBadges.push(b.id); showNewBadge(b, `${b.req} obertures apreses`); saveStorage();
        }
    });
}

function checkTacticsBadges() {
    TACTICS_BADGES.forEach(b => {
        const val = b.kind === 'streak' ? (tacticsStats.best || 0) : tacticsStats.solved;
        if (val >= b.req && !unlockedBadges.includes(b.id)) {
            unlockedBadges.push(b.id); showNewBadge(b, b.kind === 'streak' ? `${b.req} seguides` : `${b.req} tàctiques resoltes`); saveStorage();
        }
    });
}

function showNewBadge(badge, subtitle) {
    $('#new-badge-icon').text(badge.icon); $('#new-badge-name').text(badge.name);
    const sub = subtitle || ('★'.repeat(Math.min((badge.stars || 0) / 10, 10)) + ` (${badge.stars}★)`);
    $('#new-badge-stars').text(sub);
    $('#new-badge-modal').css('display', 'flex');
}

function updateBadgesModal() {
    $('#modal-total-stars').text(totalStars); const grid = $('#badges-grid'); grid.empty();
    BADGES.forEach(badge => {
        const isUnlocked = totalStars >= badge.stars; const statusClass = isUnlocked ? 'unlocked' : 'locked';
        grid.append(`<div class="badge-item ${statusClass}"><div class="badge-icon">${badge.icon}</div><div class="badge-name">${badge.name}</div><div class="badge-req">${badge.stars}★</div></div>`);
    });
    const opCount = completedOpenings.filter(e => CURATED_OPENINGS.some(op => op.eco === e)).length;
    grid.append('<div class="badge-cat-title">📖 Obertures</div>');
    OPENING_BADGES.forEach(b => {
        const unlocked = opCount >= b.req; const statusClass = unlocked ? 'unlocked' : 'locked';
        grid.append(`<div class="badge-item ${statusClass}"><div class="badge-icon">${b.icon}</div><div class="badge-name">${b.name}</div><div class="badge-req">${b.req} obert.</div></div>`);
    });
    grid.append('<div class="badge-cat-title">⚡ Tàctiques</div>');
    TACTICS_BADGES.forEach(b => {
        const val = b.kind === 'streak' ? (tacticsStats.best || 0) : tacticsStats.solved;
        const unlocked = val >= b.req; const statusClass = unlocked ? 'unlocked' : 'locked';
        grid.append(`<div class="badge-item ${statusClass}"><div class="badge-icon">${b.icon}</div><div class="badge-name">${b.name}</div><div class="badge-req">${b.kind === 'streak' ? b.req + ' seg.' : b.req}</div></div>`);
    });
}

function getYesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }

function checkStreak() {
    const today = getToday(); const yesterday = getYesterday();
    if (lastPracticeDate === today) todayCompleted = true;
    else if (lastPracticeDate === yesterday) todayCompleted = false;
    else if (lastPracticeDate && lastPracticeDate !== today) {
        currentStreak = 0; todayCompleted = false;
    }
    updateStreakDisplay();
}

function recordActivity() {
    const today = getToday();
    if (lastPracticeDate !== today) {
        if (lastPracticeDate === getYesterday()) currentStreak++;
        else if (!lastPracticeDate || lastPracticeDate !== today) currentStreak = 1;
        lastPracticeDate = today; todayCompleted = true;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
        saveStorage();
    }
    updateStreakDisplay();
}

function updateStreakDisplay() {
    $('#current-streak').text(currentStreak);
    const streakBox = $('#streak-box'); const statusEl = $('#streak-status');
    if (todayCompleted) { statusEl.removeClass('streak-pending').addClass('streak-done').text('✓ Fet'); streakBox.addClass('active'); } 
    else { statusEl.removeClass('streak-done').addClass('streak-pending').text('Pendent'); streakBox.removeClass('active'); }
}

function restoreMissions(savedList) {
    if (!Array.isArray(savedList)) return [];
    return savedList
        .map(saved => {
            const template = MISSION_TEMPLATES.find(t => t.id === saved.id);
            if (!template) return null;
            return { ...template, completed: !!saved.completed };
        })
        .filter(Boolean);
}

function clampEngineElo(elo) {
    // Delega a ElTaulerCore (core.js). A la branca isNaN s'usa currentElo com a
    // fallback; evitem referenciar-lo quan no cal per no topar amb la TDZ durant
    // la inicialització de currentElo.
    return isNaN(elo)
        ? ElTaulerCore.clampElo(currentElo, ELO_MIN, ELO_MAX)
        : ElTaulerCore.clampElo(elo, ELO_MIN, ELO_MAX);
}

// Converteix un ROC (escala pròpia 200-2000) a un UCI_Elo VÀLID per a Stockfish.
//
// Model de força en dues etapes (coherent i interpretable pel motor):
//   - ROC < terra del motor (~1350): el motor no pot jugar tan fluix amb UCI_Elo, així que el
//     fixem al terra i la força efectiva és PROPORCIONAL a la fracció ROC/terra (vegeu
//     getStrengthNormalized): la profunditat reduïda (eloToSearchDepth) i la selecció humana de
//     moviments (chooseHumanLikeMove) escalen linealment amb aquesta proporció. Així un ROC X
//     equival al X/1350 de la força del motor al seu terra: relació proporcional amb Stockfish,
//     que és la franja on jugarà la majoria d'usuaris.
//   - ROC >= terra del motor: ROC == UCI_Elo real, de manera que el nivell mostrat
//     coincideix amb la força exacta que Stockfish reprodueix.
//
// Així evitem el retall silenciós que abans feia que tots els ROC baixos fossin idèntics
// per al motor, i el rang s'adapta automàticament al binari realment carregat.
function rocToEngineElo(roc) {
    return ElTaulerCore.rocToEngineElo(roc, engineEloMin, engineEloMax);
}

function difficultyToLevel(legacyDifficulty) {
    // Converteix l'antic rang 5-15 a ELO adaptatiu
    return ElTaulerCore.difficultyToLevel(legacyDifficulty, ADAPTIVE_CONFIG.MIN_LEVEL, ADAPTIVE_CONFIG.MAX_LEVEL);
}

function levelToDifficulty(level) {
    // Manté la compatibilitat amb l'antic rang 5-15
    return ElTaulerCore.levelToDifficulty(level, ADAPTIVE_CONFIG.MIN_LEVEL, ADAPTIVE_CONFIG.MAX_LEVEL);
}

function getAdaptiveNormalized() {
     return ElTaulerCore.normalize(currentElo, ADAPTIVE_CONFIG.MIN_LEVEL, ADAPTIVE_CONFIG.MAX_LEVEL);
}

// Força efectiva real de l'enginy en aquesta partida (mateix model per calibratge i joc lliure).
function getActiveStrengthElo() {
    if (isCalibrationGame) return currentCalibrationOpponentRoc || CALIBRATION_ROCS[0];
    if (currentGameMode === 'league' && leagueActiveMatch) return getLeagueOpponentRoc(leagueActiveMatch);
    return currentElo;
}

// Fracció de força respecte el TERRA real de Stockfish (~1350, detectat dinàmicament): roc/terra,
// limitada a [0.05, 1]. Aquesta és la clau de la relació PROPORCIONAL amb Stockfish: per sota del
// terra, la força efectiva (profunditat + humanització) escala proporcionalment amb aquesta fracció,
// de manera que un ROC X equival a la fracció X/1350 de la força del motor al seu terra. Al terra i
// per sobre val 1: Stockfish ja controla la força amb UCI_Elo i no cal afegir-hi soroll.
function getStrengthNormalized() {
    const floor = engineEloMin || 1350;
    return Math.max(0.05, Math.min(1, getActiveStrengthElo() / floor));
}

function eloToSearchDepth(elo) {
    return ElTaulerCore.eloToSearchDepth(elo, engineEloMin || 1350, ELO_MAX);
}

function adjustAIDifficulty(playerWon, precision, resultScore = null) {
    const normalizedScore = (typeof resultScore === 'number') ? resultScore : (playerWon ? 1 : 0);
    const safePrecision = Math.max(0, Math.min(100, typeof precision === 'number' ? precision : 50));

    recentGames.push({ result: normalizedScore, precision: safePrecision });
    if (recentGames.length > 20) recentGames.shift();
    
    if (normalizedScore === 1) { consecutiveWins++; consecutiveLosses = 0; } 
    else if (normalizedScore === 0) { consecutiveLosses++; consecutiveWins = 0; }
    else { consecutiveWins = 0; consecutiveLosses = 0; }

    if (isCalibrating) {
        saveStorage();
        return;
    }

    const eloDelta = ElTaulerCore.computeEloDelta({
        normalizedScore,
        precision: safePrecision,
        consecutiveWins,
        consecutiveLosses,
        recentGames
    });
    currentElo = clampEngineElo(currentElo + eloDelta);
    aiDifficulty = levelToDifficulty(currentElo);
    applyEngineEloStrength(currentElo);
    saveStorage();
}

function getCalibrationRocFloor() {
    if (typeof calibrationRocFloor === 'number') return calibrationRocFloor;
    if (calibrationProfile && typeof (calibrationProfile.roc ?? calibrationProfile.elo) === 'number') return calibrationProfile.roc ?? calibrationProfile.elo;
    return userELO;
}

function clampUserElo(value) {
    return ElTaulerCore.clampUserElo(value, getCalibrationRocFloor(), ELO_MIN, ELO_MAX);
}

function evaluateGameQuality(precision, avgCpLoss, blunders) {
    return ElTaulerCore.evaluateGameQuality(precision, avgCpLoss, blunders, CONTINUOUS_ADJUST_CONFIG);
}

function logEloAdjustment(entry) {
    adjustmentLog.push(entry);
    if (adjustmentLog.length > 120) adjustmentLog = adjustmentLog.slice(-120);
    saveStorage();
}

function checkEloMilestones(previousElo, newElo) {
    const unlocked = ElTaulerCore.getNewlyUnlockedMilestones(previousElo, newElo, ELO_MILESTONES, unlockedEloMilestones);
    unlocked.forEach(milestone => unlockedEloMilestones.push(milestone));
    return unlocked;
}

function applyContinuousEloAdjustment(delta, reason, meta = {}) {
    const previousElo = userELO;
    const cappedDelta = Math.max(-CONTINUOUS_ADJUST_CONFIG.MAX_CYCLE_DELTA, Math.min(CONTINUOUS_ADJUST_CONFIG.MAX_CYCLE_DELTA, delta));
    const nextElo = clampUserElo(previousElo + cappedDelta);
    const appliedDelta = nextElo - previousElo;
    if (appliedDelta === 0) return null;

    userELO = nextElo;
    updateEloHistory(userELO);
    syncEngineEloFromUser();

    const timestamp = new Date().toISOString();
    logEloAdjustment({
        timestamp: timestamp,
        previousElo: previousElo,
        newElo: userELO,
        delta: appliedDelta,
        reason: reason,
        trend: meta.trend || null,
        cycle: meta.cycle || null
    });

    let message = appliedDelta > 0
        ? `Has millorat! Nou nivell: ${userELO} ↗`
        : `Nivell ajustat: ${userELO} ↘`;
    const milestones = checkEloMilestones(previousElo, userELO);
    if (milestones.length) {
        message += ` · Assoliment ELO ${milestones[milestones.length - 1]} ✨`;
    }
    return { delta: appliedDelta, message: message };
}

function getBaselineAdjustmentDelta(resultLabel, qualityScore) {
    return ElTaulerCore.getBaselineAdjustmentDelta(resultLabel, qualityScore);
}

function registerFreeGameAdjustment(resultScore, precision, metrics = {}) {
    const quality = evaluateGameQuality(precision, metrics.avgCpLoss, metrics.blunders);
    const resultLabel = resultScore === 1 ? 'win' : resultScore === 0 ? 'loss' : 'draw';

    // Mantenim un historial recent també en joc lliure per al control de win-rate (flow).
    recentGames.push({ result: resultScore, precision: precision });
    if (recentGames.length > 20) recentGames.shift();

    freeAdjustmentWindow.push({
        result: resultLabel,
        precision: precision,
        avgCpLoss: metrics.avgCpLoss || 0,
        blunders: metrics.blunders || 0,
        qualityScore: quality.qualityScore,
        isHighQuality: quality.isHighQuality,
        hasErrors: quality.hasErrors
    });
    if (freeAdjustmentWindow.length > CONTINUOUS_ADJUST_CONFIG.WINDOW_SIZE) {
        freeAdjustmentWindow = freeAdjustmentWindow.slice(-CONTINUOUS_ADJUST_CONFIG.WINDOW_SIZE);
    }

    if (resultLabel === 'loss') freeLossStreak++;
    else freeLossStreak = 0;

    let feedback = null;
    const baselineDelta = getBaselineAdjustmentDelta(resultLabel, quality.qualityScore);
    if (baselineDelta !== 0) {
        const baselineAdjustment = applyContinuousEloAdjustment(
            baselineDelta,
            'Ajust fi per resultat',
            { cycle: 'baseline' }
        );
        if (baselineAdjustment) {
            feedback = baselineAdjustment.message;
        }
    }
    if (freeLossStreak >= CONTINUOUS_ADJUST_CONFIG.LOSS_STREAK_TRIGGER) {
        const relief = applyContinuousEloAdjustment(
            CONTINUOUS_ADJUST_CONFIG.LOSS_STREAK_DELTA,
            'Protecció per ratxa de derrotes',
            { cycle: 'streak' }
        );
        if (relief) {
            feedback = relief.message + ' · Prova hints o mode entrenament';
        } else {
            feedback = 'Prova hints o mode entrenament';
        }
        freeLossStreak = 0;
    }

    // Control proactiu de win-rate: manté el jugador "enganxat" apuntant a ~50% de victòries.
    // Si guanya massa, apugem el repte; si perd massa, l'abaixem de seguida (sense esperar el cicle).
    if (recentGames.length >= ADAPTIVE_CONFIG.FLOW_WINDOW_MIN) {
        const sample = recentGames.slice(-ADAPTIVE_CONFIG.FLOW_SAMPLE_SIZE);
        const wins = sample.filter(g => g.result === 1).length;
        const winRate = wins / sample.length;
        if (winRate > ADAPTIVE_CONFIG.FLOW_WINRATE_HIGH) {
            const flow = applyContinuousEloAdjustment(ADAPTIVE_CONFIG.FLOW_DELTA, 'Ritme de victòries alt: apugem el repte', { cycle: 'flow' });
            if (flow) feedback = flow.message;
        } else if (winRate < ADAPTIVE_CONFIG.FLOW_WINRATE_LOW) {
            const flow = applyContinuousEloAdjustment(-ADAPTIVE_CONFIG.FLOW_DELTA, 'Ritme de derrotes alt: abaixem el repte', { cycle: 'flow' });
            if (flow) feedback = flow.message;
        }
    }

    if (freeAdjustmentWindow.length < CONTINUOUS_ADJUST_CONFIG.WINDOW_SIZE) {
        saveStorage();
        return { feedback: feedback };
    }

    const cycle = freeAdjustmentWindow.slice(0, CONTINUOUS_ADJUST_CONFIG.WINDOW_SIZE);
    freeAdjustmentWindow = [];

    const wins = cycle.filter(game => game.result === 'win').length;
    const losses = cycle.filter(game => game.result === 'loss').length;
    const highQuality = cycle.filter(game => game.isHighQuality).length;
    const errors = cycle.filter(game => game.hasErrors).length;
    const avgQuality = cycle.reduce((sum, game) => sum + game.qualityScore, 0) / (cycle.length || 1);
    let trend = null;
    if (typeof lastAdjustmentQualityAvg === 'number') {
        if (avgQuality - lastAdjustmentQualityAvg > 0.08) trend = 'millora';
        if (lastAdjustmentQualityAvg - avgQuality > 0.08) trend = 'empitjorament';
    }
    lastAdjustmentQualityAvg = avgQuality;

    let delta = 0;
    let reason = 'Nivell estable';
    if (wins >= CONTINUOUS_ADJUST_CONFIG.WIN_THRESHOLD && highQuality >= CONTINUOUS_ADJUST_CONFIG.WIN_THRESHOLD) {
        delta = CONTINUOUS_ADJUST_CONFIG.WIN_ELO;
        reason = 'Rendiment alt en 2/3 partides';
    } else if (losses >= CONTINUOUS_ADJUST_CONFIG.LOSS_THRESHOLD && errors >= CONTINUOUS_ADJUST_CONFIG.LOSS_THRESHOLD) {
        delta = CONTINUOUS_ADJUST_CONFIG.LOSS_ELO;
        reason = 'Errors repetits en 2/3 partides';
    }

    if (delta === 0) {
        saveStorage();
        return { feedback: feedback };
    }

    const adjustment = applyContinuousEloAdjustment(delta, reason, { trend: trend, cycle: cycle });
    saveStorage();
    if (adjustment && feedback) {
        return { feedback: `${adjustment.message} · ${feedback}` };
    }
    if (adjustment) return { feedback: adjustment.message };
    return { feedback: feedback };
}

 function isCalibrationActive() {
    return isCalibrating && calibrationGames.length < CALIBRATION_GAME_COUNT;
}

  function getCalibrationGameIndex() {
    return Math.min(calibrationGames.length, CALIBRATION_GAME_COUNT - 1);
}

function clampCalibrationRoc(roc) {
    return ElTaulerCore.clampCalibrationRoc(roc, CALIBRATION_ROC_MIN, CALIBRATION_ROC_MAX);
}

// Cerca adaptativa del nivell: parteix del ROC inicial i, segons el resultat de l'última
// partida, adapta el rival (guanya → puja; perd → baixa; taules → lleugera pujada) amb passos
// decreixents perquè convergeixi cap al nivell real del jugador. No segueix una escala fixa.
function getCalibrationOpponentRoc() {
    return ElTaulerCore.getCalibrationOpponentRoc(calibrationGames, {
        startRoc: CALIBRATION_START_ROC,
        steps: CALIBRATION_STEPS,
        rocMin: CALIBRATION_ROC_MIN,
        rocMax: CALIBRATION_ROC_MAX
    });
}

function getCalibrationProgressCount() {
    const extra = isCalibrationGame ? 1 : 0;
    return Math.min(calibrationGames.length + extra, CALIBRATION_GAME_COUNT);
}

function updateCalibrationProgressUI() {
    const container = $('#calibration-progress');
    if (!container.length) return;
    if (!isCalibrationActive()) {
        container.hide();
        return;
    }
    const progressCount = getCalibrationProgressCount();
    $('#calibration-progress-text').text(`Calibrant... Partida ${progressCount}/${CALIBRATION_GAME_COUNT}`);
    $('#calibration-progress-fill').css('width', `${Math.round((progressCount / CALIBRATION_GAME_COUNT) * 100)}%`);
    container.show();
}

function isCalibrationRequired() {
    return !calibratgeComplet;
}

function updateCalibrationAccessUI() {
    const lock = isCalibrationRequired();
    const lockableButtons = $('#btn-league, #btn-bundle-menu');
    lockableButtons.prop('disabled', lock).toggleClass('btn-disabled', lock);
    const leagueBanner = $('#league-banner');
    if (lock) leagueBanner.addClass('disabled'); else leagueBanner.removeClass('disabled');
}

function getCalibrationGameQuality(game) {
    return ElTaulerCore.getCalibrationGameQuality(game);
}

function getCalibrationPerformanceScore(games = calibrationGames) {
    return ElTaulerCore.getCalibrationPerformanceScore(games);
}

function estimateCalibrationRoc() {
    if (!calibrationGames.length) return clampEngineElo(ADAPTIVE_CONFIG.DEFAULT_LEVEL);
    const weighted = calibrationGames.map((game, idx) => {
        const resultScore = game.result === 'win' ? 1 : game.result === 'loss' ? 0 : 0.5;
        const quality = getCalibrationGameQuality(game);
        const performance = (quality * 0.4) + (resultScore * 0.6);
        const weight = 1 + (idx * 0.1);
        return { performance, weight, opponentElo: game.opponentElo || null };
    });
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    const weightedPerformance = weighted.reduce((sum, item) => sum + (item.performance * item.weight), 0) / (totalWeight || 1);
    // Mitjana del ROC dels rivals ponderada cap a les últimes partides: així el valor on ha
    // convergit la cerca adaptativa (el nivell trobat) domina sobre el punt de partida inicial.
    const opponentItems = weighted.filter(item => typeof item.opponentElo === 'number' && !isNaN(item.opponentElo));
    const opponentWeight = opponentItems.reduce((sum, item) => sum + item.weight, 0);
    const avgOpponentElo = opponentItems.length
        ? opponentItems.reduce((sum, item) => sum + (item.opponentElo * item.weight), 0) / (opponentWeight || 1)
        : clampCalibrationRoc(CALIBRATION_START_ROC);
    const performanceDelta = (weightedPerformance - 0.5) * 250;
    const confidence = Math.min(1, calibrationGames.length / CALIBRATION_GAME_COUNT);
    const conservativeBias = -50;
    const eloEstimate = avgOpponentElo + (performanceDelta * confidence) + conservativeBias;
    return Math.max(CALIBRATION_ROC_MIN, Math.min(CALIBRATION_ROC_MAX, Math.round(eloEstimate)));
}

function showCalibrationReveal(rocValue) {
    const statusEl = $('#status');
    if (!statusEl.length) return;
    statusEl.text(`Calibratge completat! El teu nivell inicial és: ${rocValue} ROC ♟️`).addClass('elo-reveal');
    setTimeout(() => statusEl.removeClass('elo-reveal'), 2200);
}

function finalizeCalibrationFromGames() {
    const estimatedRoc = estimateCalibrationRoc();
    userELO = Math.max(50, estimatedRoc);
    calibrationRocFloor = userELO;
    updateEloHistory(userELO);
    syncEngineEloFromUser();
    isCalibrating = false;
    calibratgeComplet = true;
    currentCalibrationOpponentRoc = null;
    calibrationProfile = {
        roc: userELO,
        completedAt: new Date().toISOString(),
        games: calibrationGames.slice()
    };
    saveStorage();
    updateDisplay();
}

function recordCalibrationGame(resultScore, precision, metrics) {
    const safePrecision = Math.max(0, Math.min(100, typeof precision === 'number' ? precision : 0));
    const result = resultScore === 1 ? 'win' : resultScore === 0 ? 'loss' : 'draw';
    const opponentElo = typeof currentCalibrationOpponentRoc === 'number' ? currentCalibrationOpponentRoc : getCalibrationOpponentRoc();
    const gameMetrics = metrics || {};
    calibrationGames.push({
        opponentElo: opponentElo,
        result: result,
        precision: safePrecision,
        durationSeconds: gameMetrics.durationSeconds || 0,
        avgCpLoss: gameMetrics.avgCpLoss || 0,
        blunders: gameMetrics.blunders || 0,
        tacticalPatterns: gameMetrics.tacticalPatterns || []
    });
    if (calibrationGames.length >= CALIBRATION_GAME_COUNT) {
        finalizeCalibrationFromGames();
        return true;
    } else {
        saveStorage();
        updateCalibrationProgressUI();
        return false;
    }
}

function getOpponentElo() {
    if (isCalibrationGame && typeof currentCalibrationOpponentRoc === 'number') return currentCalibrationOpponentRoc;
    return (currentOpponent && typeof currentOpponent.elo === 'number') ? currentOpponent.elo : userELO;
}

function getAIDepth() {
    const randomness = Math.floor(Math.random() * 3) - 1;

    if (isCalibrationGame || currentGameMode !== 'league') {
        // Mateixa corba de profunditat per calibratge i joc lliure: deriva de l'ELO actiu.
        return Math.max(1, Math.min(15, eloToSearchDepth(getActiveStrengthElo()) + randomness));
    }

    const oppElo = getOpponentElo();
    const myLeagueElo = getLeaguePlayerElo('me');
    const delta = (oppElo - myLeagueElo);
    const base = 8 + Math.round(delta / 250); 
    return Math.max(1, Math.min(15, base + randomness));
}

function calculateEloDelta(resultScore) {
    const oppElo = getOpponentElo();
    const expected = 1 / (1 + Math.pow(10, (oppElo - userELO) / 400));
    const kFactor = 24;
    const raw = kFactor * (resultScore - expected);

    if (resultScore === 0) return Math.min(-8, Math.round(raw));
    if (resultScore === 1) return Math.max(8, Math.round(raw));
    return Math.round(raw);
}

function formatEloChange(delta) {
    return `${delta > 0 ? '+' : ''}${delta}`;
}

function resetEngineMoveCandidates() {
    engineMoveCandidates = [];
}

function resetOpeningEngineMoveCandidates() {
    openingEngineMoveCandidates = [];
}

function trackEngineCandidate(msg) {
    if (msg.indexOf('multipv') === -1 || msg.indexOf(' pv ') === -1) return;
    const targetCandidates = isEngineThinking
        ? engineMoveCandidates
        : ((openingPracticeEngineThinking && stockfishRequestor === 'opening-engine') ? openingEngineMoveCandidates : null);
    if (!targetCandidates) return;
    const pvMatch = msg.match(/multipv\s+(\d+).*?\spv\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
    if (!pvMatch) return;

    let score = 0;
    const cpMatch = msg.match(/score cp (-?\d+)/);
    if (cpMatch) score = parseInt(cpMatch[1]);
    const mateMatch = msg.match(/score mate (-?\d+)/);
    if (mateMatch) {
        const mateVal = parseInt(mateMatch[1]);
        score = mateVal > 0 ? 10000 : -10000;
    }

    const multipv = parseInt(pvMatch[1]);
    const move = pvMatch[2];
    const existingIdx = targetCandidates.findIndex(c => c.multipv === multipv);
    const candidate = { multipv, move, score };
    if (existingIdx >= 0) targetCandidates[existingIdx] = candidate;
    else targetCandidates.push(candidate);
}

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Heurística d'"atractiu humà": com de natural sembla una jugada per a una persona.
// Els errors humans solen ser jugades amb intenció aparent (capturar material, fer escac,
// desenvolupar peces, ocupar el centre, enrocar), NO moviments aleatoris (peons de banda
// sense motiu, passejar el rei). Com més alt l'atractiu, més probable que un humà la jugui.
function humanMoveAppeal(mv) {
    if (!mv) return 1;
    let appeal = 1;
    const san = mv.san || '';
    if (san.includes('#')) appeal += 40;            // ningú falla un mat evident
    else if (san.includes('+')) appeal += 1.5;      // els escacs semblen forçats
    if (mv.captured) appeal += 2 + (PIECE_VALUE[mv.captured] || 0); // copejar material atrau (sovint massa)
    if (mv.flags && (mv.flags.includes('k') || mv.flags.includes('q'))) appeal += 1.5; // enrocar
    if (mv.piece === 'n' || mv.piece === 'b') appeal += 0.8; // desenvolupar peces menors
    const file = mv.to.charCodeAt(0) - 97;
    const rank = parseInt(mv.to[1], 10) - 1;
    const centerDist = Math.abs(3.5 - file) + Math.abs(3.5 - rank);
    appeal += (7 - centerDist) * 0.15;              // el centre crida més que la banda
    if (mv.piece === 'p' && !mv.captured && (file === 0 || file === 7)) appeal -= 1.5; // peó de banda sense motiu
    if (mv.piece === 'k' && !(mv.flags && (mv.flags.includes('k') || mv.flags.includes('q')))) appeal -= 1.2; // passejar el rei
    return Math.max(0.05, appeal);
}

// Pèrdua de material immediata (en peons) després d'una jugada, amb una recaptura simple
// a la mateixa casella (SEE-lite a 1 jugada). Serveix per evitar regals catastròfics —p. ex.
// penjar la dama en una jugada tranquil·la— que cap humà del nivell faria. Els errors
// "lògics" són no veure tàctiques, no regalar peces sense cap intenció.
function immediateMaterialLoss(uciMove, chessInstance = game) {
    if (!chessInstance) return 0;
    const from = uciMove.substring(0, 2);
    const to = uciMove.substring(2, 4);
    const promotion = uciMove.length > 4 ? uciMove[4] : 'q';
    const played = chessInstance.move({ from, to, promotion });
    if (!played) return 0;
    let worst = 0;
    const replies = chessInstance.moves({ verbose: true });
    for (const r of replies) {
        if (!r.captured) continue;
        const gain = PIECE_VALUE[r.captured] || 0;
        let recap = 0;
        const opp = chessInstance.move({ from: r.from, to: r.to, promotion: 'q' });
        if (opp) {
            const canRecapture = chessInstance.moves({ verbose: true }).some(m => m.to === r.to && m.captured);
            if (canRecapture) recap = PIECE_VALUE[opp.piece] || 0;
            chessInstance.undo();
        }
        const net = gain - recap;
        if (net > worst) worst = net;
    }
    chessInstance.undo();
    return worst;
}

function interpolateByRoc(roc, points) {
    const safeRoc = Math.max(ELO_MIN, Math.min(ELO_MAX, isNaN(roc) ? getActiveStrengthElo() : roc));
    for (let i = 0; i < points.length - 1; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[i + 1];
        if (safeRoc <= x2) {
            const t = Math.max(0, Math.min(1, (safeRoc - x1) / Math.max(1, x2 - x1)));
            return y1 + (y2 - y1) * t;
        }
    }
    return points[points.length - 1][1];
}

function getHumanLikeMaxCpLoss(roc = getActiveStrengthElo()) {
    const floor = engineEloMin || 1350;
    const strictLoss = 80; // comportament actual aproximat quan Stockfish ja pot usar UCI_Elo real
    if (roc >= floor) return strictLoss;

    // Per sota del terra real del motor, UCI_Elo queda retallat: la profunditat + aquesta
    // finestra de selecció humana són les que creen nivells ROC realment diferents. La corba
    // és suau per evitar salts perceptibles entre 600/1000/1230.
    return interpolateByRoc(roc, [
        [ELO_MIN, 900],
        [600, 700],
        [1000, 350],
        [1230, 220],
        [floor, strictLoss]
    ]);
}

function getWeakAiTuning(roc = getActiveStrengthElo()) {
    const points = WEAK_AI_CONFIG.rocPoints;
    const safeRoc = Math.max(ELO_MIN, Math.min(ELO_MAX, isNaN(roc) ? getActiveStrengthElo() : roc));
    if (safeRoc <= points[0].roc) return { ...points[0] };
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (safeRoc <= b.roc) {
            const t = Math.max(0, Math.min(1, (safeRoc - a.roc) / Math.max(1, b.roc - a.roc)));
            const mixed = { roc: safeRoc };
            Object.keys(a).forEach(key => {
                if (key === 'roc') return;
                mixed[key] = a[key] + (b[key] - a[key]) * t;
            });
            mixed.maxCandidates = Math.round(mixed.maxCandidates);
            return mixed;
        }
    }
    return { ...points[points.length - 1], roc: safeRoc };
}

function getEngineMoveMultiPvValue(roc = getActiveStrengthElo(), fallback = 5) {
    if (roc < 600) return WEAK_AI_CONFIG.multipv.below600;
    if (roc < 1000) return WEAK_AI_CONFIG.multipv.below1000;
    if (roc < (engineEloMin || 1350)) return Math.max(fallback, WEAK_AI_CONFIG.multipv.defaultLow);
    return fallback;
}

// Magnitud d'error "lògica" per al nivell (en peons): com més baix el nivell, més gran
// l'error tolerat, però sempre dins el que una persona d'aquell nivell faria de manera
// natural. ROC ~200 => fins a ~5-6 peons; ROC ~2000 => ~0.6 peons.
function levelTolerableLossPawns(normalized, roc = getActiveStrengthElo()) {
    if (roc < 1000) return getWeakAiTuning(roc).tolerableLossPawns;
    return 0.6 + (1 - normalized) * 3.0;
}

function beginnerMistakeAppeal(candidate) {
    const mv = candidate && candidate.mv;
    if (!mv) return 1;
    let appeal = 1;
    const fromFile = mv.from.charCodeAt(0) - 97;
    const toFile = mv.to.charCodeAt(0) - 97;
    const fromRank = parseInt(mv.from[1], 10);
    const san = mv.san || '';

    // 1) Tornar a moure una peça ja desenvolupada: freqüent en principiants però no absurd.
    if (mv.piece !== 'p' && mv.piece !== 'k') {
        const homeRank = mv.color === 'w' ? 1 : 8;
        if (fromRank !== homeRank) appeal += 1.2;
    }
    // 2) Avançar peons laterals: és humà a nivell baix, però no ho premiem si penja massa material.
    if (mv.piece === 'p' && !mv.captured && (fromFile === 0 || fromFile === 7 || toFile === 0 || toFile === 7)) {
        appeal += 1.4;
    }
    // 3) Capturar material aparent i permetre recaptura.
    if (mv.captured && candidate.materialLoss > 0) appeal += 1.8 + Math.min(2, candidate.materialLoss * 0.35);
    // 4) Ignorar una amenaça tàctica no immediatament òbvia: es modela acceptant pèrdues en cp sense pèrdua material immediata.
    if (!mv.captured && candidate.cpLoss >= 120 && candidate.materialLoss <= 1.5) appeal += 1.0;
    // 5) Jugada natural però inferior.
    if (candidate.cpLoss >= 60 && candidate.cpLoss <= 550) appeal += Math.min(2.4, candidate.cpLoss / 180);
    if (san.includes('+')) appeal += 0.5;
    if (san.includes('#')) appeal -= 5; // un mat trobat no és un error de principiant.
    if (mv.piece === 'k' && !(mv.flags && (mv.flags.includes('k') || mv.flags.includes('q')))) appeal -= 1.6;
    return Math.max(0.05, appeal);
}

function logWeakAiSelection(roc, selected, reason) {
    if (!DEBUG_WEAK_AI || !selected) return;
    console.log('[WeakAI]', {
        roc,
        selectedMove: selected.move,
        cpLoss: selected.cpLoss,
        materialLoss: selected.materialLoss,
        reason
    });
}

function chooseWeightedCandidate(candidates, weightFn) {
    const weights = candidates.map((c, idx) => Math.max(0.001, weightFn(c, idx)));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
}

function chooseBeginnerMistakeMove(enriched, chessInstance, roc) {
    if (!enriched || enriched.length < 2 || roc >= 1000) return null;
    const tuning = getWeakAiTuning(roc);
    if (Math.random() >= tuning.offPathChance) return undefined;

    const safe = enriched.filter(c => c.materialLoss <= tuning.tolerableLossPawns);
    const reasonable = safe.length
        ? safe
        : enriched.filter(c => c.materialLoss <= WEAK_AI_CONFIG.reasonableFallbackLossPawns);
    if (reasonable.length < 2) return null;

    const pool = reasonable
        .filter(c => c.cpLoss >= tuning.minAltCpLoss && c.cpLoss <= tuning.cpLossWindow)
        .slice(0, tuning.maxCandidates);
    const alternatives = (pool.length ? pool : reasonable.slice(1, tuning.maxCandidates))
        .filter(c => c.multipv !== enriched[0].multipv || c.move !== enriched[0].move)
        .filter(c => !(c.mv && c.mv.piece === 'q' && c.materialLoss >= WEAK_AI_CONFIG.queenHangLossPawns));
    if (!alternatives.length) return null;

    const selected = chooseWeightedCandidate(alternatives, (c, idx) => {
        const cpSweetSpot = Math.exp(-Math.abs(c.cpLoss - (tuning.cpLossWindow * 0.38)) / Math.max(120, tuning.cpLossWindow * 0.55));
        const rankPenalty = 1 / Math.pow(idx + 1, tuning.rankPower);
        const materialPenalty = Math.max(0.25, 1 - (c.materialLoss / Math.max(0.1, tuning.tolerableLossPawns + 1)));
        return (c.appeal + c.beginnerAppeal) * (0.45 + cpSweetSpot) * rankPenalty * materialPenalty;
    });
    logWeakAiSelection(roc, selected, 'beginner-mistake');
    return selected;
}

function chooseHumanLikeMove(candidates, chessInstance = game) {
    if (!candidates || candidates.length === 0) return null;
    const sorted = candidates.slice().sort((a, b) => b.score - a.score);

    const roc = getActiveStrengthElo();
    const normalized = getStrengthNormalized();
    const bestScore = sorted[0].score;
    const maxDelta = roc < 1000 ? getWeakAiTuning(roc).cpLossWindow : getHumanLikeMaxCpLoss(roc);
    const tolerableLoss = levelTolerableLossPawns(normalized, roc);

    const verboseByUci = {};
    if (chessInstance) {
        chessInstance.moves({ verbose: true }).forEach(m => {
            verboseByUci[`${m.from}${m.to}${m.promotion || ''}`] = m;
        });
    }

    // No generem jugades aleatòries: només triem entre línies que Stockfish ja ha proposat
    // via MultiPV, i les filtrem perquè l'error sigui humà (natural) però no una peça penjada.
    const enriched = sorted.map(c => {
        const mv = verboseByUci[c.move];
        const loss = immediateMaterialLoss(c.move, chessInstance);
        const base = {
            ...c,
            mv,
            cpLoss: bestScore - c.score,
            appeal: humanMoveAppeal(mv),
            materialLoss: loss,
            legal: !!mv
        };
        base.beginnerAppeal = beginnerMistakeAppeal(base);
        return base;
    }).filter(c => c.legal);

    if (!enriched.length) return sorted[0];

    const beginnerChoice = chooseBeginnerMistakeMove(enriched, chessInstance, roc);
    if (beginnerChoice) return beginnerChoice;
    if (beginnerChoice === undefined && roc < 1000) return enriched[0];

    // El filtre de material immediat evita regals de dama/torre o material enorme sense
    // compensació aparent. A ROC baix, si el filtre queda buit busquem alternatives moderades
    // abans de tornar a la millor línia, per no fer el nivell 200 gairebé perfecte.
    let safeCandidates = enriched.filter(c => c.materialLoss <= tolerableLoss);
    if (!safeCandidates.length && roc < 1000) {
        safeCandidates = enriched.filter(c => c.materialLoss <= WEAK_AI_CONFIG.reasonableFallbackLossPawns);
    }
    if (!safeCandidates.length) return sorted[0];

    const plausible = safeCandidates.filter(c => c.cpLoss <= maxDelta);
    const pool = (plausible.length ? plausible : (roc < 1000 ? safeCandidates : [safeCandidates[0]]));
    const weakMax = roc < 1000 ? getWeakAiTuning(roc).maxCandidates : null;
    const maxCandidates = weakMax || (normalized < 0.35 ? 7 : (normalized < 0.75 ? 5 : (roc < (engineEloMin || 1350) ? 4 : 2)));
    const trimmed = pool.slice(0, maxCandidates);

    if (trimmed.length === 1) return trimmed[0];

    // Als ROC baixos explorem alternatives MultiPV molt més sovint; als ROC alts el motor
    // gairebé sempre manté la millor línia o una alternativa molt propera.
    const offPathChance = roc < 1000
        ? getWeakAiTuning(roc).offPathChance
        : Math.max(0.06, Math.min(0.68, 0.72 - (normalized * 0.62)));
    const explore = Math.random() < offPathChance;
    if (!explore) return trimmed[0];

    // La ponderació combina naturalitat humana, pèrdua en centipeons i rang MultiPV. Això permet
    // errors visibles sota ROC 1230 sense convertir Stockfish en un generador de jugades absurdes.
    const temperature = roc < 1000 ? getWeakAiTuning(roc).temperature : (3.0 - (normalized * 2.2));
    const rankPower = roc < 1000 ? getWeakAiTuning(roc).rankPower : (normalized < 0.35 ? 0.35 : 0.8);
    const weights = trimmed.map((c, idx) => {
        const cpPenalty = Math.exp(-Math.max(0, c.cpLoss) / (Math.max(90, maxDelta) * temperature));
        const rankPenalty = 1 / Math.pow(idx + 1, rankPower);
        const materialPenalty = Math.max(0.2, 1 - (c.materialLoss / Math.max(0.1, tolerableLoss + 1)));
        const beginnerBoost = roc < 1000 ? c.beginnerAppeal : 1;
        return Math.max(0.001, c.appeal * beginnerBoost * cpPenalty * rankPenalty * materialPenalty);
    });
    const selected = chooseWeightedCandidate(trimmed, (c, idx) => weights[idx]);
    logWeakAiSelection(roc, selected, 'human-like-weighted');
    return selected;
}

// MODIFICAT: Ara carrega directament el fitxer local
function createStockfishWorker() {
    try {
        return new Worker(STOCKFISH_URL);
    } catch (e) {
        console.error("Error carregant Stockfish local:", e);
        return null;
    }
}

function ensureStockfish() {
    if (stockfish) return true;
    try {
        stockfish = createStockfishWorker();
        stockfish.onmessage = (e) => handleEngineMessage(e.data);
        stockfishReady = false;
        try { stockfish.postMessage('uci'); } catch (e) {}    
        return true;
    } catch (err) {
        console.error(err);
        stockfish = null;
        stockfishReady = false;
        return false;
    }
}

function loadStorage() {
    const elo = localStorage.getItem('chess_userELO'); if (elo) userELO = parseInt(elo);
    const errors = localStorage.getItem('chess_savedErrors'); if (errors) savedErrors = JSON.parse(errors);
    const streak = localStorage.getItem('chess_streak'); if (streak) currentStreak = parseInt(streak);
    const lastDate = localStorage.getItem('chess_lastPracticeDate'); if (lastDate) lastPracticeDate = lastDate;
    const stars = localStorage.getItem('chess_totalStars'); if (stars) totalStars = parseInt(stars);
    
    // Càrrega de Missions i Temps
    const missions = localStorage.getItem('chess_todayMissions'); const mDate = localStorage.getItem('chess_missionsDate');
    if (missions && mDate) { todayMissions = restoreMissions(JSON.parse(missions)); missionsDate = mDate; }
    
    // --- LÍNIA AFEGIDA PER AL CRONÒMETRE DE MISSIONS ---
    const mTime = localStorage.getItem('chess_missionsCompletionTime'); 
    if (mTime) missionsCompletionTime = parseInt(mTime);
    // ---------------------------------------------------

    const badges = localStorage.getItem('chess_unlockedBadges'); if (badges) unlockedBadges = JSON.parse(badges);
    const compOp = localStorage.getItem('chess_completedOpenings'); if (compOp) { try { completedOpenings = JSON.parse(compOp); } catch (e) {} }
    const tacS = localStorage.getItem('chess_tacticsStats'); if (tacS) { try { tacticsStats = Object.assign(tacticsStats, JSON.parse(tacS)); } catch (e) {} }
    loadHieroglyphicStats();
    loadThemeMastery();
    loadGrowthStats();
    const stats = localStorage.getItem('chess_sessionStats'); const statsDate = localStorage.getItem('chess_sessionStatsDate');
    if (stats && statsDate === getToday()) sessionStats = JSON.parse(stats);
    
    const history = localStorage.getItem('chess_eloHistory'); if (history) eloHistory = JSON.parse(history);
    const tGames = localStorage.getItem('chess_totalGamesPlayed'); if (tGames) totalGamesPlayed = parseInt(tGames);
    const tWins = localStorage.getItem('chess_totalWins'); if (tWins) totalWins = parseInt(tWins);
    const mStreak = localStorage.getItem('chess_maxStreak'); if (mStreak) maxStreak = parseInt(mStreak);
    
    const aiDiff = localStorage.getItem('chess_aiDifficulty'); if (aiDiff) aiDifficulty = parseInt(aiDiff);
    const rGames = localStorage.getItem('chess_recentGames'); if (rGames) recentGames = JSON.parse(rGames);
    const cWins = localStorage.getItem('chess_consecutiveWins'); if (cWins) consecutiveWins = parseInt(cWins);
    const cLosses = localStorage.getItem('chess_consecutiveLosses'); if (cLosses) consecutiveLosses = parseInt(cLosses);
       const calState = localStorage.getItem('chess_isCalibrating');
    const calGames = localStorage.getItem('chess_calibrationGames');
    const calProfile = localStorage.getItem('chess_calibrationProfile');
    const calComplete = localStorage.getItem('chess_calibratgeComplet');
    if (calState !== null) isCalibrating = (calState === 'true');
    if (calGames) {
        try {
            const parsedGames = JSON.parse(calGames);
            if (Array.isArray(parsedGames)) calibrationGames = parsedGames;
        } catch (e) {}
    }
    if (calProfile) {
        try {
            calibrationProfile = JSON.parse(calProfile);
        } catch (e) {}
    }
    if (calComplete !== null) calibratgeComplet = calComplete === 'true';
    if (calState === null && localStorage.getItem('chess_isCalibrationPhase') !== null) {
        isCalibrating = localStorage.getItem('chess_isCalibrationPhase') === 'true';
    }
    if ((calibrationProfile || calibratgeComplet || calibrationGames.length >= CALIBRATION_GAME_COUNT)) {
        isCalibrating = false;
        calibratgeComplet = true;
        if (calibrationRocFloor === null && calibrationProfile && typeof (calibrationProfile.roc ?? calibrationProfile.elo) === 'number') {
            calibrationRocFloor = calibrationProfile.roc ?? calibrationProfile.elo;
        }
        if (calibrationRocFloor === null && typeof userELO === 'number') {
            calibrationRocFloor = userELO;
        }
    } else if (calState === null && !calGames) {
        isCalibrating = true;
        calibratgeComplet = false;
    }
    const league = localStorage.getItem('chess_currentLeague'); if (league) currentLeague = JSON.parse(league);
    const lMatch = localStorage.getItem('chess_leagueActiveMatch'); if (lMatch) leagueActiveMatch = JSON.parse(lMatch);
    const reviews = localStorage.getItem('chess_reviewHistory'); if (reviews) reviewHistory = JSON.parse(reviews);
    const gameHistoryStored = localStorage.getItem('chess_gameHistory'); if (gameHistoryStored) gameHistory = JSON.parse(gameHistoryStored);
    const storedAdjustmentWindow = localStorage.getItem('chess_freeAdjustmentWindow');
    if (storedAdjustmentWindow) {
        try {
            const parsed = JSON.parse(storedAdjustmentWindow);
            if (Array.isArray(parsed)) freeAdjustmentWindow = parsed;
        } catch (e) {}
    }
    const storedAdjustmentLog = localStorage.getItem('chess_adjustmentLog');
    if (storedAdjustmentLog) {
        try {
            const parsed = JSON.parse(storedAdjustmentLog);
            if (Array.isArray(parsed)) adjustmentLog = parsed;
        } catch (e) {}
    }
    const storedAdaptationReport = localStorage.getItem('chess_adaptationReport');
    if (storedAdaptationReport) {
        try {
            const parsed = JSON.parse(storedAdaptationReport);
            if (Array.isArray(parsed)) adaptationReport = normalizeAdaptationReport(parsed);
        } catch (e) {}
    }
    const storedFreeLossStreak = localStorage.getItem('chess_freeLossStreak');
    if (storedFreeLossStreak !== null) freeLossStreak = parseInt(storedFreeLossStreak);
    const storedEloFloor = localStorage.getItem('chess_calibrationRocFloor');
    if (storedEloFloor !== null) {
        const parsedFloor = parseInt(storedEloFloor);
        if (!isNaN(parsedFloor)) calibrationRocFloor = parsedFloor;
    }
    const storedEloMilestones = localStorage.getItem('chess_eloMilestones');
    if (storedEloMilestones) {
        try {
            const parsed = JSON.parse(storedEloMilestones);
            if (Array.isArray(parsed)) unlockedEloMilestones = parsed;
        } catch (e) {}
    }
    const storedQualityAvg = localStorage.getItem('chess_lastAdjustmentQualityAvg');
    if (storedQualityAvg !== null) {
        const parsedQuality = parseFloat(storedQualityAvg);
        if (!isNaN(parsedQuality)) lastAdjustmentQualityAvg = parsedQuality;
    }
    const storedElo = localStorage.getItem('chess_currentElo');
    currentElo = clampEngineElo(storedElo ? parseInt(storedElo) : userELO);
    aiDifficulty = levelToDifficulty(currentElo);
    const storedRecentErrors = localStorage.getItem('chess_recentErrors');
    if (storedRecentErrors) {
        try {
            const parsed = JSON.parse(storedRecentErrors);
            if (Array.isArray(parsed)) {
                recentErrors = parsed.map(Boolean).slice(-ERROR_WINDOW_N);
            }
        } catch (e) {}
    }
    const storedDaily = localStorage.getItem('chess_dailyPuzzle');
    if (storedDaily) {
        try {
            const parsed = JSON.parse(storedDaily);
            if (parsed && typeof parsed === 'object') dailyPuzzle = Object.assign(dailyPuzzle, parsed);
        } catch (e) {}
    }
}

function saveStorage() {
    localStorage.setItem('chess_userELO', userELO);
    localStorage.setItem('chess_savedErrors', JSON.stringify(savedErrors));
    localStorage.setItem('chess_streak', currentStreak);
    localStorage.setItem('chess_lastPracticeDate', lastPracticeDate);
    localStorage.setItem('chess_totalStars', totalStars);
    localStorage.setItem('chess_todayMissions', JSON.stringify(todayMissions));
    localStorage.setItem('chess_missionsDate', missionsDate);
    localStorage.setItem('chess_missionsCompletionTime', missionsCompletionTime || 0);
    localStorage.setItem('chess_unlockedBadges', JSON.stringify(unlockedBadges));
    localStorage.setItem('chess_sessionStats', JSON.stringify(sessionStats));
    localStorage.setItem('chess_sessionStatsDate', getToday());
    localStorage.setItem('chess_eloHistory', JSON.stringify(eloHistory));
    localStorage.setItem('chess_totalGamesPlayed', totalGamesPlayed);
    localStorage.setItem('chess_totalWins', totalWins);
    localStorage.setItem('chess_maxStreak', maxStreak);
    localStorage.setItem('chess_aiDifficulty', aiDifficulty);
    localStorage.setItem('chess_recentGames', JSON.stringify(recentGames));
    localStorage.setItem('chess_consecutiveWins', consecutiveWins);
    localStorage.setItem('chess_consecutiveLosses', consecutiveLosses);
    localStorage.setItem('chess_isCalibrating', String(isCalibrating));
    localStorage.setItem('chess_calibrationGames', JSON.stringify(calibrationGames));
    localStorage.setItem('chess_calibrationProfile', JSON.stringify(calibrationProfile));
    localStorage.setItem('chess_calibratgeComplet', String(calibratgeComplet));
    localStorage.setItem('chess_reviewHistory', JSON.stringify(reviewHistory));
    localStorage.setItem('chess_gameHistory', JSON.stringify(gameHistory));    
    localStorage.setItem('chess_currentElo', currentElo);
    localStorage.setItem('chess_recentErrors', JSON.stringify(recentErrors));
    localStorage.setItem('chess_freeAdjustmentWindow', JSON.stringify(freeAdjustmentWindow));
    localStorage.setItem('chess_adjustmentLog', JSON.stringify(adjustmentLog));
    localStorage.setItem('chess_adaptationReport', JSON.stringify(adaptationReport));
    localStorage.setItem('chess_freeLossStreak', freeLossStreak);
    if (calibrationRocFloor !== null && !isNaN(calibrationRocFloor)) {
        localStorage.setItem('chess_calibrationRocFloor', calibrationRocFloor);
    } else {
        localStorage.removeItem('chess_calibrationRocFloor');
    }
    localStorage.setItem('chess_eloMilestones', JSON.stringify(unlockedEloMilestones));
    if (lastAdjustmentQualityAvg !== null && !isNaN(lastAdjustmentQualityAvg)) {
        localStorage.setItem('chess_lastAdjustmentQualityAvg', lastAdjustmentQualityAvg);
    } else {
        localStorage.removeItem('chess_lastAdjustmentQualityAvg');
    }
    if (currentLeague) localStorage.setItem('chess_currentLeague', JSON.stringify(currentLeague)); else localStorage.removeItem('chess_currentLeague');
    if (leagueActiveMatch) localStorage.setItem('chess_leagueActiveMatch', JSON.stringify(leagueActiveMatch)); else localStorage.removeItem('chess_leagueActiveMatch');
    localStorage.setItem('chess_dailyPuzzle', JSON.stringify(dailyPuzzle));
    localStorage.setItem('chess_completedOpenings', JSON.stringify(completedOpenings));
    localStorage.setItem('chess_tacticsStats', JSON.stringify(tacticsStats));
    saveHieroglyphicStats();
    saveThemeMastery();
    saveGrowthStats();
    localStorage.removeItem('chess_isCalibrationPhase');
    localStorage.removeItem('chess_calibrationMoves');
    localStorage.removeItem('chess_calibrationGoodMoves');
    localStorage.removeItem('eltaulerLastLocalUpdateAt');
    localStorage.removeItem('eltaulerDeviceId');
    localStorage.removeItem('chess_deepseek_api_key');
    // Sincronització al núvol: avisa que les dades locals han canviat.
    if (window.CloudSync && typeof window.CloudSync.onLocalSave === 'function') {
        try { window.CloudSync.onLocalSave(); } catch (e) {}
    }
}

// Recarrega tot l'estat del joc des del localStorage i refresca la interfície.
// El crida cloudsync.js després de baixar dades més noves d'un altre dispositiu.
function reloadAppStateFromStorage() {
    try {
        loadStorage();
        if (typeof isCalibrationActive === 'function' && !isCalibrationActive()) {
            syncEngineEloFromUser();
        }
        updateDisplay();
        if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
        if (typeof updateMissionsDisplay === 'function') updateMissionsDisplay();
        if (typeof renderGameHistory === 'function') renderGameHistory();
        if (typeof updateReviewChart === 'function') updateReviewChart();
        // Refresca també pantalles de lliga, obertures i tàctiques si existeixen.
        if (typeof renderLeagueScreen === 'function') renderLeagueScreen();
        if (typeof updateLeagueDisplay === 'function') updateLeagueDisplay();
        if (typeof renderLeague === 'function') renderLeague();
        if (typeof updateLeagueAccessUI === 'function') updateLeagueAccessUI();
        if (typeof updateLeagueBanner === 'function') updateLeagueBanner();
        if (typeof renderLeagueHistory === 'function') renderLeagueHistory();
        if (typeof renderOpenings === 'function') renderOpenings();
        if (typeof renderOpeningStats === 'function') renderOpeningStats();
        if (typeof renderOpeningStatsScreen === 'function') renderOpeningStatsScreen();
        if (typeof updateTacticsDisplay === 'function') updateTacticsDisplay();
        if (typeof showToast === 'function') showToast('Dades sincronitzades del núvol', 'success');
    } catch (e) {
        console.warn('[CloudSync] reloadAppStateFromStorage error', e);
    }
}
window.reloadAppStateFromStorage = reloadAppStateFromStorage;

// Refresca la secció "Sincronització al núvol" de Configuració segons l'estat.
function updateCloudSyncUI(st) {
    st = st || (window.CloudSync && window.CloudSync.getStatus ? window.CloudSync.getStatus() : { state: 'init', configured: false });
    const statusEl = document.getElementById('cloud-sync-status');
    const accountEl = document.getElementById('cloud-sync-account');
    const hintEl = document.getElementById('cloud-sync-hint');
    const btnIn = document.getElementById('btn-cloud-signin');
    const btnOut = document.getElementById('btn-cloud-signout');
    const btnNow = document.getElementById('btn-cloud-sync-now');
    if (!statusEl) return;

    const show = (el, v) => { if (el) el.style.display = v ? '' : 'none'; };
    let label = '—', color = 'inherit', hint = '', signedIn = false;

    switch (st.state) {
        case 'unconfigured':
            label = 'No configurat'; color = '#b08900';
            hint = 'Firebase encara no està configurat. Omple FIREBASE_CONFIG a cloudsync.js.';
            break;
        case 'unavailable':
            label = 'Sense connexió'; color = '#b08900';
            hint = 'No s\'ha pogut carregar Firebase. Comprova la connexió i recarrega.';
            break;
        case 'signedout':
            label = 'Sessió tancada'; color = 'inherit';
            hint = 'Inicia sessió per activar la sincronització.';
            break;
        case 'syncing':
            label = 'Sincronitzant…'; color = '#0a7'; signedIn = true; break;
        case 'synced':
            label = 'Sincronitzat ✓'; color = '#0a7'; signedIn = true;
            if (st.lastSyncedAt) hint = 'Última sincronització: ' + new Date(st.lastSyncedAt).toLocaleString('ca-ES');
            break;
        case 'error':
            label = 'Error'; color = '#c0392b'; signedIn = !!(st.email);
            hint = st.error || 'Hi ha hagut un error de sincronització.';
            break;
        default:
            label = st.configured ? 'A punt' : 'No configurat';
            color = st.configured ? 'inherit' : '#b08900';
            if (!st.configured) hint = 'Firebase encara no està configurat. Omple FIREBASE_CONFIG a cloudsync.js.';
    }

    statusEl.textContent = label;
    statusEl.style.color = color;
    if (accountEl) {
        if (signedIn && st.email) { accountEl.textContent = '👤 ' + st.email; accountEl.style.display = ''; }
        else accountEl.style.display = 'none';
    }
    if (hintEl) hintEl.textContent = hint;

    const canSignIn = st.configured && st.state !== 'unavailable';
    show(btnIn, !signedIn && canSignIn);
    show(btnOut, signedIn);
    show(btnNow, signedIn);
    updateCloudRecoverButton();
}
window.onCloudSyncStatus = updateCloudSyncUI;

// Botó d'emergència a la pantalla inicial: permet iniciar sessió i recuperar
// les dades del núvol ABANS de fer el calibratge (quan la resta d'opcions de
// configuració poden estar bloquejades). Només es mostra si el sync està
// configurat i encara no hi ha sessió iniciada.
function updateCloudRecoverButton() {
    const btn = document.getElementById('btn-cloud-recover');
    if (!btn) return;
    const available = !!(window.CloudSync &&
        typeof window.CloudSync.isConfigured === 'function' && window.CloudSync.isConfigured());
    const signedIn = available && typeof window.CloudSync.isSignedIn === 'function' && window.CloudSync.isSignedIn();
    btn.style.display = (available && !signedIn) ? '' : 'none';
}

function updateOpenAISettingsUI() {
    updateBundleHintButtons();
}

function updateBundleHintButtons() {
    const brainBtn = document.getElementById('btn-brain-hint');
    const assistedBtn = document.getElementById('btn-assisted-hint');
    const hintBtn = document.getElementById('btn-hint');
    if (!hintBtn) return;

    const isAssisted = currentGameMode === 'assisted';
    const bundleVisible = blunderMode && bundleSequenceStep <= 3;

    // Botó de pista Stockfish: sempre visible en bundle i partida assistida; ocult en free/league
    hintBtn.style.display = (bundleVisible || isAssisted) ? 'inline-flex' : 'inline-flex';
    hintBtn.disabled = !stockfish || isAnalyzingHint;

    // Botó OpenAI per bundles (funciona també offline amb el banc de màximes)
    if (brainBtn) {
        brainBtn.style.display = bundleVisible ? 'inline-flex' : 'none';
        brainBtn.disabled = !bundleVisible || bundleOpenAIHintPending;
    }

    // Botó de consell estratègic per mode assistit (offline o amb OpenAI)
    if (assistedBtn) {
        assistedBtn.style.display = isAssisted ? 'inline-flex' : 'none';
        assistedBtn.disabled = !isAssisted || assistedHintPending;
    }
}

function getOpenAIErrorMessage(status, fallback = '') {
    if (status === 400) return fallback || 'Petició incorrecta o payload mal format';
    if (status === 401 || status === 403) return fallback || 'Clau invàlida, restringida o sense accés a OpenAI';
    if (status === 422) return fallback || 'Paràmetres invàlids per a OpenAI';
    if (status === 429) return fallback || 'Límit de peticions o crèdit esgotat a OpenAI';
    if (status === 500 || status === 503) return fallback || 'Error temporal d’OpenAI';
    return fallback || 'No s’ha pogut contactar amb OpenAI';
}

function getOpenAIStatusLabel(result) {
    if (result && result.ok) return 'Connectat a OpenAI';
    const status = result ? result.status : 0;
    if (status === 0) return 'Problema de xarxa o CORS';
    if (status === 400 || status === 422) return 'Petició OpenAI invàlida';
    if (status === 401 || status === 403) return 'Clau invàlida o restringida';
    if (status === 429) return 'Límit de peticions o crèdit esgotat';
    if (status === 500 || status === 503) return 'Error temporal d’OpenAI';
    if (result && /xarxa|CORS|domini|bloqueig|fetch/i.test(result.errorMessage || '')) return 'Problema de xarxa o domini';
    return result?.errorMessage || 'Error d’OpenAI';
}

function getOpenAIAlertMessage(result) {
    const label = getOpenAIStatusLabel(result);
    const detail = (result && result.errorMessage && result.errorMessage !== label) ? `\n\nDetall: ${result.errorMessage}` : '';
    return `${label}${detail}`;
}

async function callOpenAI(prompt, options = {}) {
    if (!openaiApiKey) {
        return { ok: false, text: '', status: 0, errorMessage: 'Clau OpenAI no configurada' };
    }
    const endpoint = 'https://api.openai.com/v1/chat/completions';
    const generationConfig = Object.assign({ maxOutputTokens: 1024 }, options.generationConfig || {});
    // GPT-5 mini raona per defecte i els tokens de raonament gasten el mateix
    // pressupost de max_completion_tokens: amb límits petits el content arribaria
    // buit i a més es cremaria saldo. Per a textos curts d'entrenador no cal
    // raonar, així que es demana sempre l'esforç mínim. La família GPT-5 només
    // accepta els valors per defecte de temperature i top_p, per això no s'envien.
    const payload = Object.assign({
        model: OPENAI_MODEL_ID,
        messages: [{ role: 'user', content: String(prompt || '') }],
        max_completion_tokens: generationConfig.maxOutputTokens,
        reasoning_effort: 'minimal',
        stream: false
    }, options.payload || {});
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify(payload)
        });
        let data = null;
        let errorText = '';
        try { data = await response.json(); } catch (e) { try { errorText = await response.text(); } catch (e2) {} }
        if (!response.ok) {
            const apiMsg = data?.error?.message || errorText || '';
            return { ok: false, text: '', status: response.status, errorMessage: getOpenAIErrorMessage(response.status, apiMsg) };
        }
        const text = (data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '').trim();
        if (!text) return { ok: false, text: '', status: response.status, errorMessage: 'Resposta buida d’OpenAI' };
        return { ok: true, text, status: response.status, errorMessage: '' };
    } catch (error) {
        const isNetwork = error instanceof TypeError || /fetch failed|Failed to fetch|NetworkError/i.test(error?.message || '');
        return {
            ok: false,
            text: '',
            status: 0,
            errorMessage: isNetwork ? 'Problema de xarxa, CORS, domini o bloqueig del navegador' : (error?.message || 'Error desconegut')
        };
    }
}

function updateEloHistory(newElo) {
    const today = getToday();
    const lastEntry = eloHistory[eloHistory.length - 1];
    if (lastEntry && lastEntry.date === today) { lastEntry.elo = newElo; } 
    else { eloHistory.push({ date: today, elo: newElo }); }
    if (eloHistory.length > 100) eloHistory = eloHistory.slice(-100);
    saveStorage();
}

// Etiqueta de nivell segons l'ELO, per donar context a l'usuari
function eloLevelLabel(elo) {
    if (elo < 600) return 'Principiant';
    if (elo < 1000) return 'Bàsic';
    if (elo < 1400) return 'Intermedi';
    if (elo < 1800) return 'Avançat';
    return 'Expert';
}

function updateAdaptiveEngineEloLabel() {
     if (isCalibrationGame && typeof currentCalibrationOpponentRoc === 'number') {
        $('#engine-elo').text(`ROC ${currentCalibrationOpponentRoc}`);
        return;
    }
    if (isCalibrationActive()) {
        $('#engine-elo').text('Calibratge');
        return;
    }
    const elo = Math.round(currentElo);
    // Per sobre del terra del motor el número és un UCI_Elo real de Stockfish ("ELO");
    // per sota és l'escala pròpia adaptativa ("ROC"), que el motor no reprodueix exactament.
    const unit = elo >= engineEloMin ? 'ELO' : 'ROC';
    if ((currentGameMode === 'free' || currentGameMode === 'assisted') && !blunderMode) {
        $('#engine-elo').text(`${eloLevelLabel(elo)} · ${unit} ${elo} (adaptatiu)`);
        return;
    }
    $('#engine-elo').text(`${eloLevelLabel(elo)} · ${unit} ${elo}`);
}

function applyEngineEloStrength(eloValue) {
    if (!stockfish) return;
    // El ROC es manté dins l'escala pròpia (200-2000) i després es projecta al rang
    // vàlid real del motor. Per sota del terra, UCI_Elo queda al mínim del motor i la
    // resta de la debilitat la posen profunditat + selecció humana de moviments.
    const safeElo = rocToEngineElo(clampEngineElo(eloValue));
    try {
        stockfish.postMessage('setoption name UCI_LimitStrength value true');
        stockfish.postMessage(`setoption name UCI_Elo value ${safeElo}`);
    } catch (e) {}
}

function syncEngineEloFromUser() {
    currentElo = clampEngineElo(userELO);
    aiDifficulty = levelToDifficulty(currentElo);
    applyEngineEloStrength(currentElo);
    updateAdaptiveEngineEloLabel();
}

function getDisplayedElo(value) {
    return isCalibrationActive() ? '—' : String(value);
}

function updateEloDisplay() {
    const displayValue = getDisplayedElo(userELO);
    $('#current-elo').text(displayValue);
    $('#game-elo').text(displayValue);
}

function updateDisplay() {
    engineELO = Math.round(currentElo);  
    updateEloDisplay();
    $('#current-stars').text(totalStars); $('#game-stars').text(totalStars);
    updateAdaptiveEngineEloLabel();
    updateCalibrationProgressUI();
    updateCalibrationAccessUI();
    
    let total = savedErrors.length;
    $('#bundle-info').text(total > 0 ? `${total} errors guardats` : 'Cap error desat');
    $('#game-bundles').text(total);
    // Comptadors de repàs espaiat i repte diari al menú principal
    const due = getDueErrors().length;
    $('#srs-info').text(due > 0 ? `${due} per repassar` : 'Al dia');
    ensureDailyPuzzle();
    $('#daily-info').text(dailyPuzzle.solved ? `Fet ✓ · ratxa ${dailyPuzzle.streak}` : 'Disponible');
    $('#tactics-info').text(tacticsStats.solved > 0 ? `${tacticsStats.solved} resoltes · rècord ${tacticsStats.best}` : 'Entrena combinacions');
    updateStreakDisplay(); updateMissionsDisplay(); updateLeagueAccessUI();
    updateEngagementBanner();
    renderWeeklyPlan();
    if (typeof updateCloudRecoverButton === 'function') updateCloudRecoverButton();
}

function updateStatsDisplay() {
    $('#stats-total-games').text(totalGamesPlayed);
    $('#stats-total-wins').text(totalWins);
    $('#stats-bundles-count').text(savedErrors.length);
    $('#stats-max-streak').text(maxStreak);
    $('#stats-hiero-solved').text(hieroglyphicStats.solved || 0);
    $('#stats-hiero-personal').text(hieroglyphicStats.personalSolved || 0);
    $('#stats-hiero-streak').text(hieroglyphicStats.bestStreak || 0);
    const masteredThemes = Object.keys(hieroglyphicStats.themes || {}).filter(t => (hieroglyphicStats.themes[t] || 0) >= 2).length;
    $('#stats-hiero-themes').text(masteredThemes || '—');
    updateOpenAISettingsUI();
    updateEloChart();
    updateReviewChart();
    renderWeaknesses();
    renderCoachDiagnosis();
    renderOpeningStats();
}

// Determina el resultat de la partida des de la perspectiva del jugador
function entryOutcome(entry) {
    const r = (entry.result || '').toLowerCase();
    if (r.includes('victòr') || r.includes('guany')) return 'win';
    if (r.includes('derrot') || r.includes('perd') || r.includes('rendit')) return 'loss';
    if (r.includes('tau')) return 'draw';
    return null;
}

// Agrega estadístiques per obertura jugada a partir de l'historial (punt 4)
function analyzeOpeningStatsData() {
    const map = {};
    gameHistory.forEach(entry => {
        if (entry.mode === 'bundle') return;
        const moves = getHistoryMoves(entry);
        const oa = analyzeGameOpening(moves);
        if (!oa || !oa.name) return;
        const key = oa.eco ? `${oa.name}|${oa.eco}` : oa.name;
        if (!map[key]) map[key] = { name: oa.name, eco: oa.eco, games: 0, win: 0, loss: 0, draw: 0 };
        map[key].games++;
        const o = entryOutcome(entry);
        if (o === 'win') map[key].win++;
        else if (o === 'loss') map[key].loss++;
        else if (o === 'draw') map[key].draw++;
    });
    return Object.values(map).sort((a, b) => b.games - a.games);
}

function renderOpeningStats() {
    const container = document.getElementById('stats-openings');
    if (!container) return;
    const data = analyzeOpeningStatsData();
    if (!data.length) {
        container.innerHTML = '<div style="color:var(--text-secondary); font-size:0.9rem;">Encara no hi ha prou partides per analitzar les teves obertures.</div>';
        return;
    }
    let html = '';
    data.slice(0, 8).forEach(d => {
        const decided = d.win + d.loss;
        const wr = decided > 0 ? Math.round((d.win / decided) * 100) : 0;
        const wrColor = wr >= 60 ? '#4a7c59' : (wr >= 40 ? '#c9a227' : '#c62828');
        html += `<div class="opening-stat-row">
            <div class="opening-stat-name">${d.name}${d.eco ? ` <span class="opening-stat-eco">${d.eco}</span>` : ''}</div>
            <div class="opening-stat-record">${d.win}V · ${d.draw}T · ${d.loss}D</div>
            <div class="opening-stat-wr" style="color:${wrColor};">${decided > 0 ? wr + '%' : '—'}</div>
        </div>`;
    });
    container.innerHTML = html;
}

function updateEloChart() {
    const ctx = document.getElementById('elo-chart').getContext('2d');
    if (isCalibrationActive()) {
        if (eloChart) eloChart.destroy();
        return;
    }  
    if (eloHistory.length === 0) { eloHistory.push({ date: getToday(), elo: userELO }); saveStorage(); }
    const labels = eloHistory.map(entry => { const parts = entry.date.split('-'); return `${parts[2]}/${parts[1]}`; });
    const data = eloHistory.map(entry => entry.elo);
    const strokeColor = epaperEnabled ? '#555' : '#c9a227';
    const fillColor = epaperEnabled ? 'rgba(90, 90, 90, 0.12)' : 'rgba(201, 162, 39, 0.1)';
    const pointBorder = epaperEnabled ? '#666' : '#f4e4bc';
    const gridColor = epaperEnabled ? '#d0d0d0' : 'rgba(201, 162, 39, 0.1)';
    const tickColor = epaperEnabled ? '#444' : '#a89a8a';
    
    if (eloChart) eloChart.destroy();
    eloChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'ELO',
                data: data,
                borderColor: strokeColor,
                backgroundColor: fillColor,
                tension: 0.3,
                fill: true,
                pointBackgroundColor: strokeColor,
                pointBorderColor: pointBorder,
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: false, grid: { color: gridColor }, ticks: { color: tickColor } },
                x: { grid: { color: gridColor }, ticks: { color: tickColor, maxRotation: 45, minRotation: 45 } }
            }
        }
    });
}

function classifyMoveQuality(swing, playerMove = null, bestMove = null) {
    if (playerMove && bestMove && playerMove === bestMove) return 'excel';
    if (swing === null || swing === undefined || Number.isNaN(swing)) return 'unknown';
    const absSwing = Math.abs(swing);
    const useEnrichedThresholds = Boolean(playerMove || bestMove);

    if (useEnrichedThresholds) {
        if (absSwing <= 25) return 'excel';
        if (absSwing <= 50) return 'good';
        if (absSwing <= 100) return 'inaccuracy';
        if (absSwing <= 300) return 'mistake';
        return 'blunder';
    }

    if (absSwing <= 30) return 'excel';
    if (absSwing <= 80) return 'good';
    if (absSwing <= 200) return 'inaccuracy';
    if (absSwing <= 600) return 'mistake';
    return 'blunder';
}

function initStockfishEnriched(stockfishInstance, multiPvCount = 3) {
    stockfishInstance.postMessage('uci');
    stockfishInstance.postMessage(`setoption name MultiPV value ${multiPvCount}`);
    stockfishInstance.postMessage('isready');
}

function parseUciInfo(line) {
    if (!line.startsWith('info') || !line.includes(' pv ')) return null;

    const info = {
        depth: null,
        seldepth: null,
        multipv: 1,
        score: null,
        scoreType: 'cp',
        nodes: null,
        nps: null,
        time: null,
        pv: []
    };

    const depthMatch = line.match(/\bdepth (\d+)/);
    if (depthMatch) info.depth = Number.parseInt(depthMatch[1], 10);

    const seldepthMatch = line.match(/\bseldepth (\d+)/);
    if (seldepthMatch) info.seldepth = Number.parseInt(seldepthMatch[1], 10);

    const multipvMatch = line.match(/\bmultipv (\d+)/);
    if (multipvMatch) info.multipv = Number.parseInt(multipvMatch[1], 10);

    const scoreCpMatch = line.match(/\bscore cp (-?\d+)/);
    if (scoreCpMatch) {
        info.score = Number.parseInt(scoreCpMatch[1], 10);
        info.scoreType = 'cp';
    }

    const scoreMateMatch = line.match(/\bscore mate (-?\d+)/);
    if (scoreMateMatch) {
        info.score = Number.parseInt(scoreMateMatch[1], 10);
        info.scoreType = 'mate';
    }

    const nodesMatch = line.match(/\bnodes (\d+)/);
    if (nodesMatch) info.nodes = Number.parseInt(nodesMatch[1], 10);

    const npsMatch = line.match(/\bnps (\d+)/);
    if (npsMatch) info.nps = Number.parseInt(npsMatch[1], 10);

    const timeMatch = line.match(/\btime (\d+)/);
    if (timeMatch) info.time = Number.parseInt(timeMatch[1], 10);

    const pvMatch = line.match(/ pv (.+)$/);
    if (pvMatch) {
        info.pv = pvMatch[1].trim().split(/\s+/);
    }

    return info;
}

class EnrichedAnalysis {
    constructor(fen, targetDepth = 20, multiPvCount = 3) {
        this.fen = fen;
        this.targetDepth = targetDepth;
        this.multiPvCount = multiPvCount;
        this.alternatives = new Map();
        this.maxDepthReached = 0;
        this.isComplete = false;
    }

    processLine(line) {
        const info = parseUciInfo(line);
        if (!info || info.depth === null) return;

        const existing = this.alternatives.get(info.multipv);
        if (!existing || info.depth >= existing.depth) {
            this.alternatives.set(info.multipv, info);
        }

        if (info.depth > this.maxDepthReached) {
            this.maxDepthReached = info.depth;
        }
    }

    complete() {
        this.isComplete = true;
    }

    getAlternatives() {
        return Array.from(this.alternatives.values())
            .sort((a, b) => a.multipv - b.multipv)
            .map((info) => ({
                move: info.pv[0] || null,
                eval: info.score,
                evalType: info.scoreType,
                depth: info.depth,
                pv: info.pv
            }));
    }

    getBestMove() {
        const best = this.alternatives.get(1);
        if (!best) return null;

        return {
            move: best.pv[0] || null,
            eval: best.score,
            evalType: best.scoreType,
            depth: best.depth,
            pv: best.pv
        };
    }
}

function analyzePositionEnriched(stockfishInstance, fen, depth = 20, multiPv = 3) {
    return new Promise((resolve) => {
        const analysis = new EnrichedAnalysis(fen, depth, multiPv);
        let timeoutId = null;

        const cleanup = () => {
            stockfishInstance.removeEventListener('message', messageHandler);
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        };

        const messageHandler = (event) => {
            const line = event.data;
            if (typeof line !== 'string') return;

            if (line.startsWith('info')) {
                analysis.processLine(line);
            }

            if (line.startsWith('bestmove')) {
                cleanup();
                analysis.complete();
                resolve({
                    fen,
                    depth: analysis.maxDepthReached,
                    bestMove: analysis.getBestMove(),
                    alternatives: analysis.getAlternatives()
                });
            }
        };

        timeoutId = setTimeout(() => {
            cleanup();
            analysis.complete();
            resolve({
                fen,
                depth: analysis.maxDepthReached,
                bestMove: analysis.getBestMove(),
                alternatives: analysis.getAlternatives(),
                timedOut: true
            });
        }, 30000);

        stockfishInstance.addEventListener('message', messageHandler);
        try { stockfishInstance.postMessage(`setoption name MultiPV value ${multiPv}`); } catch (e) {}
        stockfishInstance.postMessage(`position fen ${fen}`);
        stockfishInstance.postMessage(`go depth ${depth}`);
    });
}

// Variant amb límit de temps real: el motor s'atura al primer límit (depth o movetime),
// així cap anàlisi pot quedar-se penjada en dispositius lents.
function analyzePositionEnrichedTimed(stockfishInstance, fen, depth, multiPv, moveTimeMs, timeoutMs) {
    return new Promise((resolve) => {
        const analysis = new EnrichedAnalysis(fen, depth, multiPv);
        let timeoutId = null;
        const cleanup = () => {
            stockfishInstance.removeEventListener('message', messageHandler);
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        };
        const finish = (timedOut) => {
            cleanup();
            analysis.complete();
            resolve({
                fen,
                depth: analysis.maxDepthReached,
                bestMove: analysis.getBestMove(),
                alternatives: analysis.getAlternatives(),
                timedOut: !!timedOut
            });
        };
        const messageHandler = (event) => {
            const line = event.data;
            if (typeof line !== 'string') return;
            if (line.startsWith('info')) analysis.processLine(line);
            if (line.startsWith('bestmove')) finish(false);
        };
        timeoutId = setTimeout(() => {
            try { stockfishInstance.postMessage('stop'); } catch (e) {}
            finish(true);
        }, timeoutMs);
        stockfishInstance.addEventListener('message', messageHandler);
        try { stockfishInstance.postMessage(`setoption name MultiPV value ${multiPv}`); } catch (e) {}
        stockfishInstance.postMessage(`position fen ${fen}`);
        stockfishInstance.postMessage(`go depth ${depth} movetime ${moveTimeMs}`);
    });
}

// Handshake UCI: confirma que el motor és viu i ha buidat la cua de missatges.
function waitForEngineReady(timeoutMs = 4000) {
    return new Promise(resolve => {
        if (!stockfish) { resolve(false); return; }
        let done = false;
        let tid = null;
        const onMsg = (e) => {
            if (typeof e.data === 'string' && e.data.indexOf('readyok') === 0) finish(true);
        };
        const finish = (ok) => {
            if (done) return;
            done = true;
            try { stockfish.removeEventListener('message', onMsg); } catch (e) {}
            if (tid) clearTimeout(tid);
            resolve(ok);
        };
        tid = setTimeout(() => finish(false), timeoutMs);
        try {
            stockfish.addEventListener('message', onMsg);
            stockfish.postMessage('isready');
        } catch (e) { finish(false); }
    });
}

function restartStockfishWorker() {
    try { if (stockfish && stockfish.terminate) stockfish.terminate(); } catch (e) {}
    stockfish = null;
    stockfishReady = false;
    return ensureStockfish();
}

// Anàlisi robusta per a la preparació d'exercicis: handshake previ, límit de temps,
// validació que la jugada és legal per a AQUEST fen (descarta respostes de cerques
// antigues) i un reintent amb reinici del worker si el motor no respon.
async function analyzeFenRobust(fen, depth = 15, multiPv = 1, moveTimeMs = 8000, shouldAbort = null) {
    for (let attempt = 0; attempt < 2; attempt++) {
        if (shouldAbort && shouldAbort()) return null;
        if (!stockfish) ensureStockfish();
        if (!stockfish) return null;
        try { stockfish.postMessage('stop'); } catch (e) {}
        let ready = await waitForEngineReady(4000);
        if (!ready) {
            console.warn('[Anàlisi] Motor sense resposta; es reinicia el worker');
            restartStockfishWorker();
            ready = await waitForEngineReady(6000);
            if (!ready) continue;
        }
        const analysis = await analyzePositionEnrichedTimed(stockfish, fen, depth, multiPv, moveTimeMs, moveTimeMs + 6000);
        const best = analysis?.bestMove?.move;
        if (best && uciToSanForFen(fen, best)) return analysis;
        console.warn('[Anàlisi] Jugada invàlida o buida per al fen; reintent', best || '(cap)');
    }
    return null;
}

function uciToSan(fen, uciMove) {
    if (typeof Chess === 'undefined') return uciMove;
    const chess = new Chess(fen);
    const move = chess.move({
        from: uciMove.slice(0, 2),
        to: uciMove.slice(2, 4),
        promotion: uciMove.length > 4 ? uciMove[4] : undefined
    });
    return move ? move.san : uciMove;
}

function pvToSan(fen, pvArray) {
    if (typeof Chess === 'undefined') return pvArray;
    const chess = new Chess(fen);
    const sanMoves = [];
    for (const uciMove of pvArray) {
        const move = chess.move({
            from: uciMove.slice(0, 2),
            to: uciMove.slice(2, 4),
            promotion: uciMove.length > 4 ? uciMove[4] : undefined
        });
        sanMoves.push(move ? move.san : uciMove);
        if (!move) break;
    }
    return sanMoves;
}

function createEnrichedMoveReview(
    fen,
    playerMove,
    playerMoveSan,
    analysisBefore,
    analysisAfter,
    moveNumber
) {
    const bestMove = analysisBefore.bestMove;
    const evalBefore = bestMove ? bestMove.eval : null;
    const evalAfter = analysisAfter.bestMove ? analysisAfter.bestMove.eval : null;

    let swing = null;
    if (evalBefore !== null && evalAfter !== null) {
        swing = Math.abs(evalAfter - evalBefore);
    }

    const quality = classifyMoveQuality(swing, playerMove, bestMove?.move);

    return {
        fen,
        moveNumber,
        playerMove,
        playerMoveSan,
        bestMove: bestMove?.move || null,
        evalBefore,
        evalAfter,
        swing,
        quality,
        isCapture: playerMoveSan.includes('x'),
        isCheck: playerMoveSan.includes('+') || playerMoveSan.includes('#'),
        timestamp: Date.now(),
        depth: analysisBefore.depth,
        bestMoveSan: bestMove?.move ? uciToSan(fen, bestMove.move) : null,
        bestMovePv: bestMove?.pv || [],
        bestMovePvSan: bestMove?.pv ? pvToSan(fen, bestMove.pv) : [],
        alternatives: (analysisBefore.alternatives || []).map((alt) => ({
            move: alt.move,
            moveSan: alt.move ? uciToSan(fen, alt.move) : null,
            eval: alt.eval,
            evalType: alt.evalType,
            pv: alt.pv,
            pvSan: alt.pv ? pvToSan(fen, alt.pv) : []
        }))
    };
}

function parseFenPosition(fen) {
    const [board, turn, castling, enPassant] = fen.split(' ');
    const expandedBoard = expandBoard(board);
    const whiteKing = findPiece(expandedBoard, 'K');
    const blackKing = findPiece(expandedBoard, 'k');
    const material = countMaterial(expandedBoard);
    const passedPawns = findPassedPawns(expandedBoard);
    const kingSafety = evaluateKingSafety(expandedBoard, whiteKing, blackKing, castling);

    return {
        turn,
        castling,
        enPassant,
        whiteKing,
        blackKing,
        material,
        passedPawns,
        kingSafety,
        expandedBoard
    };
}

function expandBoard(boardFen) {
    const board = [];
    const rows = boardFen.split('/');

    for (const row of rows) {
        for (const char of row) {
            if (char >= '1' && char <= '8') {
                for (let i = 0; i < Number.parseInt(char, 10); i++) {
                    board.push(null);
                }
            } else {
                board.push(char);
            }
        }
    }

    return board;
}

function findPiece(board, piece) {
    const index = board.indexOf(piece);
    if (index === -1) return null;

    const file = String.fromCharCode(97 + (index % 8));
    const rank = 8 - Math.floor(index / 8);
    return `${file}${rank}`;
}

function findAllPieces(board, piece) {
    const positions = [];
    for (let i = 0; i < board.length; i++) {
        if (board[i] === piece) {
            const file = String.fromCharCode(97 + (i % 8));
            const rank = 8 - Math.floor(i / 8);
            positions.push(`${file}${rank}`);
        }
    }
    return positions;
}

function countMaterial(board) {
    const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let white = 0;
    let black = 0;

    const whitePieces = { P: 0, N: 0, B: 0, R: 0, Q: 0 };
    const blackPieces = { p: 0, n: 0, b: 0, r: 0, q: 0 };

    for (const piece of board) {
        if (!piece) continue;

        if (piece === piece.toUpperCase()) {
            white += values[piece.toLowerCase()] || 0;
            if (whitePieces[piece] !== undefined) whitePieces[piece] += 1;
        } else {
            black += values[piece] || 0;
            if (blackPieces[piece] !== undefined) blackPieces[piece] += 1;
        }
    }

    return {
        white,
        black,
        balance: white - black,
        whitePieces,
        blackPieces
    };
}

function findPassedPawns(board) {
    const passed = { white: [], black: [] };

    for (let i = 0; i < 64; i++) {
        const piece = board[i];
        const file = i % 8;
        const rank = Math.floor(i / 8);

        if (piece === 'P') {
            let isPassed = true;
            for (let r = rank - 1; r >= 0 && isPassed; r--) {
                for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f++) {
                    if (board[r * 8 + f] === 'p') isPassed = false;
                }
            }
            if (isPassed && rank <= 5) {
                const square = `${String.fromCharCode(97 + file)}${8 - rank}`;
                passed.white.push(square);
            }
        }

        if (piece === 'p') {
            let isPassed = true;
            for (let r = rank + 1; r < 8 && isPassed; r++) {
                for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f++) {
                    if (board[r * 8 + f] === 'P') isPassed = false;
                }
            }
            if (isPassed && rank >= 2) {
                const square = `${String.fromCharCode(97 + file)}${8 - rank}`;
                passed.black.push(square);
            }
        }
    }

    return passed;
}

function evaluateKingSafety(board, whiteKing, blackKing, castling) {
    const safety = {
        white: { canCastle: false, hasCastled: false, exposed: false },
        black: { canCastle: false, hasCastled: false, exposed: false }
    };

    safety.white.canCastle = castling.includes('K') || castling.includes('Q');
    safety.black.canCastle = castling.includes('k') || castling.includes('q');

    if (whiteKing === 'g1' || whiteKing === 'c1') safety.white.hasCastled = true;
    if (blackKing === 'g8' || blackKing === 'c8') safety.black.hasCastled = true;

    const exposedFiles = ['d', 'e', 'f'];
    if (whiteKing && exposedFiles.includes(whiteKing[0]) && !safety.white.canCastle) {
        safety.white.exposed = true;
    }
    if (blackKing && exposedFiles.includes(blackKing[0]) && !safety.black.canCastle) {
        safety.black.exposed = true;
    }

    return safety;
}

async function prepareBundleSequence(fen, opts = {}) {
    // silent: no mostra alertes (preparació en segon pla)
    // shouldAbort: permet interrompre la preparació entre anàlisis
    const silent = !!opts.silent;
    const shouldAbort = () => !!(opts.shouldAbort && opts.shouldAbort());
    // Validació inicial més robusta
    if (!stockfish) {
        console.error('[Bundle] Stockfish no existeix');
        ensureStockfish();
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (!stockfish) {
        console.error('[Bundle] No es pot inicialitzar Stockfish');
        return null;
    }
    
    // Esperar que Stockfish estigui llest
    let waitCount = 0;
    while (!stockfishReady && waitCount < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
    }
    
    if (!stockfishReady) {
        console.error('[Bundle] Stockfish no està llest després d\'esperar');
        return null;
    }
    
    try {
        // Neteja inicial més agressiva
        stockfish.postMessage('stop');
        stockfish.postMessage('setoption name MultiPV value 1');
        await new Promise(resolve => setTimeout(resolve, 300)); // Temps augmentat
        
        console.log('[Bundle] Iniciant preparació seqüència per FEN:', fen);

        if (shouldAbort()) { console.log('[Bundle] Preparació interrompuda abans del pas 1'); return null; }
        // 1. Analitzar posició inicial (Pas 1)
        console.log('[Bundle] Pas 1: Analitzant posició inicial...');
        const step1Analysis = await analyzeFenRobust(fen, 15, 2, 8000, shouldAbort);

        if (shouldAbort()) { console.log('[Bundle] Preparació interrompuda després del pas 1'); return null; }
        if (!step1Analysis || !step1Analysis.bestMove || !step1Analysis.bestMove.move) {
            console.error('[Bundle] Pas 1 fallit: no hi ha bestMove', step1Analysis);
            if (!silent) alert('Error: No es pot analitzar la posició inicial. Torna-ho a provar.');
            return null;
        }
        
        const playerMove1 = step1Analysis.bestMove.move;
        console.log('[Bundle] Pas 1 - Millor jugada:', playerMove1);
        
        const playerMove1San = uciToSan(fen, playerMove1);
        const playerMove1Pv = step1Analysis.bestMove.pv || [];
        const playerMove1Eval = step1Analysis.bestMove.eval || 0;
        
        // 2. Aplicar la millor jugada del jugador
        const tempGame1 = new Chess(fen);
        const move1 = tempGame1.move({
            from: playerMove1.slice(0, 2),
            to: playerMove1.slice(2, 4),
            promotion: playerMove1.length > 4 ? playerMove1[4] : undefined
        });
        
        if (!move1) {
            console.error('[Bundle] No es pot aplicar jugada 1:', playerMove1);
            if (!silent) alert('Error: Jugada no vàlida. Prova un altre error.');
            return null;
        }
        
        const afterPlayerFen = tempGame1.fen();
        console.log('[Bundle] Després jugada 1, FEN:', afterPlayerFen);
        
        // Pausa més llarga entre anàlisis
        await new Promise(resolve => setTimeout(resolve, 400)); // Augmentat
        
        if (shouldAbort()) { console.log('[Bundle] Preparació interrompuda abans del pas 2'); return null; }
        // 3. Calcular millor resposta de l'oponent
        console.log('[Bundle] Pas 2: Analitzant resposta oponent...');
        const opponentAnalysis = await analyzeFenRobust(afterPlayerFen, 15, 1, 8000, shouldAbort);

        if (shouldAbort()) { console.log('[Bundle] Preparació interrompuda després del pas 2'); return null; }
        if (!opponentAnalysis || !opponentAnalysis.bestMove || !opponentAnalysis.bestMove.move) {
            console.error('[Bundle] Pas 2 fallit: no hi ha bestMove oponent', opponentAnalysis);
            if (!silent) alert('Error: No es pot calcular la resposta. Prova un altre error.');
            return null;
        }
        
        const opponentMove = opponentAnalysis.bestMove.move;
        console.log('[Bundle] Pas 2 - Resposta oponent:', opponentMove);
        
        const opponentMoveSan = uciToSan(afterPlayerFen, opponentMove);
        const opponentMoveEval = opponentAnalysis.bestMove.eval || 0;
        
        // 4. Aplicar resposta de l'oponent
        const tempGame2 = new Chess(afterPlayerFen);
        const move2 = tempGame2.move({
            from: opponentMove.slice(0, 2),
            to: opponentMove.slice(2, 4),
            promotion: opponentMove.length > 4 ? opponentMove[4] : undefined
        });
        
        if (!move2) {
            console.error('[Bundle] No es pot aplicar jugada oponent:', opponentMove);
            if (!silent) alert('Error: Resposta no vàlida. Prova un altre error.');
            return null;
        }
        
        const afterOpponentFen = tempGame2.fen();
        console.log('[Bundle] Després resposta oponent, FEN:', afterOpponentFen);
        
        // Pausa abans de l'anàlisi final
        await new Promise(resolve => setTimeout(resolve, 400)); // Augmentat
        
        if (shouldAbort()) { console.log('[Bundle] Preparació interrompuda abans del pas 3'); return null; }
        // 5. Calcular millor segona jugada del jugador (Pas 3)
        console.log('[Bundle] Pas 3: Analitzant segona jugada jugador...');
        const step2Analysis = await analyzeFenRobust(afterOpponentFen, 15, 2, 8000, shouldAbort);

        if (shouldAbort()) { console.log('[Bundle] Preparació interrompuda després del pas 3'); return null; }
        if (!step2Analysis || !step2Analysis.bestMove || !step2Analysis.bestMove.move) {
            console.error('[Bundle] Pas 3 fallit: no hi ha bestMove pas 2', step2Analysis);
            if (!silent) alert('Error: No es pot calcular la segona jugada. Prova un altre error.');
            return null;
        }
        
        const playerMove2 = step2Analysis.bestMove.move;
        console.log('[Bundle] Pas 3 - Segona jugada:', playerMove2);
        
        const playerMove2San = uciToSan(afterOpponentFen, playerMove2);
        const playerMove2Pv = step2Analysis.bestMove.pv || [];
        const playerMove2Eval = step2Analysis.bestMove.eval || 0;
        
        // 6. Analitzar context posicional de cada pas
        const positionStep1 = parseFenPosition(fen);
        const positionStep2 = parseFenPosition(afterOpponentFen);
        const threatsStep1 = analyzePvThreats(fen, playerMove1Pv);
        const threatsStep2 = analyzePvThreats(afterOpponentFen, playerMove2Pv);
        
        console.log('[Bundle] Seqüència completa preparada:', 
            [playerMove1San, opponentMoveSan, playerMove2San]);
        
        // 7. Retornar seqüència completa i fixa
        return {
            initialFen: fen,
            
            step1: {
                fen: fen,
                playerMove: playerMove1,
                playerMoveSan: playerMove1San,
                playerMovePv: playerMove1Pv,
                evalBefore: playerMove1Eval,
                alternatives: step1Analysis.alternatives || [],
                position: positionStep1,
                threats: threatsStep1
            },
            
            opponentMove: {
                fen: afterPlayerFen,
                move: opponentMove,
                moveSan: opponentMoveSan,
                eval: opponentMoveEval
            },
            
            step2: {
                fen: afterOpponentFen,
                playerMove: playerMove2,
                playerMoveSan: playerMove2San,
                playerMovePv: playerMove2Pv,
                evalBefore: playerMove2Eval,
                alternatives: step2Analysis.alternatives || [],
                position: positionStep2,
                threats: threatsStep2
            },
            
            fullSequence: [playerMove1, opponentMove, playerMove2],
            fullSequenceSan: [playerMove1San, opponentMoveSan, playerMove2San]
        };
        
    } catch (error) {
        console.error('[Bundle] Error preparant seqüència:', error);
        if (!silent) showToast('Error inesperat preparant l\'exercici. Torna-ho a provar.', 'error');
        return null;
    }
}

function analyzePvThreats(fen, pv) {
    if (!pv || pv.length === 0) {
        return { threats: [], themes: [], immediateThreats: [] };
    }

    const threats = [];
    const themes = new Set();
    const immediateThreats = [];

    for (let i = 0; i < Math.min(pv.length, 6); i++) {
        const move = pv[i];
        const moveInfo = parseUciMove(move);

        if (i === 0 && isLikelyCapture(fen, move)) {
            immediateThreats.push({
                type: 'capture',
                move,
                description: `Captura a ${moveInfo.to}`
            });
            themes.add('material');
        }

        if (moveInfo.promotion) {
            threats.push({
                type: 'promotion',
                move,
                piece: moveInfo.promotion,
                ply: i + 1
            });
            themes.add('promotion');
        }
    }

    const forkPattern = detectForkPattern(pv);
    if (forkPattern) {
        themes.add('fork');
        threats.push(forkPattern);
    }

    const checkCount = countChecksInPv(fen, pv);
    if (checkCount >= 2) {
        themes.add('king_attack');
        threats.push({
            type: 'king_attack',
            checks: checkCount,
            description: 'Atac persistent al rei'
        });
    }

    return {
        threats,
        themes: Array.from(themes),
        immediateThreats
    };
}

function parseUciMove(uciMove) {
    return {
        from: uciMove.slice(0, 2),
        to: uciMove.slice(2, 4),
        promotion: uciMove.length > 4 ? uciMove[4] : null
    };
}

function isLikelyCapture(fen, uciMove) {
    const board = expandBoard(fen.split(' ')[0]);
    const to = parseUciMove(uciMove).to;
    const toIndex = squareToIndex(to);
    return board[toIndex] !== null;
}

function squareToIndex(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = Number.parseInt(square[1], 10);
    return (8 - rank) * 8 + file;
}

function detectForkPattern(pv) {
    if (pv.length < 3) return null;

    const move1 = pv[0];
    const move3 = pv[2];

    if (move1 && move3 && move1.slice(2, 4) === move3.slice(0, 2)) {
        return {
            type: 'fork',
            knightMove: move1,
            capture: move3,
            description: `Possible forquilla: ${move1} seguida de ${move3}`
        };
    }

    return null;
}

function countChecksInPv(fen, pv) {
    if (typeof Chess === 'undefined') return 0;
    const chess = new Chess(fen);
    let checks = 0;

    for (const uciMove of pv) {
        const move = chess.move({
            from: uciMove.slice(0, 2),
            to: uciMove.slice(2, 4),
            promotion: uciMove.length > 4 ? uciMove[4] : undefined
        });
        if (!move) break;
        if (move.san && move.san.includes('+')) checks += 1;
    }

    return checks;
}

function generateHieroglyphics(moveReview, positionInfo, pvAnalysis) {
    const result = {
        moveSymbol: '',
        positionSymbol: '',
        themeSymbols: [],
        explanations: []
    };

    result.moveSymbol = getMoveQualitySymbol(moveReview);
    result.positionSymbol = getPositionEvalSymbol(moveReview.evalAfter);

    if (pvAnalysis.themes.includes('king_attack')) {
        result.themeSymbols.push('→');
        result.explanations.push('Atac directe al rei');
    }

    if (pvAnalysis.immediateThreats.length > 0) {
        result.themeSymbols.push('↑');
        result.explanations.push('Iniciativa amb amenaces');
    }

    if (pvAnalysis.threats.length > 0) {
        result.themeSymbols.push('Δ');
        const threat = pvAnalysis.threats[0];
        result.explanations.push(`Amenaça: ${threat.description || threat.type}`);
    }

    if (pvAnalysis.themes.includes('promotion')) {
        result.themeSymbols.push('⇑');
        result.explanations.push('Amenaça de promoció');
    }

    if (pvAnalysis.themes.includes('fork')) {
        result.themeSymbols.push('⑂');
        result.explanations.push('Tema de forquilla');
    }

    if (positionInfo.material.balance < -2 && moveReview.evalAfter > 0) {
        result.themeSymbols.push('⇆');
        result.explanations.push('Compensació per material');
    }

    if (Math.abs((moveReview.evalBefore || 0) - (moveReview.evalAfter || 0)) > 200 &&
        moveReview.quality === 'inaccuracy') {
        result.themeSymbols.push('⊕');
        result.explanations.push('Posició complicada');
    }

    const turn = positionInfo.turn;
    const enemySafety = turn === 'w' ? positionInfo.kingSafety.black : positionInfo.kingSafety.white;
    if (enemySafety.exposed) {
        result.themeSymbols.push('⊙');
        result.explanations.push('Rei enemic exposat');
    }

    return result;
}

function getMoveQualitySymbol(moveReview) {
    const { swing, quality, playerMove, bestMove } = moveReview;

    if (playerMove && bestMove && playerMove === bestMove) return '!!';
    if (swing === null || swing === undefined) return '';

    if (swing <= 10) return '!';
    if (swing <= 25) return '';
    if (swing <= 50) return '!?';
    if (swing <= 100) return '?!';
    if (swing <= 300) return '?';
    if (quality === 'blunder') return '??';
    return '';
}

function getPositionEvalSymbol(evalCp) {
    if (evalCp === null || evalCp === undefined) return '∞';

    const abs = Math.abs(evalCp);
    const sign = evalCp >= 0 ? 'w' : 'b';

    if (abs <= 25) return '=';
    if (abs <= 50) return sign === 'w' ? '⩲' : '⩱';
    if (abs <= 150) return sign === 'w' ? '±' : '∓';
    if (abs <= 500) return sign === 'w' ? '+-' : '-+';
    return sign === 'w' ? '+−' : '−+';
}

function generateCompleteAnalysis(moveReview) {
    const positionInfo = parseFenPosition(moveReview.fen);
    const pvAnalysis = analyzePvThreats(moveReview.fen, moveReview.bestMovePv || []);
    const hieroglyphics = generateHieroglyphics(moveReview, positionInfo, pvAnalysis);

    const llmContext = {
        position: moveReview.fen,
        played: moveReview.playerMoveSan,
        best: moveReview.bestMoveSan || moveReview.bestMove,
        bestLine: moveReview.bestMovePv,
        evalSwing: moveReview.swing,
        materialBalance: positionInfo.material.balance,
        whiteKingSafe: !positionInfo.kingSafety.white.exposed,
        blackKingSafe: !positionInfo.kingSafety.black.exposed,
        passedPawns: positionInfo.passedPawns,
        threats: pvAnalysis.threats,
        themes: pvAnalysis.themes,
        symbols: hieroglyphics
    };

    return {
        moveReview,
        positionInfo,
        pvAnalysis,
        hieroglyphics,
        llmContext
    };
}

function generateLlmPrompt(analysis) {
    const { moveReview, hieroglyphics, llmContext } = analysis;

    return `Analitza aquesta errada d'escacs i genera una màxima didàctica:

POSICIÓ (FEN): ${moveReview.fen}
JUGAT: ${moveReview.playerMoveSan} ${hieroglyphics.moveSymbol}
MILLOR: ${llmContext.best}
LÍNIA CORRECTA: ${llmContext.bestLine?.join(' ') || 'No disponible'}
PÈRDUA: ${moveReview.swing} centipeons

CONTEXT POSICIONAL:
- Balanç material: ${llmContext.materialBalance > 0 ? '+' : ''}${llmContext.materialBalance}
- Rei blanc segur: ${llmContext.whiteKingSafe ? 'Sí' : 'No'}
- Rei negre segur: ${llmContext.blackKingSafe ? 'Sí' : 'No'}
- Peons passats blancs: ${llmContext.passedPawns.white.join(', ') || 'Cap'}
- Peons passats negres: ${llmContext.passedPawns.black.join(', ') || 'Cap'}

TEMES DETECTATS: ${llmContext.themes.join(', ') || 'Cap'}
AMENACES: ${llmContext.threats.map((t) => t.description || t.type).join('; ') || 'Cap'}

SÍMBOLS: ${hieroglyphics.moveSymbol} ${hieroglyphics.positionSymbol} ${hieroglyphics.themeSymbols.join(' ')}

Genera:
1. Una màxima d'escacs (1 frase memorable)
2. Explicació breu de per què la jugada és un error
3. Explicació de per què la línia correcta és millor`;
}

function registerMoveReview(swing, analysisData = {}) {
    if (blunderMode) return;
    const quality = classifyMoveQuality(Math.abs(swing));
    const history = game.history({ verbose: true });
    const lastMove = history[history.length - 1];
    
    // Intentar convertir bestMove UCI a SAN
    let bestMoveSan = null;
    if (analysisData.bestMove && analysisData.fen) {
        try {
            const tempGame = new Chess(analysisData.fen);
            const uci = analysisData.bestMove;
            const moveObj = tempGame.move({
                from: uci.slice(0, 2),
                to: uci.slice(2, 4),
                promotion: uci.length > 4 ? uci[4] : undefined
            });
            if (moveObj) bestMoveSan = moveObj.san;
        } catch (e) {}
    }
    
    currentReview.push({
        fen: analysisData.fen || lastPosition || null,
        moveNumber: Math.ceil(history.length / 2),
        playerMove: lastHumanMoveUci || '—',
        playerMoveSan: lastMove ? lastMove.san : '—',
        bestMove: analysisData.bestMove || null,
        color: lastMove ? lastMove.color : null,
        evalBefore: analysisData.evalBefore ?? null,
        evalAfter: analysisData.evalAfter ?? null,
        swing: Math.abs(swing),
        quality: quality,
        isCapture: lastMove ? !!lastMove.captured : false,
        isCheck: game.in_check(),
        timestamp: Date.now(),
        
        // NOUS CAMPS ENRIQUITS
        depth: analysisData.depth || null,
        bestMoveSan: bestMoveSan,
        bestMovePv: analysisData.bestMovePv || [],
        alternatives: analysisData.alternatives || []
    });
}

function summarizeReview(entries) {
    const base = { excel: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
    (entries || []).forEach(item => {
        if (base[item.quality] !== undefined) base[item.quality]++;
    });
    return base;
}

function calculateAverageCpLoss(entries) {
    const list = entries || [];
    if (!list.length) return 0;
    const total = list.reduce((sum, entry) => sum + (entry.swing || 0), 0);
    return Math.round(total / list.length);
}

function countBlunders(entries, threshold = 200) {
    return (entries || []).filter(entry => (entry.swing || 0) > threshold).length;
}

function identifyTacticalPatterns(entries, avgCpLoss, blunderCount) {
    const counts = summarizeReview(entries);
    const patterns = [];

    if (blunderCount > 0) {
        patterns.push('Errades tàctiques greus (>200 CP)');
    }
    if ((counts.mistake || 0) >= 2 || (counts.blunder || 0) >= 1) {
        patterns.push('Pèrdua de material en combinacions');
    }
    if ((counts.inaccuracy || 0) >= 3) {
        patterns.push('Imprecisions en la coordinació de peces');
    }
    if (avgCpLoss <= 60 && (counts.good + counts.excel) >= (counts.inaccuracy + counts.mistake + counts.blunder)) {
        patterns.push('Bona execució tàctica');
    }
    if (patterns.length === 0) {
        patterns.push('Sense patrons crítics destacats');
    }
    return patterns;
}

function getCalibrationResultsSummary() {
    const results = calibrationGames.map(game => game.result || 'draw');
    const wins = results.filter(r => r === 'win').length;
    const losses = results.filter(r => r === 'loss').length;
    const draws = results.filter(r => r === 'draw').length;
    const avgCpLoss = calibrationGames.length
        ? Math.round(calibrationGames.reduce((sum, game) => sum + (game.avgCpLoss || 0), 0) / calibrationGames.length)
        : 0;
    const blunders = calibrationGames.reduce((sum, game) => sum + (game.blunders || 0), 0);
    const patterns = calibrationGames.flatMap(game => game.tacticalPatterns || []);
    const patternCounts = patterns.reduce((acc, pattern) => {
        acc[pattern] = (acc[pattern] || 0) + 1;
        return acc;
    }, {});

    const strengths = [];
    const weaknesses = [];

    if (avgCpLoss <= 70) strengths.push('Precisió consistent al llarg del calibratge');
    if (patternCounts['Bona execució tàctica']) strengths.push('Bona execució tàctica');
    if (wins >= 3) strengths.push('Bona capacitat de convertir avantatges');

    if (avgCpLoss > 90) weaknesses.push('Cal reduir les pèrdues de centipeons');
    if (blunders > 0) weaknesses.push('Evita blunders crítics (>200 CP)');
    if (patternCounts['Pèrdua de material en combinacions']) weaknesses.push('Vigila les combinacions que perden material');
    if (patternCounts['Imprecisions en la coordinació de peces']) weaknesses.push('Millora la coordinació de peces');

    if (!strengths.length) strengths.push('Joc equilibrat sense punts forts clars');
    if (!weaknesses.length) weaknesses.push('Cap feblesa crítica detectada');

    return { wins, losses, draws, avgCpLoss, strengths, weaknesses };
}

function buildCalibrationChartData() {
    return calibrationGames.map(game => {
        const quality = getCalibrationGameQuality(game);
        return CALIBRATION_ROC_MIN + (quality * (CALIBRATION_ROC_MAX - CALIBRATION_ROC_MIN));
    });
}

function renderCalibrationResults() {
    const summary = getCalibrationResultsSummary();
    $('#calibration-elo-value').text(`${userELO} ROC`);
    $('#calibration-wld-summary').text(`W ${summary.wins} · L ${summary.losses} · D ${summary.draws}`);
    const resultRow = $('#calibration-wld-row');
    resultRow.empty();
    calibrationGames.forEach(game => {
        const cls = game.result === 'win' ? 'win' : game.result === 'loss' ? 'loss' : 'draw';
        const label = game.result === 'win' ? 'W' : game.result === 'loss' ? 'L' : 'D';
        resultRow.append(`<span class="calibration-result-badge ${cls}">${label}</span>`);
    });

    const strengthsList = $('#calibration-strengths');
    strengthsList.empty();
    summary.strengths.forEach(item => strengthsList.append(`<li>${item}</li>`));

    const weaknessesList = $('#calibration-weaknesses');
    weaknessesList.empty();
    summary.weaknesses.forEach(item => weaknessesList.append(`<li>${item}</li>`));

    const ctx = document.getElementById('calibration-chart');
    if (!ctx) return;
    const labels = calibrationGames.map((_, idx) => `Partida ${idx + 1}`);
    const data = buildCalibrationChartData();
    if (calibrationResultsChart) calibrationResultsChart.destroy();
    calibrationResultsChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Evolució del nivell',
                data,
                borderColor: '#c9a227',
                backgroundColor: 'rgba(201, 162, 39, 0.15)',
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#c9a227',
                pointBorderColor: '#f4e4bc',
                pointBorderWidth: 2,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: false, grid: { color: 'rgba(201, 162, 39, 0.1)' }, ticks: { color: '#a89a8a' } },
                x: { grid: { color: 'rgba(201, 162, 39, 0.1)' }, ticks: { color: '#a89a8a' } }
            }
        }
    });
}

function showCalibrationResultsScreen() {
    renderCalibrationResults();
    $('#game-screen').removeClass('active').hide();
    $('#league-screen').hide();
    $('#stats-screen').hide();
    $('#settings-screen').hide();
    $('#history-screen').hide();
    $('#start-screen').hide();
    $('#calibration-result-screen').show();
    navPush('calibration-result-screen');
}

function persistReviewSummary(finalPrecision, resultLabel) {
    if (blunderMode) { currentReview = []; return; }
    const summary = summarizeReview(currentReview);
    const now = new Date();
    const label = now.toLocaleDateString('ca-ES', { day: '2-digit', month: 'short' }) + ' ' + now.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
    reviewHistory.push({
        label: label,
        precision: finalPrecision,
        result: resultLabel,
        ...summary
    });
    if (reviewHistory.length > 60) reviewHistory = reviewHistory.slice(-60);
    currentReview = [];
}

function updateReviewLegend(entry) {
    const lastEntry = entry || reviewHistory[reviewHistory.length - 1] || null;
    const counts = { excel: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
    if (lastEntry) {
        counts.excel = lastEntry.excel || 0;
        counts.good = lastEntry.good || 0;
        counts.inaccuracy = lastEntry.inaccuracy || 0;
        counts.mistake = lastEntry.mistake || 0;
        counts.blunder = lastEntry.blunder || 0;
    }
    Object.keys(counts).forEach(key => {
        const el = document.getElementById(`legend-${key}`);
        if (el) el.textContent = counts[key];
    });
}

function updateReviewChart() {
    const canvas = document.getElementById('review-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const hasData = reviewHistory.length > 0;
    const labels = hasData ? reviewHistory.map(r => r.label) : ['—'];
    const graySteps = ['#444', '#555', '#666', '#777', '#888'];
    const tickColor = epaperEnabled ? '#444' : '#a89a8a';
    const gridColor = epaperEnabled ? '#d0d0d0' : 'rgba(201, 162, 39, 0.1)';
    const datasets = [
        { key: 'excel', label: 'Excel·lents', color: '#4a7c59' },
        { key: 'good', label: 'Bones', color: '#c9a227' },
        { key: 'inaccuracy', label: 'Imprecisions', color: '#ffb74d' },
        { key: 'mistake', label: 'Errors', color: '#ef5350' },
        { key: 'blunder', label: 'Blunders', color: '#b71c1c' }
        ].map((meta, idx) => {
        const gray = graySteps[idx % graySteps.length];
        return {
        label: meta.label,
        data: hasData ? reviewHistory.map(r => r[meta.key] || 0) : [0],
        borderColor: epaperEnabled ? gray : meta.color,
        backgroundColor: epaperEnabled ? `rgba(${80 + idx * 20}, ${80 + idx * 20}, ${80 + idx * 20}, 0.2)` : meta.color + '33',
        tension: 0.25,
        fill: false
        };
    });

    if (reviewChart) reviewChart.destroy();
    reviewChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, labels: { color: tickColor } },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { color: tickColor }, grid: { color: gridColor } },
                x: { ticks: { color: tickColor, maxRotation: 45, minRotation: 45 }, grid: { color: gridColor } }
            }
        }
    });
    updateReviewLegend();
}

function formatHistoryMode(mode) {
    if (mode === 'league') return 'Lliga';
    if (mode === 'free') return 'Amistosa';
    if (mode === 'assisted') return 'Assistida';
    return 'Partida';
}

const TV_LICHESS_CHANNELS = [
    { id: 'featured', label: 'Destacada' },
    { id: 'classical', label: 'Clàssiques' },
    { id: 'rapid', label: 'Ràpides' },
    { id: 'blitz', label: 'Blitz' },
    { id: 'bullet', label: 'Bullet' },
    { id: 'ultraBullet', label: 'UltraBullet' },
    { id: 'chess960', label: 'Chess960' }
];

const TV_ELO_LEVELS = [2800, 2700, 2600, 2500, 2400];
const TV_LICHESS_RATINGS = [1600, 1800, 2000, 2200, 2500];
const TV_LICHESS_SPEEDS = ['blitz', 'rapid', 'classical'];
let tvSelectedElo = TV_ELO_LEVELS[0];

const TV_FALLBACK_POOL = [  
    {
        id: 'carlsen-caruana-wcc2018-g12',
        white: 'Magnus Carlsen',
        black: 'Fabiano Caruana',
        whiteElo: 2835,
        blackElo: 2832,
        event: 'World Championship 2018',
        date: '2018.11.26',
        result: '1/2-1/2',
        pgnText: `[Event "World Championship 2018"]
[Site "London"]
[Date "2018.11.26"]
[Round "12"]
[White "Carlsen, Magnus"]
[Black "Caruana, Fabiano"]
[Result "1/2-1/2"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 O-O 8. h3 d6 9. c3 Na5 10. Bc2 c5 11. d4 Qc7 12. Nbd2 cxd4 13. cxd4 Bd7 14. Nf1 Rac8 15. Ne3 Nc6 16. d5 Nb4 17. Bb1 a5 18. a3 Na6 19. b4 g6 20. Bd2 Qb8 21. Bd3 Nc7 22. Rc1 Nxd5 23. Nxd5 Nxd5 24. exd5 Rxc1 25. Qxc1 Rc8 26. Qb1 axb4 27. axb4 Bf6 28. Rc1 Rxc1+ 29. Qxc1 Qa8 30. Bc3 Qa2 31. Bb1 Qa6 1/2-1/2`
    },
    {
        id: 'kasparov-topalov-1999',
        white: 'Garry Kasparov',
        black: 'Veselin Topalov',
        whiteElo: 2851,
        blackElo: 2700,
        event: 'Wijk aan Zee 1999',
        date: '1999.01.20',
        result: '1-0',
        pgnText: `[Event "Wijk aan Zee"]
[Site "Wijk aan Zee"]
[Date "1999.01.20"]
[White "Kasparov, Garry"]
[Black "Topalov, Veselin"]
[Result "1-0"]

1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2 35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7 1-0`
    },
    {
        id: 'morphy-duke-opera-1858',
        white: 'Paul Morphy',
        black: 'Duke of Brunswick',
        whiteElo: 2690,
        blackElo: 2000,
        event: 'Paris Opera',
        date: '1858.11.02',
        result: '1-0',
        pgnText: `[Event "Paris Opera"]
[Site "Paris"]
[Date "1858.11.02"]
[White "Morphy, Paul"]
[Black "Duke of Brunswick"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`
    },
    {
        id: 'fischer-spassky-1972-g6',
        white: 'Bobby Fischer',
        black: 'Boris Spassky',
        whiteElo: 2785,
        blackElo: 2660,
        event: 'World Championship 1972',
        date: '1972.07.23',
        result: '1-0',
        pgnText: `[Event "World Championship 1972"]
[Site "Reykjavik"]
[Date "1972.07.23"]
[Round "6"]
[White "Fischer, Robert James"]
[Black "Spassky, Boris"]
[Result "1-0"]

1. c4 e6 2. Nf3 d5 3. d4 Nf6 4. Nc3 Be7 5. Bg5 O-O 6. e3 h6 7. Bh4 b6 8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6 12. Qa4 c5 13. Qa3 Rc8 14. Bb5 a6 15. dxc5 bxc5 16. O-O Ra7 17. Be2 Nd7 18. Nd4 Qf8 19. Nxe6 fxe6 20. e4 d4 21. f4 Qe7 22. e5 Rb8 23. Bc4 Kh8 24. Qh3 Nf8 25. b3 a5 26. f5 exf5 27. Rxf5 Nh7 28. Rcf1 Qd8 29. Qg3 Re7 30. h4 Rbb7 31. e6 Rbc7 32. Qe5 Qe8 33. a4 Qd8 34. R1f2 Qe8 35. R2f3 Qd8 36. Bd3 Qe8 37. Qe4 Nf6 38. Rxf6 gxf6 39. Rxf6 Kg8 40. Bc4 Kh8 41. Qf4 1-0`
    },
    {
        id: 'tal-miller-1965',
        white: 'Mikhail Tal',
        black: 'Miller',
        whiteElo: 2700,
        blackElo: 2400,
        event: 'Los Angeles 1965',
        date: '1965.01.01',
        result: '1-0',
         pgnText: `[Event "Los Angeles"]
[Site "Los Angeles"]
[Date "1965.01.01"]
[White "Tal, Mikhail"]
[Black "Miller"]
[Result "1-0"]

1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 e6 5. Nc3 d6 6. Be3 Nf6 7. f4 Be7 8. Qf3 O-O 9. O-O-O Qc7 10. Nb3 a6 11. g4 b5 12. g5 Nd7 13. Bd4 Nxd4 14. Nxd4 b4 15. Nce2 Bb7 16. h4 Nc5 17. Ng3 Rfc8 18. Bh3 Qb6 19. f5 e5 20. Nf3 Nxe4 21. Nxe4 Bxe4 22. Qxe4 Rxc2+ 23. Kb1 Rac8 24. f6 Bxf6 25. gxf6 R2c4 26. Qe3 Qxf6 27. Rhf1 Qe7 28. Rxd6 a5 29. Qg5 g6 30. Rd7 Qe6 31. Qf6 1-0`    }

];

const MASTERS_OPENINGS = [
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
    'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -',
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
    'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
    'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -',
    'rnbqkbnr/pppppp1p/6p1/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
    'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -'
];

const MIN_TV_MOVES = 21;
let lastTvDynamicId = null;

function mapEloToLichessRating(elo) {
    return TV_LICHESS_RATINGS.reduce((closest, rating) => {
        if (closest === null) return rating;
        const currentDiff = Math.abs(rating - elo);
        const bestDiff = Math.abs(closest - elo);
        return currentDiff < bestDiff ? rating : closest;
    }, null);
}

function updateTvEloUI() {
    const subtitle = document.getElementById('tv-subtitle');
    const title = document.getElementById('tv-title');
    if (subtitle) {
        subtitle.textContent = 'Lichess TV (si està disponible) o partida aleatòria de la base de dades oberta.';
    }
    if (title) {
       title.textContent = 'Reproducció TV';
    }
}

function randomizeTvElo() {
    if (!TV_ELO_LEVELS.length) return;
    tvSelectedElo = TV_ELO_LEVELS[randInt(0, TV_ELO_LEVELS.length - 1)];
}

function stopHistoryPlayback() {
    if (historyReplay && historyReplay.timer) {
        clearInterval(historyReplay.timer);
        historyReplay.timer = null;
    }
    if (historyReplay) historyReplay.isPlaying = false;
    updateHistoryControls();
}

function updateHistoryControls() {
    const playBtn = $('#history-play');
    const pauseBtn = $('#history-pause');
    const prevBtn = $('#history-prev');
    const nextBtn = $('#history-next');
    const hasEntry = historyReplay && historyReplay.entry;
    const movesCount = hasEntry ? historyReplay.moves.length : 0;
    const atStart = !hasEntry || historyReplay.moveIndex === 0;
    const atEnd = !hasEntry || historyReplay.moveIndex >= movesCount;

    playBtn.prop('disabled', !hasEntry || movesCount === 0 || historyReplay.isPlaying || atEnd);
    pauseBtn.prop('disabled', !hasEntry || !historyReplay.isPlaying);
    prevBtn.prop('disabled', !hasEntry || atStart || historyReplay.isPlaying);
    nextBtn.prop('disabled', !hasEntry || atEnd || historyReplay.isPlaying);
}

function updateHistoryProgress() {
    const progress = $('#history-progress');
    if (!historyReplay || !historyReplay.entry) {
        progress.text('0/0');
        return;
    }
    progress.text(`${historyReplay.moveIndex}/${historyReplay.moves.length}`);
}

function updateHistoryBoard() {
    if (!historyBoard || !historyReplay || !historyReplay.game) return;
    historyBoard.position(historyReplay.game.fen(), false);
    if (typeof historyBoard.resize === 'function') historyBoard.resize();
    updateHistoryProgress();
    updateHistoryControls();
}

// CERCA AQUESTA FUNCIÓ:
function initHistoryBoard() {
    if (historyBoard) return;
    const boardEl = document.getElementById('history-board');
    if (!boardEl) return;
    historyBoard = Chessboard('history-board', {
        draggable: false,
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });
}

// CANVIA-LA PER AQUESTA:
function initHistoryBoard(entry) {
    const boardEl = document.getElementById('history-board');
    if (!boardEl) return;
    
    // Determinar orientació segons el color jugat
    let orientation = 'white';
    if (entry && entry.playerColor === 'b') {
        orientation = 'black';
    }
    
    // Si ja existeix el tauler, només canviar orientació si cal
    if (historyBoard) {
        historyBoard.orientation(orientation);
        return;
    }
    
    historyBoard = Chessboard('history-board', {
        draggable: false,
        position: 'start',
        orientation: orientation,
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });
}

function getHistoryMoves(entry) {
    if (!entry) return [];
    const baseMoves = Array.isArray(entry.moves) ? entry.moves : [];
    if ((!baseMoves.length || baseMoves.length === 1) && entry.pgn) {
        const pgnGame = new Chess();
        if (pgnGame.load_pgn(entry.pgn, { sloppy: true })) {
            const parsedMoves = pgnGame.history();
            if (parsedMoves.length) return parsedMoves;
        }
    }
    return baseMoves;
}

// Construeix un PGN complet (amb capçaleres) a partir d'una entrada de l'historial
function buildEntryPgn(entry) {
    if (!entry) return '';
    const moves = getHistoryMoves(entry);
    if (!moves.length) return entry.pgn || '';
    const replay = new Chess();
    moves.forEach(m => { replay.move(m, { sloppy: true }); });
    const playerWhite = (entry.playerColor || 'w') === 'w';
    const oppName = entry.opponent && entry.opponent.name ? entry.opponent.name : 'Stockfish';
    let resultTag = '*';
    const res = (entry.result || '').toLowerCase();
    if (res.includes('victòr') || res.includes('guany') || res.includes('win')) resultTag = playerWhite ? '1-0' : '0-1';
    else if (res.includes('derrot') || res.includes('perd') || res.includes('loss')) resultTag = playerWhite ? '0-1' : '1-0';
    else if (res.includes('tau') || res.includes('draw')) resultTag = '1/2-1/2';
    replay.header(
        'Event', 'El Tauler',
        'Site', 'El Tauler PWA',
        'Date', (entry.date || new Date().toLocaleDateString()),
        'White', playerWhite ? 'Jugador' : oppName,
        'Black', playerWhite ? oppName : 'Jugador',
        'Result', resultTag
    );
    return replay.pgn();
}

function loadHistoryEntry(entry) {
    if (!entry) return;
    stopHistoryPlayback();
    initHistoryBoard(entry);
    const moves = getHistoryMoves(entry);
    historyReplay = {
        entry: entry,
        game: new Chess(),
        moves: moves,
        moveIndex: 0,
        timer: null,
        isPlaying: false
    };
    updateHistoryDetails(entry);
    updateHistoryBoard();
}

function updateHistoryDetails(entry) {
    const resultEl = $('#history-result');
    const precisionEl = $('#history-precision');
    const metaEl = $('#history-meta');
    const breakdown = $('#history-breakdown');
    const reviewContent = $('#history-review-content');
    if (!entry) {
        resultEl.text('—');
        precisionEl.text('—');
        metaEl.text('Selecciona una partida per veure detalls.');
        breakdown.empty();
        if (reviewContent.length) reviewContent.text('—');
        updateHistoryErrorNotes(null);
        $('#history-personal-hieroglyphic').prop('disabled', true);
        updateHistoryProgress();
        updateHistoryControls();
        return;
    }

    resultEl.text(entry.result || '—');
    precisionEl.text(typeof entry.precision === 'number' ? `${entry.precision}%` : '—');
    const movesLabel = `${getHistoryMoves(entry).length} jugades`;
    const meta = `${entry.label || '—'} · ${formatHistoryMode(entry.mode)} · ${movesLabel}`;
    metaEl.text(meta);

    const counts = entry.counts || { excel: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
    breakdown.html(`
        <div class="review-chip excel">Excel·lents <strong>${counts.excel || 0}</strong></div>
        <div class="review-chip good">Bones <strong>${counts.good || 0}</strong></div>
        <div class="review-chip inaccuracy">Imprecisions <strong>${counts.inaccuracy || 0}</strong></div>
        <div class="review-chip mistake">Errors <strong>${counts.mistake || 0}</strong></div>
        <div class="review-chip blunder">Blunders <strong>${counts.blunder || 0}</strong></div>
    `);
    updateHistoryReview(entry);
    updateHistoryErrorNotes(entry);
    void requestErrorNotes(entry);
    $('#history-personal-hieroglyphic').prop('disabled', !hasPersonalHieroglyphicCandidate(entry));
    updateHistoryProgress();
    updateHistoryControls();
}

function updateHistoryReview(entry) {
    const reviewContent = $('#history-review-content');
    const generateBtn = $('#history-generate-review');
    if (!reviewContent.length) return;
    if (!entry) {
        reviewContent.text('—');
        if (generateBtn.length) generateBtn.prop('disabled', true);
        return;
    }
    const review = entry.aiReview || entry.deepseekReview || entry.geminiReview || null;
    // La ressenya local rica (obertura, fases, obertura semblant per practicar i
    // moments clau) es mostra SEMPRE, fins i tot quan hi ha una ressenya d'OpenAI:
    // la d'OpenAI, si n'hi ha, va a dalt com a redacció addicional.
    const localHtml = renderLocalReviewHtml(entry);
    let html = '';
    if (review && review.text) {
        html += `<div class="ai-review-text">${formatOpenAIReviewText(review.text)}</div>`;
    } else if (review && review.status === 'pending') {
        html += `<p><em>Generant revisió amb OpenAI...</em></p>`;
    } else if (review && review.status === 'error' && openaiApiKey && review.message) {
        html += `<p><em>${escapeHtml(review.message)}</em></p>`;
    }
    html += localHtml;
    if (!html.trim()) {
        reviewContent.text('Encara no hi ha revisió per aquesta partida.');
        if (generateBtn.length) generateBtn.prop('disabled', !openaiApiKey);
        return;
    }
    reviewContent.html(html);
    bindOpenAIMoveLinks(reviewContent);
    // Moments clau: navega a la posició de decisió i ressalta la jugada recomanada al tauler.
    reviewContent.find('.hist-keymove-link').off('click').on('click', function(event) {
        event.preventDefault();
        const moveNumber = Number($(this).data('move-number'));
        const playedSan = String($(this).data('san') || '').trim();
        const best = String($(this).data('best') || '').trim();
        jumpToHistoryMove(moveNumber, playedSan);
        if (best && historyReplay && historyReplay.game) {
            highlightReviewedMove(historyReplay.game.fen(), best);
        }
        const boardEl = document.getElementById('history-board');
        if (boardEl && boardEl.scrollIntoView) boardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    reviewContent.find('.opening-practice-link').off('click').on('click', function(event) {
        event.preventDefault();
        const idx = Number($(this).data('idx'));
        const color = String($(this).data('color') || '');
        practiceOpeningFromHistory(Number.isNaN(idx) ? -1 : idx, color);
    });
    if (generateBtn.length) generateBtn.prop('disabled', (review && review.text) ? true : !openaiApiKey);
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatOpenAIReviewText(text) {
    const safe = escapeHtml(text || '');
    
    // Primer, formatem les cometes per a màximes
    let formatted = safe
        .replace(/&quot;([\s\S]*?)&quot;/g, '<em>"$1"</em>')
        .replace(/\"([\s\S]*?)\"/g, '<em>"$1"</em>');
    
    // Patrons AMPLIATS per capturar més formats de referències a jugades
    const movePatterns = [
        // Formats amb paréntesis: "10. Nxe5", "10 (Nxe5)", etc.
        /(\d+)\.\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?)/gi,
        /jugada\s+(\d+)\s*\(([^)]+)\)/gi,
        /a\s+la\s+jugada\s+(\d+)\s*\(([^)]+)\)/gi,
        /jugada\s+n[úu]mero\s+(\d+)\s*\(([^)]+)\)/gi,
        /moviment\s+(\d+)\s*\(([^)]+)\)/gi,
        /al\s+moviment\s+(\d+)\s*\(([^)]+)\)/gi,
        // Formats sense paréntesis
        /jugada\s+(\d+):\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?)/gi,
        /move\s+(\d+)\s*\(([^)]+)\)/gi,
    ];
    
    // Apliquem cada patró
    movePatterns.forEach(pattern => {
        formatted = formatted.replace(pattern, (match, moveNumber, san) => {
            const cleanSan = san.trim()
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
            
            return `<a href="#" class="openai-move-link" data-move-number="${moveNumber}" data-san="${cleanSan}">${match}</a>`;
        });
    });
    
    return formatted;
}

function bindOpenAIMoveLinks(container) {
    if (!container || !container.length) return;
    container.find('.openai-move-link').off('click').on('click', function(event) {
        event.preventDefault();
        const moveNumber = Number($(this).data('move-number'));
        const san = String($(this).data('san') || '').trim();
        jumpToHistoryMove(moveNumber, san);
    });
}

function jumpToHistoryMove(moveNumber, san) {
    if (!historyReplay || !historyReplay.entry || !historyReplay.moves) return;
    stopHistoryPlayback();
    
    const targetIndex = findHistoryMoveIndex(moveNumber, san);
    if (targetIndex === null || targetIndex < 0) {
        console.warn(`No s'ha trobat la jugada ${moveNumber} (${san})`);
        return;
    }
    
    // Resetegem el joc i avancem fins a la posició ABANS de la jugada errònia
    historyReplay.game = new Chess();
    const stopAt = Math.max(0, targetIndex - 1); // Mostrem la posició just abans
    
    for (let i = 0; i < stopAt; i++) {
        const result = historyReplay.game.move(historyReplay.moves[i], { sloppy: true });
        if (!result) {
            console.warn(`Error aplicant jugada ${i}: ${historyReplay.moves[i]}`);
            break;
        }
    }
    
    historyReplay.moveIndex = stopAt;
    const beforeFen = historyReplay.game.fen();
    updateHistoryBoard();

    // Visualitza la jugada: ressalta la casella d'origen i de destí sobre la
    // posició just abans de jugar-la, perquè es vegi quina peça es mou i on va.
    if (targetIndex > 0 && historyReplay.moves[targetIndex - 1]) {
        const moveStr = historyReplay.moves[targetIndex - 1];
        highlightReviewedMove(beforeFen, moveStr);
    }
}

function highlightReviewedMove(beforeFen, move) {
    $('#history-board .square-55d63').removeClass('highlight-hint');
    if (!beforeFen || !move) return;
    try {
        const g = new Chess(beforeFen);
        const raw = String(move).trim();
        const mv = /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(raw)
            ? g.move({ from: raw.slice(0, 2).toLowerCase(), to: raw.slice(2, 4).toLowerCase(), promotion: (raw[4] || 'q').toLowerCase() })
            : g.move(raw, { sloppy: true });
        if (!mv) return;
        $('#history-board .square-' + mv.from).addClass('highlight-hint');
        $('#history-board .square-' + mv.to).addClass('highlight-hint');
    } catch (e) {}
}

function findHistoryMoveIndex(moveNumber, san) {
    if (!historyReplay || !Array.isArray(historyReplay.moves)) return null;
    const moves = historyReplay.moves;
    const normalizedSan = (san || '').trim().replace(/[+#!?]/g, ''); // Eliminar anotacions
    
    // Primer intent: buscar per número de jugada exacte
    if (moveNumber) {
        // La jugada X correspon a l'índex (X-1)*2 per blanques o (X-1)*2+1 per negres
        // Però necessitem saber el color - intentem ambdós
        const whiteIndex = (moveNumber - 1) * 2;
        const blackIndex = whiteIndex + 1;
        
        // Comprovem si la SAN coincideix
        if (whiteIndex < moves.length) {
            const whiteSan = moves[whiteIndex].replace(/[+#!?]/g, '');
            if (!normalizedSan || whiteSan === normalizedSan) {
                return whiteIndex + 1; // +1 perquè volem mostrar DESPRÉS de jugar
            }
        }
        if (blackIndex < moves.length) {
            const blackSan = moves[blackIndex].replace(/[+#!?]/g, '');
            if (!normalizedSan || blackSan === normalizedSan) {
                return blackIndex + 1;
            }
        }
    }
    
    // Segon intent: buscar per SAN si no hem trobat per número
    if (normalizedSan) {
        for (let i = 0; i < moves.length; i++) {
            const moveSan = moves[i].replace(/[+#!?]/g, '');
            if (moveSan === normalizedSan) {
                // Si tenim moveNumber, comprovem que estigui a prop
                if (moveNumber) {
                    const fullMove = Math.ceil((i + 1) / 2);
                    if (Math.abs(fullMove - moveNumber) <= 1) {
                        return i + 1;
                    }
                } else {
                    return i + 1;
                }
            }
        }
    }
    
    // Tercer intent: només per número de jugada (blanques per defecte)
    if (moveNumber) {
        const defaultIndex = (moveNumber - 1) * 2;
        if (defaultIndex < moves.length) {
            return defaultIndex + 1;
        }
    }
    
    return null;
}

function getSevereErrors(entries) {
    return (entries || [])
        .filter(entry => entry.quality === 'blunder' || (entry.swing || 0) >= 200)
        .map(entry => ({
            fen: entry.fen || null,
            moveNumber: entry.moveNumber || null,
            playerMove: entry.playerMove || null,
            playerMoveSan: entry.playerMoveSan || null,
            bestMove: entry.bestMove || null,
            bestMoveSan: entry.bestMoveSan || null,
            bestMovePv: entry.bestMovePv || [],
            bestMovePvSan: entry.bestMovePvSan || [],
            evalBefore: entry.evalBefore ?? null,
            evalAfter: entry.evalAfter ?? null,
            swing: entry.swing || null,
            isCapture: !!entry.isCapture,
            isCheck: !!entry.isCheck,
            depth: entry.depth || null,
            alternatives: entry.alternatives || [],
            quality: entry.quality || 'blunder'
        }));
}

function getEntrySevereErrors(entry) {
    if (!entry) return [];
    if (Array.isArray(entry.severeErrors) && entry.severeErrors.length) {
        return entry.severeErrors;
    }
    if (Array.isArray(entry.review) && entry.review.length) {
        return getSevereErrors(entry.review);
    }
    return [];
}

// Errades per comentar a la revisió, garantint un mínim (per defecte 3) si la
// partida en té prou: primer les greus i, si calen més, les pitjors imprecisions
// o errors dels moveReviews. Mai no inventa errades que no s'hagin produït.
function getEntryReviewErrors(entry, minCount = 3, maxCount = 5) {
    if (!entry) return [];
    const result = (getEntrySevereErrors(entry) || []).slice();
    const seen = new Set(result.map(e => e.fen).filter(Boolean));
    if (result.length < minCount && Array.isArray(entry.moveReviews)) {
        const extra = entry.moveReviews
            .filter(r => r && r.fen && !seen.has(r.fen) && ['inaccuracy', 'mistake', 'blunder'].includes(r.quality))
            .sort((a, b) => (b.swing || 0) - (a.swing || 0))
            .map(r => ({
                fen: r.fen,
                moveNumber: r.moveNumber || null,
                playerMove: r.playerMove || null,
                playerMoveSan: r.playerMoveSan || null,
                bestMove: r.bestMove || null,
                bestMoveSan: r.bestMoveSan || null,
                bestMovePv: r.bestMovePv || [],
                evalBefore: r.evalBefore ?? null,
                evalAfter: r.evalAfter ?? null,
                swing: r.swing || null,
                alternatives: r.alternatives || [],
                quality: r.quality || 'inaccuracy',
                severity: r.quality === 'blunder' ? 'high' : 'med'
            }));
        for (const e of extra) {
            if (result.length >= minCount) break;
            result.push(e);
            seen.add(e.fen);
        }
    }
    return result.slice(0, Math.max(minCount, maxCount));
}

/* ===================== ERRADES COMENTADES (OpenAI) =====================
   Explicació breu i individual per a cada errada greu de la partida. Es
   genera automàticament (el cost per crida ho permet), es guarda dins de
   l'entrada de l'historial (entry.errorNotes, indexat per FEN) i per tant
   persisteix amb gameHistory a localStorage. */

const ERROR_NOTES_MAX = 4;

// Converteix UCI a SAN quan cal; si ja sembla SAN, es retorna tal qual.
function uciToSanSafe(fen, moveStr) {
    if (!moveStr) return null;
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(moveStr)) return moveStr;
    try {
        const g = new Chess(fen);
        const mv = g.move({ from: moveStr.slice(0, 2).toLowerCase(), to: moveStr.slice(2, 4).toLowerCase(), promotion: (moveStr[4] || 'q').toLowerCase() });
        return mv ? mv.san : moveStr;
    } catch (e) { return moveStr; }
}

function describeSevereError(err) {
    const parts = (err.fen || '').split(' ');
    return {
        moveNumber: err.moveNumber || parseInt(parts[5], 10) || '?',
        played: uciToSanSafe(err.fen, err.playerMoveSan || err.playerMove) || '?',
        best: uciToSanSafe(err.fen, err.bestMoveSan || err.bestMove) || '?',
        pv: (err.bestMovePvSan || err.bestMovePv || []).slice(0, 4).map(m => uciToSanSafe(err.fen, m)).join(' ')
    };
}

function getMoveSquareContext(fen, moveStr) {
    if (!fen || !moveStr) return null;
    const raw = String(moveStr).trim();
    try {
        const g = new Chess(fen);
        let mv = null;
        if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(raw)) {
            mv = g.move({ from: raw.slice(0, 2).toLowerCase(), to: raw.slice(2, 4).toLowerCase(), promotion: (raw[4] || 'q').toLowerCase() });
        } else {
            mv = g.move(raw, { sloppy: true });
        }
        if (!mv) return null;
        const names = { p: 'peó', n: 'cavall', b: 'alfil', r: 'torre', q: 'dama', k: 'rei' };
        return { piece: names[mv.piece] || 'peça', from: mv.from, to: mv.to, san: mv.san };
    } catch (e) { return null; }
}

function buildErrorNotePrompt(err) {
    const d = describeSevereError(err);
    const playedCtx = getMoveSquareContext(err.fen, err.playerMove || err.playerMoveSan);
    const bestCtx = getMoveSquareContext(err.fen, err.bestMove || err.bestMoveSan);
    const coordLine = [
        playedCtx ? `Jugada errònia: ${playedCtx.piece} ${playedCtx.from}-${playedCtx.to}` : '',
        bestCtx ? `Millor jugada: ${bestCtx.piece} ${bestCtx.from}-${bestCtx.to}` : ''
    ].filter(Boolean).join('\n');
    return `Ets un entrenador d'escacs directe i clar que parla en català i tuteja l'alumne.
Posició abans de la jugada (FEN): ${err.fen}
A la jugada ${d.moveNumber} l'alumne va jugar ${d.played}, però la millor jugada era ${d.best}.${d.pv ? `\nContinuació correcta: ${d.pv}` : ''}
${coordLine ? `\n${coordLine}` : ''}

Explica l'errada en 2 frases curtes (màxim 45 paraules).

REGLES OBLIGATÒRIES
- Escriu només noms de peces i caselles amb lletra+número (exemples: cavall f3, dama h5, de e2 a e4).
- No escriguis notació algebraica/SAN com Nxe5, Qh5+, O-O ni símbols com +, #, ! o ?.
- No facis servir llistes, markdown ni cometes.
- No inventis jugades que no es dedueixin de la posició.`;
}

function getErrorNoteKey(err) { return err && err.fen ? err.fen : ''; }

// Localitza el moveReview complet (alternatives, swing, SAN, eval...) que
// correspon a una errada desada, per donar a l'explicació local el màxim context.
function findMoveReviewForError(entry, err) {
    if (!entry || !Array.isArray(entry.moveReviews) || !err || !err.fen) return null;
    return entry.moveReviews.find(r => r && r.fen === err.fen) || null;
}

// Explicació rica d'una errada generada LOCALMENT (sense OpenAI): fets posicionals
// concrets, diagnòstic segons tema i gravetat, el pla correcte, la continuació de
// la línia i una pregunta de reflexió. Reaprofita el banc de plans humans.
function buildLocalErrorNote(err, entry) {
    if (!err) return 'Errada detectada en aquesta posició.';
    const d = describeSevereError(err);
    const mr = findMoveReviewForError(entry, err);
    const review = mr || {
        fen: err.fen,
        moveNumber: err.moveNumber,
        playerMove: err.playerMove,
        playerMoveSan: err.playerMoveSan,
        bestMove: err.bestMove,
        bestMoveSan: err.bestMoveSan,
        bestMovePv: err.bestMovePv || [],
        alternatives: err.alternatives || [],
        swing: typeof err.swing === 'number' ? err.swing : 0,
        quality: err.quality || (err.severity === 'high' ? 'blunder' : 'mistake')
    };
    let ctx = null;
    try { ctx = buildPlanContext(review); } catch (e) { ctx = null; }
    const themeKey = detectPlanSubtheme(review, ctx);
    const moment = {
        moveNumber: review.moveNumber || d.moveNumber,
        phase: phaseFromContext(ctx, review.moveNumber),
        themeKey,
        theme: planThemeDisplayLabel(themeKey),
        played: review.playerMoveSan || d.played,
        best: review.bestMoveSan || d.best,
        playedDesc: moveHumanText(err.fen, err.playerMove || review.playerMoveSan, d.played),
        bestDesc: moveHumanText(err.fen, err.bestMove || review.bestMoveSan, d.best),
        bestMoveUci: review.bestMove || null,
        swing: Math.round(review.swing || 0),
        quality: review.quality || 'mistake',
        fen: review.fen,
        pv: Array.isArray(review.bestMovePv) ? review.bestMovePv : [],
        positional: buildPositionalNote(ctx),
        candidates: buildCandidatesNote(review)
    };
    let plan = {};
    try { plan = buildLocalHumanPlan(moment); } catch (e) { plan = {}; }
    const parts = [];
    if (moment.positional) parts.push(moment.positional);
    if (plan.diagnosis) parts.push(plan.diagnosis);
    if (plan.plan) parts.push(plan.plan);
    if (moment.candidates) parts.push(moment.candidates);
    if (plan.question) parts.push(plan.question);
    const text = parts.filter(Boolean).join(' ').trim();
    return text || `En lloc de ${d.played}, la jugada precisa era ${d.best}.`;
}

// =================== NOMENCLATURA DESCRIPTIVA + ENLLAÇOS ===================
// Descriu un moviment amb llenguatge planer (nom de la peça, ala dreta/esquerra,
// columna del peó) en comptes de notació algebraica, perquè sigui llegible per a
// algú sense coneixements de nomenclatura. Retorna també la SAN i les caselles
// origen/destí per poder visualitzar la jugada al tauler.
function flankWordFor(color, fromSquare) {
    const fileIdx = (fromSquare || 'a1').charCodeAt(0) - 97; // a=0 ... h=7
    const leftForWhite = fileIdx <= 3;
    const isLeft = color === 'w' ? leftForWhite : !leftForWhite;
    return isLeft ? 'esquerra' : 'dreta';
}

function describeMoveHuman(fen, move) {
    if (!fen || !move) return null;
    try {
        const g = new Chess(fen);
        const raw = String(move).trim();
        let mv;
        if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(raw)) {
            mv = g.move({ from: raw.slice(0, 2).toLowerCase(), to: raw.slice(2, 4).toLowerCase(), promotion: (raw[4] || 'q').toLowerCase() });
        } else {
            mv = g.move(raw, { sloppy: true });
        }
        if (!mv) return null;
        const names = { p: 'peó', n: 'cavall', b: 'alfil', r: 'torre', q: 'dama', k: 'rei' };
        const promoNames = { q: 'dama', r: 'torre', b: 'alfil', n: 'cavall' };
        let text;
        if (mv.flags.includes('k')) text = 'enroc curt';
        else if (mv.flags.includes('q')) text = 'enroc llarg';
        else if (mv.piece === 'p') {
            const verb = mv.captured ? 'captura a' : 'avança a';
            text = `el peó de la columna ${mv.from[0]} ${verb} ${mv.to}`;
            if (mv.promotion) text += ` i corona ${promoNames[mv.promotion] || 'dama'}`;
        } else {
            let name = names[mv.piece] || 'peça';
            // Desambiguació dreta/esquerra només si hi ha dues peces iguals del mateix color.
            if (mv.piece === 'n' || mv.piece === 'b' || mv.piece === 'r') {
                const field = fen.split(' ')[0];
                const letter = mv.color === 'w' ? mv.piece.toUpperCase() : mv.piece.toLowerCase();
                const count = (field.match(new RegExp(letter, 'g')) || []).length;
                if (count > 1) {
                    const flank = flankWordFor(mv.color, mv.from);
                    name += flank === 'esquerra' ? " de l'esquerra" : ' de la dreta';
                }
            }
            const verb = mv.captured ? 'captura a' : 'va a';
            text = `${/^[ae]/.test(name) ? "l'" : 'el '}${name} ${verb} ${mv.to}`;
        }
        if (mv.san.includes('#')) text += ' amb escac i mat';
        else if (mv.san.includes('+')) text += ' amb escac';
        return { text, san: mv.san, from: mv.from, to: mv.to };
    } catch (e) { return null; }
}

// Text descriptiu curt d'un moviment (només el text), amb la SAN com a fallback.
function moveHumanText(fen, move, fallback) {
    const d = describeMoveHuman(fen, move);
    return d ? d.text : (fallback || uciToSanSafe(fen, move) || String(move || ''));
}

// =================== ANÀLISI PER FASES DE LA PARTIDA ===================
function classifyPhaseByMoveNumber(n) {
    const num = n || 0;
    if (num <= 10) return 'opening';
    if (num <= 28) return 'middlegame';
    return 'endgame';
}

// Precisió i temes d'error per fase (obertura / mig joc / final) a partir dels
// moveReviews desats de la partida.
function buildPhaseStats(entry) {
    const reviews = Array.isArray(entry?.moveReviews) ? entry.moveReviews : [];
    const mk = () => ({ good: 0, total: 0, errs: [] });
    const phases = { opening: mk(), middlegame: mk(), endgame: mk() };
    reviews.forEach(r => {
        if (!r) return;
        const p = phases[classifyPhaseByMoveNumber(r.moveNumber)];
        p.total++;
        if (r.quality === 'excel' || r.quality === 'good') p.good++;
        if (r.quality === 'inaccuracy' || r.quality === 'mistake' || r.quality === 'blunder') p.errs.push(r);
    });
    const summarize = (p) => {
        const themeCounts = {};
        p.errs.forEach(r => {
            let key = 'general';
            try { key = detectPlanSubtheme(r); } catch (e) { key = 'general'; }
            const label = planThemeDisplayLabel(key);
            themeCounts[label] = (themeCounts[label] || 0) + 1;
        });
        const themes = Object.keys(themeCounts)
            .sort((a, b) => themeCounts[b] - themeCounts[a])
            .slice(0, 2);
        return {
            precision: p.total > 0 ? Math.round((p.good / p.total) * 100) : null,
            total: p.total,
            errors: p.errs.length,
            themes
        };
    };
    return { opening: summarize(phases.opening), middlegame: summarize(phases.middlegame), endgame: summarize(phases.endgame) };
}

// Comentari de millora segons els temes d'error d'una fase (reaprofita el banc de
// plans humans). Si no hi ha temes concrets, dona un consell genèric de la fase.
function buildPhaseAdvice(themes, phaseKey) {
    const fallbackByPhase = {
        opening: 'Desenvolupa les peces cap al centre, no moguis dues vegades la mateixa peça i enroca aviat.',
        middlegame: 'Abans de cada jugada, mira els escacs, captures i amenaces; coordina les peces cap a un pla.',
        endgame: 'Al final, activa el rei cap al centre, empeny els peons passats i posa les torres darrere dels peons.'
    };
    if (!themes || !themes.length) return fallbackByPhase[phaseKey] || '';
    const labelToKey = {};
    Object.keys(HUMAN_PLAN_BANK).forEach(k => { labelToKey[planThemeDisplayLabel(k)] = k; });
    const key = labelToKey[themes[0]];
    const pool = (key && HUMAN_PLAN_BANK[key] && HUMAN_PLAN_BANK[key].objective) ? HUMAN_PLAN_BANK[key].objective : null;
    if (pool && pool.length) {
        const tip = fillPlanTemplate(pickFreshPlanLine(pool, `phaseadvice:${phaseKey}:${key}`), {});
        if (tip) return tip;
    }
    return fallbackByPhase[phaseKey] || '';
}

// =================== NAVEGACIÓ A LA PRÀCTICA D'OBERTURA ===================
// Troba l'obertura del repertori (CURATED_OPENINGS) més semblant a la partida
// jugada, comparant la coincidència de jugades des de l'inici (prefix comú).
function findClosestCuratedOpening(sanMoves) {
    if (!Array.isArray(CURATED_OPENINGS) || !Array.isArray(sanMoves) || !sanMoves.length) return null;
    const norm = s => String(s || '').replace(/[+#!?]/g, '');
    const game = sanMoves.map(norm);
    let best = null;
    CURATED_OPENINGS.forEach((op, i) => {
        const line = (op.moves || []).map(norm);
        let match = 0;
        for (let k = 0; k < Math.min(line.length, game.length); k++) {
            if (line[k] === game[k]) match++; else break;
        }
        if (match >= 2 && (!best || match > best.match)) best = { index: i, opening: op, match };
    });
    return best;
}

// Obre la pràctica de l'obertura del repertori (per índex) amb el color demanat.
function practiceOpeningFromHistory(idx, color) {
    try {
        $('#history-screen').hide();
        $('#opening-screen').show();
        navPush('opening-screen');
        renderOpeningStatsScreen();
        renderOpeningLessonButtons();
        initOpeningBundleBoard();
        const forceColor = (color === 'w' || color === 'b') ? color : undefined;
        if (typeof idx === 'number' && idx >= 0) {
            startOpeningLesson(idx, forceColor);
        } else {
            startOpeningPracticeAsColor(forceColor || openingPracticeUserColor);
            setOpeningScreenMode('overview');
            showToast('No tinc una lliçó concreta d’aquesta obertura; practica-la lliurement.', 'info');
        }
        if (openingBundleBoard && typeof openingBundleBoard.resize === 'function') {
            setTimeout(() => openingBundleBoard.resize(), 60);
        }
    } catch (e) { console.warn('practiceOpeningFromHistory', e); }
}

// =================== RESSENYA LOCAL EN HTML (sense OpenAI) ===================
// Construeix la ressenya rica de l'historial: debrief, obertura amb enllaç a la
// pràctica i % de correcció, % i temes del mig joc, % i consell del final, i els
// moments clau amb jugades descriptives clicables.
function renderLocalReviewHtml(entry) {
    if (!entry) return '';
    const blocks = [];
    try {
        const facts = buildDebriefFacts(entry);

        // --- Màxima d'inici ---
        let maxim = '';
        try { maxim = pickOfflineMaxim((facts && (facts.topErrorTheme || facts.weakestTheme)) || 'general'); } catch (e) { maxim = ''; }
        if (maxim) {
            blocks.push(`<blockquote style="margin:0 0 12px 0; padding:8px 12px; border-left:3px solid var(--accent-gold); font-style:italic; opacity:0.95;">“${escapeHtml(maxim)}”</blockquote>`);
        }

        if (facts) {
            const debrief = composeDebriefText(facts, entry.id, pickCoachVoiceForKey(entry.id));
            if (debrief) blocks.push(`<p>${escapeHtml(debrief)}</p>`);
        }
        const phases = buildPhaseStats(entry);
        const pct = v => (typeof v === 'number' ? `${v}%` : '—');

        // --- Obertura ---
        const sanMoves = getHistoryMoves(entry);
        if (!openingTrie) { try { initOpeningSystem(); } catch (e) {} }
        let oa = null;
        try { oa = analyzeGameOpening(sanMoves); } catch (e) { oa = null; }
        if (oa && oa.name) {
            let openingTxt = `<strong>Obertura:</strong> ${escapeHtml(oa.name)}${oa.eco ? ` (${escapeHtml(oa.eco)})` : ''} · correcció ${pct(phases.opening.precision)}.`;
            if (oa.deviationMove && oa.deviationBy && entry.playerColor && oa.deviationBy === entry.playerColor) {
                const moveNum = Math.floor((oa.deviationPly || 0) / 2) + 1;
                openingTxt += ` Vas sortir de la teoria a la jugada ${moveNum}`;
                if (Array.isArray(oa.theoryMoves) && oa.theoryMoves.length) {
                    let devFen = null;
                    try {
                        const g = new Chess();
                        for (let i = 0; i < (oa.deviationPly || 0); i++) { if (!g.move(sanMoves[i], { sloppy: true })) break; }
                        devFen = g.fen();
                    } catch (e) { devFen = null; }
                    const theoryDesc = devFen ? moveHumanText(devFen, oa.theoryMoves[0]) : oa.theoryMoves[0];
                    openingTxt += `; la teoria seguia amb ${escapeHtml(theoryDesc)}.`;
                } else openingTxt += '.';
            }
            blocks.push(`<p>${openingTxt}</p>`);
        }

        // --- Obertura més semblant per practicar (enllaços per a tots dos colors) ---
        const closest = findClosestCuratedOpening(sanMoves);
        if (closest) {
            const wLink = `<a href="#" class="opening-practice-link" data-idx="${closest.index}" data-color="w">practicar amb blanques</a>`;
            const bLink = `<a href="#" class="opening-practice-link" data-idx="${closest.index}" data-color="b">practicar amb negres</a>`;
            blocks.push(`<p><strong>Per practicar:</strong> l'obertura del repertori més semblant a la que vas jugar és <strong>${escapeHtml(closest.opening.name)}</strong> (${escapeHtml(closest.opening.eco)}). ${wLink} · ${bLink}.</p>`);
        }

        // --- Mig joc ---
        if (phases.middlegame.total > 0) {
            let midTxt = `<strong>Mig joc:</strong> correcció ${pct(phases.middlegame.precision)}.`;
            if (phases.middlegame.themes.length) {
                midTxt += ` Errors més habituals: ${phases.middlegame.themes.map(escapeHtml).join(', ')}.`;
            } else {
                midTxt += ' Sense errors destacats en aquesta fase.';
            }
            blocks.push(`<p>${midTxt}</p>`);
        }

        // --- Final ---
        if (phases.endgame.total > 0) {
            let endTxt = `<strong>Final:</strong> correcció ${pct(phases.endgame.precision)}.`;
            const advice = buildPhaseAdvice(phases.endgame.themes, 'endgame');
            if (advice) endTxt += ` ${escapeHtml(advice)}`;
            blocks.push(`<p>${endTxt}</p>`);
        }

        // --- Moments clau (jugades descriptives clicables) ---
        const moments = buildHumanPlanMoments(entry);
        if (moments.length) {
            const items = moments.map(m => {
                const desc = m.fen ? moveHumanText(m.fen, m.bestMoveUci || m.best, m.best) : m.best;
                // Enllaç especialitzat: la millor jugada no es va jugar mai, així que
                // naveguem a la posició de decisió (per la jugada realment feta) i
                // hi ressaltem la jugada recomanada al tauler.
                const link = `<a href="#" class="hist-keymove-link" data-move-number="${m.moveNumber || ''}" data-san="${escapeHtml(m.played || '')}" data-best="${escapeHtml(m.bestMoveUci || m.best || '')}">${escapeHtml(desc)}</a>`;
                const seg = [`<strong>Jugada ${escapeHtml(String(m.moveNumber))}</strong> (${escapeHtml(m.theme)}): millor jugada → ${link}.`];
                if (m.positional) seg.push(escapeHtml(m.positional));
                if (m.diagnosis) seg.push(escapeHtml(m.diagnosis));
                if (m.plan) seg.push(escapeHtml(m.plan));
                return `<li style="margin-bottom:8px;">${seg.filter(Boolean).join(' ')}</li>`;
            }).join('');
            blocks.push(`<p><strong>Moments clau:</strong></p><ul style="margin:4px 0 0 18px; padding:0;">${items}</ul>`);
        }
    } catch (e) { console.warn('renderLocalReviewHtml', e); }
    return blocks.join('\n');
}


// Claus (id de partida + FEN) amb una crida en curs: l'estat 'pending' persistit
// no és fiable (l'app es pot tancar a mig generar), així que el control de
// duplicats viu només en memòria i una nota no acabada es torna a demanar.
const errorNotesInFlight = new Set();

async function requestErrorNotes(entry, severeErrors) {
    if (!entry || !openaiApiKey) return;
    const errors = (Array.isArray(severeErrors) && severeErrors.length ? severeErrors : getEntrySevereErrors(entry)).slice(0, ERROR_NOTES_MAX);
    if (!errors.length) return;
    if (!entry.errorNotes) entry.errorNotes = {};
    const pending = errors.filter(err => {
        const key = getErrorNoteKey(err);
        if (!key || errorNotesInFlight.has(`${entry.id}:${key}`)) return false;
        const note = entry.errorNotes[key];
        return !(note && note.status === 'done' && note.text);
    });
    if (!pending.length) return;
    pending.forEach(err => {
        const key = getErrorNoteKey(err);
        errorNotesInFlight.add(`${entry.id}:${key}`);
        entry.errorNotes[key] = { status: 'pending', text: '' };
    });
    refreshHistoryErrorNotes(entry);
    await Promise.all(pending.map(async err => {
        const key = getErrorNoteKey(err);
        try {
            const result = await callOpenAI(buildErrorNotePrompt(err), { generationConfig: { maxOutputTokens: 600 } });
            if (!result.ok || !result.text) throw new Error(result.errorMessage || `OpenAI error ${result.status}`);
            entry.errorNotes[key] = { status: 'done', text: result.text.replace(/\*\*/g, '').trim() };
        } catch (e) {
            console.error('[ErrorNotes]', e?.message || e);
            entry.errorNotes[key] = { status: 'error', text: '', message: e?.message || '' };
        } finally {
            errorNotesInFlight.delete(`${entry.id}:${key}`);
        }
    }));
    saveStorage();
    refreshHistoryErrorNotes(entry);
}

function refreshHistoryErrorNotes(entry) {
    if (historyReplay && historyReplay.entry && entry && historyReplay.entry.id === entry.id) {
        updateHistoryErrorNotes(historyReplay.entry);
    }
}

function updateHistoryErrorNotes(entry) {
    const container = $('#history-error-notes');
    const block = $('#history-error-notes-block');
    if (!container.length) return;
    // Comentem un mínim de 3 errades (si la partida en té), completant amb les
    // pitjors imprecisions quan no hi ha prou errades greus.
    const errors = entry ? getEntryReviewErrors(entry, 3, ERROR_NOTES_MAX) : [];
    if (!errors.length) {
        if (block.length) block.hide();
        container.empty();
        return;
    }
    if (block.length) block.show();
    const notes = entry.errorNotes || {};
    let html = '';
    errors.forEach((err, idx) => {
        const d = describeSevereError(err);
        const note = notes[getErrorNoteKey(err)] || null;
        // Nomenclatura descriptiva (nom de peça, ala dreta/esquerra, columna del peó)
        // perquè sigui llegible sense conèixer la notació.
        const playedDesc = moveHumanText(err.fen, err.playerMove || err.playerMoveSan, d.played);
        const bestDesc = moveHumanText(err.fen, err.bestMove || err.bestMoveSan, d.best);
        let body;
        if (note && note.status === 'done' && note.text) body = escapeHtml(note.text);
        else if (note && note.status === 'pending') body = '<em>Generant l’explicació...</em>';
        // Sense nota d'OpenAI (o sense clau): explicació local a partir de l'anàlisi
        // de Stockfish, perquè cada errada sempre tingui una explicació útil.
        else body = escapeHtml(buildLocalErrorNote(err, entry));
        html += `<div class="error-note" data-error-idx="${idx}" role="button" tabindex="0" title="Clica per tornar a generar aquest exercici al tauler i resoldre'l amb pista i màxima">
            <div class="error-note-head">Jugada ${escapeHtml(String(d.moveNumber))}: vas jugar <strong>${escapeHtml(playedDesc)}</strong> · la millor era <strong>${escapeHtml(bestDesc)}</strong></div>
            <div class="error-note-body">${body}</div>
            <div class="error-note-action">Clica per portar aquesta errada al tauler i corregir-la en dos moviments amb Pista i Màxima.</div>
        </div>`;
    });
    container.html(html);
    container.find('.error-note').off('click keydown').on('click keydown', function(event) {
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        const idx = Number(this.dataset.errorIdx);
        const err = errors[idx];
        startHistoryErrorPractice(err);
    });
}

function startHistoryErrorPractice(err) {
    if (!err || !err.fen) return false;
    matchErrorReturnReviewSnapshot = null;
    const entry = historyReplay && historyReplay.entry ? historyReplay.entry : null;
    const siblingErrors = getEntrySevereErrors(entry)
        .filter(candidate => candidate && candidate.fen && candidate.fen !== err.fen);
    stopHistoryPlayback();
    isRandomBundleSession = false;
    isSrsReviewSession = false;
    isDailyPuzzleSession = false;
    matchErrorQueue = siblingErrors;
    currentMatchError = err;
    isMatchErrorReviewSession = true;
    currentBundleSource = 'history';
    currentBundleSeverity = err.severity || (err.quality === 'blunder' ? 'high' : 'med');
    currentGameMode = 'bundle';
    currentOpponent = null;
    showToast('Errada carregada al tauler: resol-la en dos moviments. Pots fer servir Pista o Màxima.', 'success');
    startGame(true, err.fen);
    return true;
}

function buildOpenAIBundleHintPrompt(step, context = {}) {
    const stepNumber = step === 2 ? 2 : 1;
    const sentenceCount = stepNumber === 1 ? 2 : 1;
    const sentenceText = sentenceCount === 1 ? '1 frase' : '2 frases';
    const maxChars = 600;
    
    // Construir context posicional
    let contextText = '';
    if (context.fen) {
        contextText += `\nPOSICIÓ (FEN): ${context.fen}`;
    }
    if (context.playerMove) {
        contextText += `\nJugada feta: ${context.playerMove}`;
    }
    if (context.bestMove) {
        contextText += `\nMillor jugada: ${context.bestMove}`;
    }
    if (context.bestMovePv && context.bestMovePv.length) {
        contextText += `\nVariant principal: ${context.bestMovePv.slice(0, 4).join(' ')}`;
    }
    if (context.severity) {
        const severityLabels = { low: 'lleu', med: 'mitjà', high: 'greu' };
        contextText += `\nGravetat: Error ${severityLabels[context.severity] || 'desconegut'}`;
    }
    
    const extraStep1 = stepNumber === 1
        ? `\n\nPer al pas 1, genera dues frases com a màxim:\n- La primera frase ha d'apuntar a un concepte tàctic o estratègic general aplicable a aquesta posició.\n- La segona frase ha d'orientar subtilment cap a la peça o zona clau sense revelar directament la jugada.\n`
        : '';
    
    return `Ets un entrenador d'escacs expert. Analitza aquesta situació i genera ${sentenceText} en català amb màximes o principis d'escacs per ajudar a trobar la millor jugada del pas ${stepNumber}.
${contextText}

REGLES IMPERATIVES:
- Cada frase ha de tenir entre 20 i 250 caràcters
- Les màximes han de ser específiques i accionables, no genèriques
- NO facis servir frases de menys de 5 paraules
- NO repeteixis conceptes entre frases
- NO facis servir cometes, emojis, ni enumeracions
- Centra't en conceptes tàctics concrets: forquilles, clavades, atacs dobles, debilitats de peó, peces sobrecarregades, línies obertes, control del centre
- Les màximes han de guiar sense revelar directament la solució
${extraStep1}
BONS EXEMPLES de màximes per al pas 1:
Les peces actives sempre busquen caselles que controlin múltiples objectius simultàniament
Identifica les peces enemigues que defensen múltiples punts i sobrecarrega-les
Quan el rei està al centre les columnes obertes són autopistes d'atac

BONS EXEMPLES de màximes per al pas 2:
Després d'una tàctica guanyadora cal consolidar amb jugades naturals de desenvolupament
Mantén la pressió sobre els punts febles abans que l'adversari pugui reagrupar-se

Genera ara ${sentenceText} específica${sentenceCount === 1 ? '' : 's'} per aquesta posició:`;
}

function buildBundleOpenAIPromptWithFixedSequence(step) {
    if (!bundleFixedSequence) return null;

    const stepData = (step === 1 ? bundleFixedSequence.step1 : bundleFixedSequence.step2) || {};
    const voice = getStrategicVoice();

    // La seqüència pot tenir 1 sol moviment (p. ex. "Practica aquest pla") o 3 (bundle clàssic).
    const sequenceText = (bundleFixedSequence.fullSequenceSan || [])
        .map((san, i) => `${i + 1}. ${i % 2 === 0 ? 'Jugador' : 'Oponent'}: ${san}`)
        .join('\n') || `1. Jugador: ${stepData.playerMoveSan || '—'}`;
    const materialBalance = stepData.position?.material?.balance ?? '—';
    const tacticThemes = (stepData.threats?.themes || []).join(', ') || 'Cap';

    if (step === 1) {
        return `Ets un mestre d'escacs que aplica els principis de "${voice.work}" de ${voice.name} als escacs.

SEQÜÈNCIA TÀCTICA COMPLETA (no revelar):
${sequenceText}

CONTEXT DEL PRIMER PAS:
Posició (FEN): ${stepData.fen}
Millor jugada: ${stepData.playerMoveSan}
Balanç material: ${materialBalance}
Temes tàctics: ${tacticThemes}

INSTRUCCIONS:
Genera exactament 2 màximes o principis d'escacs inspirats en "${voice.work}":

1. Primera màxima: Visió estratègica general que engloba els dos moviments de la seqüència sencera
2. Segona màxima: Principi tàctic específic pel primer moviment concret

REGLES IMPERATIVES:
- Només les màximes, res més
- Cada màxima entre 20-250 caràcters
- Inspirades en "${voice.work}" de ${voice.name}
- NO revelar directament la solució
- NO numerar les màximes
- NO afegir comentaris explicatius

FORMAT DE SORTIDA:
Màxima general
Màxima específica`;
    } else {
        return `Ets un mestre d'escacs que aplica els principis de "${voice.work}" de ${voice.name} als escacs.

CONTEXT DEL SEGON PAS:
Posició (FEN): ${stepData.fen}
Millor jugada: ${stepData.playerMoveSan}
Balanç material: ${materialBalance}
Temes tàctics: ${tacticThemes}

INSTRUCCIONS:
Genera exactament 1 màxima o principi d'escacs inspirat en "${voice.work}" per al segon moviment de la seqüència.

REGLES IMPERATIVES:
- Només la màxima, res més
- Entre 20-250 caràcters
- Inspirada en "${voice.work}" de ${voice.name}
- NO revelar directament la solució
- NO numerar
- NO afegir comentaris explicatius

FORMAT DE SORTIDA:
Màxima específica`;
    }
}

// Obté les continuacions possibles agrupades per moviment
function getOpeningContinuations(sequence) {
    if (!openingTrie) return { continuations: {}, total: 0 };

    let node = openingTrie;

    // Si no hi ha seqüència, comencem des de l'arrel
    if (sequence.length > 0) {
        for (const move of sequence) {
            if (!node.children[move]) {
                return { continuations: {}, total: 0 };
            }
            node = node.children[move];
        }
    }

    // Agrupar obertures per següent moviment
    const continuations = {};
    let total = 0;

    for (const [nextMove, childNode] of Object.entries(node.children)) {
        // Recollir obertures d'aquest camí
        const openings = [];
        function collect(n) {
            openings.push(...n.openings);
            for (const child of Object.values(n.children)) {
                collect(child);
            }
        }
        collect(childNode);

        if (openings.length > 0) {
            // Ordenar per longitud de moviments (més curtes primer = més generals)
            openings.sort((a, b) => a.moves.length - b.moves.length);
            continuations[nextMove] = openings.slice(0, 3); // Màxim 3 per moviment
            total += openings.length;
        }
    }

    return { continuations, total };
}

function getStrategicVoice() {
    const voices = [
        { name: 'Sun Tzu', work: "L'Art de la Guerra", style: 'militar i filosòfic', example: "L’estratega savi prepara la victòria abans que comenci la batalla. Conèixer el terreny és conèixer les possibilitats." },
        { name: 'Miyamoto Musashi', work: 'El Llibre dels Cinc Anells', style: "marcial i contemplatiu, centrat en la percepció i el ritme", example: "Observa l'adversari com l'aigua observa la pedra: sense pressa, però sense pausa. El ritme correcte desarma qualsevol defensa." },
        { name: 'Nicolau Maquiavel', work: 'El Príncep', style: "pragmàtic i incisiu, centrat en el poder i l'oportunitat", example: "Qui domina el centre domina les rutes, i qui domina les rutes decideix on es lliura la batalla." },
        { name: 'Carl von Clausewitz', work: 'De la Guerra', style: "analític i metòdic, centrat en la fricció i la incertesa", example: "Cap pla sobreviu al primer contacte amb l'enemic. La victòria pertany a qui s'adapta més ràpid al caos del tauler." }
    ];
    return voices[Math.floor(Math.random() * voices.length)];
}

function getOpeningStrategicVoice() {
    return {
        name: 'Sun Tzu',
        work: "L'Art de la Guerra",
        style: 'breu, estratègic, militar i filosòfic',
        example: "L’estratega prepara el camp abans que soni el primer tambor: pren el centre, oculta el pla i converteix el primer avantatge en domini del mig joc."
    };
}

function buildOpeningEncouragementPrompt() {
    const voice = getOpeningStrategicVoice();
    return `Ets ${voice.name}, mestre estratega, i dones un consell abans d'una partida d'escacs.

TASCA: Escriu un paràgraf d'encoratjament en català natural, estil "${voice.work}".

CONTINGUT:
- Parla de la preparació abans de la batalla
- Relaciona el domini del centre amb el terreny
- Menciona iniciativa, amenaça latent i adaptació al rival
- Recorda que no cal revelar el pla abans d'hora
- Indica com l'obertura ha de convertir-se en avantatge de mig joc
- To ${voice.style}
- Acaba amb un consell inspirador per començar la partida

REGLES:
- Entre 3 i 6 frases
- To filosòfic i inspirador
- Sense emojis
- Sense cometes al voltant de tot el text
- En català
- IMPORTANT: Acaba sempre amb un punt final

EXEMPLE D'ESTIL (NO COPIAR):
"${voice.example}"

Escriu ara:`
}

function buildOpeningAlternativesPrompt(sequence, continuations, selectedOpening) {
    const movesStr = sequence.join(' ');

    // Preparar llista d'alternatives
    let alternativesText = '';
    const moves = Object.keys(continuations);

    for (const move of moves.slice(0, 5)) { // Màxim 5 alternatives
        const openings = continuations[move];
        const names = openings.map(o => o.name).slice(0, 3).join(', ');
        alternativesText += `- ${move}: ${names}\n`;
    }

    const currentOpeningInfo = selectedOpening
        ? `OBERTURA ACTUAL: [${selectedOpening.eco || '??'}] ${selectedOpening.name}`
        : 'POSICIÓ: Sense obertura específica detectada';

    const voice = getOpeningStrategicVoice();
    return `Ets ${voice.name} aplicant "${voice.work}" als escacs.

SEQÜÈNCIA JUGADA: ${movesStr || '(inici)'}
${currentOpeningInfo}

CONTINUACIONS POSSIBLES:
${alternativesText || 'Cap continuació teòrica'}

TASCA: Escriu una anàlisi completa en català (entre 5 i 10 frases):

1. OBERTURA ACTUAL: Explica què és aquesta obertura, el seu origen històric si el coneixes, i quin és el seu objectiu estratègic principal.

2. ALTERNATIVES: Per cada continuació possible, descriu-la amb metàfores ${voice.style}:
   - NO diguis els moviments directament (${moves.slice(0, 3).join(', ')})
   - Usa al·lusions: "el camí del centre", "el flanc de rei", "la diagonal oculta", "l'avanç dels peons", "el salt del cavall"
   - Explica quina filosofia estratègica representa cada camí

3. CONSELL: Acaba amb un consell estratègic inspirat en ${voice.name} sobre preparació, terreny central, iniciativa, engany, pressió, atac indirecte, adaptació i conversió de l'obertura en avantatge de mig joc.

REGLES:
- Entre 5 i 10 frases
- Sense emojis ni numeració
- To estratègic ${voice.style}
- En català
- IMPORTANT: Acaba sempre amb un punt final

Respon:`
}

function updateOpeningMaximButton() {
    const btn = document.getElementById('btn-opening-bundle-maxim');
    if (!btn) return;
    const label = btn.querySelector('span');
    const disabledByMode = !!hieroglyphicExerciseActive;
    btn.style.display = disabledByMode ? 'none' : 'inline-flex';
    btn.disabled = disabledByMode || !!openingMaximPending;
    btn.classList.toggle('thinking', !!openingMaximPending);
    if (label) label.textContent = openingMaximPending ? 'Pensant...' : 'Màxima';
}

function getOpeningMaximContextToken() {
    return {
        fen: openingPracticeGame ? openingPracticeGame.fen() : '',
        sequence: JSON.stringify(openingCurrentSequence || []),
        lesson: !!openingLessonActive,
        hieroglyphic: !!hieroglyphicExerciseActive,
        errorPractice: !!openingErrorPracticeActive,
        id: ++openingMaximRequestCounter
    };
}

function isOpeningMaximContextCurrent(token) {
    return !!token
        && openingPracticeGame
        && token.fen === openingPracticeGame.fen()
        && token.sequence === JSON.stringify(openingCurrentSequence || [])
        && token.lesson === !!openingLessonActive
        && token.hieroglyphic === !!hieroglyphicExerciseActive
        && token.errorPractice === !!openingErrorPracticeActive
        && token.id === openingMaximRequestCounter;
}

function classifyOpeningPositionForMaxim() {
    const fen = openingPracticeGame ? openingPracticeGame.fen() : '';
    const moves = openingPracticeGame ? openingPracticeGame.history() : [];
    const oa = moves.length ? analyzeGameOpening(moves) : null;
    const validNext = getValidOpeningMoves(moves);
    if (openingLessonActive) return { theme: 'lesson', title: 'Màxima de lliçó', opening: openingLessonInfo, fen, moves, detected: oa, validNext };
    if (openingErrorPracticeActive) return { theme: 'error', title: 'Màxima per corregir l’error', opening: null, fen, moves, detected: oa, validNext };
    if (oa && oa.name) return { theme: 'detected', title: 'Base teòrica detectada', opening: oa, fen, moves, validNext };
    if (openingSelectedOpening) return { theme: 'opening', title: 'Màxima d’obertura', opening: openingSelectedOpening, fen, moves, detected: oa, validNext };
    return { theme: moves.length ? 'position' : 'general', title: 'Màxima d’obertura', opening: null, fen, moves, detected: oa, validNext };
}

function buildOfflineOpeningMaxim(info = classifyOpeningPositionForMaxim()) {
    const voice = getOpeningStrategicVoice();
    const openingName = info.opening?.name || info.detected?.name || '';
    const lines = {
        lesson: `Abans de moure, aprèn el camí com qui estudia el terreny abans de la batalla: cada peça desenvolupada ha de preparar el centre i guardar una amenaça latent. No revelis tot el pla; deixa que la línia et porti a un mig joc favorable.`,
        error: `Quan una esquerda apareix a les primeres jugades, el general savi no corre cap al soroll: reforça el terreny, recupera la iniciativa i corregeix sense mostrar la jugada decisiva abans d’hora.`,
        detected: `La línia ${openingName ? openingName + ' ' : ''}ja ha dibuixat el camp: domina el centre, mantén pressió invisible i prepara l’atac indirecte que transforma l’obertura en avantatge de mig joc.`,
        opening: `En l’obertura, el centre és el terreny alt: ocupa’l amb ritme, amaga la intenció i adapta el pla quan el rival canvia la forma de la batalla.`,
        position: `Si la teoria s’esvaeix, conserva els principis: peces actives, rei segur, centre vigilat i iniciativa prou forta perquè l’enemic respongui als teus plans.`,
        general: `La victòria es prepara abans del combat: coneix el terreny, ordena les forces, no revelis el pla i entra al mig joc amb iniciativa.`
    };
    return { voice, title: info.title || 'Màxima d’obertura', text: lines[info.theme] || lines.general, openingName };
}

function renderOpeningMaximHtml(text, title = 'Màxima d’obertura', meta = '') {
    const voice = getOpeningStrategicVoice();
    const safeText = escapeHtml(text || '');
    const safeTitle = escapeHtml(title || 'Màxima d’obertura');
    const safeMeta = meta ? `<div style="font-weight:600; color:#c9a227; margin-bottom:8px; font-size:0.9em;">${escapeHtml(meta)}</div>` : '';
    return `<div class="opening-maxim-box">
        <div class="maxim-title">${safeTitle}</div>
        <div class="maxim-voice">${escapeHtml(voice.name)} · ${escapeHtml(voice.work)}</div>
        ${safeMeta}
        <div class="maxim-text">"${safeText}"</div>
    </div>`;
}

function showOfflineOpeningMaxim() {
    const info = classifyOpeningPositionForMaxim();
    const offline = buildOfflineOpeningMaxim(info);
    const meta = offline.openingName ? `Base teòrica detectada: ${offline.openingName}` : '';
    const html = renderOpeningMaximHtml(offline.text, offline.title, meta);
    lastOpeningMaxim = html;
    const noteEl = document.getElementById('opening-practice-note');
    if (noteEl) noteEl.innerHTML = html;
}

async function requestOpeningMaximLlull() {
    if (!openingPracticeGame) return;
    if (hieroglyphicExerciseActive) {
        updateOpeningMaximButton();
        return;
    }
    if (!openaiApiKey) {
        showOfflineOpeningMaxim();
        return;
    }
    if (openingMaximPending) return;

    openingMaximPending = true;
    const contextToken = getOpeningMaximContextToken();
    updateOpeningMaximButton();
    const noteEl = document.getElementById('opening-practice-note');

    const info = classifyOpeningPositionForMaxim();
    const isStart = openingCurrentSequence.length === 0 && !openingLessonActive && !openingErrorPracticeActive;

    if (noteEl) {
        noteEl.innerHTML = '<div style="padding:8px; background:rgba(100,100,255,0.15); border-radius:8px;">Sun Tzu medita sobre el terreny...</div>';
    }

    let prompt;
    let continuationsData = null;
    if (openingLessonActive) {
        const voice = getOpeningStrategicVoice();
        prompt = `Ets ${voice.name} escrivint en l'estil de ${voice.work}.

LLIÇÓ ACTUAL: ${openingLessonInfo ? `${openingLessonInfo.name} (${openingLessonInfo.eco})` : 'obertura'}
IDEA: ${openingLessonInfo?.idea || 'preparació, centre i iniciativa'}
SEQÜÈNCIA: ${(openingLessonLine || []).join(' ')}
PROGRÉS: ${openingLessonStep}/${openingLessonLine.length}

Escriu una màxima breu en català per ajudar l'alumne a entendre la lliçó actual. Parla de preparació abans de la batalla, terreny central, ritme, iniciativa i conversió al mig joc. No revelis la jugada concreta. 2 o 3 frases, sense emojis, sense cometes embolcallant tot el text.`;
    } else if (openingErrorPracticeActive) {
        const voice = getOpeningStrategicVoice();
        prompt = `Ets ${voice.name} escrivint en l'estil de ${voice.work}.

MODE: correcció d'un error d'obertura en les primeres 10 jugades.
FEN: ${openingPracticeGame.fen()}
MOVIMENT: ${openingErrorMoveFilter || '—'} (${openingErrorColorFilter === 'w' ? 'blanques' : openingErrorColorFilter === 'b' ? 'negres' : '—'})

Escriu una màxima breu en català sobre corregir l'errada sense revelar la jugada exacta, ni caselles, ni notació. Ha de parlar de recuperar el centre, no precipitar l'atac, conservar iniciativa i adaptar-se al rival. 2 o 3 frases, sense emojis.`;
    } else if (isStart) {
        prompt = buildOpeningEncouragementPrompt();
    } else {
        continuationsData = getOpeningContinuations(openingCurrentSequence);
        prompt = buildOpeningAlternativesPrompt(openingCurrentSequence, continuationsData.continuations, openingSelectedOpening);
    }

    try {
        const result = await callOpenAI(prompt, {
            generationConfig: {
                maxOutputTokens: isStart ? 700 : 1800
            }
        });
        if (!result.ok) throw new Error(result.errorMessage || `OpenAI error ${result.status}`);
        if (!isOpeningMaximContextCurrent(contextToken)) return;

        let cleanText = result.text
            .replace(/^\d+\.\s*/gm, '')
            .replace(/^[-•]\s*/gm, '')
            .replace(/\*\*/g, '')
            .replace(/^["«]|["»]$/g, '')
            .trim();
        if (cleanText && !/[.!?]$/.test(cleanText)) cleanText += '.';

        let meta = '';
        if (!isStart && openingSelectedOpening) {
            meta = `[${openingSelectedOpening.eco || '??'}] ${openingSelectedOpening.name}`;
        } else if (info.opening?.name || info.detected?.name) {
            meta = `Base teòrica detectada: ${info.opening?.name || info.detected?.name}`;
        }
        if (continuationsData && Object.keys(continuationsData.continuations).length > 0) {
            meta += `${meta ? ' · ' : ''}${Object.keys(continuationsData.continuations).length} continuacions possibles`;
        }

        const html = renderOpeningMaximHtml(cleanText, info.title || 'Màxima d’obertura', meta);
        lastOpeningMaxim = html;
        if (noteEl) noteEl.innerHTML = html;
    } catch (err) {
        console.error('[OpenAI Opening]', err?.message || err);
        if (isOpeningMaximContextCurrent(contextToken) && noteEl) {
            const msg = getOpenAIStatusLabel({ ok: false, status: 0, errorMessage: err?.message || '' });
            noteEl.innerHTML = `<div style="padding:10px; background:rgba(255,100,100,0.2); border-radius:8px;">${escapeHtml(msg)}. Es fa servir una màxima local.</div>`;
            showOfflineOpeningMaxim();
        }
    } finally {
        if (contextToken.id === openingMaximRequestCounter) openingMaximPending = false;
        updateOpeningMaximButton();
    }
}

function showOfflineBundleMaxim() {
    const theme = classifyPositionTheme(currentBundleFen || '', '');
    const m1 = pickOfflineMaxim(theme);
    const m2 = pickOfflineMaxim('general');
    let html = '<div style="padding:12px; background:rgba(100,150,255,0.12); border-left:3px solid #6495ed; border-radius:8px; line-height:1.6;">';
    html += '<div style="font-weight:600; color:var(--accent-gold); margin-bottom:6px;">💡 Principis d\'escacs:</div>';
    html += `<div style="font-style:italic; margin:4px 0;">${m1}</div>`;
    if (m2 !== m1) html += `<div style="font-style:italic; margin:4px 0;">${m2}</div>`;
    html += '</div>';
    lastBundleOpenAIHint = html;
    $('#status').html(html);
}

async function requestOpenAIBundleHint() {
    if (!blunderMode || !currentBundleFen) return;
    if (!openaiApiKey) {
        // Sense clau: banc de màximes local en comptes d'un avís d'error.
        showOfflineBundleMaxim();
        return;
    }
    if (bundleOpenAIHintPending) return;

    // Cau per FEN: reaprofita la màxima si ja s'ha generat per aquesta posició.
    const cacheKey = `bundle:${currentBundleFen}:${bundleSequenceStep}`;
    const cached = getCachedOpenAI(cacheKey);
    if (cached) { lastBundleOpenAIHint = cached; $('#status').html(cached); return; }
    
    bundleOpenAIHintPending = true;
    updateBundleHintButtons();
    
    const statusEl = $('#status');
    statusEl.html('<div style="padding:8px; background:rgba(100,100,255,0.15); border-radius:8px;">🧠 Generant màxima d\'escacs...</div>');
    
    let prompt;
    if (bundleFixedSequence) {
        prompt = buildBundleOpenAIPromptWithFixedSequence(bundleSequenceStep);
    } else {
        const errorContext = {};
        let currentError = savedErrors.find(e => e.fen === currentBundleFen);

        if (!currentError) {
            for (const entry of gameHistory) {
                if (entry.severeErrors && Array.isArray(entry.severeErrors)) {
                    currentError = entry.severeErrors.find(e => e.fen === currentBundleFen);
                    if (currentError) break;
                }
            }
        }

        if (currentError) {
            errorContext.fen = currentError.fen;
            errorContext.bestMove = currentError.bestMove;
            errorContext.playerMove = currentError.playerMove;
            errorContext.severity = currentError.severity;
            errorContext.bestMovePv = currentError.bestMovePv || [];
        } else {
            errorContext.fen = currentBundleFen;
        }

        const step = bundleSequenceStep === 2 ? 2 : 1;
        prompt = buildOpenAIBundleHintPrompt(step, errorContext);
    }
    
    if (!prompt) {
        bundleOpenAIHintPending = false;
        updateBundleHintButtons();
        return;
    }
    
    try {
        const result = await callOpenAI(prompt, { generationConfig: { maxOutputTokens: 2000 } });
        if (!result.ok || !result.text) throw new Error(result.errorMessage || `OpenAI error ${result.status}`);
        const text = result.text;
        
        const lines = text.split('\n').filter(l => l.trim());
        const validLines = lines.filter(line => {
            const words = line.trim().split(/\s+/).length;
            return words >= 5;
        });
        
        if (validLines.length === 0) {
            throw new Error('Respostes massa curtes');
        }
              
        const trimmedLines = validLines.map(l => l.trim());
        
        let html = '<div style="padding:12px; background:rgba(100,150,255,0.12); border-left:3px solid #6495ed; border-radius:8px; line-height:1.6;">';
        html += '<div style="font-weight:600; color:var(--accent-gold); margin-bottom:6px;">💡 Principis d\'escacs:</div>';
        trimmedLines.forEach(line => {
            html += `<div style="font-style:italic; margin:4px 0;">${line.trim()}</div>`;
        });
        html += '</div>';
        
        // CANVI: Guardar el missatge generat
        lastBundleOpenAIHint = html;
        setCachedOpenAI(`bundle:${currentBundleFen}:${bundleSequenceStep}`, html);
        statusEl.html(html);

    } catch (err) {
        console.error(err);
        statusEl.html('<div style="padding:10px; background:rgba(255,100,100,0.2); border-radius:8px;">❌ No s\'ha pogut generar la màxima. Torna-ho a provar.</div>');
    } finally {
        bundleOpenAIHintPending = false;
        updateBundleHintButtons();
    }
}

function buildAssistedHintPrompt(fen, bestMove, evaluation) {
    const voice = getStrategicVoice();
    const evalInfo = typeof evaluation === 'number' ? `Avaluació actual: ${evaluation > 0 ? '+' : ''}${evaluation} centipeons.` : '';
    return `Ets ${voice.name}, mestre estratega, i guies un alumne durant una partida d'escacs.

POSICIÓ ACTUAL (FEN): ${fen}
MILLOR JUGADA SEGONS EL MOTOR: ${bestMove}
${evalInfo}

TASCA: Escriu UNA màxima xifrada en català, estil "${voice.work}", que orienti l'alumne cap a la idea correcta SENSE dir la jugada directament.

INSTRUCCIONS:
- Usa al·lusions estratègiques: "el camí del centre", "la diagonal oculta", "el flanc desprotegit", "la torre que domina la columna", "el cavall que salta a la fortalesa", "la dama que travessa el camp"
- La màxima ha de ser específica a aquesta posició, no genèrica
- Ha de contenir prou informació per orientar un jugador atent, però no revelar la jugada
- To ${voice.style}
- Acaba amb un punt final

REGLES:
- Una sola frase, entre 30 i 150 caràcters
- Sense emojis, sense cometes, sense numeració
- En català
- NO mencionar la notació de la jugada (${bestMove})

Escriu la màxima:`;
}

let assistedHintPending = false;

function showAssistedMaxim(text) {
    const cleanText = text.replace(/\*\*/g, '').replace(/^[-•]\s*/gm, '').replace(/["«»]/g, '').trim();
    let html = '<div class="opening-maxim-box">';
    html += '<div class="maxim-title">Consell estratègic</div>';
    html += `<div class="maxim-text">${cleanText}</div>`;
    html += '</div>';
    $('#status').html(html);
}

async function requestAssistedHint() {
    if (!game || game.game_over()) return;
    if (currentGameMode !== 'assisted') return;
    if (assistedHintPending) return;

    assistedHintPending = true;
    $('#btn-assisted-hint').prop('disabled', true);
    $('#status').html('<div style="padding:8px; background:rgba(100,100,255,0.15); border-radius:8px;">Consultant el mestre estratega...</div>');

    try {
        const fen = game.fen();
        const bestMove = await getStockfishBestMove(fen, 12);

        // Sense clau OpenAI: màxima local rica (subtema + generador jeroglífic).
        if (!openaiApiKey) {
            showAssistedMaxim(buildLocalAssistedMaxim(fen, bestMove));
            return;
        }

        // Cau per FEN: evita repetir crides per la mateixa posició.
        const cacheKey = `assisted:${fen}`;
        const cached = getCachedOpenAI(cacheKey);
        if (cached) { showAssistedMaxim(cached); return; }

        if (!bestMove) throw new Error('No s\'ha pogut obtenir la millor jugada');
        const prompt = buildAssistedHintPrompt(fen, bestMove, null);
        const result = await callOpenAI(prompt, { generationConfig: { maxOutputTokens: 500 } });
        if (!result.ok || !result.text) throw new Error(result.errorMessage || `OpenAI error ${result.status}`);
        const text = result.text;

        const cleanText = text.replace(/\*\*/g, '').replace(/^[-•]\s*/gm, '').replace(/["«»]/g, '').trim();
        setCachedOpenAI(cacheKey, cleanText);
        showAssistedMaxim(cleanText);
    } catch (err) {
        console.error('[AssistedHint]', err);
        // Fallback offline davant qualsevol error de xarxa/API
        showAssistedMaxim(buildLocalAssistedMaxim(game.fen(), null));
    } finally {
        assistedHintPending = false;
        $('#btn-assisted-hint').prop('disabled', false);
    }
}

function getStockfishBestMove(fen, depth) {
    return new Promise((resolve) => {
        if (!stockfish && !ensureStockfish()) { resolve(null); return; }
        const prevRequestor = stockfishRequestor;
        stockfishRequestor = 'assisted-hint';
        const handler = function(event) {
            const msg = typeof event === 'string' ? event : event.data;
            if (typeof msg !== 'string') return;
            if (msg.indexOf('bestmove') === 0 && stockfishRequestor === 'assisted-hint') {
                stockfish.removeEventListener('message', handler);
                stockfishRequestor = prevRequestor;
                const m = msg.match(/bestmove\s([a-h][1-8])([a-h][1-8])([qrbn])?/);
                resolve(m ? m[1] + m[2] + (m[3] || '') : null);
            }
        };
        stockfish.addEventListener('message', handler);
        try {
            stockfish.postMessage('setoption name MultiPV value 1');
            stockfish.postMessage(`position fen ${fen}`);
            stockfish.postMessage(`go depth ${depth}`);
        } catch (e) { resolve(null); }
        setTimeout(() => { resolve(null); }, 10000);
    });
}

// Analitza la posició actual i retorna { scoreCp, mate, bestMove } des de la perspectiva del color a moure
function analyzePositionForUser(fen, depth = 14) {
    return new Promise((resolve) => {
        if (!stockfish && !ensureStockfish()) { resolve(null); return; }
        const prevRequestor = stockfishRequestor;
        stockfishRequestor = 'user-analysis';
        let lastScoreCp = null, lastMate = null;
        let resolved = false;
        const finish = (val) => {
            if (resolved) return; resolved = true;
            stockfish.removeEventListener('message', handler);
            stockfishRequestor = prevRequestor;
            resolve(val);
        };
        const handler = function(event) {
            const msg = typeof event === 'string' ? event : event.data;
            if (typeof msg !== 'string' || stockfishRequestor !== 'user-analysis') return;
            if (msg.indexOf('info') === 0) {
                const cpM = msg.match(/score cp (-?\d+)/);
                const mateM = msg.match(/score mate (-?\d+)/);
                if (cpM) { lastScoreCp = parseInt(cpM[1], 10); lastMate = null; }
                else if (mateM) { lastMate = parseInt(mateM[1], 10); lastScoreCp = null; }
            } else if (msg.indexOf('bestmove') === 0) {
                const m = msg.match(/bestmove\s([a-h][1-8])([a-h][1-8])([qrbn])?/);
                finish({ scoreCp: lastScoreCp, mate: lastMate, bestMove: m ? m[1] + m[2] + (m[3] || '') : null });
            }
        };
        stockfish.addEventListener('message', handler);
        try {
            stockfish.postMessage('setoption name MultiPV value 1');
            stockfish.postMessage(`position fen ${fen}`);
            stockfish.postMessage(`go depth ${depth}`);
        } catch (e) { finish(null); }
        setTimeout(() => finish(null), 12000);
    });
}

let userAnalysisPending = false;
async function requestPositionAnalysis() {
    if (!game || game.game_over() || userAnalysisPending) return;
    if (isEngineThinking) { showToast('Espera que el rival faci la seva jugada', 'info'); return; }
    userAnalysisPending = true;
    const btn = $('#btn-analyze');
    btn.prop('disabled', true);
    const prevStatus = $('#status').html();
    $('#status').html('<div style="padding:8px; background:rgba(96,125,139,0.18); border-radius:8px;">Analitzant la posició…</div>');
    try {
        const turn = game.turn();
        const res = await analyzePositionForUser(game.fen(), 14);
        if (!res) { $('#status').html(prevStatus); showToast('No s\'ha pogut analitzar ara mateix', 'warn'); return; }
        // Converteix a la perspectiva del jugador
        let evalText;
        if (res.mate != null) {
            const mateForPlayer = (turn === playerColor) ? res.mate : -res.mate;
            evalText = mateForPlayer > 0 ? `Mat en ${Math.abs(mateForPlayer)} a favor teu` : `Mat en ${Math.abs(mateForPlayer)} en contra`;
        } else if (res.scoreCp != null) {
            const cpForPlayer = (turn === playerColor) ? res.scoreCp : -res.scoreCp;
            const pawns = (cpForPlayer / 100).toFixed(1);
            const sign = cpForPlayer > 0 ? '+' : '';
            const who = cpForPlayer > 50 ? ' (avantatge teu)' : (cpForPlayer < -50 ? ' (avantatge del rival)' : ' (igualada)');
            evalText = `Avaluació: ${sign}${pawns}${who}`;
        } else {
            evalText = 'Avaluació no disponible';
        }
        let bestText = '';
        if (res.bestMove && turn === playerColor) {
            // Tradueix l'UCI a SAN sense alterar la partida
            try {
                const tmp = new Chess(game.fen());
                const mv = tmp.move({ from: res.bestMove.slice(0,2), to: res.bestMove.slice(2,4), promotion: res.bestMove[4] || 'q' });
                if (mv) bestText = ` · La màquina recomana <strong>${mv.san}</strong>`;
            } catch (e) {}
        }
        $('#status').html(`<div style="padding:8px; background:rgba(96,125,139,0.18); border-radius:8px;">🔬 ${evalText}${bestText}</div>`);
    } catch (e) {
        $('#status').html(prevStatus);
        showToast('Error analitzant la posició', 'warn');
    } finally {
        userAnalysisPending = false;
        btn.prop('disabled', false);
    }
}

function buildOpenAIReviewPrompt(entry, severeErrors) {
    const summary = entry.counts || {};
    const moves = getHistoryMoves(entry);
    
    const errorsDetail = severeErrors.map((err, idx) => {
        const moveNum = err.moveNumber || '?';
        const played = err.playerMoveSan || err.playerMove || '?';
        const best = err.bestMoveSan || err.bestMove || '?';
        const swing = err.swing || 0;
        const pvLine = (err.bestMovePvSan || err.bestMovePv || []).slice(0, 4).join(' ');
        
        return `Errada ${idx + 1}:
  - Número de jugada: ${moveNum}
  - Jugada feta: ${played}
  - Millor jugada: ${best}
  - Pèrdua: ${swing} centipeons
  - Continuació correcta: ${pvLine || '—'}`;
    }).join('\n\n');

    const totalMoves = moves.length;
    
    const voice = getStrategicVoice();
    return `Ets un mestre d'escacs que ensenya amb l'esperit de "${voice.work}" de ${voice.name}: to ${voice.style}.

DADES DE LA PARTIDA
- Resultat: ${entry.result || '—'}
- Precisió: ${typeof entry.precision === 'number' ? `${entry.precision}%` : '—'}
- Total jugades: ${totalMoves}
- Jugades bones: ${(summary.excel || 0) + (summary.good || 0)}
- Imprecisions: ${summary.inaccuracy || 0}
- Errades greus: ${(summary.mistake || 0) + (summary.blunder || 0)}

ERRADES CONCRETES A ANALITZAR
${errorsDetail || 'Cap errada greu detectada.'}

FORMAT OBLIGATORI PER REFERENCIAR JUGADES
Quan mencionis una jugada específica, SEMPRE utilitza exactament aquest format:
"jugada X (SAN)" - on X és el número i SAN la notació algebraica.
Exemples correctes:
- "A la jugada 12 (Nxe5), vas perdre material..."
- "L'errada a la jugada 8 (Qd3) va ser decisiva..."
- "Calia jugar diferent a la jugada 15 (Bxf7+)..."

INSTRUCCIONS
1. Comença amb un TÍTOL: una màxima memorable entre cometes dobles
2. Paràgraf d'anàlisi general del rendiment (sense felicitacions excessives)
3. Per CADA error, explica:
   - Què va passar a la jugada X (SAN) - descriu l'acció mecànica
   - Per què era un error
   - Quina era la idea correcta
   - Una màxima universal entre cometes
4. Paràgraf de conclusió amb el principi clau per millorar

REGLES
- Màxim 400 paraules
- Prosa natural en paràgrafs (sense llistes ni numeracions)
- Descriu cada jugada identificant la peça i l'acció (ex: "en capturar el cavall amb l'alfil")
- Les màximes sempre entre cometes dobles
- To objectiu i professional

EXEMPLES DE MÀXIMES
"Desenvolupa les peces abans d'atacar"
"El rei al centre és un rei en perill"
"Abans de moure, mira què ataca el rival"
"Les peces han de treballar juntes"`;
}

async function requestOpenAIReview(entry, severeErrors) {
    if (!entry || !openaiApiKey) return;
    const existingReview = entry.aiReview || entry.deepseekReview;
    if (existingReview && existingReview.status === 'pending') return;
    if (existingReview && existingReview.text) return;
    const resolvedErrors = Array.isArray(severeErrors) && severeErrors.length
        ? severeErrors
        : getEntrySevereErrors(entry);
    entry.aiReview = { status: 'pending', text: '' };
    saveStorage();
    updateHistoryReview(historyReplay && historyReplay.entry && historyReplay.entry.id === entry.id ? historyReplay.entry : entry);
    const prompt = buildOpenAIReviewPrompt(entry, resolvedErrors);
    try {
        const result = await callOpenAI(prompt, { generationConfig: { maxOutputTokens: 4096 } });
        if (!result.ok || !result.text) throw new Error(result.errorMessage || `OpenAI error ${result.status}`);
        entry.aiReview = { status: 'done', text: result.text };
    } catch (error) {
        entry.aiReview = {
            status: 'error',
            message: 'No s’ha pogut generar la revisió amb OpenAI.'
        };
    }
    saveStorage();
    if (historyReplay && historyReplay.entry && historyReplay.entry.id === entry.id) {
        updateHistoryReview(historyReplay.entry);
    }
}

function historyStepForward() {
    if (!historyReplay || !historyReplay.entry || historyReplay.moveIndex >= historyReplay.moves.length) return;
    const move = historyReplay.moves[historyReplay.moveIndex];
    historyReplay.game.move(move, { sloppy: true });
    historyReplay.moveIndex++;
    updateHistoryBoard();
}

function historyStepBack() {
    if (!historyReplay || !historyReplay.entry || historyReplay.moveIndex <= 0) return;
    historyReplay.game.undo();
    historyReplay.moveIndex--;
    updateHistoryBoard();
}

function startHistoryPlayback() {
    if (!historyReplay || !historyReplay.entry || historyReplay.moves.length === 0 || historyReplay.isPlaying) return;
    historyReplay.isPlaying = true;
    updateHistoryControls();
    historyReplay.timer = setInterval(() => {
        if (historyReplay.moveIndex >= historyReplay.moves.length) {
            stopHistoryPlayback();
            return;
        }
        historyStepForward();
    }, 900);
}

function stopTvPlayback() {
    if (tvReplay && tvReplay.timer) {
        clearInterval(tvReplay.timer);
        tvReplay.timer = null;
    }
    if (tvReplay) tvReplay.isPlaying = false;
    updateTvControls();
}

function updateTvControls() {
    const playBtn = $('#tv-play');
    const pauseBtn = $('#tv-pause');
    const prevBtn = $('#tv-prev');
    const nextBtn = $('#tv-next');
    const hintBtn = $('#tv-hint');
    const hasEntry = tvReplay && tvReplay.moves;
    const movesCount = hasEntry ? tvReplay.moves.length : 0;
    const atStart = !hasEntry || tvReplay.moveIndex === 0;
    const atEnd = !hasEntry || tvReplay.moveIndex >= movesCount;

    const lockedByPuzzle = tvJeroglyphicsActive || tvJeroglyphicsAnalyzing || tvJeroglyphicsIncorrect;

    playBtn.prop('disabled', !hasEntry || movesCount === 0 || tvReplay.isPlaying || atEnd || lockedByPuzzle);
    pauseBtn.prop('disabled', !hasEntry || !tvReplay.isPlaying || lockedByPuzzle);
    prevBtn.prop('disabled', !hasEntry || atStart || tvReplay.isPlaying || lockedByPuzzle);
    nextBtn.prop('disabled', !hasEntry || atEnd || tvReplay.isPlaying || lockedByPuzzle);
     hintBtn.prop('disabled', !tvJeroglyphicsActive || tvJeroglyphicsSolved);
    updateTvBoardInteractivity();  
    updateTvEndActions();
}

function updateTvProgress() {
    const progress = $('#tv-progress');
    if (!tvReplay || !tvReplay.moves) {
        progress.text('0/0');
        return;
    }
    progress.text(`${tvReplay.moveIndex}/${tvReplay.moves.length}`);
}

function updateTvEndActions() {
    const actions = $('#tv-end-actions');
    if (!tvReplay || !tvReplay.moves || tvReplay.moves.length === 0) {
        actions.hide();
        return;
    }
    const atEnd = tvReplay.moveIndex >= tvReplay.moves.length;
    if (atEnd && !tvReplay.isPlaying) actions.show();
    else actions.hide();
}

function updateTvBoard() {
    if (!tvBoard || !tvReplay || !tvReplay.game) return;
    tvBoard.position(tvReplay.game.fen(), false);
    resizeTvBoardToViewport();
    clearTvHintHighlight();   
    updateTvProgress();
    updateTvControls();
    updateTvJeroglyphicsUI();
}

function initTvBoard() {
    if (tvBoard) return;
    const boardEl = document.getElementById('tv-board');
    if (!boardEl) return;
    tvBoard = Chessboard('tv-board', {
        draggable: true,
        position: 'start',
        onDragStart: tvOnDragStart,
        onDrop: tvOnDrop,
        onSnapEnd: tvOnSnapEnd,      
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });
    resizeTvBoardToViewport();
    updateTvBoardInteractivity();
}

function updateTvBoardInteractivity() {
    if (!tvBoard) return;
    const shouldUseTap = tvJeroglyphicsActive && deviceType === 'mobile' && controlMode === 'tap' && isTouchDevice();
    tvBoard.draggable = !shouldUseTap;
    if (shouldUseTap) {
        enableTvTapToMove();
    } else {
        disableTvTapToMove();
    }
}

function clearTvHintHighlight() {
    $('#tv-board .square-55d63').removeClass('highlight-hint');
}

function highlightTvHintSquare(square) {
    clearTvHintHighlight();
    if (!square) return;
    $(`#tv-board .square-55d63[data-square='${square}']`).addClass('highlight-hint');
}

function tvOnDragStart(source, piece) {
    if (!tvJeroglyphicsActive || tvJeroglyphicsAnalyzing || tvJeroglyphicsSolved || tvJeroglyphicsIncorrect) return false;
    if (!tvReplay || !tvReplay.game) return false;
    if ((tvReplay.game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (tvReplay.game.turn() === 'b' && piece.search(/^w/) !== -1)) return false;
}

function tvOnDrop(source, target) {
    if (!tvJeroglyphicsActive || tvJeroglyphicsSolved || !tvReplay || !tvReplay.game) return 'snapback';
    clearTvHintHighlight();
    const testGame = new Chess(tvReplay.game.fen());
    const move = testGame.move({ from: source, to: target, promotion: 'q' });
    if (!move) return 'snapback';
    const uciBase = move.from + move.to;
    const uci = uciBase + (move.promotion ? move.promotion : '');
    const accepted = tvJeroglyphicsTopMoves.filter(Boolean);
    const ok = accepted.length > 0 && accepted.some(candidate => (
        candidate === uci || candidate === uciBase || candidate.startsWith(uciBase)
    ));
    if (ok) {
        setTvStatus('Correcte! Pots continuar la partida.');
        tvJeroglyphicsSolved = true;
        tvJeroglyphicsIncorrect = false;
        tvJeroglyphicsAnalyzing = false;
        updateTvJeroglyphicsUI();
        updateTvControls()
    } else {
        setTvStatus('Incorrecte. Torna-ho a provar.');
        tvJeroglyphicsIncorrect = true;
        updateTvJeroglyphicsUI();
        updateTvControls();
    }
    return 'snapback';
}

function tvOnSnapEnd() {
    if (!tvBoard || !tvReplay || !tvReplay.game) return;
    tvBoard.position(tvReplay.game.fen(), false);
}

function setTvStatus(message, isError = false) {
    const status = $('#tv-status');
    status.text(message || '');
    status.css('color', isError ? 'var(--severity-high)' : 'var(--text-secondary)');
}

function getTvJeroglyphicsTurnLabel() {
    if (!tvReplay || !tvReplay.game) return '';
    return tvReplay.game.turn() === 'w' ? 'Juguen Blanques' : 'Juguen Negres';
}

function updateTvJeroglyphicsUI() {
    const turnEl = $('#tv-jeroglyphics-turn');
    const overlayEl = $('#tv-jeroglyphics-overlay');
    const correctEl = $('#tv-jeroglyphics-result-correct');
    const incorrectEl = $('#tv-jeroglyphics-result-incorrect');
    if (turnEl.length) {
        if (tvJeroglyphicsActive) {
            turnEl.text(getTvJeroglyphicsTurnLabel());
            turnEl.show();
        } else {
            turnEl.hide();
        }
    }
    if (overlayEl.length) {
        const showOverlay = tvJeroglyphicsActive && (tvJeroglyphicsSolved || tvJeroglyphicsIncorrect);
        overlayEl.toggle(showOverlay);
        correctEl.toggle(!!tvJeroglyphicsSolved);
        incorrectEl.toggle(!!tvJeroglyphicsIncorrect);
    }
}

function updateTvDetails(entry) {
    const resultEl = $('#tv-result');
    const metaEl = $('#tv-meta');
    const eloEl = $('#tv-elo');
    const whiteEl = $('#tv-white-player');
    const blackEl = $('#tv-black-player');
    if (!entry) {
        resultEl.text('—');
        metaEl.text('Sense dades.');
        eloEl.text('—');
        whiteEl.text('—');
        blackEl.text('—');
        return;
    }
    resultEl.text(`${entry.white} vs ${entry.black}`);
    metaEl.text(`${entry.event} · ${entry.date}`);
    eloEl.text(`${entry.whiteElo} vs ${entry.blackElo}`);
    whiteEl.text(entry.white || '—');
    blackEl.text(entry.black || '—');
}

function resetTvJeroglyphicsState() {
    tvJeroglyphicsActive = false;
    tvJeroglyphicsAnalyzing = false;
    tvJeroglyphicsHinting = false;
    tvJeroglyphicsTopMoves = [];
    tvJeroglyphicsPvMoves = {};
    tvJeroglyphicsTargetIndex = null;
    tvJeroglyphicsActualMove = null;
    tvJeroglyphicsResumePlayback = false;
    tvJeroglyphicsSolved = false;
    tvJeroglyphicsIncorrect = false;
    clearTvHintHighlight();
    updateTvJeroglyphicsUI();
}

async function fetchTvPgn(entry) {
    if (!entry) return '';
    if (entry.pgnUrl) {
        try {
            const response = await fetch(entry.pgnUrl, {
                headers: { 'Accept': 'application/x-chess-pgn' }
            });
            if (!response.ok) throw new Error('PGN fetch failed');
            const text = await response.text();
            const trimmed = text.trim();
            if (trimmed) return trimmed;
        } catch (err) {
            // Fall through to embedded PGN if available.
        }
    }
    return entry.pgnText ? entry.pgnText.trim() : '';
}

function shuffleArray(items) {
    const list = items.slice();
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

function formatTvDate(date = new Date()) {
    return date.toISOString().slice(0, 10).replace(/-/g, '.');
}

function normalizeTvPlayerName(player, fallback) {
    if (!player) return fallback;
    if (player.user) return player.user.name || player.user.id || fallback;
    return player.name || player.id || player.username || fallback;
}

function normalizeTvElo(player) {
    if (!player) return '—';
    return player.rating || player.elo || '—';
}

function extractTvGameFromPayload(payload) {
    if (!payload) return null;
    if (payload.gameId || payload.id) return payload;
    if (payload.featured) return payload.featured;
    if (payload.current) return payload.current;
    if (payload.game) return payload.game;
    if (payload.channels && typeof payload.channels === 'object') {
        const candidates = Object.values(payload.channels);
        for (const candidate of candidates) {
            if (!candidate) continue;
            if (candidate.gameId || candidate.id) return candidate;
            if (candidate.game) return candidate.game;
        }
    }
    return null;
}

let cachedTopPlayers = null;
let topPlayersCacheTime = 0;
const TOP_PLAYERS_CACHE_MS = 3600000;

async function getTopPlayers() {
    const now = Date.now();
    if (cachedTopPlayers && (now - topPlayersCacheTime) < TOP_PLAYERS_CACHE_MS) {
        return cachedTopPlayers;
    }

    const categories = ['classical', 'rapid', 'blitz'];
    const allUsers = new Set();

    for (const cat of categories) {
        try {
            const response = await fetch(`https://lichess.org/api/player/top/30/${cat}`);
            if (!response.ok) continue;
            const data = await response.json();
            const users = data.users || [];
            users.forEach(u => allUsers.add(u.username));
        } catch (err) {}
    }

    if (allUsers.size > 0) {
        cachedTopPlayers = Array.from(allUsers);
        topPlayersCacheTime = now;
    }

    return cachedTopPlayers || ['DrNykterstein', 'penguingim1', 'Fins0', 'lance5500', 'opperwezen'];
}

async function fetchMastersGame() {
    const fen = MASTERS_OPENINGS[Math.floor(Math.random() * MASTERS_OPENINGS.length)];

    try {
        const response = await fetch(
            `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fen)}&topGames=15`,
            { headers: { 'Accept': 'application/json' } }
        );
        if (!response.ok) return null;

        const data = await response.json();
        const topGames = data.topGames || [];
        if (!topGames.length) return null;

        const game = topGames[Math.floor(Math.random() * topGames.length)];
        if (!game.id) return null;

        const pgnResponse = await fetch(
            `https://lichess.org/game/export/${game.id}`,
            { headers: { 'Accept': 'application/x-chess-pgn' } }
        );
        if (!pgnResponse.ok) return null;

        const pgnText = await pgnResponse.text();
        if (!pgnText || pgnText.trim().length < 50) return null;

        return {
            id: `masters-${game.id}`,
            white: game.white?.name || 'Blanques',
            black: game.black?.name || 'Negres',
            whiteElo: game.white?.rating || '—',
            blackElo: game.black?.rating || '—',
            event: 'Masters Database',
            date: game.year ? `${game.year}` : '—',
            result: game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '1/2-1/2',
            pgnText: pgnText.trim()
        };
    } catch (err) {
        console.warn('fetchMastersGame error:', err);
        return null;
    }
}

async function fetchTopPlayerGame() {
    const topPlayers = await getTopPlayers();
    const user = topPlayers[Math.floor(Math.random() * topPlayers.length)];
    
    try {
        const response = await fetch(
            `https://lichess.org/api/games/user/${user}?max=50&finished=true&perfType=blitz,rapid,classical&clocks=false&evals=false`,
            {
                headers: { 'Accept': 'application/x-chess-pgn' },
                cache: 'no-store'
            }
        );
        if (!response.ok) return null;
        
        const allPgn = await response.text();
        if (!allPgn || allPgn.trim().length < 50) return null;
        
        const games = allPgn.split(/\n(?=\[Event )/).filter(g => g.trim().length > 100);
        if (!games.length) return null;
        
        const validGames = games.filter(pgn => {
            const result = pgn.match(/\[Result\s+"([^"]+)"\]/);
            if (!result || result[1] === '*') return false;
            const moves = pgn.split(/\d+\.\s/).length - 1;
            return moves >= 20;
        });

        if (!validGames.length) return null;
        const pgnText = validGames[Math.floor(Math.random() * validGames.length)];
        
        const getHeader = (name) => {
            const match = pgnText.match(new RegExp(`\\[${name}\\s+"([^"]+)"\\]`));
            return match ? match[1] : null;
        };
        
        const gameId = getHeader('Site')?.split('/').pop() || `lichess-${Date.now()}`;
        const result = getHeader('Result');
        
        if (!result || result === '*') return null;
        
        return {
            id: `lichess-${gameId}`,
            white: getHeader('White') || 'Blanques',
            black: getHeader('Black') || 'Negres',
            whiteElo: getHeader('WhiteElo') || '—',
            blackElo: getHeader('BlackElo') || '—',
            event: getHeader('Event') || 'Lichess',
            date: getHeader('UTCDate') || getHeader('Date') || formatTvDate(),
            result: result,
            pgnText: pgnText.trim()
        };

    } catch (err) {
        console.warn('fetchTopPlayerGame error:', err);
        return null;
    }
}

async function fetchLichessDbGameByElo(targetElo) {
    const fen = MASTERS_OPENINGS[Math.floor(Math.random() * MASTERS_OPENINGS.length)];
    const rating = mapEloToLichessRating(targetElo);
    const speed = TV_LICHESS_SPEEDS[Math.floor(Math.random() * TV_LICHESS_SPEEDS.length)];

    try {
        const response = await fetch(
            `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(fen)}&topGames=15&ratings=${rating}&speeds=${speed}`,
            { headers: { 'Accept': 'application/json' } }
        );
        if (!response.ok) return null;

        const data = await response.json();
        const topGames = data.topGames || [];
        if (!topGames.length) return null;

        const game = topGames[Math.floor(Math.random() * topGames.length)];
        if (!game.id) return null;

        const pgnResponse = await fetch(
            `https://lichess.org/game/export/${game.id}`,
            { headers: { 'Accept': 'application/x-chess-pgn' } }
        );
        if (!pgnResponse.ok) return null;

        const pgnText = await pgnResponse.text();
        if (!pgnText || pgnText.trim().length < 50) return null;

        const whiteName = game.white?.name || 'Blanques';
        const blackName = game.black?.name || 'Negres';

        return {
            id: `lichess-db-${game.id}`,
            white: whiteName,
            black: blackName,
            whiteElo: game.white?.rating || rating || '—',
            blackElo: game.black?.rating || rating || '—',
            event: `Lichess ${speed}`,
            date: game.year ? `${game.year}` : formatTvDate(),
            result: game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '1/2-1/2',
            pgnText: pgnText.trim()
        };
    } catch (err) {
        console.warn('fetchLichessDbGameByElo error:', err);
        return null;
    }
}

async function loadTvGame(entry) {
    if (!entry) return;
    stopTvPlayback();
    resetTvJeroglyphicsState();      
    initTvBoard();  
    setTvStatus('Carregant partida...');
    const rawPgnText = await fetchTvPgn(entry);
    let pgnText = selectTvPgn(rawPgnText);
    let pgnGame = new Chess();
    let loaded = pgnGame.load_pgn(pgnText, { sloppy: true });
    if (!loaded && entry.pgnText) {
        const fallbackText = selectTvPgn(entry.pgnText);
        pgnGame = new Chess();
        loaded = pgnGame.load_pgn(fallbackText, { sloppy: true });
        if (loaded) pgnText = fallbackText;
    }
    if (!loaded) {
        tvReplay = null;
        updateTvDetails(null);
        updateTvProgress();
        updateTvControls();
        setTvStatus('No s’ha pogut carregar la partida.', true);
       return false;
    }
      const header = pgnGame.header ? pgnGame.header() : {};
    const result = header && header.Result ? header.Result : '*';
    const termination = header && header.Termination ? String(header.Termination).toLowerCase() : '';
    const normalizedPgn = pgnText.trim();
    const endMatch = normalizedPgn.match(/(1-0|0-1|1\/2-1\/2|\*)\s*$/);
    const endToken = endMatch ? endMatch[1] : null;
    const isOngoing = result === '*'
        || termination.includes('unterminated')
        || termination.includes('abandoned')
        || !endToken
        || endToken !== result;
    if (isOngoing) {
        tvReplay = null;
        updateTvDetails(null);
        updateTvProgress();
        updateTvControls();
        setTvStatus('Partida inacabada. Buscant-ne una de completa...', true);
        return false;
    }
    const moves = pgnGame.history();
    if (moves.length < MIN_TV_MOVES) {
        tvReplay = null;
        updateTvDetails(null);
        updateTvProgress();
        updateTvControls();
        setTvStatus('Partida massa curta per TV.', true);
        return false;
    }
    tvReplay = {
        data: entry,
        game: new Chess(),
        moves: moves,
        moveIndex: 0,
        timer: null,
        isPlaying: false
    };
    updateTvDetails(entry);
    updateTvBoard();
    setTvStatus(`Partida carregada · ${moves.length} jugades.`);
    return true;
}

function splitTvPgnBlocks(pgnText) {
    if (!pgnText) return [];
    const normalized = pgnText.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];
    const blocks = normalized.split(/\n(?=\[Event\s)/g);
    return blocks.map(block => block.trim()).filter(Boolean);
}

function selectTvPgn(pgnText) {
    if (!pgnText) return '';
    const blocks = splitTvPgnBlocks(pgnText);
    if (!blocks.length) return pgnText.trim();
    if (blocks.length === 1) return blocks[0];
    let best = blocks[0];
    let bestMoves = -1;
    blocks.forEach(block => {
        const game = new Chess();
        if (!game.load_pgn(block, { sloppy: true })) return;
        const count = game.history().length;
        if (count > bestMoves) {
            bestMoves = count;
            best = block;
        }
    });
    return best;
}

function pickRandomTvGame() {
    if (!TV_FALLBACK_POOL.length) return null;
    if (!tvReplay || !tvReplay.data) return TV_FALLBACK_POOL[randInt(0, TV_FALLBACK_POOL.length - 1)];
    const currentId = tvReplay.data.id;
    const options = TV_FALLBACK_POOL.filter(entry => entry.id !== currentId);
    if (!options.length) return TV_FALLBACK_POOL[0];
    return options[randInt(0, options.length - 1)];
}

async function loadRandomTvGame() {
    randomizeTvElo();
    const dynamicEntry = await fetchLichessDbGameByElo(tvSelectedElo);
    if (dynamicEntry) {
        lastTvDynamicId = dynamicEntry.id;
        const ok = await loadTvGame(dynamicEntry);
        if (ok) return;
    }
    const attempts = TV_FALLBACK_POOL.length || 1;
    for (let i = 0; i < attempts; i++) {
        const next = pickRandomTvGame();
        const ok = await loadTvGame(next);
        if (ok) return;
    }
}

function shouldTriggerTvJeroglyphics() {
    if (!tvJeroglyphicsEnabled || tvJeroglyphicsActive || tvJeroglyphicsAnalyzing) return false;
    if (!tvReplay || !tvReplay.moves) return false;
    const moveIndex = tvReplay.moveIndex || 0;
    if (moveIndex < TV_JEROGLYPHICS_START) return false;
    if ((moveIndex - TV_JEROGLYPHICS_START) % TV_JEROGLYPHICS_INTERVAL !== 0) return false;
    const remaining = tvReplay.moves.length - moveIndex;
    return remaining > TV_JEROGLYPHICS_END_BUFFER;
}

function startTvJeroglyphics(resumePlayback) {
    if (!tvReplay || !tvReplay.game) return;
    if (!stockfish && !ensureStockfish()) {
        setTvStatus('Motor Stockfish no disponible.', true);
        return;
    }
    tvJeroglyphicsActive = true;
    tvJeroglyphicsAnalyzing = true;
    tvJeroglyphicsHinting = false;
    tvJeroglyphicsTopMoves = [];
    tvJeroglyphicsPvMoves = {};
    tvJeroglyphicsTargetIndex = tvReplay.moveIndex;
    tvJeroglyphicsActualMove = tvReplay.moves[tvReplay.moveIndex] || null;
    tvJeroglyphicsResumePlayback = !!resumePlayback;
    tvJeroglyphicsSolved = false;
    tvJeroglyphicsIncorrect = false;
    clearTvHintHighlight();
    stopTvPlayback();
    setTvStatus('Jeroglífic: buscant la millor jugada...');
    updateTvControls();
    updateTvJeroglyphicsUI();
    
    try { stockfish.postMessage('setoption name MultiPV value 1'); } catch (e) {}
    stockfish.postMessage(`position fen ${tvReplay.game.fen()}`);
    stockfish.postMessage('go depth 12');
}

function finishTvJeroglyphics(options = {}) {
    const { advanceMove = true, resumePlayback = tvJeroglyphicsResumePlayback } = options;
    tvJeroglyphicsActive = false;
    tvJeroglyphicsAnalyzing = false;
    tvJeroglyphicsHinting = false;
    tvJeroglyphicsSolved = false;
    tvJeroglyphicsIncorrect = false;
    tvJeroglyphicsResumePlayback = false;
    clearTvHintHighlight();
    try { stockfish.postMessage('setoption name MultiPV value 1'); } catch (e) {}

    if (advanceMove && tvReplay && tvReplay.game) {
        const move = tvJeroglyphicsActualMove;
        tvJeroglyphicsActualMove = null;
        if (move) {
            try {
                tvReplay.game.move(move, { sloppy: true });
                tvReplay.moveIndex++;
                updateTvBoard();
            } catch (e) {}
        }
    } else {
        tvJeroglyphicsActualMove = null;
        updateTvControls();
        updateTvJeroglyphicsUI();
    }
    if (resumePlayback && tvReplay && !tvReplay.isPlaying) startTvPlayback();
}

function cancelTvJeroglyphics(message) {
    if (message) setTvStatus(message);
    tvJeroglyphicsResumePlayback = false;
    finishTvJeroglyphics();
}

function requestTvJeroglyphicsHint() {
    if (!tvJeroglyphicsActive || tvJeroglyphicsSolved || tvJeroglyphicsIncorrect || !tvReplay || !tvReplay.game) return;
    if (tvJeroglyphicsAnalyzing) {
        setTvStatus('Esperant la millor jugada...');
        return;
    }
    if (tvJeroglyphicsTopMoves.length > 0) {
        const toSquare = tvJeroglyphicsTopMoves[0].substring(2, 4);
        highlightTvHintSquare(toSquare);
        setTvStatus(`Pista: Alguna peça ha d'anar a ${toSquare}`);
        return;
    }
    if (!stockfish && !ensureStockfish()) {
        setTvStatus('Motor Stockfish no disponible.', true);
        return;
    }
    tvJeroglyphicsHinting = true;
    setTvStatus('Buscant pista...');
    stockfish.postMessage(`position fen ${tvReplay.game.fen()}`);
    stockfish.postMessage('go depth 15');
}

function tvStepForward() {
    if (!tvReplay || !tvReplay.moves || tvReplay.moveIndex >= tvReplay.moves.length) return;
    if (shouldTriggerTvJeroglyphics()) {
        startTvJeroglyphics(tvReplay.isPlaying);
        return;
    }   
    const move = tvReplay.moves[tvReplay.moveIndex];
    tvReplay.game.move(move, { sloppy: true });
    tvReplay.moveIndex++;
    updateTvBoard();
}

function tvStepBack() {
    if (!tvReplay || !tvReplay.moves || tvReplay.moveIndex <= 0) return;
    tvReplay.game.undo();
    tvReplay.moveIndex--;
    updateTvBoard();
}

function startTvPlayback() {
    if (!tvReplay || !tvReplay.moves || tvReplay.moves.length === 0 || tvReplay.isPlaying) return;
    tvReplay.isPlaying = true;
    updateTvControls();
    tvReplay.timer = setInterval(() => {
        if (tvReplay.moveIndex >= tvReplay.moves.length) {
            stopTvPlayback();
            return;
        }
        tvStepForward();
    }, 2000);
}

function resetTvReplay() {
    if (!tvReplay || !tvReplay.moves) return;
    stopTvPlayback();
    resetTvJeroglyphicsState();
    tvReplay.game = new Chess();
    tvReplay.moveIndex = 0;
    updateTvBoard();
}

let historyFilters = { result: 'all', mode: 'all', prec: 0 };

function historyEntryPasses(entry) {
    if (historyFilters.result !== 'all' && entryOutcome(entry) !== historyFilters.result) return false;
    if (historyFilters.mode !== 'all' && entry.mode !== historyFilters.mode) return false;
    if (historyFilters.prec > 0 && (typeof entry.precision !== 'number' || entry.precision < historyFilters.prec)) return false;
    return true;
}

function renderGameHistory() {
    const container = $('#history-list');
    if (!container.length) return;
    if (!gameHistory.length) {
        container.html('<div class="history-empty">Encara no hi ha partides guardades.</div>');
        historyReplay = null;
        updateHistoryDetails(null);
        return;
    }
    const filtered = gameHistory.filter(historyEntryPasses);
    if (!filtered.length) {
        container.html('<div class="history-empty">Cap partida coincideix amb els filtres.</div>');
        return;
    }
    const items = filtered
        .slice()
        .reverse()
        .map(entry => {
            const movesCount = getHistoryMoves(entry).length;
            const meta = `${entry.label || '—'} · ${formatHistoryMode(entry.mode)} · ${movesCount} jugades`;
            return `
                <div class="history-item" data-history-id="${entry.id}">
                    <div class="history-item-main">
                        <div class="history-item-title">${entry.result || '—'}</div>
                        <div class="history-item-meta">${meta}</div>
                    </div>
                           <div class="history-item-actions">
                        <button class="btn btn-secondary history-select" data-history-id="${entry.id}">▶️ Veure</button>
                        <button class="btn btn-primary history-review" data-history-id="${entry.id}">📈 Revisió</button>
                    </div>
                </div>
            `;
        })
        .join('');
    container.html(items);
    $('.history-select').off('click').on('click', function() {
        const id = $(this).data('history-id');
        const entry = gameHistory.find(item => item.id === id);
        loadHistoryEntry(entry);
        // En mòbil, centrar a la pantalla el tauler de la partida seleccionada
        if (deviceType === 'mobile') {
            const boardEl = document.getElementById('history-board');
            if (boardEl && boardEl.scrollIntoView) {
                setTimeout(() => boardEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
            }
        }
    });
        stopTvPlayback();
    $('.history-review').off('click').on('click', function() {
        const id = $(this).data('history-id');
        const entry = gameHistory.find(item => item.id === id);
        showHistoryReview(entry);
    });
    if (!historyReplay || !historyReplay.entry) {
        loadHistoryEntry(gameHistory[gameHistory.length - 1]);
    }
}

function showHistoryReview(entry) {
    if (!entry) return;
    currentGameErrors = Array.isArray(entry.errors)
        ? entry.errors.map(err => ({
            fen: err.fen,
            severity: err.severity,
            bestMove: err.bestMove || null,
            playerMove: err.playerMove || null,
            bestMovePv: err.bestMovePv || []  // ← AFEGIR AQUEST CAMP
        }))
        : [];
    // Carreguem la partida al panell de detall (que SÍ que té tauler) i hi
    // desplacem la vista: així la ressenya rica (obertura, fases, moments clau)
    // i la visualització de jugades al tauler funcionen. El modal antic no tenia
    // tauler i no mostrava ni l'obertura ni permetia visualitzar les jugades.
    loadHistoryEntry(entry);
    const reviewEl = document.getElementById('history-review-content');
    if (reviewEl && reviewEl.scrollIntoView) {
        setTimeout(() => reviewEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
}

function recordGameHistory(resultLabel, finalPrecision, counts, options = {}) {
    if (blunderMode) return;
    const moves = game.history();
    const now = new Date();
    const entry = {
        id: `game_${now.getTime()}`,
        label: now.toLocaleDateString('ca-ES', { day: '2-digit', month: 'short' }) + ' ' + now.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' }),
        date: now.toISOString(),
        mode: currentGameMode,
        result: resultLabel,
        precision: finalPrecision,
        counts: counts,
        moves: moves,
        errors: currentGameErrors.map(err => ({
            fen: err.fen,
            severity: err.severity,
            bestMove: err.bestMove || null,
            playerMove: err.playerMove || null,
            bestMovePv: err.bestMovePv || []
        })),
        moveReviews: currentReview.map(review => ({
            moveNumber: review.moveNumber,
            quality: review.quality,
            color: review.color,
            swing: review.swing || 0,
            fen: review.fen || null,
            bestMove: review.bestMove || null,
            bestMoveSan: review.bestMoveSan || null,
            playerMove: review.playerMove || null,
            playerMoveSan: review.playerMoveSan || null,
            bestMovePv: review.bestMovePv || [],
            alternatives: review.alternatives || [],
            evalBefore: review.evalBefore ?? null,
            evalAfter: review.evalAfter ?? null
        })),
        review: [], // ← BUIDAT: ja no cal guardar review completa
        severeErrors: Array.isArray(options.severeErrors) ? options.severeErrors : [],
        aiReview: options.aiReview || options.deepseekReview || options.geminiReview || null,
        playerColor: playerColor,
        opponent: currentOpponent || null,
        fen: game.fen(),
        pgn: game.pgn(),
        roc: currentElo,
        level: aiDifficulty,
        accuracy: finalPrecision,
        mistakes: counts?.mistake || 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
    };
    gameHistory.push(entry);
    if (gameHistory.length > 10) gameHistory = gameHistory.slice(-10);
    // Bloc de neteja de reviews eliminat
}

function isOpeningMoveCorrect(quality) {
    return quality === 'excel' || quality === 'good';
}

// Converteix qualitat a precisió aproximada (0-100)
function qualityToPrecision(quality, swing) {
    // Si tenim swing, calcular precisió basada en centipawns perduts
    // Swing 0 = 100%, Swing 100 = ~50%, Swing 200+ = ~0%
    if (typeof swing === 'number' && swing > 0) {
        return Math.max(0, Math.round(100 - (swing / 2)));
    }
    // Fallback basat en qualitat
    switch (quality) {
        case 'excel': return 100;
        case 'good': return 85;
        case 'inaccuracy': return 60;
        case 'mistake': return 35;
        case 'blunder': return 10;
        default: return 50;
    }
}

function buildOpeningMoveStats() {
    const recentEntries = gameHistory
        .slice(-10)
        .filter(entry => Array.isArray(entry.moveReviews) && entry.moveReviews.length);
    const stats = [];
    const colors = [
        { key: 'w', label: 'Blanques' },
        { key: 'b', label: 'Negres' }
    ];

    colors.forEach(color => {
        for (let moveNumber = 1; moveNumber <= 10; moveNumber++) {
            let total = 0;
            let totalPrecision = 0;
            let countBelow75 = 0;
            const errorPositions = []; // Guardar posicions amb error

            recentEntries.forEach(entry => {
                const match = entry.moveReviews.find(review => (
                    review.moveNumber === moveNumber && review.color === color.key
                ));
                if (!match) return;

                total += 1;
                const precision = qualityToPrecision(match.quality, match.swing);
                totalPrecision += precision;

                // Si la precisió és inferior al 75%, guardar l'error
                if (precision < 75) {
                    countBelow75 += 1;
                    // Primer intentar obtenir del moveReview
                    if (match.fen && match.bestMove) {
                        errorPositions.push({
                            fen: match.fen,
                            bestMove: match.bestMove,
                            quality: match.quality
                        });
                    } else if (Array.isArray(entry.errors)) {
                        // Fallback: buscar en entry.errors pel número de moviment
                        for (const err of entry.errors) {
                            if (!err.fen || !err.bestMove) continue;
                            // Extreure moveNum i color del FEN
                            const fenParts = err.fen.split(' ');
                            if (fenParts.length < 6) continue;
                            const fenColor = fenParts[1]; // 'w' o 'b'
                            const fenMoveNum = parseInt(fenParts[5], 10);
                            // El FEN mostra qui ha de moure, que és qui va fer l'error
                            if (fenColor === color.key && fenMoveNum === moveNumber) {
                                errorPositions.push({
                                    fen: err.fen,
                                    bestMove: err.bestMove,
                                    quality: match.quality
                                });
                                break; // Només un error per partida/moviment
                            }
                        }
                    }
                }
            });

            const avgPrecision = total > 0 ? Math.round(totalPrecision / total) : null;

            stats.push({
                moveNumber,
                color: color.label,
                colorKey: color.key,
                total,
                avgPrecision,
                countBelow75,
                errorPositions
            });
        }
    });

    return { stats, totalEntries: recentEntries.length };
}

function setOpeningScreenMode(mode = 'overview') {
    document.body.classList.toggle('opening-mode-hieroglyphic', mode === 'hieroglyphic');
    const sections = {
        lessons: $('#opening-lessons-section'),
        practice: $('#opening-practice-section'),
        stats: $('#opening-stats-section'),
        hieroglyphic: $('#opening-hieroglyphic-section')
    };
    Object.values(sections).forEach($el => { if ($el && $el.length) $el.show(); });
    if (mode === 'lesson' || mode === 'practice') {
        sections.practice.show();
    } else if (mode === 'error-practice') {
        sections.lessons.hide();
        sections.stats.hide();
        sections.hieroglyphic.hide();
        sections.practice.show();
    } else if (mode === 'hieroglyphic') {
        sections.lessons.hide();
        sections.stats.hide();
        sections.practice.show();
        sections.hieroglyphic.show();
    }
    updateOpeningMaximButton();
}

// Variable global per guardar estadístiques d'obertura
let openingStatsData = [];

function collectAllOpeningErrorPositions() {
    const positions = [];
    openingStatsData.forEach(stat => {
        if (!Array.isArray(stat.errorPositions)) return;
        stat.errorPositions.forEach(position => {
            positions.push({
                ...position,
                colorKey: stat.colorKey,
                moveNumber: stat.moveNumber
            });
        });
    });
    return positions;
}

function renderOpeningStatsScreen(useExistingData = false) {
    const listEl = $('#opening-stats-list');
    const noteEl = $('#opening-stats-note');
    if (!listEl.length) return;

    let stats, totalEntries;
    if (useExistingData && openingStatsData && openingStatsData.length > 0) {
        // Usar dades existents (actualitzades després de pràctica)
        stats = openingStatsData;
        totalEntries = stats.reduce((max, s) => Math.max(max, s.total), 0);
    } else {
        // Reconstruir des de gameHistory
        const result = buildOpeningMoveStats();
        stats = result.stats;
        totalEntries = result.totalEntries;
        openingStatsData = stats;
    }

    // Separar per color
    const whiteStats = stats.filter(s => s.colorKey === 'w');
    const blackStats = stats.filter(s => s.colorKey === 'b');

    let html = `
        <div class="opening-stats-header" style="font-weight:600; margin-bottom:8px;">
            <span>Mov.</span>
            <span>Precisió</span>
            <span>Errors</span>
        </div>
        <div style="font-weight:600; color:var(--text-secondary); margin:10px 0 5px; font-size:0.85em;">♔ Blanques</div>
    `;

    whiteStats.forEach((item, idx) => {
        const precisionClass = item.avgPrecision !== null && item.avgPrecision < 75 ? 'color:var(--severity-med)' : '';
        const hasErrors = item.countBelow75 > 0;
        const errorDisplay = hasErrors
            ? `<span class="move-link" data-color="w" data-move="${item.moveNumber}">${item.countBelow75}</span>`
            : item.total > 0 ? '<span class="move-link-disabled">0</span>' : '—';
        html += `
            <div class="opening-stats-row">
                <div class="move-cell">${item.moveNumber}</div>
                <div style="${precisionClass}">${item.avgPrecision === null ? '—' : `${item.avgPrecision}%`}</div>
                <div>${errorDisplay}</div>
            </div>
        `;
    });

    html += `<div style="font-weight:600; color:var(--text-secondary); margin:15px 0 5px; font-size:0.85em;">♚ Negres</div>`;

    blackStats.forEach((item, idx) => {
        const precisionClass = item.avgPrecision !== null && item.avgPrecision < 75 ? 'color:var(--severity-med)' : '';
        const hasErrors = item.countBelow75 > 0;
        const errorDisplay = hasErrors
            ? `<span class="move-link" data-color="b" data-move="${item.moveNumber}">${item.countBelow75}</span>`
            : item.total > 0 ? '<span class="move-link-disabled">0</span>' : '—';
        html += `
            <div class="opening-stats-row">
                <div class="move-cell">${item.moveNumber}</div>
                <div style="${precisionClass}">${item.avgPrecision === null ? '—' : `${item.avgPrecision}%`}</div>
                <div>${errorDisplay}</div>
            </div>
        `;
    });

    listEl.html(html);

    // Afegir handlers de clic amb event delegation
    listEl.off('click', '.move-link').on('click', '.move-link', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const color = $(this).attr('data-color');
        const moveNum = parseInt($(this).attr('data-move'), 10);
        startOpeningErrorPractice(color, moveNum);
    });

    if (noteEl.length) {
        noteEl.text(totalEntries > 0 ? `Basat en les últimes ${totalEntries} partides.` : '—');
    }
}

// Inicia la pràctica d'un error d'obertura
function startOpeningErrorPractice(color, moveNum) {
    hideOpeningRestartOverlay();
    // Buscar les posicions d'error per aquest color i moviment
    const stat = openingStatsData.find(s => s.colorKey === color && s.moveNumber === moveNum);

    if (!stat || !stat.errorPositions || stat.errorPositions.length === 0) {
        showToast('No hi ha posicions disponibles. Juga noves partides per practicar errors.', 'warn');
        return;
    }

    openingErrorPracticeActive = true;
    openingErrorCurrentPositions = stat.errorPositions.map(position => ({
        ...position,
        colorKey: stat.colorKey,
        moveNumber: stat.moveNumber
    }));
    console.log('[StartPractice] Posicions inicials:', openingErrorCurrentPositions.length);
    openingErrorColorFilter = color;
    openingErrorMoveFilter = moveNum;
    openingErrorMovesRemaining = 2; // Dues jugades per resoldre

    // Seleccionar un error aleatori
    loadRandomOpeningError();
}

function loadRandomOpeningError() {
    if (openingErrorCurrentPositions.length === 0) {
        showOpeningErrorSuccessOverlay(true); // No en queden
        return;
    }

    // Seleccionar aleatori
    const idx = Math.floor(Math.random() * openingErrorCurrentPositions.length);
    const error = openingErrorCurrentPositions[idx];

    openingErrorCurrentIndex = idx; // Guardar índex per eliminar després
    openingErrorCurrentFen = error.fen;
    openingErrorBestMove = error.bestMove;
    openingPracticeBestMove = error.bestMove; // Per a la pista
    if (error.colorKey) {
        openingErrorColorFilter = error.colorKey;
    }
    if (error.moveNumber) {
        openingErrorMoveFilter = error.moveNumber;
    }
    openingErrorMovesRemaining = 2; // Reset a 2 jugades

    // Inicialitzar el tauler d'obertures amb la posició
    if (!openingBundleBoard) {
        initOpeningBundleBoard();
    }

    openingPracticeGame = new Chess(error.fen);
    openingPracticeMoveCount = 0;
    openingPracticeEngineThinking = false;
    openingPracticeGoodMoves = 0;
    openingPracticeTotalMoves = 0;

    // Determinar orientació segons el torn
    const turn = openingPracticeGame.turn();
    openingBundleBoard.orientation(turn === 'w' ? 'white' : 'black');
    openingBundleBoard.position(error.fen);

    setOpeningScreenMode('error-practice');

    // Forçar redimensionament del tauler per assegurar visualització
    setTimeout(() => {
        if (openingBundleBoard && typeof openingBundleBoard.resize === 'function') {
            openingBundleBoard.resize();
        }
    }, 100);

    // Scroll al tauler
    const boardEl = document.getElementById('opening-board');
    if (boardEl) {
        boardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Actualitzar nota
    const noteEl = document.getElementById('opening-practice-note');
    if (noteEl) {
        noteEl.innerHTML = `<div style="padding:8px; background:rgba(201,162,39,0.15); border-radius:8px;">Practica l'errada de la jugada ${openingErrorMoveFilter} (${openingErrorColorFilter === 'w' ? 'blanques' : 'negres'}) - 2 jugades</div>`;
    }

    updateOpeningPrecisionDisplay();
    clearOpeningMoveVisualFeedback();
}

function handleOpeningErrorSuccess() {
    openingErrorMovesRemaining -= 1;

    // Si queden jugades, fer que l'oponent respongui
    if (openingErrorMovesRemaining > 0) {
        // Demanar moviment de Stockfish per l'oponent
        requestOpeningErrorOpponentMove();
        return;
    }

    // Treure la posició resolta de la llista per índex
    console.log('[ErrorSuccess] Abans splice:', openingErrorCurrentPositions.length, 'index:', openingErrorCurrentIndex);
    if (openingErrorCurrentIndex >= 0 && openingErrorCurrentIndex < openingErrorCurrentPositions.length) {
        openingErrorCurrentPositions.splice(openingErrorCurrentIndex, 1);
    }
    console.log('[ErrorSuccess] Després splice:', openingErrorCurrentPositions.length);

    // Actualitzar també openingStatsData per reflectir l'error resolt
    if (openingErrorColorFilter && openingErrorMoveFilter) {
        const stat = openingStatsData.find(s =>
            s.colorKey === openingErrorColorFilter && s.moveNumber === openingErrorMoveFilter
        );
        if (stat && stat.errorPositions && stat.errorPositions.length > 0) {
            // Eliminar la posició resolta dels stats
            if (openingErrorCurrentFen) {
                stat.errorPositions = stat.errorPositions.filter(p => p.fen !== openingErrorCurrentFen);
            } else if (stat.errorPositions.length > 0) {
                stat.errorPositions.shift(); // Eliminar el primer si no tenim FEN
            }
            stat.countBelow75 = stat.errorPositions.length;
        }
    }

    openingErrorCurrentFen = null;
    openingErrorBestMove = null;
    openingErrorCurrentIndex = -1;

    showOpeningErrorSuccessOverlay(false);
}

// Recull tots els errors d'obertura disponibles de tots els moviments/colors
function getAllOpeningErrors() {
    const allErrors = [];
    if (!openingStatsData) return allErrors;

    for (const stat of openingStatsData) {
        if (stat.errorPositions && stat.errorPositions.length > 0) {
            for (const pos of stat.errorPositions) {
                allErrors.push({
                    ...pos,
                    colorKey: stat.colorKey,
                    moveNumber: stat.moveNumber
                });
            }
        }
    }
    return allErrors;
}

function requestOpeningErrorOpponentMove() {
    if (!openingPracticeGame || openingPracticeGame.game_over()) {
        // Si la partida ha acabat, completar
        openingErrorMovesRemaining = 0;
        handleOpeningErrorSuccess();
        return;
    }

    // Utilitzar Stockfish per obtenir el millor moviment de l'oponent
    if (!stockfish && !ensureStockfish()) {
        // Si no hi ha Stockfish, fer moviment aleatori
        const moves = openingPracticeGame.moves();
        if (moves.length > 0) {
            const randomMove = moves[Math.floor(Math.random() * moves.length)];
            openingPracticeGame.move(randomMove);
            openingBundleBoard.position(openingPracticeGame.fen());
            // Obtenir el nou millor moviment per l'usuari
            requestOpeningErrorBestMoveForUser();
        }
        return;
    }

    openingPracticeEngineThinking = true;
    stockfishRequestor = 'opening-error-opponent';
    try {
        stockfish.postMessage('stop');
        stockfish.postMessage('ucinewgame');
        stockfish.postMessage('position fen ' + openingPracticeGame.fen());
        stockfish.postMessage('go depth 10');
    } catch (e) {
        openingPracticeEngineThinking = false;
    }
}

function requestOpeningErrorBestMoveForUser() {
    if (!stockfish && !ensureStockfish()) {
        openingErrorBestMove = null;
        openingPracticeBestMove = null;
        return;
    }

    stockfishRequestor = 'opening-error-bestmove';
    try {
        stockfish.postMessage('stop');
        stockfish.postMessage('position fen ' + openingPracticeGame.fen());
        stockfish.postMessage('go depth 12');
    } catch (e) {}
}

function showOpeningErrorSuccessOverlay(noMore) {
    const overlay = $('#opening-error-success-overlay');
    if (!overlay.length) {
        exitOpeningErrorPractice();
        return;
    }
    overlay.find('.bundle-success-title').text('Error d\'obertura resolt');

    const remaining = collectAllOpeningErrorPositions().length;
    const allErrors = getAllOpeningErrors();
    const globalRemaining = allErrors.length;
    const showAgainBtn = remaining > 0 || globalRemaining > 0;
    console.log('[Overlay] remaining:', remaining, 'globalRemaining:', globalRemaining, 'noMore:', noMore, 'showBtn:', showAgainBtn);

    // Mostrar missatge adequat
    let message;
    if (globalRemaining === 0) {
        message = 'Has resolt totes les errades!';
    } else if (remaining > 0) {
        message = `${remaining} errada${remaining > 1 ? 'es' : ''} restant${remaining > 1 ? 's' : ''}`;
    } else {
        message = `${globalRemaining} errada${globalRemaining > 1 ? 'es' : ''} d'altres moviments`;
    }
    $('#opening-error-remaining').text(message);

    // Mostrar/amagar botó segons si queden errors
    const btnAgain = document.getElementById('btn-opening-error-again');
    console.log('[Overlay] btnAgain element:', btnAgain);
    if (btnAgain) {
        btnAgain.style.display = showAgainBtn ? 'inline-block' : 'none';
        console.log('[Overlay] btnAgain.style.display:', btnAgain.style.display);
    }

    overlay.css('display', 'flex');

    // Event handlers
    const btnHome = document.getElementById('btn-opening-error-home');
    if (btnHome) {
        btnHome.onclick = function() {
            overlay.hide();
            exitOpeningErrorPractice();
        };
    }

    if (btnAgain) {
        btnAgain.onclick = function() {
            overlay.hide();
            openingErrorCurrentPositions = collectAllOpeningErrorPositions();
            if (openingErrorCurrentPositions.length > 0) {
                // Encara queden del filtre actual
                setOpeningScreenMode('error-practice');
                openingErrorMovesRemaining = 2;
                loadRandomOpeningError();
            } else {
                // Canviar a errors globals
                const allErrors = getAllOpeningErrors();
                if (allErrors.length > 0) {
                    // Seleccionar un aleatori de tots
                    const idx = Math.floor(Math.random() * allErrors.length);
                    const error = allErrors[idx];
                    // Actualitzar filtres al nou error
                    openingErrorColorFilter = error.colorKey;
                    openingErrorMoveFilter = error.moveNumber;
                    // Carregar totes les posicions d'aquest nou filtre
                    const stat = openingStatsData.find(s =>
                        s.colorKey === error.colorKey && s.moveNumber === error.moveNumber
                    );
                    if (stat && stat.errorPositions) {
                        openingErrorCurrentPositions = [...stat.errorPositions];
                    }
                    setOpeningScreenMode('error-practice');
                    openingErrorMovesRemaining = 2;
                    loadRandomOpeningError();
                } else {
                    exitOpeningErrorPractice();
                }
            }
        };
    }
}

function exitOpeningErrorPractice() {
    openingErrorPracticeActive = false;
    openingErrorCurrentPositions = [];
    openingErrorCurrentFen = null;
    openingErrorBestMove = null;

    setOpeningScreenMode('overview');

    // Tornar a renderitzar estadístiques amb dades actualitzades
    renderOpeningStatsScreen(true);

    // Reset tauler
    startOpeningPracticeAsColor(openingPracticeUserColor);
}

/* ============ APRÈN UNA OBERTURA (lliçons guiades) ============ */
const CURATED_OPENINGS = [
    // === Obertures amb blanques ===
    { eco: 'E01', name: 'Obertura Catalana', userColor: 'w', cat: 'white', idea: 'Combina d4 i c4 amb el fianchetto de l’alfil de rei per pressionar el centre i el flanc de dama a llarg termini.', moves: ['d4','Nf6','c4','e6','g3','d5','Bg2','Be7','Nf3','O-O','O-O'], movePhrases: [
        '1.d4 ocupa el centre i prepara una partida posicional amb espai estable.',
        '...Nf6 desenvolupa una peça i pressiona e4 sense comprometre encara l’estructura negra.',
        '2.c4 posa tensió sobre d5 i anuncia l’esperit de gambit de dama.',
        '...e6 reforça d5 i obre la diagonal de l’alfil de f8.',
        '3.g3 és el segell català: prepara l’alfil llarg a g2.',
        '...d5 accepta la lluita central i fixa el punt que l’alfil català pressionarà.',
        '4.Bg2 col·loca l’alfil a la diagonal llarga i apunta cap al flanc de dama.',
        '...Be7 desenvolupa amb solidesa i prepara l’enroc curt.',
        '5.Nf3 reforça el centre i deixa el rei blanc a punt d’enrocar.',
        '...O-O posa el rei negre segur abans de decidir la tensió de c4 i d5.',
        '6.O-O completa el desenvolupament bàsic: el blanc ja pot augmentar la pressió catalana.'
    ] },
    { eco: 'C60', name: 'Obertura Espanyola (Ruy López)', userColor: 'w', cat: 'white', idea: 'Pressiona el cavall que defensa el centre i prepara l\'enroc.', moves: ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O','Be7'] },
    { eco: 'C21', name: 'Gambit de Rei', userColor: 'w', cat: 'white', idea: 'Sacrifica un peó per obrir la columna f i atacar ràpid el rei.', moves: ['e4','e5','f4','exf4','Nf3','g5','Bc4','Bg7'] },
    { eco: 'C25', name: 'Obertura de Viena', userColor: 'w', cat: 'white', idea: 'Prepara f4 amb suport del cavall; manté flexibilitat central.', moves: ['e4','e5','Nc3','Nf6','Bc4','Bc5','d3','d6'] },
    { eco: 'C44', name: 'Obertura Escocesa', userColor: 'w', cat: 'white', idea: 'Obre el centre immediatament amb d4 i guanya espai.', moves: ['e4','e5','Nf3','Nc6','d4','exd4','Nxd4','Bc5','Be3'] },
    { eco: 'D06', name: 'Gambit de Dama Refusat', userColor: 'w', cat: 'white', idea: 'Tensa el centre i desenvolupa amb harmonia.', moves: ['d4','d5','c4','e6','Nc3','Nf6','Bg5','Be7'] },
    { eco: 'D20', name: 'Gambit de Dama Acceptat', userColor: 'w', cat: 'white', idea: 'El blanc recupera el peó i guanya temps de desenvolupament.', moves: ['d4','d5','c4','dxc4','Nf3','Nf6','e3','e6','Bxc4','c5'] },
    { eco: 'D02', name: 'Sistema Londres', userColor: 'w', cat: 'white', idea: 'Estructura sòlida i fàcil: alfil a f4 abans d\'e3.', moves: ['d4','d5','Nf3','Nf6','Bf4','e6','e3','c5','c3'] },
    { eco: 'A20', name: 'Obertura Anglesa', userColor: 'w', cat: 'white', idea: 'Control del centre des dels flancs amb c4 i fianchetto.', moves: ['c4','e5','Nc3','Nf6','Nf3','Nc6','g3','d5'] },
    { eco: 'A04', name: 'Atac Reti', userColor: 'w', cat: 'white', idea: 'Hipermodern: controla el centre amb peces i fianchetto.', moves: ['Nf3','d5','g3','Nf6','Bg2','c6','O-O','Bg4','d3'] },
    { eco: 'B03', name: 'Atac dels Quatre Peons', userColor: 'w', cat: 'white', idea: 'Avança quatre peons al centre contra l\'Alekhine; aposta per l\'espai.', moves: ['e4','Nf6','e5','Nd5','d4','d6','c4','Nb6','f4'] },
    { eco: 'D43', name: 'Semieslava', userColor: 'w', cat: 'white', idea: 'Pressió central amb c4 contra l\'estructura sòlida negra.', moves: ['d4','d5','c4','c6','Nf3','Nf6','Nc3','e6','Bg5'] },
    { eco: 'C50', name: 'Obertura Italiana (Giuoco Piano)', userColor: 'w', cat: 'white', idea: 'Desenvolupa l\'alfil a c4 apuntant a f7 i prepara c3 i d4; joc obert, natural i molt habitual.', moves: ['e4','e5','Nf3','Nc6','Bc4','Bc5','c3','Nf6','d3','d6'] },
    { eco: 'C23', name: 'Obertura de l\'Alfil', userColor: 'w', cat: 'white', idea: 'Treu l\'alfil a c4 abans del cavall per evitar la Petrov i conservar l\'opció de f4.', moves: ['e4','e5','Bc4','Nf6','d3','Nc6','Nf3','Bc5','c3'] },
    { eco: 'A07', name: 'Atac Índi de Rei', userColor: 'w', cat: 'white', idea: 'Sistema universal: fianchetto de rei, e4 diferit i atac al flanc de rei amb peces.', moves: ['Nf3','d5','g3','Nf6','Bg2','e6','O-O','Be7','d3','O-O','Nbd2'] },
    { eco: 'B31', name: 'Siciliana: Rossolimo (Bb5)', userColor: 'w', cat: 'white', idea: 'Anti-Siciliana sòlida: l\'alfil a b5 pressiona el cavall c6 i evita les línies obertes més teòriques.', moves: ['e4','c5','Nf3','Nc6','Bb5','g6','Bxc6','dxc6','d3','Bg7'] },
    { eco: 'A45', name: 'Atac Trompowsky', userColor: 'w', cat: 'white', idea: 'Surt amb Bg5 el segon moviment per evitar la teoria índia i canviar pel cavall f6.', moves: ['d4','Nf6','Bg5','Ne4','Bf4','d5','e3','c5'] },
    { eco: 'A46', name: 'Atac Torre', userColor: 'w', cat: 'white', idea: 'Desplegament còmode amb Nf3 i Bg5 contra estructures amb ...e6; fàcil i sòlid.', moves: ['d4','Nf6','Nf3','e6','Bg5','h6','Bh4','b6'] },
    { eco: 'D05', name: 'Sistema Colle', userColor: 'w', cat: 'white', idea: 'Estructura sòlida amb e3 i Bd3 preparant el trencament central e4.', moves: ['d4','d5','Nf3','Nf6','e3','e6','Bd3','c5','c3','Nc6'] },
    { eco: 'A03', name: 'Obertura Bird', userColor: 'w', cat: 'white', idea: 'Controla e5 amb 1.f4 i busca un atac al flanc de rei amb estructura de tipus holandès.', moves: ['f4','d5','Nf3','Nf6','e3','g6','Be2','Bg7','O-O','O-O'] },
    { eco: 'A01', name: 'Atac Nimzowitsch-Larsen', userColor: 'w', cat: 'white', idea: 'Fianchetto de dama amb 1.b3: l\'alfil a b2 pressiona la diagonal llarga i el centre.', moves: ['b3','e5','Bb2','Nc6','e3','Nf6','Bb5','Bd6'] },
    { eco: 'A00', name: 'Obertura Sokolsky (Orangutan)', userColor: 'w', cat: 'white', idea: 'Sorprèn amb 1.b4 guanyant espai al flanc de dama i activant l\'alfil a b2.', moves: ['b4','e5','Bb2','Bxb4','Bxe5','Nf6','Nf3','d6'] },
    { eco: 'D00', name: 'Atac Stonewall', userColor: 'w', cat: 'white', idea: 'Aixeca un mur de peons (d4-e3-f4) i ataca el flanc de rei amb l\'alfil a d3.', moves: ['d4','d5','e3','Nf6','Bd3','e6','f4','c5','c3','Nc6'] },
    // === Defenses amb negres ===
    { eco: 'B20', name: 'Defensa Siciliana', userColor: 'b', cat: 'black', idea: 'Lluita asimètrica: c5 desafia el centre blanc.', moves: ['e4','c5','Nf3','Nc6','d4','cxd4','Nxd4','Nf6','Nc3','d6'] },
    { eco: 'B90', name: 'Siciliana Najdorf', userColor: 'b', cat: 'black', idea: 'La més ambiciosa: a6 prepara contrajoc als dos flancs.', moves: ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','a6'] },
    { eco: 'C00', name: 'Defensa Francesa', userColor: 'b', cat: 'black', idea: 'Cadena de peons sòlida; contraatac a la columna c i f.', moves: ['e4','e6','d4','d5','Nc3','Nf6','Bg5','Be7','e5','Nfd7'] },
    { eco: 'B10', name: 'Defensa Caro-Kann', userColor: 'b', cat: 'black', idea: 'Defensa sòlida que allibera l\'alfil de caselles clares.', moves: ['e4','c6','d4','d5','Nc3','dxe4','Nxe4','Bf5','Ng3','Bg6'] },
    { eco: 'C42', name: 'Defensa Petrov', userColor: 'b', cat: 'black', idea: 'Resposta simètrica i sòlida: negres ataquen el peó e4 immediatament.', moves: ['e4','e5','Nf3','Nf6','Nxe5','d6','Nf3','Nxe4','d4','d5'] },
    { eco: 'C41', name: 'Defensa Philidor', userColor: 'b', cat: 'black', idea: 'Enforteix e5 amb d6; joc sòlid i sense compromisos.', moves: ['e4','e5','Nf3','d6','d4','Nf6','Nc3','Nbd7','Bc4','Be7'] },
    { eco: 'B02', name: 'Defensa Alekhine', userColor: 'b', cat: 'black', idea: 'Provoca l\'avanç dels peons blancs per atacar-los després.', moves: ['e4','Nf6','e5','Nd5','d4','d6','Nf3','Bg4','Be2','e6'] },
    { eco: 'B06', name: 'Defensa Pirc', userColor: 'b', cat: 'black', idea: 'Hipermoderna: fianchetto de rei i contraatac diferit.', moves: ['e4','d6','d4','Nf6','Nc3','g6','Nf3','Bg7','Be2','O-O'] },
    { eco: 'E60', name: 'Defensa Índia de Rei', userColor: 'b', cat: 'black', idea: 'Cedeix el centre per atacar-lo després amb peces i peons.', moves: ['d4','Nf6','c4','g6','Nc3','Bg7','e4','d6','Nf3','O-O'] },
    { eco: 'E20', name: 'Defensa Nimzo-Índia', userColor: 'b', cat: 'black', idea: 'Clava el cavall c3 per controlar el centre; joc posicional ric.', moves: ['d4','Nf6','c4','e6','Nc3','Bb4','e3','O-O','Bd3','d5'] },
    { eco: 'E10', name: 'Defensa Índia de Dama', userColor: 'b', cat: 'black', idea: 'Fianchetto de dama; pressiona la diagonal llarga.', moves: ['d4','Nf6','c4','e6','Nf3','b6','g3','Bb7','Bg2','Be7'] },
    { eco: 'D80', name: 'Defensa Grünfeld', userColor: 'b', cat: 'black', idea: 'Cedeix el centre amb d5xc4 per destruir-lo amb peces i Bg7.', moves: ['d4','Nf6','c4','g6','Nc3','d5','cxd5','Nxd5','e4','Nxc3'] },
    { eco: 'A60', name: 'Defensa Benoni Moderna', userColor: 'b', cat: 'black', idea: 'Accepta espai inferior a canvi de contrajoc dinàmic al flanc de dama.', moves: ['d4','Nf6','c4','c5','d5','e6','Nc3','exd5','cxd5','d6'] },
    { eco: 'A80', name: 'Defensa Holandesa', userColor: 'b', cat: 'black', idea: 'f5 controla e4 i prepara un atac al flanc de rei.', moves: ['d4','f5','g3','Nf6','Bg2','e6','Nf3','Be7','O-O','O-O'] },
    { eco: 'B01', name: 'Defensa Escandinava', userColor: 'b', cat: 'black', idea: 'Desafia e4 immediatament; recupera el peó amb la dama activa.', moves: ['e4','d5','exd5','Qxd5','Nc3','Qa5','d4','Nf6','Nf3','c6'] },
    { eco: 'D10', name: 'Defensa Eslava', userColor: 'b', cat: 'black', idea: 'Protegeix d5 amb c6 i manté l\'alfil actiu fora de la cadena.', moves: ['d4','d5','c4','c6','Nf3','Nf6','Nc3','dxc4','a4','Bf5'] },
    { eco: 'C55', name: 'Defensa dels Dos Cavalls', userColor: 'b', cat: 'black', idea: 'Respon a l\'alfil italià amb ...Nf6 i busca contrajoc tàctic actiu de seguida.', moves: ['e4','e5','Nf3','Nc6','Bc4','Nf6','Ng5','d5','exd5','Na5'] },
    { eco: 'B06', name: 'Defensa Moderna (Robatsch)', userColor: 'b', cat: 'black', idea: 'Cedeix el centre i fianchetta l\'alfil de rei per contraatacar-lo després amb peces i peons.', moves: ['e4','g6','d4','Bg7','Nc3','d6','Be3','a6'] },
    { eco: 'B70', name: 'Siciliana Dragó', userColor: 'b', cat: 'black', idea: 'Fianchetto a g7: l\'alfil mira la diagonal llarga i el negre contraataca al flanc de dama.', moves: ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','g6'] },
    { eco: 'B33', name: 'Siciliana Sveshnikov', userColor: 'b', cat: 'black', idea: 'Avança ...e5 aviat acceptant un peó endarrerit a d6 a canvi d\'activitat de peces.', moves: ['e4','c5','Nf3','Nc6','d4','cxd4','Nxd4','Nf6','Nc3','e5'] },
    { eco: 'B35', name: 'Siciliana Dragó Accelerat', userColor: 'b', cat: 'black', idea: 'Fianchetto ràpid sense ...d6 per estalviar temps i pressionar el centre amb ...d5.', moves: ['e4','c5','Nf3','Nc6','d4','cxd4','Nxd4','g6','Nc3','Bg7','Be3','Nf6'] },
    { eco: 'B47', name: 'Siciliana Taimanov', userColor: 'b', cat: 'black', idea: 'Desplegament flexible amb ...e6 i ...Qc7; manté opcions sobre on col·locar les peces.', moves: ['e4','c5','Nf3','e6','d4','cxd4','Nxd4','Nc6','Nc3','Qc7'] },
    { eco: 'B42', name: 'Siciliana Kan', userColor: 'b', cat: 'black', idea: 'Estructura elàstica amb ...a6 i ...e6: prepara ...b5 i evita pins primerencs.', moves: ['e4','c5','Nf3','e6','d4','cxd4','Nxd4','a6','Nc3','Qc7'] },
    { eco: 'E11', name: 'Defensa Bogo-Índia', userColor: 'b', cat: 'black', idea: 'Clava amb ...Bb4+ per simplificar i jugar una posició sòlida i equilibrada.', moves: ['d4','Nf6','c4','e6','Nf3','Bb4+','Bd2','Qe7'] },
    { eco: 'A52', name: 'Gambit Budapest', userColor: 'b', cat: 'black', idea: 'Sacrifica un peó amb ...e5 per obtenir peces actives i amenaces ràpides.', moves: ['d4','Nf6','c4','e5','dxe5','Ng4','Bf4','Nc6','Nf3','Bb4+'] },
    { eco: 'D08', name: 'Contragambit Albin', userColor: 'b', cat: 'black', idea: 'Respon al gambit de dama amb ...e5, cedint un peó per a un peó avançat a d4 molt molest.', moves: ['d4','d5','c4','e5','dxe5','d4','Nf3','Nc6','g3','Be6'] }
];

function hideOpeningRestartOverlay() {
    const overlay = document.getElementById('opening-restart-overlay');
    if (overlay) overlay.style.display = 'none';
}

function showOpeningRestartOverlay() {
    const overlay = document.getElementById('opening-restart-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function restartCompletedOpeningLesson() {
    if (openingLessonCurrentIndex === null || openingLessonCurrentIndex === undefined) return;
    startOpeningLesson(openingLessonCurrentIndex);
}

function startOpeningLesson(idx, forceColor) {
    const op = CURATED_OPENINGS[idx];
    if (!op) return;
    openingErrorPracticeActive = false;
    hieroglyphicExerciseActive = false;
    updateOpeningMaximButton();
    hideOpeningRestartOverlay();
    openingLessonActive = true;
    openingLessonInfo = op;
    openingLessonCurrentIndex = idx;
    openingLessonLine = op.moves.slice();
    openingLessonStep = 0;
    openingLessonLastDetected = null;
    // La línia teòrica és la mateixa; forceColor permet practicar-la des de
    // qualsevol bàndol (blanques o negres) encara que l'obertura tingui un color
    // "natural" al repertori.
    openingLessonUserColor = (forceColor === 'w' || forceColor === 'b') ? forceColor : (op.userColor || 'w');
    openingPracticeUserColor = openingLessonUserColor;
    const colorSelect = document.getElementById('opening-practice-color-select');
    if (colorSelect) colorSelect.value = openingPracticeUserColor;
    if (!openingBundleBoard) initOpeningBundleBoard();
    openingPracticeGame = new Chess();
    openingPracticeMoveCount = 0;
    openingPracticeGoodMoves = 0;
    openingPracticeTotalMoves = 0;
    openingLastMoveQuality = null;
    clearOpeningHintHighlight();
    clearOpeningMoveVisualFeedback();
    if (openingBundleBoard) {
        openingBundleBoard.orientation(openingLessonUserColor === 'w' ? 'white' : 'black');
        openingBundleBoard.position('start');
    }
    updateOpeningPrecisionDisplay();
    setOpeningScreenMode('lesson');
    updateOpeningLessonNote(true);
    // Si l'usuari juga amb negres, el blanc (rival) fa la primera jugada de la línia
    if (openingLessonUserColor === 'b') {
        setTimeout(() => playOpeningLessonOpponentMove(), 600);
    } else {
        // L'usuari juga amb blanques: marca ja en lila la casella de la primera jugada
        setTimeout(() => showOpeningLessonTargetHint(), 60);
    }
    const boardEl = document.getElementById('opening-board');
    if (boardEl && boardEl.scrollIntoView) setTimeout(() => boardEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}

function playOpeningLessonOpponentMove() {
    if (!openingLessonActive) return;
    if (openingLessonStep >= openingLessonLine.length) { completeOpeningLesson(); return; }
    const san = openingLessonLine[openingLessonStep];
    const mv = openingPracticeGame.move(san, { sloppy: true });
    if (!mv) { completeOpeningLesson(); return; }
    openingLessonStep++;
    // L'enginy ha mogut: treu el vist-i-plau verd de la jugada anterior
    clearOpeningMoveVisualFeedback();
    if (openingBundleBoard) openingBundleBoard.position(openingPracticeGame.fen());
    if (openingLessonStep >= openingLessonLine.length) { setTimeout(() => completeOpeningLesson(), 500); return; }
    updateOpeningLessonNote();
    // Marca en lila la casella de la nova jugada que toca a l'usuari
    showOpeningLessonTargetHint();
}

function updateOpeningLessonNote(intro = false) {
    const noteEl = document.getElementById('opening-practice-note');
    if (!noteEl || !openingLessonInfo) return;
    const total = openingLessonLine.length;
    const done = openingLessonStep;
    const yourTurn = openingLessonActive && openingPracticeGame.turn() === openingLessonUserColor && done < total;
    const colorTxt = openingLessonUserColor === 'w' ? 'blanques' : 'negres';
    const targetUserMoves = getOpeningLessonUserMoveTarget();
    const progressText = targetUserMoves > 0
        ? `${openingPracticeGoodMoves}/${targetUserMoves} jugades correctes`
        : `${done}/${total} jugades`;
    let html = `<div class="opening-maxim-box"><div class="maxim-title">📖 ${openingLessonInfo.name} (${openingLessonInfo.eco})</div>`;
    if (intro && openingLessonInfo.idea) html += `<div class="maxim-text">${openingLessonInfo.idea}</div>`;
    const movePhrase = Array.isArray(openingLessonInfo.movePhrases) ? openingLessonInfo.movePhrases[done] : null;
    if (movePhrase && done < total) html += `<div class="maxim-text" style="opacity:0.92;">${movePhrase}</div>`;
    const status = done >= total ? 'Línia completada!' : (yourTurn ? `El teu torn (${colorTxt}): troba la jugada de la teoria.` : 'Observa la resposta del rival...');

    // Defenses amb negres: marcador d'encerts en verd + avís de canvi de tipus d'obertura.
    // Les obertures amb blanques es deixen igual que estan.
    if (openingLessonUserColor === 'b') {
        const target = targetUserMoves > 0 ? targetUserMoves : total;
        const counter = `<span style="display:inline-block; padding:2px 10px; border-radius:999px; background:rgba(76,175,80,0.18); color:var(--accent-green); font-weight:700;">✓ encerts ${openingPracticeGoodMoves}/${target}</span>`;
        html += `<div class="maxim-text" style="margin-top:6px;">${counter}</div>`;
        const detected = analyzeGameOpening(openingPracticeGame.history());
        if (detected && detected.name) {
            const display = `${detected.name}${detected.eco ? ` (${detected.eco})` : ''}`;
            // Família base (sense subvariant ni ECO) per detectar canvis de tipus reals
            const baseFamily = s => (s || '').split(':')[0].trim();
            // Obertures genèriques d'arrencada: en passar d'aquí a la defensa real no és un "canvi"
            const GENERIC_ROOTS = ["King's Pawn Game", "Queen's Pawn Game", "Indian Defense", "King's Pawn Opening", "Queen's Pawn Opening"];
            const prevBase = baseFamily(openingLessonLastDetected);
            const currBase = baseFamily(detected.name);
            const changed = openingLessonLastDetected && prevBase !== currBase && !GENERIC_ROOTS.includes(prevBase);
            const label = changed
                ? `🔀 Has canviat d'obertura: <strong>${display}</strong>`
                : `📗 Obertura: <strong>${display}</strong>`;
            html += `<div class="maxim-text" style="opacity:0.9;">${label}</div>`;
            openingLessonLastDetected = detected.name;
        }
        html += `<div class="maxim-text" style="opacity:0.85;">${status}</div></div>`;
        noteEl.innerHTML = html;
        return;
    }

    html += `<div class="maxim-text" style="opacity:0.85;">${status} · ${progressText}</div></div>`;
    noteEl.innerHTML = html;
}

function completeOpeningLesson() {
    openingLessonActive = false;
    const name = openingLessonInfo ? openingLessonInfo.name : 'obertura';
    const eco = openingLessonInfo ? openingLessonInfo.eco : null;
    let firstTime = false;
    if (eco && !completedOpenings.includes(eco)) {
        completedOpenings.push(eco);
        firstTime = true;
        saveStorage();
        checkOpeningBadges();
    }
    const noteEl = document.getElementById('opening-practice-note');
    if (noteEl) {
        const extra = firstTime ? `<div class="maxim-text" style="color:var(--accent-gold);">Nova obertura desbloquejada! ${completedOpenings.length}/${CURATED_OPENINGS.length} apreses.</div>` : '';
        const targetUserMoves = getOpeningLessonUserMoveTarget();
        const progress = targetUserMoves > 0 ? `<div class="maxim-text" style="opacity:0.85;">Resultat: ${openingPracticeGoodMoves}/${targetUserMoves} jugades correctes.</div>` : '';
        noteEl.innerHTML = `<div class="opening-maxim-box"><div class="maxim-title">✅ ${name} apresa!</div><div class="maxim-text">Has completat la línia principal. Repeteix-la per consolidar-la o tria'n una altra.</div>${progress}${extra}</div>`;
    }
    renderOpeningLessonButtons();
    showOpeningRestartOverlay();
    showToast(`Has completat: ${name} 📖`, 'success');
}

function renderOpeningLessonButtons() {
    const container = document.getElementById('opening-lesson-list');
    if (!container) return;
    const whites = CURATED_OPENINGS.map((op, i) => ({ op, i })).filter(x => x.op.cat === 'white');
    const blacks = CURATED_OPENINGS.map((op, i) => ({ op, i })).filter(x => x.op.cat === 'black');
    const renderGroup = (label, items) => {
        const btns = items.map(({ op, i }) => {
            const colorIcon = op.userColor === 'w' ? '♔' : '♚';
            const done = completedOpenings.includes(op.eco);
            const repeat = done ? '<span class="lesson-repeat-icon" title="Torna a practicar aquesta obertura" aria-label="Torna a practicar">↻</span>' : '';
            return `<button class="btn btn-secondary opening-lesson-btn${done ? ' lesson-done' : ''}" data-lesson="${i}" style="justify-content:space-between;">
                <span>${colorIcon} ${op.name}</span>
                <span style="display:flex; align-items:center; gap:6px;">${repeat}<span style="font-size:0.72rem; opacity:0.7;">${op.eco}</span></span>
            </button>`;
        }).join('');
        return `<div class="opening-lesson-group-title">${label}</div><div class="opening-lesson-grid">${btns}</div>`;
    };
    const total = CURATED_OPENINGS.length;
    const done = completedOpenings.filter(e => CURATED_OPENINGS.some(op => op.eco === e)).length;
    const pct = Math.round((done / total) * 100);
    const progress = `<div class="opening-progress-bar"><div class="opening-progress-label">Obertures apreses: <strong>${done}/${total}</strong></div><div class="opening-progress-track"><div class="opening-progress-fill" style="width:${pct}%;"></div></div></div>`;
    container.innerHTML = progress + renderGroup('♔ Obertures amb blanques', whites) + renderGroup('♚ Defenses amb negres', blacks);
}

/* ============ EXERCICIS GEROGLÍFICS D'OBERTURA ============ */
let hieroglyphicExerciseActive = false;
let hieroglyphicOpening = null;
let hieroglyphicGame = null;
let hieroglyphicStep = 0;
let hieroglyphicExpectedMove = null;
let hieroglyphicClue = null;
let hieroglyphicAttempts = 0;
let hieroglyphicScore = { correct: 0, total: 0 };
let hieroglyphicToken = 0; // guarda contra condicions de cursa amb crides OpenAI asíncrones

const HIEROLAST_KEY = 'eltauler_recent_hieroglyphics';
const HIERO_STATS_KEY = 'eltauler_hieroglyphic_stats';
const HIEROS = {
    voices: [
        { id: 'llull', name: 'Ramon Llull', work: 'l’Ars Magna', style: 'simbòlic i contemplatiu' },
        { id: 'sunzi', name: 'Sunzi', work: 'L’art de la guerra', style: 'breu, afilat i militar' },
        { id: 'monastic', name: 'Monjo de la torre', work: 'el còdex del silenci', style: 'serè i enigmàtic' },
        { id: 'mercader', name: 'Mercader de Damasc', work: 'el llibre dels intercanvis', style: 'pràctic i astut' },
        { id: 'cavaller', name: 'Cavaller errant', work: 'la crònica del setge', style: 'heroic però precís' },
        { id: 'mestre_calmat', name: 'Mestre calmat', work: 'les lliçons del tauler', style: 'clar, pacient i profund' },
        { id: 'cartograf', name: 'Cartògraf reial', work: 'l’atles de les caselles invisibles', style: 'visual i territorial' },
        { id: 'orfebre', name: 'Orfebre d’escacs', work: 'el tractat de les peces fines', style: 'delicat i calculador' }
    ],
    openings: [
        'Abans de tocar el ferro', 'Quan la pols encara no ha caigut', 'Sota la llum obliqua del tauler',
        'El mapa mostra una esquerda', 'El silenci amaga una ordre', 'La clau no és al soroll',
        'En aquesta cruïlla', 'El bon navegant mira el corrent', 'Quan dues forces es miren',
        'El mestre assenyala l’ombra', 'La balança tremola', 'La porta sembla tancada',
        'Un fil tibant travessa el camp', 'El jardí té una pedra fora de lloc', 'La fortalesa respira malament',
        'Hi ha una peça que demana camí', 'El tauler parla baix', 'La resposta no crida',
        'El perill vesteix de calma', 'La millor espurna neix d’una restricció'
    ],
    closings: [
        'fes que l’altre contesti, no que triï', 'busca la jugada que canvia la pregunta',
        'no agafis el fruit abans de tallar la branca', 'obre una porta i tanca dues respostes',
        'la pressa és enemiga de la precisió', 'mou la causa, no el símptoma',
        'primer fixa l’aire, després compta el material', 'la línia útil pesa més que la captura vistosa',
        'quan una peça queda lligada, tot l’exèrcit camina més lent', 'fes parlar la peça que encara no ha dit res',
        'el guany real és el temps que l’altre perd', 'la millor defensa sovint és una amenaça ordenada',
        'si tot sembla igual, pregunta quin rei respira pitjor', 'no cerquis una casella: cerca una funció',
        'un pas discret pot canviar tot el paisatge', 'l’harmonia és més forta que l’aventura',
        'la columna buida és un camí, no un adorn', 'la diagonal llarga recorda allò que ningú defensa',
        'la peça activa val més que la peça orgullosa', 'la tensió bona no es resol: es dirigeix'
    ],
    verbs: ['desvetlla', 'estreny', 'desvia', 'deslliga', 'obre', 'tanca', 'fixa', 'atrau', 'ordena', 'encén', 'refreda', 'transforma'],
    images: ['fil de seda', 'porta estreta', 'pont de boira', 'clau enterrada', 'llum lateral', 'martell petit', 'campana muda', 'riu tallat', 'xarxa fina', 'balança antiga', 'escala secreta', 'sostre prim'],
    sectors: { kingside: 'ala del rei', queenside: 'ala de dama', center: 'franja central', back: 'rereguarda', promotion: 'vora de coronació' },
    pieces: { p: 'peó', n: 'cavall', b: 'alfil', r: 'torre', q: 'dama', k: 'rei' },
    themes: {
        king_attack: {
            metaphors: ['un sostre massa prim', 'una corona amb corrent d’aire', 'un castell amb la porta interior oberta', 'un refugi que ja no refugia', 'una flama massa prop del tron', 'una guàrdia clavada al seu lloc'],
            advice: ['posa pressió abans de cobrar', 'fes que la defensa camini d’esquena', 'busca una jugada amb ritme', 'obliga el rei a escoltar', 'entra per la línia que ja respira', 'no canviïs atac per engrunes'],
            warnings: ['si captures massa aviat, la xarxa es desfà', 'el rei no cau per pes, cau per falta d’aire', 'la primera amenaça ha de portar una segona ombra']
        },
        fork: {
            metaphors: ['una forca de dues dents', 'dos cofres sota una sola clau', 'un camí que es bifurca contra l’enemic', 'una pregunta amb dues víctimes', 'un compàs obert sobre peces pesants', 'dues ombres al mateix llum'],
            advice: ['mira quina peça pot mirar dos tresors', 'troba el salt que pregunta dues coses', 'posa una amenaça que no es pugui respondre sencera', 'cerca doble pressió, no pressió doblegada', 'fes que una defensa deixi l’altra nua'],
            warnings: ['no tota captura és guany: el doble atac pesa més', 'si només amenaces una cosa, l’altre respirarà']
        },
        pin: {
            metaphors: ['un clau invisible', 'una peça cosida al seu rei', 'una ombra que no pot fugir', 'una porta subjectada per una agulla', 'un guardià lligat a la paret', 'una línia que immobilitza'],
            advice: ['mira què no es pot moure sense trencar el regne', 'posa pes sobre la peça lligada', 'ataca allò que defensa per obligació', 'la immobilitat és material futur', 'la línia val més que el cop'],
            warnings: ['si la peça pot marxar, no és presó', 'no trenquis la línia que et fa guanyar temps']
        },
        skewer: {
            metaphors: ['una llança que travessa rangs', 'el primer noble amagant el segon', 'una fila massa recta', 'una agulla que troba metall darrere metall', 'un camí sense escapatòria'],
            advice: ['fes moure el gran per descobrir el valuós', 'pressiona la peça de davant per cobrar la de darrere', 'busca alineació, no només contacte', 'la recta és una trampa quan no hi ha desviació'],
            warnings: ['si no hi ha peça darrere, la llança és només fusta']
        },
        center_break: {
            metaphors: ['una esquerda al paviment central', 'un pont que cedeix al mig', 'la plaça que canvia de propietari', 'una llavor al cor del camp', 'un cop de cisell al centre', 'dues portes que s’obren alhora'],
            advice: ['canvia la tensió abans que es torni contra tu', 'obre el centre quan el rival encara ordena peces', 'fes que els peons preguntin a les peces', 'no ocupis per orgull: trenca per funció', 'converteix espai en línies'],
            warnings: ['si el teu rei no respira, obrir el centre pot ser verí', 'el centre no es toca sense calcular la resposta']
        },
        development: {
            metaphors: ['una peça que surt del claustre', 'un soldat que troba la plaça natural', 'una roda que encaixa al mecanisme', 'un pont per a l’exèrcit adormit', 'una finestra oberta abans de la tempesta'],
            advice: ['activa abans d’atacar', 'porta una força nova al lloc on mira més lluny', 'guanya temps fent una cosa útil', 'no repeteixis la veu que ja ha parlat', 'prepara el refugi mentre controles el camp'],
            warnings: ['la mateixa peça no ha de demanar tres torns', 'una aventura prematura deixa la casa buida']
        },
        material_win: {
            metaphors: ['una moneda que cau després del tempo', 'un tresor defensat per un fil', 'una peça sense prou guardians', 'una balança que ja s’inclina', 'un mercat on l’altre paga dues vegades'],
            advice: ['guanya material sense perdre el fil', 'cobra només quan la recaptura no et mossega', 'compta defensors abans de mirar la brillantor', 'la millor captura és la que deixa una amenaça', 'pren allò que queda sense casa'],
            warnings: ['l’or enverinat pesa més del que sembla', 'si el guany obre el teu rei, no és guany']
        },
        passed_pawn: {
            metaphors: ['un infant que camina cap a la corona', 'una llavor sense mur al davant', 'una escala fins a la vuitena ombra', 'un peó que ja no coneix fronteres', 'un viatger amb el camí net'],
            advice: ['fes avançar el futur abans que el bloquegin', 'acompanya el caminant, no el deixis sol', 'canvia guardians quan el camí és net', 'la promoció comença abans de veure la corona'],
            warnings: ['un peó passat sense rei és una promesa fràgil', 'si avances sense suport, el camí es tanca']
        },
        defensive_move: {
            metaphors: ['un escut posat abans de la fletxa', 'una porta tancada sense soroll', 'una mà que apaga la metxa', 'un nus desfet abans que estrenyi', 'una ombra greu aturada a temps'],
            advice: ['atura l’amenaça gran i conserva iniciativa', 'defensa creant una pregunta nova', 'mira la PV com qui escolta passos darrere la porta', 'la calma bona elimina el verí', 'no totes les millors jugades ataquen'],
            warnings: ['ignorar l’amenaça és donar-li nom', 'si només defenses, potser arribes tard']
        },
        endgame_activity: {
            metaphors: ['un rei que surt del palau', 'una torre que troba carretera', 'un peó que necessita escorta', 'una peça llunyana que torna a treballar', 'un final on el temps pesa com material'],
            advice: ['activa el rei quan les tempestes han passat', 'posa la torre darrere del caminant', 'guanya caselles abans de guanyar peons', 'l’activitat és el material del final', 'talla el rei contrari'],
            warnings: ['un rei passiu perd finals igualats', 'la torre al marge veu poc i cobra menys']
        },
        quiet_improvement: {
            metaphors: ['una clau que gira sense soroll', 'una peça que millora la respiració del conjunt', 'un pas que no captura però obliga', 'una cadira posada al lloc exacte', 'un petit ordre abans del gran cop'],
            advice: ['millora la pitjor peça', 'fes una amenaça que no necessiti pressa', 'posa ordre abans de calcular focs artificials', 'augmenta la pressió sense donar contrajoc', 'troba el moviment útil que no es veu primer'],
            warnings: ['si tot crema, una jugada tranquil·la pot arribar tard', 'la bellesa quieta també ha de tenir amenaça']
        },
        simplification: {
            metaphors: ['un mercat que tanca parades', 'un camí net després de canviar soroll per ordre', 'una balança que prefereix menys peces', 'un nus tallat en lloc de pentinat', 'una tempesta convertida en pluja fina'],
            advice: ['canvia quan el final et somriu', 'redueix les peces atacants del rival', 'conserva el que pesa i canvia el que complica', 'fes que l’avantatge sigui fàcil de portar'],
            warnings: ['simplificar sense avantatge és regalar preguntes', 'no canviïs la peça que manté la xarxa']
        },
        piece_activity: {
            metaphors: ['una peça empresonada que troba finestra', 'una torre que olora columna', 'un alfil que desperta la diagonal', 'un cavall que busca post avançat', 'una eina que per fi toca la feina'],
            advice: ['porta força a la línia oberta', 'canvia una peça muda per una peça amb veu', 'mira quin camí nou s’ha obert', 'la millor peça és la que crea problemes reals'],
            warnings: ['activitat sense objectiu és turisme', 'una peça bonica però indefensa pot ser un luxe']
        },
        default: {
            metaphors: ['un signe petit al marge del mapa', 'una porta que només s’obre des de dins', 'un fil que uneix dues debilitats', 'una balança que demana paciència', 'un camí secundari més curt que la via gran'],
            advice: ['busca la funció més urgent', 'troba la peça que millora amb tempo', 'no revelis el pla abans de preparar-lo', 'fes una pregunta difícil al rival', 'tria la jugada que deixa menys respostes bones'],
            warnings: ['la primera idea no sempre és la més profunda', 'si sembla massa fàcil, compta una vegada més']
        }
    }
};

/* ============================================================================
 * BANC DE PLANS HUMANS (100% local, sense dependència de cap clau d'API)
 * Plantilles riques per tema. Cada camp té diverses variants; es combinen i
 * s'eviten repeticions recents perquè el text sigui variat com els jeroglífics.
 * Marcadors: {n} núm. jugada · {played} jugada feta · {best} millor jugada · {swing} CP.
 * Els "objectius" són frases genèriques i, per això, reaprofitables pels
 * jeroglífics generals (veure themeToPlainAdvice).
 * ========================================================================== */
const HIERO_TO_GROWTH_THEME = {
    king_attack: 'king_attack', fork: 'fork', pin: 'pin', skewer: 'skewer',
    center_break: 'center', development: 'opening', material_win: 'material',
    passed_pawn: 'endgame', defensive_move: 'general', endgame_activity: 'endgame',
    quiet_improvement: 'general', simplification: 'endgame', piece_activity: 'general',
    default: 'general'
};
const HUMAN_PLAN_BANK = {
    king_attack: {
        diagnosis: [
            'A la jugada {n} ({played}) vas tractar la seguretat del rei com un detall, i el rival va guanyar temps per organitzar l’atac.',
            'A {n}, {played} va deixar el rei amb menys aire del que semblava; perdre {swing} CP va ser la factura d’aquesta exposició.',
            'El problema de {played} (jugada {n}) no era estètic: obria línies cap al teu propi rei abans d’hora.',
            'A la jugada {n} vas comptar material i vas oblidar qui tenia el rei més fràgil després de {played}.',
            'Amb {played} (jugada {n}) vas convidar les peces rivals a la rodalia del teu rei sense preparar la defensa.',
            'A {n}, la decisió {played} va prioritzar l’activitat sobre el refugi, i el rei en va pagar {swing} CP.'
        ],
        plan: [
            'El pla humà era sumar defensors o tancar línies abans de buscar res més; {best} respectava aquesta prioritat.',
            'Calia preguntar quin rei queda més exposat i, com {best}, posar primer la casa en ordre.',
            'El pla correcte passava per neutralitzar l’amenaça directa i només després contraatacar, just el que insinuava {best}.',
            'Primer aire per al teu rei, després ambició: {best} portava una peça més a la defensa o creava una casella d’escapament.',
            'El bon pla era convertir la defensa en amenaça ordenada, sense regalar contrajoc; {best} ho feia millor.',
            'Volies atacar, però tocava assegurar el rei amb tempo; {best} unia les dues idees.'
        ],
        question: [
            'Qui té el rei més exposat si s’obren línies ara mateix, tu o el rival?',
            'Abans d’atacar, el teu rei té casella d’escapament i prou defensors?',
            'Aquesta jugada acosta peces al rei rival o allunya les teves de la pròpia defensa?',
            'Si el rival contraataca el teu rei, quina peça el defensaria?',
            'Estàs creant una amenaça real o només un gest vistós a l’ala?',
            'Quina és l’amenaça més perillosa del rival contra el teu rei i com la pares amb ritme?'
        ],
        objective: [
            'No obris el centre si el teu rei encara necessita un defensor o una casella d’escapament.',
            'Abans d’atacar, dedica un torn a comptar atacants i defensors al voltant de cada rei.',
            'Quan ataquis el rei, busca jugades amb ritme (escacs o amenaces) que no donin temps a defensar.',
            'Cada jugada d’atac al rei ha de portar amagada una segona amenaça.',
            'Si el teu rei respira malament, atura’t i resol-ho abans de qualsevol aventura.',
            'Davant d’un atac al rei, primer elimina l’amenaça més immediata i conserva la iniciativa.'
        ]
    },
    material: {
        diagnosis: [
            'A la jugada {n} ({played}), la captura vistosa va amagar què quedava penjat després; el saldo va ser de {swing} CP.',
            'A {n}, {played} va agafar el fruit sense tallar la branca: la recaptura rival va decidir.',
            'El problema de {played} (jugada {n}) era comptar només el que es guanyava, no el que es deixava sense defensa.',
            'A la jugada {n} vas entrar en una sèrie de canvis sense calcular l’última jugada, i {played} va costar {swing} CP.',
            'Amb {played} (jugada {n}) vas confondre material immediat amb avantatge real.',
            'A {n}, la temptació de guanyar fusta amb {played} va deixar una peça teva sense casa.'
        ],
        plan: [
            'El pla humà era comptar defensors i recaptures abans de decidir; {best} guanyava material sense mossegada.',
            'Calia preguntar què queda sense defensa després dels canvis, just el que tenia en compte {best}.',
            'La millor captura és la que deixa una amenaça viva: {best} ho aconseguia.',
            'El bon pla era cobrar només quan la recaptura no et fa mal; {best} ho complia.',
            'Abans d’agafar material, tocava assegurar la coordinació; {best} mantenia les peces connectades.',
            'El pla correcte era prendre allò que de debò queda sense guardians, com mostrava {best}.'
        ],
        question: [
            'Després de la sèrie forçada de canvis, quina peça teva queda sense defensa?',
            'Qui fa l’última captura d’aquesta sèrie de canvis?',
            'Aquest material que guanyes obre el teu rei o desordena les teves peces?',
            'Hi ha una jugada intermèdia (escac o amenaça) que canviï el compte?',
            'El guany és real o l’or està enverinat?',
            'Si captures, quina és la millor resposta del rival i la sobrevius?'
        ],
        objective: [
            'Abans de capturar, calcula una jugada més: la recaptura i l’amenaça següent del rival.',
            'Compta sempre atacants i defensors d’una casella abans de canviar-hi peces.',
            'No agafis material si això activa les peces del rival o exposa el teu rei.',
            'Busca jugades intermèdies abans de recapturar de manera automàtica.',
            'Apunta’t mentalment l’última jugada de cada sèrie de canvis abans de començar-la.',
            'Tria la captura que, a més de guanyar fusta, deixi una amenaça.'
        ]
    },
    center: {
        diagnosis: [
            'A la jugada {n} ({played}), vas resoldre la tensió central en mal moment i vas perdre {swing} CP.',
            'A {n}, {played} va tocar el centre sense calcular la rèplica que l’obria a favor del rival.',
            'El problema de {played} (jugada {n}) era deixar que el rival manés al centre sense disputar-lo.',
            'A la jugada {n} vas alliberar la tensió amb {played} quan et convenia mantenir-la.',
            'Amb {played} (jugada {n}) vas ocupar el centre per orgull, no per funció.',
            'A {n}, la ruptura {played} va arribar abans d’hora i el centre es va girar en contra.'
        ],
        plan: [
            'El pla humà era decidir la tensió central segons qui hi guanya en obrir-se; {best} encertava el moment.',
            'Calia preguntar si obrir el centre afavoria les teves peces o les del rival, com feia {best}.',
            'El bon pla era convertir espai en línies sense regalar caselles, just el que apuntava {best}.',
            'Primer ordenar peces, després trencar: {best} mantenia aquesta seqüència.',
            'El pla correcte era pressionar el centre amb peces i peons coordinats, com {best}.',
            'Volies activitat, però tocava resoldre la tensió a favor teu; {best} ho feia.'
        ],
        question: [
            'Si s’obre el centre ara, quines peces en surten beneficiades, les teves o les seves?',
            'Et convé mantenir la tensió central o resoldre-la? Per què?',
            'Aquesta jugada al centre millora les teves peces o només mou peons?',
            'Qui té el rei més segur si el centre s’obre?',
            'Estàs trencant el centre per una funció clara o per impaciència?',
            'Quina casella central et quedaria feble després d’aquest canvi?'
        ],
        objective: [
            'Abans de tocar el centre, decideix qui guanya si s’obre i actua en conseqüència.',
            'Mantén la tensió central mentre les teves peces estiguin pitjor coordinades que les del rival.',
            'Trenca al centre només quan tinguis una funció concreta per a les línies que s’obren.',
            'Relaciona cada jugada central amb la seguretat del teu rei.',
            'Abans d’una ruptura, compta com queden les caselles febles del teu camp.',
            'Disputa el centre amb peces i peons coordinats, no amb un sol cop aïllat.'
        ]
    },
    opening: {
        diagnosis: [
            'A la jugada {n} ({played}), el pla d’obertura es va desviar: desenvolupament, centre i rei segur havien de manar.',
            'A {n}, {played} va moure dues vegades la mateixa peça quan tocava treure’n una de nova.',
            'El problema de {played} (jugada {n}) era començar operacions laterals amb l’exèrcit encara a casa.',
            'A la jugada {n} vas descuidar el rei amb {played} en lloc d’enrocar a temps.',
            'Amb {played} (jugada {n}) vas perseguir material o amenaces menors abans de desenvolupar.',
            'A {n}, {played} va deixar el centre i el desenvolupament en mans del rival.'
        ],
        plan: [
            'El pla humà era completar desenvolupament i disputar el centre abans de res; {best} mantenia l’harmonia.',
            'Calia treure peces noves cap a caselles actives i enrocar aviat, com suggeria {best}.',
            'El bon pla era que cada jugada complís una funció d’obertura, just el que feia {best}.',
            'Primer desenvolupar amb tempo, després ambició; {best} guanyava temps fent una cosa útil.',
            'El pla correcte era assegurar el rei i connectar les torres, com apuntava {best}.',
            'Volies iniciativa, però tocava acabar el desplegament; {best} ho ordenava.'
        ],
        question: [
            'Aquesta jugada desenvolupa, controla el centre o protegeix el rei? Si no, què ho justifica?',
            'Quantes peces teves encara dormen a la primera fila?',
            'És el moment d’enrocar o hi ha una raó concreta per ajornar-ho?',
            'Estàs movent una peça nova o repetint amb una que ja havia jugat?',
            'El teu pla d’obertura té un rumb o vas reaccionant jugada a jugada?',
            'Quina és la teva peça pitjor desenvolupada i com la millores ara?'
        ],
        objective: [
            'Durant les 10 primeres jugades, demana que cada moviment compleixi una funció d’obertura clara.',
            'Treu totes les peces menors abans de llançar atacs o caçar peons.',
            'Enroca aviat tret que tinguis una raó concreta i calculada per no fer-ho.',
            'No moguis dues vegades la mateixa peça a l’obertura sense necessitat.',
            'Lluita pel centre amb peons i peces des del primer moment.',
            'Connecta les torres com a senyal que has acabat el desenvolupament.'
        ]
    },
    endgame: {
        diagnosis: [
            'A la jugada {n} ({played}), el final demanava activitat i precisió, no una decisió automàtica; vas perdre {swing} CP.',
            'A {n}, {played} va deixar el rei passiu quan tocava activar-lo.',
            'El problema de {played} (jugada {n}) era canviar peces sense millorar el teu final.',
            'A la jugada {n} vas oblidar el peó passat amb {played} en comptes d’impulsar-lo o frenar-lo.',
            'Amb {played} (jugada {n}) vas col·locar la torre passiva, lluny de l’acció.',
            'A {n}, {played} va empitjorar l’estructura just quan calia mantenir-la sana.'
        ],
        plan: [
            'El pla humà era activar el rei o la peça més passiva i triar canvis favorables; {best} conservava el marge.',
            'Calia posar la torre darrere del peó passat, com feia {best}.',
            'El bon pla era guanyar caselles abans que peons, just el que apuntava {best}.',
            'Primer activitat, després material: {best} portava la peça adormida a la feina.',
            'El pla correcte era simplificar cap a un final guanyat, com indicava {best}.',
            'Volies seguretat, però tocava avançar amb el rei; {best} ho aprofitava.'
        ],
        question: [
            'Quina és la teva peça menys activa i com la poses a treballar?',
            'El teu rei pot entrar en joc ara sense risc?',
            'Aquest canvi de peces acosta o allunya el final que vols?',
            'El peó passat (teu o del rival) està prou controlat?',
            'Quin bàndol té el rei més actiu en aquest final?',
            'La teva torre està darrere del peó passat o davant?'
        ],
        objective: [
            'En finals, ordena sempre: rei actiu, peons sans, torres darrere dels passats.',
            'Activa el rei tan aviat com els atacs perillosos hagin passat.',
            'Col·loca les torres darrere dels peons passats, els teus i els del rival.',
            'Abans de canviar peces en un final, comprova que el resultat et millora.',
            'Guanya espai i caselles clau abans de perseguir peons.',
            'Cuida l’estructura de peons: una debilitat al final pesa més que a l’inici.'
        ]
    },
    fork: {
        diagnosis: [
            'A la jugada {n} ({played}), vas passar per alt un doble atac (a favor o en contra) i el compte va caure {swing} CP.',
            'A {n}, {played} va deixar dues peces teves a l’abast d’un sol salt rival.',
            'El problema de {played} (jugada {n}) era no veure la casella des d’on una peça amenaça dues coses.',
            'A la jugada {n} tenies una forquilla a tocar i {played} la va deixar escapar.',
            'Amb {played} (jugada {n}) vas alinear peces valuoses de manera que un doble atac les castigava.',
            'A {n}, l’atenció en una amenaça va amagar el doble cop que permetia {played}.'
        ],
        plan: [
            'El pla humà era buscar quina peça pot amenaçar dos objectius alhora; {best} trobava el doble atac.',
            'Calia posar una amenaça que no es pugui respondre sencera, com feia {best}.',
            'El bon pla era col·locar el cavall o la dama on miri dos tresors, just el que apuntava {best}.',
            'Abans de moure, tocava revisar si les teves peces quedaven alineades per a una forquilla; {best} ho evitava.',
            'El pla correcte era crear doble pressió en lloc de pressió simple, com {best}.',
            'Volies guanyar una peça, però n’hi havia dues a tir amb {best}.'
        ],
        question: [
            'Hi ha una casella des d’on una peça teva ataqui dos objectius alhora?',
            'Les teves peces valuoses estan alineades de manera perillosa?',
            'Quina jugada planteja dues amenaces que el rival no pot parar juntes?',
            'El cavall rival té un salt que toqui rei i dama o rei i torre?',
            'Abans de capturar, has mirat si quedes exposat a un doble atac?',
            'Quina és la peça amb més capacitat de fer forquilla en aquesta posició?'
        ],
        objective: [
            'Abans de cada jugada, comprova si dues peces teves comparteixen una casella d’atac rival.',
            'Busca activament salts de cavall que amenacin dos objectius alhora.',
            'Evita alinear el rei i una peça pesant a l’abast de cavalls o dames rivals.',
            'Quan tinguis avantatge, busca dobles amenaces abans que captures simples.',
            'Revisa els escacs rivals que, de passada, guanyin una peça.',
            'Davant d’una peça forta enemiga, vigila les seves forquilles potencials.'
        ]
    },
    pin: {
        diagnosis: [
            'A la jugada {n} ({played}), vas ignorar una clavada (a favor o en contra) i la posició va caure {swing} CP.',
            'A {n}, {played} va descuidar una peça que estava lligada al rei o a la dama.',
            'El problema de {played} (jugada {n}) era no aprofitar una peça rival que no es podia moure.',
            'A la jugada {n} tenies pressió sobre una peça clavada i {played} la va deixar respirar.',
            'Amb {played} (jugada {n}) vas deixar clavada una peça defensora important.',
            'A {n}, vas tractar una peça lligada com si fos lliure, i {played} ho va pagar.'
        ],
        plan: [
            'El pla humà era acumular pressió sobre la peça clavada; {best} la castigava.',
            'Calia atacar allò que defensa per obligació i no es pot moure, com feia {best}.',
            'El bon pla era convertir la immobilitat en material futur, just el que apuntava {best}.',
            'Abans de res, tocava mantenir viva la línia de clavada; {best} no la trencava.',
            'El pla correcte era afegir un atacant sobre la peça lligada, com {best}.',
            'Volies activitat, però la clau era explotar la peça paralitzada amb {best}.'
        ],
        question: [
            'Hi ha alguna peça rival que no es pugui moure sense exposar el rei o la dama?',
            'Pots afegir pressió sobre una peça clavada en lloc de fer una altra cosa?',
            'Alguna peça teva està lligada i, per tant, només defensa de mentida?',
            'Trencaries una clavada útil amb aquesta jugada?',
            'Quina peça enemiga paga car estar clavada ara mateix?',
            'La peça que vols moure està realment lliure o sosté alguna cosa?'
        ],
        objective: [
            'Quan una peça rival estigui clavada, suma atacants abans de fer res més.',
            'No comptis amb una peça teva clavada com a defensora real.',
            'Busca clavades que immobilitzin peces enemigues clau.',
            'Abans de moure, comprova quines peces teves estan lligades al rei o a la dama.',
            'Aprofita les peces paralitzades: la immobilitat és material ajornat.',
            'Evita trencar una clavada teva favorable sense una raó clara.'
        ]
    },
    skewer: {
        diagnosis: [
            'A la jugada {n} ({played}), una enfilada (raig X) va canviar el compte i vas perdre {swing} CP.',
            'A {n}, {played} va alinear dues peces teves de gran valor en una mateixa línia.',
            'El problema de {played} (jugada {n}) era no veure que, en moure la peça gran, en queia una de valuosa al darrere.',
            'A la jugada {n} tenies una enfilada disponible i {played} la va desaprofitar.',
            'Amb {played} (jugada {n}) vas posar rei i dama (o dama i torre) en una recta perillosa.',
            'A {n}, la línia oberta amagava una enfilada que {played} no va tenir en compte.'
        ],
        plan: [
            'El pla humà era forçar la peça gran a moure’s per cobrar la de darrere; {best} ho aconseguia.',
            'Calia buscar alineacions enemigues en línies i diagonals, com feia {best}.',
            'El bon pla era pressionar la peça de davant per guanyar la del darrere, just el que apuntava {best}.',
            'Abans de res, tocava no exposar les teves peces grans en la mateixa recta; {best} ho feia.',
            'El pla correcte era usar una peça de llarg abast sobre la fila o columna clau, com {best}.',
            'Volies un atac directe, però l’enfilada de {best} guanyava material net.'
        ],
        question: [
            'Hi ha dues peces enemigues valuoses a la mateixa línia o diagonal?',
            'Si fas un escac en aquesta recta, què queda darrere del rei?',
            'Les teves peces grans estan alineades de manera que es puguin enfilar?',
            'Pots obligar una peça important a moure’s i descobrir-ne una altra?',
            'Quina peça de llarg abast crearia una enfilada aquí?',
            'Abans de posar el rei en aquesta columna, què hi ha al darrere?'
        ],
        objective: [
            'Busca alineacions de peces enemigues en files, columnes i diagonals.',
            'Evita posar dues peces teves valuoses en la mateixa recta oberta.',
            'Aprofita els escacs que, en moure el rei, et facin guanyar la peça del darrere.',
            'Activa les peces de llarg abast cap a línies amb objectius alineats.',
            'Abans de cada jugada, revisa les rectes obertes cap al teu rei i la teva dama.',
            'Quan tinguis una peça gran rival exposada, busca com enfilar-ne una de darrere.'
        ]
    },
    general: {
        diagnosis: [
            'A la jugada {n} ({played}), vas triar una acció abans de tenir clar el pla, i va costar {swing} CP.',
            'A {n}, {played} va respondre a un impuls i no a una valoració de la posició.',
            'El problema de {played} (jugada {n}) no era una sola línia: faltava un pla que connectés les peces.',
            'A la jugada {n} vas jugar de pressa amb {played} en un moment que demanava pensar.',
            'Amb {played} (jugada {n}) vas atendre el detall i vas perdre de vista el conjunt.',
            'A {n}, {played} va ser una jugada sense funció clara dins el pla general.'
        ],
        plan: [
            'El pla humà era comparar amenaces, millorar la peça pitjor situada i només després buscar tàctica; {best} ho ordenava.',
            'Calia identificar el pla abans de calcular variants, just el que apuntava {best}.',
            'El bon pla era fer la pregunta més difícil al rival, com feia {best}.',
            'Primer entendre la posició, després actuar; {best} triava la jugada amb més funció.',
            'El pla correcte era millorar la peça menys activa abans de res, com {best}.',
            'Volies una solució immediata, però tocava preparar-la; {best} guanyava amb mètode.'
        ],
        question: [
            'Quin és el pla en una frase abans de calcular cap variant?',
            'Quina és la teva peça pitjor situada i com la millores?',
            'Què vol fer el rival i com ho impedeixes amb la teva jugada?',
            'Aquesta jugada té una funció clara o és una reacció?',
            'Quina jugada deixa el rival amb menys respostes bones?',
            'Estàs resolent la causa del problema o només un símptoma?'
        ],
        objective: [
            'Atura’t un torn en cada moment crític i formula el pla abans de tocar peça.',
            'Abans de moure, identifica la teva pitjor peça i pensa com activar-la.',
            'Pregunta sempre què vol fer el rival abans de decidir la teva jugada.',
            'Tria jugades amb funció: defensa, millora o amenaça concreta.',
            'Davant del dubte, compara dos plans i queda’t amb el que deixa menys respostes al rival.',
            'Calcula una jugada més del que et demani l’instint abans de decidir.'
        ]
    }
};
const HUMANPLAN_RECENT_KEY = 'eltauler_recent_human_plans';
let _humanPlanRecent = null;
function ensureHumanPlanRecent() {
    if (_humanPlanRecent) return _humanPlanRecent;
    const stored = readJsonStorage(HUMANPLAN_RECENT_KEY, {});
    _humanPlanRecent = (stored && typeof stored === 'object') ? stored : {};
    return _humanPlanRecent;
}
function fillPlanTemplate(str, moment) {
    const m = moment || {};
    // Preferim la descripció en llenguatge planer (playedDesc/bestDesc) per evitar
    // notació algebraica dins de les frases; si no n'hi ha, caiem a la SAN.
    return String(str || '')
        .replace(/\{n\}/g, m.moveNumber ?? '?')
        .replace(/\{played\}/g, m.playedDesc || m.played || 'la jugada triada')
        .replace(/\{best\}/g, m.bestDesc || m.best || 'una jugada més precisa')
        .replace(/\{swing\}/g, m.swing ?? 0);
}
// Tria una variant evitant les usades recentment; l'historial es persisteix a
// localStorage, així no es repeteix ni entre partides ni entre sessions.
function pickFreshPlanLine(pool, bucket) {
    if (!Array.isArray(pool) || !pool.length) return '';
    if (pool.length === 1) return pool[0];
    const store = ensureHumanPlanRecent();
    const recent = Array.isArray(store[bucket]) ? store[bucket] : [];
    const fresh = pool.filter(x => !recent.includes(x));
    const choice = randItem(fresh.length ? fresh : pool);
    const keep = Math.max(1, Math.min(pool.length - 1, Math.ceil(pool.length / 2)));
    store[bucket] = [choice, ...recent.filter(x => x !== choice)].slice(0, keep);
    writeJsonStorage(HUMANPLAN_RECENT_KEY, store);
    return choice;
}
function toInlineAdvice(text) {
    const t = String(text || '').trim().replace(/[.…]+$/, '');
    return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}
function resolveHumanPlanThemeKey(moment) {
    let key = planBankKeyFor(moment && moment.themeKey);
    if (!key) {
        const label = String((moment && moment.theme) || '').toLowerCase();
        if (/rei|atac/.test(label)) key = 'king_attack';
        else if (/forquilla/.test(label)) key = 'fork';
        else if (/clavada/.test(label)) key = 'pin';
        else if (/raig|enfilad|broquet/.test(label)) key = 'skewer';
        else if (/peó passat|passat/.test(label)) key = 'passed_pawn';
        else if (/profilax|defens/.test(label)) key = 'defensive_move';
        else if (/simplif/.test(label)) key = 'simplification';
        else if (/activitat/.test(label)) key = 'piece_activity';
        else if (/tranquil|iniciativa/.test(label)) key = 'quiet_improvement';
        else if (/material/.test(label)) key = 'material';
        else if (/centre|ruptura/.test(label)) key = 'center';
        else if (/obertura|desenvolup/.test(label)) key = 'opening';
        else if (/final/.test(label)) key = 'endgame';
        else key = 'general';
    }
    const phase = moment && moment.phase;
    if (key === 'general') {
        if (phase === 'obertura') key = 'opening';
        else if (phase === 'final') key = 'endgame';
    }
    return HUMAN_PLAN_BANK[key] ? key : 'general';
}

// Subtema per gravetat: una frase d'entrada que dona to segons com de greu va ser
// l'error. No s'aplica sempre (≈65%) perquè no totes les targetes semblin iguals.
const HUMAN_PLAN_INTROS = {
    blunder: [
        'Aquest va ser el moment que va decidir la partida.',
        'Aquí es va escapar bona part de l’avantatge.',
        'Un error d’aquesta mida marca tot el que ve després.',
        'Si haguessis trobat el millor aquí, la partida canviava de color.'
    ],
    mistake: [
        'Aquí la partida va fer un gir evitable.',
        'Aquest error costa, però s’entén i es corregeix.',
        'Un pas en fals com aquest sol venir d’anar amb pressa.',
        'Va ser un d’aquells moments per parar i mirar bé.'
    ],
    inaccuracy: [
        'Un detall petit, però val la pena fixar-s’hi.',
        'No és greu, però polir-ho et fa pujar de nivell.',
        'Una imprecisió com aquesta es repeteix si no la nomenes.',
        'Petit relliscada: la mena de cosa que distingeix nivells.'
    ],
    any: [
        'Mirem-ho amb calma.',
        'Val la pena entendre què passava aquí.',
        'Aquí hi havia una lliçó concreta.',
        'Un moment per aprendre, no per lamentar.'
    ]
};
function buildPlanIntro(moment) {
    if (Math.random() > 0.65) return '';
    const sev = (moment && HUMAN_PLAN_INTROS[moment.quality]) ? moment.quality : 'any';
    const pool = HUMAN_PLAN_INTROS[sev].concat(HUMAN_PLAN_INTROS.any);
    return pickFreshPlanLine(pool, 'intro:' + sev);
}

// Amplia encara més els temes freqüents (a banda, per mantenir el bloc llegible).
// Els nous "objectius" també enriqueixen els jeroglífics via themeToPlainAdvice.
HUMAN_PLAN_BANK.general.diagnosis.push(
    'A {n}, {played} buscava activitat però no resolia la pregunta clau de la posició.',
    'El cost real de {played} (jugada {n}) no van ser {swing} CP, sinó jugar sense un pla clar.',
    'A la jugada {n}, {played} va deixar la iniciativa a l’aire en un moment delicat.'
);
HUMAN_PLAN_BANK.general.plan.push(
    'El pla humà era guanyar un tempo amb una millora real abans de complicar; {best} ho feia.',
    'Calia escollir un pla i seguir-lo dues o tres jugades, com permetia {best}.',
    'El bon pla era reduir les opcions del rival, no obrir-ne de noves; {best} hi anava.'
);
HUMAN_PLAN_BANK.general.question.push(
    'Quin pla seguiria el rival si et saltessis aquest torn?',
    'Aquesta jugada acosta alguna de les teves peces a una feina millor?',
    'Has comparat almenys dues jugades candidates abans de decidir?'
);
HUMAN_PLAN_BANK.general.objective.push(
    'Tria una jugada candidata, busca’n una de millor i compara-les abans de moure.',
    'Digues el pla en veu baixa abans de cada jugada important.',
    'Pregunta’t què empitjora la teva jugada abans de jugar-la.'
);
HUMAN_PLAN_BANK.king_attack.diagnosis.push(
    'A {n}, {played} va obrir el camí cap al teu rei sense compensació clara.',
    'El problema de {played} (jugada {n}) era atacar amb el propi rei encara per resoldre.'
);
HUMAN_PLAN_BANK.king_attack.plan.push(
    'El pla humà era portar la torre o la dama a la línia d’atac amb tempo; {best} hi apuntava.',
    'Calia obrir la columna just davant del rei rival, com preparava {best}.'
);
HUMAN_PLAN_BANK.king_attack.question.push(
    'Quantes peces teves participen de debò en l’atac al rei?',
    'L’atac avança amb amenaces o només amb desitjos?'
);
HUMAN_PLAN_BANK.king_attack.objective.push(
    'No iniciïs un atac al rei amb menys de tres peces implicades.',
    'Obre línies cap al rei rival abans de llançar-hi les peces.'
);
HUMAN_PLAN_BANK.material.diagnosis.push(
    'A {n}, {played} va prioritzar un peó per sobre de l’activitat de les peces.',
    'El problema de {played} (jugada {n}) era guanyar fusta i perdre temps i coordinació.'
);
HUMAN_PLAN_BANK.material.plan.push(
    'El pla humà era guanyar material mantenint la iniciativa, no a canvi d’ella; {best} ho equilibrava.',
    'Calia assegurar primer les teves peces penjades, com feia {best}.'
);
HUMAN_PLAN_BANK.material.question.push(
    'El material que guanyes compensa el temps que hi inverteixes?',
    'Tens alguna peça penjada que el rival pugui aprofitar primer?'
);
HUMAN_PLAN_BANK.material.objective.push(
    'Abans de guanyar un peó, comprova que no deixes cap peça teva sense defensa.',
    'No canviïs iniciativa per material tret que el guany sigui clar i durador.'
);
HUMAN_PLAN_BANK.center.diagnosis.push(
    'A {n}, {played} va definir l’estructura central abans de tenir-ne clar el benefici.',
    'El problema de {played} (jugada {n}) era jugar al centre sense pla per a les caselles que s’obrien.'
);
HUMAN_PLAN_BANK.center.plan.push(
    'El pla humà era guanyar el centre amb suport, no només ocupar-lo; {best} hi anava.',
    'Calia preparar la ruptura amb una peça més abans de fer-la, com {best}.'
);
HUMAN_PLAN_BANK.center.question.push(
    'Qui ocuparà les caselles que deixa lliures aquest canvi central?',
    'La teva estructura de peons et dona un pla clar després d’aquesta jugada?'
);
HUMAN_PLAN_BANK.center.objective.push(
    'Abans de fixar el centre, imagina l’estructura resultant i el teu pla en ella.',
    'No avancis peons centrals que deixin caselles febles sense vigilància.'
);
HUMAN_PLAN_BANK.endgame.diagnosis.push(
    'A {n}, {played} va tractar el final amb pressa quan tocava precisió.',
    'El problema de {played} (jugada {n}) era no donar feina a la peça més passiva del final.'
);
HUMAN_PLAN_BANK.endgame.plan.push(
    'El pla humà era millorar la peça pitjor situada abans de forçar res; {best} ho feia.',
    'Calia avançar el rei cap al centre del final, com indicava {best}.'
);
HUMAN_PLAN_BANK.endgame.question.push(
    'Quin és el pla guanyador en tres jugades, no només la jugada d’ara?',
    'El teu rei és un espectador o un protagonista d’aquest final?'
);
HUMAN_PLAN_BANK.endgame.objective.push(
    'En cada jugada de final, pregunta’t si pots millorar el rei o la peça més passiva.',
    'No precipitis els peons sense el suport del rei o d’una torre activa.'
);

// SUBTEMES REALS: pools dedicats per a idees que el classificador fi (inferHieroglyphicThemes)
// sap detectar a partir de la millor jugada. Així el pla és més precís, no només "general".
HUMAN_PLAN_BANK.passed_pawn = {
    diagnosis: [
        'A {n}, {played} va ignorar el peó passat, la peça que mana en aquest tipus de posició.',
        'El problema de {played} (jugada {n}) era no impulsar ni frenar el peó passat.',
        'A la jugada {n}, {played} va deixar que el peó passat marqués el ritme sense control ({swing} CP).',
        'Amb {played} (jugada {n}) vas perdre temps mentre el passat demanava acció.'
    ],
    plan: [
        'El pla humà era empènyer o blocar el peó passat segons a qui afavorís; {best} ho feia.',
        'Calia posar una peça darrere del peó passat per acompanyar-lo, com {best}.',
        'El bon pla era avançar el passat amb suport, just el que apuntava {best}.',
        'Primer neutralitzar el passat rival, després el teu: {best} respectava aquest ordre.'
    ],
    question: [
        'Qui té el peó passat més perillós i qui el controla?',
        'El teu peó passat avança amb suport o avança sol?',
        'Pots crear un peó passat amb aquesta jugada?',
        'Quina peça hauria d’acompanyar el peó passat ara mateix?'
    ],
    objective: [
        'Acompanya el peó passat amb el rei o una torre; no el deixis avançar sol.',
        'Bloca els peons passats del rival amb la peça menys valuosa possible.',
        'En posicions amb passat, pregunta’t primer qui corre més de pressa.',
        'Crea un peó passat només quan el puguis sostenir fins a coronar.'
    ]
};
HUMAN_PLAN_BANK.development = {
    diagnosis: [
        'A {n}, {played} va retardar el desenvolupament en lloc d’activar una peça nova.',
        'El problema de {played} (jugada {n}) era moure peces ja desenvolupades amb l’exèrcit a mig treure.',
        'A la jugada {n}, {played} va deixar peces dormides mentre el rival agafava espai.',
        'Amb {played} (jugada {n}) vas ajornar treure les peces menors sense una raó clara.'
    ],
    plan: [
        'El pla humà era activar la peça menys desenvolupada amb tempo; {best} hi anava.',
        'Calia treure una peça nova cap a una casella útil, com {best}.',
        'El bon pla era guanyar desenvolupament i preparar l’enroc, just el que feia {best}.',
        'Primer completar el desplegament, després buscar el cop: {best} ho ordenava.'
    ],
    question: [
        'Quina és la teva peça menys activa i com l’actives ara?',
        'Estàs traient una peça nova o repetint amb una de ja desenvolupada?',
        'Tens totes les peces menors en joc abans de complicar?',
        'Aquesta jugada acosta l’enroc o el retarda?'
    ],
    objective: [
        'Activa una peça nova cada jugada fins a completar el desenvolupament.',
        'No repeteixis moviments amb una peça ja desenvolupada sense necessitat.',
        'Desenvolupa cap a l’enroc: lliga desenvolupament i seguretat del rei.',
        'Compta les peces menors adormides abans de llançar cap atac.'
    ]
};
HUMAN_PLAN_BANK.defensive_move = {
    diagnosis: [
        'A {n}, {played} va atacar quan tocava aturar l’amenaça del rival; va costar {swing} CP.',
        'El problema de {played} (jugada {n}) era no veure el pla rival i no prevenir-lo.',
        'A la jugada {n}, {played} va ignorar una amenaça concreta del rival.',
        'Amb {played} (jugada {n}) vas seguir el teu pla sense preguntar-te què volia fer l’altre.'
    ],
    plan: [
        'El pla humà era prevenir la idea del rival sense quedar passiu (profilaxi); {best} ho feia.',
        'Calia aturar l’amenaça principal i conservar la iniciativa, com {best}.',
        'El bon pla era una jugada profilàctica que treia el verí a la posició, just {best}.',
        'Primer neutralitzar, després crear: {best} mantenia l’equilibri.'
    ],
    question: [
        'Què vol fer el rival la pròxima jugada i com ho prevens?',
        'Aquesta jugada atén l’amenaça més perillosa del rival?',
        'Pots aturar el pla rival sense quedar del tot a la defensiva?',
        'Quina seria la millor jugada del rival si et saltessis el torn?'
    ],
    objective: [
        'Abans de cada jugada, pregunta’t quin és el pla del rival i si cal prevenir-lo.',
        'Practica la profilaxi: dedica una jugada a treure el verí abans d’atacar.',
        'No segueixis el teu pla a cegues si el rival amenaça alguna cosa concreta.',
        'Atura l’amenaça més greu conservant tanta iniciativa com puguis.'
    ]
};
HUMAN_PLAN_BANK.simplification = {
    diagnosis: [
        'A {n}, {played} va complicar quan simplificar et donava un final millor.',
        'El problema de {played} (jugada {n}) era evitar canvis que t’afavorien.',
        'A la jugada {n}, {played} va mantenir peces que ajudaven el rival.',
        'Amb {played} (jugada {n}) vas deixar passar una simplificació guanyadora ({swing} CP).'
    ],
    plan: [
        'El pla humà era canviar cap a un final favorable; {best} hi portava.',
        'Calia treure les peces atacants del rival amb canvis, com {best}.',
        'El bon pla era simplificar conservant l’avantatge, just el que feia {best}.',
        'Amb avantatge, menys peces i més claredat: {best} ho aplicava.'
    ],
    question: [
        'Quin canvi de peces et porta a un final més fàcil de guanyar?',
        'Quina peça rival t’interessa eliminar amb un canvi?',
        'Simplificar aquí t’acosta o t’allunya del resultat que vols?',
        'Tens avantatge per buscar canvis o et convé mantenir la tensió?'
    ],
    objective: [
        'Amb avantatge, busca canvis que et portin a un final clar.',
        'Elimina la peça més activa del rival quan puguis fer-ho sense perdre res.',
        'No canviïs peces si això allibera la posició del rival sense compensació.',
        'Relaciona cada canvi amb el final que vols assolir.'
    ]
};
HUMAN_PLAN_BANK.piece_activity = {
    diagnosis: [
        'A {n}, {played} va deixar una peça passiva quan tenia una casella molt millor.',
        'El problema de {played} (jugada {n}) era no donar feina a la peça pitjor situada.',
        'A la jugada {n}, {played} va mantenir una peça muda fora de joc.',
        'Amb {played} (jugada {n}) vas perdre l’oportunitat d’activar una peça clau.'
    ],
    plan: [
        'El pla humà era portar la peça més passiva a una línia oberta o un bon lloc; {best} ho feia.',
        'Calia canviar una peça muda per una d’activa, com {best}.',
        'El bon pla era millorar la pitjor peça abans de res, just el que apuntava {best}.',
        'Activitat abans que material: {best} donava feina a la peça adormida.'
    ],
    question: [
        'Quina és la teva peça menys activa i quina seria la seva millor casella?',
        'Tens alguna torre que pugui ocupar una columna oberta?',
        'Aquesta jugada millora una peça o només mou per moure?',
        'Quin alfil o cavall teu treballa menys i com el desperta?'
    ],
    objective: [
        'Cada jugada tranquil·la, millora la peça pitjor situada.',
        'Porta les torres a columnes obertes o semiobertes.',
        'Busca caselles avançades i segures per als cavalls.',
        'Abans de cap atac, comprova que totes les peces participen.'
    ]
};
HUMAN_PLAN_BANK.quiet_improvement = {
    diagnosis: [
        'A {n}, {played} va buscar foc immediat quan tocava una millora tranquil·la.',
        'El problema de {played} (jugada {n}) era forçar abans de millorar la posició.',
        'A la jugada {n}, {played} va deixar escapar la iniciativa per impaciència.',
        'Amb {played} (jugada {n}) vas jugar de pressa quan una jugada de preparació guanyava ({swing} CP).'
    ],
    plan: [
        'El pla humà era millorar amb una jugada tranquil·la que augmentés la pressió; {best} ho feia.',
        'Calia preparar el cop abans de donar-lo, com {best}.',
        'El bon pla era mantenir la iniciativa sense donar contrajoc, just {best}.',
        'Una jugada útil i sense pressa abans del foc: {best} la trobava.'
    ],
    question: [
        'Hi ha una jugada tranquil·la que millori la teva posició sense donar contrajoc?',
        'Estàs forçant abans d’hora o has preparat prou el cop?',
        'Com augmentes la pressió sense alliberar la posició del rival?',
        'Quina millora discreta deixa el rival sense bones respostes?'
    ],
    objective: [
        'Abans de forçar, busca una jugada tranquil·la que millori la teva posició.',
        'Mantén la iniciativa amenaçant sense regalar contrajoc.',
        'Prepara el cop amb una jugada útil abans de calcular combinacions.',
        'Davant del dubte, millora una peça i deixa la pressió al rival.'
    ]
};

// Alies de tema fi (HIEROS) -> clau de banc, per als que no tenen pool propi.
const PLAN_BANK_ALIAS = { center_break: 'center', material_win: 'material', endgame_activity: 'endgame', default: 'general' };
function planBankKeyFor(themeKey) {
    const k = String(themeKey || '');
    if (HUMAN_PLAN_BANK[k]) return k;
    if (PLAN_BANK_ALIAS[k] && HUMAN_PLAN_BANK[PLAN_BANK_ALIAS[k]]) return PLAN_BANK_ALIAS[k];
    return null;
}
const PLAN_THEME_LABELS = {
    passed_pawn: 'peó passat', development: 'desenvolupament', defensive_move: 'profilaxi',
    simplification: 'simplificació', piece_activity: 'activitat de peces', quiet_improvement: 'millora tranquil·la',
    center_break: 'ruptura central', material_win: 'guany de material', endgame_activity: 'final actiu', default: 'joc general'
};
function planThemeDisplayLabel(themeKey) {
    return PLAN_THEME_LABELS[themeKey] || getThemeLabel(themeKey);
}

// Amplia el vocabulari críptic dels jeroglífics generals (es comparteix entre tots els temes).
HIEROS.openings.push(
    'On la calma sembla absoluta', 'Quan el corrent canvia de sentit', 'El compàs assenyala un nord fals',
    'Sota el pes d’una columna oberta', 'La diagonal recorda un deute', 'On dues debilitats es donen la mà',
    'El tauler ofereix un mirall', 'La peça muda demana torn', 'Quan el rei dorm massa tranquil',
    'L’estructura xiuxiueja una esquerda', 'El centre conté una pregunta', 'La rereguarda amaga una porta',
    'Quan el material enganya', 'El temps pesa més que la fusta'
);
HIEROS.closings.push(
    'el ritme val més que la fusta', 'pregunta’t qui mou en el silenci', 'transforma la tensió en una sola pregunta',
    'deixa que el rival trobi el seu propi laberint', 'la casella feble és una invitació: accepta-la amb ordre',
    'no confonguis activitat amb soroll', 'qui controla la línia controla el temps', 'el pla curt sovint és el més llarg',
    'una peça ben posada en val dues d’inquietes', 'mou la causa i el símptoma caurà sol', 'la profilaxi és atac avançat',
    'compta dues vegades abans de celebrar', 'el rei actiu al final és una peça més'
);
HIEROS.verbs.push('aïlla', 'condueix', 'subjecta', 'allibera', 'recondueix', 'serena', 'precipita', 'enverina');
HIEROS.images.push('agulla d’or', 'mirall trencat', 'corda fluixa', 'far llunyà', 'rellotge de sorra', 'paret mestra', 'cadenat antic', 'brúixola torta');

let hieroglyphicContext = null;
let hieroglyphicExpectedUci = null;
let hieroglyphicSource = 'opening';
let hieroglyphicStats = { solved: 0, personalSolved: 0, currentStreak: 0, bestStreak: 0, themes: {}, solvedFens: [] };

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function randItem(list) { return list[Math.floor(Math.random() * list.length)]; }
function readJsonStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed ?? fallback;
    } catch (e) { return fallback; }
}
function writeJsonStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
function loadHieroglyphicRecent() {
    const recent = readJsonStorage(HIEROLAST_KEY, []);
    return Array.isArray(recent) ? recent : [];
}
function rememberHieroglyphicClue(entry) {
    const recent = loadHieroglyphicRecent();
    recent.unshift({ ...entry, ts: Date.now() });
    writeJsonStorage(HIEROLAST_KEY, recent.slice(0, 30));
}
function getRecentHieroglyphicMeta() {
    const recent = loadHieroglyphicRecent();
    return {
        texts: recent.map(r => r.text).filter(Boolean),
        structures: recent.map(r => r.structure).filter(Boolean),
        voices: recent.map(r => r.voice).filter(Boolean)
    };
}
function loadHieroglyphicStats() {
    const stored = readJsonStorage(HIERO_STATS_KEY, null);
    if (stored && typeof stored === 'object') hieroglyphicStats = Object.assign(hieroglyphicStats, stored);
}
function saveHieroglyphicStats() {
    writeJsonStorage(HIERO_STATS_KEY, hieroglyphicStats);
}
function sanitizeHieroglyphicText(text, context = {}, opts = {}) {
    let clean = String(text || '').replace(/\s+/g, ' ').trim();
    const forbidden = [context.bestMove, context.bestMoveSan, context.from, context.to, context.playerMove].filter(Boolean);
    forbidden.forEach(token => {
        clean = clean.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'el signe');
    });
    clean = clean.replace(/\b[a-h][1-8]\b/gi, 'una casella');
    if (opts.hidePiece && context.movingPiece) {
        const name = HIEROS.pieces[context.movingPiece];
        if (name) clean = clean.replace(new RegExp(`\\b${name}\\b`, 'gi'), 'peça');
    }
    if (clean.length > 230) clean = clean.slice(0, 227).replace(/[,;:]?\s+\S*$/, '…');
    return clean;
}
function fenPieceStats(fen) {
    const boardFen = (fen || '').split(' ')[0] || '';
    const stats = { pieces: 0, material: { w: 0, b: 0 }, pawns: { w: [], b: [] }, board: {} };
    const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    const rows = boardFen.split('/');
    for (let r = 0; r < rows.length; r++) {
        let file = 0;
        for (const ch of rows[r]) {
            if (/\d/.test(ch)) { file += parseInt(ch, 10); continue; }
            const color = ch === ch.toUpperCase() ? 'w' : 'b';
            const piece = ch.toLowerCase();
            const sq = String.fromCharCode(97 + file) + (8 - r);
            stats.pieces++;
            stats.material[color] += values[piece] || 0;
            stats.board[sq] = { type: piece, color };
            if (piece === 'p') stats.pawns[color].push(sq);
            file++;
        }
    }
    return stats;
}
function squareFileIdx(sq) { return sq ? sq.charCodeAt(0) - 97 : 0; }
function squareRankIdx(sq) { return sq ? parseInt(sq[1], 10) : 1; }
function classifyBoardSector(square) {
    const file = squareFileIdx(square);
    const rank = squareRankIdx(square);
    if (rank <= 2 || rank >= 7) return 'back';
    if (rank <= 2.5 || rank >= 6.5) return 'promotion';
    if (file >= 2 && file <= 5) return 'center';
    return file < 3 ? 'queenside' : 'kingside';
}
function getOpenFilesFromStats(stats) {
    const pawnFiles = new Set([...stats.pawns.w, ...stats.pawns.b].map(sq => sq[0]));
    return 'abcdefgh'.split('').filter(f => !pawnFiles.has(f));
}
function estimateCenterTension(chess, stats) {
    const center = ['d4', 'e4', 'd5', 'e5'];
    let tension = center.filter(sq => stats.board[sq]).length;
    try {
        tension += chess.moves({ verbose: true }).filter(m => center.includes(m.to) || center.includes(m.from) || m.captured).length * 0.25;
    } catch (e) {}
    return Math.min(10, Math.round(tension * 10) / 10);
}
function estimateKingSafety(fen, stats) {
    const result = { w: { exposed: false, shield: 0 }, b: { exposed: false, shield: 0 } };
    ['w', 'b'].forEach(color => {
        const kingSq = Object.keys(stats.board).find(sq => stats.board[sq].type === 'k' && stats.board[sq].color === color);
        if (!kingSq) return;
        const kFile = squareFileIdx(kingSq);
        const kRank = squareRankIdx(kingSq);
        const forward = color === 'w' ? 1 : -1;
        let shield = 0;
        for (let df = -1; df <= 1; df++) {
            const f = kFile + df;
            const r = kRank + forward;
            if (f < 0 || f > 7 || r < 1 || r > 8) continue;
            const sq = String.fromCharCode(97 + f) + r;
            const p = stats.board[sq];
            if (p && p.type === 'p' && p.color === color) shield++;
        }
        result[color] = { exposed: shield <= 1, shield };
    });
    return result;
}
function makeMoveOnFen(fen, moveText) {
    const chess = new Chess(fen);
    if (!moveText) return { chess, move: null, uci: null, san: null };
    let move = null;
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(moveText)) {
        move = chess.move({ from: moveText.slice(0, 2), to: moveText.slice(2, 4), promotion: moveText.length > 4 ? moveText[4] : 'q' });
    }
    if (!move) move = chess.move(moveText, { sloppy: true });
    const uci = move ? `${move.from}${move.to}${move.promotion || ''}` : null;
    return { chess, move, uci, san: move ? move.san : null };
}
function analyzeMoveConsequences(fen, bestMove, pv = []) {
    const before = new Chess(fen);
    const applied = makeMoveOnFen(fen, bestMove);
    const after = applied.chess;
    const move = applied.move;
    const pvChecks = [];
    const pvCaptures = [];
    try {
        const pvGame = new Chess(fen);
        (pv || []).slice(0, 8).forEach(uci => {
            const m = /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)
                ? pvGame.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : 'q' })
                : pvGame.move(uci, { sloppy: true });
            if (m) {
                if (m.san.includes('+') || m.san.includes('#')) pvChecks.push(m.san);
                if (m.captured) pvCaptures.push(m.san);
            }
        });
    } catch (e) {}
    return { before, after, move, uci: applied.uci, san: applied.san, pvChecks, pvCaptures };
}
function detectKingPressure(fen, bestMove, pv = []) {
    const c = analyzeMoveConsequences(fen, bestMove, pv);
    if (!c.move) return { score: 0, motifs: [] };
    const motifs = [];
    if ((c.move.san || '').includes('+') || (c.move.san || '').includes('#')) motifs.push('check');
    if (c.pvChecks.length >= 2) motifs.push('repeated_checks');
    const stats = fenPieceStats(c.after.fen());
    const safety = estimateKingSafety(c.after.fen(), stats);
    const target = c.move.color === 'w' ? 'b' : 'w';
    if (safety[target]?.exposed) motifs.push('exposed_king');
    return { score: motifs.length, motifs };
}
function detectMaterialIdea(fen, bestMove, pv = []) {
    const c = analyzeMoveConsequences(fen, bestMove, pv);
    if (!c.move) return { score: 0, motifs: [] };
    const motifs = [];
    if (c.move.captured) motifs.push('capture');
    if (c.pvCaptures.length >= 2) motifs.push('sequence_captures');
    const loss = immediateMaterialLoss(c.uci || bestMove, new Chess(fen));
    if (c.move.captured && loss <= 1) motifs.push('safe_capture');
    return { score: motifs.length, motifs };
}
function detectCenterIdea(fen, bestMove) {
    const c = analyzeMoveConsequences(fen, bestMove, []);
    if (!c.move) return { score: 0, motifs: [] };
    const centerBreaks = ['c4', 'd4', 'e4', 'f4', 'c5', 'd5', 'e5', 'f5'];
    const motifs = [];
    if (centerBreaks.includes(c.move.to) && c.move.piece === 'p') motifs.push('center_break');
    if (['d4', 'e4', 'd5', 'e5'].includes(c.move.to)) motifs.push('center_occupation');
    return { score: motifs.length, motifs };
}
function detectPieceActivityIdea(fen, bestMove) {
    const c = analyzeMoveConsequences(fen, bestMove, []);
    if (!c.move) return { score: 0, motifs: [] };
    const motifs = [];
    const moveNo = Number((fen || '').split(' ')[5] || 1);
    if (moveNo <= 10 && ['n', 'b'].includes(c.move.piece)) motifs.push('development');
    if (c.move.flags && (c.move.flags.includes('k') || c.move.flags.includes('q'))) motifs.push('castle');
    const openFiles = getOpenFilesFromStats(fenPieceStats(fen));
    if (c.move.piece === 'r' && openFiles.includes(c.move.to[0])) motifs.push('rook_open_file');
    return { score: motifs.length, motifs };
}
function detectEndgameIdea(fen, bestMove) {
    const stats = fenPieceStats(fen);
    const c = analyzeMoveConsequences(fen, bestMove, []);
    if (!c.move) return { score: 0, motifs: [] };
    const motifs = [];
    if (stats.pieces <= 12 && c.move.piece === 'k') motifs.push('king_activity');
    if (stats.pieces <= 14 && c.move.piece === 'p') motifs.push('pawn_race');
    if (stats.pieces <= 10) motifs.push('endgame_precision');
    return { score: motifs.length, motifs };
}
function attacksFrom(board, from, piece, color) {
    const file = squareFileIdx(from), rank = squareRankIdx(from);
    const enemy = color === 'w' ? 'b' : 'w';
    const hits = [];
    const add = (f, r) => {
        if (f < 0 || f > 7 || r < 1 || r > 8) return false;
        const sq = String.fromCharCode(97 + f) + r;
        const target = board[sq];
        if (target && target.color === enemy) hits.push({ square: sq, piece: target.type });
        return !target;
    };
    const slide = dirs => dirs.forEach(([df, dr]) => { for (let f = file + df, r = rank + dr; f >= 0 && f <= 7 && r >= 1 && r <= 8; f += df, r += dr) { if (!add(f, r)) break; } });
    if (piece === 'n') [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(([df,dr]) => add(file+df, rank+dr));
    else if (piece === 'b') slide([[1,1],[-1,1],[1,-1],[-1,-1]]);
    else if (piece === 'r') slide([[1,0],[-1,0],[0,1],[0,-1]]);
    else if (piece === 'q') slide([[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]);
    else if (piece === 'p') [[-1, color === 'w' ? 1 : -1], [1, color === 'w' ? 1 : -1]].forEach(([df,dr]) => add(file+df, rank+dr));
    else if (piece === 'k') [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]].forEach(([df,dr]) => add(file+df, rank+dr));
    return hits;
}
function detectTacticalShapes(context) {
    const motifs = [];
    if (!context.moveAfterFen || !context.to || !context.movingPiece) return motifs;
    const stats = fenPieceStats(context.moveAfterFen);
    const color = context.sideToMove;
    const hits = attacksFrom(stats.board, context.to, context.movingPiece, color);
    const valuableHits = hits.filter(h => (PIECE_VALUE[h.piece] || 0) >= 3);
    if (valuableHits.length >= 2) motifs.push('fork');
    if (['b', 'r', 'q'].includes(context.movingPiece) && valuableHits.some(h => h.piece === 'k' || h.piece === 'q' || h.piece === 'r')) {
        motifs.push(context.isCheck ? 'skewer' : 'pin');
    }
    return motifs;
}
// TIER 2 — detectors heurístics addicionals (sense LLM) per afinar el subtema.
function onlyKingsAndPawns(stats) {
    for (const sq in stats.board) {
        const t = stats.board[sq].type;
        if (t !== 'k' && t !== 'p') return false;
    }
    return true;
}
function canBeHitByEnemyPawn(stats, square, myColor) {
    const f = squareFileIdx(square), r = squareRankIdx(square);
    const enemy = myColor === 'w' ? 'b' : 'w';
    const enemyPawns = (stats.pawns && stats.pawns[enemy]) || [];
    for (const ps of enemyPawns) {
        if (Math.abs(squareFileIdx(ps) - f) !== 1) continue;
        const pr = squareRankIdx(ps);
        if (myColor === 'w' && pr > r) return true;   // peó negre per sobre pot baixar a atacar
        if (myColor === 'b' && pr < r) return true;   // peó blanc per sota pot pujar a atacar
    }
    return false;
}
function backRankTrapped(board, kingColor) {
    let kSq = null;
    for (const sq in board) { if (board[sq].type === 'k' && board[sq].color === kingColor) { kSq = sq; break; } }
    if (!kSq) return false;
    const r = squareRankIdx(kSq), f = squareFileIdx(kSq);
    if (r !== (kingColor === 'w' ? 1 : 8)) return false;
    const fwd = kingColor === 'w' ? 1 : -1;
    for (const df of [-1, 0, 1]) {
        const nf = f + df, nr = r + fwd;
        if (nf < 0 || nf > 7 || nr < 1 || nr > 8) continue;
        const occ = board[String.fromCharCode(97 + nf) + nr];
        if (!occ || occ.color !== kingColor) return false; // hi ha sortida (casella lliure o de l'enemic)
    }
    return true; // les tres caselles de davant bloquejades per peces pròpies
}
function detectAdvancedMotifs(context) {
    const tags = [], notes = [];
    try {
        if (!context.moveAfterFen) return { tags, notes };
        const stats = fenPieceStats(context.moveAfterFen);
        const me = context.sideToMove, opp = me === 'w' ? 'b' : 'w';

        // Material net (peça penjada) — reaprofita la detecció de captura segura.
        if (context.materialIdea && Array.isArray(context.materialIdea.motifs) && context.materialIdea.motifs.includes('safe_capture')) {
            tags.push('free_material'); notes.push('guanyaves material net');
        }
        // Avantpost de cavall: cap peó enemic el pot atacar.
        if (context.movingPiece === 'n' && context.to) {
            const r = squareRankIdx(context.to);
            const advanced = me === 'w' ? r >= 4 : r <= 5;
            if (advanced && !canBeHitByEnemyPawn(stats, context.to, me)) {
                tags.push('outpost'); notes.push(`tenies un avantpost per al cavall a ${context.to}`);
            }
        }
        // Debilitat de última fila: rei enemic al fons sense escapatòria i jugada amb escac.
        if ((context.isCheck || context.isMate) && backRankTrapped(stats.board, opp)) {
            tags.push('back_rank'); notes.push('hi havia debilitat a la última fila');
        }
        // Final de reis i peons: oposició i tempos.
        if (onlyKingsAndPawns(stats)) {
            tags.push('kp_endgame');
            notes.push(context.movingPiece === 'k' ? 'en un final de reis i peons, l’oposició decideix' : 'final de reis i peons: compta bé els tempos');
        }
    } catch (e) {}
    return { tags, notes };
}
function inferHieroglyphicThemes(context) {
    const themes = [];
    const add = t => { if (t && !themes.includes(t)) themes.push(t); };
    const adv = context.advancedMotifs || [];
    const meExposed = !!(context.kingSafety && context.kingSafety[context.sideToMove] && context.kingSafety[context.sideToMove].exposed);
    (context.tacticalMotifs || []).forEach(add);
    if (adv.includes('back_rank')) add('king_attack');
    if (context.isMate || context.isCheck || context.kingPressure?.score > 0) add('king_attack');
    // Atacat vs atacant: si el meu rei està exposat i la jugada és tranquil·la, és defensa.
    if (meExposed && !context.isCheck && !context.isCapture) add('defensive_move');
    if (adv.includes('free_material')) add('material_win');
    if (context.materialIdea?.score > 0 || context.isCapture) add('material_win');
    if (context.centerIdea?.motifs?.length) add('center_break');
    if (adv.includes('outpost')) add('piece_activity');
    if (context.activityIdea?.motifs?.includes('development')) add('development');
    if (context.activityIdea?.motifs?.includes('rook_open_file')) add('piece_activity');
    if (adv.includes('kp_endgame')) add('endgame_activity');
    if (context.endgameIdea?.score > 0) add('endgame_activity');
    if (context.isPromotion || context.strategicMotifs?.includes('passed_pawn')) add('passed_pawn');
    if (context.swing >= 250 && context.playerMove) add('defensive_move');
    if (!themes.length && context.phaseScore > 0.68) add('endgame_activity');
    if (!themes.length) add('quiet_improvement');
    context.subthemes = themes.slice(1, 6);
    context.theme = themes[0];
    return context;
}
function buildHieroglyphicContext(fen, bestMove, options = {}) {
    const chess = new Chess(fen);
    const stats = fenPieceStats(fen);
    const moveNumber = Number((fen || '').split(' ')[5] || 1);
    const sideToMove = chess.turn();
    const pv = Array.isArray(options.pv) ? options.pv : (Array.isArray(options.bestMovePv) ? options.bestMovePv : []);
    const consequences = analyzeMoveConsequences(fen, bestMove, pv);
    const move = consequences.move;
    const materialBalance = stats.material.w - stats.material.b;
    const phaseScore = clamp01((moveNumber / 45) * 0.42 + ((32 - stats.pieces) / 26) * 0.58);
    const phaseLabel = phaseScore < 0.28 ? 'desplegament' : (phaseScore < 0.66 ? 'lluita densa' : 'conversió');
    const context = {
        fen,
        bestMove,
        bestMoveSan: consequences.san,
        bestMoveUci: consequences.uci,
        playerMove: options.playerMove || null,
        pv,
        alternatives: options.alternatives || [],
        evalBefore: options.evalBefore ?? null,
        evalAfter: options.evalAfter ?? null,
        swing: options.swing || 0,
        moveNumber,
        phaseScore,
        phaseLabel,
        sideToMove,
        movingPiece: move ? move.piece : null,
        from: move ? move.from : null,
        to: move ? move.to : null,
        isCapture: move ? !!move.captured : false,
        capturedPiece: move ? (move.captured || null) : null,
        isCheck: move ? (move.san.includes('+') || move.san.includes('#')) : false,
        isMate: move ? move.san.includes('#') : false,
        isPromotion: move ? !!move.promotion : false,
        isCastle: move ? (move.flags && (move.flags.includes('k') || move.flags.includes('q'))) : false,
        isEnPassant: move ? (move.flags && move.flags.includes('e')) : false,
        givesThreat: !!(pv && pv.length > 1),
        theme: 'quiet_improvement',
        subthemes: [],
        materialBalance,
        kingSafety: estimateKingSafety(fen, stats),
        centerTension: estimateCenterTension(chess, stats),
        openFiles: getOpenFilesFromStats(stats),
        diagonals: [],
        weakSquares: [],
        tacticalMotifs: [],
        strategicMotifs: [],
        urgency: options.swing >= 600 ? 'critical' : (options.swing >= 200 ? 'high' : (options.swing >= 80 ? 'medium' : 'low')),
        difficulty: options.swing >= 600 ? 3 : (options.swing >= 200 ? 2 : 1),
        opening: options.opening || null,
        source: options.source || 'opening',
        sector: move ? classifyBoardSector(move.to) : 'center',
        moveAfterFen: consequences.after ? consequences.after.fen() : null
    };
    context.kingPressure = detectKingPressure(fen, bestMove, pv);
    context.materialIdea = detectMaterialIdea(fen, bestMove, pv);
    context.centerIdea = detectCenterIdea(fen, bestMove, pv);
    context.activityIdea = detectPieceActivityIdea(fen, bestMove, pv);
    context.endgameIdea = detectEndgameIdea(fen, bestMove, pv);
    context.tacticalMotifs = detectTacticalShapes(context);
    if (context.isPromotion || (context.movingPiece === 'p' && (squareRankIdx(context.to) >= 7 || squareRankIdx(context.to) <= 2))) context.strategicMotifs.push('passed_pawn');
    const advMotifs = detectAdvancedMotifs(context);
    context.advancedMotifs = advMotifs.tags;
    context.motifNotes = advMotifs.notes;
    return inferHieroglyphicThemes(context);
}
function pickHieroglyphicVoice() {
    const recent = getRecentHieroglyphicMeta();
    for (let i = 0; i < 8; i++) {
        const voice = randItem(HIEROS.voices);
        const lastTwo = recent.voices.slice(0, 2);
        if (!(lastTwo.length === 2 && lastTwo.every(v => v === voice.id))) return voice;
    }
    return randItem(HIEROS.voices);
}
const HIEROS_STRUCTURES = [
    (p) => `${p.opening}, ${p.metaphor} ${p.verb} la ${p.sector}: ${p.advice}.`,
    (p) => `${p.opening}: no miris ${p.decoy}; mira ${p.image}. ${p.closing}.`,
    (p) => `${p.voiceName} diria que ${p.metaphor} pesa més que ${p.decoy}; ${p.advice}.`,
    (p) => `Quan ${p.metaphor} apareix a la ${p.sector}, ${p.closing}.`,
    (p) => `${p.opening}, la ${p.sector} demana ${p.image}; ${p.warning}.`,
    (p) => `El signe és ${p.metaphor}: ${p.advice}, i deixa que el rival carregui el pes.`,
    (p) => `No és una caça de material; és ${p.image} sobre la ${p.sector}. ${p.closing}.`,
    (p) => `${p.opening}, ${p.pieceHint} ha de servir la idea, no lluir-se: ${p.advice}.`,
    (p) => `Si la balança sembla quieta, escolta ${p.metaphor}; ${p.closing}.`,
    (p) => `${p.warning}; abans, ${p.advice} a la ${p.sector}.`,
    (p) => `La PV xiuxiueja ${p.metaphor}; transforma la tensió en una pregunta forçada.`,
    (p) => `${p.opening}: ${p.image} no revela la casella, però sí la funció — ${p.closing}.`,
    (p) => `${p.opening}: la clau no és ${p.decoy}, sinó ${p.image} sobre la ${p.sector}. ${p.closing}.`,
    (p) => `${p.voiceName} recordaria que ${p.warning}; per això, ${p.advice}.`,
    (p) => `On sembla que cal pressa, ${p.metaphor} demana ordre: ${p.advice}.`,
    (p) => `${p.opening}, ${p.verb} la ${p.sector} i ${p.closing}.`,
    (p) => `El signe amaga ${p.metaphor}; ${p.pieceHint} l’ha de servir, no lluir-s’hi. ${p.closing}.`,
    (p) => `Llegeix la posició com ${p.image}: ${p.advice}, i deixa que el temps treballi per tu.`
];
function generateDynamicHieroglyphicClue(context, opts = {}) {
    const level = opts.level || 1;
    const hidePiece = opts.hidePiece ?? (level === 1);
    const themePack = HIEROS.themes[context.theme] || HIEROS.themes.default;
    const voice = opts.voice || pickHieroglyphicVoice();
    const recent = getRecentHieroglyphicMeta();
    let text = '';
    let structureIdx = 0;
    for (let attempt = 0; attempt < 18; attempt++) {
        structureIdx = Math.floor(Math.random() * HIEROS_STRUCTURES.length);
        if (recent.structures[0] === String(structureIdx) && attempt < 8) continue;
        const pieceName = context.movingPiece ? HIEROS.pieces[context.movingPiece] : 'peça';
        const params = {
            opening: randItem(HIEROS.openings),
            closing: randItem(HIEROS.closings),
            verb: randItem(HIEROS.verbs),
            image: randItem(HIEROS.images),
            metaphor: randItem(themePack.metaphors || HIEROS.themes.default.metaphors),
            advice: level >= 3 ? themeToPlainAdvice(context) : randItem(themePack.advice || HIEROS.themes.default.advice),
            warning: randItem(themePack.warnings || HIEROS.themes.default.warnings),
            sector: HIEROS.sectors[context.sector] || HIEROS.sectors.center,
            decoy: context.isCapture ? 'l’or immediat' : (context.centerTension > 4 ? 'el soroll del centre' : 'la primera aparença'),
            pieceHint: hidePiece ? 'la peça adequada' : `el ${pieceName}`,
            voiceName: voice.name
        };
        text = sanitizeHieroglyphicText(HIEROS_STRUCTURES[structureIdx](params), context, { hidePiece });
        if (!recent.texts.includes(text)) break;
    }
    rememberHieroglyphicClue({ text, structure: String(structureIdx), voice: voice.id, theme: context.theme, level });
    return text;
}
function themeToPlainAdvice(context) {
    const map = {
        king_attack: 'busca un escac o una amenaça que obligui la defensa',
        fork: 'hi ha doble atac sobre peces valuoses',
        pin: 'aprofita una peça que no es pot moure lliurement',
        skewer: 'la línia recta força una peça gran a descobrir-ne una altra',
        center_break: 'la ruptura central canvia la posició a favor teu',
        development: 'desenvolupa amb tempo i control',
        material_win: 'el material cau si primer controles la recaptura',
        passed_pawn: 'el peó avançat necessita suport i ritme',
        defensive_move: 'atura l’amenaça principal sense quedar passiu',
        endgame_activity: 'activa el rei o la torre abans de comptar peons',
        piece_activity: 'porta la peça a una línia oberta o una millor funció',
        quiet_improvement: 'la jugada tranquil·la crea una amenaça més forta'
    };
    // Incorpora el banc de plans humans: ara que hi ha pools per subtema (passed_pawn,
    // defensive_move, piece_activity...), la pista plana del jeroglífic pren els seus
    // "objectius" del subtema exacte, no només del tema gruixut.
    const bankKey = planBankKeyFor(context.theme) || HIERO_TO_GROWTH_THEME[context.theme] || 'general';
    const pool = [];
    if (map[context.theme]) pool.push(map[context.theme]);
    const bankObjectives = (HUMAN_PLAN_BANK[bankKey] && HUMAN_PLAN_BANK[bankKey].objective) || [];
    bankObjectives.forEach(o => pool.push(toInlineAdvice(o)));
    if (!pool.length) return 'troba la funció que deixa menys defenses bones';
    return pickFreshPlanLine(pool, 'hiero-advice:' + bankKey);
}
function generateHieroglyphicHint(context, level) {
    const opts = { level, hidePiece: level === 1 };
    const clue = generateDynamicHieroglyphicClue(context, opts);
    if (level <= 1) return clue;
    if (level === 2) {
        const sector = HIEROS.sectors[context.sector] || 'zona crítica';
        return `${clue} La idea viu a la ${sector}, no en la notació.`;
    }
    return `${clue} Motiu principal: ${themeToPlainAdvice(context)}.`;
}
function buildDynamicHieroglyphicPrompt(context, level = 1) {
    const hidePieceRule = level === 1 ? '- No diguis el nom de la peça que mou.' : '- Pots insinuar el tipus de peça o sector, però no la jugada.';
    return `Genera una pista jeroglífica d'escacs en català (1 o 2 frases, màxim 42 paraules).

CONTEXT ESTRATÈGIC:
- FEN: ${context.fen}
- Millor jugada interna (NO revelar): ${context.bestMove}
- PV: ${(context.pv || []).slice(0, 6).join(' ') || 'desconeguda'}
- Tema: ${context.theme}; subtemes: ${(context.subthemes || []).join(', ') || 'cap'}
- Swing: ${context.swing || 0} cp; eval abans/després: ${context.evalBefore ?? '—'} / ${context.evalAfter ?? '—'}
- Material: ${context.materialBalance}; seguretat reis: ${JSON.stringify(context.kingSafety)}
- Tensió central: ${context.centerTension}; columnes obertes: ${(context.openFiles || []).join(', ') || 'cap'}
- Fase gradual: ${context.phaseScore.toFixed(2)} (${context.phaseLabel}); urgència: ${context.urgency}

REGLES:
- Català natural, críptic però útil.
- No diguis la millor jugada, ni cap casella exacta, ni notació.
${hidePieceRule}
- No facis una explicació plana; ha de semblar un enigma didàctic.
- Sense emojis ni cometes embolcallant tot el text.`;
}
async function fetchHieroglyphicClue(context, level = 1) {
    if (!openaiApiKey) return null;
    const cacheKey = `hiero:${context.fen}:${context.bestMove}:${context.theme}:L${level}`;
    const cached = getCachedOpenAI(cacheKey);
    if (cached) return sanitizeHieroglyphicText(cached, context, { hidePiece: level === 1 });
    try {
        const prompt = buildDynamicHieroglyphicPrompt(context, level);
        const result = await callOpenAI(prompt, { generationConfig: { maxOutputTokens: 120 } });
        if (!result.ok || !result.text) return null;
        const text = result.text;
        const clean = sanitizeHieroglyphicText(text.replace(/\*\*/g, '').replace(/^[-•]\s*/gm, '').replace(/["«»]/g, '').trim(), context, { hidePiece: level === 1 });
        setCachedOpenAI(cacheKey, clean);
        return clean;
    } catch (e) {
        console.warn('[Hieroglyphic] OpenAI fallback:', e);
        return null;
    }
}
function getHieroglyphicClue(san) {
    const context = buildHieroglyphicContext(hieroglyphicGame ? hieroglyphicGame.fen() : new Chess().fen(), san, { source: 'legacy' });
    return generateDynamicHieroglyphicClue(context, { level: 1 });
}
function buildHieroglyphicPrompt(fen, expectedMove, op) {
    const context = buildHieroglyphicContext(fen, expectedMove, { opening: op, source: 'opening' });
    return buildDynamicHieroglyphicPrompt(context, 1);
}
function getHieroglyphicRewardText() {
    return randItem([
        'Has convertit un error en coneixement.',
        'L’error ja no mana: ara ensenya.',
        'Has fet de la ferida un mapa.',
        'Una ombra menys al teu repertori.',
        'El tauler recorda: avui has entès el signe.'
    ]);
}

function getHieroglyphicTitle() {
    if (hieroglyphicSource === 'personal') return '🔮 Desxifra el teu error';
    return `🔮 Exercici Jeroglífic — ${hieroglyphicOpening ? hieroglyphicOpening.name : 'posició'}`;
}
function renderHieroglyphicExerciseNote(loading = false, statusText = '') {
    const noteEl = document.getElementById('opening-practice-note');
    if (!noteEl) return;
    const recentVoiceId = loadHieroglyphicRecent()[0]?.voice;
    const voice = HIEROS.voices.find(v => v.id === recentVoiceId) || pickHieroglyphicVoice();
    const loadingTag = loading ? '<span style="opacity:0.6; font-size:0.78rem;"> · el mestre medita…</span>' : '';
    const level = Math.min(3, hieroglyphicAttempts + 1);
    const extra = statusText ? `<div class="maxim-text" style="opacity:0.78; font-size:0.82rem; margin-top:8px; color:var(--accent-pink);">${statusText}</div>` : '';
    noteEl.innerHTML = `<div class="opening-maxim-box hieroglyphic-clue">
        <div class="maxim-title">${getHieroglyphicTitle()}</div>
        <div class="maxim-voice">${voice.name}, ${voice.work}${loadingTag}</div>
        <div class="maxim-text">"${escapeHtml(hieroglyphicClue || '')}"</div>
        <div class="maxim-text" style="opacity:0.7; font-size:0.82rem; margin-top:8px;">Pista ${level}/3 · Troba la millor jugada. Tens ${Math.max(0, 3 - hieroglyphicAttempts)} intents.</div>
        ${extra}
    </div>`;
}
function moveToUci(move) {
    return move ? `${move.from}${move.to}${move.promotion || ''}` : null;
}
function isHieroglyphicMoveCorrect(move) {
    const uci = moveToUci(move);
    if (hieroglyphicExpectedUci && uci === hieroglyphicExpectedUci) return true;
    return !!(move && hieroglyphicExpectedMove && move.san === hieroglyphicExpectedMove);
}
function applyHieroglyphicExpectedMove() {
    if (!hieroglyphicGame || !hieroglyphicExpectedMove) return null;
    if (hieroglyphicExpectedUci) {
        return hieroglyphicGame.move({
            from: hieroglyphicExpectedUci.slice(0, 2),
            to: hieroglyphicExpectedUci.slice(2, 4),
            promotion: hieroglyphicExpectedUci.length > 4 ? hieroglyphicExpectedUci[4] : 'q'
        });
    }
    return hieroglyphicGame.move(hieroglyphicExpectedMove, { sloppy: true });
}
function registerHieroglyphicSolved() {
    hieroglyphicScore.correct++;
    hieroglyphicScore.total++;
    hieroglyphicStats.solved++;
    hieroglyphicStats.currentStreak = (hieroglyphicStats.currentStreak || 0) + 1;
    hieroglyphicStats.bestStreak = Math.max(hieroglyphicStats.bestStreak || 0, hieroglyphicStats.currentStreak);
    const theme = hieroglyphicContext?.theme || 'unknown';
    hieroglyphicStats.themes[theme] = (hieroglyphicStats.themes[theme] || 0) + 1;
    if (hieroglyphicSource === 'personal') {
        hieroglyphicStats.personalSolved++;
        totalStars += 1;
        markGrowthTaskCompleted(currentGrowthTask && currentGrowthTask.type === 'personal_hieroglyphic' ? currentGrowthTask : { type: 'personal_hieroglyphic', theme, source: 'last_game' }, 'success');
        if (hieroglyphicContext?.fen && !hieroglyphicStats.solvedFens.includes(hieroglyphicContext.fen)) {
            hieroglyphicStats.solvedFens.push(hieroglyphicContext.fen);
            hieroglyphicStats.solvedFens = hieroglyphicStats.solvedFens.slice(-200);
        }
    }
    saveHieroglyphicStats();
    saveStorage();
    updateDisplay();
}
function registerHieroglyphicFailed() {
    hieroglyphicScore.total++;
    hieroglyphicStats.currentStreak = 0;
    saveHieroglyphicStats();
}
function explainHieroglyphicAnswer() {
    if (!hieroglyphicContext) return hieroglyphicOpening?.idea || 'La millor jugada resol la tensió principal de la posició.';
    const theme = themeToPlainAdvice(hieroglyphicContext);
    const swing = hieroglyphicContext.swing ? ` Evitava una pèrdua d’uns ${Math.round(hieroglyphicContext.swing)} cp.` : '';
    return `${theme.charAt(0).toUpperCase()}${theme.slice(1)}.${swing}`;
}

function normalizeHieroglyphicCandidate(raw, source, entry = null) {
    if (!raw || !raw.fen || !raw.bestMove) return null;
    const severityRank = raw.severity === 'high' || raw.quality === 'blunder' ? 4
        : raw.severity === 'med' || raw.quality === 'mistake' ? 3
            : raw.severity === 'low' || raw.quality === 'inaccuracy' ? 2 : 1;
    const swing = raw.swing || raw.cpLoss || (severityRank * 120);
    return {
        fen: raw.fen,
        bestMove: raw.bestMove,
        playerMove: raw.playerMove || null,
        pv: raw.bestMovePv || raw.pv || [],
        alternatives: raw.alternatives || [],
        evalBefore: raw.evalBefore ?? null,
        evalAfter: raw.evalAfter ?? null,
        swing,
        severity: raw.severity || raw.quality || 'critical',
        source,
        entryId: entry?.id || null,
        score: severityRank * 1000 + (swing || 0)
    };
}
function collectPersonalHieroglyphicCandidates(preferredEntry = null) {
    const list = [];
    (currentReview || []).forEach(r => {
        if (['blunder', 'mistake', 'inaccuracy'].includes(r.quality) || (r.swing || 0) >= 80) {
            const c = normalizeHieroglyphicCandidate(r, 'currentReview');
            if (c) list.push(c);
        }
    });
    (currentGameErrors || []).forEach(e => {
        const c = normalizeHieroglyphicCandidate(e, 'currentGameErrors');
        if (c) list.push(c);
    });
    const latest = preferredEntry || (gameHistory && gameHistory.length ? gameHistory[gameHistory.length - 1] : null);
    if (latest) {
        (latest.errors || []).forEach(e => {
            const c = normalizeHieroglyphicCandidate(e, 'gameHistory.errors', latest);
            if (c) list.push(c);
        });
        (latest.moveReviews || []).forEach(r => {
            if (['blunder', 'mistake', 'inaccuracy'].includes(r.quality) || (r.swing || 0) >= 80) {
                const c = normalizeHieroglyphicCandidate(r, 'gameHistory.review', latest);
                if (c) list.push(c);
            }
        });
    }
    (savedErrors || []).forEach(e => {
        const c = normalizeHieroglyphicCandidate(e, 'savedErrors');
        if (c) list.push(c);
    });
    // Si no hi ha errors clars, també podem convertir una bona posició crítica en enigma:
    // tensió central, PV disponible o swing moderat són suficients per practicar càlcul real.
    if (!list.length) {
        const quietSources = [];
        (currentReview || []).forEach(r => quietSources.push({ raw: r, source: 'currentReview.quiet' }));
        if (latest) (latest.moveReviews || []).forEach(r => quietSources.push({ raw: r, source: 'gameHistory.quiet' }));
        quietSources
            .filter(item => item.raw && item.raw.fen && item.raw.bestMove)
            .map(item => {
                const c = normalizeHieroglyphicCandidate(Object.assign({ severity: 'critical' }, item.raw, { swing: item.raw.swing || 60 }), item.source);
                if (c) c.score += 100;
                return c;
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .forEach(c => list.push(c));
    }
    const solved = new Set(hieroglyphicStats.solvedFens || []);
    const unique = [];
    const seen = new Set();
    list.sort((a, b) => b.score - a.score).forEach(c => {
        const key = `${c.fen}|${c.bestMove}`;
        if (!seen.has(key) && !solved.has(c.fen)) {
            seen.add(key);
            unique.push(c);
        }
    });
    return unique;
}
function hasPersonalHieroglyphicCandidate(entry = null) {
    return collectPersonalHieroglyphicCandidates(entry).length > 0;
}
function startPersonalHieroglyphicFromLastGame(entry = null) {
    loadHieroglyphicStats();
    const candidates = collectPersonalHieroglyphicCandidates(entry);
    if (!candidates.length) {
        showToast('Encara no hi ha cap posició crítica per convertir en jeroglífic.', 'warn');
        return;
    }
    const chosen = candidates[0];
    try {
        hieroglyphicOpening = { name: 'El teu error', idea: 'Converteix la posició crítica en una idea recordable.' };
        hieroglyphicGame = new Chess(chosen.fen);
        hieroglyphicAttempts = 0;
        hieroglyphicStep = 0;
        hieroglyphicExpectedMove = chosen.bestMove;
        hieroglyphicContext = buildHieroglyphicContext(chosen.fen, chosen.bestMove, {
            source: 'personal',
            playerMove: chosen.playerMove,
            pv: chosen.pv,
            alternatives: chosen.alternatives,
            evalBefore: chosen.evalBefore,
            evalAfter: chosen.evalAfter,
            swing: chosen.swing
        });
        hieroglyphicExpectedUci = hieroglyphicContext.bestMoveUci || chosen.bestMove;
        hieroglyphicSource = 'personal';
        hieroglyphicClue = generateHieroglyphicHint(hieroglyphicContext, 1);
        hieroglyphicExerciseActive = true;
        hideOpeningRestartOverlay();
        openingLessonActive = false;
        openingErrorPracticeActive = false;
        openingPracticeEngineThinking = false;

        renderOpeningStatsScreen(true);
        renderOpeningLessonButtons();
        initOpeningBundleBoard();
        updateOpeningBoardInteractivity();
        clearOpeningTapSelection();
        openingPracticeGame = hieroglyphicGame;
        openingPracticeMoveCount = 0;
        clearOpeningHintHighlight();
        clearOpeningMoveVisualFeedback();
        $('#start-screen,#game-screen,#history-screen,#league-screen,#stats-screen,#settings-screen,#calibration-result-screen').hide();
        $('#opening-screen').show();
        setOpeningScreenMode('hieroglyphic');
        navPush('opening-screen');
        if (openingBundleBoard) {
            openingBundleBoard.orientation(hieroglyphicGame.turn() === 'w' ? 'white' : 'black');
            openingBundleBoard.position(hieroglyphicGame.fen());
            if (typeof openingBundleBoard.resize === 'function') setTimeout(() => openingBundleBoard.resize(), 50);
        }
        const myToken = ++hieroglyphicToken;
        renderHieroglyphicExerciseNote(!!openaiApiKey);
        if (openaiApiKey) {
            fetchHieroglyphicClue(hieroglyphicContext, 1).then((text) => {
                if (text && myToken === hieroglyphicToken && hieroglyphicExerciseActive && hieroglyphicSource === 'personal' && hieroglyphicAttempts === 0) {
                    hieroglyphicClue = text;
                }
                renderHieroglyphicExerciseNote(false);
            });
        }
    } catch (e) {
        console.warn('[Hieroglyphic] No s’ha pogut crear el jeroglífic personal', e);
        showToast('No s’ha pogut convertir aquesta posició en jeroglífic.', 'warn');
    }
}
// Tria aleatòria d'un exercici jeroglífic (obertura + jugada objectiu de l'usuari).
function drawHieroglyphicExercise() {
    const pool = CURATED_OPENINGS.filter(op => op.moves.length >= 4);
    if (pool.length === 0) return null;
    const op = pool[Math.floor(Math.random() * pool.length)];
    const userMoveIndices = [];
    for (let i = 0; i < op.moves.length; i++) {
        const isUserMove = (op.userColor === 'w' && i % 2 === 0) || (op.userColor === 'b' && i % 2 === 1);
        if (isUserMove) userMoveIndices.push(i);
    }
    if (userMoveIndices.length === 0) return null;
    const targetIdx = userMoveIndices[Math.floor(Math.random() * userMoveIndices.length)];
    return { op, targetIdx };
}

// Cua de jeroglífics a punt: pre-tria els exercicis següents i, si hi ha OpenAI,
// en pre-carrega la pista al cau perquè aparegui a l'instant en començar.
let hieroglyphicUpNext = [];

function prefetchHieroglyphicClue(draw) {
    if (!openaiApiKey || !draw) return;
    try {
        const g = new Chess();
        for (let i = 0; i < draw.targetIdx; i++) g.move(draw.op.moves[i], { sloppy: true });
        const context = buildHieroglyphicContext(g.fen(), draw.op.moves[draw.targetIdx], { opening: draw.op, source: 'opening' });
        fetchHieroglyphicClue(context, 1).catch(() => {});
    } catch (e) {}
}

function refillHieroglyphicQueue() {
    let guard = 0;
    while (hieroglyphicUpNext.length < 3 && guard < 25) {
        guard++;
        const draw = drawHieroglyphicExercise();
        if (!draw) break;
        if (hieroglyphicUpNext.some(d => d.op === draw.op && d.targetIdx === draw.targetIdx)) continue;
        hieroglyphicUpNext.push(draw);
    }
    hieroglyphicUpNext.forEach(d => {
        if (!d.prefetched && openaiApiKey) { d.prefetched = true; prefetchHieroglyphicClue(d); }
    });
}

function startHieroglyphicExercise() {
    const draw = hieroglyphicUpNext.shift() || drawHieroglyphicExercise();
    refillHieroglyphicQueue();
    if (!draw) return;
    // Si el mode "Sempre tinc sort" està actiu, estrena tauler i peces a l'atzar.
    maybeRollLuckyThemes();
    // Neteja qualsevol feina pendent de la pràctica anterior perquè no interfereixi
    // amb l'exercici (rival pendent, anàlisi de Stockfish, pista o pre-càlcul).
    openingPracticeEngineThinking = false;
    openingPracticeAnalysisPending = false;
    openingPracticeHintPending = false;
    openingPreCalcPending = false;
    stockfishRequestor = null;
    const op = draw.op;
    hieroglyphicOpening = op;
    hieroglyphicGame = new Chess();
    hieroglyphicAttempts = 0;

    const targetIdx = draw.targetIdx;
    for (let i = 0; i < targetIdx; i++) {
        hieroglyphicGame.move(op.moves[i], { sloppy: true });
    }

    hieroglyphicStep = targetIdx;
    hieroglyphicExpectedMove = op.moves[targetIdx];
    hieroglyphicContext = buildHieroglyphicContext(hieroglyphicGame.fen(), hieroglyphicExpectedMove, { opening: op, source: 'opening' });
    hieroglyphicExpectedUci = hieroglyphicContext.bestMoveUci;
    hieroglyphicSource = 'opening';
    hieroglyphicClue = generateHieroglyphicHint(hieroglyphicContext, 1);
    hieroglyphicExerciseActive = true;
    hideOpeningRestartOverlay();
    setOpeningScreenMode('hieroglyphic');
    const myToken = ++hieroglyphicToken;

    if (!openingBundleBoard) initOpeningBundleBoard();
    updateOpeningBoardInteractivity();
    clearOpeningTapSelection();
    openingLessonActive = false;
    openingErrorPracticeActive = false;
    openingPracticeGame = hieroglyphicGame;
    openingPracticeMoveCount = targetIdx;
    if (openingBundleBoard) {
        openingBundleBoard.orientation(op.userColor === 'w' ? 'white' : 'black');
        openingBundleBoard.position(hieroglyphicGame.fen());
    }

    // Pista offline immediata; si hi ha OpenAI, la millorem amb el mateix context ric.
    renderHieroglyphicExerciseNote(!!openaiApiKey);
    if (openaiApiKey) {
        fetchHieroglyphicClue(hieroglyphicContext, 1).then((text) => {
            // Només actualitza si seguim al mateix exercici i sense intents fallits encara
            if (text && myToken === hieroglyphicToken && hieroglyphicExerciseActive && hieroglyphicAttempts === 0) {
                hieroglyphicClue = text;
            }
            renderHieroglyphicExerciseNote(false);
        });
    }

    const boardEl = document.getElementById('opening-board');
    if (boardEl && boardEl.scrollIntoView) setTimeout(() => boardEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}

function hasOpeningHieroglyphicCandidate() {
    return Array.isArray(CURATED_OPENINGS) && CURATED_OPENINGS.some(op => op && Array.isArray(op.moves) && op.moves.length >= 4);
}

function getHieroglyphicNextButtonHtml() {
    if (hieroglyphicSource === 'personal') {
        return hasPersonalHieroglyphicCandidate()
            ? '<button class="btn btn-primary" onclick="startPersonalHieroglyphicFromLastGame()" style="margin-top:10px;">Desxifra un altre error</button>'
            : '';
    }
    return hasOpeningHieroglyphicCandidate()
        ? '<button class="btn btn-primary" onclick="startHieroglyphicExercise()" style="margin-top:10px;">Següent jeroglífic</button>'
        : '';
}

function handleHieroglyphicMove(source, target) {
    if (!hieroglyphicExerciseActive || !hieroglyphicGame) return 'snapback';
    const move = hieroglyphicGame.move({ from: source, to: target, promotion: 'q' });
    if (!move) return 'snapback';

    if (isHieroglyphicMoveCorrect(move)) {
        registerHieroglyphicSolved();
        hieroglyphicExerciseActive = false;
        updateOpeningMaximButton();
        if (openingBundleBoard) openingBundleBoard.position(hieroglyphicGame.fen());
        showOpeningMoveVisualFeedback(source, target, 'correct');
        const noteEl = document.getElementById('opening-practice-note');
        const reward = hieroglyphicSource === 'personal' ? getHieroglyphicRewardText() : 'Has desxifrat el signe.';
        if (noteEl) {
            const nextButton = getHieroglyphicNextButtonHtml();
            noteEl.innerHTML = `<div class="opening-maxim-box">
                <div class="maxim-title">✅ Correcte!</div>
                <div class="maxim-text">${escapeHtml(reward)}</div>
                <div class="maxim-text" style="opacity:0.78; margin-top:6px;">Tema: ${escapeHtml(hieroglyphicContext?.theme || 'estratègia')} · Jeroglífics resolts: ${hieroglyphicStats.solved}</div>
                ${nextButton}
            </div>`;
        }
        showToast(reward, 'success');
        return;
    }

    hieroglyphicGame.undo();
    hieroglyphicAttempts++;
    showOpeningMoveVisualFeedback(source, target, 'incorrect');

    if (hieroglyphicAttempts >= 3) {
        registerHieroglyphicFailed();
        hieroglyphicExerciseActive = false;
        updateOpeningMaximButton();
        applyHieroglyphicExpectedMove();
        if (openingBundleBoard) openingBundleBoard.position(hieroglyphicGame.fen());
        const noteEl = document.getElementById('opening-practice-note');
        if (noteEl) {
            const nextButton = getHieroglyphicNextButtonHtml();
            noteEl.innerHTML = `<div class="opening-maxim-box">
                <div class="maxim-title">💡 La resposta era: ${escapeHtml(hieroglyphicContext?.bestMoveSan || hieroglyphicExpectedMove || hieroglyphicExpectedUci || '')}</div>
                <div class="maxim-text">${escapeHtml(explainHieroglyphicAnswer())}</div>
                <div class="maxim-text" style="opacity:0.7; margin-top:6px;">Puntuació: ${hieroglyphicScore.correct}/${hieroglyphicScore.total}</div>
                ${nextButton}
            </div>`;
        }
        showToast('La resposta s’ha revelat.', 'warn');
        return;
    }

    if (openingBundleBoard) openingBundleBoard.position(hieroglyphicGame.fen());
    if (hieroglyphicContext) {
        const nextLevel = Math.min(3, hieroglyphicAttempts + 1);
        hieroglyphicClue = generateHieroglyphicHint(hieroglyphicContext, nextLevel);
        const myToken = ++hieroglyphicToken;
        renderHieroglyphicExerciseNote(!!openaiApiKey, `Incorrecte. ${3 - hieroglyphicAttempts} intents restants.`);
        if (openaiApiKey) {
            fetchHieroglyphicClue(hieroglyphicContext, nextLevel).then((text) => {
                if (text && myToken === hieroglyphicToken && hieroglyphicExerciseActive && hieroglyphicAttempts === nextLevel - 1) {
                    hieroglyphicClue = text;
                }
                renderHieroglyphicExerciseNote(false, `Incorrecte. ${3 - hieroglyphicAttempts} intents restants.`);
            });
        }
    }
    return 'snapback';
}

function initOpeningBundleBoard() {
    if (openingBundleBoard) return;
    const boardEl = document.getElementById('opening-board');
    if (!boardEl) return;
    openingPracticeGame = new Chess();
    openingPracticeMoveCount = 0;
    openingBundleBoard = Chessboard('opening-board', {
        draggable: (controlMode === 'drag'),
        position: 'start',
        onDragStart: (source, piece) => {
            if (!openingPracticeGame || openingPracticeGame.game_over()) return false;
            if (!hieroglyphicExerciseActive && openingPracticeMoveCount >= OPENING_PRACTICE_MAX_PLIES) return false;
            if (openingPracticeEngineThinking) return false;
            if (!openingLessonActive && !openingErrorPracticeActive && !hieroglyphicExerciseActive && openingPracticeGame.turn() !== openingPracticeUserColor) {
                const noteEl = document.getElementById('opening-practice-note');
                if (noteEl) noteEl.textContent = 'Espera la jugada del rival.';
                return false;
            }
            if (openingPracticeGame.turn() === 'w' && piece.search(/^b/) !== -1) return false;
            if (openingPracticeGame.turn() === 'b' && piece.search(/^w/) !== -1) return false;
            if (hieroglyphicExerciseActive) highlightOpeningTapSelection(source);
        },
        onDrop: (source, target) => {
            if (!openingPracticeGame) return 'snapback';

            // Mode exercici geroglífic
            if (hieroglyphicExerciseActive) {
                const result = handleHieroglyphicMove(source, target);
                clearOpeningTapSelection();
                return result;
            }

            // Mode lliçó guiada: el jugador ha de trobar la jugada de la teoria
            if (openingLessonActive) {
                return handleOpeningLessonUserMove(source, target) ? undefined : 'snapback';
            }

            // Mode pràctica d'errors
            if (openingErrorPracticeActive) {
                const move = openingPracticeGame.move({ from: source, to: target, promotion: 'q' });
                if (!move) return 'snapback';

                const moveUci = source + target;
                clearOpeningHintHighlight();

                // Comprovar si és el moviment correcte
                if (openingErrorBestMove && moveUci === openingErrorBestMove.substring(0, 4)) {
                    // Correcte!
                    showOpeningMoveVisualFeedback(source, target, 'correct');
                    openingPracticeGoodMoves++;
                    openingPracticeTotalMoves++;
                    updateOpeningPrecisionDisplay(true);
                    setTimeout(() => handleOpeningErrorSuccess(), 800);
                } else {
                    // Incorrecte
                    showOpeningMoveVisualFeedback(source, target, 'incorrect');
                    openingPracticeTotalMoves++;
                    updateOpeningPrecisionDisplay(true);
                    // Desfer el moviment
                    setTimeout(() => {
                        openingPracticeGame.undo();
                        openingBundleBoard.position(openingPracticeGame.fen());
                        clearOpeningMoveVisualFeedback();
                    }, 600);
                }
                return;
            }

            return handleOpeningPracticeUserMove(source, target);
        },
        onSnapEnd: () => {
            if (!openingPracticeGame) return;
            openingBundleBoard.position(openingPracticeGame.fen());
        },
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });
    updateOpeningPracticeStatus();
    updateOpeningPrecisionDisplay();
    updateOpeningUndoButton();
    if (typeof openingBundleBoard.resize === 'function') openingBundleBoard.resize();

    // Aplicar mode de control tàctil
    if (controlMode === 'tap') {
        enableOpeningTapToMove();
    }

    // Pre-calcular el millor moviment per al primer torn de l'usuari
    setTimeout(() => preCalculateOpeningBestMove(), 500);
}

function updateOpeningPracticeStatus() {
    const noteEl = document.getElementById('opening-practice-note');
    if (!noteEl) return;
    // Aquests modes gestionen la nota pel seu compte
    if (openingLessonActive || hieroglyphicExerciseActive || openingErrorPracticeActive) return;
    const remaining = Math.max(OPENING_PRACTICE_MAX_PLIES - openingPracticeMoveCount, 0);
    if (!openingPracticeGame) {
        noteEl.textContent = '—';
        return;
    }
    if (openingPracticeGame.game_over()) {
        noteEl.textContent = 'Partida finalitzada.';
        return;
    }
    if (remaining === 0) {
        noteEl.textContent = 'Límit de 10 moviments assolit.';
        return;
    }
    // Anàlisi de teoria en directe (punt 2)
    if (!openingTrie) initOpeningSystem();
    const moves = openingPracticeGame.history();
    if (!moves.length) {
        noteEl.innerHTML = '<div class="opening-theory-line theory-neutral">Comença una obertura: t\'aniré dient si segueixes la teoria.</div>';
        return;
    }
    const oa = analyzeGameOpening(moves);
    const validNext = getValidOpeningMoves(moves);
    if (openingPracticeUserColor === 'b' && isOpeningUserTurn()) {
        const whiteMove = moves[moves.length - 1];
        let html = '';
        // Marcador d'encerts en verd (mateix disseny que les obertures amb blanques)
        if (openingPracticeTotalMoves > 0) {
            html += `<div style="margin-bottom:6px;"><span style="display:inline-block; padding:2px 10px; border-radius:999px; background:rgba(76,175,80,0.18); color:var(--accent-green); font-weight:700;">✓ encerts ${openingPracticeGoodMoves}/${openingPracticeTotalMoves}</span></div>`;
        }
        // Tipus d'obertura detectat + avís de canvi de família
        if (oa && oa.name) {
            const display = `${oa.name}${oa.eco ? ` (${oa.eco})` : ''}`;
            const baseFamily = s => (s || '').split(':')[0].trim();
            const GENERIC_ROOTS = ["King's Pawn Game", "Queen's Pawn Game", "Indian Defense", "King's Pawn Opening", "Queen's Pawn Opening"];
            const prevBase = baseFamily(openingPracticeLastDetected);
            const changed = openingPracticeLastDetected && prevBase !== baseFamily(oa.name) && !GENERIC_ROOTS.includes(prevBase);
            html += changed
                ? `<div class="opening-theory-line theory-on">🔀 Has canviat d'obertura: <strong>${display}</strong></div>`
                : `<div class="opening-theory-line theory-on">📗 Obertura: <strong>${display}</strong></div>`;
            openingPracticeLastDetected = oa.name;
        }
        if (validNext.length > 0) {
            html += `<div class="opening-theory-line theory-on">Blanques han jugat <strong>${whiteMove}</strong>. Respostes teòriques: ${validNext.slice(0, 5).join(', ')}.</div>`;
        } else {
            html += `<div class="opening-theory-line theory-off">📙 Blanques han jugat <strong>${whiteMove}</strong>. Has sortit del repertori conegut; pots continuar lliurement o desfer.</div>`;
        }
        noteEl.innerHTML = html;
        return;
    }
    if (validNext.length > 0) {
        const name = (oa && oa.name) ? `${oa.name}${oa.eco ? ` (${oa.eco})` : ''}` : 'una línia coneguda';
        noteEl.innerHTML = `<div class="opening-theory-line theory-on">📗 Ets a la teoria: <strong>${name}</strong>. Continuació habitual: ${validNext.slice(0, 3).join(', ')}.</div>`;
    } else if (oa && oa.name) {
        noteEl.innerHTML = `<div class="opening-theory-line theory-on">📗 <strong>${oa.name}${oa.eco ? ` (${oa.eco})` : ''}</strong>: has arribat al final de la línia teòrica. Bona feina!</div>`;
    } else {
        noteEl.innerHTML = '<div class="opening-theory-line theory-off">📙 Has sortit del repertori conegut. Pots continuar lliurement o desfer la jugada.</div>';
    }
}

// Guardar estat per undo (només un moviment)
function saveOpeningPracticeState() {
    if (!openingPracticeGame) return;
    // Només guardem l'últim estat (limitat a un sol undo)
    openingPracticeHistory = [{
        fen: openingPracticeGame.fen(),
        moveCount: openingPracticeMoveCount,
        goodMoves: openingPracticeGoodMoves,
        totalMoves: openingPracticeTotalMoves,
        openingSequence: [...openingCurrentSequence] // Guardar seqüència d'obertures
    }];
    updateOpeningUndoButton();
}

// Actualitzar estat del botó undo
function updateOpeningUndoButton() {
    const btn = document.getElementById('btn-opening-undo');
    if (!btn) return;
    // Deshabilitar si no hi ha historial o l'engine està pensant
    const canUndo = openingPracticeHistory.length > 0 && !openingPracticeEngineThinking;
    btn.disabled = !canUndo;
}

// Desfer el darrer moviment de l'usuari (limitat a un sol undo)
function undoOpeningPracticeMove() {
    if (!openingPracticeGame || openingPracticeHistory.length === 0) return;
    if (openingPracticeEngineThinking) return;

    // Recuperar i esborrar l'estat guardat (només permet un undo)
    const lastState = openingPracticeHistory.pop();

    // Restaurar l'estat del joc
    openingPracticeGame.load(lastState.fen);
    openingPracticeMoveCount = lastState.moveCount;
    openingPracticeGoodMoves = lastState.goodMoves;
    openingPracticeTotalMoves = lastState.totalMoves;
    // Restaurar seqüència d'obertures
    openingCurrentSequence = lastState.openingSequence ? [...lastState.openingSequence] : [];
    updateSelectedOpening();

    // Cancel·lar qualsevol anàlisi de precisió pendent
    openingPracticeAnalysisPending = false;
    openingPracticePendingAnalysis = null;
    openingPracticeLastFen = null;
    openingPracticeLastMove = null;
    // Cancel·lar també les noves variables d'anàlisi en dos passos
    openingAnalysisStep = 0;
    openingFenAfterMove = null;
    openingTempScore = null;
    openingEvalBefore = null;
    openingEvalAfter = null;
    openingBestMove = null;

    // Cancel·lar pista pendent
    openingPracticeHintPending = false;
    openingPracticeBestMove = null;

    // Cancel·lar màxima pendent (evitar que s'actualitzi després de l'undo)
    openingMaximPending = false;
    openingMaximRequestCounter++;
    updateOpeningMaximButton();

    // Sortir de la lliçó guiada si estava activa
    openingLessonActive = false;
    openingLessonInfo = null;
    openingLessonCurrentIndex = null;
    openingLessonStep = 0;

    // Cancel·lar variables de feedback instantani
    openingPreCalcBestMove = null;
    openingPreCalcPending = false;
    openingPreCalcFen = null;
    openingLastMoveQuality = null;
    // Cancel·lar variables de callback precisió-engine
    openingPendingUserMove = null;
    openingNeedsEngineMove = false;
    // Cancel·lar token de Stockfish (evitar conflictes amb peticions anteriors)
    stockfishRequestor = null;

    // Netejar seleccions i pistes visuals
    clearOpeningTapSelection();
    clearOpeningHintHighlight();
    clearOpeningMoveVisualFeedback();

    if (openingPracticeUserColor === 'b' && openingPracticeGame.turn() === 'w') {
        playOpeningInitialWhiteMove();
        return;
    }

    // Actualitzar el tauler
    if (openingBundleBoard) {
        orientOpeningPracticeBoard(openingPracticeUserColor);
        openingBundleBoard.position(openingPracticeGame.fen());
    }

    // Actualitzar UI
    updateOpeningPracticeStatus();
    updateOpeningPrecisionDisplay();
    updateOpeningUndoButton();

    // Missatge
    const noteEl = document.getElementById('opening-practice-note');
    if (noteEl) {
        noteEl.textContent = 'Moviment desfet. Torna a intentar-ho!';
    }

    // Pre-calcular el millor moviment per a la posició restaurada
    setTimeout(() => preCalculateOpeningBestMove(), 200);
}


function getOpeningPracticeBoardOrientation(color = openingPracticeUserColor) {
    return color === 'b' ? 'black' : 'white';
}

function orientOpeningPracticeBoard(color = openingPracticeUserColor) {
    if (!openingBundleBoard || typeof openingBundleBoard.orientation !== 'function') return;
    openingBundleBoard.orientation(getOpeningPracticeBoardOrientation(color));
}

function chooseOpeningNaturalWhiteMove() {
    if (!openingPracticeGame || openingPracticeGame.turn() !== 'w') return null;

    const legalSans = openingPracticeGame.moves();
    const repertoireFirstMoves = (typeof CURATED_OPENINGS !== 'undefined' ? CURATED_OPENINGS : [])
        .filter(op => op && op.userColor === 'b' && Array.isArray(op.moves) && op.moves.length > 0)
        .map(op => op.moves[0]);
    const candidates = [...repertoireFirstMoves, 'e4', 'd4', 'Nf3', 'c4'];

    for (const san of candidates) {
        if (legalSans.includes(san)) return san;
    }
    return null;
}

function chooseOpeningTheoryMoveForCurrentPosition() {
    if (!openingPracticeGame || openingPracticeGame.game_over()) return null;
    if (!openingTrie) initOpeningSystem();

    updateSelectedOpening();
    const validMoves = getValidOpeningMoves(openingCurrentSequence);
    const normalFirstMoves = ['e4', 'd4', 'Nf3', 'c4'];
    const candidates = openingCurrentSequence.length === 0
        ? [...normalFirstMoves.filter(m => validMoves.includes(m)), ...validMoves, ...normalFirstMoves]
        : [openingNextMoveHint, ...validMoves];
    const legalSans = openingPracticeGame.moves();

    for (const san of candidates) {
        if (san && legalSans.includes(san)) return san;
    }
    return null;
}

function applyOpeningOpponentSanMove(san, noteText = null) {
    if (!openingPracticeGame || openingPracticeGame.game_over() || !san) return false;
    const move = openingPracticeGame.move(san, { sloppy: true });
    if (!move) return false;

    clearOpeningHintHighlight();
    openingPracticeBestMove = null;
    openingPracticeMoveCount += 1;
    if (move.san) {
        openingCurrentSequence.push(move.san);
        updateSelectedOpening();
    }
    if (openingBundleBoard) openingBundleBoard.position(openingPracticeGame.fen());
    openingPracticeEngineThinking = false;
    updateOpeningPracticeStatus();
    updateOpeningPrecisionDisplay();
    updateOpeningUndoButton();
    if (noteText) {
        const noteEl = document.getElementById('opening-practice-note');
        if (noteEl) noteEl.textContent = noteText;
    }
    setTimeout(() => preCalculateOpeningBestMove(), 200);
    return true;
}

function playOpeningInitialWhiteMove() {
    if (!openingPracticeGame || openingPracticeGame.game_over() || openingPracticeGame.turn() !== 'w') return false;

    const san = openingPracticeOpponentMode === 'theory'
        ? chooseOpeningTheoryMoveForCurrentPosition()
        : chooseOpeningNaturalWhiteMove();

    if (applyOpeningOpponentSanMove(san, 'Les blanques han començat. Ara et toca jugar amb negres.')) {
        return true;
    }

    // Fallback teòric segur abans d'anar a Stockfish: evita una primera jugada absurda en mode adaptatiu.
    const naturalSan = chooseOpeningNaturalWhiteMove();
    if (applyOpeningOpponentSanMove(naturalSan, 'Les blanques han començat. Ara et toca jugar amb negres.')) {
        return true;
    }

    requestOpeningPracticeStrongEngineMove();
    return false;
}

function startOpeningPracticeAsColor(color) {
    hideOpeningRestartOverlay();
    openingPracticeUserColor = color === 'b' ? 'b' : 'w';
    const colorSelect = document.getElementById('opening-practice-color-select');
    if (colorSelect) colorSelect.value = openingPracticeUserColor;
    resetOpeningPracticeBoard();
    orientOpeningPracticeBoard(openingPracticeUserColor);
    if (openingPracticeUserColor === 'b') {
        setTimeout(() => playOpeningInitialWhiteMove(), 150);
    }
}

function resetOpeningPracticeBoard() {
    openingPracticeGame = new Chess();
    openingPracticeMoveCount = 0;
    openingPracticeEngineThinking = false;
    hieroglyphicExerciseActive = false;
    openingMaximPending = false;
    openingMaximRequestCounter++;
    updateOpeningMaximButton();
    lastOpeningMaxim = null;
    openingPracticeHintPending = false;
    openingPracticeBestMove = null;
    resetOpeningEngineMoveCandidates();
    // Reset precisió
    openingPracticeGoodMoves = 0;
    openingPracticeTotalMoves = 0;
    openingPracticeAnalysisPending = false;
    openingPracticeLastFen = null;
    openingPracticeLastMove = null;
    openingPracticePendingAnalysis = null;
    // Reset variables d'anàlisi en dos passos
    openingAnalysisStep = 0;
    openingFenAfterMove = null;
    openingTempScore = null;
    openingEvalBefore = null;
    openingEvalAfter = null;
    openingBestMove = null;
    // Reset variables de feedback instantani
    openingPreCalcBestMove = null;
    openingPreCalcPending = false;
    openingPreCalcFen = null;
    openingLastMoveQuality = null;
    // Reset variables de callback precisió-engine
    openingPendingUserMove = null;
    openingNeedsEngineMove = false;
    // Reset token de Stockfish
    stockfishRequestor = null;
    openingPracticeHistory = []; // Reset historial per undo
    // Reset seqüència d'obertures
    openingCurrentSequence = [];
    openingMatchedOpenings = [];
    openingSelectedOpening = null;
    openingNextMoveHint = null;
    openingPracticeLastDetected = null;
    clearOpeningTapSelection();
    clearOpeningHintHighlight();
    clearOpeningMoveVisualFeedback();
    if (openingBundleBoard) {
        orientOpeningPracticeBoard(openingPracticeUserColor);
        openingBundleBoard.position('start');
        if (typeof openingBundleBoard.resize === 'function') openingBundleBoard.resize();
    }
    updateOpeningPracticeStatus();
    updateOpeningPrecisionDisplay();
    updateOpeningUndoButton();
    // Pre-calcular el millor moviment només si el primer torn és de l'usuari.
    if (openingPracticeGame.turn() === openingPracticeUserColor) {
        setTimeout(() => preCalculateOpeningBestMove(), 300);
    }
}

function playOpeningTheoryOpponentMove() {
    if (!openingPracticeGame || openingPracticeGame.game_over()) return false;
    // No moguis si hem sortit de la pràctica cap a un exercici jeroglífic: una crida
    // pendent no ha de tocar el tauler de l'exercici.
    if (hieroglyphicExerciseActive) return false;
    const san = chooseOpeningTheoryMoveForCurrentPosition();
    return applyOpeningOpponentSanMove(san);
}

function requestOpeningPracticeEngineMove() {
    // Si ja estem en un exercici jeroglífic, no demanis cap jugada del rival de pràctica.
    if (hieroglyphicExerciseActive) return;
    // El tauler d'obertures separa Stockfish fort (pistes, validacions i lliçons guiades)
    // d'un rival adaptatiu per a la pràctica normal. Validar exercicis requereix exactitud;
    // jugar contra el bot requereix la mateixa experiència humana que la partida lliure.
    if (openingLessonActive || openingErrorPracticeActive) {
        requestOpeningPracticeStrongEngineMove();
        return;
    }
    if (openingPracticeOpponentMode === 'theory') {
        openingPracticeEngineThinking = true;
        updateOpeningUndoButton();
        setTimeout(() => {
            if (!playOpeningTheoryOpponentMove()) requestOpeningPracticeStrongEngineMove();
        }, 450);
        return;
    }
    requestOpeningPracticeAdaptiveEngineMove();
}

function requestOpeningPracticeStrongEngineMove() {
    if (!openingPracticeGame || openingPracticeGame.game_over()) return;
    if (openingPracticeMoveCount >= OPENING_PRACTICE_MAX_PLIES) return;
    if (!stockfish && !ensureStockfish()) return;
    openingPracticeEngineThinking = true;
    updateOpeningUndoButton(); // Deshabilitar undo mentre l'engine pensa
    stockfishRequestor = 'opening-engine';
    resetOpeningEngineMoveCandidates();
    try { stockfish.postMessage('setoption name UCI_LimitStrength value false'); } catch (e) {}
    try { stockfish.postMessage('setoption name Skill Level value 20'); } catch (e) {}
    try { stockfish.postMessage('setoption name MultiPV value 1'); } catch (e) {}
    stockfish.postMessage(`position fen ${openingPracticeGame.fen()}`);
    stockfish.postMessage('go depth 12');
}

function requestOpeningPracticeAdaptiveEngineMove() {
    if (!openingPracticeGame || openingPracticeGame.game_over()) return;
    if (openingPracticeMoveCount >= OPENING_PRACTICE_MAX_PLIES) return;
    if (!stockfish && !ensureStockfish()) return;
    openingPracticeEngineThinking = true;
    updateOpeningUndoButton(); // Deshabilitar undo mentre l'engine pensa
    stockfishRequestor = 'opening-engine';
    resetOpeningEngineMoveCandidates();

    // En pràctica normal d'obertures, ROC < engineEloMin necessita la mateixa combinació de
    // UCI_Elo adaptatiu, profunditat baixa i selecció humana: si no, Stockfish respondria sempre
    // amb una línia massa perfecta per a principiants.
    applyEngineEloStrength(getActiveStrengthElo());
    const multiPvValue = getEngineMoveMultiPvValue(getActiveStrengthElo(), 5);
    try { stockfish.postMessage(`setoption name MultiPV value ${multiPvValue}`); } catch (e) {}
    stockfish.postMessage(`position fen ${openingPracticeGame.fen()}`);
    stockfish.postMessage(`go depth ${getAIDepth()}`);
}

function checkShareSupport() {
    if ((navigator.canShare && navigator.share) || supportsDirectoryPicker()) $('#btn-smart-share').show();
}

function guardCalibrationAccess() {
    if (!isCalibrationRequired()) return true;
    const remaining = Math.max(0, CALIBRATION_GAME_COUNT - calibrationGames.length);
    const txt = remaining > 0
        ? `Juga ${remaining} ${remaining === 1 ? 'partida' : 'partides'} de calibratge més per desbloquejar aquest mode.`
        : 'Completa el calibratge inicial per desbloquejar aquest mode.';
    showToast(txt, 'warn');
    return false;
}

function novaPartida() {
    currentGameMode = 'free';
    currentOpponent = null;
    if (leagueActiveMatch) { leagueActiveMatch = null; saveStorage(); }
    startGame(false);
}

function setupEvents() {
    checkShareSupport();
    $('#btn-new-game').click(() => {
        novaPartida();
    });

    $('#league-banner').on('click', () => { if (guardCalibrationAccess()) startLeagueRound(); });
    $('#btn-league-banner-play').on('click', (e) => { e.stopPropagation(); if (guardCalibrationAccess()) startLeagueRound(); });

    $('#btn-badges').click(() => { updateBadgesModal(); $('#badges-modal').css('display', 'flex'); });

    onModalAction('#promotion-modal .promotion-option', function () { resolvePromotionPicker($(this).data('piece')); });
    onModalAction('#btn-promotion-cancel', () => resolvePromotionPicker(null));


    $('#btn-stats').click(() => { $('#start-screen').hide(); $('#stats-screen').show(); updateStatsDisplay(); navPush('stats-screen'); });
    $('#btn-settings').click(() => { $('#start-screen').hide(); $('#settings-screen').show(); navPush('settings-screen'); });
    $('#btn-history').click(() => {
        $('#start-screen').hide();
        $('#history-screen').show();
        initHistoryBoard();
        renderGameHistory();
        navPush('history-screen');
        // Assegurar que el tauler s'ajusti a l'amplada real un cop la pantalla és visible
        setTimeout(() => resizeHistoryBoardToViewport(), 0);
    });
    $('#history-filter-result, #history-filter-mode, #history-filter-prec').off('change').on('change', () => {
        historyFilters.result = $('#history-filter-result').val();
        historyFilters.mode = $('#history-filter-mode').val();
        historyFilters.prec = parseInt($('#history-filter-prec').val(), 10) || 0;
        renderGameHistory();
    });
    $('#btn-export-all-pgn').off('click').on('click', () => {
        if (!gameHistory.length) { showToast('No hi ha partides per exportar', 'warn'); return; }
        const pgns = gameHistory.map(e => buildEntryPgn(e)).filter(p => p && p.trim());
        if (!pgns.length) { showToast('No hi ha partides amb moviments per exportar', 'warn'); return; }
        const blob = new Blob([pgns.join('\n\n\n')], { type: 'application/x-chess-pgn' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `eltauler_historial_${pgns.length}partides.pgn`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Exportades ${pgns.length} partides ♟`, 'success');
    });
    $('#btn-league').click(() => { if (guardCalibrationAccess()) { openLeague(); navPush('league-screen'); } });
    $('#btn-catalans').click(() => {
        $('#start-screen').hide();
        if (window.CatalansMode && typeof window.CatalansMode.open === 'function') window.CatalansMode.open();
        else $('#catalans-screen').show();
        navPush('catalans-screen');
    });
    $('#btn-catalans-back').click(() => {
        if (window.CatalansMode && typeof window.CatalansMode.close === 'function') window.CatalansMode.close();
        else $('#catalans-screen').hide();
        $('#start-screen').show();
        navStack.pop();
    });
    $('#btn-back-league').click(() => { $('#league-screen').hide(); $('#start-screen').show(); navStack.pop(); });
    $('#btn-league-new').click(() => { if (guardCalibrationAccess()) { createNewLeague(true); openLeague(); } });
    $('#btn-league-play').click(() => { if (guardCalibrationAccess()) startLeagueRound(); });
    $('#btn-opening').click(() => {
        renderOpeningStatsScreen();
        renderOpeningLessonButtons();
        initOpeningBundleBoard();
        startOpeningPracticeAsColor(openingPracticeUserColor);
        setOpeningScreenMode('overview');
        $('#start-screen').hide();
        $('#opening-screen').show();
        navPush('opening-screen');
        if (openingBundleBoard && typeof openingBundleBoard.resize === 'function') {
            setTimeout(() => openingBundleBoard.resize(), 50);
        }
    });
    $(document).on('click', '.opening-lesson-btn', function() {
        const idx = parseInt($(this).attr('data-lesson'), 10);
        if (!isNaN(idx)) startOpeningLesson(idx);
    });
    $('#opening-restart-overlay').click(() => restartCompletedOpeningLesson());
    $('#btn-hieroglyphic-exercise').click(() => {
        initOpeningBundleBoard();
        startHieroglyphicExercise();
    });
    $('#history-personal-hieroglyphic').click(() => {
        startPersonalHieroglyphicFromLastGame(historyReplay ? historyReplay.entry : null);
    });
    $('#btn-back-opening').click(() => {
        $('#opening-screen').hide();
        $('#start-screen').show();
        navStack.pop();
    });
    $('#btn-opening-bundle-menu').click(() => {
        $('#opening-screen').hide();
        $('#start-screen').show();
        navStack.pop();
    });
    $('#btn-opening-bundle-hint').click(() => {
        if (!openingPracticeGame || openingPracticeGame.game_over()) return;
        if (openingPracticeEngineThinking || openingPracticeHintPending) {
            const noteEl = document.getElementById('opening-practice-note');
            if (noteEl) noteEl.innerHTML = '<div style="padding:8px; background:rgba(255,200,100,0.2); border-radius:8px;">⏳ Espera que el motor acabi...</div>';
            return;
        }

        // PRIMER: Intentar usar la pista de l'obertura seleccionada
        const openingHint = getOpeningHint();
        if (openingHint) {
            highlightOpeningHint(openingHint.from, openingHint.to);
            const noteEl = document.getElementById('opening-practice-note');
            if (noteEl) {
                const openingInfo = openingHint.openingName
                    ? `<br><small style="opacity:0.8">📖 ${openingHint.openingName}</small>`
                    : '';
                noteEl.innerHTML = `<div style="padding:12px; background:rgba(76,175,80,0.15); border-left:3px solid var(--accent-green); border-radius:8px;">
                    <strong>💡 Pista d'obertura:</strong> <strong>${openingHint.move}</strong> (${openingHint.from} → ${openingHint.to})${openingInfo}
                </div>`;
            }
            console.log(`[OpeningHint] Pista d'obertura: ${openingHint.move} (${openingHint.openingName || 'sense nom'})`);
            return;
        }

        // SEGON: Si ja tenim la millor jugada calculada per Stockfish, mostrar-la
        if (openingPracticeBestMove && openingPracticeBestMove.length >= 4) {
            const fromSquare = openingPracticeBestMove.substring(0, 2);
            const toSquare = openingPracticeBestMove.substring(2, 4);
            highlightOpeningHint(fromSquare, toSquare);
            const noteEl = document.getElementById('opening-practice-note');
            if (noteEl) {
                noteEl.innerHTML = `<div style="padding:12px; background:rgba(156,39,176,0.15); border-left:3px solid var(--accent-purple); border-radius:8px;">
                    <strong>💡 Pista (Stockfish):</strong> Mou de <strong>${fromSquare}</strong> a <strong>${toSquare}</strong>
                </div>`;
            }
            return;
        }

        // TERCER: Calcular amb Stockfish
        if (!stockfish && !ensureStockfish()) {
            const noteEl = document.getElementById('opening-practice-note');
            if (noteEl) noteEl.innerHTML = '<div style="padding:8px; background:rgba(255,100,100,0.2); border-radius:8px;">❌ Stockfish no disponible</div>';
            return;
        }

        openingPracticeHintPending = true;
        const noteEl = document.getElementById('opening-practice-note');
        if (noteEl) noteEl.innerHTML = '<div style="padding:8px; background:rgba(100,100,255,0.15); border-radius:8px;">🔍 Calculant millor jugada...</div>';

        stockfishRequestor = 'opening-hint';
        try { stockfish.postMessage('setoption name MultiPV value 1'); } catch (e) {}
        stockfish.postMessage(`position fen ${openingPracticeGame.fen()}`);
        stockfish.postMessage('go depth 12');
    });
    $('#btn-opening-bundle-maxim').click(() => {
        void requestOpeningMaximLlull();
    });
    $('#btn-opening-bundle-resign').click(() => {
        showAppConfirm('Vols reiniciar el tauler d\'obertures?', () => {
            openingErrorPracticeActive = false;
            openingLessonActive = false;
            startOpeningPracticeAsColor(openingPracticeUserColor);
            renderOpeningStatsScreen();
            showToast('Tauler reiniciat.', 'info');
        }, { title: 'Reiniciar', confirmText: 'Reiniciar' });
    });
    $('#btn-opening-undo').click(() => {
        undoOpeningPracticeMove();
    });

    $('#btn-reset-league').click(() => {
        if (!guardCalibrationAccess()) return;
        if (!isLeagueUnlocked()) {
            alert(`La lliga s'activa després de ${LEAGUE_UNLOCK_MIN_GAMES} partides un cop calibrat.`);
            return;
        }
        showAppConfirm(
            "Vols reiniciar la lliga actual? Se'n crearà una de nova segons el teu ELO actual.",
            () => {
                createNewLeague(true);
                updateLeagueBanner();
                showToast('Lliga reiniciada.', 'success');
            },
            { title: 'Reiniciar lliga', confirmText: 'Reiniciar' }
        );
    });

    $('#btn-back-stats').click(() => {
        stopHistoryPlayback();
        $('#stats-screen').hide();
        $('#start-screen').show();
        navStack.pop();
    });
    $('#btn-export-adaptation-report, #btn-export-adaptation-report-settings').off('click').on('click', exportAdaptationReport);
    $('#btn-back-settings').click(() => {
        $('#settings-screen').hide();
        $('#start-screen').show();
        navStack.pop();
    });
    $('#btn-back-history').click(() => {
        stopHistoryPlayback();
        $('#history-screen').hide();
        $('#start-screen').show();
        navStack.pop();
    });
    $('#btn-calibration-continue').click(() => {
        $('#calibration-result-screen').hide();
        $('#start-screen').show();
        updateDisplay();
        navStack.pop();
    });

    $('#btn-recalibrate').click(() => {
        showAppConfirm("Això resetarà el teu perfil actual. Vols continuar?", () => {
        userELO = 50;
        currentElo = clampEngineElo(ADAPTIVE_CONFIG.DEFAULT_LEVEL);
        aiDifficulty = levelToDifficulty(currentElo);
        recentGames = [];
        consecutiveWins = 0;
        consecutiveLosses = 0;
        eloHistory = [];
        calibrationGames = [];
        calibrationProfile = null;
        freeAdjustmentWindow = [];
        adjustmentLog = [];
        adaptationReport = [];
        freeLossStreak = 0;
        calibrationRocFloor = null;
        unlockedEloMilestones = [];
        lastAdjustmentQualityAvg = null;
        isCalibrating = true;
        calibratgeComplet = false;
        currentCalibrationOpponentRoc = null;
        saveStorage();
        updateDisplay();
        showToast('Calibratge reiniciat. Comença la nova seqüència de 5 partides.', 'success');
        }, { title: 'Reiniciar calibratge', confirmText: 'Reiniciar' });
    });

    $('#btn-force-update').off('click').on('click', () => {
        if (!('serviceWorker' in navigator)) {
            showToast('El teu navegador no suporta service workers', 'error');
            return;
        }
        showToast('Esborrant memòria cau i recarregant...', 'success');
        // Esborra totes les caches del SW i força una recàrrega hard.
        caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
            .catch(() => {})
            .finally(() => {
                navigator.serviceWorker.getRegistration().then((reg) => {
                    if (reg) reg.unregister().catch(() => {});
                }).catch(() => {}).finally(() => {
                    // Recàrrega hard: el navegador baixa tot des de la xarxa.
                    window.location.reload(true);
                });
            });
    });

    $('#history-play').off('click').on('click', () => { startHistoryPlayback(); });
    $('#history-pause').off('click').on('click', () => { stopHistoryPlayback(); });
    $('#history-prev').off('click').on('click', () => { historyStepBack(); });
    $('#history-next').off('click').on('click', () => { historyStepForward(); });
    $('#history-generate-review').off('click').on('click', () => {
        if (!historyReplay || !historyReplay.entry) return;
        const severeErrors = getEntrySevereErrors(historyReplay.entry);
        void requestOpenAIReview(historyReplay.entry, severeErrors);
    });
    $('#history-export-pgn').off('click').on('click', () => {
        if (!historyReplay || !historyReplay.entry) { showToast('Selecciona una partida primer', 'warn'); return; }
        const pgn = buildEntryPgn(historyReplay.entry);
        if (!pgn) { showToast('Aquesta partida no té moviments per exportar', 'warn'); return; }
        const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `eltauler_partida_${(historyReplay.entry.date || 'partida').replace(/[^0-9a-zA-Z]/g, '-')}.pgn`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('PGN exportat ♟', 'success');
    });
    $('#history-share-pgn').off('click').on('click', async () => {
        if (!historyReplay || !historyReplay.entry) { showToast('Selecciona una partida primer', 'warn'); return; }
        const pgn = buildEntryPgn(historyReplay.entry);
        if (!pgn) { showToast('Aquesta partida no té moviments per compartir', 'warn'); return; }
        if (navigator.share) {
            try { await navigator.share({ title: 'El Tauler - Partida', text: pgn }); }
            catch (e) { /* cancel·lat */ }
        } else if (navigator.clipboard) {
            try { await navigator.clipboard.writeText(pgn); showToast('PGN copiat al porta-retalls', 'success'); }
            catch (e) { showToast('No s\'ha pogut compartir en aquest dispositiu', 'warn'); }
        } else {
            showToast('No s\'ha pogut compartir en aquest dispositiu', 'warn');
        }
    });
    $('#result-indicator').off('click').on('click', () => {
        if (!lastReviewSnapshot) return;
        showPostGameReview(
            lastReviewSnapshot.msg,
            lastReviewSnapshot.finalPrecision,
            lastReviewSnapshot.counts,
            null,
            { showCheckmate: lastReviewSnapshot.showCheckmate }
        );
    });

    $('#font-size-range').off('input change').on('input change', function() {
        applyFontSize(+this.value);
    });

    $('#control-mode-select').off('change').on('change', function() {
        const mode = $(this).val();
        const shouldRebuild = $('#game-screen').is(':visible');
        applyControlMode(mode, { save: true, rebuild: shouldRebuild });
    });

    // Mode de validació del Bundle (Revisió d'errors)
    $('#bundle-accept-select').off('change').on('change', function() {
        saveBundleAcceptMode($(this).val());
    });

    // Rellotge de la nova partida (lliure/assistida): es tria abans de cada partida i
    // comença sempre a "sense rellotge".
    $('#new-game-tc-select').off('change').on('change', function() {
        pendingFreeTimeControl = $(this).val() || 'none';
    });

    // Rellotge de la lliga: només es pot triar abans de jugar el primer partit; un cop
    // començada, queda fixat per a tota la temporada i el selector es bloqueja.
    $('#league-tc-select').off('change').on('change', function() {
        if (!currentLeague || isLeagueTimeControlLocked()) { renderLeagueTimeControl(); return; }
        currentLeague.timeControl = $(this).val() || 'none';
        saveStorage();
        renderLeagueTimeControl();
    });

    // Analitza la posició actual
    $('#btn-analyze').off('click').on('click', requestPositionAnalysis);

    // --- Sincronització al núvol ---
    $('#btn-cloud-signin').off('click').on('click', () => {
        if (window.CloudSync) window.CloudSync.signIn();
    });
    $('#btn-cloud-signout').off('click').on('click', () => {
        if (window.CloudSync) window.CloudSync.signOut();
    });
    $('#btn-cloud-sync-now').off('click').on('click', () => {
        if (window.CloudSync) window.CloudSync.syncNow();
    });
    // Botó d'emergència de la pantalla inicial (recupera dades abans del calibratge).
    $('#btn-cloud-recover').off('click').on('click', () => {
        if (window.CloudSync && window.CloudSync.isConfigured()) window.CloudSync.signIn();
    });
    updateCloudSyncUI();
    updateCloudRecoverButton();

    $('#opening-practice-mode-select').off('change').on('change', function() {
        openingPracticeOpponentMode = ($(this).val() === 'adaptive') ? 'adaptive' : 'theory';
        startOpeningPracticeAsColor(openingPracticeUserColor);
        updateOpeningPracticeStatus();
    });

    $('#opening-practice-color-select').off('change').on('change', function() {
        startOpeningPracticeAsColor($(this).val() === 'b' ? 'b' : 'w');
    });

    $('#epaper-toggle').off('change').on('change', function() {
        applyEpaperMode($(this).is(':checked'));
    });

    $('#daymode-toggle').off('change').on('change', function() {
        applyDayMode($(this).is(':checked'));
    });

    $('#board-theme-select').off('change').on('change', function() {
        applyBoardTheme($(this).val());
    });

    $('#piece-theme-select').off('change').on('change', function() {
        applyPieceTheme($(this).val());
    });

    $('#lucky-toggle').off('change').on('change', function() {
        applyLuckyMode($(this).is(':checked'));
    });

    $('#btn-show-delete').click(() => { $('#confirm-delete-panel').slideDown(); });
    $('#btn-cancel-delete').click(() => { $('#confirm-delete-panel').slideUp(); });
    
    $('#btn-confirm-delete').click(() => {
        showAppConfirm('Estàs completament segur? Aquesta acció NO es pot desfer i perdràs TOTES les teves dades.', () => {
            localStorage.clear();
            saveEpaperPreference(epaperEnabled);
            applyControlMode(getDefaultControlMode(), { save: true, rebuild: false });
            userELO = 50; savedErrors = []; currentStreak = 0; lastPracticeDate = null;
            todayCompleted = false; totalStars = 0; todayMissions = []; missionsDate = null; unlockedBadges = [];
            sessionStats = { 
                gamesPlayed: 0, gamesWon: 0, bundlesSolved: 0, 
                bundlesSolvedLow: 0, bundlesSolvedMed: 0, bundlesSolvedHigh: 0,
                highPrecisionGames: 0, perfectGames: 0, blackWins: 0,
                leagueGamesPlayed: 0, freeGamesPlayed: 0
            };
            eloHistory = []; totalGamesPlayed = 0; totalWins = 0; maxStreak = 0;
            currentElo = clampEngineElo(userELO);
            aiDifficulty = levelToDifficulty(currentElo); recentGames = []; consecutiveWins = 0; consecutiveLosses = 0;
            isCalibrating = true; calibrationGames = []; calibrationProfile = null; calibratgeComplet = false;
            currentLeague = null; leagueActiveMatch = null;
            reviewHistory = []; currentReview = []; gameHistory = []; adaptationReport = [];
            completedOpenings = []; tacticsStats = { solved: 0, attempts: 0, best: 0, streak: 0 };
            saveStorage(); generateDailyMissions(); updateDisplay();
            $('#settings-screen').hide(); $('#start-screen').show(); $('#confirm-delete-panel').hide();
            showToast("S'han esborrat totes les dades. Torna a començar!", 'success');
        }, { title: 'Esborrar totes les dades', confirmText: 'Esborrar-ho tot' });
    });
    
    $('#btn-hint').click(() => {
    if (game.game_over()) return;
    
    // En mode bundle, usar la jugada pre-calculada
    if (blunderMode && bundleFixedSequence) {
        const step = bundleSequenceStep;
        const expectedMove = step === 1 
            ? bundleFixedSequence.step1.playerMove 
            : bundleFixedSequence.step2.playerMove;
        if (expectedMove && expectedMove.length >= 4) {
            const toSquare = expectedMove.substring(2, 4);
            $('.square-55d63').removeClass('highlight-hint');
            $(`#myBoard .square-55d63[data-square='${toSquare}']`).addClass('highlight-hint');
            $('#status').text(`Pista: Alguna peça ha d'anar a ${toSquare}`);
        }
        return;
    }
    
    // Comportament normal per partides
    if (!stockfish && !ensureStockfish()) { 
        $('#status').text("Motor Stockfish no disponible").css('color', '#c62828'); 
        return; 
    }
    isAnalyzingHint = true;
    $('#status').text("Buscant objectiu clau...");
    stockfish.postMessage(`position fen ${game.fen()}`);
    stockfish.postMessage('go depth 15');
});

    $('#btn-brain-hint').click(() => {
        void requestOpenAIBundleHint();
    });

    $('#btn-assisted-hint').click(() => {
        void requestAssistedHint();
    });

    $('#btn-assisted-game').click(() => {
        if (!guardCalibrationAccess()) return;
        window._startAssistedGame = true;
        startGame(false);
    });

    $('#btn-srs-review').click(() => startSrsReview());
    $('#btn-daily-puzzle').click(() => startDailyPuzzle());
    $('#btn-tactics').click(() => {
        // Reset de ratxa quan s'inicia des del menú (no des de "Una altra")
        tacticsStats.streak = 0;
        startTacticsPuzzle();
    });

    $(document).on('click', '.eng-cta', function() {
        const action = $(this).attr('data-eng-action');
        if (action === 'daily') startDailyPuzzle();
        else if (action === 'srs') startSrsReview();
        else { if (!guardCalibrationAccess()) return; window._startAssistedGame = false; startGame(false); }
    });

    $('#btn-smart-share').click(async () => {
   const data = buildBackupData();
        const filename = `eltauler_backup_${totalStars}stars.json`;
        if (supportsDirectoryPicker()) {
            const savedFile = await writeBackupToDirectory(data, filename, { forceDirectorySelection: true });
            if (savedFile) {
                alert('Backup guardat a la carpeta seleccionada.');
            }
        }
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const file = new File([blob], filename, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ files: [file], title: 'El Tauler - Progrés', text: `ELO: ${userELO} | ★${totalStars}` }); } 
            catch (e) { console.log('Cancel·lat'); }
        }
    });

    $('#btn-export').click(() => {
             const data = buildBackupData({ includeGameHistory: true });
        const filename = `eltauler_backup_${totalStars}stars.json`;
        if (supportsDirectoryPicker()) {
            writeBackupToDirectory(data, filename, { prompt: false })
                .then((savedFile) => {
                    if (savedFile) {
                        alert('Backup guardat a la carpeta seleccionada.');
                        return;
                    }
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
                    URL.revokeObjectURL(url);
                })
                .catch(() => {
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
                    URL.revokeObjectURL(url);
                });
            return;
        }        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    });

      $('#btn-import').click(() => {
        $('#file-input').click();
    });
    if (BACKUP_FILE_ACCEPT) $('#file-input').attr('accept', BACKUP_FILE_ACCEPT);
    else $('#file-input').removeAttr('accept');
    $('#file-input').change(async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        await handleBackupImportFile(file);
        e.target.value = '';
    });

    // Click per desfer
    $('#blunder-alert').click(() => {
        if (engineMoveTimeout) clearTimeout(engineMoveTimeout);

        if (game && game.game_over()) {
            if (lastReviewSnapshot) {
                showPostGameReview(
                    lastReviewSnapshot.msg,
                    lastReviewSnapshot.finalPrecision,
                    lastReviewSnapshot.counts,
                    null,
                    { showCheckmate: lastReviewSnapshot.showCheckmate }
                );
            }
            $('#blunder-alert').hide();
            return;
        }
        
        const targetFen = lastPosition || null;
        if (targetFen) {
            game.load(targetFen);
        } else {
            game.undo();
        }

        board.position(game.fen());
        $('#blunder-alert').hide();

        $('.square-55d63').removeClass('highlight-hint tap-selected tap-move');
        clearEngineMoveHighlights();
        clearTapSelection();

        if (blunderMode && currentBundleFen) {
            $('#status').text("Prova una altra jugada");
        } else {
            $('#status').text("Rectifica... (+0)");
            waitingForBlunderAnalysis = false;
            pendingMoveEvaluation = false;
        }
    });

     const showMenuExitModal = () => {
        const message = leagueActiveMatch
            ? "Sortir de la partida de lliga? Comptarà com a derrota."
            : "Vols sortir de la partida?";
        $('#menu-exit-message').text(message);
        $('#menu-exit-modal').css('display', 'flex');
        pauseGameClock();
    };

    const hideMenuExitModal = () => {
        $('#menu-exit-modal').hide();
        resumeGameClock();
    };

    $('#btn-back').click(() => {
       showMenuExitModal();
    });

    const showResignModal = () => {
        // No permetre rendir-se si el joc ja ha acabat
        if (!game || game.game_over()) return;
        $('#resign-modal').css('display', 'flex');
        pauseGameClock();
    };

    const hideResignModal = () => {
        $('#resign-modal').hide();
        resumeGameClock();
    };

    $('#btn-resign').click(() => {
        showResignModal();
    });

    onModalAction('#btn-resign-confirm', () => {
        hideResignModal();
        // Es difereix perquè el modal es tanqui a l'instant; el processament
        // pesat del final de partida no ha de bloquejar el repintat.
        runAfterPaint(() => handleGameOver(true));
    });

    onModalAction('#btn-resign-cancel', () => {
        hideResignModal();
    });

    onModalAction('#resign-modal', (event) => {
        if (event.target.id === 'resign-modal') {
            hideResignModal();
        }
    });

    onModalAction('#btn-menu-exit-confirm', () => {
        hideMenuExitModal();
        if (leagueActiveMatch) {
            runAfterPaint(() => handleGameOver(true));
            return;
        }
        $('#game-screen').removeClass('active').hide();
        $('#start-screen').show();
        navStack.pop();
        if (stockfish) stockfish.postMessage('stop');
    });

    onModalAction('#btn-menu-exit-cancel', () => {
        hideMenuExitModal();
    });

    onModalAction('#menu-exit-modal', (event) => {
        if (event.target.id === 'menu-exit-modal') {
            hideMenuExitModal();
        }
    });

    $('#btn-bundle-menu').click(() => {
        if (!guardCalibrationAccess()) return;
        showBundleMenu();
    });
}


/* ===================== ENTRENADOR INVISIBLE DE CREIXEMENT ===================== */
function normalizeGrowthTheme(theme) {
    const raw = (theme || 'general').toString().toLowerCase();
    const aliases = {
        king: 'king_attack',
        attack: 'king_attack',
        obertura: 'opening',
        opening_error: 'opening',
        final: 'endgame',
        endgames: 'endgame',
        fork_tactic: 'fork',
        pins: 'pin'
    };
    const normalized = aliases[raw] || raw;
    return Object.prototype.hasOwnProperty.call(THEME_MASTERY_DEFAULTS, normalized) ? normalized : 'general';
}

function getThemeLabel(theme) {
    const labels = {
        fork: 'forquilla',
        pin: 'clavada',
        skewer: 'raig X',
        king_attack: 'atac al rei',
        material: 'material',
        center: 'centre',
        opening: 'obertura',
        endgame: 'final',
        general: 'joc general'
    };
    return labels[normalizeGrowthTheme(theme)] || 'joc general';
}

function loadThemeMastery() {
    const stored = readJsonStorage(THEME_MASTERY_KEY, {});
    themeMastery = { ...THEME_MASTERY_DEFAULTS };
    Object.keys(themeMastery).forEach(theme => {
        const value = parseFloat(stored?.[theme]);
        themeMastery[theme] = isNaN(value) ? 0 : clamp01(value);
    });
    return themeMastery;
}

function saveThemeMastery() {
    writeJsonStorage(THEME_MASTERY_KEY, themeMastery);
}

function updateThemeMastery(theme, result, meta = {}) {
    const key = normalizeGrowthTheme(theme);
    if (!themeMastery || typeof themeMastery !== 'object') loadThemeMastery();
    const severity = meta.severity || null;
    const source = meta.source || null;
    let delta = 0;

    if (result === 'real_game_error') {
        delta = severity === 'high' ? -0.08 : severity === 'med' ? -0.05 : -0.03;
    } else if (result === 'personal_hieroglyphic_solved') {
        delta = 0.06;
    } else if (result === 'srs_solved') {
        delta = 0.08;
    } else if (result === 'srs_failed') {
        delta = -0.05;
    } else if (result === 'weakness_solved') {
        delta = 0.05;
    } else if (result === 'tactics_solved') {
        delta = 0.04;
    } else if (result === 'opening_solved') {
        delta = 0.05;
    } else if (result === 'solved' || result === 'success') {
        delta = source === 'srs' ? 0.08 : 0.04;
    } else if (result === 'failed' || result === 'error') {
        delta = source === 'srs' ? -0.05 : -0.04;
    }

    if (meta.differentDayBonus) delta += 0.01;
    themeMastery[key] = clamp01((themeMastery[key] || 0) + delta);
    saveThemeMastery();
    return themeMastery[key];
}

function loadGrowthStats() {
    const stored = readJsonStorage(GROWTH_STATS_KEY, {});
    growthStats = Object.assign({
        tasksRecommended: 0,
        tasksStarted: 0,
        tasksCompleted: 0,
        personalErrorsConverted: 0,
        srsCompleted: 0,
        weaknessSessionsCompleted: 0,
        openingDrillsCompleted: 0,
        mateDrillsCompleted: 0,
        lastRecommendedAt: null
    }, stored && typeof stored === 'object' ? stored : {});
    return growthStats;
}

function saveGrowthStats() {
    writeJsonStorage(GROWTH_STATS_KEY, growthStats);
}

function updateGrowthStats(event, task) {
    if (!growthStats || typeof growthStats !== 'object') loadGrowthStats();
    if (event === 'recommended') {
        growthStats.tasksRecommended = (growthStats.tasksRecommended || 0) + 1;
        growthStats.lastRecommendedAt = Date.now();
    } else if (event === 'started') {
        growthStats.tasksStarted = (growthStats.tasksStarted || 0) + 1;
    } else if (event === 'completed') {
        growthStats.tasksCompleted = (growthStats.tasksCompleted || 0) + 1;
        if (task?.type === 'personal_hieroglyphic') growthStats.personalErrorsConverted = (growthStats.personalErrorsConverted || 0) + 1;
        if (task?.type === 'srs_review') growthStats.srsCompleted = (growthStats.srsCompleted || 0) + 1;
        if (task?.type === 'weakness_training') growthStats.weaknessSessionsCompleted = (growthStats.weaknessSessionsCompleted || 0) + 1;
    }
    saveGrowthStats();
}

function loadGrowthTaskHistory() {
    const stored = readJsonStorage(GROWTH_TASK_HISTORY_KEY, []);
    return Array.isArray(stored) ? stored : [];
}

function saveGrowthTaskHistory(history) {
    writeJsonStorage(GROWTH_TASK_HISTORY_KEY, Array.isArray(history) ? history.slice(0, 20) : []);
}

function rememberGrowthTask(task) {
    if (!task) return;
    const history = loadGrowthTaskHistory();
    history.unshift({
        type: task.type,
        theme: normalizeGrowthTheme(task.theme),
        fen: task.fen || null,
        timestamp: Date.now()
    });
    saveGrowthTaskHistory(history.slice(0, 20));
}

function wasRecentlyRecommended(task) {
    if (!task) return false;
    const history = loadGrowthTaskHistory();
    const sameFen = task.fen && history.slice(0, 5).some(item => item.fen === task.fen && item.type === task.type);
    const recentThemes = history.slice(0, 3);
    const sameThemeStreak = task.theme && recentThemes.length >= 3 && recentThemes.every(item => item.theme === normalizeGrowthTheme(task.theme));
    return !!(sameFen || sameThemeStreak);
}

function severityRank(severity) {
    if (severity === 'high' || severity === 'blunder' || severity === 'critical') return 3;
    if (severity === 'med' || severity === 'mistake') return 2;
    if (severity === 'low' || severity === 'inaccuracy') return 1;
    return 0;
}

function normalizeSeverity(severity) {
    const rank = severityRank(severity);
    return rank >= 3 ? 'high' : rank === 2 ? 'med' : rank === 1 ? 'low' : null;
}

function getTaskTheme(fen, bestMove, fallback = 'general') {
    try {
        if (typeof classifyPositionTheme === 'function') return normalizeGrowthTheme(classifyPositionTheme(fen, bestMove || ''));
    } catch (e) {}
    return normalizeGrowthTheme(fallback);
}

function createGrowthTask(overrides = {}) {
    const task = Object.assign({
        type: 'free_game',
        title: 'Juga una partida amb intenció',
        message: '',
        cta: 'Jugar igualment',
        reason: 'Encara no hi ha cap urgència clara.',
        theme: null,
        fen: null,
        bestMove: null,
        playerMove: null,
        severity: null,
        source: 'default',
        growthScore: 0,
        action: 'start_free_game',
        pedagogicalValue: 0.5,
        dueAt: null,
        occurrences: 0
    }, overrides);
    task.theme = task.theme ? normalizeGrowthTheme(task.theme) : null;
    task.severity = normalizeSeverity(task.severity);
    return task;
}

function buildLastGameErrorCandidates() {
    const candidates = [];
    const sources = [];
    (currentGameErrors || []).forEach(err => sources.push(err));
    const latest = gameHistory && gameHistory.length ? gameHistory[gameHistory.length - 1] : null;
    if (latest && Array.isArray(latest.errors)) latest.errors.forEach(err => sources.push(err));
    if (latest && Array.isArray(latest.moveReviews)) {
        latest.moveReviews
            .filter(r => ['blunder', 'mistake'].includes(r.quality) || (r.swing || 0) >= 120)
            .forEach(r => sources.push(Object.assign({}, r, { severity: r.quality === 'blunder' ? 'high' : 'med' })));
    }
    const seen = new Set();
    sources.forEach(err => {
        if (!err || !err.fen || !err.bestMove) return;
        const key = `${err.fen}|${err.bestMove}`;
        if (seen.has(key)) return;
        seen.add(key);
        const severity = normalizeSeverity(err.severity || err.quality || ((err.swing || 0) >= 200 ? 'high' : 'med'));
        const theme = getTaskTheme(err.fen, err.bestMove, err.theme || 'general');
        candidates.push(createGrowthTask({
            type: 'personal_hieroglyphic',
            title: 'Desxifra el teu error',
            cta: 'Desxifrar',
            reason: severity === 'high' ? 'Error greu detectat a l’última partida.' : 'Una posició recent encara pot donar-te una lliçó clara.',
            theme,
            fen: err.fen,
            bestMove: err.bestMove,
            playerMove: err.playerMove || null,
            severity,
            source: 'last_game',
            action: 'start_personal_hieroglyphic',
            pedagogicalValue: severity === 'high' ? 0.95 : 0.82,
            occurrences: 1,
            raw: err
        }));
    });
    return candidates;
}

function buildDueSrsCandidates() {
    const now = Date.now();
    return (typeof getDueErrors === 'function' ? getDueErrors() : [])
        .filter(err => err && err.fen)
        .map(err => {
            const theme = getTaskTheme(err.fen, err.bestMove || '', err.theme || 'general');
            const overdueDays = Math.max(0, (now - getErrorDueTime(err)) / 86400000);
            return createGrowthTask({
                type: 'srs_review',
                title: 'Repàs pendent',
                cta: 'Repassar',
                reason: overdueDays >= 1 ? 'Aquest error ja ha vençut a la repetició espaiada.' : 'Toca consolidar un error abans que es refredi.',
                theme,
                fen: err.fen,
                bestMove: err.bestMove || null,
                playerMove: err.playerMove || null,
                severity: err.severity || null,
                source: 'srs',
                action: 'start_srs_review',
                dueAt: getErrorDueTime(err),
                pedagogicalValue: 0.9,
                occurrences: (err.srsReps || 0) + 1,
                raw: err
            });
        });
}

function collectAllTrainingErrors() {
    const errors = [];
    (savedErrors || []).forEach(e => errors.push(e));
    (gameHistory || []).forEach(entry => {
        (entry.errors || []).forEach(e => errors.push(e));
        (entry.moveReviews || [])
            .filter(r => ['blunder', 'mistake', 'inaccuracy'].includes(r.quality) || (r.swing || 0) >= 80)
            .forEach(r => errors.push(Object.assign({}, r, { severity: r.severity || r.quality })));
    });
    return errors;
}

function buildWeaknessCandidates() {
    const byTheme = {};
    collectAllTrainingErrors().forEach(err => {
        if (!err || !err.fen) return;
        const theme = getTaskTheme(err.fen, err.bestMove || '', err.theme || 'general');
        if (theme === 'opening') return;
        if (!byTheme[theme]) byTheme[theme] = { count: 0, severe: 0, example: err };
        byTheme[theme].count++;
        byTheme[theme].severe += severityRank(err.severity || err.quality);
        if (severityRank(err.severity || err.quality) > severityRank(byTheme[theme].example?.severity || byTheme[theme].example?.quality)) byTheme[theme].example = err;
    });
    return Object.keys(byTheme)
        .filter(theme => byTheme[theme].count >= 2)
        .map(theme => {
            const data = byTheme[theme];
            return createGrowthTask({
                type: 'weakness_training',
                title: `Reforça ${getThemeLabel(theme)}`,
                cta: 'Entrenar debilitat',
                reason: `Aquest patró surt repetit (${data.count} vegades) al teu historial.`,
                theme,
                fen: data.example?.fen || null,
                bestMove: data.example?.bestMove || null,
                playerMove: data.example?.playerMove || null,
                severity: data.severe / Math.max(1, data.count) >= 2.2 ? 'high' : 'med',
                source: 'weakness',
                action: 'start_weakness_training',
                occurrences: data.count,
                pedagogicalValue: Math.min(1, 0.65 + data.count * 0.05)
            });
        });
}

function buildOpeningWeaknessCandidates() {
    const openingErrors = [];
    collectAllTrainingErrors().forEach(err => {
        if (!err || !err.fen) return;
        let fullmove = 20;
        try { fullmove = parseInt((err.fen || '').split(' ')[5], 10) || 20; } catch (e) {}
        const theme = getTaskTheme(err.fen, err.bestMove || '', err.theme || (fullmove <= 10 ? 'opening' : 'general'));
        if (fullmove <= 10 || theme === 'opening') openingErrors.push(err);
    });
    if (!openingErrors.length) return [];
    const best = openingErrors.slice().sort((a, b) => severityRank(b.severity || b.quality) - severityRank(a.severity || a.quality))[0];
    return [createGrowthTask({
        type: 'opening_training',
        title: 'Reforça l’obertura',
        cta: 'Practicar obertura',
        reason: openingErrors.length >= 2 ? 'Hi ha errors recurrents en les primeres jugades.' : 'Una desviació d’obertura recent mereix reforç.',
        theme: 'opening',
        fen: best?.fen || null,
        bestMove: best?.bestMove || null,
        playerMove: best?.playerMove || null,
        severity: best?.severity || best?.quality || 'med',
        source: 'opening',
        action: 'start_opening_training',
        occurrences: openingErrors.length,
        pedagogicalValue: openingErrors.length >= 2 ? 0.85 : 0.62
    })];
}

function buildVarietyCandidates() {
    const history = loadGrowthTaskHistory();
    const lastTypes = history.slice(0, 5).map(item => item.type);
    const lowVariety = lastTypes.length >= 3 && new Set(lastTypes).size <= 2;
    const attempts = tacticsStats?.attempts || 0;
    const solved = tacticsStats?.solved || 0;
    const tacticSuccess = attempts ? solved / attempts : 0.5;
    if (!lowVariety && attempts >= 3 && tacticSuccess >= 0.75) return [];
    return [createGrowthTask({
        type: 'tactics',
        title: 'Canvia el ritme amb una tàctica',
        cta: 'Fer tàctica',
        reason: lowVariety ? 'Una mica de varietat evita entrenar sempre el mateix patró.' : 'Una tàctica curta manté viu el càlcul.',
        theme: 'general',
        source: 'history',
        action: 'start_tactics',
        pedagogicalValue: 0.58,
        occurrences: 0
    })];
}

function buildDefaultTrainingTask() {
    return createGrowthTask({
        type: 'free_game',
        title: 'Partida amb objectiu',
        message: 'Juga una partida normal: el mestre observarà els patrons per preparar el següent entrenament.',
        cta: 'Jugar igualment',
        reason: 'Encara no hi ha prou dades urgents per prescriure un exercici concret.',
        theme: 'general',
        source: 'default',
        action: 'start_free_game',
        pedagogicalValue: 0.45
    });
}

function getWeaknessWeight(theme) {
    const key = normalizeGrowthTheme(theme);
    const data = typeof analyzeWeaknesses === 'function' ? analyzeWeaknesses() : null;
    const total = data?.total || 0;
    const legacyTheme = key === 'king_attack' ? 'king' : key;
    const count = (data?.theme?.[key] || data?.theme?.[legacyTheme] || 0);
    const masteryGap = 1 - (themeMastery?.[key] ?? 0);
    return clamp01((total ? count / Math.max(1, total) : 0) * 0.65 + masteryGap * 0.35);
}

function getDueWeight(task) {
    if (!task || task.type !== 'srs_review') return 0;
    const dueAt = typeof task.dueAt === 'number' ? task.dueAt : 0;
    const overdueDays = Math.max(0, (Date.now() - dueAt) / 86400000);
    return clamp01(0.7 + overdueDays * 0.1);
}

function getSeverityWeight(task) {
    const rank = severityRank(task?.severity);
    return rank === 3 ? 1 : rank === 2 ? 0.65 : rank === 1 ? 0.35 : 0.15;
}

function estimateUserSuccess(task) {
    const elo = typeof currentElo === 'number' ? currentElo : (typeof userELO === 'number' ? userELO : 700);
    const normalizedElo = clamp01((elo - 200) / 1800);
    const mastery = task?.theme ? (themeMastery?.[normalizeGrowthTheme(task.theme)] ?? 0.35) : 0.45;
    const severityPenalty = severityRank(task?.severity) * 0.08;
    const typePenalty = task?.type === 'personal_hieroglyphic' ? 0.08 : task?.type === 'srs_review' ? 0.02 : 0.04;
    return clamp01(0.42 + normalizedElo * 0.18 + mastery * 0.38 - severityPenalty - typePenalty);
}

function getChallengeFit(task) {
    const expected = estimateUserSuccess(task);
    const distance = Math.abs(expected - TARGET_SUCCESS_RATE);
    return clamp01(1 - distance / 0.45);
}

function getNoveltyWeight(task) {
    if (!task) return 0.5;
    const history = loadGrowthTaskHistory();
    if (!history.length) return 1;
    let novelty = 1;
    if (task.fen && history.slice(0, 10).some(item => item.fen === task.fen)) novelty -= 0.45;
    if (task.theme && history.slice(0, 3).every(item => item.theme === normalizeGrowthTheme(task.theme))) novelty -= 0.35;
    if (history[0]?.type === task.type) novelty -= 0.15;
    return clamp01(novelty);
}

function scoreGrowthTask(task) {
    const weaknessWeight = Math.max(getWeaknessWeight(task.theme), clamp01((task.occurrences || 0) / 6));
    const dueWeight = getDueWeight(task);
    const severityWeight = getSeverityWeight(task);
    const challengeFit = getChallengeFit(task);
    const noveltyWeight = getNoveltyWeight(task);
    let growthScore = weaknessWeight * 0.35 + dueWeight * 0.25 + severityWeight * 0.20 + challengeFit * 0.15 + noveltyWeight * 0.05;
    growthScore += (task.pedagogicalValue || 0) * 0.08;
    if (task.type === 'srs_review') growthScore += 0.08;
    if (task.type === 'personal_hieroglyphic' && task.severity === 'high') growthScore += 0.09;
    if (wasRecentlyRecommended(task) && !(task.type === 'srs_review' || task.severity === 'high')) growthScore -= 0.25;
    return Math.round(clamp01(growthScore) * 100) / 100;
}

function buildGrowthTaskMessage(task) {
    if (!task) return '';
    const themeLabel = getThemeLabel(task.theme);
    const fragmentsByType = {
        personal_hieroglyphic: [
            `Has deixat escapar una idea de ${themeLabel}. La desxifrem?`,
            `Aquest error encara té una lliçó amagada.`,
            `Converteix aquest error en coneixement.`
        ],
        srs_review: [
            `Toca repassar ${themeLabel}; és el moment exacte perquè quedi fixat.`,
            `Aquest patró torna a trucar a la porta. Fem-lo teu.`,
            `La memòria et demana un repàs curt de ${themeLabel}.`
        ],
        weakness_training: [
            `La partida t’ha mostrat una esquerda: ${themeLabel}. Vols tancar-la?`,
            `Toca reforçar ${themeLabel}; és el patró que més es repeteix.`,
            `Entrena ${themeLabel} ara que el patró és fresc.`
        ],
        opening_training: [
            `Les primeres jugades estan deixant pistes. Reforcem l’obertura.`,
            `Una obertura més sòlida farà que el mig joc sigui més fàcil.`,
            `Tanca aquesta esquerda d’obertura abans de la propera partida.`
        ],
        tactics: [
            `Canviem el ritme amb una tàctica curta i precisa.`,
            `Una espurna de càlcul ara et farà veure més patrons.`,
            `Fem una tàctica ràpida per mantenir les peces despertes.`
        ],
        free_game: [
            `Juga una partida normal: cada decisió alimentarà el teu pròxim entrenament.`,
            `No hi ha cap urgència clara; juguem i deixem que la partida ens ensenyi.`,
            `La millor pràctica ara és una partida amb atenció plena.`
        ]
    };
    const list = fragmentsByType[task.type] || fragmentsByType.free_game;
    const seed = hashStr(`${task.type}|${task.theme || ''}|${task.fen || ''}|${getToday()}`);
    return list[seed % list.length];
}

function getNextBestTrainingTask(options = {}) {
    loadThemeMastery();
    const candidates = []
        .concat(buildDueSrsCandidates())
        .concat(buildLastGameErrorCandidates())
        .concat(buildWeaknessCandidates())
        .concat(buildOpeningWeaknessCandidates())
        .concat(buildVarietyCandidates());

    const defaultTask = buildDefaultTrainingTask();
    const scored = candidates
        .filter(Boolean)
        .map(task => Object.assign(task, { growthScore: scoreGrowthTask(task) }))
        .sort((a, b) => b.growthScore - a.growthScore);

    let best = scored[0] || defaultTask;
    if (scored.length > 1 && wasRecentlyRecommended(best) && !(best.type === 'srs_review' || best.severity === 'high')) {
        const alternative = scored.find(task => !wasRecentlyRecommended(task));
        if (alternative) best = alternative;
    }
    best.growthScore = scoreGrowthTask(best);
    if (!best.message) best.message = buildGrowthTaskMessage(best);
    currentGrowthTask = best;
    if (!options.previewOnly) {
        rememberGrowthTask(best);
        updateGrowthStats('recommended', best);
        // skipSave permet a qui crida (p. ex. handleGameOver) ajornar el
        // saveStorage pesat a un bloc diferit i evitar desar dues vegades.
        if (!options.skipSave) saveStorage();
    }
    return best;
}

function executeGrowthTask(task) {
    const selected = task || currentGrowthTask || getNextBestTrainingTask({ previewOnly: true });
    if (!selected) return;
    currentGrowthTask = selected;
    updateGrowthStats('started', selected);
    try {
        if (selected.type === 'personal_hieroglyphic') {
            if (typeof startPersonalHieroglyphicFromTask === 'function') return startPersonalHieroglyphicFromTask(selected);
            if (typeof startPersonalHieroglyphicFromLastGame === 'function') return startPersonalHieroglyphicFromLastGame();
            if (selected.fen && typeof startGame === 'function') return startGame(true, selected.fen);
            showToast('No he trobat cap motor de jeroglífic personal disponible.', 'warn');
        } else if (selected.type === 'srs_review') {
            if (typeof startSrsReview === 'function') return startSrsReview();
            showToast('El repàs SRS no està disponible ara mateix.', 'warn');
        } else if (selected.type === 'weakness_training') {
            if (typeof startWeaknessTraining === 'function') return startWeaknessTraining(selected.theme);
            showToast('L’entrenament de debilitats no està disponible ara mateix.', 'warn');
        } else if (selected.type === 'opening_training') {
            if (typeof startOpeningErrorPractice === 'function' && selected.openingColor && selected.openingMoveNum) return startOpeningErrorPractice(selected.openingColor, selected.openingMoveNum);
            if (typeof renderOpeningStatsScreen === 'function') {
                $('#start-screen,#game-screen,#history-screen,#league-screen,#stats-screen,#settings-screen,#calibration-result-screen').hide();
                $('#opening-screen').show();
                navPush('opening-screen');
                renderOpeningStatsScreen();
                setOpeningScreenMode('overview');
                return;
            }
            showToast('La pràctica d’obertures no està disponible ara mateix.', 'warn');
        } else if (selected.type === 'tactics') {
            if (typeof startTacticsPuzzle === 'function') return startTacticsPuzzle();
            showToast('Les tàctiques no estan disponibles ara mateix.', 'warn');
        } else {
            if (typeof novaPartida === 'function') return novaPartida();
            if (typeof startGame === 'function') return startGame(false);
            showToast('No puc iniciar una partida ara mateix.', 'warn');
        }
    } catch (e) {
        console.error('No s’ha pogut executar la recomanació', e);
        showToast('No he pogut iniciar aquesta recomanació. Pots jugar igualment.', 'warn');
    }
}

function markGrowthTaskCompleted(task, result) {
    const completedTask = task || currentGrowthTask;
    if (!completedTask) return;
    updateGrowthStats('completed', completedTask);
    const theme = completedTask.theme || 'general';
    if (completedTask.type === 'personal_hieroglyphic' && result !== 'failed') updateThemeMastery(theme, 'personal_hieroglyphic_solved', completedTask);
    else if (completedTask.type === 'srs_review') updateThemeMastery(theme, result === 'failed' ? 'srs_failed' : 'srs_solved', completedTask);
    else if (completedTask.type === 'weakness_training') updateThemeMastery(theme, result === 'failed' ? 'failed' : 'weakness_solved', completedTask);
    else if (completedTask.type === 'opening_training') updateThemeMastery('opening', result === 'failed' ? 'failed' : 'opening_solved', completedTask);
    else if (completedTask.type === 'tactics') updateThemeMastery(theme, result === 'failed' ? 'failed' : 'tactics_solved', completedTask);
    saveStorage();
}

function renderGrowthRecommendation(task, onClose) {
    const modeAtRender = currentGameMode;
    const modal = $('#review-modal');
    if (!modal.length) return;
    let box = $('#review-growth-recommendation');
    if (!box.length) {
        box = $(`
            <div class="review-growth-recommendation" id="review-growth-recommendation" style="margin:14px 0; padding:14px; border:1px solid rgba(201,162,39,.35); border-radius:12px; background:rgba(201,162,39,.08); text-align:left;">
                <div class="growth-rec-kicker" style="font-size:.78rem; text-transform:uppercase; letter-spacing:.08em; color:var(--accent-gold); font-weight:700;">Recomanació del mestre</div>
                <div class="growth-rec-title" style="font-weight:700; margin-top:6px;"></div>
                <div class="growth-rec-message" style="margin-top:6px; color:var(--text-secondary);"></div>
                <div class="growth-rec-reason" style="margin-top:6px; font-size:.86rem; opacity:.85;"></div>
                <div class="growth-rec-actions" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px;">
                    <button class="btn btn-primary" id="btn-growth-task-now">Entrena això ara</button>
                    <button class="btn btn-secondary" id="btn-growth-task-skip">Jugar igualment</button>
                </div>
            </div>
        `);
        const anchor = $('#review-newerrors');
        if (anchor.length) anchor.after(box); else modal.find('.modal-content').append(box);
    }
    if (!task) { box.hide(); return; }
    box.find('.growth-rec-title').text(task.title || 'El teu següent pas');
    box.find('.growth-rec-message').text(task.message || buildGrowthTaskMessage(task));
    box.find('.growth-rec-reason').text(task.reason || 'Triat per maximitzar la millora ara mateix.');
    box.find('#btn-growth-task-now').text(task.cta || 'Entrena això ara').off('click').on('click', () => {
        modal.hide();
        executeGrowthTask(task);
    });
    box.find('#btn-growth-task-skip').off('click').on('click', () => {
        modal.hide();
        if (typeof onClose === 'function') onClose();
        if ((modeAtRender === 'free' || modeAtRender === 'assisted') && typeof novaPartida === 'function') novaPartida();
    });
    box.show();
}

/* ===================== REPETICIÓ ESPAIADA (SRS) ===================== */
const SRS_INTERVALS_DAYS = [1, 3, 7, 21];

function getErrorDueTime(err) {
    return typeof err.srsDue === 'number' ? err.srsDue : 0;
}

function getDueErrors() {
    const now = Date.now();
    return savedErrors.filter(e => getErrorDueTime(e) <= now);
}

// Reprograma un error després d'encertar-lo. Retorna true si ja s'ha dominat (es pot retirar).
function scheduleErrorAfterSuccess(err) {
    err.srsReps = (err.srsReps || 0) + 1;
    if (err.srsReps > SRS_INTERVALS_DAYS.length) return true;
    const days = SRS_INTERVALS_DAYS[err.srsReps - 1];
    err.srsInterval = days;
    err.srsDue = Date.now() + days * 86400000;
    return false;
}

function startSrsReview() {
    if (!guardCalibrationAccess()) return;
    const due = getDueErrors();
    if (!due.length) {
        alert('No tens cap repàs pendent ara mateix. Resol nous errors o torna més tard!');
        return;
    }
    isSrsReviewSession = true;
    isDailyPuzzleSession = false;
    isRandomBundleSession = false;
    isMatchErrorReviewSession = false;
    matchErrorQueue = [];
    currentMatchError = null;
    currentBundleSource = 'srs';
    currentBundleSeverity = null;
    $('#bundle-modal').remove();
    currentGameMode = 'bundle';
    currentOpponent = null;
    startGame(true, due[0].fen);
}

function startNextSrsReview() {
    const due = getDueErrors();
    if (!due.length) return false;
    startGame(true, due[0].fen);
    return true;
}

function showSrsSuccessOverlay() {
    const overlay = $('#bundle-success-overlay');
    const due = getDueErrors().length;
    if (!overlay.length) {
        if (!startNextSrsReview()) { isSrsReviewSession = false; returnToMainMenuImmediate(); }
        return;
    }
    overlay.find('.bundle-success-title').text('Repàs fet ✅');
    overlay.find('.bundle-success-remaining').text(due > 0 ? `${due} repassos pendents` : 'Cap repàs pendent per ara');
    overlay.find('#btn-bundle-random-again').text('➡️ Següent repàs').prop('disabled', due === 0).toggle(due > 0);
    overlay.css('display', 'flex');
    overlay.find('#btn-bundle-random-home').off('click').on('click', () => {
        isSrsReviewSession = false; overlay.hide(); returnToMainMenuImmediate();
    });
    overlay.find('#btn-bundle-random-again').off('click').on('click', () => {
        overlay.hide();
        if (!startNextSrsReview()) { isSrsReviewSession = false; returnToMainMenuImmediate(); }
    });
}

/* ===================== REPTE DIARI ===================== */
const DAILY_PUZZLE_BANK = [
    { fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4' },
    { fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1' },
    { fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5' },
    { fen: '2rq1rk1/pp1bppbp/3p1np1/8/3NP3/2N1BP2/PPPQ2PP/2KR1B1R w - - 0 11' },
    { fen: 'r3k2r/ppp2ppp/2n1bn2/2bqp3/8/2NP1NP1/PPP1PPBP/R1BQ1RK1 w kq - 0 9' },
    { fen: '8/8/8/4k3/8/4K3/4P3/8 w - - 0 1' },
    { fen: 'rnbqkb1r/pp2pppp/3p1n2/2pP4/4P3/8/PPP2PPP/RNBQKBNR w KQkq - 0 4' }
];

function hashStr(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return Math.abs(h);
}

function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
}

function pickDailyPuzzleFen() {
    const seed = hashStr(getToday());
    // Conjunt curat de posicions tàctiques amb una millor jugada clara (verificada per Stockfish),
    // complementat amb les errades greus reals del jugador per donar varietat i rellevància.
    const curated = (typeof TACTICS_BANK !== 'undefined' && TACTICS_BANK.length)
        ? TACTICS_BANK.slice()
        : DAILY_PUZZLE_BANK.map(p => p.fen);
    const severeOwn = savedErrors.filter(e => e.severity === 'high').map(e => e.fen);
    const pool = curated.concat(severeOwn);
    if (!pool.length) return DAILY_PUZZLE_BANK[seed % DAILY_PUZZLE_BANK.length].fen;
    return pool[seed % pool.length];
}

function ensureDailyPuzzle() {
    const today = getToday();
    if (dailyPuzzle.date !== today) {
        dailyPuzzle.date = today;
        dailyPuzzle.solved = false;
        dailyPuzzle.fen = pickDailyPuzzleFen();
        saveStorage();
    }
}

function startDailyPuzzle() {
    if (!guardCalibrationAccess()) return;
    ensureDailyPuzzle();
    if (dailyPuzzle.solved) {
        alert("Ja has superat el repte d'avui! Torna demà per mantenir la ratxa.");
        return;
    }
    isDailyPuzzleSession = true;
    isSrsReviewSession = false;
    isRandomBundleSession = false;
    isMatchErrorReviewSession = false;
    matchErrorQueue = [];
    currentMatchError = null;
    currentBundleSource = 'daily';
    currentBundleSeverity = null;
    $('#bundle-modal').remove();
    currentGameMode = 'bundle';
    currentOpponent = null;
    startGame(true, dailyPuzzle.fen);
}

function completeDailyPuzzle() {
    if (dailyPuzzle.solved) return;
    const today = getToday();
    if (dailyPuzzle.lastSolved === yesterdayStr()) dailyPuzzle.streak = (dailyPuzzle.streak || 0) + 1;
    else dailyPuzzle.streak = 1;
    dailyPuzzle.lastSolved = today;
    dailyPuzzle.solved = true;
    dailyPuzzle.best = Math.max(dailyPuzzle.best || 0, dailyPuzzle.streak);
    totalStars += 1;
    saveStorage();
}

function showDailyPuzzleOverlay() {
    const overlay = $('#bundle-success-overlay');
    if (!overlay.length) { isDailyPuzzleSession = false; returnToMainMenuImmediate(); return; }
    overlay.find('.bundle-success-title').text('Repte diari superat 🏆 (+1 ★)');
    overlay.find('.bundle-success-remaining').text(`Ratxa diària: ${dailyPuzzle.streak} · Rècord: ${dailyPuzzle.best}`);
    const hasMoreProblems = Array.isArray(TACTICS_BANK) && TACTICS_BANK.length > 0;
    overlay.find('#btn-bundle-random-again').text('⚡ Un altre problema').prop('disabled', !hasMoreProblems).toggle(hasMoreProblems);
    overlay.css('display', 'flex');
    overlay.find('#btn-bundle-random-again').off('click').on('click', () => {
        overlay.hide();
        isDailyPuzzleSession = false;
        startTacticsPuzzle();
    });
    overlay.find('#btn-bundle-random-home').off('click').on('click', () => {
        isDailyPuzzleSession = false; overlay.hide(); returnToMainMenuImmediate();
    });
}

/* ===================== ENTRENAMENT DE TÀCTIQUES ===================== */
// Banc de posicions tàctiques: el jugador ha de trobar la millor jugada (verificada per Stockfish).
const TACTICS_BANK = [
    'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5',
    '2rq1rk1/pp1bppbp/3p1np1/8/3NP3/2N1BP2/PPPQ2PP/2KR1B1R w - - 0 11',
    'r3k2r/ppp2ppp/2n1bn2/2bqp3/8/2NP1NP1/PPP1PPBP/R1BQ1RK1 w kq - 0 9',
    'rnbqkb1r/pp2pppp/3p1n2/2pP4/4P3/8/PPP2PPP/RNBQKBNR w KQkq - 0 4',
    'r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 11',
    'r4rk1/pp1n1ppp/2pb1q2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 12',
    '3r1rk1/pp3ppp/2p5/2bq4/4nP2/2N1P3/PPQ3PP/R1B2RK1 b - - 0 16',
    'r1b1k2r/ppppnppp/2n5/2b5/2B1P3/2P2N2/PP1q1PPP/RNBQ1RK1 w kq - 0 8',
    '2kr3r/ppp2ppp/2n1b3/2b1p1q1/4P3/2NP1N2/PPP1QPPP/R1B2RK1 b - - 0 11',
    '6k1/pp3ppp/8/8/8/1P3Q2/P4qPP/5RK1 w - - 0 1',
    'r4rk1/1pp2ppp/p1np1q2/2b1p3/2B1P1b1/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 9',
    'rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3'
];

function pickTacticsFen() {
    // Prefereix una posició amb la seqüència ja preparada en segon pla (inici instantani)
    return pickPreferPrepared(TACTICS_BANK) || TACTICS_BANK[Math.floor(Math.random() * TACTICS_BANK.length)];
}

function startTacticsPuzzle() {
    if (!guardCalibrationAccess()) return;
    isTacticsSession = true;
    isDailyPuzzleSession = false;
    isSrsReviewSession = false;
    isRandomBundleSession = false;
    isMatchErrorReviewSession = false;
    matchErrorQueue = [];
    currentMatchError = null;
    currentBundleSource = 'tactics';
    currentBundleSeverity = null;
    $('#bundle-modal').remove();
    currentGameMode = 'bundle';
    currentOpponent = null;
    startGame(true, pickTacticsFen());
}

function completeTacticsPuzzle(success) {
    tacticsStats.attempts = (tacticsStats.attempts || 0) + 1;
    if (success) {
        markGrowthTaskCompleted(currentGrowthTask && currentGrowthTask.type === 'tactics' ? currentGrowthTask : { type: 'tactics', theme: 'general', source: 'history' }, 'success');
        tacticsStats.solved = (tacticsStats.solved || 0) + 1;
        tacticsStats.streak = (tacticsStats.streak || 0) + 1;
        tacticsStats.best = Math.max(tacticsStats.best || 0, tacticsStats.streak);
        totalStars += 1;
    } else {
        markGrowthTaskCompleted(currentGrowthTask && currentGrowthTask.type === 'tactics' ? currentGrowthTask : { type: 'tactics', theme: 'general', source: 'history' }, 'failed');
        tacticsStats.streak = 0;
    }
    saveStorage();
    checkTacticsBadges();
}

function showTacticsOverlay() {
    const overlay = $('#bundle-success-overlay');
    if (!overlay.length) { isTacticsSession = false; returnToMainMenuImmediate(); return; }
    overlay.find('.bundle-success-title').text('Tàctica resolta ⚡ (+1 ★)');
    overlay.find('.bundle-success-remaining').text(`Resoltes: ${tacticsStats.solved} · Ratxa: ${tacticsStats.streak} · Rècord: ${tacticsStats.best}`);
    overlay.find('#btn-bundle-random-again').text('⚡ Una altra').prop('disabled', false).toggle(true);
    overlay.css('display', 'flex');
    overlay.find('#btn-bundle-random-again').off('click').on('click', () => {
        overlay.hide(); startTacticsPuzzle();
    });
    overlay.find('#btn-bundle-random-home').off('click').on('click', () => {
        isTacticsSession = false; overlay.hide(); returnToMainMenuImmediate();
    });
}

/* ===================== BANNER D'INCENTIU ===================== */
const PLAY_IDEAS = [
    "Domina el centre des de la primera jugada: cada peça hi guanya força.",
    "Prova una Partida assistida: el mestre estratega et planteja el millor pla.",
    "Aprèn una obertura nova avui; la victòria es prepara abans de la batalla.",
    "Repassa un error antic: qui no repassa, repeteix.",
    "Desenvolupa totes les peces abans d'atacar; un exèrcit a mitges perd.",
    "Abans de moure, mira sempre què amenaça el rival."
];

// Un únic banner contextual al menú, per incitar a jugar sense ser excessiu.
function updateEngagementBanner() {
    const el = document.getElementById('engagement-banner');
    if (!el) return;
    if (isCalibrationRequired()) { el.style.display = 'none'; return; }
    const iconEl = el.querySelector('.eng-icon');
    const textEl = el.querySelector('.eng-text');
    const ctaEl = el.querySelector('.eng-cta');
    if (!iconEl || !textEl || !ctaEl) return;

    let icon, text, cta, action;
    ensureDailyPuzzle();
    const due = getDueErrors().length;
    if (!dailyPuzzle.solved) {
        icon = '🗓️'; text = 'El repte diari t\'espera. Mantingues viva la ratxa!'; cta = 'Jugar repte'; action = 'daily';
    } else if (due > 0) {
        icon = '🔁'; text = `Tens ${due} ${due > 1 ? 'repassos a punt' : 'repàs a punt'}. Consolida el que has après.`; cta = 'Repassar'; action = 'srs';
    } else {
        icon = '💡'; text = PLAY_IDEAS[hashStr(getToday()) % PLAY_IDEAS.length]; cta = 'Nova partida'; action = 'play';
    }
    iconEl.textContent = icon;
    textEl.textContent = text;
    ctaEl.textContent = cta;
    ctaEl.setAttribute('data-eng-action', action);
    el.style.display = 'flex';
}

/* ===================== DEBILITATS TEMÀTIQUES ===================== */
// Classifica una posició+jugada en un tema: tàctiques bàsiques, atac al rei, material, centre, obertura, final o general.
function classifyPositionTheme(fen, uci) {
    try {
        if (!uci || uci.length < 4) return 'general';
        // Primer, el motiu tàctic derivat de la jugada (forquilla, clavada, mat, material...)
        const motive = analyzeTacticalMotive(fen, uci);
        if (motive && motive.theme) return motive.theme;
        const parts = (fen || '').split(' ');
        const fullmove = parseInt(parts[5], 10) || 1;
        const g = new Chess(fen);
        const before = g.board().flat().filter(Boolean).length;
        const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
        if (mv) {
            const san = mv.san || '';
            if (san.includes('#') || san.includes('+')) return 'king_attack';
            if (/N.[a-h][1-8][+#]?/.test(san) && san.includes('+')) return 'fork';
            if (mv.piece === 'b' || mv.piece === 'r' || mv.piece === 'q') {
                const lowerSan = san.toLowerCase();
                if (lowerSan.includes('pin')) return 'pin';
            }
            if (mv.flags.includes('c') || mv.flags.includes('e')) return 'material';
            if (fullmove <= 10) return 'opening';
            const after = g.board().flat().filter(Boolean).length;
            if (after <= 10 || fullmove >= 35) return 'endgame';
            if (['d4', 'd5', 'e4', 'e5', 'c4', 'c5', 'f4', 'f5'].includes(mv.to)) return 'center';
            if (before <= 10) return 'endgame';
        }
    } catch (e) {}
    return 'general';
}

const WEAKNESS_LABELS = {
    king: 'Atacs i seguretat del rei',
    king_attack: 'Atacs i seguretat del rei',
    material: 'Tàctica i guany de material',
    center: 'Control del centre',
    opening: "Obertura (primeres jugades)",
    endgame: 'Finals',
    fork: 'Forquilles',
    pin: 'Clavades',
    skewer: 'Raigs X',
    general: 'Joc posicional',
    obertura: "Obertura (primeres jugades)",
    migjoc: 'Mig joc',
    final: 'Finals'
};

function analyzeWeaknesses() {
    const errors = [];
    savedErrors.forEach(e => errors.push(e));
    gameHistory.forEach(g => { if (Array.isArray(g.errors)) g.errors.forEach(e => errors.push(e)); });

    const phase = { obertura: 0, migjoc: 0, final: 0 };
    const theme = { king_attack: 0, material: 0, center: 0, opening: 0, endgame: 0, fork: 0, pin: 0, skewer: 0, general: 0 };
    const severity = { low: 0, med: 0, high: 0 };

    errors.forEach(e => {
        let fullmove = 10;
        try { fullmove = parseInt((e.fen || '').split(' ')[5]) || 10; } catch (_) {}
        if (fullmove <= 10) phase.obertura++;
        else if (fullmove <= 30) phase.migjoc++;
        else phase.final++;
        const classifiedTheme = normalizeGrowthTheme(classifyPositionTheme(e.fen, e.bestMove || ''));
        theme[classifiedTheme] = (theme[classifiedTheme] || 0) + 1;
        if (e.severity === 'high') severity.high++;
        else if (e.severity === 'med') severity.med++;
        else severity.low++;
    });

    return { total: errors.length, phase, theme, severity };
}

function getTopWeaknessTheme() {
    const data = analyzeWeaknesses();
    let top = null, max = -1;
    Object.keys(data.theme).forEach(k => { if (data.theme[k] > max) { max = data.theme[k]; top = k; } });
    return top;
}

// Precisió mitjana per fase de la partida (obertura / mig joc / final) a partir de l'historial
const QUALITY_WEIGHTS = { excel: 100, good: 85, inaccuracy: 50, mistake: 20, blunder: 0 };
function analyzePhasePrecision() {
    const phases = {
        obertura: { sum: 0, n: 0 },
        migjoc: { sum: 0, n: 0 },
        final: { sum: 0, n: 0 }
    };
    gameHistory.forEach(entry => {
        if (!Array.isArray(entry.moveReviews)) return;
        const pColor = entry.playerColor || 'w';
        entry.moveReviews.forEach(r => {
            if (r.color && r.color !== pColor) return;
            const w = QUALITY_WEIGHTS[r.quality];
            if (typeof w !== 'number') return;
            const mn = r.moveNumber || 1;
            const bucket = mn <= 10 ? 'obertura' : (mn <= 30 ? 'migjoc' : 'final');
            phases[bucket].sum += w;
            phases[bucket].n++;
        });
    });
    const result = {};
    let totalN = 0;
    Object.keys(phases).forEach(k => {
        result[k] = phases[k].n > 0 ? Math.round(phases[k].sum / phases[k].n) : null;
        result[k + '_n'] = phases[k].n;
        totalN += phases[k].n;
    });
    result.totalN = totalN;
    return result;
}

function startWeaknessTraining(theme) {
    if (!guardCalibrationAccess()) return;
    const normalizedTheme = normalizeGrowthTheme(theme);
    const candidates = savedErrors.filter(e => normalizeGrowthTheme(classifyPositionTheme(e.fen, e.bestMove || '')) === normalizedTheme);
    const pool = candidates.length ? candidates : savedErrors;
    if (!pool.length) { alert('Encara no tens errors guardats per entrenar aquesta debilitat.'); return; }
    const choice = pickPreferPrepared(pool, e => e.fen);
    isSrsReviewSession = false;
    isDailyPuzzleSession = false;
    isRandomBundleSession = true;
    isMatchErrorReviewSession = false;
    matchErrorQueue = [];
    currentMatchError = null;
    currentBundleSource = 'random';
    currentBundleSeverity = null;
    $('#bundle-modal').remove();
    currentGameMode = 'bundle';
    currentOpponent = null;
    startGame(true, choice.fen);
}

function renderWeaknesses() {
    const container = document.getElementById('stats-weaknesses');
    if (!container) return;
    const data = analyzeWeaknesses();
    if (data.total === 0) {
        container.innerHTML = '<div style="color:var(--text-secondary); font-size:0.9rem;">Encara no hi ha prou dades. Juga partides i revisa errors per veure les teves debilitats.</div>';
        return;
    }
    const renderRow = (label, count, total, color) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return `<div class="weakness-row">
            <div class="weakness-label">${label}</div>
            <div class="weakness-bar-track"><div class="weakness-bar-fill" style="width:${pct}%; background:${color};"></div></div>
            <div class="weakness-count">${count}</div>
        </div>`;
    };
    let html = '<div class="weakness-group-title">Per temàtica</div>';
    const themeColors = { king_attack: '#c62828', material: '#c9a227', center: '#3a6b8c', opening: '#7b4fa3', endgame: '#607d8b', fork: '#d97706', pin: '#8e24aa', skewer: '#546e7a', general: '#4a7c59' };
    Object.keys(data.theme).sort((a, b) => data.theme[b] - data.theme[a]).forEach(k => {
        html += renderRow(WEAKNESS_LABELS[k] || getThemeLabel(k), data.theme[k], data.total, themeColors[k] || '#4a7c59');
    });
    html += '<div class="weakness-group-title">Per fase de la partida</div>';
    ['obertura', 'migjoc', 'final'].forEach(k => {
        html += renderRow(WEAKNESS_LABELS[k], data.phase[k], data.total, '#6d7b87');
    });
    // Precisió mitjana per fase (a partir de l'historial de partides)
    const pp = analyzePhasePrecision();
    if (pp.totalN > 0) {
        html += '<div class="weakness-group-title">Precisió per fase</div>';
        const precColor = (v) => v >= 80 ? '#4a7c59' : (v >= 60 ? '#c9a227' : '#c62828');
        ['obertura', 'migjoc', 'final'].forEach(k => {
            const v = pp[k];
            if (v === null) {
                html += `<div class="weakness-row"><div class="weakness-label">${WEAKNESS_LABELS[k]}</div><div class="weakness-bar-track"></div><div class="weakness-count">—</div></div>`;
            } else {
                html += `<div class="weakness-row">
                    <div class="weakness-label">${WEAKNESS_LABELS[k]}</div>
                    <div class="weakness-bar-track"><div class="weakness-bar-fill" style="width:${v}%; background:${precColor(v)};"></div></div>
                    <div class="weakness-count">${v}%</div>
                </div>`;
            }
        });
    }
    const topTheme = getTopWeaknessTheme();
    if (topTheme && data.theme[topTheme] > 0) {
        html += `<button class="btn btn-secondary" id="btn-train-weakness" style="margin-top:12px;">🎯 Entrena: ${WEAKNESS_LABELS[topTheme]}</button>`;
    }
    container.innerHTML = html;
    const trainBtn = document.getElementById('btn-train-weakness');
    if (trainBtn) trainBtn.onclick = () => startWeaknessTraining(topTheme);
}

/* ===================== DIAGNÒSTIC LONGITUDINAL DE L'ENTRENADOR =====================
   Mira TOT l'historial acumulat (errors guardats, precisió per fase, últimes
   partides) i en treu un diagnòstic redactat: patró recurrent, punt fort i
   prioritat. Els fets es calculen en local; OpenAI només els redacta.
   Es regenera quan hi ha dades noves (empremta per recompte de partides/errors). */

const COACH_DIAGNOSIS_KEY = 'chess_coachDiagnosis';
let coachDiagnosisPending = false;

function buildCoachDiagnosisFacts() {
    const weaknesses = analyzeWeaknesses();
    const phasePrecision = analyzePhasePrecision();
    const recent = gameHistory.slice(-10);
    const results = { victories: 0, taules: 0, derrotes: 0 };
    const precisions = [];
    recent.forEach(g => {
        const r = (g.result || '').toLowerCase();
        if (/guany|victòria|win/.test(r)) results.victories++;
        else if (/taules|draw|empat/.test(r)) results.taules++;
        else results.derrotes++;
        if (typeof g.precision === 'number') precisions.push(g.precision);
    });
    const topThemes = Object.keys(weaknesses.theme)
        .filter(k => weaknesses.theme[k] > 0)
        .sort((a, b) => weaknesses.theme[b] - weaknesses.theme[a])
        .slice(0, 3)
        .map(k => ({ tema: WEAKNESS_LABELS[k] || getThemeLabel(k), errors: weaknesses.theme[k] }));
    return {
        partidesTotals: gameHistory.length,
        errorsAcumulats: weaknesses.total,
        temesAmbMesErrors: topThemes,
        errorsPerFase: weaknesses.phase,
        precisioPerFase: {
            obertura: phasePrecision.obertura,
            migjoc: phasePrecision.migjoc,
            final: phasePrecision.final
        },
        ultimesPartides: {
            quantes: recent.length,
            resultats: results,
            precisioMitjana: precisions.length ? Math.round(precisions.reduce((a, b) => a + b, 0) / precisions.length) : null
        }
    };
}

function buildCoachDiagnosisPrompt(facts) {
    return `Ets un entrenador d'escacs veterà, honest i concret, que parla en català i tuteja l'alumne.
A partir NOMÉS d'aquests fets acumulats de l'alumne (no inventis res que no hi sigui):
${JSON.stringify(facts, null, 2)}

Escriu un diagnòstic de 70 a 110 paraules en 1 o 2 paràgrafs:
- El patró d'errada més recurrent i en quina fase de la partida apareix.
- Un punt fort real que es vegi a les dades.
- La prioritat d'entrenament per als pròxims dies, en imperatiu.
Sense llistes, sense markdown i sense xifres que no surtin dels fets.`;
}

function coachDiagnosisFingerprint() {
    return `${gameHistory.length}:${savedErrors.length}`;
}

function renderCoachDiagnosis() {
    const el = document.getElementById('coach-diagnosis');
    if (!el) return;
    if (gameHistory.length < 3 && savedErrors.length < 5) {
        el.innerHTML = '<span style="color:var(--text-secondary);">Juga unes quantes partides més i l\'entrenador escriurà aquí el teu diagnòstic.</span>';
        return;
    }
    const fingerprint = coachDiagnosisFingerprint();
    const stored = readJsonStorage(COACH_DIAGNOSIS_KEY, null);
    if (stored && stored.text) {
        el.textContent = stored.text;
        if (stored.fingerprint === fingerprint) return;
    }
    if (!openaiApiKey) {
        if (!stored || !stored.text) el.innerHTML = '<span style="color:var(--text-secondary);">Configura la clau d’OpenAI per rebre el diagnòstic de l\'entrenador.</span>';
        return;
    }
    if (coachDiagnosisPending) return;
    coachDiagnosisPending = true;
    if (!stored || !stored.text) el.innerHTML = '<em>L\'entrenador està repassant les teves partides...</em>';
    const prompt = buildCoachDiagnosisPrompt(buildCoachDiagnosisFacts());
    callOpenAI(prompt, { generationConfig: { maxOutputTokens: 900 } }).then(result => {
        if (!result.ok || !result.text) return;
        const text = result.text.replace(/\*\*/g, '').trim();
        if (text.length < 40) return;
        writeJsonStorage(COACH_DIAGNOSIS_KEY, { fingerprint, text, day: getPlanDayKey() });
        const target = document.getElementById('coach-diagnosis');
        if (target) target.textContent = text;
    }).finally(() => { coachDiagnosisPending = false; });
}

/* ===================== BANC DE MÀXIMES OFFLINE + CAU ===================== */
const OFFLINE_MAXIMS = {
    king: [
        "Quan el rei enemic queda exposat, tota maniobra ha d'apuntar a la seva posició; la pressa sense objectiu malgasta forces.",
        "El general savi no persegueix peces, sinó el monarca: dirigeix les teves columnes cap al refugi del rei.",
        "Un escac no és un crit buit si obre el camí cap a la victòria; busca l'escac que guanyi temps o material."
    ],
    material: [
        "Abans de capturar, compta els defensors: el guany aparent sovint amaga una trampa preparada.",
        "Qui sobrecarrega una peça defensora obre una bretxa; ataca el punt que el rival no pot protegir dues vegades.",
        "La forquilla i la clavada són les emboscades del tauler: cerca la casella des d'on una sola peça amenaça dues."
    ],
    center: [
        "Qui domina el centre domina les rutes; situa-hi els peons i les peces abans de llançar l'atac als flancs.",
        "El terreny central és la plana on es decideixen els imperis: no el cedeixis sense compensació.",
        "Des del centre, cada peça irradia la seva força; un cavall a la quarta fila val per dos a la vora."
    ],
    general: [
        "Desenvolupa totes les peces abans d'atacar; un exèrcit a mitges és un exèrcit derrotat.",
        "Coneix la teva posició i la del rival, i en cent jugades no temeràs el resultat.",
        "La paciència posicional precedeix la tempesta tàctica: millora la pitjor peça abans de buscar el cop."
    ]
};

OFFLINE_MAXIMS.king.push(
    "El rei enemic sense escapatòria és l'objectiu: porta-hi una peça més abans de donar el cop.",
    "No persegueixis l'escac per l'escac; cada amenaça ha de deixar una segona ombra al darrere."
);
OFFLINE_MAXIMS.material.push(
    "Abans de capturar, calcula la recaptura i la jugada següent: l'or fàcil sovint està enverinat.",
    "Una peça lligada o sobrecarregada és material futur; ataca el que defensa per obligació."
);
OFFLINE_MAXIMS.center.push(
    "Resol la tensió central quan t'afavoreixi, no quan t'impacientis.",
    "Espai al centre vol dir línies per a les peces: converteix-lo en pressió, no en orgull."
);
OFFLINE_MAXIMS.general.push(
    "Millora la pitjor peça abans de buscar el cop: l'harmonia pesa més que l'aventura.",
    "Pregunta't què vol fer el rival; la profilaxi és un atac avançat.",
    "Activa el rei al final: una passa del monarca pot valer una peça."
);

function pickOfflineMaxim(theme) {
    // El classificador retorna king_attack/fork/pin/opening/endgame...; mapem-ho a
    // les claus reals d'OFFLINE_MAXIMS (abans 'king_attack' queia sempre a 'general').
    const map = {
        king_attack: 'king', king: 'king', fork: 'material', pin: 'material', skewer: 'material',
        material: 'material', center: 'center', opening: 'center', development: 'center',
        endgame: 'general', endgame_activity: 'general', general: 'general'
    };
    const key = OFFLINE_MAXIMS[theme] ? theme : (map[theme] || 'general');
    return pickFreshPlanLine(OFFLINE_MAXIMS[key] || OFFLINE_MAXIMS.general, 'assistedmaxim:' + key);
}

// Màxima estratègica local rica: reaprofita el generador de pistes jeroglífiques
// (temàtic, variat i anti-repetitiu) perquè la partida assistida no depengui de cap clau.
function buildLocalAssistedMaxim(fen, bestMove) {
    try {
        if (bestMove) {
            const ctx = buildHieroglyphicContext(fen, bestMove, {});
            const clue = generateDynamicHieroglyphicClue(ctx, { level: 1 });
            if (clue && clue.length > 12) return clue;
        }
    } catch (e) {}
    return pickOfflineMaxim(classifyPositionTheme(fen, bestMove || ''));
}

function getCachedOpenAI(key) {
    return openaiResponseCache[key] || null;
}

function setCachedOpenAI(key, value) {
    openaiResponseCache[key] = value;
}

function showBundleMenu() {
    if (savedErrors.length === 0) { alert('No tens errors guardats'); return; }

    $('#bundle-modal').remove();

    const groups = { low: [], med: [], high: [] };
    savedErrors.forEach((err, idx) => {
        const sev = (err.severity === 'med' || err.severity === 'high' || err.severity === 'low') ? err.severity : 'low';
        groups[sev].push({ err, idx });
    });

    const sectionMeta = {
        low: { title: 'Groc · Lleus', sev: 'low' },
        med: { title: 'Taronja · Mitjans', sev: 'med' },
        high: { title: 'Vermell · Greus', sev: 'high' }
    };

    let html = '<div class="modal-overlay" id="bundle-modal" style="display:flex;"><div class="modal-content">';
    html += '<div class="modal-title">📚 Errors guardats</div>';
    html += '<button class="btn btn-primary" id="btn-bundle-random" style="margin:0 0 12px 0;">🎲 Resoldre un lot aleatori</button>';
    html += '<div class="bundle-folder-list">';

    ['high', 'med', 'low'].forEach((sevKey) => {
        const meta = sectionMeta[sevKey];
        const count = groups[sevKey].length;

        html += `<div class="bundle-section ${meta.sev}">`;
        html += '<div class="bundle-section-header">';
        html += `<div class="bundle-section-title">${meta.title}</div>`;
        html += `<div class="bundle-section-count"><span>${count}</span><span class="bundle-section-caret">▾</span></div>`;
        html += '</div>';

        html += '<div class="bundle-section-content">';
        if (count === 0) {
            html += '<div class="bundle-empty">Cap errada en aquesta carpeta</div>';
        } else {
            html += '<div class="bundle-list">';
            groups[sevKey].forEach(({ err, idx }) => {
                const severityClass = err.severity;
                const severityLabel = err.severity === 'low' ? 'Lleu' : err.severity === 'med' ? 'Mitjà' : 'Greu';
                html += `<div class="bundle-item ${severityClass}" data-idx="${idx}" data-severity="${severityClass}">`;
                html += `<div><strong>${severityLabel}</strong><div class="bundle-meta">${err.date} • ELO: <span class="bundle-elo">${err.elo || '?'}</span></div></div>`;
                html += `<div class="bundle-remove" onclick="event.stopPropagation(); removeBundle(${idx})">🗑️</div>`;
                html += '</div>';
            });
            html += '</div>';
        }
        html += '</div>'; 
        html += '</div>'; 
    });

    html += '</div>'; 
    html += '<button class="close-modal" onclick="$(\'#bundle-modal\').remove()">Tancar</button></div></div>';
    $('body').append(html);

    $('#bundle-modal .bundle-section-header').off('click').on('click', function() {
        $(this).closest('.bundle-section').toggleClass('open');
    });

    $('#bundle-modal .bundle-item').off('click').on('click', function() {
        const idx = Number(this.dataset.idx);
        const entry = savedErrors[idx];
        if (!entry) return;
        startSelectedBundleGame(entry);
    });
 
    $('#btn-bundle-random').off('click').on('click', () => {
        startRandomBundleGame();
    });
}

function removeBundle(idx) {
    showAppConfirm('Vols esborrar aquesta errada?', () => {
        savedErrors.splice(idx, 1); saveStorage(); updateDisplay();
        $('#bundle-modal').remove(); if (savedErrors.length > 0) showBundleMenu();
    }, { title: 'Esborrar errada', confirmText: 'Esborrar' });
}

window.startBundleGame = function(fen, severity = null) {
    isRandomBundleSession = false;
    isMatchErrorReviewSession = false;
    matchErrorQueue = [];
    currentMatchError = null;
    isSrsReviewSession = false;
    isDailyPuzzleSession = false;
    currentBundleSource = 'category';
    currentBundleSeverity = (severity === 'low' || severity === 'med' || severity === 'high') ? severity : null;
    $('#bundle-modal').remove(); currentGameMode = 'bundle';
    currentOpponent = null;
    startGame(true, fen);
};

function startRandomBundleGame() {
    if (savedErrors.length === 0) { alert('No tens errors guardats'); return false; }
    const choice = pickPreferPrepared(savedErrors, e => e.fen);
    isRandomBundleSession = true;
    isMatchErrorReviewSession = false;
    isSrsReviewSession = false;
    isDailyPuzzleSession = false;
    matchErrorQueue = [];
    currentMatchError = null;
    currentBundleSource = 'random';
    currentBundleSeverity = null;
    $('#bundle-modal').remove();
    currentGameMode = 'bundle';
    currentOpponent = null;
    startGame(true, choice.fen);
    return true;
}

function startSelectedBundleGame(entry) {
    if (!entry || !entry.fen) return false;
    isRandomBundleSession = true;
    isMatchErrorReviewSession = false;
    matchErrorQueue = [];
    currentMatchError = null;
    isSrsReviewSession = false;
    isDailyPuzzleSession = false;
    currentBundleSource = 'manual';
    currentBundleSeverity = null;
    $('#bundle-modal').remove();
    currentGameMode = 'bundle';
    currentOpponent = null;
    startGame(true, entry.fen);
    return true;
}

function startMatchErrorReview() {
    if (currentGameErrors.length === 0) {
        alert('No hi ha errades per revisar en aquesta partida.');
        return;
    }
    matchErrorReturnReviewSnapshot = lastReviewSnapshot ? { ...lastReviewSnapshot } : null;
    isRandomBundleSession = false;
    isSrsReviewSession = false;
    isDailyPuzzleSession = false;
    matchErrorQueue = currentGameErrors.slice();
    isMatchErrorReviewSession = true;
    currentMatchError = null;
    currentBundleSource = 'match';
    currentBundleSeverity = null;   
    launchNextMatchError();
}

function scrollToMatchErrorReview() {
    const boardEl = document.getElementById('myBoard');
    const target = boardEl || document.getElementById('game-screen');
    if (!target || typeof target.scrollIntoView !== 'function') return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function launchNextMatchError() {
    if (matchErrorQueue.length === 0) {
        endMatchErrorReviewSession();
        return;
    }
    currentMatchError = matchErrorQueue.shift();
    startGame(true, currentMatchError.fen);
}

function returnToHistoryScreenFromErrorPractice() {
    const selectedId = historyReplay && historyReplay.entry ? historyReplay.entry.id : null;
    returnToMainMenuImmediate();
    $('#start-screen').hide();
    $('#history-screen').show();
    initHistoryBoard();
    renderGameHistory();
    if (selectedId) {
        const entry = gameHistory.find(g => g.id === selectedId);
        if (entry) loadHistoryEntry(entry);
    }
    navPush('history-screen');
    setTimeout(() => resizeHistoryBoardToViewport(), 0);
}

function reopenPostGameReviewFromErrorPractice(snapshot) {
    returnToMainMenuImmediate();
    if (!snapshot) return;
    showPostGameReview(
        snapshot.msg,
        snapshot.finalPrecision,
        snapshot.counts,
        null,
        { showCheckmate: snapshot.showCheckmate }
    );
}

function endMatchErrorReviewSession() {
    const source = currentBundleSource;
    const snapshot = matchErrorReturnReviewSnapshot;
    isMatchErrorReviewSession = false;
    matchErrorQueue = [];
    currentMatchError = null;
    matchErrorReturnReviewSnapshot = null;
    $('#match-error-success-overlay').hide();
    if (source === 'history') {
        returnToHistoryScreenFromErrorPractice();
    } else if (source === 'match' && snapshot) {
        reopenPostGameReviewFromErrorPractice(snapshot);
    } else {
        returnToMainMenuImmediate();
    }
}

function showMatchErrorReviewOverlay(remaining, noMore) {
    const overlay = $('#match-error-success-overlay');
    if (!overlay.length) {
        if (remaining > 0) {
            showAppConfirm(`Vols revisar una altra errada? En queden ${remaining}.`,
                () => launchNextMatchError(),
                { title: 'Revisar errades', confirmText: 'Sí', cancelText: 'No', onCancel: () => endMatchErrorReviewSession() }
            );
        } else {
            showToast('Ja has revisat totes les errades de la partida.', 'success');
            endMatchErrorReviewSession();
        }
        return;
    }

    const fromHistory = currentBundleSource === 'history';
    $('#match-error-remaining').text(
        noMore ? (fromHistory ? 'Has revisat totes les errades d’aquesta partida a l’historial!' : 'Has revisat totes les errades!') :
        remaining > 0 ? `${remaining} errada${remaining > 1 ? 'es' : ''} restant${remaining > 1 ? 's' : ''} d’aquesta partida` :
        'No en queden més!'
    );

    if (fromHistory) {
        $('#btn-match-error-home').text('Tornar a l’historial');
        $('#btn-match-error-again').text('Una altra errada');
    } else {
        $('#btn-match-error-home').text('Tornar');
        $('#btn-match-error-again').text('Un altre');
    }

    const btnAgain = document.getElementById('btn-match-error-again');
    if (btnAgain) {
        btnAgain.style.display = remaining > 0 && !noMore ? 'inline-block' : 'none';
    }

    overlay.css('display', 'flex');

    const btnHome = document.getElementById('btn-match-error-home');
    if (btnHome) {
        btnHome.onclick = function() {
            overlay.hide();
            endMatchErrorReviewSession();
        };
    }

    if (btnAgain) {
        btnAgain.onclick = function() {
            overlay.hide();
            launchNextMatchError();
        };
    }
}

function promptMatchErrorNext() {
    const remaining = matchErrorQueue.length;
    showMatchErrorReviewOverlay(remaining, remaining === 0);
}

/* ===================== RELLOTGE DE PARTIDA ===================== */
// Ritme actiu segons el context: a la lliga, el ritme fixat de la temporada; en
// qualsevol altra partida, el triat per a la nova partida (per defecte, sense rellotge).
function getActiveTimeControlId() {
    if (currentGameMode === 'league' && currentLeague) {
        return currentLeague.timeControl || 'none';
    }
    return pendingFreeTimeControl || 'none';
}
function getTimeControlConfig() {
    return TIME_CONTROLS.find(t => t.id === getActiveTimeControlId()) || TIME_CONTROLS[0];
}
function formatClock(ms) {
    if (ms < 0) ms = 0;
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (m >= 1) return `${m}:${s.toString().padStart(2, '0')}`;
    // Sota el minut, mostra dècimes per tensió
    const tenths = Math.floor((ms % 1000) / 100);
    return `0:${s.toString().padStart(2, '0')}.${tenths}`;
}
function stopGameClock() {
    if (gameClock.interval) { clearInterval(gameClock.interval); gameClock.interval = null; }
    gameClock.active = null;
}
// Pausa sense perdre el torn (per a modals dins la partida)
function pauseGameClock() {
    if (gameClock.enabled && gameClock.interval) {
        clearInterval(gameClock.interval);
        gameClock.interval = null;
        gameClock.paused = true;
    }
}
function resumeGameClock() {
    if (gameClock.enabled && gameClock.paused && gameClock.active && !gameClock.interval) {
        gameClock.paused = false;
        gameClock.lastTs = Date.now();
        gameClock.interval = setInterval(clockTick, 200);
    }
}
function initGameClock(applies) {
    stopGameClock();
    const cfg = getTimeControlConfig();
    const enabled = applies && cfg.id !== 'none';
    gameClock = {
        enabled,
        white: enabled ? cfg.base * 1000 : 0,
        black: enabled ? cfg.base * 1000 : 0,
        inc: enabled ? cfg.inc * 1000 : 0,
        active: null,
        interval: null,
        lastTs: 0,
        paused: false
    };
    const wrap = document.getElementById('game-clocks');
    if (wrap) wrap.style.display = enabled ? 'flex' : 'none';
    if (!enabled) return;
    renderClock();
    // Comença a córrer pel costat que té el torn
    gameClock.active = game.turn();
    gameClock.lastTs = Date.now();
    gameClock.interval = setInterval(clockTick, 200);
    renderClock();
}
function clockTick() {
    if (!gameClock.enabled || !gameClock.active) return;
    const now = Date.now();
    const delta = now - gameClock.lastTs;
    gameClock.lastTs = now;
    if (gameClock.active === 'w') gameClock.white -= delta;
    else gameClock.black -= delta;
    renderClock();
    if (gameClock.white <= 0 || gameClock.black <= 0) {
        const flagged = gameClock.white <= 0 ? 'w' : 'b';
        stopGameClock();
        renderClock();
        runAfterPaint(() => handleGameOver(false, flagged));
    }
}
// Quan algú acaba de moure: afegeix l'increment a qui ha mogut i passa el torn
function clockOnMove() {
    if (!gameClock.enabled) return;
    const justMoved = (game.turn() === 'w') ? 'b' : 'w';
    if (gameClock.inc > 0) {
        if (justMoved === 'w') gameClock.white += gameClock.inc;
        else gameClock.black += gameClock.inc;
    }
    gameClock.active = game.turn();
    gameClock.lastTs = Date.now();
    renderClock();
}
function renderClock() {
    if (!gameClock.enabled) return;
    const youColor = playerColor;
    const oppColor = youColor === 'w' ? 'b' : 'w';
    const youMs = youColor === 'w' ? gameClock.white : gameClock.black;
    const oppMs = oppColor === 'w' ? gameClock.white : gameClock.black;
    const youEl = document.getElementById('clock-you');
    const oppEl = document.getElementById('clock-opp');
    if (youEl) {
        youEl.textContent = formatClock(youMs);
        youEl.parentElement.classList.toggle('clock-active', gameClock.active === youColor);
        youEl.parentElement.classList.toggle('clock-low', youMs <= 20000);
    }
    if (oppEl) {
        oppEl.textContent = formatClock(oppMs);
        oppEl.parentElement.classList.toggle('clock-active', gameClock.active === oppColor);
        oppEl.parentElement.classList.toggle('clock-low', oppMs <= 20000);
    }
}

async function startGame(isBundle, fen = null) {  // ← AFEGIR async
    // Si el mode "Sempre tinc sort" està actiu, estrena tauler i peces a l'atzar.
    maybeRollLuckyThemes();
    // Cedeix el motor: atura la pre-generació en segon pla (tret que estigui
    // preparant justament aquest exercici, que llavors es recull del rebost).
    requestBackgroundPrepAbort(isBundle ? fen : null);
    currentReview = [];
    lastReviewSnapshot = null;
    setResultIndicator(null);
    $('#btn-resign').prop('disabled', false);
    const checkmateImage = $('#checkmate-image');
    if (checkmateImage.length) checkmateImage.hide();
        if (!isBundle) {
        currentGameErrors = [];
        matchErrorQueue = [];
        currentMatchError = null;
        isMatchErrorReviewSession = false;
        currentBundleSource = null;
        currentBundleSeverity = null;
        }
    applyControlMode(loadControlMode(), { save: false, rebuild: false });
    $('#bundle-success-overlay').hide();
    $('#bundle-category-success-overlay').hide(); 
    $('#match-error-success-overlay').hide();
    if (!isBundle) isRandomBundleSession = false;
    
    $('#start-screen').hide();
    $('#stats-screen').hide();
    $('#settings-screen').hide();
    $('#league-screen').hide();
    $('#history-screen').hide();
    $('#calibration-result-screen').hide();
    $('#game-screen').addClass('active').show();
    navPush('game-screen');
    
blunderMode = isBundle; 
    isCalibrationGame = isCalibrationActive() && !isBundle;
    currentBundleFen = fen;
    
    // ✅ CALCULAR SEQÜÈNCIA FIXA PER BUNDLES
    bundleFixedSequence = null;
    if (isBundle && fen) {
        if (pendingPreparedSequence && pendingPreparedSequence.initialFen === fen) {
            // Seqüència ja preparada i verificada (p. ex. mat en 3)
            bundleFixedSequence = pendingPreparedSequence;
            pendingPreparedSequence = null;
        } else {
            // Primer mira el rebost d'exercicis pre-generats en segon pla
            bundleFixedSequence = takePreparedSequence(fen);
        }
        if (!bundleFixedSequence) {
            $('#status').text("Preparant exercici...").css('color', 'var(--accent-cream)');
            // Espera que acabi la preparació en segon pla en curs (s'ha demanat
            // aturar-la o és justament aquest FEN) per no barrejar anàlisis.
            if (backgroundPrepPromise) { try { await backgroundPrepPromise; } catch (e) {} }
            bundleFixedSequence = takePreparedSequence(fen) || await prepareBundleSequence(fen);

            if (!bundleFixedSequence) {
                alert("No s'ha pogut preparar l'exercici. Es retornarà al menú.");
                returnToMainMenuImmediate();
                return;
            }
        }

    }
    
    lastHumanMoveUci = null;
    isBundleStrictAnalysis = false;
    bundleBestMove = null;
    bundlePvMoves = {};
    bundlePvLines = {};
    bundleStrictPvLine = bundleFixedSequence ? (bundleFixedSequence.fullSequence || []) : [];
    bundleStrictPvDepth = 0;
    bundleSequenceStep = 1;
    bundleSequenceStartFen = fen || null;
    bundleStepStartFen = fen || null;
    bundleAutoReplyPending = false;
    bundleOpenAIHintPending = false;
    if (isBundle) { bundleAcceptMode = loadBundleAcceptMode(); }

    totalPlayerMoves = 0; 
    goodMoves = 0;
    totalEngineMoves = 0;
    goodEngineMoves = 0;
    isEngineThinking = false;
    pendingMoveEvaluation = false;
    currentGameStartTs = Date.now();
    currentGameEngineDepth = null;
    currentGameActiveStrengthElo = null;
    
    updatePrecisionDisplay();
    updateAIPrecisionDisplay();
    updateAIPrecisionTarget();
    updateCalibrationProgressUI();
    updateEloDisplay();
    
    game = new Chess(fen || undefined); 
    
    let boardOrientation = 'white';
    
    // LÒGICA DE COLORS
    if (isBundle) {
        playerColor = game.turn();
        boardOrientation = (playerColor === 'w') ? 'white' : 'black';
    } else {
        const isWhite = Math.random() < 0.5;
        playerColor = isWhite ? 'w' : 'b';
        boardOrientation = isWhite ? 'white' : 'black';
    }
    
    if (board) board.destroy();
    board = Chessboard('myBoard', {
        orientation: boardOrientation,
        draggable: (controlMode === 'drag'), 
        position: game.fen(), 
        onDragStart: onDragStart, 
        onDrop: onDrop, 
        onSnapEnd: onSnapEnd,
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });

    setTimeout(() => { resizeBoardToViewport(); }, 0);
    if (isMatchErrorReviewSession) {
        setTimeout(() => { scrollToMatchErrorReview(); }, 0);
    }
    
    if (controlMode === 'tap') {
        detachDragGuards();
        disableTapToMove(); 
        enableTapToMove();
    } else {
        disableTapToMove();
        attachDragGuards();
        clearTapSelection();
    }

    const engineReady = ensureStockfish();
    if (!engineReady) { $('#status').text("Motor Stockfish no carregat.").css('color', '#c62828'); }
    
    $('#blunder-alert').hide();

    // Lògica de Modes
    if (isCalibrationGame) {
        currentCalibrationOpponentRoc = getCalibrationOpponentRoc();
        aiDifficulty = levelToDifficulty(currentCalibrationOpponentRoc);
        if (engineReady) applyEngineEloStrength(currentCalibrationOpponentRoc);
        $('#engine-elo').text(`ROC ${currentCalibrationOpponentRoc}`);
        $('#game-mode-title').text('🎯 Partida de calibratge');
    } else if (isBundle) {
        currentGameMode = 'bundle';
        currentOpponent = null;
        $('#engine-elo').text('Anàlisi');
        let bundleTitle = isMatchErrorReviewSession ? '🔍 Errors de la partida' : '📚 Bundle';
        if (currentBundleSource === 'opening_drill') bundleTitle = "📖 Rectifica l'obertura";
        else if (currentBundleSource === 'mate_drill') bundleTitle = '🏁 Mat en 3 jugades';
        $('#game-mode-title').text(bundleTitle);
    } else if (leagueActiveMatch) {
        currentGameMode = 'league';
        const opp = getLeaguePlayer(leagueActiveMatch.opponentId);
        const opponentRoc = getLeagueOpponentRoc(leagueActiveMatch);
        currentOpponent = { id: leagueActiveMatch.opponentId, name: leagueActiveMatch.opponentName || (opp ? opp.name : 'Rival'), elo: opponentRoc };
        const label = `${currentOpponent.name} · ROC ${opponentRoc}`;
        $('#engine-elo').text(label);
        $('#game-mode-title').text(`🏆 Lliga · Jornada ${leagueActiveMatch.round}/9`);
        if (engineReady) applyEngineEloStrength(opponentRoc);
    } else if (window._startAssistedGame) {
        currentGameMode = 'assisted';
        currentOpponent = null;
        window._startAssistedGame = false;
        updateAdaptiveEngineEloLabel();
        $('#game-mode-title').text('🧭 Partida assistida');
        if (engineReady) applyEngineEloStrength(currentElo);
    } else {
        currentGameMode = 'free';
        currentOpponent = null;
        updateAdaptiveEngineEloLabel();
        $('#game-mode-title').text('♟ Nova partida');
        if (engineReady) applyEngineEloStrength(currentElo);
    }
        if (!isCalibrationGame) {
        currentCalibrationOpponentRoc = null;
    }
    currentGameActiveStrengthElo = getActiveStrengthElo();
    currentGameEngineDepth = eloToSearchDepth(currentGameActiveStrengthElo);

    // Botó "Analitza" només en partides amistoses i assistides (no calibratge/lliga/bundle)
    $('#btn-analyze').toggle((currentGameMode === 'free' || currentGameMode === 'assisted') && !isCalibrationGame);

    $('.square-55d63').removeClass('highlight-hint');
    clearEngineMoveHighlights();
    renderBundleErrorContext();
    renderTacticThemeHint();
    updateStatus();
    updateBundleHintButtons();

    // Inicialitza el rellotge (només modes de partida real, no exercicis ni calibratge)
    initGameClock(!isBundle && !isCalibrationGame);

    // Forçar actualització visual després de 100ms
    setTimeout(() => {
        updateBundleHintButtons();
        if (blunderMode) {
            const statusEl = $('#status');
            const totalSteps = (bundleFixedSequence && bundleFixedSequence.totalSteps) || 2;
            let msg;
            if (bundleSequenceStep === 1) {
                if (currentErrorContext) msg = `Rectifica l'errada: què calia jugar en lloc de ${currentErrorContext.san}?`;
                else if (currentBundleSource === 'mate_drill') msg = 'Fes escac i mat en 3 jugades';
                else msg = `Pas 1 de ${totalSteps}: Troba la millor jugada`;
            } else {
                msg = `Pas ${bundleSequenceStep} de ${totalSteps}: Completa la seqüència`;
            }
            statusEl.text(msg);
        }
    }, 100);
    
    if (playerColor !== game.turn()) {
        pendingEngineFirstMove = true;
        if (stockfishReady) {
            pendingEngineFirstMove = false;
            setTimeout(makeEngineMove, 500);
        }
    } else {
        pendingEngineFirstMove = false;
    }
}

function onDragStart(source, piece, position, orientation) {
    if (game.game_over() || isEngineThinking) return false;
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) || 
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) return false;
    if (blunderMode && game.turn() !== playerColor) return false;
}

function onDrop(source, target) {
    // Promoció de l'usuari: es deixa triar la peça abans de confirmar la jugada.
    // El peó torna a la casella d'origen mentre el selector és obert i la jugada
    // es completa (amb tota la comptabilitat) via commitHumanMove.
    if (isUserPromotionMove(game, source, target)) {
        showPromotionPicker(game.turn(), (piece) => commitHumanMove(source, target, piece));
        return 'snapback';
    }
    $('#blunder-alert').hide();
    if (engineMoveTimeout) clearTimeout(engineMoveTimeout);

    $('.square-55d63').removeClass('highlight-hint');
    lastPosition = game.fen(); 
    var move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) { showIllegalMoveFeedback(source); return 'snapback'; }
    clearEngineMoveHighlights();
    onErrorContextPlayerMoved();
    clockOnMove();
    lastHumanMoveUci = move.from + move.to + (move.promotion ? move.promotion : '');

    totalPlayerMoves++;
    pendingMoveEvaluation = true;
    updateStatus();

    if (game.game_over()) {
        if (blunderMode) {
            handleBundleGameOver();
        } else {
            pendingGameOverAfterMoveAnalysis = true;
            $('#status').text('Analitzant l’última jugada…');
            armGameOverWatchdog();
            analyzeMove();
        }
        return;
    }

    analyzeMove();
}

function onSnapEnd() { board.position(game.fen()); }

// Feedback visual breu quan s'intenta una jugada il·legal (punt 7)
function showIllegalMoveFeedback(square) {
    const el = document.querySelector('#myBoard .square-' + square);
    if (el) {
        el.classList.add('square-illegal');
        setTimeout(() => el.classList.remove('square-illegal'), 450);
    }
}

function makeEngineMove() {
    if (!stockfish && !ensureStockfish()) return;

    isEngineThinking = true; 
    $('#status').text("L'adversari pensa...");

    const depth = getAIDepth();
    currentGameEngineDepth = depth;
    currentGameActiveStrengthElo = getActiveStrengthElo();
    resetEngineMoveCandidates();

    // Font única de força: UCI_LimitStrength + UCI_Elo segons el nivell actiu.
    // Amb UCI_LimitStrength actiu, Stockfish ignora Skill Level, així que no el fixem
    // (evita el doble control que abans feia la força inconsistent). Re-afirmem cada
    // jugada per no heretar opcions d'altres modes (p. ex. pràctica d'obertures).
    applyEngineEloStrength(getActiveStrengthElo());
    const multiPvValue = getEngineMoveMultiPvValue(getActiveStrengthElo(), isCalibrationGame ? 7 : 5);
    try { stockfish.postMessage(`setoption name MultiPV value ${multiPvValue}`); } catch (e) {}
    stockfish.postMessage(`position fen ${game.fen()}`); 
    stockfish.postMessage(`go depth ${depth}`);
}

function chooseFallbackMove(fallbackMove, chessInstance = game) {
    const normalized = getStrengthNormalized();
    const mistakeChance = Math.max(0.1, 0.35 - (normalized * 0.25));
    if (Math.random() > mistakeChance) return fallbackMove;
    const legalMoves = chessInstance ? chessInstance.moves({ verbose: true }) : [];
    if (!legalMoves || legalMoves.length === 0) return fallbackMove;

    // Filtre d'humanització: en lloc d'una jugada aleatòria (que pot ser un disbarat que
    // cap humà faria), triem entre les jugades MÉS NATURALS i només si l'error de material
    // és coherent amb el nivell. Així els errors són "lògics": no veure la millor jugada,
    // no regalar peces sense intenció.
    const tolerableLoss = levelTolerableLossPawns(normalized);
    const candidates = legalMoves
        .map(mv => ({ mv, appeal: humanMoveAppeal(mv) }))
        .sort((a, b) => b.appeal - a.appeal)
        .slice(0, 8) // avaluem la seguretat només de les més naturals (cost acotat)
        .map(item => {
            const uci = `${item.mv.from}${item.mv.to}${item.mv.promotion || ''}`;
            return { uci, appeal: item.appeal, loss: immediateMaterialLoss(uci, chessInstance) };
        });

    const safe = candidates.filter(c => c.loss <= tolerableLoss && c.uci !== fallbackMove);
    // Si cap alternativa natural és prou segura, no forcem un disbarat: juguem la millor.
    if (!safe.length) return fallbackMove;

    // Tria ponderada per atractiu humà: l'error és una jugada amb intenció, no aleatòria.
    const total = safe.reduce((sum, c) => sum + c.appeal, 0);
    let roll = Math.random() * total;
    for (const c of safe) { roll -= c.appeal; if (roll <= 0) return c.uci; }
    return safe[safe.length - 1].uci;
}

function analyzeMove() {
    // Si la jugada del jugador acaba de finalitzar la partida, NO s'ha d'invocar
    // el motor sobre la posició final: en una posició sense jugades legals (escac
    // i mat, ofegat, taules...) Stockfish no retorna un "bestmove" fiable i
    // l'anàlisi es quedava penjada, de manera que el final de partida (resultat,
    // victòria i revisió) no s'arribava a mostrar mai. Tanquem la partida
    // directament, comptabilitzant l'última jugada segons el resultat.
    if (pendingGameOverAfterMoveAnalysis && game && game.game_over()) {
        resolvePendingMoveEvaluation(game.in_checkmate() ? 'excel' : 'good');
        finalizeGameOver();
        return;
    }

    if (!stockfish && !ensureStockfish()) {
        setTimeout(makeEngineMove, 300);
        return;
    }

    if (blunderMode && (bundleAcceptMode === 'top1' || bundleAcceptMode === 'top2')) {
        const bundleKey = lastPosition || currentBundleFen;
        const cached = bundleKey ? bundleAnswerCache.get(bundleKey) : null;
        if (cached && cached.mode === bundleAcceptMode) {
            const hasTop1 = cached.mode === 'top1' && cached.bestMove;
            const hasTop2 = cached.mode === 'top2' && cached.pvMoves && (cached.pvMoves['1'] || cached.pvMoves['2']);
            if (hasTop1 || hasTop2) {
                evaluateBundleAttempt(cached);
                return;
            }
        }
        isBundleStrictAnalysis = true;
        bundlePvMoves = {};
        bundleBestMove = null;
        bundlePvLines = {};
        bundleStrictPvLine = [];
        bundleStrictPvDepth = 0;
        const multiPvValue = bundleAcceptMode === 'top2' ? 2 : 1;
        stockfish.postMessage(`setoption name MultiPV value ${multiPvValue}`);
        stockfish.postMessage(`position fen ${lastPosition}`);
        stockfish.postMessage('go depth 12');
        return;
    }

    // CANVI: Activar MultiPV i resetejar buffer
    resetEnrichedAnalysisBuffer();
    waitingForBlunderAnalysis = true;
    analysisStep = 1;
    tempAnalysisScore = 0;
    pendingBestMove = null;
    pendingEvalBefore = null;
    pendingEvalAfter = null;
    pendingAnalysisFen = lastPosition;

    // CANVI: Demanar 3 variants per capturar alternatives
    if (DEBUG_ENRICHED_ANALYSIS) {
        console.log('[EnrichedAnalysis] start', {
            waitingForBlunderAnalysis,
            analysisStep,
            fen: lastPosition
        });
        console.log('[EnrichedAnalysis] setoption MultiPV value 3');
    }
    try { stockfish.postMessage('setoption name MultiPV value 3'); } catch (e) {}
    stockfish.postMessage(`position fen ${lastPosition}`);
    stockfish.postMessage('go depth 12');
}

function resolvePendingMoveEvaluation(moveQuality) {
    if (!pendingMoveEvaluation) return;
    if (moveQuality === 'excel' || moveQuality === 'good') {
        goodMoves++;
    }
    pendingMoveEvaluation = false;
    updatePrecisionDisplay();
}

/**
 * Acumula informació UCI durant l'anàlisi.
 * @param {object} info - Resultat de parseUciInfo
 */
function accumulateAnalysisInfo(info) {
    if (!info || info.multipv === undefined) return;

    const key = String(info.multipv);
    
    // Només actualitzar si la profunditat és igual o major
    if (!enrichedAnalysisBuffer[key] || 
        (info.depth && info.depth >= (enrichedAnalysisBuffer[key].depth || 0))) {
        enrichedAnalysisBuffer[key] = {
            depth: info.depth,
            score: info.score,
            scoreType: info.scoreType,
            pv: info.pv,
            move: info.pv[0] || null
        };
    }
}

/**
 * Extreu el resultat final de l'anàlisi acumulada.
 * @returns {object} - { depth, bestMove, bestMovePv, alternatives }
 */
function extractEnrichedAnalysis() {
    const result = {
        depth: null,
        bestMove: null,
        bestMovePv: [],
        alternatives: []
    };

    const pv1 = enrichedAnalysisBuffer['1'];
    if (pv1) {
        result.depth = pv1.depth;
        result.bestMove = pv1.move;
        result.bestMovePv = pv1.pv || [];
    }

    // Afegir alternatives (multipv 2 i 3)
    ['2', '3'].forEach(key => {
        const alt = enrichedAnalysisBuffer[key];
        if (alt && alt.move) {
            let evalCp = alt.score;
            if (alt.scoreType === 'mate') {
                evalCp = alt.score > 0 ? 10000 : -10000;
            }
            result.alternatives.push({
                move: alt.move,
                eval: evalCp,
                pv: alt.pv || []
            });
        }
    });

    return result;
}

/**
 * Reseteja el buffer d'anàlisi enriquida.
 */
function resetEnrichedAnalysisBuffer() {
    enrichedAnalysisBuffer = {};
}

function handleEngineMessage(rawMsg) {
    if (typeof rawMsg !== 'string') return;
    const msg = rawMsg.trim();
    // Detecta el rang real de UCI_Elo del binari carregat per no dependre de valors
    // codificats ni del retall silenciós del motor.
    if (!engineRangeDetected && msg.indexOf('option name UCI_Elo') !== -1) {
        const rangeMatch = msg.match(/min\s+(\d+)\s+max\s+(\d+)/);
        if (rangeMatch) {
            engineEloMin = parseInt(rangeMatch[1], 10);
            engineEloMax = parseInt(rangeMatch[2], 10);
            engineRangeDetected = true;
        }
        return;
    }
    if (msg === 'uciok') {
        try { stockfish.postMessage('isready'); } catch (e) {}
        return;
    }
    if (msg === 'readyok') {
        stockfishReady = true;
        if (pendingEngineFirstMove && playerColor !== game.turn()) {
            pendingEngineFirstMove = false;
            setTimeout(makeEngineMove, 200);
        }
        return;
    }

    // Pre-càlcul del millor moviment per feedback instantani (obertures)
    if (openingPreCalcPending && stockfishRequestor === 'opening-precalc' && msg.indexOf('bestmove') !== -1) {
        stockfishRequestor = null;
        const match = msg.match(/bestmove\s([a-h][1-8])([a-h][1-8])([qrbn])?/);
        if (match) {
            const bestMove = match[1] + match[2] + (match[3] || '');
            processOpeningPreCalcResult(bestMove);
        } else {
            processOpeningPreCalcResult(null);
        }
        return;
    }

    // Anàlisi de precisió del tauler d'obertures (sistema de dos passos)
    if (openingPracticeAnalysisPending && openingAnalysisStep > 0 && stockfishRequestor === 'opening-analysis' && msg.indexOf('bestmove') !== -1) {
        const match = msg.match(/bestmove\s([a-h][1-8])([a-h][1-8])([qrbn])?/);
        if (openingAnalysisStep === 1) {
            // Pas 1 completat: tenim la posició abans del moviment
            // No netejem stockfishRequestor perquè passem al pas 2
            const bestMove = match ? (match[1] + match[2] + (match[3] || '')) : null;
            processOpeningAnalysisStep1(bestMove);
        } else if (openingAnalysisStep === 2) {
            // Pas 2 completat: tenim la posició després del moviment
            stockfishRequestor = null;
            processOpeningAnalysisStep2();
        }
        return;
    }

    // Pista del tauler d'obertures
    if (openingPracticeHintPending && stockfishRequestor === 'opening-hint' && msg.indexOf('bestmove') !== -1) {
        stockfishRequestor = null;
        openingPracticeHintPending = false;
        const match = msg.match(/bestmove\s([a-h][1-8])([a-h][1-8])([qrbn])?/);
        if (match) {
            const fromSquare = match[1];
            const toSquare = match[2];
            openingPracticeBestMove = fromSquare + toSquare + (match[3] || '');
            // Marcar visualment les caselles
            highlightOpeningHint(fromSquare, toSquare);
            const noteEl = document.getElementById('opening-practice-note');
            if (noteEl) {
                noteEl.innerHTML = `<div style="padding:12px; background:rgba(156,39,176,0.15); border-left:3px solid var(--accent-purple); border-radius:8px;">
                    <strong>💡 Pista:</strong> Mou de <strong>${fromSquare}</strong> a <strong>${toSquare}</strong>
                </div>`;
            }
        }
        return;
    }

    if (openingPracticeEngineThinking && stockfishRequestor === 'opening-engine' && msg.indexOf('bestmove') !== -1) {
        stockfishRequestor = null;
        // Si mentrestant hem entrat en un exercici jeroglífic, descarta aquesta resposta:
        // openingPracticeGame ara apunta al tauler de l'exercici i no s'ha de tocar.
        if (hieroglyphicExerciseActive) {
            openingPracticeEngineThinking = false;
            return;
        }
        const match = msg.match(/bestmove\s([a-h][1-8])([a-h][1-8])([qrbn])?/);
        if (match && openingPracticeGame) {
            const fallbackMove = match[1] + match[2] + (match[3] || '');
            const useAdaptiveOpeningOpponent = !openingLessonActive && !openingErrorPracticeActive;
            const chosen = useAdaptiveOpeningOpponent
                ? (chooseHumanLikeMove(openingEngineMoveCandidates, openingPracticeGame) || { move: null })
                : { move: fallbackMove };
            const moveStr = (useAdaptiveOpeningOpponent && openingEngineMoveCandidates.length > 0 && chosen.move)
                ? chosen.move
                : (useAdaptiveOpeningOpponent ? chooseFallbackMove(fallbackMove, openingPracticeGame) : fallbackMove);
            const from = moveStr.substring(0, 2);
            const to = moveStr.substring(2, 4);
            const promotion = moveStr.length > 4 ? moveStr[4] : (match[3] || 'q');
            resetOpeningEngineMoveCandidates();
            try { stockfish.postMessage('setoption name MultiPV value 1'); } catch (e) {}

            // Fer el moviment de l'engine immediatament en chess.js (per evitar que l'usuari mogui abans)
            const move = openingPracticeGame.move({
                from,
                to,
                promotion
            });
            if (move) {
                clearOpeningHintHighlight();
                openingPracticeBestMove = null;
                openingPracticeMoveCount += 1;
                updateOpeningPracticeStatus();
                // Afegir moviment de l'engine a la seqüència d'obertures
                if (move.san) {
                    openingCurrentSequence.push(move.san);
                    console.log(`[OpeningEngine] Moviment engine afegit: ${move.san}, seqüència: [${openingCurrentSequence.join(', ')}]`);
                    // Actualitzar l'obertura seleccionada i la pista
                    updateSelectedOpening();
                }
            }

            // Ara l'estat del joc és correcte, podem permetre que l'usuari mogui
            openingPracticeEngineThinking = false;
            updateOpeningUndoButton();

            // Actualitzar el tauler visualment amb un petit delay per a animació suau
            setTimeout(() => {
                if (openingBundleBoard && openingPracticeGame) {
                    openingBundleBoard.position(openingPracticeGame.fen());
                }
                // Pre-calcular el millor moviment per al proper torn de l'usuari
                preCalculateOpeningBestMove();
            }, 200);
        } else {
            openingPracticeEngineThinking = false;
            updateOpeningUndoButton(); // Rehabilitar undo
            // Pre-calcular el millor moviment per al proper torn de l'usuari
            preCalculateOpeningBestMove();
        }
        return;
    }

    // Handler per moviment de l'oponent en pràctica d'errors d'obertura
    if (openingErrorPracticeActive && stockfishRequestor === 'opening-error-opponent' && msg.indexOf('bestmove') !== -1) {
        stockfishRequestor = null;
        openingPracticeEngineThinking = false;
        const match = msg.match(/bestmove\s([a-h][1-8])([a-h][1-8])([qrbn])?/);
        if (match && openingPracticeGame) {
            const from = match[1];
            const to = match[2];
            const promotion = match[3] || 'q';
            const move = openingPracticeGame.move({ from, to, promotion });
            if (move) {
                setTimeout(() => {
                    openingBundleBoard.position(openingPracticeGame.fen());
                    // Obtenir el millor moviment per l'usuari
                    requestOpeningErrorBestMoveForUser();
                }, 300);
            }
        }
        return;
    }

    // Handler per obtenir millor moviment de l'usuari en pràctica d'errors
    if (openingErrorPracticeActive && stockfishRequestor === 'opening-error-bestmove' && msg.indexOf('bestmove') !== -1) {
        stockfishRequestor = null;
        const match = msg.match(/bestmove\s([a-h][1-8])([a-h][1-8])([qrbn])?/);
        if (match) {
            openingErrorBestMove = match[1] + match[2] + (match[3] || '');
            openingPracticeBestMove = openingErrorBestMove;
        }
        return;
    }

    if (bundleAutoReplyPending && msg.indexOf('bestmove') !== -1) {
        bundleAutoReplyPending = false;
        try { stockfish.postMessage('setoption name MultiPV value 1'); } catch (e) {}
        const match = msg.match(/bestmove\s([a-h][1-8])([a-h][1-8])([qrbn])?/);
        if (match) {
            const replyMove = match[1] + match[2] + (match[3] || '');
            applyBundleAutoReply(replyMove);
        }
        return;
    }

    if (tvJeroglyphicsAnalyzing) {
        if (msg.indexOf('bestmove') !== -1) {
            tvJeroglyphicsAnalyzing = false;
            try { stockfish.postMessage('setoption name MultiPV value 1'); } catch (e) {}
            const bestMatch = msg.match(/bestmove\s([a-h][1-8][a-h][1-8][qrbn]?)/);
            if (!tvJeroglyphicsTopMoves.length) {
                tvJeroglyphicsTopMoves = bestMatch ? [bestMatch[1]] : [];
            }
            setTvStatus('Jeroglífic: endevina la millor jugada.');
            updateTvControls();
            updateTvJeroglyphicsUI();        
        }
        return;
    }

    if (tvJeroglyphicsHinting && msg.indexOf('bestmove') !== -1) {
        tvJeroglyphicsHinting = false;
        const match = msg.match(/bestmove\s([a-h][1-8])([a-h][1-8])/);
        if (match) {
            const to = match[2];
            highlightTvHintSquare(to);
            setTvStatus(`Pista: Alguna peça ha d'anar a ${to}`);
        }
        return;
    }
    
    // NOU: Capturar línies "info" per anàlisi enriquida
    if (waitingForBlunderAnalysis && msg.startsWith('info') && msg.indexOf(' pv ') !== -1) {
        if (DEBUG_ENRICHED_ANALYSIS) console.log('[EnrichedAnalysis] info', msg);
        const parsedInfo = parseUciInfo(msg);
        if (parsedInfo) {
            accumulateAnalysisInfo(parsedInfo);
            // Actualitzar score temporal del multipv 1
            if (parsedInfo.multipv === 1 && parsedInfo.score !== null) {
                if (parsedInfo.scoreType === 'mate') {
                    tempAnalysisScore = parsedInfo.score > 0 ? 10000 : -10000;
                } else {
                    tempAnalysisScore = parsedInfo.score;
                }
            }
        }
    }

    if (msg.indexOf('score cp') !== -1) {
        let match = msg.match(/score cp (-?\d+)/);
        if (match) {
            tempAnalysisScore = parseInt(match[1]);
            // Capturar també per a l'anàlisi d'obertures
            if (openingPracticeAnalysisPending && openingAnalysisStep > 0) {
                openingTempScore = parseInt(match[1]);
            }
        }
    }
    if (msg.indexOf('score mate') !== -1) {
         let match = msg.match(/score mate (-?\d+)/);
         if (match) {
             let mates = parseInt(match[1]);
             tempAnalysisScore = mates > 0 ? 10000 : -10000;
             // Capturar també per a l'anàlisi d'obertures
             if (openingPracticeAnalysisPending && openingAnalysisStep > 0) {
                 openingTempScore = mates > 0 ? 10000 : -10000;
             }
         }
    }

    trackEngineCandidate(msg);
    
    // Validació estricta en mode Bundle
    if (isBundleStrictAnalysis) {
        if (msg.startsWith('info') && msg.indexOf(' pv ') !== -1) {
            const parsedInfo = parseUciInfo(msg);
            if (parsedInfo && (parsedInfo.multipv === 1 || parsedInfo.multipv === 2)) {
                const depth = parsedInfo.depth || 0;
                const existingDepth = bundlePvLines[parsedInfo.multipv]?.depth || 0;
                if (depth >= existingDepth) {
                    bundlePvLines[parsedInfo.multipv] = { depth, pv: parsedInfo.pv || [] };
                    if (parsedInfo.multipv === 1) {
                        bundleStrictPvLine = parsedInfo.pv || [];
                        bundleStrictPvDepth = depth;
                    }
                }
            }
        }
        if (bundleAcceptMode === 'top2') {
            const pvMatch = msg.match(/multipv\s+([12]).*?\spv\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
            if (pvMatch) {
                bundlePvMoves[pvMatch[1]] = pvMatch[2];
            }
        }

        if (msg.indexOf('bestmove') !== -1) {
            isBundleStrictAnalysis = false;
            try { stockfish.postMessage('setoption name MultiPV value 1'); } catch (e) {}

            if (bundleAcceptMode === 'top1') {
                const bestMatch = msg.match(/bestmove\s([a-h][1-8][a-h][1-8][qrbn]?)/);
                bundleBestMove = bestMatch ? bestMatch[1] : null;
                cacheBundleAnswer(lastPosition, bundleAcceptMode, bundleBestMove, {}, bundleStrictPvLine, null);
                evaluateBundleAttempt({ mode: bundleAcceptMode, bestMove: bundleBestMove, pvMoves: {}, pvLine: bundleStrictPvLine });
                return;
            }

            cacheBundleAnswer(lastPosition, bundleAcceptMode, null, { ...bundlePvMoves }, null, { ...bundlePvLines });
            evaluateBundleAttempt({ mode: bundleAcceptMode, bestMove: null, pvMoves: { ...bundlePvMoves }, pvLines: { ...bundlePvLines } });
        }
        return;
    }

    if (isAnalyzingHint && msg.indexOf('bestmove') !== -1) {
        isAnalyzingHint = false;
        const match = msg.match(/bestmove\s([a-h][1-8])([a-h][1-8])/);
        if (match) {
            const to = match[2];
            $('#myBoard').find('.square-' + to).addClass('highlight-hint');
            $('#status').text(`Pista: Alguna peça ha d'anar a ${to}`);
        }
        return;
    }

    if (msg.indexOf('bestmove') !== -1 && waitingForBlunderAnalysis) {
        if (analysisStep === 1) {
            // CANVI: Extreure anàlisi enriquida
            const enriched = extractEnrichedAnalysis();
            
            const bestMatch = msg.match(/bestmove\s([a-h][1-8][a-h][1-8][qrbn]?)/);
            pendingBestMove = enriched.bestMove || (bestMatch ? bestMatch[1] : null);
            pendingBestMovePv = enriched.bestMovePv || [];
            pendingAnalysisDepth = enriched.depth || null;
            pendingAlternatives = enriched.alternatives || [];
            pendingEvalBefore = tempAnalysisScore;
            
            // Resetejar buffer i MultiPV per la segona anàlisi
            resetEnrichedAnalysisBuffer();
            try { stockfish.postMessage('setoption name MultiPV value 1'); } catch (e) {}
            
            analysisStep = 2;
            stockfish.postMessage(`position fen ${game.fen()}`);
            stockfish.postMessage('go depth 10');
        }
        else if (analysisStep === 2) {
            pendingEvalAfter = tempAnalysisScore;
            let swing = pendingEvalAfter + (pendingEvalBefore || 0);
            if (!isCalibrationGame && !blunderMode && (currentGameMode === 'free' || currentGameMode === 'assisted')) {
                const delta = swing;
                const isError = delta > TH_ERR;
                recentErrors.push(isError);
                if (recentErrors.length > ERROR_WINDOW_N) recentErrors.shift();
                if (recentErrors.length === ERROR_WINDOW_N) {
                    recentErrors = recentErrors.slice(-ERROR_WINDOW_N);
                }
                saveStorage();
            }           
            waitingForBlunderAnalysis = false;
            const moveQuality = classifyMoveQuality(Math.abs(swing), lastHumanMoveUci, pendingBestMove);
            registerMoveReview(swing, {
                fen: pendingAnalysisFen,
                bestMove: pendingBestMove,
                bestMovePv: pendingBestMovePv,
                depth: pendingAnalysisDepth,
                alternatives: pendingAlternatives,
                evalBefore: pendingEvalBefore,
                evalAfter: pendingEvalAfter
            });
            resolvePendingMoveEvaluation(moveQuality);
            
            if (swing > 250 && !blunderMode) {
                let severity = 'low';
                if (swing > 800) severity = 'high';
                else if (swing > 500) severity = 'med';

                $('#blunder-alert').removeClass('alert-low alert-med alert-high')
                    .addClass('alert-' + severity).show();

                saveBlunderToBundle(
                    pendingAnalysisFen || lastPosition,
                    severity,
                    pendingBestMove,
                    lastHumanMoveUci,
                    pendingBestMovePv
                );

                engineMoveTimeout = setTimeout(() => {
                    if (!game.game_over()) makeEngineMove();
                }, 1500);

            } else {
                if (blunderMode) handleBundleSuccess();
                else if (!game.game_over()) makeEngineMove();
            }
            pendingBestMove = null;
            pendingBestMovePv = [];
            pendingAnalysisDepth = null;
            pendingAlternatives = [];
            pendingEvalBefore = null;
            pendingEvalAfter = null;
            pendingAnalysisFen = null;

            if (pendingGameOverAfterMoveAnalysis && game && game.game_over()) {
                finalizeGameOver();
            }
        }
        return;
    }

    if (msg.indexOf('bestmove') !== -1 && isEngineThinking) {
        const match = msg.match(/bestmove\s([a-h][1-8])([a-h][1-8])([qrbn])?/);
        if (match) {
            const fallbackMove = match[1] + match[2] + (match[3] || '');
            // Mateix model de selecció per calibratge i joc lliure: així el ROC estimat
            // durant el calibratge reflecteix la força real que el jugador trobarà després.
            const chosen = chooseHumanLikeMove(engineMoveCandidates) || { move: null };
            const moveStr = (engineMoveCandidates.length > 0 && chosen.move)
                ? chosen.move
                : chooseFallbackMove(fallbackMove);
            const fromSq = moveStr.substring(0, 2);
            const toSq = moveStr.substring(2, 4);
            const promotion = moveStr.length > 4 ? moveStr[4] : (match[3] || 'q');
            registerEngineMovePrecision(moveStr, engineMoveCandidates);    
            resetEngineMoveCandidates();
            try { stockfish.postMessage('setoption name MultiPV value 1'); } catch (e) {}
            setTimeout(() => {
                isEngineThinking = false;
                game.move({ from: fromSq, to: toSq, promotion: promotion });
                clockOnMove();
                board.position(game.fen());
                highlightEngineMove(fromSq, toSq);
                updateStatus();
                // El moviment ja s'ha aplicat al tauler; es difereix el final de
                // partida perquè el navegador pinti el moviment (inclòs el mat)
                // a l'instant en lloc d'esperar al processament pesat.
                if (game.game_over()) runAfterPaint(() => handleGameOver());
            }, 900);
        }
    }
}

function selectBundlePvLineForMove(bundleData, playedMove) {
    if (!bundleData) return [];
    if (Array.isArray(bundleData.pvLine) && bundleData.pvLine.length) {
        return bundleData.pvLine;
    }
    const pvLines = bundleData.pvLines || {};
    const candidates = Object.values(pvLines)
        .map(entry => entry?.pv || entry)
        .filter(line => Array.isArray(line) && line.length);
    const match = candidates.find(line => line[0] === playedMove);
    return match || (candidates[0] || []);
}

function applyBundleAutoReply(moveUci) {
    if (!moveUci) return;
    const fromSq = moveUci.substring(0, 2);
    const toSq = moveUci.substring(2, 4);
    const promotion = moveUci.length > 4 ? moveUci[4] : 'q';
    game.move({ from: fromSq, to: toSq, promotion });
    board.position(game.fen());
    highlightEngineMove(fromSq, toSq);
    bundleStepStartFen = game.fen();
    lastHumanMoveUci = null;
    updateStatus();
}

function requestBundleAutoReply() {
    if (!stockfish && !ensureStockfish()) return;
    bundleAutoReplyPending = true;
    try { stockfish.postMessage('setoption name MultiPV value 1'); } catch (e) {}
    stockfish.postMessage(`position fen ${game.fen()}`);
    stockfish.postMessage('go depth 10');
}

function resetBundleToStartPosition() {
    const fen = bundleStepStartFen || currentBundleFen || lastPosition || null;
    if (!fen) return;
    try { game.load(fen); } catch (e) { return; }
    board.position(game.fen());

    lastHumanMoveUci = null;
    waitingForBlunderAnalysis = false;
    isEngineThinking = false;
    $('.square-55d63').removeClass('highlight-hint tap-selected tap-move');
    clearEngineMoveHighlights();
    clearTapSelection();
    clearMainMoveVisualFeedback();
    $('#blunder-alert').hide();
    
    // CANVI: Restaurar el missatge d’OpenAI si existeix
    const statusEl = $('#status');
    if (lastBundleOpenAIHint) {
        statusEl.html(lastBundleOpenAIHint);
    } else {
        statusEl.text("Torna a intentar-ho");
    }
}

function cacheBundleAnswer(fen, mode, bestMove, pvMoves, pvLine = null, pvLines = null) {
    if (!fen || !mode) return;
    bundleAnswerCache.set(fen, { mode, bestMove, pvMoves, pvLine, pvLines });
}

function evaluateBundleAttempt(bundleData) {
    const played = lastHumanMoveUci || '';
    const playedTo = played.length >= 4 ? played.slice(2, 4) : null;
    
    // ✅ SI HI HA SEQÜÈNCIA FIXA, USAR-LA (2 o 3 passos de jugador)
    if (bundleFixedSequence) {
        const step = bundleSequenceStep;
        const totalSteps = bundleFixedSequence.totalSteps || 2;

        // Validar segons el pas actual
        const stepData = step === 1
            ? bundleFixedSequence.step1
            : (step === 2 ? bundleFixedSequence.step2 : bundleFixedSequence.step3);

        const expectedMove = stepData ? stepData.playerMove : null;
        const alternatives = (stepData && stepData.alternatives) || [];

        // Validar jugada
        let ok = played === expectedMove;

        // Si mode top2, acceptar també alternatives
        if (!ok && bundleAcceptMode === 'top2' && alternatives.length > 0) {
            ok = alternatives.some(alt => alt.move === played);
        }

        if (ok) {
            if (pendingMoveEvaluation) {
                goodMoves++;
                pendingMoveEvaluation = false;
                updatePrecisionDisplay();
            }
            if (playedTo) showMainMoveVisualFeedback(playedTo, 'correct');

            if (step < totalSteps) {
                // CANVI: Netejar el missatge d’OpenAI només quan s'avança de pas
                lastBundleOpenAIHint = null;

                bundleSequenceStep = step + 1;
                const replyMove = step === 1
                    ? bundleFixedSequence.opponentMove.move
                    : bundleFixedSequence.opponentMove2.move;
                applyBundleAutoReply(replyMove);
                bundleStepStartFen = game.fen();

                $('#status').text(`Pas ${step + 1} de ${totalSteps}: Completa la seqüència`);
                return;
            }

            // CANVI: Netejar el missatge quan s'acaba l'exercici
            lastBundleOpenAIHint = null;
            handleBundleSuccess();
        } else {
            if (playedTo) showMainMoveVisualFeedback(playedTo, 'incorrect');
            // Error - resetar al pas actual
            if (pendingMoveEvaluation) {
                pendingMoveEvaluation = false;
                totalPlayerMoves = Math.max(0, totalPlayerMoves - 1);
                updatePrecisionDisplay();
            }
            
            if (bundleSequenceStep === 1) {
                bundleStepStartFen = bundleSequenceStartFen;
            }
            setTimeout(() => {
                resetBundleToStartPosition();
            }, 700);
        }
        return;
    }
    
    // ❌ FALLBACK: Mètode antic si no hi ha seqüència fixa
    const playedBase = played.slice(0, 4);
    let ok = false;
    if (bundleData.mode === 'top1') {
        const bestMove = bundleData.bestMove || '';
        const bestBase = bestMove.slice(0, 4);
        ok = bestMove ? (played === bestMove || playedBase === bestBase) : false;
    } else if (bundleData.mode === 'top2') {
        const accepted = [bundleData.pvMoves?.['1'], bundleData.pvMoves?.['2']].filter(Boolean);
        ok = accepted.length > 0 ? accepted.includes(played) : false;
    }
    
    if (ok) {
        if (pendingMoveEvaluation) { 
            goodMoves++; 
            pendingMoveEvaluation = false; 
            updatePrecisionDisplay(); 
        }
        if (playedTo) showMainMoveVisualFeedback(playedTo, 'correct');
        
        if (bundleSequenceStep === 1) {
            // CANVI: Netejar el missatge d’OpenAI només quan s'avança al pas 2
            lastBundleOpenAIHint = null;
            
            const pvLine = selectBundlePvLineForMove(bundleData, played);
            const replyMove = pvLine.length > 1 ? pvLine[1] : null;
            bundleSequenceStep = 2;
            if (replyMove) {
                applyBundleAutoReply(replyMove);
            } else {
                requestBundleAutoReply();
            }
            bundleStepStartFen = game.fen();
            return;
        }
        
        // CANVI: Netejar el missatge quan s'acaba l'exercici
        lastBundleOpenAIHint = null;
        handleBundleSuccess();
    } else {
        if (playedTo) showMainMoveVisualFeedback(playedTo, 'incorrect');
        if (pendingMoveEvaluation) {
            pendingMoveEvaluation = false;
            totalPlayerMoves = Math.max(0, totalPlayerMoves - 1);
            updatePrecisionDisplay();
        }
        if (bundleSequenceStep === 1) {
            bundleStepStartFen = bundleSequenceStartFen;
        }
        setTimeout(() => {
            resetBundleToStartPosition();
        }, 700);
    }
}

function showBundleTryAgainModal() {
    $('#bundle-retry-modal').remove();
    const stepLabel = bundleSequenceStep === 2 ? 'aquest segon pas' : 'aquest pas';
    const reasonText = bundleAcceptMode === 'top2'
        ? `Aquesta no és una de les dues millors opcions per ${stepLabel}. Prova una altra jugada.`
        : `Aquesta no és la millor opció per ${stepLabel}. Prova una altra jugada.`;
    let html = '<div class="modal-overlay" id="bundle-retry-modal" style="display:flex;">';
    html += '<div class="modal-content">';
    html += '<div class="modal-title">Tornar a intentar</div>';
    html += `<div style="margin:12px 0; color:var(--text-secondary); line-height:1.4;">${reasonText}</div>`;
    html += '<button class="btn btn-primary" id="btn-bundle-retry-ok">D’acord</button>';
    html += '</div></div>';
    $('body').append(html);

    $('#btn-bundle-retry-ok').off('click').on('click', () => {
        $('#bundle-retry-modal').remove();
        resetBundleToStartPosition();
    });
}

function renderReviewBreakdown(counts) {
    const container = $('#review-breakdown');
    if (!container.length) return;
    container.empty();
    const items = [
        { key: 'excel', label: 'Excel·lents', css: 'excel' },
        { key: 'good', label: 'Bones', css: 'good' },
        { key: 'inaccuracy', label: 'Imprecisions', css: 'inaccuracy' },
        { key: 'mistake', label: 'Errors', css: 'mistake' },
        { key: 'blunder', label: 'Blunders', css: 'blunder' }
    ];
    items.forEach(item => {
        const value = counts[item.key] || 0;
        const block = `<div class="review-chip ${item.css}"><span>${item.label}</span><strong>${value}</strong></div>`;
        container.append(block);
    });
}

function showPostGameReview(msg, finalPrecision, counts, onClose, options = {}) {
    const modal = $('#review-modal');
    if (!modal.length) {
        alert(msg + (finalPrecision ? `\nPrecisió: ${finalPrecision}%` : ''));
        if (typeof onClose === 'function') onClose();
        return;
    }
    
    const checkmateOverlay = $('#checkmate-overlay');
    const checkmateImage = $('#checkmate-image');
    const openReviewModal = () => {
        if (checkmateImage.length) {
            if (options.showCheckmate) {
                checkmateImage.show();
            } else {
                checkmateImage.hide();
            }
        }
    
        $('#review-result-text').text(msg);
        $('#review-precision-value').text(finalPrecision ? `${finalPrecision}%` : '—');
        renderReviewBreakdown(counts || summarizeReview(currentReview));
        renderGameDebrief(options.entry);
        modal.css('display', 'flex');
    };
    
    if (reviewAutoCloseTimer) {
        clearTimeout(reviewAutoCloseTimer);
        reviewAutoCloseTimer = null;
    }
    if (reviewOpenDelayTimer) {
        clearTimeout(reviewOpenDelayTimer);
        reviewOpenDelayTimer = null;
    }

     if (options.showCheckmate) {
        if (checkmateOverlay.length) {
            checkmateOverlay.hide();
        }
        reviewOpenDelayTimer = setTimeout(() => {            
            openReviewModal();
        }, 2000);
    } else {
        openReviewModal();
    }

    const hasMatchErrors = currentGameErrors.length > 0;
    const reviewErrorsBtn = $('#btn-review-errors');
    if (reviewErrorsBtn.length) {
        reviewErrorsBtn.toggle(hasMatchErrors);
        reviewErrorsBtn.off('click').on('click', () => {
            modal.hide();
            startMatchErrorReview();
        });
    }
    const reviewHieroglyphicBtn = $('#btn-review-hieroglyphic');
    if (reviewHieroglyphicBtn.length) {
        reviewHieroglyphicBtn.toggle(hasPersonalHieroglyphicCandidate());
        reviewHieroglyphicBtn.off('click').on('click', () => {
            modal.hide();
            startPersonalHieroglyphicFromLastGame();
        });
    }

    const taskForReview = options.disableGrowth ? null : (options.growthTask || currentGrowthTask || getNextBestTrainingTask({ previewOnly: true, source: 'review' }));
    renderGrowthRecommendation(taskForReview, onClose);

    // Comptador d'errors nous desats en aquesta partida
    const newErrorsEl = $('#review-newerrors');
    if (newErrorsEl.length) {
        if (hasMatchErrors) {
            newErrorsEl.html(`S'han desat <strong>${currentGameErrors.length}</strong> ${currentGameErrors.length === 1 ? 'posició' : 'posicions'} per repassar.`).show();
        } else {
            newErrorsEl.hide();
        }
    }

    // Anàlisi d'obertura post-partida (punt 9)
    const openingNoteEl = $('#review-opening-note');
    if (openingNoteEl.length) {
        let oa = null;
        try { oa = analyzeGameOpening(game ? game.history() : []); } catch (e) { oa = null; }
        if (oa && oa.name) {
            const moveNum = oa.deviationPly != null ? Math.floor(oa.deviationPly / 2) + 1 : null;
            let html = `Obertura: <strong>${oa.name}</strong>${oa.eco ? ` (${oa.eco})` : ''}.`;
            if (oa.deviationMove && moveNum) {
                const who = oa.deviationBy === playerColor ? 'Tu' : 'el rival';
                const theory = oa.theoryMoves && oa.theoryMoves.length ? ` La teoria solia jugar ${oa.theoryMoves.join(', ')}.` : '';
                html += ` ${who} va deixar la teoria al moviment ${moveNum} amb <strong>${oa.deviationMove}</strong>.${theory}`;
            } else {
                html += ` Vau seguir la teoria durant ${Math.floor(oa.depth / 2)} moviments.`;
            }
            openingNoteEl.html(html).show();
        } else {
            openingNoteEl.hide();
        }
    }

    // Botó "Tornar a jugar" per a modes lliure/assistit (punt 6)
    const againBtn = $('#btn-review-again');
    if (againBtn.length) {
        const replayable = (currentGameMode === 'free' || currentGameMode === 'assisted');
        againBtn.toggle(replayable);
        if (replayable) {
            const wasAssisted = (currentGameMode === 'assisted');
            againBtn.off('click').on('click', () => {
                if (reviewAutoCloseTimer) { clearTimeout(reviewAutoCloseTimer); reviewAutoCloseTimer = null; }
                if (reviewOpenDelayTimer) { clearTimeout(reviewOpenDelayTimer); reviewOpenDelayTimer = null; }
                checkmateOverlay.hide();
                modal.hide();
                if (wasAssisted) { window._startAssistedGame = true; startGame(false); }
                else { novaPartida(); }
            });
        }
    }

    $('#btn-review-close').off('click').on('click', () => {
         if (reviewAutoCloseTimer) {
            clearTimeout(reviewAutoCloseTimer);
            reviewAutoCloseTimer = null;
        }
        if (reviewOpenDelayTimer) {
            clearTimeout(reviewOpenDelayTimer);
            reviewOpenDelayTimer = null;
        }
        checkmateOverlay.hide();        
        modal.hide();
        if (typeof onClose === 'function') onClose();
    });
    $('#btn-review-stats').off('click').on('click', () => {
        if (reviewAutoCloseTimer) {
            clearTimeout(reviewAutoCloseTimer);
            reviewAutoCloseTimer = null;
        }        
                if (reviewOpenDelayTimer) {
            clearTimeout(reviewOpenDelayTimer);
            reviewOpenDelayTimer = null;
        }
        checkmateOverlay.hide();
        modal.hide();
        $('#start-screen').hide(); $('#league-screen').hide(); $('#game-screen').removeClass('active').hide(); $('#settings-screen').hide(); $('#stats-screen').show();
        updateStatsDisplay(); navStack = []; navPush('stats-screen');
        if (typeof onClose === 'function') onClose();
    });

    $('#btn-review-menu').off('click').on('click', () => {
        if (reviewAutoCloseTimer) {
            clearTimeout(reviewAutoCloseTimer);
            reviewAutoCloseTimer = null;
        }
        if (reviewOpenDelayTimer) {
            clearTimeout(reviewOpenDelayTimer);
            reviewOpenDelayTimer = null;
        }
        checkmateOverlay.hide();
        modal.hide();
        returnToMainMenuImmediate();
    });
}

function returnToMainMenuImmediate() {
    stopGameClock();
    $('#game-screen').removeClass('active').hide(); $('#league-screen').hide(); $('#stats-screen').hide(); $('#settings-screen').hide(); $('#calibration-result-screen').hide(); $('#start-screen').show(); navStack = [];
    if (stockfish) stockfish.postMessage('stop');
    clearTapSelection();
    isMatchErrorReviewSession = false;
    isSrsReviewSession = false;
    isDailyPuzzleSession = false;
    isTacticsSession = false;
    matchErrorQueue = [];
    currentMatchError = null;
    currentBundleSource = null;
    currentBundleSeverity = null;
    blunderMode = false;
    updateBundleHintButtons();
    updateDisplay();
    // De tornada al menú el motor queda lliure: reprèn la pre-generació d'exercicis
    setTimeout(backgroundPrepTick, 1200);
}

function handleBundleSuccess() {
    bundleSequenceStep = 1;
    bundleStepStartFen = null;
    $('#status').text("EXCEL·LENT! Problema resolt 🏆").css('color', '#4a7c59').css('font-weight', 'bold');
    sessionStats.bundlesSolved++;
    if (stockfish) stockfish.postMessage('stop');
    const solvedFen = currentBundleFen;
    let solvedErr = solvedFen ? savedErrors.find(e => e.fen === solvedFen) : null;
    
    if (currentBundleFen) {
        if (solvedErr) {
            if (solvedErr.severity === 'high') sessionStats.bundlesSolvedHigh++;
            else if (solvedErr.severity === 'med') sessionStats.bundlesSolvedMed++;
            else sessionStats.bundlesSolvedLow++;
            // Repetició espaiada: en comptes d'eliminar l'error, el reprogramem.
            // Només es retira definitivament quan s'ha dominat (prou repassos correctes).
            const mastered = scheduleErrorAfterSuccess(solvedErr);
            if (mastered) savedErrors = savedErrors.filter(e => e.fen !== solvedFen);
        }
        // Netejar l'error de les partides guardades (manté coherent "errors de la partida")
        gameHistory.forEach(entry => {
            if (entry.severeErrors && Array.isArray(entry.severeErrors)) {
                entry.severeErrors = entry.severeErrors.filter(err => err.fen !== solvedFen);
            }
        });
        currentBundleFen = null;
    }

    saveStorage(); updateDisplay(); checkMissions();
    board.draggable = false;

    if (isTacticsSession) {
        completeTacticsPuzzle(true);
        updateDisplay();
        showTacticsOverlay();
        return;
    }
    if (isDailyPuzzleSession) {
        completeDailyPuzzle();
        updateDisplay();
        showDailyPuzzleOverlay();
        return;
    }
    if (isSrsReviewSession) {
        markGrowthTaskCompleted(currentGrowthTask && currentGrowthTask.type === 'srs_review' ? currentGrowthTask : { type: 'srs_review', theme: getTaskTheme(solvedFen || currentBundleFen, solvedErr?.bestMove || '', 'general'), source: 'srs' }, 'success');
        showSrsSuccessOverlay();
        return;
    }

    if (currentBundleSource === 'opening_drill' || currentBundleSource === 'mate_drill') {
        const isMate = currentBundleSource === 'mate_drill';
        if (!growthStats || typeof growthStats !== 'object') loadGrowthStats();
        if (isMate) growthStats.mateDrillsCompleted = (growthStats.mateDrillsCompleted || 0) + 1;
        else growthStats.openingDrillsCompleted = (growthStats.openingDrillsCompleted || 0) + 1;
        saveGrowthStats();
        updateThemeMastery(isMate ? 'endgame' : 'opening', 'weakness_solved', { source: currentBundleSource });
        renderWeeklyPlan();
        showDrillSuccessOverlay(
            isMate ? 'Escac i mat! 🏁' : 'Obertura rectificada ✅',
            () => { if (isMate) startMateDrill(); else startOpeningErrorDrill(); }
        );
        return;
    }

    if (currentGrowthTask && currentGrowthTask.type === 'weakness_training' && isRandomBundleSession) {
        markGrowthTaskCompleted(currentGrowthTask, 'success');
    }

    if (isMatchErrorReviewSession) {
        promptMatchErrorNext();
    } else if (isRandomBundleSession) {
        showRandomBundleSuccessOverlay();
    } else if (currentBundleSource === 'category') {
        showCategoryBundleSuccessOverlay();
    } else {
        alert("Molt bé! Has trobat la millor opció.");
        returnToMainMenuImmediate();
    }
}

function showRandomBundleSuccessOverlay() {
    const overlay = $('#bundle-success-overlay');
    if (!overlay.length) {
        alert("Molt bé! Has trobat la millor opció.");
        returnToBundleMenu();
        return;
    }

    const remaining = savedErrors.length;
    overlay.find('.bundle-success-title').text('Bundle resolt');
    overlay.find('.bundle-success-remaining').text(
        remaining > 0 ? `${remaining} bundles pendents` : 'No queda cap bundle pendent'
    );
    overlay.find('#btn-bundle-random-again').text('🎲 Un altre').prop('disabled', remaining === 0).toggle(true);
    overlay.css('display', 'flex');

    $('#btn-bundle-random-home').off('click').on('click', () => {
        isRandomBundleSession = false;
        overlay.hide();
        returnToBundleMenu();
    });

    $('#btn-bundle-random-again').off('click').on('click', () => {
        overlay.hide();
        if (!startRandomBundleGame()) {
            isRandomBundleSession = false;
            returnToBundleMenu();
        }
    });
}

function showCategoryBundleSuccessOverlay() {
    const overlay = $('#bundle-category-success-overlay');
    if (!overlay.length) {
        alert("Molt bé! Has trobat la millor opció.");
        returnToBundleMenu();
        return;
    }

    const severity = currentBundleSeverity;
    const labels = { low: 'lleus', med: 'mitjans', high: 'greus' };
    const remaining = severity ? savedErrors.filter(err => err.severity === severity).length : 0;
    const remainingText = severity
        ? `Queden ${remaining} errors ${labels[severity] || ''}.`
        : 'Queden errors pendents.';
    overlay.find('.bundle-success-remaining').text(remainingText);
    const againBtn = overlay.find('#btn-bundle-category-again');
    againBtn.prop('disabled', remaining === 0 || !severity);
    overlay.css('display', 'flex');

    $('#btn-bundle-category-home').off('click').on('click', () => {
        overlay.hide();
        returnToBundleMenu();
    });

     $('#btn-bundle-category-menu').off('click').on('click', () => {
        overlay.hide();
        returnToMainMenuImmediate();
    });

    againBtn.off('click').on('click', () => {
        overlay.hide();
        if (!startCategoryBundleNext(severity)) {
            returnToBundleMenu();
        }
    });
}

function startCategoryBundleNext(severity) {
    if (!severity) return false;
    const pool = savedErrors.filter(err => err.severity === severity);
    if (pool.length === 0) return false;
    const choice = pool[Math.floor(Math.random() * pool.length)];
    startBundleGame(choice.fen, severity);
    return true;
}

function returnToBundleMenu() {
    returnToMainMenuImmediate();
    if (savedErrors.length > 0) {
        showBundleMenu();
    } else {
        alert('No tens errors guardats');
    }
}

function updatePrecisionDisplay() {
    const precisionEl = $('#current-precision'); const barEl = $('#precision-bar');
    if (totalPlayerMoves === 0) { precisionEl.text('—'); barEl.css('width', '0%').removeClass('good warning danger'); return; }
    const precision = Math.round((goodMoves / totalPlayerMoves) * 100);
    precisionEl.text(precision + '%'); barEl.css('width', precision + '%');
    barEl.removeClass('good warning danger');
    if (precision >= 75) barEl.addClass('good'); else if (precision >= 50) barEl.addClass('warning'); else barEl.addClass('danger');
}

function updateAIPrecisionDisplay() {
    const precisionEl = $('#current-ai-precision'); const barEl = $('#ai-precision-bar');
    if (!precisionEl.length || !barEl.length) return;
    if (totalEngineMoves === 0) { precisionEl.text('—'); barEl.css('width', '0%').removeClass('good warning danger'); return; }
    const precision = Math.round((goodEngineMoves / totalEngineMoves) * 100);
    precisionEl.text(precision + '%'); barEl.css('width', precision + '%');
    barEl.removeClass('good warning danger');
    if (precision >= 75) barEl.addClass('good'); else if (precision >= 50) barEl.addClass('warning'); else barEl.addClass('danger');
}

function updateAIPrecisionTarget() {
    const targetEl = $('#ai-precision-target');
    if (!targetEl.length) return;
    // La força de l'enginy es controla amb UCI_Elo (no amb una precisió objectiu),
    // tant en calibratge com en joc lliure, així que no mostrem cap objectiu fix.
    targetEl.text('—');
}

function registerEngineMovePrecision(moveStr, candidates) {
    if (!moveStr) return;
    totalEngineMoves++;
    let isGood = true;
    if (candidates && candidates.length) {
        const bestScore = Math.max(...candidates.map(c => c.score));
        const chosen = candidates.find(c => c.move === moveStr);
        if (chosen) {
            const delta = bestScore - chosen.score;
            isGood = delta <= 80;
        }
    }
    if (isGood) goodEngineMoves++;
    updateAIPrecisionDisplay();
}

function saveBlunderToBundle(fen, severity, bestMove, playerMove, bestMovePv = []) {
     if (!blunderMode) {
        const alreadyTracked = currentGameErrors.some(e => e.fen === fen);
        if (!alreadyTracked) {
            currentGameErrors.push({
                fen,
                severity,
                bestMove: bestMove || null,
                playerMove: playerMove || lastHumanMoveUci || null,
                bestMovePv: bestMovePv || []
            });
        }
    }
    if (!savedErrors.some(e => e.fen === fen)) {
        // Bloc eliminat - ja no hi ha límit per categoria
        
        savedErrors.push({
            fen: fen,
            date: new Date().toLocaleDateString(),
            severity: severity,
            elo: userELO,
            bestMove: bestMove || null,
            playerMove: playerMove || lastHumanMoveUci || null,
            bestMovePv: bestMovePv || [],
            srsReps: 0,
            srsInterval: 0,
            srsDue: Date.now()
        });
        saveStorage(); 
        updateDisplay(); 
    }
}

function handleGameOver(manualResign = false, timeoutColor = null) {
    pendingMoveEvaluation = false;
    stopGameClock();
    let msg = ""; let change = 0; let playerWon = false; let resultScore = 0.5;
    const wasLeagueMatch = (currentGameMode === 'league') && !!leagueActiveMatch;
    let leagueOutcome = 'draw';
    const finalPrecision = totalPlayerMoves > 0 ? Math.round((goodMoves / totalPlayerMoves) * 100) : 0;
    const durationSeconds = currentGameStartTs ? Math.round((Date.now() - currentGameStartTs) / 1000) : 0;
    const avgCpLoss = calculateAverageCpLoss(currentReview);
    const blundersOver200 = countBlunders(currentReview, 200);
    const tacticalPatterns = identifyTacticalPatterns(currentReview, avgCpLoss, blundersOver200);
    const calibrationGameWasActive = isCalibrationGame;
    let calibrationJustCompleted = false;
    const isFreeMode = currentGameMode === 'free' || currentGameMode === 'assisted';
    const isLeagueMode = currentGameMode === 'league';
    const shouldContinuousAdjust = isFreeMode && calibratgeComplet && !calibrationGameWasActive && !blunderMode;
    const adaptationPlayerEloBefore = userELO;
    const adaptationCurrentEloBefore = currentElo;
    const adaptationAdjustmentLogStart = adjustmentLog.length;
    const adaptationTimestamp = new Date().toISOString();
    const adaptationCalibrationGameNumber = calibrationGameWasActive ? calibrationGames.length + 1 : null;
    const adaptationActiveStrengthElo = currentGameActiveStrengthElo || getActiveStrengthElo();
    const adaptationEngineDepth = currentGameEngineDepth || eloToSearchDepth(adaptationActiveStrengthElo);
    
    if (timeoutColor) {
        if (timeoutColor === playerColor) {
            msg = "Has perdut per temps."; resultScore = 0; leagueOutcome = 'loss';
        } else {
            msg = "Victòria per temps!"; resultScore = 1; playerWon = true; leagueOutcome = 'win';
            sessionStats.gamesWon++; totalWins++;
            if (playerColor === 'b') sessionStats.blackWins++;
        }
    }
    else if (manualResign) {
        msg = "T'has rendit."; resultScore = 0; leagueOutcome = 'loss';
    }
    else if (game.in_checkmate()) {
        if (game.turn() !== playerColor) { 
            msg = "Victòria!"; resultScore = 1; playerWon = true; leagueOutcome = 'win'; 
            sessionStats.gamesWon++; totalWins++;
            if (playerColor === 'b') sessionStats.blackWins++;
        } else { msg = "Derrota."; resultScore = 0; leagueOutcome = 'loss'; }
    } else { msg = "Taules."; resultScore = 0.5; leagueOutcome = 'draw'; }
        
    sessionStats.gamesPlayed++; totalGamesPlayed++;
    
    if (currentGameMode === 'league') sessionStats.leagueGamesPlayed++;
    else if (currentGameMode === 'free' || currentGameMode === 'assisted') sessionStats.freeGamesPlayed++;

    if (finalPrecision >= 70) sessionStats.highPrecisionGames++;
    if (finalPrecision >= 85) sessionStats.perfectGames++;
    
    if (!calibrationGameWasActive && !isLeagueMode && !shouldContinuousAdjust) {
        change = calculateEloDelta(resultScore);
        msg += ` (${formatEloChange(change)})`;
    }
    
    if (blunderMode && playerWon && currentBundleFen) { handleBundleSuccess(); return; }
    
    if (!calibrationGameWasActive && !isLeagueMode && !shouldContinuousAdjust) {
        userELO = Math.max(50, userELO + change);
        updateEloHistory(userELO);
        syncEngineEloFromUser();
    }
    
    if (calibrationGameWasActive) {
        isCalibrationGame = false;
        calibrationJustCompleted = recordCalibrationGame(resultScore, finalPrecision, {
            durationSeconds: durationSeconds,
            avgCpLoss: avgCpLoss,
            blunders: blundersOver200,
            tacticalPatterns: tacticalPatterns
        });
    }

    if (!blunderMode && !calibrationGameWasActive) {
        if (shouldContinuousAdjust) {
            const adjustResult = registerFreeGameAdjustment(resultScore, finalPrecision, {
                avgCpLoss: avgCpLoss,
                blunders: blundersOver200,
                durationSeconds: durationSeconds,
                tacticalPatterns: tacticalPatterns
            });
            if (adjustResult && adjustResult.feedback) {
                msg += ` · ${adjustResult.feedback}`;
            }
        } else if (!isLeagueMode) {
            adjustAIDifficulty(playerWon, finalPrecision, resultScore);
        }
    }

    if (wasLeagueMatch && !blunderMode) {
        applyLeagueAfterGame(leagueOutcome);
    }
    const reviewCounts = summarizeReview(currentReview);
    if (!blunderMode) {
        const adjustmentSummary = getLastAdjustmentSummary(adaptationAdjustmentLogStart);
        let appliedDelta = adjustmentSummary.appliedDelta;
        if (!appliedDelta) {
            const playerDelta = userELO - adaptationPlayerEloBefore;
            const currentDelta = currentElo - adaptationCurrentEloBefore;
            appliedDelta = playerDelta || currentDelta || 0;
        }
        let adjustmentReason = adjustmentSummary.reason;
        if (adjustmentReason === 'Sense ajust adaptatiu') {
            if (calibrationGameWasActive) adjustmentReason = 'Partida de calibratge';
            else if (isLeagueMode) adjustmentReason = 'Mode lliga: sense ajust adaptatiu';
            else if (!shouldContinuousAdjust) adjustmentReason = 'Ajust adaptatiu inicial per resultat';
        }
        recordAdaptationGame(buildAdaptationGameRecord({
            timestamp: adaptationTimestamp,
            mode: calibrationGameWasActive ? 'calibration' : currentGameMode,
            color: playerColor,
            resultLabel: leagueOutcome,
            resultScore: resultScore,
            playerEloBefore: adaptationPlayerEloBefore,
            playerEloAfter: userELO,
            currentEloBefore: adaptationCurrentEloBefore,
            currentEloAfter: currentElo,
            engineRocOrElo: adaptationActiveStrengthElo,
            appliedDelta: appliedDelta,
            adjustmentReason: adjustmentReason,
            precision: finalPrecision,
            avgCpLoss: avgCpLoss,
            counts: reviewCounts,
            moveCount: game.history().length,
            durationSeconds: durationSeconds,
            freeLossStreakValue: freeLossStreak,
            calibrationGameNumber: adaptationCalibrationGameNumber,
            engineDepth: adaptationEngineDepth,
            activeStrengthElo: adaptationActiveStrengthElo,
            adjustments: adjustmentSummary.adjustments
        }));
    }
    const severeErrors = currentGameErrors.slice(); // ← Usar currentGameErrors
    recordGameHistory(msg, finalPrecision, reviewCounts, { severeErrors });
    severeErrors.forEach(err => {
        const theme = getTaskTheme(err.fen, err.bestMove || '', err.theme || 'general');
        updateThemeMastery(theme, 'real_game_error', { severity: err.severity || err.quality, source: 'last_game' });
    });
    // La persistència pesada (saveStorage, gràfics, missions) es difereix més
    // avall, després de mostrar el modal. getNextBestTrainingTask es demana amb
    // skipSave per no desar de forma síncrona ara mateix (ho farà el bloc diferit).
    const growthTask = calibrationGameWasActive ? null : getNextBestTrainingTask({ source: 'postgame', skipSave: true });
    $('#status').text(msg);
    // Gestió de l'indicador de resultat
    if (leagueOutcome === 'win') setResultIndicator('win');
    else if (leagueOutcome === 'loss') setResultIndicator('loss');
    else setResultIndicator('draw');
    
    // Mostrar imatge de checkmate si és escac mat i victòria
    const showCheckmate = game.in_checkmate() && playerWon;
    if (showCheckmate) {
        const checkmateImage = $('#checkmate-image');
        if (checkmateImage.length) checkmateImage.show();
    }
    
    let reviewHeader = msg;
    if (currentStreak > 0) reviewHeader += ` · Ratxa ${currentStreak} dies`;
    
    // Guardar snapshot per poder reobrir la revisió
    lastReviewSnapshot = {
        msg: reviewHeader,
        finalPrecision: finalPrecision,
        counts: reviewCounts,
        showCheckmate: showCheckmate
    };
    
    let onClose = () => {
        if (wasLeagueMatch) { currentGameMode = 'free'; currentOpponent = null; $('#game-screen').removeClass('active').hide(); $('#league-screen').show(); renderLeague(); }
    };
    if (calibrationJustCompleted) {
        const baseClose = onClose;
        onClose = () => {
            if (typeof baseClose === 'function') baseClose();
            showCalibrationResultsScreen();
        };
    }
    $('#btn-resign').prop('disabled', true);
    
    showPostGameReview(reviewHeader, finalPrecision, reviewCounts, onClose, { showCheckmate: showCheckmate, growthTask: growthTask, disableGrowth: calibrationGameWasActive });
    if (calibrationJustCompleted) {
        showCalibrationReveal(userELO);
    }
    if (!blunderMode && !calibrationGameWasActive) {
        const latestEntry = gameHistory[gameHistory.length - 1];
        void requestOpenAIReview(latestEntry, severeErrors);
        void requestErrorNotes(latestEntry, severeErrors);
    }

    // Persistència i actualitzacions pesades: serialització de tot l'historial
    // (saveStorage), sincronització al núvol, redibuix de Chart.js, missions i
    // estadístiques. Es difereix fins després que el navegador hagi pintat el
    // modal de revisió perquè el final de partida es vegi a l'instant i la
    // generació de l'informe no interfereixi amb el repintat.
    runAfterPaint(() => {
        persistReviewSummary(finalPrecision, msg);
        recordActivity();
        saveStorage();
        checkMissions();
        updateDisplay();
        updateReviewChart();
    });
}

function setResultIndicator(outcome) {
    const indicator = $('#result-indicator');
    const icon = $('#result-indicator-icon');
    
    if (!outcome) {
        indicator.hide();
        return;
    }
    
    indicator.removeClass('win loss draw').show();
    
    if (outcome === 'win') {
        indicator.addClass('win');
        icon.text('🏆');
    } else if (outcome === 'loss') {
        indicator.addClass('loss');
        icon.text('💔');
    } else {
        indicator.addClass('draw');
        icon.text('🤝');
    }
}

function updateStatus() {
    if (!isEngineThinking) {
        var s = (game.turn() === 'b' ? 'Negres' : 'Blanques');
        if (game.in_check()) s += ' — Escac!';
        $('#status').text(s).css('color', 'var(--accent-cream)');
    }
}

/* ===================== L'ENTRENADOR QUE PARLA (DEBRIEF + PLA DIARI) =====================
   Arquitectura en dues capes: els FETS es calculen sempre en local a partir de les dades
   que ja recull l'app (gameHistory, savedErrors, themeMastery). La redacció per defecte
   surt d'un banc de plantilles en català; si hi ha clau OpenAI, només poleix el text
   a partir dels mateixos fets (mai analitza la partida ell sol). */

const WEEKLY_PLAN_KEY = 'chess_weeklyPlan';
const WEEKLY_PLAN_VERSION = 3;
// Quan puja, el resum desat del pla d'avui es descarta i es regenera (text local
// i, si hi ha clau OpenAI, nova polida), sense reconstruir les tasques ni perdre'n el progrés.
const PLAN_SUMMARY_REFRESH_VERSION = 1;
let weeklyPlan = null;
let coachCatalanVoice = null;
let coachDebriefPending = false;
let coachPlanOpenAIPending = false;

const COACH_PHASE_LABELS = { opening: "l'obertura", middlegame: 'el mig joc', endgame: 'el final' };

function debriefResultKind(label) {
    const s = String(label || '').toLowerCase();
    if (/vict/.test(s)) return 'win';
    if (/taules|empat/.test(s)) return 'draw';
    return 'loss';
}

// Capa 1: motor de diagnòstic. Només fets, cap text.
function buildDebriefFacts(entry) {
    if (!entry) return null;
    const counts = entry.counts || {};
    const totalMoves = ['excel', 'good', 'inaccuracy', 'mistake', 'blunder'].reduce((s, k) => s + (counts[k] || 0), 0);
    const prev = gameHistory.filter(g => g.id !== entry.id && typeof g.precision === 'number');
    const avgPrecision = prev.length ? Math.round(prev.reduce((s, g) => s + g.precision, 0) / prev.length) : null;

    // Tema més repetit entre les errades greus de la partida
    const themeCounts = {};
    (entry.errors || []).forEach(err => {
        const t = normalizeGrowthTheme(classifyPositionTheme(err.fen || '', err.playerMove || ''));
        themeCounts[t] = (themeCounts[t] || 0) + 1;
    });
    let topErrorTheme = null, topErrorCount = 0;
    Object.keys(themeCounts).forEach(t => {
        if (themeCounts[t] > topErrorCount) { topErrorTheme = t; topErrorCount = themeCounts[t]; }
    });

    // Fase de la partida on es concentren les errades
    const phaseCounts = { opening: 0, middlegame: 0, endgame: 0 };
    (entry.moveReviews || []).forEach(r => {
        if (r.quality !== 'mistake' && r.quality !== 'blunder') return;
        const n = r.moveNumber || 0;
        if (n <= 10) phaseCounts.opening++; else if (n <= 28) phaseCounts.middlegame++; else phaseCounts.endgame++;
    });
    let worstPhase = null, worstPhaseCount = 0;
    Object.keys(phaseCounts).forEach(p => {
        if (phaseCounts[p] > worstPhaseCount) { worstPhase = p; worstPhaseCount = phaseCounts[p]; }
    });

    loadThemeMastery();
    let weakestTheme = 'general', weakestVal = Infinity;
    Object.keys(themeMastery).forEach(t => {
        if (t !== 'general' && themeMastery[t] < weakestVal) { weakestVal = themeMastery[t]; weakestTheme = t; }
    });

    const mistakes = (counts.mistake || 0) + (counts.blunder || 0);
    return {
        result: debriefResultKind(entry.result),
        precision: typeof entry.precision === 'number' ? entry.precision : null,
        avgPrecision,
        totalMoves,
        mistakes,
        blunders: counts.blunder || 0,
        topErrorTheme, topErrorCount,
        worstPhase, worstPhaseCount,
        weakestTheme,
        weakestMastery: isFinite(weakestVal) ? Math.round(weakestVal * 100) : 0,
        srsDue: getDueErrors().length,
        cleanGame: mistakes === 0 && totalMoves >= 10
    };
}

function fillCoachTemplate(tpl, data) {
    return tpl.replace(/\{(\w+)\}/g, (m, k) => (data[k] !== undefined && data[k] !== null) ? data[k] : m);
}

const COACH_DEBRIEF_TEMPLATES = {
    win_high: [
        "Victòria amb un {prec}% de precisió: avui has jugat com volies jugar.",
        "Bona feina: has guanyat i, a més, ho has fet amb criteri ({prec}% de precisió).",
        "Has guanyat sense regalar res: {prec}% de precisió. Així es construeix nivell."
    ],
    win_low: [
        "Has guanyat, però la precisió ({prec}%) diu que el rival t'ha perdonat alguna cosa.",
        "Victòria treballada: el resultat és bo, però hi ha hagut moments delicats ({prec}%).",
        "Punt a la butxaca, tot i que la partida ha estat més bruta del que voldríem ({prec}%)."
    ],
    draw: [
        "Taules. No és el resultat que volíem, però hi ha coses aprofitables en aquesta partida.",
        "Empat: partida igualada i ben disputada. Mirem què en podem treure.",
        "Taules. De vegades el rival també juga; quedem-nos amb el que has fet bé."
    ],
    loss_high: [
        "Has perdut, però amb un {prec}% de precisió: la derrota parla més del mèrit del rival que de demèrit teu.",
        "Derrota dura d'encaixar perquè has jugat bé ({prec}%). Així és aquest joc.",
        "Has caigut jugant a bon nivell ({prec}%). Aquestes derrotes ensenyen més que moltes victòries."
    ],
    loss_low: [
        "Derrota, i avui la precisió ({prec}%) explica per què. Toca revisar amb calma.",
        "Has perdut i hi ha hagut massa errades ({prec}% de precisió). Cap drama: ho treballem.",
        "Partida per oblidar-ne el resultat ({prec}%), però no pas les lliçons."
    ],
    highlight_clean: [
        "El més destacable: cap errada greu en tota la partida. Això és or.",
        "Zero errades greus avui. La teva solidesa comença a notar-se.",
        "Has jugat tota la partida sense cap error seriós: senyal de maduresa al tauler."
    ],
    highlight_above_avg: [
        "Has jugat {diff} punts per sobre de la teva mitjana de precisió ({avg}%). Vas en bona direcció.",
        "La teva mitjana és del {avg}% i avui has fet {prec}%: progrés clar.",
        "Avui has superat la teva mitjana ({avg}%): el treball es comença a veure."
    ],
    highlight_no_blunders: [
        "Cap errada greu avui: les errades han estat menors, i això ja és un pas.",
        "Has evitat les errades greus; les imprecisions es poleixen amb més facilitat."
    ],
    weak_theme: [
        "El punt feble d'avui: {cops} amb {tema}.",
        "La partida t'ha fet mal sobretot en {tema} ({moments}).",
        "Si mirem les errades, el patró que es repeteix és {tema}."
    ],
    weak_phase: [
        "Les errades s'han concentrat en {fase}: és on perds més punts.",
        "T'has mantingut bé fins que ha arribat {fase}; en aquell tram s'ha torçat la partida.",
        "El tram fluix d'avui ha estat {fase}."
    ],
    weak_mastery: [
        "No hi ha hagut errades greus, però recorda que {tema} segueix sent el teu punt més fluix.",
        "Per seguir creixent, el tema que demana més feina és {tema}."
    ],
    advice_srs: [
        "Tens {due} repassos pendents: deu minuts buidant-los valen més que una partida ràpida.",
        "Abans de la pròxima partida, passa pels {due} repassos pendents; és memòria que no vols perdre.",
        "Consell: tens {due} errades esperant repàs. Tanca'ls i notaràs la diferència."
    ],
    advice_theme: [
        "Aquesta setmana toca {tema}: entrena'l i aquest tipus de partida canviarà de color.",
        "El meu consell: una sessió curta de {tema} abans de tornar a jugar.",
        "Si dediques deu minuts a {tema}, la pròxima vegada aquest moment caurà del teu costat."
    ],
    advice_keep: [
        "Continua així: ara mateix el millor entrenament és seguir jugant amb aquesta concentració.",
        "Poc a corregir avui. Mantén el ritme i puja una mica el nivell del rival si et veus còmode.",
        "Quan es juga així, el pla és simple: més partides com aquesta."
    ]
};

// Amplia els pools del debrief (a banda per no tocar el literal) i hi afegeix
// una categoria per a partides amb errades greus.
COACH_DEBRIEF_TEMPLATES.win_high.push(
    "Quina partida: {prec}% de precisió i victòria. Així dona gust.",
    "Has dominat de principi a fi ({prec}%). Continua per aquest camí.",
    "Victòria sòlida i neta ({prec}%): el cap ha manat per damunt de l’impuls."
);
COACH_DEBRIEF_TEMPLATES.win_low.push(
    "Tres punts són tres punts, però amb {prec}% hi ha marge per jugar més fi.",
    "Has guanyat la batalla; ara guanya també la precisió ({prec}%).",
    "Victòria amb ensurts ({prec}%): repassa els moments en què t’has complicat."
);
COACH_DEBRIEF_TEMPLATES.draw.push(
    "Repartiment de punts. Mirem on podies haver inclinat la balança.",
    "Taules honestes. Hi ha detalls per polir que la pròxima vegada donaran mig punt més.",
    "Empat: ni drama ni festa, però sí material per aprendre."
);
COACH_DEBRIEF_TEMPLATES.loss_high.push(
    "Derrota amb el cap ben alt ({prec}%): has competit de tu a tu.",
    "Has perdut, però la precisió ({prec}%) diu que vas pel bon camí.",
    "Avui no ha entrat, però amb {prec}% de precisió els resultats arribaran."
);
COACH_DEBRIEF_TEMPLATES.loss_low.push(
    "Derrota amb avisos ({prec}%): la bona notícia és que són errades molt corregibles.",
    "No ha sortit bé ({prec}%), però cada errada d’avui és una lliçó per demà.",
    "Dia complicat al tauler ({prec}%). Respira, revisa i torna-hi."
);
COACH_DEBRIEF_TEMPLATES.highlight_clean.push(
    "Cap relliscada en tota la partida: aquesta és la base del progrés de debò.",
    "Solidesa total avui, sense errades greus. Quan jugues així, guanyar és qüestió de temps."
);
COACH_DEBRIEF_TEMPLATES.highlight_above_avg.push(
    "Has rendit per sobre del teu nivell habitual ({avg}%): pren-ne nota.",
    "Avui ({prec}%) has deixat enrere la teva mitjana ({avg}%). Senyal de creixement."
);
COACH_DEBRIEF_TEMPLATES.highlight_no_blunders.push(
    "Sense errades greus: el teu pitjor enemic avui han estat els detalls, no els ensurts.",
    "Cap errada greu, només matisos a polir. Vas afinant."
);
COACH_DEBRIEF_TEMPLATES.weak_theme.push(
    "El fil de les errades d’avui passa per {tema}: hi ha feina concreta a fer.",
    "Si busques un patró, el trobaràs a {tema} ({moments}).",
    "On has perdut més terreny ha estat en {tema}."
);
COACH_DEBRIEF_TEMPLATES.weak_phase.push(
    "El tram fluix ha arribat en {fase}: aquí és on toca posar atenció.",
    "Fins a {fase} tot anava bé; aquell tram t’ha costat car."
);
COACH_DEBRIEF_TEMPLATES.weak_mastery.push(
    "Partida neta, però {tema} continua sent l’assignatura pendent.",
    "Res a retreure avui; tot i així, {tema} és el que més et farà pujar."
);
COACH_DEBRIEF_TEMPLATES.advice_srs.push(
    "Tens {due} repassos a punt: són la teva memòria d’escacs, no la deixis enrere.",
    "Deu minuts amb els {due} repassos pendents valen més que jugar de seguida."
);
COACH_DEBRIEF_TEMPLATES.advice_theme.push(
    "Una dosi curta de {tema} aquesta setmana i notaràs el canvi.",
    "Posa el focus en {tema}: és la palanca que et farà guanyar més partides."
);
COACH_DEBRIEF_TEMPLATES.advice_keep.push(
    "Poc a tocar: segueix amb aquesta concentració i puja el repte quan et vegis.",
    "Així es juga. Mantén el rumb i busca rivals una mica més forts."
);
COACH_DEBRIEF_TEMPLATES.advice_blunder = [
    "Avui el que pesa són les errades greus: revisa-les una per una, és la via més ràpida de millorar.",
    "Quan apareixen errades decisives, entén-ne la causa abans de tornar a jugar; els plans d’aquesta partida t'ajudaran a fer-ho.",
    "Centra’t a eliminar les errades greus i les imprecisions cauran soles.",
    "Cada errada important d’avui és una lliçó cara: aprofita-la repassant els moments crítics."
];

// Veus de l'entrenador (registre de coach, diferents de les veus literàries dels
// jeroglífics): donen to a l'obertura i el tancament del debrief i etiqueten els plans.
const COACH_VOICES = [
    { id: 'sere', name: 'Mestre serè', tagline: 'calma i claredat',
      openers: ['Respira i mirem-ho amb calma.', 'Sense pressa, anem al fons de la qüestió.', 'Amb tranquil·litat, repassem el que ha passat.', 'La calma també s’entrena: comencem.'],
      signoffs: ['Pas a pas, el nivell puja sol.', 'La constància tranquil·la guanya partides.', 'Demà, una mica millor que avui.'] },
    { id: 'directe', name: 'Entrenador directe', tagline: 'clar i sense embuts',
      openers: ['Anem al gra.', 'Sense embuts: això és el que compta.', 'Et dic les coses clares.', 'Resumeixo el que importa.'],
      signoffs: ['Corregeix això i puges de nivell.', 'Menys excuses, més repàs.', 'Ja saps què toca: a la feina.'] },
    { id: 'calid', name: 'Entrenador càlid', tagline: 'proper i motivador',
      openers: ['Bona feina per seure i revisar; ja és mèrit.', 'M’agrada que vulguis millorar: anem-hi.', 'M’agrada com t’hi poses.', 'Un pas més en el teu camí, ben fet.'],
      signoffs: ['Confio plenament en el teu progrés.', 'Vas pel bon camí, de debò.', 'Orgullós del teu esforç; continua.'] },
    { id: 'analitic', name: 'Analista', tagline: 'precís i objectiu',
      openers: ['Anem als fets.', 'Mirem-ho amb dades, sense emocions.', 'Objectivament, això és el que diu la partida.', 'Repassem-ho amb precisió.'],
      signoffs: ['Les xifres milloren amb el repàs correcte.', 'Mesura, corregeix, repeteix.', 'El patró és clar; ataquem-lo amb mètode.'] },
    { id: 'veteran', name: 'Veterà competitiu', tagline: 'ofici de torneig',
      openers: ['N’he vistes moltes, de partides com aquesta.', 'Com a la sala de torneig: cap drama.', 'Parlem com dos jugadors de club.', 'Això es guanya amb ofici; t’ho explico.'],
      signoffs: ['Aquestes lliçons et faran més fort amb el rellotge en marxa.', 'Els punts arriben quan l’ofici creix.', 'A la pròxima: mateixa sang freda, millor decisió.'] },
    { id: 'socratic', name: 'Mestre socràtic', tagline: 'aprendre preguntant',
      openers: ['Abans de res, fes-te una pregunta.', 'Pensem junts; no t’ho donaré tot mastegat.', 'La resposta surt millor si la busques tu.', 'Comencem amb un bon dubte.'],
      signoffs: ['La bona pregunta val més que la resposta ràpida.', 'Segueix qüestionant cada jugada.', 'Qui es pregunta, millora.'] }
];
let _coachVoiceByKey = {};
function pickCoachVoiceForKey(key) {
    const k = String(key || 'default');
    if (_coachVoiceByKey[k]) return _coachVoiceByKey[k];
    const id = pickFreshPlanLine(COACH_VOICES.map(v => v.id), 'coachvoice');
    const voice = COACH_VOICES.find(v => v.id === id) || COACH_VOICES[0];
    _coachVoiceByKey[k] = voice;
    return voice;
}

// TIER 3 — personalització amb l'historial local (sense LLM).
function playerLevelBand() {
    const elo = (typeof currentElo === 'number' && currentElo > 0) ? currentElo : null;
    if (elo === null) return 'mig';
    return elo < 1200 ? 'principiant' : (elo < 1800 ? 'mig' : 'avancat');
}
const COACH_LEVEL_TIPS = {
    principiant: [
        'Recorda el bàsic: desenvolupa, enroca i no deixis peces penjades.',
        'A cada jugada, mira primer si el rival t’amenaça alguna cosa.',
        'Compta sempre què pot capturar el rival abans de moure.'
    ],
    mig: [
        'Treballa els plans: una jugada sense idea sol portar a una imprecisió.',
        'Abans de complicar, millora la peça pitjor situada.',
        'Ataca les teves errades recurrents: és on hi ha més punts a guanyar.'
    ],
    avancat: [
        'Afina les decisions en posicions igualades: hi ets a prop.',
        'Profilaxi i conversió neta: a aquest nivell decideixen els marges petits.',
        'Compara jugades candidates concretes; el detall et separa del següent esglaó.'
    ]
};
function planThemeToGrowth(themeKey) {
    if (HIERO_TO_GROWTH_THEME[themeKey]) return HIERO_TO_GROWTH_THEME[themeKey];
    return normalizeGrowthTheme(themeKey);
}
// Analitza les últimes partides: tema d'error recurrent, tendència de precisió i nivell.
function buildPlayerInsights(excludeId) {
    try {
        const games = (Array.isArray(gameHistory) ? gameHistory : [])
            .filter(g => g && g.id !== excludeId).slice(-10);
        const themeCounts = {}, gamesWithTheme = {};
        games.forEach(g => {
            const errs = Array.isArray(g.errors) ? g.errors : [];
            const seen = new Set();
            errs.forEach(e => {
                const t = normalizeGrowthTheme(classifyPositionTheme(e.fen || '', e.playerMove || ''));
                if (!t || t === 'general') return;
                themeCounts[t] = (themeCounts[t] || 0) + 1;
                seen.add(t);
            });
            seen.forEach(t => { gamesWithTheme[t] = (gamesWithTheme[t] || 0) + 1; });
        });
        let recurringTheme = null, recurringCount = 0;
        Object.keys(themeCounts).forEach(t => { if (themeCounts[t] > recurringCount) { recurringCount = themeCounts[t]; recurringTheme = t; } });
        const precs = games.filter(g => typeof g.precision === 'number').map(g => g.precision);
        let trend = 'stable';
        if (precs.length >= 4) {
            const half = Math.floor(precs.length / 2);
            const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
            const diff = avg(precs.slice(half)) - avg(precs.slice(0, half));
            trend = diff >= 4 ? 'up' : (diff <= -4 ? 'down' : 'stable');
        }
        return {
            games: games.length,
            recurringTheme, recurringCount,
            gamesWithTheme: recurringTheme ? (gamesWithTheme[recurringTheme] || 0) : 0,
            trend, level: playerLevelBand()
        };
    } catch (e) { return { games: 0, recurringTheme: null, recurringCount: 0, gamesWithTheme: 0, trend: 'stable', level: playerLevelBand() }; }
}
function buildInsightsNote(insights) {
    try {
        if (!insights || insights.games < 3) return null;
        const parts = [];
        if (insights.recurringTheme && insights.recurringCount >= 3 && insights.gamesWithTheme >= 2) {
            parts.push(`patró recent de ${getThemeLabel(insights.recurringTheme)} (${insights.recurringCount} errades en ${insights.gamesWithTheme} partides), val la pena entrenar-lo`);
        }
        if (insights.trend === 'up') parts.push('la teva precisió mitjana puja respecte a les partides anteriors');
        else if (insights.trend === 'down') parts.push('la precisió ha baixat una mica últimament: juga amb una mica més de calma');
        if (!parts.length) return null;
        const s = parts.join('; ');
        return '📈 ' + s.charAt(0).toUpperCase() + s.slice(1) + '.';
    } catch (e) { return null; }
}

// TIER 4 — linter de bancs (xarxa de seguretat en dev): duplicats, marcadors
// desconeguts i pools massa petits. Activa'l amb localStorage 'eltauler_lint'='1'.
function lintLocalBanks() {
    const issues = [];
    const ALLOWED_HUMAN = new Set(['n', 'played', 'best', 'swing']);
    const ALLOWED_DEBRIEF = new Set(['prec', 'avg', 'diff', 'cops', 'moments', 'tema', 'fase', 'due']);
    const checkPool = (arr, label, allowed) => {
        if (!Array.isArray(arr)) { issues.push(`${label}: no és cap vector`); return; }
        if (arr.length < 2) issues.push(`${label}: només ${arr.length} variant(s)`);
        const seen = new Set();
        arr.forEach((s, i) => {
            if (typeof s !== 'string' || !s.trim()) { issues.push(`${label}[${i}]: buit`); return; }
            if (seen.has(s)) issues.push(`${label}[${i}]: duplicat`);
            seen.add(s);
            if (allowed) (s.match(/\{([a-zA-Z]+)\}/g) || []).forEach(p => {
                if (!allowed.has(p.slice(1, -1))) issues.push(`${label}[${i}]: marcador desconegut ${p}`);
            });
        });
    };
    try {
        Object.keys(HUMAN_PLAN_BANK).forEach(t => ['diagnosis', 'plan', 'question', 'objective']
            .forEach(f => checkPool(HUMAN_PLAN_BANK[t][f], `HUMAN_PLAN_BANK.${t}.${f}`, ALLOWED_HUMAN)));
        Object.keys(COACH_DEBRIEF_TEMPLATES).forEach(c => checkPool(COACH_DEBRIEF_TEMPLATES[c], `COACH_DEBRIEF_TEMPLATES.${c}`, ALLOWED_DEBRIEF));
        Object.keys(OFFLINE_MAXIMS).forEach(k => checkPool(OFFLINE_MAXIMS[k], `OFFLINE_MAXIMS.${k}`, null));
        Object.keys(COACH_LEVEL_TIPS).forEach(k => checkPool(COACH_LEVEL_TIPS[k], `COACH_LEVEL_TIPS.${k}`, null));
        COACH_VOICES.forEach(v => { checkPool(v.openers, `voice.${v.id}.openers`, null); checkPool(v.signoffs, `voice.${v.id}.signoffs`, null); });
    } catch (e) { issues.push('error linter: ' + e.message); }
    if (issues.length) console.warn(`[BankLint] ${issues.length} problema(es):\n` + issues.join('\n'));
    else console.log('[BankLint] Tots els bancs locals OK');
    return issues;
}
try { if (typeof localStorage !== 'undefined' && localStorage.getItem('eltauler_lint') === '1') lintLocalBanks(); } catch (e) {}

// Capa 2 (per defecte, sempre disponible): redacció amb plantilles en català.
// Usa l'anti-repetició persistent compartida (pickFreshPlanLine) i memoritza el
// text per partida perquè rerenderitzacions dins la mateixa partida siguin estables.
let _localDebriefCache = {};
function composeDebriefText(facts, seedStr, voice) {
    const cacheKey = String(seedStr || 'debrief');
    if (_localDebriefCache[cacheKey]) return _localDebriefCache[cacheKey];
    const v = voice || pickCoachVoiceForKey(cacheKey);
    const pick = cat => pickFreshPlanLine(COACH_DEBRIEF_TEMPLATES[cat] || [], 'debrief:' + cat);
    const data = {
        prec: facts.precision !== null ? facts.precision : '—',
        avg: facts.avgPrecision,
        diff: (facts.precision !== null && facts.avgPrecision !== null) ? facts.precision - facts.avgPrecision : 0,
        cops: facts.topErrorCount === 1 ? 'una errada relacionada' : `${facts.topErrorCount} errades relacionades`,
        moments: facts.topErrorCount === 1 ? 'un moment delicat' : `${facts.topErrorCount} moments delicats`,
        tema: getThemeLabel(facts.topErrorTheme || facts.weakestTheme),
        fase: COACH_PHASE_LABELS[facts.worstPhase] || 'el mig joc',
        due: facts.srsDue
    };
    const goodPrecision = facts.precision !== null
        && (facts.precision >= 70 || (facts.avgPrecision !== null && facts.precision >= facts.avgPrecision));
    const sentences = [];

    // To de la veu: obertura ocasional que personalitza l'entrenador.
    if (Math.random() <= 0.65) sentences.push(pickFreshPlanLine(v.openers, 'voiceopen:' + v.id));

    if (facts.result === 'win') sentences.push(pick(goodPrecision ? 'win_high' : 'win_low'));
    else if (facts.result === 'draw') sentences.push(pick('draw'));
    else sentences.push(pick(goodPrecision ? 'loss_high' : 'loss_low'));

    if (facts.cleanGame) {
        sentences.push(pick('highlight_clean'));
    } else if (facts.avgPrecision !== null && facts.precision !== null && facts.precision - facts.avgPrecision >= 5) {
        sentences.push(pick('highlight_above_avg'));
    } else if (facts.blunders === 0 && facts.mistakes > 0) {
        sentences.push(pick('highlight_no_blunders'));
    }

    if (facts.topErrorTheme && facts.topErrorCount > 0) {
        sentences.push(pick('weak_theme'));
    } else if (facts.worstPhase && facts.worstPhaseCount >= 2) {
        sentences.push(pick('weak_phase'));
    } else if (facts.cleanGame && facts.weakestMastery < 50) {
        data.tema = getThemeLabel(facts.weakestTheme);
        sentences.push(pick('weak_mastery'));
    }

    if (facts.blunders >= 1 && !facts.cleanGame && facts.srsDue < 3) sentences.push(pick('advice_blunder'));
    else if (facts.cleanGame && facts.srsDue < 3) sentences.push(pick('advice_keep'));
    else if (facts.srsDue >= 3) sentences.push(pick('advice_srs'));
    else sentences.push(pick('advice_theme'));

    // Tancament ocasional amb la signatura de la veu.
    if (Math.random() <= 0.4) sentences.push(pickFreshPlanLine(v.signoffs, 'voicesign:' + v.id));

    // Consell adaptat al nivell (ELO) del jugador.
    const level = playerLevelBand();
    if (COACH_LEVEL_TIPS[level] && Math.random() <= 0.35) sentences.push(pickFreshPlanLine(COACH_LEVEL_TIPS[level], 'leveltip:' + level));

    const text = sentences.map(tpl => fillCoachTemplate(tpl, data)).join(' ');
    _localDebriefCache[cacheKey] = text;
    return text;
}

// Tradueix els fets a claus llegibles perquè OpenAI redacti en català sense inventar res.
function debriefFactsForPrompt(facts) {
    const resultLabels = { win: 'victòria', draw: 'taules', loss: 'derrota' };
    const out = {
        resultat: resultLabels[facts.result] || facts.result,
        precisio_percent: facts.precision,
        precisio_mitjana_anteriors: facts.avgPrecision,
        errors_greus: facts.mistakes,
        blunders: facts.blunders,
        partida_neta_sense_errors: facts.cleanGame,
        repassos_pendents: facts.srsDue
    };
    if (facts.topErrorTheme) {
        out.tema_amb_mes_errors = getThemeLabel(facts.topErrorTheme);
        out.quants_errors_del_tema = facts.topErrorCount;
    }
    if (facts.worstPhase && facts.worstPhaseCount >= 2) out.fase_amb_mes_errades = COACH_PHASE_LABELS[facts.worstPhase];
    out.punt_feble_historic = getThemeLabel(facts.weakestTheme);
    return out;
}

function buildDebriefOpenAIPrompt(facts) {
    return `Ets un entrenador d'escacs proper, honest i motivador que parla en català i tuteja l'alumne.
Redacta un resum post-partida de 60 a 100 paraules NOMÉS a partir d'aquests fets. No inventis jugades, xifres ni dades que no hi siguin:
${JSON.stringify(debriefFactsForPrompt(facts), null, 2)}
Regles:
- Comença pel resultat, destaca un punt fort si n'hi ha, assenyala el punt feble i acaba amb un consell concret.
- Un sol paràgraf, sense llistes, sense markdown, sense emojis.
- Català natural i directe, com un entrenador de club.`;
}

// Capa OpenAI opcional i compartida: si falla o no hi ha clau, el text local ja és vàlid.
async function requestOpenAICoachText(cacheKey, prompt, onText, maxLen = 1800) {
    if (!openaiApiKey) return;
    const cached = getCachedOpenAI(cacheKey);
    if (cached) { onText(cached); return; }
    const result = await callOpenAI(prompt, { generationConfig: { maxOutputTokens: 1024 } });
    if (!result.ok) return;
    const text = (result.text || '').trim();
    if (!text || text.length < 40 || text.length > maxLen) return;
    setCachedOpenAI(cacheKey, text);
    onText(text);
}


// Detecció de subtema real: reaprofita la inferència fina dels jeroglífics
// (inferHieroglyphicThemes via buildHieroglyphicContext) sobre la MILLOR jugada,
// que distingeix peó passat, profilaxi, activitat de peces, desenvolupament, etc.
// Construeix una sola vegada el context ric de la posició (subtema + fets concrets).
function buildPlanContext(review) {
    try {
        if (review && review.fen && review.bestMove) {
            return buildHieroglyphicContext(review.fen, review.bestMove, {
                pv: review.bestMovePv || [],
                playerMove: review.playerMove || null,
                swing: review.swing || 0,
                evalBefore: review.evalBefore,
                evalAfter: review.evalAfter,
                alternatives: review.alternatives || []
            });
        }
    } catch (e) {}
    return null;
}

function detectPlanSubtheme(review, ctx) {
    const c = ctx || buildPlanContext(review);
    if (c && c.theme) return c.theme;
    return normalizeGrowthTheme(classifyPositionTheme(review?.fen || '', review?.playerMove || '')) || 'general';
}

// TIER 1 — fets concrets de la posició a partir del que ja calculem (sense LLM).
function buildPositionalNote(ctx) {
    if (!ctx) return '';
    const bits = [];
    try {
        // El motiu concret detectat (avantpost, última fila, final de reis...) va primer.
        if (Array.isArray(ctx.motifNotes) && ctx.motifNotes.length) bits.push(ctx.motifNotes[0]);
        const me = ctx.sideToMove, opp = me === 'w' ? 'b' : 'w';
        const ks = ctx.kingSafety || {};
        if (bits.length < 2) {
            if (ks[me] && ks[me].exposed) bits.push('el teu rei estava exposat');
            else if (ks[opp] && ks[opp].exposed) bits.push('el rei rival estava exposat');
        }
        if (bits.length < 2 && Array.isArray(ctx.openFiles) && ctx.openFiles.length) bits.push(`la columna ${ctx.openFiles[0]} era oberta`);
        if (bits.length < 2 && typeof ctx.centerTension === 'number' && ctx.centerTension >= 4) bits.push('hi havia tensió al centre');
        if (bits.length < 2 && typeof ctx.materialBalance === 'number' && Math.abs(ctx.materialBalance) >= 2) {
            bits.push(`el material afavoria les ${ctx.materialBalance > 0 ? 'blanques' : 'negres'}`);
        }
        if (!bits.length && ctx.sector && HIEROS.sectors[ctx.sector]) bits.push(`l'acció era a ${HIEROS.sectors[ctx.sector]}`);
    } catch (e) { return ''; }
    if (!bits.length) return '';
    const s = bits.slice(0, 2).join(' i ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

function uciLineToSan(fen, uciList, maxPlies) {
    const out = [];
    try {
        const g = new Chess(fen);
        for (let i = 0; i < Math.min((uciList || []).length, maxPlies); i++) {
            const u = uciList[i];
            if (!u || u.length < 4) break;
            const mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined });
            if (!mv) break;
            out.push(mv.san);
        }
    } catch (e) {}
    return out;
}

// Descriu una seqüència de jugades (UCI) en llenguatge planer, recorrent la línia
// per anomenar cada moviment sense notació algebraica.
function describeLineHuman(fen, uciList, startPly, maxPhrases) {
    try {
        const g = new Chess(fen);
        const phrases = [];
        for (let i = 0; i < (uciList || []).length && phrases.length < maxPhrases; i++) {
            const u = uciList[i];
            if (!u || u.length < 4) break;
            const beforeFen = g.fen();
            const mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined });
            if (!mv) break;
            if (i >= startPly) {
                const d = describeMoveHuman(beforeFen, u);
                phrases.push(d ? d.text : mv.san);
            }
        }
        return phrases.join(', i ');
    } catch (e) { return ''; }
}

// TIER 1 — compara candidates (MultiPV ja guardats) i mostra la continuació de la idea.
function buildCandidatesNote(review) {
    try {
        const fen = review && review.fen;
        if (!fen) return '';
        const bestSan = review.bestMoveSan || (review.bestMove ? uciLineToSan(fen, [review.bestMove], 1)[0] : null);
        const parts = [];
        const alts = Array.isArray(review.alternatives) ? review.alternatives : [];
        if (alts.length >= 2 && bestSan) {
            const a0 = alts[0], a1 = alts[1];
            if (a0 && a1 && a0.evalType === 'cp' && a1.evalType === 'cp' && a1.move) {
                const gap = Math.abs((a0.eval || 0) - (a1.eval || 0));
                if (gap <= 70) {
                    const altSan = uciLineToSan(fen, [a1.move], 1)[0];
                    if (altSan && altSan !== bestSan) parts.push(`També era bona ${moveHumanText(fen, a1.move, altSan)}.`);
                }
            }
        }
        const pv = Array.isArray(review.bestMovePv) ? review.bestMovePv : [];
        if (pv.length >= 3) {
            const cont = describeLineHuman(fen, pv, 1, 2);
            if (cont) parts.push(`La idea seguia amb ${cont}.`);
        }
        return parts.join(' ');
    } catch (e) { return ''; }
}

// TIER 1 — identifica l'obertura jugada reaprofitant el trie d'obertures.js.
function buildOpeningNote(entry) {
    try {
        if (!entry) return null;
        if (!openingTrie) { try { initOpeningSystem(); } catch (e) {} }
        if (!openingTrie) return null;
        let sanMoves = [];
        if (typeof entry.pgn === 'string' && entry.pgn.trim()) {
            const clean = entry.pgn
                .replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ')
                .replace(/\$\d+/g, ' ').replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, ' ');
            sanMoves = parsePgnToMoves(clean);
        }
        if ((!sanMoves || !sanMoves.length) && Array.isArray(entry.moves)) {
            sanMoves = entry.moves.map(m => typeof m === 'string' ? m : (m && m.san)).filter(Boolean);
        }
        if (!sanMoves || sanMoves.length < 2) return null;
        const info = analyzeGameOpening(sanMoves.slice(0, 30));
        if (!info || !info.name) return null;
        let note = `📖 Obertura: ${info.name}${info.eco ? ` (${info.eco})` : ''}.`;
        if (info.deviationMove && info.deviationBy && entry.playerColor && info.deviationBy === entry.playerColor) {
            const moveNum = Math.floor((info.deviationPly || 0) / 2) + 1;
            note += ` Vas sortir de la teoria cap a la jugada ${moveNum} amb ${info.deviationMove}`;
            note += (Array.isArray(info.theoryMoves) && info.theoryMoves.length)
                ? `; la línia principal continuava amb ${info.theoryMoves[0]}.` : '.';
        }
        return note;
    } catch (e) { return null; }
}

function getPlanThemeKeyFromReview(review) {
    return detectPlanSubtheme(review);
}

function getPlanThemeLabelFromReview(review) {
    return planThemeDisplayLabel(getPlanThemeKeyFromReview(review));
}

function getHumanPlanPhase(moveNumber) {
    const n = moveNumber || 0;
    if (n <= 10) return 'obertura';
    if (n <= 28) return 'mig joc';
    return 'final';
}

// TIER 2 — fase per material (no només per número de jugada): usa el phaseScore
// del context, que combina jugades i peces restants.
function phaseFromContext(ctx, moveNumber) {
    const score = ctx && typeof ctx.phaseScore === 'number' ? ctx.phaseScore : null;
    if (score === null) return getHumanPlanPhase(moveNumber);
    if (score < 0.30) return 'obertura';
    if (score < 0.66) return 'mig joc';
    return 'final';
}

function buildLocalHumanPlan(moment) {
    const themeKey = resolveHumanPlanThemeKey(moment);
    const pool = HUMAN_PLAN_BANK[themeKey] || HUMAN_PLAN_BANK.general;
    const intro = buildPlanIntro(moment);
    const diagnosis = fillPlanTemplate(pickFreshPlanLine(pool.diagnosis, themeKey + ':diagnosis'), moment);
    return {
        diagnosis: intro ? `${intro} ${diagnosis}` : diagnosis,
        plan: fillPlanTemplate(pickFreshPlanLine(pool.plan, themeKey + ':plan'), moment),
        question: fillPlanTemplate(pickFreshPlanLine(pool.question, themeKey + ':question'), moment),
        objective: fillPlanTemplate(pickFreshPlanLine(pool.objective, themeKey + ':objective'), moment)
    };
}

function buildHumanPlanMoments(entry, insights = null) {
    const reviews = Array.isArray(entry?.moveReviews) ? entry.moveReviews : [];
    const priority = { blunder: 4, mistake: 3, inaccuracy: 2, good: 1, excel: 0 };
    const ins = insights || buildPlayerInsights(entry && entry.id);
    return reviews
        .filter(r => r && ['inaccuracy', 'mistake', 'blunder'].includes(r.quality))
        .sort((a, b) => ((priority[b.quality] || 0) - (priority[a.quality] || 0)) || ((b.swing || 0) - (a.swing || 0)))
        .slice(0, 3)
        .map(r => {
            const ctx = buildPlanContext(r);
            const themeKey = detectPlanSubtheme(r, ctx);
            const isPattern = !!(ins && ins.recurringTheme && ins.recurringCount >= 3
                && planThemeToGrowth(themeKey) === ins.recurringTheme);
            const moment = {
                moveNumber: r.moveNumber || '?',
                phase: phaseFromContext(ctx, r.moveNumber),
                themeKey,
                theme: planThemeDisplayLabel(themeKey),
                played: r.playerMoveSan || r.playerMove || '—',
                best: r.bestMoveSan || r.bestMove || '—',
                // Versions en llenguatge planer per a les frases (sense notació SAN).
                playedDesc: r.fen ? moveHumanText(r.fen, r.playerMove || r.playerMoveSan, r.playerMoveSan) : (r.playerMoveSan || '—'),
                bestDesc: r.fen ? moveHumanText(r.fen, r.bestMove || r.bestMoveSan, r.bestMoveSan) : (r.bestMoveSan || '—'),
                bestMoveUci: r.bestMove || null,
                swing: Math.round(r.swing || 0),
                quality: r.quality || 'inaccuracy',
                fen: r.fen || null,
                pv: Array.isArray(r.bestMovePv) ? r.bestMovePv : [],
                positional: buildPositionalNote(ctx),
                candidates: buildCandidatesNote(r),
                isPattern
            };
            return { ...moment, ...buildLocalHumanPlan(moment) };
        });
}

function buildHumanPlansOpenAIPrompt(entry, moments) {
    return `Ets un entrenador d'escacs que escriu en català natural. Redacta un "Entrenador de plans humans" variat i gens repetitiu.

DADES DE LA PARTIDA
${JSON.stringify({ resultat: entry?.result || '—', precisio: entry?.precision ?? null }, null, 2)}

MOMENTS CRÍTICS DETECTATS PEL MOTOR (no els qüestionis ni inventis jugades):
${JSON.stringify(moments.map(m => ({ jugada: m.moveNumber, fase: m.phase, tema: m.theme, jugada_feta: m.played, millor_jugada: m.best, perdua_centipeons: m.swing, qualitat: m.quality })), null, 2)}

Retorna exactament ${moments.length} blocs, un per moment, separats per una línia en blanc. Cada bloc ha de tenir aquest format exacte:
PLA X: títol curt
Diagnòstic: una frase humana sobre què passava.
Pla: una frase amb el pla correcte, sense que soni mecànic.
Pregunta: una pregunta que obligui l'alumne a pensar.
Objectiu: una microtasca aplicable a la pròxima partida.

Regles: no facis markdown, no emojis, no llistes amb guions, màxim 90 paraules per bloc, català natural i precís, no inventis variants noves.`;
}


function buildSingleMovePracticeSequence(moment) {
    if (!moment || !moment.fen || !moment.bestMoveUci) return null;
    try {
        const g = new Chess(moment.fen);
        const move = g.move({
            from: moment.bestMoveUci.slice(0, 2),
            to: moment.bestMoveUci.slice(2, 4),
            promotion: moment.bestMoveUci.length > 4 ? moment.bestMoveUci[4] : undefined
        });
        if (!move) return null;
        let position = null;
        try { position = parseFenPosition(moment.fen); } catch (e) { position = null; }
        let threats = { threats: [], themes: [], immediateThreats: [] };
        try { threats = analyzePvThreats(moment.fen, [moment.bestMoveUci]) || threats; } catch (e) {}
        return {
            initialFen: moment.fen,
            totalSteps: 1,
            step1: {
                fen: moment.fen,
                playerMove: moment.bestMoveUci,
                playerMoveSan: move.san,
                alternatives: [],
                position: position,
                threats: threats
            },
            fullSequence: [moment.bestMoveUci],
            fullSequenceSan: [move.san]
        };
    } catch (e) {
        return null;
    }
}

// TIER 4 — exercici de 2-3 jugades a partir de la millor línia (PV), no només 1.
function buildMultiMovePracticeSequence(moment) {
    const pv = (moment && Array.isArray(moment.pv)) ? moment.pv : [];
    if (!moment || !moment.fen || pv.length < 3) return null;
    try {
        const g = new Chess(moment.fen);
        const steps = [], replies = [];
        for (let i = 0; i < pv.length; i++) {
            const u = pv[i];
            if (!u || u.length < 4) break;
            const before = g.fen();
            const mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined });
            if (!mv) break;
            if (i % 2 === 0) steps.push({ fen: before, uci: u, san: mv.san });
            else replies.push({ fen: before, uci: u, san: mv.san });
            if (steps.length >= 3 && replies.length >= 2) break;
        }
        let totalSteps;
        if (steps.length >= 3 && replies.length >= 2) totalSteps = 3;
        else if (steps.length >= 2 && replies.length >= 1) totalSteps = 2;
        else return null;
        const mkStep = (s) => {
            let position = null, threats = { threats: [], themes: [], immediateThreats: [] };
            try { position = parseFenPosition(s.fen); } catch (e) {}
            try { threats = analyzePvThreats(s.fen, [s.uci]) || threats; } catch (e) {}
            return { fen: s.fen, playerMove: s.uci, playerMoveSan: s.san, alternatives: [], position, threats };
        };
        const mkReply = (r) => ({ fen: r.fen, move: r.uci, moveSan: r.san, eval: 0 });
        const seq = {
            initialFen: moment.fen,
            totalSteps,
            step1: mkStep(steps[0]),
            opponentMove: mkReply(replies[0]),
            step2: mkStep(steps[1]),
            fullSequence: [steps[0].uci, replies[0].uci, steps[1].uci],
            fullSequenceSan: [steps[0].san, replies[0].san, steps[1].san]
        };
        if (totalSteps === 3) {
            seq.opponentMove2 = mkReply(replies[1]);
            seq.step3 = mkStep(steps[2]);
            seq.fullSequence.push(replies[1].uci, steps[2].uci);
            seq.fullSequenceSan.push(replies[1].san, steps[2].san);
        }
        return seq;
    } catch (e) {
        return null;
    }
}

function startHumanPlanPractice(moment) {
    const seq = buildMultiMovePracticeSequence(moment) || buildSingleMovePracticeSequence(moment);
    if (!seq) {
        showToast('No puc preparar aquest pla com a exercici jugable.', 'warn');
        return;
    }
    $('#review-modal').hide();
    isRandomBundleSession = false;
    isMatchErrorReviewSession = false;
    isSrsReviewSession = false;
    isDailyPuzzleSession = false;
    isTacticsSession = false;
    matchErrorQueue = [];
    currentMatchError = null;
    currentBundleSource = 'human_plan';
    currentBundleSeverity = null;
    currentGameMode = 'bundle';
    currentOpponent = null;
    pendingPreparedSequence = seq;
    startGame(true, seq.initialFen);
}

function appendHumanPlanPracticeButton(card, moment) {
    if (!moment || !moment.fen || !moment.bestMoveUci) return;
    const btn = $('<button class="btn btn-secondary human-plan-practice" type="button">Practica aquest pla</button>');
    btn.on('click', () => startHumanPlanPractice(moment));
    card.append(btn);
}

function renderHumanPlanCards(container, moments, voice = null) {
    const panel = $('<div class="human-plan-panel"></div>');
    const titleText = voice ? `🧭 Entrenador de plans humans · ${voice.name}` : '🧭 Entrenador de plans humans';
    panel.append($('<div class="coach-kicker human-plan-title"></div>').append($('<span></span>').text(titleText)));
    if (voice && voice.tagline) {
        panel.append($('<div class="coach-text human-plan-voice"></div>')
            .css({ opacity: 0.72, 'font-size': '0.82rem', 'margin': '2px 0 8px' })
            .text(`${voice.name} · ${voice.tagline}`));
    }
    const list = $('<div class="human-plan-list"></div>');
    moments.forEach((m, idx) => {
        const card = $('<div class="coach-item human-plan-card"></div>');
        const main = $('<div class="coach-item-main"></div>');
        main.append($('<div class="coach-item-title"></div>').text(`Pla ${idx + 1} · Jugada ${m.moveNumber} (${m.played}) · ${m.theme}`));
        const lines = [
            `<strong>Diagnòstic:</strong> ${escapeHtml(m.diagnosis)}`,
            `<strong>Pla:</strong> ${escapeHtml(m.plan)}`
        ];
        if (m.positional) lines.push(`<strong>A la posició:</strong> ${escapeHtml(m.positional)}`);
        if (m.candidates) lines.push(`<strong>Línia:</strong> ${escapeHtml(m.candidates)}`);
        if (m.isPattern) lines.push(`<strong>⚠️ Patró teu:</strong> aquest tema ja t'ha fallat altres partides recents.`);
        lines.push(`<strong>Pregunta:</strong> ${escapeHtml(m.question)}`);
        lines.push(`<strong>Objectiu:</strong> ${escapeHtml(m.objective)}`);
        main.append($('<div class="coach-text human-plan-text"></div>').html(lines.join('<br>')));
        card.append(main);
        appendHumanPlanPracticeButton(card, m);
        list.append(card);
    });
    panel.append(list);
    container.append(panel);
    return panel;
}

function renderOpenAIHumanPlans(panel, text, moments = []) {
    if (!panel || !panel.length || !text) return;
    const blocks = String(text).split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    if (!blocks.length) return;
    const list = panel.find('.human-plan-list');
    if (!list.length) return;
    list.empty();
    blocks.forEach((block, idx) => {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        const title = lines.shift() || 'Pla humà';
        const card = $('<div class="coach-item human-plan-card"></div>');
        const main = $('<div class="coach-item-main"></div>');
        main.append($('<div class="coach-item-title"></div>').text(title.replace(/^PLA\s*\d+\s*:\s*/i, '')));
        main.append($('<div class="coach-text human-plan-text"></div>').html(escapeHtml(lines.join('\n')).replace(/\n/g, '<br>')));
        const mm = moments[idx];
        const extra = [];
        if (mm && mm.positional) extra.push(`<strong>A la posició:</strong> ${escapeHtml(mm.positional)}`);
        if (mm && mm.candidates) extra.push(`<strong>Línia:</strong> ${escapeHtml(mm.candidates)}`);
        if (extra.length) main.append($('<div class="coach-text human-plan-text"></div>').css('margin-top', '4px').html(extra.join('<br>')));
        card.append(main);
        appendHumanPlanPracticeButton(card, moments[idx]);
        list.append(card);
    });
}

function renderGameDebrief(targetEntry) {
    const box = $('#review-debrief');
    if (!box.length) return;
    box.hide();
    if (blunderMode) return;
    // El debrief de l'entrenador es genera LOCALMENT (sense OpenAI). Es mostra tant
    // a la revisió de la partida que s'acaba de jugar com en reobrir partides
    // antigues des de l'historial; per això acceptem una entrada concreta i ja no
    // limitem la visualització a les partides recents.
    const entry = targetEntry || gameHistory[gameHistory.length - 1];
    if (!entry) return;
    let facts = null;
    try { facts = buildDebriefFacts(entry); } catch (e) { console.warn('No s\'ha pogut generar el debrief', e); }
    if (!facts) return;

    const coachVoice = pickCoachVoiceForKey(entry.id);
    const localText = composeDebriefText(facts, entry.id, coachVoice);
    box.empty().show();
    box.append($('<div class="coach-kicker"></div>').append(
        $('<span></span>').text(`🎓 L'entrenador diu · ${coachVoice.name}`),
        $('<button class="coach-speak-btn" title="Escolta-ho en veu alta">🔊</button>')
    ));
    const textEl = $('<div class="coach-text"></div>').text(localText);
    box.append(textEl);
    box.find('.coach-speak-btn').on('click', () => speakCoachText(textEl.text()));
    updateCoachSpeakButtons();

    const openingNote = buildOpeningNote(entry);
    if (openingNote) box.append($('<div class="coach-text"></div>').css({ opacity: 0.85, 'margin-top': '6px' }).text(openingNote));

    const playerInsights = buildPlayerInsights(entry.id);
    const insightsNote = buildInsightsNote(playerInsights);
    if (insightsNote) box.append($('<div class="coach-text"></div>').css({ opacity: 0.85, 'margin-top': '6px' }).text(insightsNote));

    const humanPlanMoments = buildHumanPlanMoments(entry, playerInsights);
    let humanPlansPanel = null;
    if (humanPlanMoments.length) {
        humanPlansPanel = renderHumanPlanCards(box, humanPlanMoments, coachVoice);
    }

    if (!coachDebriefPending) {
        coachDebriefPending = true;
        requestOpenAICoachText(`debrief:${entry.id}`, buildDebriefOpenAIPrompt(facts), text => textEl.text(text))
            .finally(() => { coachDebriefPending = false; });
    }
    if (humanPlansPanel && humanPlanMoments.length) {
        requestOpenAICoachText(
            `human-plans:${entry.id}:v1`,
            buildHumanPlansOpenAIPrompt(entry, humanPlanMoments),
            text => renderOpenAIHumanPlans(humanPlansPanel, text, humanPlanMoments),
            3000
        );
    }
}

/* --------------------- Veu (TTS en català, opcional) --------------------- */

function initCoachVoice() {
    if (!('speechSynthesis' in window)) return;
    const pickVoice = () => {
        try {
            const voices = window.speechSynthesis.getVoices() || [];
            coachCatalanVoice = voices.find(v => /^ca([-_]|$)/i.test(v.lang || '')) || null;
        } catch (e) { coachCatalanVoice = null; }
        updateCoachSpeakButtons();
    };
    pickVoice();
    try { window.speechSynthesis.addEventListener('voiceschanged', pickVoice); } catch (e) {}
}

function isCoachTtsAvailable() {
    return ('speechSynthesis' in window) && !!coachCatalanVoice;
}

function updateCoachSpeakButtons() {
    $('.coach-speak-btn').toggle(isCoachTtsAvailable());
}

// TIER 4 — converteix la notació d'escacs a paraules perquè el TTS la llegeixi bé.
function speakableChessText(text) {
    if (!text) return text;
    const pieces = { K: 'rei', Q: 'dama', R: 'torre', B: 'alfil', N: 'cavall' };
    let t = String(text);
    t = t.replace(/\bO-O-O\b/g, 'enroc llarg').replace(/\bO-O\b/g, 'enroc curt');
    t = t.replace(/\b([KQRBN])([a-h]?[1-8]?)(x?)([a-h][1-8])(=[QRBN])?([+#]?)/g,
        (m, p, dis, cap, dest, promo, chk) => {
            let out = pieces[p];
            if (dis) out += ' ' + dis.split('').join(' ');
            if (cap) out += ' pren';
            out += ' ' + dest.split('').join(' ');
            if (promo) out += ' corona ' + (pieces[promo[1]] || '');
            if (chk === '+') out += ' escac'; else if (chk === '#') out += ' escac i mat';
            return out;
        });
    t = t.replace(/\b([a-h])x([a-h][1-8])(=[QRBN])?([+#]?)/g,
        (m, f, dest, promo, chk) => {
            let out = f + ' pren ' + dest.split('').join(' ');
            if (promo) out += ' corona ' + (pieces[promo[1]] || '');
            if (chk === '+') out += ' escac'; else if (chk === '#') out += ' escac i mat';
            return out;
        });
    return t;
}

function speakCoachText(text) {
    if (!isCoachTtsAvailable() || !text) return;
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(speakableChessText(text));
        utterance.voice = coachCatalanVoice;
        utterance.lang = coachCatalanVoice.lang || 'ca-ES';
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
    } catch (e) { console.warn('TTS no disponible', e); }
}

/* --------------------- Pla diari de l'entrenador --------------------- */

// Clau del dia (UTC, igual que getToday/missions): el pla canvia cada mitjanit UTC.
function getPlanDayKey() { return getToday(); }

// Regles locals: tria el focus del dia a partir de mastery + errors recents,
// i fixa objectius mesurables amb comptadors que ja existeixen (baseline al moment de crear el pla).
// La llavor diària fa que el focus i les quantitats variïn d'un dia a l'altre.
function buildWeeklyPlan() {
    loadThemeMastery();
    loadGrowthStats();
    const day = getPlanDayKey();
    const rng = mulberry32(hashStr(`plan:${day}`));
    const errorThemes = {};
    savedErrors.slice(-30).forEach(err => {
        const t = normalizeGrowthTheme(classifyPositionTheme(err.fen || '', err.playerMove || ''));
        errorThemes[t] = (errorThemes[t] || 0) + 1;
    });
    const themes = Object.keys(THEME_MASTERY_DEFAULTS).filter(t => t !== 'general');
    themes.sort((a, b) => (themeMastery[a] - themeMastery[b]) || ((errorThemes[b] || 0) - (errorThemes[a] || 0)));
    // El focus rota cada dia entre els temes més fluixos (prioritzant els que tenen errors recents)
    const withErrors = themes.filter(t => (errorThemes[t] || 0) > 0);
    const pool = (withErrors.length ? withErrors : themes).slice(0, 3);
    const focusTheme = pool[Math.floor(rng() * pool.length)] || themes[0];
    const due = getDueErrors().length;

    const items = [];
    if (savedErrors.length > 0) {
        items.push({
            id: 'focus', type: 'weakness_training', theme: focusTheme, metric: 'weakness',
            title: `Entrena ${getThemeLabel(focusTheme)} (1 sessió)`,
            target: 1, baseline: growthStats.weaknessSessionsCompleted || 0
        });
    }
    if (getOpeningPhaseErrors().length > 0) {
        const openTarget = 1 + Math.floor(rng() * 2);
        items.push({
            id: 'openings', type: 'opening_drill', theme: 'opening', metric: 'opening_drill',
            title: openTarget === 1
                ? "Rectifica 1 errada d'obertura (2 jugades correctes)"
                : `Rectifica ${openTarget} errades d'obertura (2 jugades correctes)`,
            target: openTarget, baseline: growthStats.openingDrillsCompleted || 0
        });
    }
    const mateTarget = 1 + Math.floor(rng() * 2);
    items.push({
        id: 'mates', type: 'mate_drill', theme: 'endgame', metric: 'mate_drill',
        title: mateTarget === 1 ? 'Remata 1 final amb mat en 3 jugades' : `Remata ${mateTarget} finals amb mat en 3 jugades`,
        target: mateTarget, baseline: growthStats.mateDrillsCompleted || 0
    });
    const tacticsTarget = 3 + Math.floor(rng() * 3);
    items.push({
        id: 'tactics', type: 'tactics', theme: null, metric: 'tactics',
        title: `Resol ${tacticsTarget} exercicis de tàctica`,
        target: tacticsTarget, baseline: tacticsStats.solved || 0
    });

    return {
        day,
        createdAt: Date.now(),
        version: WEEKLY_PLAN_VERSION,
        focusTheme,
        focusMastery: Math.round((themeMastery[focusTheme] || 0) * 100),
        srsAtStart: due,
        openaiSummary: null,
        summaryVersion: PLAN_SUMMARY_REFRESH_VERSION,
        items: items.slice(0, 4)
    };
}

function weeklyPlanItemProgress(item) {
    let current = 0;
    if (item.metric === 'weakness') current = (growthStats.weaknessSessionsCompleted || 0) - item.baseline;
    else if (item.metric === 'srs') current = (growthStats.srsCompleted || 0) - item.baseline;
    else if (item.metric === 'tactics') current = (tacticsStats.solved || 0) - item.baseline;
    else if (item.metric === 'games') current = (totalGamesPlayed || 0) - item.baseline;
    else if (item.metric === 'opening_drill') current = (growthStats.openingDrillsCompleted || 0) - item.baseline;
    else if (item.metric === 'mate_drill') current = (growthStats.mateDrillsCompleted || 0) - item.baseline;
    return Math.max(0, Math.min(item.target, current));
}

const COACH_PLAN_TEMPLATES = [
    "Avui el focus és {tema} (domini del {pct}%). El pla té tres fronts: rectifica les errades que vas cometre a l'obertura amb dues jugades correctes, afina la vista amb la tàctica, i remata finals fent escac i mat en 3 jugades. Pas a pas, sense pressa.",
    "He repassat les teves últimes partides i el que demana més feina és {tema} (domini del {pct}%). Per treballar-ho de totes bandes, avui combinem la correcció de les teves errades d'obertura, exercicis de tàctica i mats en 3 jugades als finals.",
    "Pla d'avui: corregeix les errades que vas cometre a l'obertura, resol els mats en 3 jugades per dominar els finals, i no descuidis la tàctica. El teu punt més fluix continua sent {tema} (domini del {pct}%): cada tasca completada hi suma."
];

function composeWeeklyPlanText(plan) {
    const rng = mulberry32(hashStr(`plan:${plan.day}`));
    const tpl = COACH_PLAN_TEMPLATES[Math.floor(rng() * COACH_PLAN_TEMPLATES.length)];
    return fillCoachTemplate(tpl, { tema: getThemeLabel(plan.focusTheme), pct: plan.focusMastery });
}

function buildWeeklyPlanOpenAIPrompt(plan) {
    return `Ets un entrenador d'escacs proper que parla en català i tuteja l'alumne.
Escriu 2 frases (màxim 45 paraules en total) presentant el pla d'entrenament d'avui d'un alumne, NOMÉS amb aquests fets:
${JSON.stringify({
        tema_a_reforcar: getThemeLabel(plan.focusTheme),
        domini_del_tema_percent: plan.focusMastery,
        repassos_pendents: plan.srsAtStart,
        tasques: plan.items.map(i => i.title)
    }, null, 2)}
Sense llistes, sense markdown, sense emojis. To motivador però concret.`;
}

function ensureWeeklyPlan() {
    const day = getPlanDayKey();
    const stored = readJsonStorage(WEEKLY_PLAN_KEY, null);
    if (stored && stored.day === day && stored.version === WEEKLY_PLAN_VERSION && Array.isArray(stored.items) && stored.items.length) {
        weeklyPlan = stored;
        if ((weeklyPlan.summaryVersion || 0) < PLAN_SUMMARY_REFRESH_VERSION) {
            weeklyPlan.openaiSummary = null;
            weeklyPlan.summaryVersion = PLAN_SUMMARY_REFRESH_VERSION;
            writeJsonStorage(WEEKLY_PLAN_KEY, weeklyPlan);
        }
    } else {
        weeklyPlan = buildWeeklyPlan();
        writeJsonStorage(WEEKLY_PLAN_KEY, weeklyPlan);
    }
    renderWeeklyPlan();
}

/* Rellotge de compte enrere fins al pla de demà (canvia a mitjanit UTC, com getToday).
   Quan arriba a 0, el pla es regenera automàticament. */
let planCountdownTimer = null;

function startPlanCountdown() {
    if (planCountdownTimer) return;
    updatePlanCountdown();
    planCountdownTimer = setInterval(updatePlanCountdown, 1000);
}

function updatePlanCountdown() {
    const el = document.getElementById('plan-countdown');
    if (!el) return;
    const now = new Date();
    const nextChange = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const ms = Math.max(0, nextChange - now.getTime());
    const h = Math.floor(ms / 3600000);
    const m = Math.floor(ms / 60000) % 60;
    const s = Math.floor(ms / 1000) % 60;
    el.textContent = `⏳ ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (weeklyPlan && weeklyPlan.day !== getPlanDayKey()) ensureWeeklyPlan();
}

const PLAN_SUMMARY_COLLAPSE_CHARS = 40;

function getCollapsedPlanSummary(text) {
    if (text.length <= PLAN_SUMMARY_COLLAPSE_CHARS) return text;
    return `${text.slice(0, PLAN_SUMMARY_COLLAPSE_CHARS).trimEnd()}…`;
}

function renderPlanSummaryText() {
    const el = document.getElementById('weekly-plan-summary');
    const btn = document.getElementById('btn-plan-summary-toggle');
    if (!el || !btn) return;

    const fullText = el.dataset.fullText || '';
    const shouldCollapse = fullText.length > PLAN_SUMMARY_COLLAPSE_CHARS;
    const expanded = el.dataset.expanded === 'true';
    const visibleText = shouldCollapse && !expanded ? getCollapsedPlanSummary(fullText) : fullText;

    el.classList.toggle('expanded', expanded || !shouldCollapse);
    el.textContent = visibleText;
    btn.style.display = shouldCollapse ? 'inline-block' : 'none';
    btn.textContent = expanded ? "▲ Mostra'n menys" : '[Continuar llegint]';
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    btn.setAttribute('aria-label', expanded ? 'Mostra menys text del pla de l\'entrenador' : 'Continua llegint el pla complet de l\'entrenador');
}

function setPlanSummaryText(text) {
    const el = document.getElementById('weekly-plan-summary');
    if (!el) return;
    const nextText = text || '';
    const previousFullText = el.dataset.fullText || '';
    const wasExpanded = el.dataset.expanded === 'true';
    el.dataset.fullText = nextText;
    // No pleguem de nou el resum cada vegada que es refresca la pantalla: si el
    // text és el mateix, respectem que l'usuari ja havia premut [Continuar llegint].
    el.dataset.expanded = previousFullText === nextText && wasExpanded ? 'true' : 'false';
    renderPlanSummaryText();
}

/* El resum del pla només mostra els primers 40 caràcters quan és llarg.
   El botó [Continuar llegint] desplega el text sencer sense scroll intern. */
function updatePlanSummaryToggle() {
    const el = document.getElementById('weekly-plan-summary');
    const btn = document.getElementById('btn-plan-summary-toggle');
    if (!el || !btn) return;
    if (!btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', event => {
            event.preventDefault();
            el.dataset.expanded = el.dataset.expanded === 'true' ? 'false' : 'true';
            renderPlanSummaryText();
        });
    }
    renderPlanSummaryText();
}

function launchWeeklyPlanItem(item) {
    try {
        if (item.type === 'opening_drill') return startOpeningErrorDrill();
        if (item.type === 'mate_drill') return void startMateDrill();
        if (item.type === 'free_game') {
            if (typeof novaPartida === 'function') return novaPartida();
        }
        // Reutilitzem el flux de tasques de creixement: fixa currentGrowthTask i
        // així el comptador de sessions completades també compta per al pla.
        return executeGrowthTask({ type: item.type, theme: item.theme || 'general', source: 'weekly_plan' });
    } catch (e) {
        console.warn('No s\'ha pogut iniciar la tasca del pla diari', e);
        showToast('No he pogut iniciar aquesta tasca ara mateix.', 'warn');
    }
}

function renderWeeklyPlan() {
    const panel = $('#weekly-plan-panel');
    if (!panel.length || !weeklyPlan) return;
    panel.show();
    startPlanCountdown();
    const summary = weeklyPlan.openaiSummary || weeklyPlan.geminiSummary || composeWeeklyPlanText(weeklyPlan);
    setPlanSummaryText(summary);
    updatePlanSummaryToggle();

    const list = $('#weekly-plan-list').empty();
    weeklyPlan.items.forEach(item => {
        const progress = weeklyPlanItemProgress(item);
        const done = progress >= item.target;
        const pct = Math.round((progress / item.target) * 100);
        const row = $(`
            <div class="coach-item${done ? ' done' : ''}">
                <div class="coach-item-main">
                    <div class="coach-item-title"></div>
                    <div class="coach-item-progress">
                        <div class="coach-item-bar"><div class="coach-item-fill" style="width:${pct}%"></div></div>
                        <span class="coach-item-count">${progress}/${item.target}</span>
                    </div>
                </div>
                <button class="btn coach-item-go">${done ? '✓ Fet' : 'Fes-ho'}</button>
            </div>`);
        row.find('.coach-item-title').text(item.title);
        const goBtn = row.find('.coach-item-go');
        if (done) goBtn.prop('disabled', true);
        else goBtn.on('click', () => launchWeeklyPlanItem(item));
        list.append(row);
    });

    // Poliment OpenAI un sol cop per dia (es persisteix dins del pla).
    if (!weeklyPlan.openaiSummary && openaiApiKey && !coachPlanOpenAIPending) {
        coachPlanOpenAIPending = true;
        requestOpenAICoachText(`dailyplan:${weeklyPlan.day}`, buildWeeklyPlanOpenAIPrompt(weeklyPlan), text => {
            weeklyPlan.openaiSummary = text;
            writeJsonStorage(WEEKLY_PLAN_KEY, weeklyPlan);
            setPlanSummaryText(text);
            updatePlanSummaryToggle();
        }).finally(() => { coachPlanOpenAIPending = false; });
    }
}

/* ===================== MOTIUS TÀCTICS I NOUS EXERCICIS DEL PLA =====================
   1) analyzeTacticalMotive: tradueix la línia de Stockfish (jugada + PV) a un motiu
      tàctic concret (mat, forquilla, clavada, raig X, peça sense defensa, canvi
      guanyador, atac al rei) de manera determinista amb chess.js.
   2) Exercicis d'obertura: errades reals de les teves 10 primeres jugades, amb el
      flux de 2 jugades correctes i el bàner de context.
   3) Mats en 3: posicions de final verificades pel motor (s'accepten només si el
      mat arriba exactament a la 3a jugada del jugador). */

const MOTIVE_PIECE_NAMES = { p: 'el peó', n: 'el cavall', b: "l'alfil", r: 'la torre', q: 'la dama', k: 'el rei' };
const MOTIVE_PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 };

// Contracció "de + article" en català: "de el cavall" → "del cavall"
function deCasella(sq) {
    return (sq && (sq[0] === 'a' || sq[0] === 'e')) ? `d'${sq}` : `de ${sq}`;
}

function deNom(name) {
    if (!name) return "de la peça";
    if (name.startsWith('el ')) return 'del ' + name.slice(3);
    if (name.startsWith("l'")) return "de l'" + name.slice(2);
    return 'de ' + name;
}

function pvMatePlies(fen, pv) {
    try {
        const g = new Chess(fen);
        for (let i = 0; i < pv.length; i++) {
            const u = pv[i];
            const mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined });
            if (!mv) return 0;
            if (g.in_checkmate()) return i + 1;
        }
    } catch (e) {}
    return 0;
}

function findPinOrSkewer(gAfter, square, piece, color) {
    const dirsDiag = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const dirsOrto = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const dirs = piece === 'b' ? dirsDiag : (piece === 'r' ? dirsOrto : dirsDiag.concat(dirsOrto));
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1], 10) - 1;
    for (const [df, dr] of dirs) {
        let f = file + df, r = rank + dr;
        let first = null;
        while (f >= 0 && f < 8 && r >= 0 && r < 8) {
            const sq = String.fromCharCode(97 + f) + (r + 1);
            const p = gAfter.get(sq);
            if (p) {
                if (p.color === color) break;
                if (!first) {
                    if (p.type === 'k') break; // escac directe, no és clavada
                    first = { piece: p, sq };
                } else {
                    if (p.type === 'k') {
                        return { theme: 'pin', text: `una clavada sobre ${MOTIVE_PIECE_NAMES[first.piece.type]} ${deCasella(first.sq)} contra el rei` };
                    }
                    if (MOTIVE_PIECE_VALUES[p.type] > MOTIVE_PIECE_VALUES[first.piece.type]) {
                        return { theme: 'pin', text: `una clavada sobre ${MOTIVE_PIECE_NAMES[first.piece.type]} ${deCasella(first.sq)} davant ${deNom(MOTIVE_PIECE_NAMES[p.type])}` };
                    }
                    if (MOTIVE_PIECE_VALUES[first.piece.type] > MOTIVE_PIECE_VALUES[p.type]) {
                        return { theme: 'skewer', text: `un raig X que travessava ${MOTIVE_PIECE_NAMES[first.piece.type]} ${deCasella(first.sq)}` };
                    }
                    break;
                }
            }
            f += df; r += dr;
        }
    }
    return null;
}

// Retorna { theme, text } amb el motiu tàctic que la millor jugada aprofitava, o null.
function analyzeTacticalMotive(fen, bestMove, bestMovePv = []) {
    if (!fen || !bestMove || String(bestMove).length < 4) return null;
    let g, mv;
    try {
        g = new Chess(fen);
        mv = g.move({ from: bestMove.slice(0, 2), to: bestMove.slice(2, 4), promotion: bestMove.length > 4 ? bestMove[4] : 'q' });
    } catch (e) { return null; }
    if (!mv) return null;

    // 1) Mat immediat o mat forçat dins la línia del motor
    if (g.in_checkmate()) return { theme: 'king_attack', text: 'hi havia escac i mat immediat' };
    const pv = Array.isArray(bestMovePv) ? bestMovePv : [];
    const matePlies = pvMatePlies(fen, pv);
    if (matePlies > 0) {
        const mateMoves = Math.ceil(matePlies / 2);
        return { theme: 'king_attack', text: `hi havia un mat forçat en ${mateMoves} jugad${mateMoves === 1 ? 'a' : 'es'}` };
    }

    const gaveCheck = !!(mv.san && mv.san.includes('+'));

    // 2) Forquilla: des de la nova casella, la peça ataca 2+ peces valuoses
    if (!gaveCheck && mv.piece !== 'k') {
        try {
            const parts = g.fen().split(' ');
            parts[1] = mv.color; parts[3] = '-';
            const g2 = new Chess(parts.join(' '));
            const targets = (g2.moves({ square: mv.to, verbose: true }) || [])
                .filter(m => m.captured && MOTIVE_PIECE_VALUES[m.captured] >= 3);
            if (targets.length >= 2) {
                const names = targets.slice(0, 2).map(m => MOTIVE_PIECE_NAMES[m.captured] || 'una peça');
                return { theme: 'fork', text: `una forquilla ${deNom(MOTIVE_PIECE_NAMES[mv.piece])} a ${mv.to} sobre ${names.join(' i ')}` };
            }
        } catch (e) {}
    }

    // 3) Clavada o raig X amb peces de línia
    if (['b', 'r', 'q'].includes(mv.piece)) {
        const ray = findPinOrSkewer(g, mv.to, mv.piece, mv.color);
        if (ray) return ray;
    }

    // 4) Captures: peça sense defensa o canvi guanyador
    if (mv.captured) {
        const capturedName = MOTIVE_PIECE_NAMES[mv.captured] || 'una peça';
        const reply = pv.length > 1 ? pv[1] : null;
        const recaptures = !!(reply && reply.slice(2, 4) === mv.to);
        if (!recaptures) return { theme: 'material', text: `podies capturar ${capturedName} ${deCasella(mv.to)}, que estava sense defensa` };
        if (MOTIVE_PIECE_VALUES[mv.captured] > MOTIVE_PIECE_VALUES[mv.piece]) {
            return { theme: 'material', text: `un canvi guanyador: ${capturedName} a canvi ${deNom(MOTIVE_PIECE_NAMES[mv.piece])}` };
        }
        return { theme: 'material', text: `una combinació de captures a ${mv.to} que guanyava material` };
    }

    // 5) Atac persistent al rei: dos o més escacs dins la línia
    if (gaveCheck && pv.length) {
        let checks = 0;
        try {
            const gc = new Chess(fen);
            for (const u of pv) {
                const m2 = gc.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined });
                if (!m2) break;
                if (m2.san.includes('+') || m2.san.includes('#')) checks++;
            }
        } catch (e) {}
        if (checks >= 2) return { theme: 'king_attack', text: 'un atac directe al rei amb escacs seguits' };
    }
    return null;
}

/* --------------------- Tema tàctic de l'exercici --------------------- */
// Orienta sense revelar: diu QUIN tipus de cop cal buscar, mai les caselles.
const TACTIC_THEME_HINTS = {
    fork: { label: 'Forquilla', tip: 'Busca una jugada que ataqui dues peces alhora.' },
    pin: { label: 'Clavada', tip: 'Busca una peça rival que no es pugui moure sense exposar-ne una de més valuosa.' },
    skewer: { label: 'Raig X', tip: "Obliga una peça valuosa a apartar-se per guanyar la que té al darrere." },
    king_attack: { label: 'Atac al rei', tip: 'El rei rival és el blanc: pensa en escacs i amenaces de mat.' },
    material: { label: 'Guany de material', tip: 'Hi ha material per guanyar: revisa captures i peces sense defensa.' },
    calc: { label: 'Combinació', tip: 'Calcula amb ordre: revisa escacs, captures i amenaces abans de decidir.' }
};

// Deriva el tema de l'exercici. Si la primera jugada no té motiu clar (pot ser
// preparatòria), busca'l a les jugades del jugador més endins de la línia; si
// tampoc, dedueix-lo del conjunt de la línia. Mai retorna null.
function deriveTacticTheme(fen, step1) {
    const pv = (step1 && step1.playerMovePv) || [];
    try {
        const direct = analyzeTacticalMotive(fen, step1.playerMove, pv);
        if (direct && TACTIC_THEME_HINTS[direct.theme]) return direct.theme;
    } catch (e) {}
    // Motiu a les jugades següents del jugador dins la PV (índexs parells)
    try {
        const g = new Chess(fen);
        for (let i = 0; i < pv.length && i < 6; i++) {
            if (i > 0 && i % 2 === 0) {
                const m = analyzeTacticalMotive(g.fen(), pv[i], pv.slice(i));
                if (m && TACTIC_THEME_HINTS[m.theme]) return m.theme;
            }
            const u = pv[i];
            if (!g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined })) break;
        }
    } catch (e) {}
    // Heurística agregada: escacs del jugador → atac al rei; captures → material
    try {
        const g = new Chess(fen);
        let checks = 0, captures = 0;
        for (let i = 0; i < pv.length && i < 8; i++) {
            const u = pv[i];
            const mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined });
            if (!mv) break;
            if (i % 2 === 0) {
                if (mv.san.includes('+') || mv.san.includes('#')) checks++;
                if (mv.captured) captures++;
            }
        }
        if (checks >= 1) return 'king_attack';
        if (captures >= 1) return 'material';
    } catch (e) {}
    return 'calc';
}

// Mostra el tipus de tema tàctic en exercicis sense context d'error propi
// (tàctiques del banc, repte diari). Es crida a startGame, després del bàner d'error.
function renderTacticThemeHint() {
    const banner = $('#tactic-theme-banner');
    if (!banner.length) return;
    banner.hide();
    if (!blunderMode || !bundleFixedSequence) return;
    // Si ja hi ha bàner d'error propi, aquell ja explica el motiu; no dupliquem.
    if (currentErrorContext) return;
    // Al mat en 3, el títol ja anuncia l'objectiu.
    if (currentBundleSource === 'mate_drill') return;
    const step1 = bundleFixedSequence.step1 || {};
    let theme = 'calc';
    try { theme = deriveTacticTheme(bundleFixedSequence.initialFen, step1); } catch (e) {}
    const hint = TACTIC_THEME_HINTS[theme] || TACTIC_THEME_HINTS.calc;
    const textEl = $('#tactic-theme-text').empty();
    textEl.append($('<span></span>').text('🎯 Tema: '));
    textEl.append($('<strong></strong>').text(hint.label));
    textEl.append($('<span></span>').text(` · ${hint.tip}`));
    banner.show();
}

/* --------------------- Exercicis d'errors d'obertura --------------------- */

function getOpeningPhaseErrors() {
    return savedErrors.filter(e => {
        const fm = parseInt((e.fen || '').split(' ')[5]) || 99;
        return fm <= 10 && e.playerMove;
    });
}

function startOpeningErrorDrill() {
    if (!guardCalibrationAccess()) return;
    const pool = getOpeningPhaseErrors();
    if (!pool.length) {
        showToast("No tens errades d'obertura guardades. Juga partides i tornaran a aparèixer aquí.", 'warn');
        return;
    }
    const choice = pickPreferPrepared(pool, e => e.fen);
    isSrsReviewSession = false;
    isDailyPuzzleSession = false;
    isRandomBundleSession = false;
    isMatchErrorReviewSession = false;
    isTacticsSession = false;
    matchErrorQueue = [];
    currentMatchError = null;
    currentBundleSource = 'opening_drill';
    currentBundleSeverity = null;
    $('#bundle-modal').remove();
    currentGameMode = 'bundle';
    currentOpponent = null;
    startGame(true, choice.fen);
}

/* --------------------- Mats en 3 jugades (finals) --------------------- */

// Candidats KQ/KR contra rei sol; el motor només accepta els que són mat EXACTE en 3.
const MATE_DRILL_BANK = [
    '6k1/8/6K1/8/8/8/8/4Q3 w - - 0 1',
    '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1',
    '5k2/8/4K3/8/8/8/8/Q7 w - - 0 1',
    '6k1/8/5K2/8/8/8/8/3Q4 w - - 0 1',
    '1k6/8/2K5/8/8/8/8/5Q2 w - - 0 1',
    'k7/8/2K5/8/8/8/8/6Q1 w - - 0 1',
    '6k1/8/8/6K1/8/8/8/4Q3 w - - 0 1',
    '5k2/8/8/4K3/8/8/8/7Q w - - 0 1',
    '7k/8/5K2/8/8/8/8/6R1 w - - 0 1',
    '4k3/8/3K4/8/8/8/8/7Q w - - 0 1',
    '8/7Q/8/8/8/4K3/8/3k4 w - - 0 1',
    '2k5/8/3K4/8/8/8/8/7Q w - - 0 1'
];

let pendingPreparedSequence = null;
let mateDrillPreparing = false;
let lastMateDrillFen = null;

function buildMateSequenceObject(fen, steps, replies, sans) {
    const emptyThreats = { threats: [], themes: [], immediateThreats: [] };
    const decorate = s => Object.assign({ alternatives: [], position: null, threats: emptyThreats }, s);
    return {
        initialFen: fen,
        step1: decorate(steps[0]),
        opponentMove: { move: replies[0].move, moveSan: replies[0].san },
        step2: decorate(steps[1]),
        opponentMove2: { move: replies[1].move, moveSan: replies[1].san },
        step3: decorate(steps[2]),
        totalSteps: 3,
        fullSequence: [steps[0].playerMove, replies[0].move, steps[1].playerMove, replies[1].move, steps[2].playerMove],
        fullSequenceSan: sans
    };
}

// Construeix i VERIFICA una seqüència de mat en 3: segueix la línia del motor i
// només retorna la seqüència si l'escac i mat arriba a la 3a jugada del jugador.
async function prepareMateSequence(fen) {
    if (!stockfish) { ensureStockfish(); await new Promise(r => setTimeout(r, 500)); }
    if (!stockfish) return null;
    let waitCount = 0;
    while (!stockfishReady && waitCount < 20) { await new Promise(r => setTimeout(r, 100)); waitCount++; }
    if (!stockfishReady) return null;
    try {
        stockfish.postMessage('stop');
        stockfish.postMessage('setoption name MultiPV value 1');
        await new Promise(r => setTimeout(r, 200));

        const steps = [], replies = [], sans = [];
        let curFen = fen;
        for (let i = 0; i < 3; i++) {
            const analysis = await analyzeFenRobust(curFen, 14, 1, 6000);
            const pm = analysis?.bestMove?.move;
            if (!pm) return null;
            const g = new Chess(curFen);
            const mv = g.move({ from: pm.slice(0, 2), to: pm.slice(2, 4), promotion: pm.length > 4 ? pm[4] : undefined });
            if (!mv) return null;
            steps.push({ fen: curFen, playerMove: pm, playerMoveSan: mv.san });
            sans.push(mv.san);
            if (g.in_checkmate()) return i === 2 ? buildMateSequenceObject(fen, steps, replies, sans) : null;
            if (i === 2 || g.game_over()) return null; // 3 jugades sense mat, o ofegat
            await new Promise(r => setTimeout(r, 250));
            const replyAnalysis = await analyzeFenRobust(g.fen(), 14, 1, 6000);
            const rm = replyAnalysis?.bestMove?.move;
            if (!rm) return null;
            const rmv = g.move({ from: rm.slice(0, 2), to: rm.slice(2, 4), promotion: rm.length > 4 ? rm[4] : undefined });
            if (!rmv || g.game_over()) return null;
            replies.push({ move: rm, san: rmv.san });
            sans.push(rmv.san);
            curFen = g.fen();
            await new Promise(r => setTimeout(r, 250));
        }
        return null;
    } catch (e) {
        console.warn('[MateDrill] Error preparant seqüència', e);
        return null;
    }
}

async function startMateDrill() {
    if (!guardCalibrationAccess() || mateDrillPreparing) return;
    mateDrillPreparing = true;
    showToast('Preparant un mat en 3 jugades... ⏳', 'info');
    try {
        const candidates = MATE_DRILL_BANK.slice();
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        let seq = null;
        let tried = 0;
        for (const candidate of candidates) {
            if (candidate === lastMateDrillFen && candidates.length > 1) continue;
            if (tried >= 5) break;
            tried++;
            seq = await prepareMateSequence(candidate);
            if (seq) break;
        }
        if (!seq) {
            showToast('No he pogut preparar cap mat ara mateix. Torna-ho a provar.', 'warn');
            return;
        }
        lastMateDrillFen = seq.initialFen;
        isSrsReviewSession = false;
        isDailyPuzzleSession = false;
        isRandomBundleSession = false;
        isMatchErrorReviewSession = false;
        isTacticsSession = false;
        matchErrorQueue = [];
        currentMatchError = null;
        currentBundleSource = 'mate_drill';
        currentBundleSeverity = null;
        $('#bundle-modal').remove();
        currentGameMode = 'bundle';
        currentOpponent = null;
        pendingPreparedSequence = seq;
        startGame(true, seq.initialFen);
    } finally {
        mateDrillPreparing = false;
    }
}

// Mat o taules dins d'un exercici: el mat és èxit; l'ofegat és error i es reintenta.
function handleBundleGameOver() {
    if (game.in_checkmate()) {
        if (pendingMoveEvaluation) { goodMoves++; pendingMoveEvaluation = false; updatePrecisionDisplay(); }
        const played = lastHumanMoveUci || '';
        const playedTo = played.length >= 4 ? played.slice(2, 4) : null;
        if (playedTo) showMainMoveVisualFeedback(playedTo, 'correct');
        lastBundleOpenAIHint = null;
        handleBundleSuccess();
        return;
    }
    if (pendingMoveEvaluation) {
        pendingMoveEvaluation = false;
        totalPlayerMoves = Math.max(0, totalPlayerMoves - 1);
        updatePrecisionDisplay();
    }
    showToast('La posició ha quedat en taules: aquest no era el camí.', 'warn');
    setTimeout(() => resetBundleToStartPosition(), 700);
}

function showDrillSuccessOverlay(titleText, onAgain) {
    const overlay = $('#bundle-success-overlay');
    if (!overlay.length) {
        alert(titleText);
        returnToMainMenuImmediate();
        return;
    }
    overlay.find('.bundle-success-title').text(titleText);
    overlay.find('.bundle-success-remaining').text('Pla diari actualitzat');
    overlay.find('#btn-bundle-random-again').text('➡️ Un altre').prop('disabled', false).toggle(true);
    overlay.css('display', 'flex');
    $('#btn-bundle-random-home').off('click').on('click', () => {
        overlay.hide();
        returnToMainMenuImmediate();
    });
    $('#btn-bundle-random-again').off('click').on('click', () => {
        overlay.hide();
        onAgain();
    });
}

/* ===================== CONTEXT DE L'ERRADA EN EXERCICIS =====================
   Quan un exercici prové d'una errada real de l'usuari (savedErrors o errors de
   la partida acabada), mostrem QUÈ va jugar, QUAN i QUÈ va costar, amb la
   jugada errònia marcada al tauler. Així l'exercici és "rectifica la teva
   errada", no un genèric "troba la millor jugada". */

let currentErrorContext = null;
let errorReplayTimer = null;

const ERROR_SEVERITY_INFO = {
    low: { phrase: "una imprecisió que va deixar escapar una opció millor" },
    med: { phrase: "una errada que et va costar part de l'avantatge" },
    high: { phrase: "una errada greu que va canviar el signe de la partida" }
};

function uciToSanForFen(fen, uci) {
    if (!fen || !uci || String(uci).length < 4) return null;
    try {
        const probe = new Chess(fen);
        const mv = probe.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : 'q' });
        return mv ? mv.san : null;
    } catch (e) { return null; }
}

function findBundleErrorRecord(fen) {
    if (!fen) return null;
    if (currentMatchError && currentMatchError.fen === fen && currentMatchError.playerMove) return currentMatchError;
    const saved = savedErrors.find(e => e.fen === fen && e.playerMove);
    if (saved) return saved;
    const inGame = (currentGameErrors || []).find(e => e.fen === fen && e.playerMove);
    return inGame || null;
}

function highlightErrorMove() {
    if (!currentErrorContext) return;
    $(`#myBoard .square-${currentErrorContext.from}`).addClass('square-error-played');
    const toSquare = $(`#myBoard .square-${currentErrorContext.to}`);
    toSquare.addClass('square-error-played');
    if (toSquare.length && !toSquare.find('.error-move-cross').length) {
        toSquare.css('position', 'relative').append('<div class="error-move-cross">✗</div>');
    }
}

function clearErrorMoveHighlights() {
    $('#myBoard .square-error-played').removeClass('square-error-played');
    $('#myBoard .error-move-cross').remove();
}

// Mostra o amaga el bàner segons el mode i l'origen de la posició. Es crida a startGame.
function renderBundleErrorContext() {
    const banner = $('#error-context-banner');
    if (!banner.length) return;
    if (errorReplayTimer) { clearTimeout(errorReplayTimer); errorReplayTimer = null; }
    clearErrorMoveHighlights();
    currentErrorContext = null;
    if (!blunderMode || !currentBundleFen) { banner.hide(); return; }
    const record = findBundleErrorRecord(currentBundleFen);
    const san = record ? uciToSanForFen(currentBundleFen, record.playerMove) : null;
    if (!san) { banner.hide(); return; }

    currentErrorContext = {
        from: record.playerMove.slice(0, 2),
        to: record.playerMove.slice(2, 4),
        san
    };
    const sev = ERROR_SEVERITY_INFO[record.severity] || ERROR_SEVERITY_INFO.med;
    const intro = record.date
        ? `El ${record.date} aquí vas jugar `
        : (isMatchErrorReviewSession ? 'En aquesta partida aquí has jugat ' : 'Aquí vas jugar ');

    const motive = record.bestMove
        ? analyzeTacticalMotive(currentBundleFen, record.bestMove, record.bestMovePv || [])
        : null;

    const textEl = $('#error-context-text').empty();
    textEl.append($('<span class="error-context-date"></span>').text('❌ '));
    textEl.append($('<span></span>').text(intro));
    textEl.append($('<strong></strong>').text(`${san}?`));
    textEl.append($('<span></span>').text(`, ${sev.phrase}.`));
    if (motive && motive.text) {
        textEl.append($('<span></span>').text(` El que se't va escapar: ${motive.text}.`));
    }
    textEl.append($('<span></span>').text(" Ara rectifica: juga el que hauries d'haver jugat."));

    $('#btn-error-replay').show().off('click').on('click', previewErrorMove);
    banner.css('display', 'flex');
    // El tauler es crea de forma asíncrona; marquem les caselles quan ja existeix
    setTimeout(highlightErrorMove, 150);
}

// Reprodueix visualment la jugada errònia sobre el tauler i torna a la posició inicial.
function previewErrorMove() {
    if (!currentErrorContext || !board || errorReplayTimer) return;
    try { board.move(`${currentErrorContext.from}-${currentErrorContext.to}`); } catch (e) { return; }
    errorReplayTimer = setTimeout(() => {
        errorReplayTimer = null;
        try { board.position(game.fen()); } catch (e) {}
        highlightErrorMove();
    }, 1300);
}

// Quan l'usuari comença a resoldre, retirem les marques perquè no facin nosa.
function onErrorContextPlayerMoved() {
    if (!currentErrorContext) return;
    if (errorReplayTimer) { clearTimeout(errorReplayTimer); errorReplayTimer = null; }
    clearErrorMoveHighlights();
    $('#btn-error-replay').hide();
}

// PWA Install functionality
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $('#install-banner').addClass('show');
});

$('#btn-install').on('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Resultat instal·lació: ${outcome}`);
        deferredPrompt = null;
        $('#install-banner').removeClass('show');
    }
});

$('#btn-dismiss-install').on('click', () => {
    $('#install-banner').removeClass('show');
});

// X de les finestres d'èxit: tanca l'overlay per poder veure la posició final
// de l'exercici al tauler. Responem també a touchend/pointerup perquè en mòbil
// el click pot quedar suprimit pels gestors tàctils del tauler; el timestamp
// evita el doble dispar (touchend + click sintètic).
let overlayCloseLastTs = 0;
$(document).on('click touchend pointerup', '.overlay-close-x', function (e) {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - overlayCloseLastTs < 400) return;
    overlayCloseLastTs = now;
    $(this).closest('.bundle-success-overlay').hide();
});

// Inicialització
/* ===================== REBOST D'EXERCICIS (pre-generació en segon pla) ===================== */
// Manté sempre uns quants exercicis del lot (tàctiques, correccions d'errades,
// errades d'obertura i repte diari) ja analitzats per Stockfish perquè comencin
// a l'instant, sense esperes ni errades de preparació. Les seqüències es desen a
// localStorage i només es calculen quan el motor està lliure (pantalles de menú).
const PREPARED_SEQ_STORAGE_KEY = 'chess_preparedSequences';
const PREPARED_SEQ_TARGET = 3;            // exercicis a punt per categoria
const PREPARED_SEQ_MAX = 20;              // límit total d'entrades al rebost
const PREPARED_SEQ_TTL_MS = 7 * 86400000; // caducitat d'una seqüència preparada
let preparedSequences = {};               // fen -> { seq, ts }
let backgroundPrepPromise = null;
let backgroundPrepCurrentFen = null;
let backgroundPrepAbortRequested = false;
let backgroundPrepProtected = false;      // no interrompre: és l'exercici que vol l'usuari

function savePreparedSequences() {
    try {
        localStorage.setItem(PREPARED_SEQ_STORAGE_KEY, JSON.stringify(preparedSequences));
    } catch (e) {
        console.warn('[PrepBG] No s\'ha pogut desar el rebost d\'exercicis:', e);
        preparedSequences = {};
        try { localStorage.removeItem(PREPARED_SEQ_STORAGE_KEY); } catch (e2) {}
    }
}

function loadPreparedSequences() {
    try {
        const raw = localStorage.getItem(PREPARED_SEQ_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;
        const now = Date.now();
        Object.keys(parsed).forEach(fen => {
            const entry = parsed[fen];
            const seq = entry && entry.seq;
            if (seq && seq.initialFen === fen && seq.step1 && seq.step2
                && Array.isArray(seq.fullSequence) && seq.fullSequence.length >= 3
                && now - (entry.ts || 0) <= PREPARED_SEQ_TTL_MS) {
                preparedSequences[fen] = entry;
            }
        });
    } catch (e) {
        console.warn('[PrepBG] Rebost corrupte; es descarta:', e);
        preparedSequences = {};
    }
}

function prunePreparedSequences() {
    const now = Date.now();
    let changed = false;
    Object.keys(preparedSequences).forEach(fen => {
        if (now - (preparedSequences[fen].ts || 0) > PREPARED_SEQ_TTL_MS) {
            delete preparedSequences[fen];
            changed = true;
        }
    });
    const fens = Object.keys(preparedSequences);
    if (fens.length > PREPARED_SEQ_MAX) {
        fens.sort((a, b) => (preparedSequences[a].ts || 0) - (preparedSequences[b].ts || 0));
        fens.slice(0, fens.length - PREPARED_SEQ_MAX).forEach(fen => { delete preparedSequences[fen]; });
        changed = true;
    }
    if (changed) savePreparedSequences();
}

// Treu del rebost la seqüència preparada per aquest FEN (si hi és) i la consumeix.
function takePreparedSequence(fen) {
    const entry = preparedSequences[fen];
    if (!entry || !entry.seq || entry.seq.initialFen !== fen) return null;
    delete preparedSequences[fen];
    savePreparedSequences();
    return entry.seq;
}

// Tria aleatòria que prefereix elements amb la seqüència ja preparada.
function pickPreferPrepared(items, fenOf = (x) => x) {
    if (!items || !items.length) return null;
    const ready = items.filter(it => preparedSequences[fenOf(it)]);
    const pool = ready.length ? ready : items;
    return pool[Math.floor(Math.random() * pool.length)];
}

// Mostra estable: primer els FEN ja preparats (per no refer feina), després
// aleatoris nous fins a `count`.
function samplePreferPrepared(fens, count) {
    const unique = Array.from(new Set((fens || []).filter(Boolean)));
    const prepared = unique.filter(f => preparedSequences[f]);
    const rest = unique.filter(f => !preparedSequences[f]);
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return prepared.concat(rest).slice(0, count);
}

// FENs que volem tenir sempre a punt, per ordre de prioritat.
function getBackgroundPrepCandidates() {
    const out = [];
    const seen = {};
    const add = (fen) => { if (fen && !seen[fen]) { seen[fen] = true; out.push(fen); } };
    try { ensureDailyPuzzle(); } catch (e) {}
    if (dailyPuzzle && dailyPuzzle.fen && !dailyPuzzle.solved) add(dailyPuzzle.fen);
    samplePreferPrepared(TACTICS_BANK, PREPARED_SEQ_TARGET).forEach(add);
    getDueErrors().slice(0, PREPARED_SEQ_TARGET).forEach(e => add(e.fen));
    samplePreferPrepared(savedErrors.map(e => e.fen), PREPARED_SEQ_TARGET).forEach(add);
    samplePreferPrepared(getOpeningPhaseErrors().map(e => e.fen), PREPARED_SEQ_TARGET).forEach(add);
    return out;
}

// Només preparem en segon pla quan el motor segur que no fa cap altra feina:
// a les pantalles de menú/estadístiques/configuració i sense cap petició pendent.
function isIdleForBackgroundPrep() {
    const idleScreenVisible = $('#start-screen').is(':visible') || $('#stats-screen').is(':visible') || $('#settings-screen').is(':visible');
    if (!idleScreenVisible || $('#game-screen').hasClass('active')) return false;
    return !isEngineThinking && !pendingMoveEvaluation && !mateDrillPreparing &&
        !openingPracticeEngineThinking && !openingPracticeAnalysisPending &&
        !openingPracticeHintPending && !openingPreCalcPending && !stockfishRequestor;
}

// Demana aturar la preparació en segon pla perquè l'usuari necessita el motor.
// Si està preparant justament l'exercici demanat, la deixem acabar i es
// recollirà del rebost en lloc de refer-la.
function requestBackgroundPrepAbort(fenWanted = null) {
    if (!backgroundPrepPromise) return;
    if (fenWanted && backgroundPrepCurrentFen === fenWanted) {
        backgroundPrepProtected = true;
        return;
    }
    backgroundPrepAbortRequested = true;
    try { if (stockfish) stockfish.postMessage('stop'); } catch (e) {}
}

async function backgroundPrepTick() {
    try { refillHieroglyphicQueue(); } catch (e) {}
    if (backgroundPrepPromise) return;
    if (typeof isCalibrationActive === 'function' && isCalibrationActive()) return;
    if (!isIdleForBackgroundPrep()) return;
    prunePreparedSequences();
    const next = getBackgroundPrepCandidates().find(f => !preparedSequences[f]);
    if (!next) return;
    if (!ensureStockfish()) return;
    backgroundPrepAbortRequested = false;
    backgroundPrepProtected = false;
    backgroundPrepCurrentFen = next;
    backgroundPrepPromise = (async () => {
        try {
            const seq = await prepareBundleSequence(next, {
                silent: true,
                shouldAbort: () => backgroundPrepAbortRequested || (!backgroundPrepProtected && !isIdleForBackgroundPrep())
            });
            if (seq) {
                preparedSequences[next] = { seq, ts: Date.now() };
                prunePreparedSequences();
                savePreparedSequences();
                console.log('[PrepBG] Exercici a punt:', next);
            }
        } catch (e) {
            console.warn('[PrepBG] Error preparant en segon pla:', e);
        } finally {
            backgroundPrepCurrentFen = null;
            backgroundPrepProtected = false;
            backgroundPrepPromise = null;
        }
    })();
    await backgroundPrepPromise;
    // Si seguim en repòs i queda rebost per omplir, continua aviat
    if (!backgroundPrepAbortRequested) setTimeout(backgroundPrepTick, 1500);
}

$(document).ready(() => {
    updateDeviceType();
    loadStorage();
    if (!isCalibrationActive()) {
        syncEngineEloFromUser();
    }
    void ensureBackupDirHandle({ prompt: false, mode: 'readwrite' });
    applyFontSize(loadFontSize());
    history.replaceState({ screen: 'start-screen' }, '');
    applyEpaperMode(loadEpaperPreference(), { skipSave: true });
    applyDayMode(loadDayModePreference(), { skipSave: true });
    applyControlMode(loadControlMode(), { save: false, rebuild: false });
    applyBoardTheme(loadBoardTheme(), { skipSave: true });
    applyPieceTheme(loadPieceTheme(), { skipSave: true });
    applyLuckyMode(loadLuckyMode(), { skipSave: true, skipRoll: true });
    bundleAcceptMode = loadBundleAcceptMode();
    const bSel = document.getElementById('bundle-accept-select');
    if (bSel) bSel.value = bundleAcceptMode;
    pendingFreeTimeControl = 'none';
    const tcSel = document.getElementById('new-game-tc-select');
    if (tcSel) tcSel.value = pendingFreeTimeControl;
    generateDailyMissions(); checkStreak(); initCoachVoice(); ensureWeeklyPlan(); updateDisplay(); setupEvents();
    if (!window.__boardResizeBound) {
        window.__boardResizeBound = true;
        window.addEventListener('resize', () => { if (board) board.resize(); });
    }

    setInterval(() => {
        if (getToday() !== missionsDate) generateDailyMissions();
        if (weeklyPlan && weeklyPlan.day !== getPlanDayKey()) ensureWeeklyPlan();
    }, 60000);

    // Rebost d'exercicis: recupera les seqüències desades i comença a omplir-lo
    // en segon pla perquè els exercicis arrenquin sense espera.
    loadPreparedSequences();
    setTimeout(backgroundPrepTick, 3000);
    setInterval(backgroundPrepTick, 8000);
});
