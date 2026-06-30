/*
 * catalans.js — «Catalans contra Stockfish»
 * ----------------------------------------------------------------------------
 * Una partida d'escacs GLOBAL i COL·LECTIVA: tots els usuaris d'El Tauler juguen
 * la mateixa partida contra Stockfish. Quan toca moure als Catalans, cada usuari
 * fa el seu moviment al tauler (és el seu VOT). Passades 24 hores des de l'inici
 * del torn, es tanca la votació i es juga el moviment MÉS VOTAT; si hi ha empat
 * (p. ex. tothom ha votat un moviment diferent), s'agafa el que Stockfish
 * considera MILLOR d'entre els empatats. Després mou Stockfish.
 *
 * Inspirat en «Kaspàrov contra el Món» (1999), on Garri Kaspàrov es va enfrontar
 * a la resta del món, que decidia cada jugada per votació majoritària, amb un
 * ritme d'un moviment per dia.
 *
 * OBJECTIU: partida rere partida, calibrar la força de Stockfish per estimar
 * l'ELO COL·LECTIU dels Catalans. Stockfish comença a 1280 d'ELO i, segons el
 * resultat de cada partida, s'ajusta la seva força i l'estimació de l'ELO del
 * col·lectiu (model d'Elo estàndard).
 *
 * Arquitectura (sense backend; tot al navegador + Firestore):
 *   - Un únic document compartit a Firestore: eltauler_catalans/current.
 *   - Els vots viuen com a mapa dins del document (votes[uid] = { uci, san }).
 *   - El tancament del torn i la jugada de Stockfish els executa el PRIMER client
 *     que detecta que toca fer-ho, dins una TRANSACCIÓ protegida pel número de
 *     mitja-jugada (ply): així, encara que hi hagi molts dispositius alhora, la
 *     transició només passa una vegada.
 * ============================================================================
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  //  Constants
  // ---------------------------------------------------------------------------
  const COLLECTION = 'eltauler_catalans';
  const DOC_ID = 'current';
  const HISTORY_DOC_ID = 'history';
  const CUSTOMS_DOC_ID = 'customs';      // registre de partides col·lectives pròpies

  const TURN_MS = 24 * 60 * 60 * 1000;   // 24 h perquè votin els Catalans
  const NEXT_GAME_MS = 24 * 60 * 60 * 1000; // 24 h entre el final d'una partida i la següent
  const START_SF_ELO = 1350;             // Stockfish comença aquí
  // Terra real de força del binari inclòs: per sota d'aquest valor el motor no
  // pot jugar més fluix amb UCI_Elo, així que passem a mode ROC (debilitació via
  // MultiPV + profunditat reduïda), igual que fa app.js per a usuaris febles.
  const ENGINE_FLOOR = 1350;             // mínim ELO real del motor; per sota → mode ROC
  const STRENGTH_MIN = 200;              // ROC mínim (mode feble) per a després d'una derrota
  const STRENGTH_MAX = 2850;             // UCI_Elo màxim del binari
  // Progressió de la força de Stockfish entre partides:
  //  · victòria/taules de l'exèrcit → Stockfish una mica més fort.
  //  · derrota → Stockfish baixa al ROC dels Catalans (com de feble han jugat),
  //    de manera que la propera partida s'ajusta al nivell real de l'exèrcit.
  const SF_WIN_STEP = 40;
  const SF_DRAW_STEP = 10;
  const ENGINE_MOVETIME_MS = 1500;       // temps de càlcul de la jugada de Stockfish
  const TIEBREAK_DEPTH = 12;             // profunditat per triar el millor entre empatats
  const ANALYSIS_DEPTH = 12;             // profunditat per mesurar la qualitat de joc dels Catalans
  const BLUNDER_CP = 200;                // pèrdua (centipeons) que compta com a blunder
  const BLUNDER_ROC_PENALTY = 35;        // ROC que es resta per cada blunder de l'equip

  // Indica si una força donada s'ha d'interpretar com a ROC (mode feble) o ELO.
  function isRocMode(strength) { return (strength || START_SF_ELO) < ENGINE_FLOOR; }
  function clampStrength(v) {
    return Math.max(STRENGTH_MIN, Math.min(STRENGTH_MAX, Math.round(v || START_SF_ELO)));
  }

  // ---------------------------------------------------------------------------
  //  Configuració de partida (global per defecte o personalitzada)
  // ---------------------------------------------------------------------------
  function defaultConfig() {
    return {
      custom: false,
      id: null,
      docId: DOC_ID,
      historyDocId: HISTORY_DOC_ID,
      teamName: 'Catalans',
      startElo: START_SF_ELO,
      createdByUid: null
    };
  }
  // Configuració d'una partida pròpia a partir de la seva entrada al registre.
  function configFromEntry(entry) {
    return {
      custom: true,
      id: entry.id,
      docId: 'c_' + entry.id,
      historyDocId: 'c_' + entry.id + '_h',
      teamName: entry.name || 'El meu equip',
      startElo: clampStrength(entry.startElo || START_SF_ELO),
      createdByUid: entry.createdByUid || null
    };
  }
  // Força inicial de Stockfish per a la partida oberta (ELO triat en personalitzades).
  function startStrength() { return clampStrength(config.startElo || START_SF_ELO); }
  function isCustom() { return !!config.custom; }
  // Nom de l'equip humà. En personalitzades, prioritza el del document (es pot
  // editar en viu) i recau en la configuració mentre no hi ha estat carregat.
  function teamName() {
    if (config.custom) return (state && state.teamName) || config.teamName || 'El meu equip';
    return 'Catalans';
  }

  // Força EFECTIVA de Stockfish per a un estat de partida: la PRIMERA partida és
  // sempre 1350 (ELO d'inici), encara que el document vingui d'un model antic; a
  // partir de la segona, la força ve donada pel model (pot ser ROC < 1350).
  function effectiveSfElo(d) {
    const s = d || state;
    if (!s) return START_SF_ELO;
    // Partides pròpies: la força ve sempre del document (l'ELO triat a la creació,
    // editable en viu). No s'hi aplica el «sempre 1350 a la primera partida».
    if (s.custom) return clampStrength(s.sfElo || s.startElo || START_SF_ELO);
    if ((s.gameNumber || 1) <= 1) return START_SF_ELO;
    return clampStrength(s.sfElo || START_SF_ELO);
  }

  // Corba ROC → pèrdua humana tolerable (centipeons). Per sota del terra del
  // motor, és la finestra de selecció MultiPV que crea nivells ROC diferents.
  // Mateixos punts d'ancoratge que app.js (getHumanLikeMaxCpLoss).
  function humanLikeMaxCpLoss(roc) {
    return interpolatePoints(roc, [[STRENGTH_MIN, 900], [600, 700], [1000, 350], [1230, 220], [ENGINE_FLOOR, 80]]);
  }
  // Invers: pèrdua mitjana de l'equip → ROC equivalent (calibratge per derrota).
  function rocFromAvgCpLoss(avgCpLoss) {
    return interpolatePoints(avgCpLoss, [[80, ENGINE_FLOOR], [220, 1230], [350, 1000], [700, 600], [900, STRENGTH_MIN]]);
  }
  function interpolatePoints(x, pts) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (x <= b[0]) {
        const t = Math.max(0, Math.min(1, (x - a[0]) / Math.max(1, b[0] - a[0])));
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return pts[pts.length - 1][1];
  }

  // ROC de la propera partida a partir dels errors i blunders de l'equip català.
  function rocFromTeamPlay(stats) {
    if (!stats || !stats.moves) return ENGINE_FLOOR - 100;
    const avg = stats.totalCpLoss / stats.moves;
    let roc = rocFromAvgCpLoss(avg) - (stats.blunders || 0) * BLUNDER_ROC_PENALTY;
    return Math.max(STRENGTH_MIN, Math.min(ENGINE_FLOOR, Math.round(roc)));
  }

  // Profunditat de cerca segons la força (reutilitza el nucli si està disponible).
  function searchDepthFor(strength) {
    if (typeof window !== 'undefined' && window.ElTaulerCore && ElTaulerCore.eloToSearchDepth) {
      return ElTaulerCore.eloToSearchDepth(strength, ENGINE_FLOOR, STRENGTH_MAX);
    }
    return strength >= ENGINE_FLOOR ? 14 : Math.max(2, Math.round(2 + (strength / ENGINE_FLOOR) * 10));
  }

  // Jitter aleatori abans d'executar transicions, per repartir la càrrega entre
  // clients (el guard per ply evita duplicats igualment).
  const JITTER_MS = 4000;

  // ---------------------------------------------------------------------------
  //  Estat del mòdul
  // ---------------------------------------------------------------------------
  let db = null;
  let docRef = null;
  let unsub = null;
  // Configuració de la partida que hi ha oberta a la pantalla. Per defecte és la
  // partida global «Catalans vs Stockfish»; en mode personalitzat (custom) apunta
  // a un altre document de la mateixa col·lecció amb el nom d'equip i l'ELO triats.
  let config = defaultConfig();
  let customsUnsub = null;   // subscripció al registre de partides pròpies
  let customsList = [];      // partides pròpies (per pintar els bàners)
  let state = null;          // últim snapshot del document
  let board = null;          // instància de chessboard.js
  let localChess = null;     // chess.js amb la posició actual (per validar vots)
  let myVoteUci = null;      // el meu vot actual (uci) en aquest torn
  let selectedSquare = null; // casella seleccionada en mode "toc"
  let countdownTimer = null;
  let resolving = false;     // evita reentrades mentre resolem un torn localment
  let previewActive = false; // s'està revisant una jugada/proposta al tauler
  let previewPly = null;     // jugada de la transcripció que es revisa (si escau)
  let previewUci = null;     // jugada proposada que es revisa (si escau)
  let lastPlySeen = -1;      // per detectar quan avança la partida
  let historyUnsub = null;   // subscripció a l'historial de partides
  let historyView = [];      // partides de l'historial ordenades (recent primer)
  let replayBoard = null;    // tauler fix per reproduir una partida de l'historial
  let replay = null;         // { moves, idx, timer, playing }
  let opened = false;        // la pantalla s'ha obert alguna vegada
  let subscribed = false;    // la subscripció en temps real està activa i sense errors
  let pendingHistory = null; // resum a desar a l'historial després de confirmar la transacció

  // ---------------------------------------------------------------------------
  //  Utilitats Firebase
  // ---------------------------------------------------------------------------
  function firebaseAvailable() {
    return typeof firebase !== 'undefined' && firebase &&
           firebase.apps && firebase.apps.length > 0 &&
           typeof firebase.firestore === 'function';
  }
  function getDb() {
    if (db) return db;
    if (!firebaseAvailable()) return null;
    try { db = firebase.firestore(); } catch (e) { return null; }
    return db;
  }
  function currentUser() {
    try { return firebase.auth().currentUser; } catch (e) { return null; }
  }
  function userName(u) {
    // Prioritza el nom d'usuari triat a Configuració; si no, el de Google.
    try {
      const custom = (typeof window.getUsername === 'function') ? window.getUsername() : '';
      if (custom) return custom;
    } catch (e) {}
    if (!u) return 'Anònim';
    return u.displayName || (u.email ? u.email.split('@')[0] : 'Catalans');
  }

  // ---------------------------------------------------------------------------
  //  Motor d'escacs (Stockfish) — worker dedicat per no interferir amb app.js
  // ---------------------------------------------------------------------------
  const Engine = (function () {
    let worker = null;
    let ready = false;
    let busy = false;
    let onDone = null;       // callback quan arriba "bestmove"
    let cur = {};            // multipv index -> { move, score, idx }

    function ensure() {
      if (worker) return true;
      try {
        worker = new Worker('stockfish.js');
      } catch (e) {
        console.warn('[Catalans] no s\'ha pogut carregar Stockfish', e);
        worker = null;
        return false;
      }
      worker.onmessage = function (e) {
        const line = typeof e.data === 'string' ? e.data : (e.data && e.data.data) || '';
        handleLine(line);
      };
      worker.postMessage('uci');
      return true;
    }

    function parseScore(line) {
      const m = line.match(/score (cp|mate) (-?\d+)/);
      if (!m) return 0;
      if (m[1] === 'cp') return parseInt(m[2], 10);
      const n = parseInt(m[2], 10);
      return (n >= 0 ? 1 : -1) * (100000 - Math.abs(n));
    }

    function handleLine(line) {
      if (!line) return;
      if (line.indexOf('uciok') !== -1) { ready = true; return; }
      if (line.indexOf('info') === 0 && line.indexOf(' pv ') !== -1) {
        const mm = line.match(/multipv (\d+)/);
        const idx = mm ? parseInt(mm[1], 10) : 1;
        const pv = line.split(' pv ')[1];
        const move = pv ? pv.trim().split(/\s+/)[0] : null;
        if (move) cur[idx] = { move: move, score: parseScore(line), idx: idx };
        return;
      }
      if (line.indexOf('bestmove') === 0) {
        const parts = line.split(/\s+/);
        const best = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
        const lines = Object.keys(cur).map(function (k) { return cur[k]; }).sort(function (a, b) { return a.idx - b.idx; });
        const cb = onDone;
        onDone = null;
        busy = false;
        if (cb) cb({ best: best, lines: lines });
      }
    }

    function send(cmd) { if (worker) worker.postMessage(cmd); }

    // Cerca serialitzada. Resol amb { best, lines } on lines[i].score és des del
    // bàndol que mou (multipv 1 = millor). Serialitzat: una alhora.
    function go(opts) {
      return new Promise(function (resolve) {
        if (!ensure()) { resolve({ best: null, lines: [] }); return; }
        const run = function () {
          busy = true;
          cur = {};
          onDone = resolve;
          send('setoption name UCI_LimitStrength value ' + (opts.elo ? 'true' : 'false'));
          if (opts.elo) send('setoption name UCI_Elo value ' + Math.round(opts.elo));
          send('setoption name MultiPV value ' + (opts.multipv || 1));
          send('position fen ' + opts.fen);
          send(opts.depth ? ('go depth ' + opts.depth) : ('go movetime ' + (opts.movetime || ENGINE_MOVETIME_MS)));
        };
        const wait = function (n) {
          if (ready && !busy) return run();
          if (n <= 0) { busy = true; cur = {}; onDone = resolve; setTimeout(run, 50); return; }
          setTimeout(function () { wait(n - 1); }, 100);
        };
        wait(60);
      });
    }

    return {
      go: go,
      // Jugada de Stockfish a un UCI_Elo real (força >= terra del motor).
      move: function (fen, elo) {
        return go({ fen: fen, elo: elo, movetime: ENGINE_MOVETIME_MS }).then(function (r) { return r.best; });
      },
      // Jugada DEBILITADA en mode ROC (força < terra): tria entre diversos
      // candidats MultiPV un moviment amb una pèrdua "humana" propera al sostre
      // del nivell, amb profunditat reduïda. Així el motor juga realment més fluix.
      weakMove: function (fen, roc) {
        const depth = searchDepthFor(roc);
        const k = roc < 600 ? 8 : (roc < 1000 ? 6 : 5);
        const maxLoss = humanLikeMaxCpLoss(roc);
        return go({ fen: fen, depth: depth, multipv: k }).then(function (r) {
          if (!r.lines.length) return r.best;
          const bestScore = r.lines[0].score;
          const eligible = r.lines.filter(function (l) { return (bestScore - l.score) <= maxLoss; });
          const pool = eligible.length ? eligible : [r.lines[0]];
          return pool[Math.floor(Math.random() * pool.length)].move;
        });
      },
      // Anàlisi a plena força: { best, lines } (multipv configurable).
      analyze: function (fen, depth, multipv) {
        return go({ fen: fen, depth: depth, multipv: multipv || 1 });
      },
      // D'entre uns candidats (uci), el millor per al BLANC (els Catalans).
      pickBestForWhite: function (fen, candidates) {
        let chain = Promise.resolve();
        let best = candidates[0];
        let bestVal = -Infinity;
        candidates.forEach(function (uci) {
          chain = chain.then(function () {
            const childFen = applyUciToFen(fen, uci);
            if (!childFen) return;
            return go({ fen: childFen, depth: TIEBREAK_DEPTH, multipv: 1 }).then(function (r) {
              // El score és des del bàndol que mou DESPRÉS del moviment (negre):
              // el valor per al blanc és el negatiu.
              const sc = r.lines.length ? r.lines[0].score : 0;
              const whiteVal = -sc;
              if (whiteVal > bestVal) { bestVal = whiteVal; best = uci; }
            });
          });
        });
        return chain.then(function () { return best; });
      }
    };
  })();

  // Mesura la qualitat d'una jugada dels Catalans (blanc): pèrdua en centipeons
  // respecte la millor jugada i si és un blunder. Resol { cpLoss, blunder }.
  function evaluateTeamMove(fen, uci) {
    return Engine.analyze(fen, ANALYSIS_DEPTH, 12).then(function (r) {
      if (!r.lines.length) return { cpLoss: 0, blunder: false };
      const best = r.lines[0].score;           // millor, des del blanc (mou el blanc)
      let played = null;
      for (let i = 0; i < r.lines.length; i++) {
        if (r.lines[i].move === uci) { played = r.lines[i].score; break; }
      }
      if (played != null) {
        const cpLoss = Math.max(0, best - played);
        return { cpLoss: cpLoss, blunder: cpLoss >= BLUNDER_CP };
      }
      // La jugada votada no és al top-K: avalua la posició filla.
      const childFen = applyUciToFen(fen, uci);
      if (!childFen) return { cpLoss: 0, blunder: false };
      return Engine.analyze(childFen, ANALYSIS_DEPTH, 1).then(function (cr) {
        const childScore = cr.lines.length ? cr.lines[0].score : 0; // mou el negre
        const playedWhite = -childScore;
        const cpLoss = Math.max(0, best - playedWhite);
        return { cpLoss: cpLoss, blunder: cpLoss >= BLUNDER_CP };
      });
    });
  }

  // ---------------------------------------------------------------------------
  //  Helpers d'escacs (chess.js)
  // ---------------------------------------------------------------------------
  function newChess(fen) {
    try { return fen ? new Chess(fen) : new Chess(); } catch (e) { return new Chess(); }
  }
  function applyUciToFen(fen, uci) {
    const c = newChess(fen);
    const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || 'q' });
    return mv ? c.fen() : null;
  }
  function uciOf(moveObj) {
    return moveObj.from + moveObj.to + (moveObj.promotion || '');
  }

  // ---------------------------------------------------------------------------
  //  Document inicial / nova partida
  // ---------------------------------------------------------------------------
  function freshGameState(prev, cfg) {
    cfg = cfg || config;
    const c = newChess();
    const gameNumber = prev ? (prev.gameNumber || 1) + 1 : 1;
    const start = clampStrength(cfg.startElo || START_SF_ELO);
    const sfElo = prev ? clampStrength(prev.nextSfElo || prev.sfElo || start) : start;
    const now = Date.now();
    const st = {
      fen: c.fen(),
      movesSan: [],
      movesUci: [],
      ply: 0,
      phase: 'catalans',           // 'catalans' | 'stockfish' | 'finished'
      turnStartedAt: now,
      deadlineAt: now + TURN_MS,
      sfElo: sfElo,                // ELO de Stockfish en aquesta partida (>= 1350)
      gameNumber: gameNumber,
      result: null,
      lastMove: null,
      votes: {},
      catTeamStats: { moves: 0, totalCpLoss: 0, blunders: 0 }, // qualitat de joc de l'exèrcit
      lastGame: prev && prev.lastGame ? prev.lastGame : null,
      updatedAt: now
    };
    // Metadades de partida pròpia: viatgen amb el document perquè qualsevol client
    // (encara que obri l'enllaç compartit) sàpiga el nom de l'equip, l'ELO i qui
    // la va crear, sense dependre del registre.
    if (cfg.custom || (prev && prev.custom)) {
      st.custom = true;
      st.customId = (prev && prev.customId) || cfg.id || null;
      st.teamName = (prev && prev.teamName) || cfg.teamName || 'El meu equip';
      st.startElo = (prev && prev.startElo) || start;
      st.createdByUid = (prev && prev.createdByUid) || cfg.createdByUid || null;
    }
    return st;
  }

  // Nova força de Stockfish per a la propera partida segons el resultat.
  // En derrota, baixa al ROC dels Catalans (rocFromTeamPlay), mai més fort que
  // aquesta partida. En victòria/taules, puja una mica.
  function nextStockfishStrength(prevStrength, result, teamStats) {
    if (result === 'stockfish') {
      const catRoc = rocFromTeamPlay(teamStats);
      return clampStrength(Math.min(prevStrength, catRoc));
    }
    const step = result === 'catalans' ? SF_WIN_STEP : SF_DRAW_STEP;
    return clampStrength(prevStrength + step);
  }

  // ---------------------------------------------------------------------------
  //  Inicialització del document (crea'l si no existeix)
  // ---------------------------------------------------------------------------
  // Descriu un error de Firestore de manera accionable per a l'usuari.
  function describeFsError(err) {
    const code = err && err.code ? String(err.code) : '';
    if (code.indexOf('permission') !== -1) {
      return currentUser()
        ? 'Permís denegat per Firestore. Cal publicar les regles de la col·lecció «eltauler_catalans» (vegeu SINCRONITZACIO_FIREBASE.md).'
        : 'Per jugar la partida global cal iniciar sessió amb Google. Si l\'error persisteix, cal publicar les regles de Firestore.';
    }
    if (code.indexOf('unavailable') !== -1) return 'Sense connexió amb Firestore. Reintentant…';
    return 'Error de connexió amb la partida global' + (code ? ' (' + code + ')' : '') + '.';
  }

  function ensureDoc() {
    return docRef.get().then(function (snap) {
      if (snap.exists) return true;
      if (!currentUser()) {
        setStatus('Encara no hi ha cap partida en curs. Inicia sessió amb Google per començar-ne una.');
        return false;
      }
      return docRef.set(freshGameState(null, config)).then(function () { return true; });
    }).catch(function (e) {
      console.warn('[Catalans] ensureDoc', e);
      setStatus(describeFsError(e));
      return false;
    });
  }

  // ---------------------------------------------------------------------------
  //  Subscripció en temps real
  // ---------------------------------------------------------------------------
  function subscribe() {
    if (unsub) { unsub(); unsub = null; }
    unsub = docRef.onSnapshot(function (snap) {
      subscribed = true;
      if (!snap.exists) { ensureDoc(); return; }
      state = snap.data();
      onStateChanged();
    }, function (err) {
      subscribed = false;
      console.warn('[Catalans] onSnapshot', err);
      setStatus(describeFsError(err));
    });
    subscribeHistory();
  }

  // Subscripció a l'historial de partides acabades (lectura pública).
  function subscribeHistory() {
    if (historyUnsub || !db) return;
    try {
      const hRef = db.collection(COLLECTION).doc(config.historyDocId);
      historyUnsub = hRef.onSnapshot(function (snap) {
        const data = snap.exists ? snap.data() : null;
        const games = (data && Array.isArray(data.games)) ? data.games : [];
        historyView = games.slice().sort(function (a, b) { return (b.date || 0) - (a.date || 0); });
        renderHistory();
      }, function () {});
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  //  Reacció a un nou estat
  // ---------------------------------------------------------------------------
  function onStateChanged() {
    if (!state) return;

    // Si la partida ha avançat (nova jugada), surt de qualsevol revisió per
    // tornar a la posició real abans de redibuixar.
    if (state.ply !== lastPlySeen) {
      lastPlySeen = state.ply;
      if (previewActive) exitPreview();
    }

    // Reconstrueix la posició local i el tauler.
    localChess = newChess(state.fen);
    // El nom de l'equip i el permís d'edició poden venir del document (editables
    // en viu): refresca capçalera, «Com funciona» i botó d'edició a cada canvi.
    personalizeUi();
    renderBoard();
    renderInfo();
    renderVotes();
    updateMyVoteFromState();
    startCountdown();

    // Comprova si toca que aquest client faci avançar la partida.
    maybeDriveTransition();
  }

  function updateMyVoteFromState() {
    const u = currentUser();
    if (u && state.votes && state.votes[u.uid] && state.votes[u.uid].ply === state.ply) {
      myVoteUci = state.votes[u.uid].uci;
    } else {
      myVoteUci = null;
    }
  }

  // ---------------------------------------------------------------------------
  //  Motor de transicions (qualsevol client el pot conduir; el guard per ply
  //  evita que s'executi dues vegades).
  // ---------------------------------------------------------------------------
  function maybeDriveTransition() {
    if (resolving || !state) return;
    const now = Date.now();

    if (state.phase === 'catalans') {
      // Tanca el torn si ha passat el temps I hi ha almenys un vot.
      const votes = state.votes || {};
      const hasVotes = Object.keys(votes).some(function (k) { return votes[k] && votes[k].ply === state.ply; });
      if (now >= (state.deadlineAt || 0) && hasVotes) {
        scheduleDrive(function () { return resolveCatalansTurn(); });
      }
    } else if (state.phase === 'stockfish') {
      // Stockfish ha de moure: el fem ara (sense esperar).
      scheduleDrive(function () { return playStockfishMove(); });
    } else if (state.phase === 'finished') {
      // Mostra el resultat una estona i després comença una nova partida.
      if (now >= (state.deadlineAt || 0)) {
        scheduleDrive(function () { return startNextGame(); });
      }
    }
  }

  function scheduleDrive(fn) {
    if (resolving) return;
    resolving = true;
    const jitter = Math.floor(Math.random() * JITTER_MS);
    setTimeout(function () {
      Promise.resolve().then(fn).catch(function (e) {
        console.warn('[Catalans] transició', e);
      }).then(function () {
        resolving = false;
        // Una transició pot deixar-ne una altra pendent (p. ex. després
        // d'aplicar la jugada dels Catalans toca moure Stockfish). Reavalua
        // amb l'últim estat un cop alliberat el bloqueig.
        maybeDriveTransition();
      });
    }, jitter);
  }

  // Determina la jugada guanyadora del torn dels Catalans.
  function computeWinningMove() {
    const votes = state.votes || {};
    const counts = {};       // uci -> nombre de vots
    Object.keys(votes).forEach(function (uid) {
      const v = votes[uid];
      if (!v || v.ply !== state.ply || !v.uci) return;
      counts[v.uci] = (counts[v.uci] || 0) + 1;
    });
    const ucis = Object.keys(counts);
    if (ucis.length === 0) return Promise.resolve(null);

    let max = 0;
    ucis.forEach(function (u) { if (counts[u] > max) max = counts[u]; });
    const tied = ucis.filter(function (u) { return counts[u] === max; });

    if (tied.length === 1) return Promise.resolve(tied[0]);
    // Empat: el millor d'entre els empatats segons Stockfish (blanc = Catalans).
    setStatus('Empat de vots: Stockfish desempata triant el millor moviment…');
    return Engine.pickBestForWhite(state.fen, tied);
  }

  // Aplica la jugada guanyadora i passa el torn a Stockfish (o acaba la partida).
  function resolveCatalansTurn() {
    const expectedPly = state.ply;
    return computeWinningMove().then(function (winnerUci) {
      if (!winnerUci) return;
      // Mesura la qualitat de la jugada de l'equip (pèrdua/blunder) per al calibratge ROC.
      return evaluateTeamMove(state.fen, winnerUci).then(function (quality) {
        pendingHistory = null;
        return db.runTransaction(function (tx) {
          return tx.get(docRef).then(function (snap) {
            const d = snap.data();
            if (!d || d.phase !== 'catalans' || d.ply !== expectedPly) return; // ja resolt
            if (Date.now() < (d.deadlineAt || 0)) return;                       // encara hi ha temps
            applyMoveInTransaction(tx, d, winnerUci, 'catalans', quality);
          });
        }).then(flushPendingHistory);
      });
    });
  }

  function flushPendingHistory() {
    if (pendingHistory) { appendHistory(pendingHistory); pendingHistory = null; }
  }

  // Stockfish calcula i juga la seva resposta.
  function playStockfishMove() {
    const expectedPly = state.ply;
    const fen = state.fen;
    const sfElo = effectiveSfElo(state);
    setStatus(isRocMode(sfElo) ? 'Stockfish està pensant… (mode ROC ' + Math.round(sfElo) + ')' : 'Stockfish està pensant…');
    // Per sota del terra del motor, juga en mode ROC (debilitat); si no, UCI_Elo.
    const movePromise = isRocMode(sfElo) ? Engine.weakMove(fen, sfElo) : Engine.move(fen, sfElo);
    return movePromise.then(function (uci) {
      if (!uci) {
        // Sense jugada (mat/ofegat ja detectat) — assegura coherència.
        return;
      }
      pendingHistory = null;
      return db.runTransaction(function (tx) {
        return tx.get(docRef).then(function (snap) {
          const d = snap.data();
          if (!d || d.phase !== 'stockfish' || d.ply !== expectedPly) return;
          applyMoveInTransaction(tx, d, uci, 'stockfish');
        });
      }).then(flushPendingHistory);
    });
  }

  // Aplica un moviment (uci) dins d'una transacció, gestionant final de partida.
  function applyMoveInTransaction(tx, d, uci, mover, quality) {
    const c = newChess(d.fen);
    const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || 'q' });
    if (!mv) return; // jugada il·legal: no facis res

    const now = Date.now();
    const movesSan = (d.movesSan || []).concat(mv.san);
    const movesUci = (d.movesUci || []).concat(uciOf(mv));
    const lastMove = { uci: uciOf(mv), san: mv.san, by: mover, from: mv.from, to: mv.to };

    // Acumula la qualitat de joc de l'equip català (només jugades dels Catalans).
    const prevStats = d.catTeamStats || { moves: 0, totalCpLoss: 0, blunders: 0 };
    const teamStats = (mover === 'catalans' && quality) ? {
      moves: (prevStats.moves || 0) + 1,
      totalCpLoss: (prevStats.totalCpLoss || 0) + (quality.cpLoss || 0),
      blunders: (prevStats.blunders || 0) + (quality.blunder ? 1 : 0)
    } : prevStats;

    const base = {
      fen: c.fen(),
      movesSan: movesSan,
      movesUci: movesUci,
      ply: (d.ply || 0) + 1,
      lastMove: lastMove,
      votes: {},                 // neteja els vots per al proper torn
      catTeamStats: teamStats,
      updatedAt: now
    };

    if (c.game_over()) {
      // Resultat des del punt de vista dels Catalans (blanc).
      let result, S;
      if (c.in_checkmate()) {
        // Qui acaba de moure ha fet mat.
        if (mover === 'catalans') { result = 'catalans'; S = 1; }
        else { result = 'stockfish'; S = 0; }
      } else {
        result = 'draw'; S = 0.5; // taules (ofegat, material insuficient, 50 moviments, triple repetició)
      }

      const prevStrength = clampStrength(effectiveSfElo(d));
      const avgCpLoss = teamStats.moves ? Math.round(teamStats.totalCpLoss / teamStats.moves) : null;
      // ELO/ROC de l'exèrcit: estimació de com de bé han jugat els Catalans (segons
      // la pèrdua mitjana i els blunders). NOMÉS es coneix al FINAL de la partida i
      // es mostra a l'anotació posterior. Si l'exèrcit perd, Stockfish jugarà la
      // propera partida amb aquest mateix ROC; si guanya/empata, Stockfish puja.
      const catElo = rocFromTeamPlay(teamStats);
      const nextStrength = nextStockfishStrength(prevStrength, result, teamStats);

      const summary = {
        gameNumber: d.gameNumber || 1,
        result: result,
        sfElo: prevStrength,         // força de Stockfish a què s'ha enfrontat l'exèrcit
        rocMode: isRocMode(prevStrength),
        catElo: catElo,              // ELO/ROC estimat de l'exèrcit (calculat al final)
        nextStrength: nextStrength,  // força de Stockfish la propera partida
        nextRocMode: isRocMode(nextStrength),
        avgCpLoss: avgCpLoss,
        blunders: teamStats.blunders || 0,
        teamMoves: teamStats.moves || 0,
        movesSan: movesSan,
        date: now
      };
      tx.update(docRef, Object.assign(base, {
        phase: 'finished',
        result: result,
        nextSfElo: nextStrength,     // la propera partida: Stockfish juga a aquest ELO (>= 1350)
        deadlineAt: now + NEXT_GAME_MS,
        lastGame: summary
      }));
      pendingHistory = summary;  // es desa a l'historial només si la transacció es confirma
    } else if (mover === 'catalans') {
      // Toca Stockfish.
      tx.update(docRef, Object.assign(base, { phase: 'stockfish' }));
    } else {
      // Toca un nou torn dels Catalans: arrenca el rellotge de 24 h.
      tx.update(docRef, Object.assign(base, {
        phase: 'catalans',
        turnStartedAt: now,
        deadlineAt: now + TURN_MS
      }));
    }
  }

  // Comença la propera partida de la sèrie de calibratge.
  function startNextGame() {
    const expectedGame = state.gameNumber;
    return db.runTransaction(function (tx) {
      return tx.get(docRef).then(function (snap) {
        const d = snap.data();
        if (!d || d.phase !== 'finished' || d.gameNumber !== expectedGame) return;
        if (Date.now() < (d.deadlineAt || 0)) return;
        tx.set(docRef, freshGameState(d, config));
      });
    });
  }

  // Desa un resum de partida a l'historial (millor esforç; no és crític).
  function appendHistory(summary) {
    try {
      const hRef = db.collection(COLLECTION).doc(config.historyDocId);
      hRef.set({
        games: firebase.firestore.FieldValue.arrayUnion(summary),
        updatedAt: Date.now()
      }, { merge: true }).catch(function () {});
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  //  Votació de l'usuari
  // ---------------------------------------------------------------------------
  const MSG_MAX = 180;          // límit de caràcters del missatge d'explicació
  let pendingProposal = null;   // { uci, san } mentre la finestra de missatge és oberta

  // ELO/ROC actual del jugador (mateix valor que mostra l'app a #current-elo).
  function userElo() {
    try {
      if (typeof window.getUserElo === 'function') {
        const v = window.getUserElo();
        if (typeof v === 'number' && isFinite(v)) return v;
      }
    } catch (e) {}
    try {
      const raw = parseInt(localStorage.getItem('chess_userELO'), 10);
      if (!isNaN(raw)) return raw;
    } catch (e) {}
    return null;
  }

  // Un moviment és NOU en aquest torn si encara ningú no l'ha proposat (votat).
  function isNewMoveThisTurn(uci) {
    if (!state) return true;
    const votes = state.votes || {};
    const ply = state.ply;
    return !Object.keys(votes).some(function (k) {
      const v = votes[k];
      return v && v.ply === ply && v.uci === uci;
    });
  }

  // Punt d'entrada des del tauler: si l'usuari és el PRIMER a proposar aquest
  // moviment, se li obre la finestra per explicar la decisió; si no, vota directe.
  function proposeVote(uci, san) {
    const u = currentUser();
    if (!u) { promptSignIn(); return; }
    if (!state || state.phase !== 'catalans') return;
    if (isNewMoveThisTurn(uci)) {
      openMessageModal(uci, san);
    } else {
      castVote(uci, san);
    }
  }

  function openMessageModal(uci, san) {
    pendingProposal = { uci: uci, san: san };
    $('#catalans-msg-move').text('Moviment proposat: ' + san);
    const ta = $('#catalans-msg-text');
    ta.val('');
    $('#catalans-msg-count').text('0');
    $('#catalans-msg-modal').css('display', 'flex');
    setTimeout(function () { try { ta.trigger('focus'); } catch (e) {} }, 30);
  }

  function closeMessageModal() {
    pendingProposal = null;
    $('#catalans-msg-modal').hide();
  }

  // Confirma el vot del primer proposant amb (o sense) missatge d'explicació.
  function confirmMessageModal() {
    if (!pendingProposal) { closeMessageModal(); return; }
    const msg = String($('#catalans-msg-text').val() || '').trim().slice(0, MSG_MAX);
    const p = pendingProposal;
    closeMessageModal();
    castVote(p.uci, p.san, msg);
  }

  function castVote(uci, san, msg) {
    const u = currentUser();
    if (!u) { promptSignIn(); return; }
    if (!state || state.phase !== 'catalans') return;
    const ply = state.ply;
    // Si l'usuari reafirma el MATEIX moviment d'aquest torn, conserva el moment de
    // la primera proposta (per a l'ordre d'autoria) i el seu missatge si no n'escriu un de nou.
    const prev = state.votes && state.votes[u.uid];
    const sameMove = !!(prev && prev.ply === ply && prev.uci === uci);
    const vote = {
      uci: uci, san: san, name: userName(u), ply: ply,
      at: (sameMove && typeof prev.at === 'number') ? prev.at : Date.now()
    };
    const elo = userElo();
    if (typeof elo === 'number' && isFinite(elo)) vote.elo = Math.round(elo);
    let text = (typeof msg === 'string') ? msg.trim() : '';
    if (!text && sameMove && typeof prev.msg === 'string') text = prev.msg;
    if (text) vote.msg = text.slice(0, MSG_MAX);
    const update = {};
    update['votes.' + u.uid] = vote;
    update.updatedAt = Date.now();
    docRef.update(update).then(function () {
      myVoteUci = uci;
      setStatus('El teu vot: ' + san + '. El pots canviar fins que acabi el torn.');
      renderVotes();
      renderBoard();
    }).catch(function (e) {
      console.warn('[Catalans] vot', e);
      setStatus('No s\'ha pogut registrar el vot.');
    });
  }

  function promptSignIn() {
    setStatus('Inicia sessió amb Google per votar.');
    // Recorda que volem tornar a Catalans en completar l'inici de sessió (útil quan
    // a mòbil la redirecció recarrega l'app i torna a la pantalla d'inici).
    try { localStorage.setItem('eltauler_cloud_returnToCatalans', '1'); } catch (e) {}
    if (window.CloudSync && typeof window.CloudSync.signIn === 'function') {
      window.CloudSync.signIn();
    }
  }

  // ---------------------------------------------------------------------------
  //  Interacció amb el tauler (arrossegar + tocar)
  // ---------------------------------------------------------------------------
  function isCatalansTurn() {
    return state && state.phase === 'catalans';
  }
  function canIPlay() {
    return isCatalansTurn() && !!currentUser() && !previewActive;
  }

  function onDragStart(source, piece) {
    if (!canIPlay()) return false;
    if (localChess.game_over()) return false;
    // Els Catalans són blancs: només peces blanques.
    if (piece.search(/^b/) !== -1) return false;
    if (localChess.turn() !== 'w') return false;
    return true;
  }

  function onDrop(source, target) {
    if (!canIPlay()) return 'snapback';
    const legal = legalMove(source, target);
    if (!legal) return 'snapback';
    proposeVote(uciOf(legal), legal.san);
    // El tauler torna a la posició real; el vot es mostra ressaltat.
    return 'snapback';
  }

  function onSnapEnd() {
    if (board && state) board.position(state.fen, false);
  }

  function legalMove(from, to) {
    const c = newChess(state.fen);
    // Detecta promoció.
    const moves = c.moves({ square: from, verbose: true });
    const target = moves.find(function (m) { return m.to === to; });
    if (!target) return null;
    const promo = target.promotion ? 'q' : undefined; // sempre dama per simplicitat
    return c.move({ from: from, to: to, promotion: promo });
  }

  // --- Mode "toc": seleccionar origen i destí amb clics ---
  function clearSelection() {
    selectedSquare = null;
    $('#catalans-board .square-55d63').removeClass('cat-selected cat-target');
  }
  function squareEl(square) {
    return $("#catalans-board .square-55d63[data-square='" + square + "']");
  }
  function highlightSelection(square) {
    clearSelection();
    selectedSquare = square;
    squareEl(square).addClass('cat-selected');
    const c = newChess(state.fen);
    c.moves({ square: square, verbose: true }).forEach(function (m) {
      squareEl(m.to).addClass('cat-target');
    });
  }
  function onSquareClick(square) {
    // Si estem revisant una jugada, un clic al tauler torna a la partida real.
    if (previewActive) { exitPreview(); return; }
    if (!canIPlay()) { if (!currentUser()) promptSignIn(); return; }
    const c = newChess(state.fen);
    if (selectedSquare) {
      if (square === selectedSquare) { clearSelection(); return; }
      const legal = legalMove(selectedSquare, square);
      if (legal) {
        proposeVote(uciOf(legal), legal.san);
        clearSelection();
        return;
      }
    }
    // Selecciona una peça blanca amb moviments.
    const piece = c.get(square);
    if (piece && piece.color === 'w' && c.moves({ square: square, verbose: true }).length > 0) {
      highlightSelection(square);
    } else {
      clearSelection();
    }
  }

  // Ressalta el vot propi al tauler.
  function highlightMyVote() {
    $('#catalans-board .square-55d63').removeClass('cat-myvote');
    if (myVoteUci) {
      squareEl(myVoteUci.slice(0, 2)).addClass('cat-myvote');
      squareEl(myVoteUci.slice(2, 4)).addClass('cat-myvote');
    }
  }

  // ---------------------------------------------------------------------------
  //  Render
  // ---------------------------------------------------------------------------
  // Respecta el mode de control global de l'app: arrossegar (per defecte, també
  // funciona en tàctil) o tocar. En mode "drag" el chessboard.js intercepta el
  // clic sobre les peces, així que el mode "toc" requereix draggable:false.
  function isTapMode() {
    try { return localStorage.getItem('eltauler_control_mode') === 'tap'; } catch (e) { return false; }
  }

  function renderBoard() {
    if (previewActive) return; // no sobreescriguis la posició que s'està revisant
    const fen = state.fen;
    if (!board) {
      board = Chessboard('catalans-board', {
        position: fen,
        draggable: !isTapMode(),
        orientation: 'white',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd,
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
      });
      // Clics per al mode "toc".
      $('#catalans-board').on('click', '.square-55d63', function () {
        const sq = $(this).attr('data-square');
        if (sq) onSquareClick(sq);
      });
    } else {
      board.position(fen, false);
    }
    setTimeout(highlightMyVote, 30);
  }

  // Compte enrere fins al canvi de torn: SEMPRE amb segons, i amb hores i minuts
  // quan en queden.
  function fmtDuration(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return h + 'h ' + m + 'm ' + sec + 's';
    if (m > 0) return m + 'm ' + sec + 's';
    return sec + 's';
  }

  // --- Revisió de jugades / propostes al tauler -----------------------------
  function escapeSan(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // FEN després de jugar les primeres `n` jugades (per revisar la transcripció).
  function fenAfterPly(n) {
    const c = newChess();
    const moves = (state && state.movesSan) || [];
    for (let i = 0; i < n && i < moves.length; i++) {
      if (!c.move(moves[i], { sloppy: true })) break;
    }
    return c.fen();
  }

  function setActiveMove(ply) {
    $('#catalans-moves .cat-move').removeClass('cat-move-active');
    if (ply != null) $('#catalans-moves .cat-move[data-ply="' + ply + '"]').addClass('cat-move-active');
  }

  // Mostra una posició al tauler en mode revisió (sense afectar el vot real).
  function showPreview(fen, label, fromToUci) {
    previewActive = true;
    clearSelection();
    // Reinicia ressaltats d'una revisió anterior (en canviar de jugada/proposta).
    setActiveMove(null);
    $('#catalans-vote-list .catalans-vote-row').removeClass('catalans-vote-preview');
    $('#catalans-board .square-55d63').removeClass('cat-myvote cat-preview-from cat-preview-to');
    if (board) board.position(fen, false);
    if (fromToUci && fromToUci.length >= 4) {
      setTimeout(function () {
        squareEl(fromToUci.slice(0, 2)).addClass('cat-preview-from');
        squareEl(fromToUci.slice(2, 4)).addClass('cat-preview-to');
      }, 30);
    }
    $('#catalans-preview-label').text(label || '');
    $('#catalans-preview-bar').css('display', 'block');
  }

  function exitPreview() {
    if (!previewActive) return;
    previewActive = false;
    previewPly = null; previewUci = null;
    $('#catalans-preview-bar').hide();
    $('#catalans-board .square-55d63').removeClass('cat-preview-from cat-preview-to');
    setActiveMove(null);
    $('#catalans-vote-list .catalans-vote-row').removeClass('catalans-vote-preview');
    if (board && state) board.position(state.fen, false);
    setTimeout(highlightMyVote, 30);
  }

  // Revisa la posició DESPRÉS de la jugada número `ply` de la transcripció.
  function previewMoveAtPly(ply) {
    if (!state || !ply) return;
    const moves = state.movesSan || [];
    const san = moves[ply - 1] || '';
    const moveNum = Math.floor((ply - 1) / 2) + 1;
    const dots = (ply % 2 === 1) ? '.' : '…';
    const ft = (state.movesUci && state.movesUci[ply - 1]) || null;
    previewPly = ply; previewUci = null;
    showPreview(fenAfterPly(ply), 'Jugada ' + moveNum + dots + ' ' + san, ft);
    setActiveMove(ply);
  }

  // Revisa al tauler una jugada PROPOSADA (vot), per veure com quedaria.
  function previewVote(uci) {
    if (!uci || !state) return;
    const childFen = applyUciToFen(state.fen, uci);
    if (!childFen) return;
    let san = uci;
    try {
      const c = newChess(state.fen);
      const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined });
      if (mv) san = mv.san;
    } catch (e) {}
    previewUci = uci; previewPly = null;
    showPreview(childFen, 'Proposta: ' + san, uci);
    $('#catalans-vote-list .catalans-vote-row').removeClass('catalans-vote-preview');
    $('#catalans-vote-list .catalans-vote-row[data-uci="' + uci + '"]').addClass('catalans-vote-preview');
  }

  function renderInfo() {
    $('#catalans-game-number').text('Partida #' + (state.gameNumber || 1));
    // Els Catalans NO tenen ELO: s'amaga la seva caixa i només es mostra l'ELO de
    // Stockfish (sempre >= 1350), que és el nivell al qual s'enfronta l'exèrcit.
    // Només es mostra l'ELO de Stockfish durant la partida. L'ELO de l'exèrcit no
    // es coneix fins al final (es calcula) i va a l'anotació posterior.
    const sfVal = Math.round(effectiveSfElo(state));
    $('#catalans-sf-elo').text(sfVal);
    $('#catalans-sf-label').text(unitLabel(sfVal) + ' Stockfish');

    // Resum de l'última partida acabada (anotació posterior): inclou l'ELO/ROC de
    // l'exèrcit, calculat en acabar.
    const lg = state.lastGame;
    if (lg) {
      const army = isCustom() ? teamName() : 'l\'exèrcit';
      const r = lg.result === 'catalans' ? ('✅ Ha guanyat ' + army)
        : lg.result === 'stockfish' ? '❌ Ha guanyat Stockfish'
        : '🤝 Taules';
      const faced = Math.round(lg.sfElo || START_SF_ELO);
      let extra = '';
      if (lg.catElo != null) {
        extra = ' · ' + (isCustom() ? teamName() : 'exèrcit') + ' ' + unitLabel(lg.catElo) + ' ' + Math.round(lg.catElo) +
          (typeof lg.avgCpLoss === 'number' ? ' (pèrdua ' + lg.avgCpLoss + ' cp, ' + (lg.blunders || 0) + ' blunders)' : '');
      }
      $('#catalans-lastgame').html(
        'Partida #' + lg.gameNumber + ': ' + r +
        ' · Stockfish ' + unitLabel(faced) + ' ' + faced + extra
      ).show();
    } else {
      $('#catalans-lastgame').hide();
    }

    // Transcripció de la partida: cada jugada és clicable per revisar-la al tauler.
    const moves = state.movesSan || [];
    if (!moves.length) {
      $('#catalans-moves').html('—');
    } else {
      let html = '';
      for (let i = 0; i < moves.length; i++) {
        if (i % 2 === 0) html += '<span class="cat-move-num">' + (i / 2 + 1) + '.</span> ';
        html += '<span class="cat-move" data-ply="' + (i + 1) + '">' + escapeSan(moves[i]) + '</span> ';
      }
      html += '<span class="cat-moves-hint">Toca una jugada per veure la posició al tauler.</span>';
      $('#catalans-moves').html(html);
      // Si estem revisant una jugada concreta, manté-la ressaltada després del re-render.
      if (previewActive && previewPly != null) setActiveMove(previewPly);
    }
  }

  // Format d'autoria del vot: «Nom (ELO 1500)» o «Nom (ROC 800)». L'ELO/ROC només
  // s'afegeix si el coneixem (vots antics poden no tenir-lo).
  function voteAuthorHtml(author) {
    if (!author || !author.name) return '';
    let rating = '';
    if (typeof author.elo === 'number' && isFinite(author.elo)) {
      rating = ' <span class="catalans-vote-rating">(' + unitLabel(author.elo) + ' ' + Math.round(author.elo) + ')</span>';
    }
    return '<span class="catalans-vote-author">' + escapeSan(author.name) + rating + '</span>';
  }

  function renderVotes() {
    const votes = state.votes || {};
    const groups = {};   // uci -> { uci, san, n, author:{name,elo,at}, msg }
    let total = 0;
    Object.keys(votes).forEach(function (uid) {
      const v = votes[uid];
      if (!v || v.ply !== state.ply || !v.uci) return;
      total++;
      let g = groups[v.uci];
      if (!g) g = groups[v.uci] = { uci: v.uci, san: v.san, n: 0, author: null, msg: '' };
      g.n++;
      if (!g.san && v.san) g.san = v.san;
      // El PRIMER proposant (vot més antic) és l'autor del moviment i del missatge.
      const at = (typeof v.at === 'number') ? v.at : Infinity;
      if (!g.author || at < g.author.at) {
        g.author = { name: v.name || '', elo: v.elo, at: at };
        g.msg = (typeof v.msg === 'string') ? v.msg : '';
      }
    });
    const list = Object.keys(groups).map(function (u) { return groups[u]; })
      .sort(function (a, b) { return b.n - a.n; });

    const container = $('#catalans-vote-list');
    container.empty();
    if (state.phase !== 'catalans') {
      $('#catalans-vote-total').text('');
      return;
    }
    $('#catalans-vote-total').text(total + ' vot' + (total === 1 ? '' : 's'));
    if (list.length === 0) {
      container.html('<div class="catalans-vote-empty">Encara no hi ha vots. Fes el primer moviment!</div>');
      return;
    }
    list.forEach(function (item) {
      const pct = total > 0 ? Math.round(item.n / total * 100) : 0;
      const mine = item.uci === myVoteUci ? ' catalans-vote-mine' : '';
      const prev = (previewActive && item.uci === previewUci) ? ' catalans-vote-preview' : '';
      const authorHtml = voteAuthorHtml(item.author);
      const msgHtml = item.msg ? ('<div class="catalans-vote-msg">' + escapeSan(item.msg) + '</div>') : '';
      const row = $(
        '<div class="catalans-vote-row' + mine + prev + '" data-uci="' + item.uci + '" title="Toca per veure aquesta jugada al tauler">' +
        '<div class="catalans-vote-main">' +
        '<span class="catalans-vote-san">' + escapeSan(item.san) + '</span>' +
        '<span class="catalans-vote-bar"><span style="width:' + pct + '%"></span></span>' +
        '<span class="catalans-vote-n">' + item.n + '</span>' +
        '</div>' +
        authorHtml +
        msgHtml +
        '</div>'
      );
      container.append(row);
    });
  }

  // ---------------------------------------------------------------------------
  //  Historial de partides + reproductor
  // ---------------------------------------------------------------------------
  function unitLabel(strength) { return isRocMode(strength) ? 'ROC' : 'ELO'; }

  function renderHistory() {
    const list = $('#catalans-history-list');
    if (!list.length) return;
    if (!historyView.length) {
      list.html('<div class="catalans-vote-empty">Encara no hi ha partides acabades.</div>');
      return;
    }
    let html = '';
    historyView.forEach(function (g, i) {
      const d = new Date(g.date || 0);
      const dateStr = d.toLocaleDateString('ca-ES', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' · ' + d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
      const elo = Math.round(g.sfElo || g.catalansElo || 0); // força de Stockfish a què es va enfrontar l'exèrcit
      const res = g.result === 'catalans' ? '✅' : (g.result === 'stockfish' ? '❌' : '🤝');
      const nMoves = Array.isArray(g.movesSan) ? g.movesSan.length : 0;
      const playable = nMoves > 0 ? '<button class="btn btn-secondary catalans-hist-play" data-idx="' + i + '">▶ Reproduir</button>' : '';
      const catTxt = (g.catElo != null)
        ? '<span class="catalans-hist-cat">Exèrcit ' + unitLabel(g.catElo) + ' ' + Math.round(g.catElo) + '</span>'
        : '';
      html += '<div class="catalans-hist-row">' +
        '<div class="catalans-hist-main">' +
          '<span class="catalans-hist-res">' + res + '</span>' +
          '<span class="catalans-hist-elo">Stockfish ' + unitLabel(elo) + ' ' + elo + '</span>' +
          catTxt +
          '<span class="catalans-hist-date">' + dateStr + '</span>' +
        '</div>' +
        '<div class="catalans-hist-side">' +
          '<span class="catalans-hist-moves">' + Math.ceil(nMoves / 2) + ' jugades</span>' +
          playable +
        '</div>' +
      '</div>';
    });
    list.html(html);
  }

  // Reprodueix una partida de l'historial en un tauler fix dins la secció.
  function openReplayGame(idx) {
    const g = historyView[idx];
    if (!g || !Array.isArray(g.movesSan) || !g.movesSan.length) return;
    replay = { moves: g.movesSan.slice(), idx: 0, timer: null, playing: false };
    const d = new Date(g.date || 0);
    const elo = Math.round(g.sfElo || g.catalansElo || 0);
    const catTxt = (g.catElo != null) ? ' · Exèrcit ' + unitLabel(g.catElo) + ' ' + Math.round(g.catElo) : '';
    $('#catalans-replay-title').text('Partida #' + (g.gameNumber || '?') + ' · Stockfish ' + unitLabel(elo) + ' ' + elo +
      catTxt + ' · ' + d.toLocaleDateString('ca-ES', { day: '2-digit', month: 'short', year: 'numeric' }));
    $('#catalans-replay').css('display', 'block');
    if (!replayBoard) {
      replayBoard = Chessboard('catalans-replay-board', {
        position: 'start', draggable: false, orientation: 'white',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
      });
    }
    replayRender();
    setTimeout(function () { if (replayBoard && replayBoard.resize) replayBoard.resize(); replayRender(); }, 60);
    $('#catalans-replay')[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function replayChessAt(idx) {
    const c = newChess();
    let last = null;
    for (let i = 0; i < idx && i < replay.moves.length; i++) {
      const mv = c.move(replay.moves[i], { sloppy: true });
      if (!mv) break;
      last = mv;
    }
    return { chess: c, last: last };
  }

  function replayRender() {
    if (!replay || !replayBoard) return;
    const r = replayChessAt(replay.idx);
    replayBoard.position(r.chess.fen(), false);
    // Ressalta l'última jugada reproduïda.
    setTimeout(function () {
      $('#catalans-replay-board .square-55d63').removeClass('cat-preview-from cat-preview-to');
      if (r.last) {
        $("#catalans-replay-board .square-55d63[data-square='" + r.last.from + "']").addClass('cat-preview-from');
        $("#catalans-replay-board .square-55d63[data-square='" + r.last.to + "']").addClass('cat-preview-to');
      }
    }, 30);
    const total = replay.moves.length;
    const moveNum = replay.idx > 0 ? Math.floor((replay.idx - 1) / 2) + 1 : 0;
    const sanLabel = replay.idx > 0 ? (r.last ? r.last.san : replay.moves[replay.idx - 1]) : 'inici';
    $('#catalans-replay-status').text('Jugada ' + replay.idx + ' / ' + total + (replay.idx > 0 ? ' · ' + moveNum + (replay.idx % 2 === 1 ? '.' : '…') + ' ' + sanLabel : ''));
    $('#catalans-replay-play').text(replay.playing ? '⏸ Pausa' : '▶ Reproduir');
  }

  function replaySeek(idx) {
    if (!replay) return;
    replay.idx = Math.max(0, Math.min(replay.moves.length, idx));
    replayRender();
  }
  function replayStep(delta) { if (replay) replaySeek(replay.idx + delta); }

  function replayStopPlay() {
    if (replay && replay.timer) { clearInterval(replay.timer); replay.timer = null; }
    if (replay) replay.playing = false;
  }
  function replayTogglePlay() {
    if (!replay) return;
    if (replay.playing) { replayStopPlay(); replayRender(); return; }
    if (replay.idx >= replay.moves.length) replay.idx = 0; // reinicia si era al final
    replay.playing = true;
    replayRender();
    replay.timer = setInterval(function () {
      if (!replay) return;
      if (replay.idx >= replay.moves.length) { replayStopPlay(); replayRender(); return; }
      replay.idx++;
      replayRender();
    }, 900);
  }
  function closeReplay() {
    replayStopPlay();
    replay = null;
    $('#catalans-replay').hide();
  }

  let lastCountdownTarget = 0;
  function startCountdown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    tickCountdown();
    countdownTimer = setInterval(tickCountdown, 1000);
  }
  function tickCountdown() {
    if (!state) return;
    const now = Date.now();
    if (state.phase === 'catalans') {
      const left = (state.deadlineAt || 0) - now;
      $('#catalans-phase').text('🟡 Torn de' + (isCustom() ? ' ' : 'ls ') + teamName() + ' — voteu el moviment');
      $('#catalans-countdown').text('Es tanca en ' + fmtDuration(left));
      $('#catalans-next-banner').hide();
      if (left <= 0) maybeDriveTransition();
    } else if (state.phase === 'stockfish') {
      $('#catalans-phase').text('🟣 Torn de Stockfish');
      $('#catalans-countdown').text('Stockfish està movent…');
      $('#catalans-next-banner').hide();
    } else if (state.phase === 'finished') {
      const won = isCustom() ? ('Ha guanyat ' + teamName() + '! ✅') : 'Han guanyat els Catalans! ✅';
      const r = state.result === 'catalans' ? won
        : state.result === 'stockfish' ? 'Ha guanyat Stockfish ❌' : 'Taules 🤝';
      $('#catalans-phase').text('🏁 Partida acabada — ' + r);
      $('#catalans-countdown').text('');
      // Compte enrere GRAN i centrat sobre el tauler fins a la pròxima partida.
      const left = (state.deadlineAt || 0) - now;
      const next = Math.round(state.nextSfElo || START_SF_ELO);
      const army = isCustom() ? teamName() : 'l\'exèrcit';
      $('#catalans-next-countdown').text(fmtDuration(left));
      $('#catalans-next-detail').text('Stockfish jugarà a ' + unitLabel(next) + ' ' + next +
        (state.lastGame && state.lastGame.result === 'stockfish' ? (' (el ROC de ' + army + ')') : ''));
      $('#catalans-next-banner').css('display', 'block');
      if (now >= (state.deadlineAt || 0)) maybeDriveTransition();
    }
  }

  function setStatus(msg) { $('#catalans-status').text(msg || ''); }

  function renderAuthState() {
    const u = currentUser();
    if (u) {
      $('#catalans-signin').hide();
      $('#catalans-switch').show();
      $('#catalans-whoami').text('Votes com a ' + userName(u)).show();
    } else {
      $('#catalans-signin').show();
      $('#catalans-switch').hide();
      $('#catalans-whoami').hide();
    }
  }


  function catalansShareUrl() {
    const base = window.location.origin + window.location.pathname + window.location.search;
    return base + (isCustom() && config.id ? '#partida-' + config.id : '#catalans-vs-stockfish');
  }

  function shareCatalans() {
    const url = catalansShareUrl();
    const title = (isCustom() ? teamName() : 'Catalans') + ' vs Stockfish';
    const text = isCustom()
      ? ('Uneix-te a ' + teamName() + ' i vota el moviment de la nostra partida col·lectiva contra Stockfish a El Tauler!')
      : 'Vota el moviment de la partida col·lectiva Catalans vs Stockfish a El Tauler.';
    if (navigator.share) {
      navigator.share({ title: title, text: text, url: url }).catch(function () {});
      return;
    }
    const done = function () { setStatus('Enllaç copiat: comparteix la partida perquè més gent voti.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(function () {
        window.prompt('Copia l’enllaç de Catalans vs Stockfish:', url);
      });
    } else {
      window.prompt('Copia l’enllaç de Catalans vs Stockfish:', url);
    }
  }

  // ---------------------------------------------------------------------------
  //  Personalització de la pantalla segons la partida (nom d'equip, etc.)
  // ---------------------------------------------------------------------------
  let defaultHowtoHtml = null;   // còpia del «Com funciona» original (mode global)

  // Pot l'usuari actual editar l'ELO/ROC d'aquesta partida? Només qui la va crear.
  function canEditStrength() {
    const u = currentUser();
    return !!(isCustom() && u && state && state.createdByUid && state.createdByUid === u.uid);
  }

  function customHowtoHtml(name) {
    return '<h3>Com funciona — ' + escapeSan(name) + '</h3>' +
      'Aquesta és la partida col·lectiva de <strong>' + escapeSan(name) + '</strong>. Quan ' +
      'toca moure a l\'equip, fes el teu moviment al tauler: és el teu <strong>vot</strong> ' +
      '(el pots canviar fins que acabi el torn). Passades <strong>24 hores</strong> des de ' +
      'l\'inici del torn, es tanca la votació i es juga el moviment <strong>més votat</strong>; ' +
      'si hi ha empat, s\'agafa el que <strong>Stockfish considera millor</strong>. Després mou Stockfish.' +
      '<br><br>' +
      'La <strong>primera persona</strong> que proposa un moviment nou pot deixar un ' +
      '<strong>comentari (fins a 180 caràcters)</strong> per explicar la jugada a la resta de ' +
      escapeSan(name) + '; queda a sota la seva votació. Cada vot mostra el <strong>nom</strong> ' +
      'i el seu <strong>ELO o ROC</strong>.' +
      '<br><br>' +
      '<strong>Comparteix l\'enllaç</strong> amb tot l\'equip (botó «Comparteix»): qui l\'obri i ' +
      'faci un moviment <strong>s\'hi suma automàticament</strong>. Com més gent voteu, més fort ' +
      'jugarà ' + escapeSan(name) + '!' +
      '<br><br>' +
      'Stockfish juga a l\'<strong>ELO que heu triat</strong>. Qui va crear la partida el pot ' +
      'canviar quan vulgui amb el botó <strong>«✏️ Edita l\'Elo/ROC»</strong> (per sota de 1350 ' +
      'és mode ROC, debilitat). Si ' + escapeSan(name) + ' <strong>guanya</strong> o empata, la ' +
      'partida següent el rival serà més fort; si <strong>perd</strong>, s\'ajusta al ROC de ' +
      'l\'equip (com de feble heu jugat).' +
      '<br><br>' +
      '<em>Inspirat en «Kaspàrov contra el Món» (1999), on tot el món decidia cada jugada per ' +
      'votació majoritària.</em>';
  }

  let lastUiKey = '';   // evita reescriure capçalera/«Com funciona» a cada snapshot
  function personalizeUi() {
    if (defaultHowtoHtml == null) {
      const h = $('#catalans-howto').html();
      if (h) defaultHowtoHtml = h;
    }
    const name = teamName();
    const key = (isCustom() ? 'c:' : 'd:') + name;
    if (key !== lastUiKey) {
      lastUiKey = key;
      if (isCustom()) {
        $('.catalans-hero h1').text(name + ' vs Stockfish');
        $('.catalans-hero .catalans-sub').text('Partida col·lectiva de ' + name + ': tots voteu el moviment de l\'equip');
        $('#catalans-howto').html(customHowtoHtml(name));
      } else {
        $('.catalans-hero h1').text('Catalans vs Stockfish');
        $('.catalans-hero .catalans-sub').text('Una partida col·lectiva: tots votem el moviment dels Catalans');
        if (defaultHowtoHtml != null) $('#catalans-howto').html(defaultHowtoHtml);
      }
    }
    // La visibilitat del botó d'edició és barata i pot canviar amb l'autenticació.
    $('#catalans-edit-strength').css('display', canEditStrength() ? 'inline-block' : 'none');
  }

  // ---------------------------------------------------------------------------
  //  Obrir / tancar la pantalla
  // ---------------------------------------------------------------------------
  // Atura subscripcions i neteja l'estat abans de carregar una altra partida.
  function teardownGame() {
    if (unsub) { unsub(); unsub = null; }
    if (historyUnsub) { historyUnsub(); historyUnsub = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    replayStopPlay();
    closeReplay();
    state = null; subscribed = false; resolving = false;
    lastPlySeen = -1; myVoteUci = null;
    previewActive = false; previewPly = null; previewUci = null;
    historyView = [];
    lastUiKey = '';
  }

  // Obre la partida descrita per `cfg` (global per defecte o personalitzada).
  function openGame(cfg) {
    const dbi = getDb();
    if (!dbi) {
      setStatus('La partida col·lectiva necessita Firebase configurat (sincronització al núvol).');
      config = cfg || defaultConfig();
      personalizeUi();
      $('#catalans-screen').show();
      return;
    }
    db = dbi;

    teardownGame();
    config = cfg || defaultConfig();
    docRef = db.collection(COLLECTION).doc(config.docId);

    // Neteja visual de la partida anterior (tauler, ressaltats, previsualització).
    $('#catalans-preview-bar').hide();
    $('#catalans-board .square-55d63').removeClass('cat-myvote cat-preview-from cat-preview-to cat-selected cat-target');
    if (board) { try { board.position('start', false); } catch (e) {} }
    setStatus('');
    renderHistory();
    personalizeUi();

    $('#catalans-screen').show();
    renderAuthState();

    if (!opened) {
      opened = true;
      // Re-render de l'estat d'autenticació quan canviï.
      try {
        firebase.auth().onAuthStateChanged(function () {
          renderAuthState();
          personalizeUi();
          if (state) { updateMyVoteFromState(); renderVotes(); renderBoard(); }
          // Si encara no tenim estat (abans no teníem permís o no hi havia
          // partida), reintenta ara que l'usuari s'ha autenticat: pot crear el
          // document i/o tornar a subscriure's amb permisos.
          if (!state || !subscribed) {
            ensureDoc().then(function () { subscribe(); });
          }
        });
      } catch (e) {}
    }

    ensureDoc().then(function () {
      subscribe();
      // Ajusta la mida del tauler quan ja és visible.
      setTimeout(function () { if (board && typeof board.resize === 'function') board.resize(); }, 60);
    });
  }

  // Punt d'entrada de la partida global «Catalans vs Stockfish».
  function open() { openGame(defaultConfig()); }

  // Obre una partida col·lectiva pròpia pel seu identificador (enllaç compartit).
  function openCustom(id) {
    id = String(id || '');
    const dbi = getDb();
    if (!dbi) { openGame(configFromEntry({ id: id, name: 'El meu equip', startElo: START_SF_ELO })); return; }
    db = dbi;
    const cached = customsList.find(function (g) { return g.id === id; });
    if (cached) { openGame(configFromEntry(cached)); return; }
    // No el tenim a la memòria: mira el registre i, si cal, el propi document.
    db.collection(COLLECTION).doc(CUSTOMS_DOC_ID).get().then(function (snap) {
      const games = (snap.exists && snap.data() && snap.data().games) || {};
      if (games[id]) { openGame(configFromEntry(games[id])); return; }
      return db.collection(COLLECTION).doc('c_' + id).get().then(function (gs) {
        if (gs.exists) {
          const d = gs.data() || {};
          openGame({
            custom: true, id: id, docId: 'c_' + id, historyDocId: 'c_' + id + '_h',
            teamName: d.teamName || 'El meu equip',
            startElo: clampStrength(d.startElo || d.sfElo || START_SF_ELO),
            createdByUid: d.createdByUid || null
          });
        } else {
          openGame(configFromEntry({ id: id, name: 'El meu equip', startElo: START_SF_ELO }));
          setStatus('Aquesta partida col·lectiva encara no existeix. Fes el primer moviment per començar-la!');
        }
      });
    }).catch(function () {
      openGame(configFromEntry({ id: id, name: 'El meu equip', startElo: START_SF_ELO }));
      setStatus('No s\'ha pogut carregar la partida col·lectiva.');
    });
  }

  function close() {
    teardownGame();
    config = defaultConfig();
    $('#catalans-screen').hide();
  }

  // ---------------------------------------------------------------------------
  //  Registre de partides pròpies + bàners a la pantalla d'inici
  // ---------------------------------------------------------------------------
  function customsRef() { return db ? db.collection(COLLECTION).doc(CUSTOMS_DOC_ID) : null; }

  function genCustomId() {
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }
  // Parella de colors aleatòria però agradable (per al bàner de cada partida).
  function randomColorPair() {
    const h = Math.floor(Math.random() * 360);
    const h2 = (h + 18 + Math.floor(Math.random() * 46)) % 360;
    return { color1: 'hsl(' + h + ',62%,34%)', color2: 'hsl(' + h2 + ',66%,17%)' };
  }

  // Subscripció (només lectura, pública) al registre per pintar els bàners.
  function ensureCustoms() {
    const dbi = getDb();
    if (!dbi) { setTimeout(ensureCustoms, 1500); return; }
    db = dbi;
    if (customsUnsub) return;
    try {
      customsUnsub = customsRef().onSnapshot(function (snap) {
        const data = snap.exists ? snap.data() : null;
        const games = (data && data.games) ? data.games : {};
        customsList = Object.keys(games).map(function (k) { return games[k]; })
          .filter(function (g) { return g && g.id; })
          .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        renderCustomBanners();
      }, function () {});
    } catch (e) {}
  }

  function renderCustomBanners() {
    const cont = $('#custom-banners');
    if (!cont.length) return;
    if (!customsList.length) { cont.empty(); return; }
    let html = '';
    customsList.forEach(function (g) {
      const c1 = g.color1 || '#3a3f87';
      const c2 = g.color2 || '#1a1c40';
      const bg = 'linear-gradient(135deg,' + c1 + ' 0%,' + c2 + ' 100%)';
      const elo = clampStrength(g.startElo || START_SF_ELO);
      html += '<button class="catalans-banner custom-banner" data-cid="' + escapeSan(g.id) + '" ' +
        'aria-label="' + escapeSan(g.name) + ' vs Stockfish" style="background:' + bg + '">' +
        '<svg class="catalans-banner-ic" aria-hidden="true"><use href="#ic-swords"/></svg>' +
        '<span class="catalans-banner-text">' +
        '<span class="catalans-banner-live"><span class="cb-dot"></span> EN DIRECTE</span>' +
        '<span class="catalans-banner-title">' + escapeSan(g.name) + ' vs Stockfish</span>' +
        '<span class="catalans-banner-sub">Partida col·lectiva · ' + unitLabel(elo) + ' ' + elo + '</span>' +
        '</span>' +
        '<span class="catalans-banner-cta">Juga-hi ›</span>' +
        '</button>';
    });
    cont.html(html);
  }

  // ---------------------------------------------------------------------------
  //  Crear / editar una partida pròpia (finestra modal)
  // ---------------------------------------------------------------------------
  let customModalMode = 'create';   // 'create' | 'edit'

  function openCreateCustomModal() {
    customModalMode = 'create';
    $('#catalans-custom-title').text('⚔️ Crea la teva partida col·lectiva');
    $('#catalans-custom-name-row').show();
    $('#catalans-custom-name').val('');
    $('#catalans-custom-elo').val(String(START_SF_ELO));
    $('#catalans-custom-save').text('Crea la partida');
    $('#catalans-custom-modal').css('display', 'flex');
    setTimeout(function () { try { $('#catalans-custom-name').trigger('focus'); } catch (e) {} }, 30);
  }

  function openEditCustomModal() {
    if (!canEditStrength()) return;
    customModalMode = 'edit';
    $('#catalans-custom-title').text('✏️ Edita l\'Elo/ROC');
    $('#catalans-custom-name-row').show();
    $('#catalans-custom-name').val(teamName());
    $('#catalans-custom-elo').val(String(Math.round(effectiveSfElo(state))));
    $('#catalans-custom-save').text('Desa els canvis');
    $('#catalans-custom-modal').css('display', 'flex');
    setTimeout(function () { try { $('#catalans-custom-elo').trigger('focus'); } catch (e) {} }, 30);
  }

  function closeCustomModal() { $('#catalans-custom-modal').hide(); }

  function readCustomModal() {
    const name = String($('#catalans-custom-name').val() || '').trim().slice(0, 40);
    let elo = parseInt($('#catalans-custom-elo').val(), 10);
    if (isNaN(elo)) elo = START_SF_ELO;
    return { name: name, elo: clampStrength(elo) };
  }

  function confirmCustomModal() {
    const vals = readCustomModal();
    if (customModalMode === 'create') {
      if (!vals.name) { setStatus('Posa un nom a l\'equip.'); try { $('#catalans-custom-name').trigger('focus'); } catch (e) {} return; }
      createCustomGame(vals.name, vals.elo);
    } else {
      saveCustomEdit(vals.name, vals.elo);
    }
  }

  function createCustomGame(name, elo) {
    const u = currentUser();
    if (!u) { closeCustomModal(); promptSignIn(); return; }
    const dbi = getDb();
    if (!dbi) { setStatus('Cal Firebase configurat per crear partides.'); return; }
    db = dbi;
    const id = genCustomId();
    const colors = randomColorPair();
    const entry = {
      id: id, name: name, color1: colors.color1, color2: colors.color2,
      startElo: clampStrength(elo), createdByUid: u.uid, createdByName: userName(u),
      createdAt: Date.now()
    };
    const cfg = configFromEntry(entry);
    closeCustomModal();
    setStatus('Creant la partida de ' + name + '…');
    Promise.all([
      customsRef().set({ games: { [id]: entry }, updatedAt: Date.now() }, { merge: true }),
      db.collection(COLLECTION).doc(cfg.docId).set(freshGameState(null, cfg))
    ]).then(function () {
      if (typeof window.openCustomGameScreen === 'function') window.openCustomGameScreen(id);
      else openGame(cfg);
    }).catch(function (e) {
      console.warn('[Catalans] crear partida', e);
      const msg = describeFsError(e);
      setStatus(msg);
      try { if (typeof window.showToast === 'function') window.showToast(msg, 'error'); } catch (e2) {}
    });
  }

  function saveCustomEdit(name, elo) {
    if (!isCustom() || !config.id) { closeCustomModal(); return; }
    if (!canEditStrength()) { closeCustomModal(); return; }
    const strength = clampStrength(elo);
    closeCustomModal();
    const upd = { sfElo: strength, startElo: strength, updatedAt: Date.now() };
    if (name) upd.teamName = name;
    docRef.update(upd).then(function () {
      config.startElo = strength;
      if (name) config.teamName = name;
      setStatus('Stockfish jugarà ara a ' + unitLabel(strength) + ' ' + strength + '.');
    }).catch(function (e) {
      console.warn('[Catalans] editar partida', e);
      setStatus(describeFsError(e));
    });
    // Actualitza també el registre perquè el bàner mostri el nou valor/nom.
    const reg = {}; reg['games.' + config.id + '.startElo'] = strength;
    if (name) reg['games.' + config.id + '.name'] = name;
    reg.updatedAt = Date.now();
    try { customsRef().update(reg).catch(function () {}); } catch (e) {}
  }

  // Re-ajusta el tauler en canviar la mida de la finestra mentre és visible.
  window.addEventListener('resize', function () {
    const scr = document.getElementById('catalans-screen');
    if (scr && scr.style.display !== 'none' && board && typeof board.resize === 'function') {
      board.resize();
      setTimeout(highlightMyVote, 30);
    }
  });

  // ---------------------------------------------------------------------------
  //  API pública
  // ---------------------------------------------------------------------------
  window.CatalansMode = {
    open: open,
    openCustom: openCustom,
    close: close,
    signIn: promptSignIn,
    initCustomBanners: ensureCustoms
  };

  // Permet que la pantalla de login reusi CloudSync.
  $(function () {
    // Memoritza el «Com funciona» original abans de personalitzar-lo mai.
    if (defaultHowtoHtml == null) { const h = $('#catalans-howto').html(); if (h) defaultHowtoHtml = h; }
    // Comença a escoltar el registre de partides pròpies per pintar-ne els bàners.
    ensureCustoms();

    $('#catalans-signin').on('click', promptSignIn);
    $('#btn-catalans-share').on('click', shareCatalans);

    // Crear una partida pròpia.
    $('#btn-create-custom').on('click', openCreateCustomModal);
    // Obrir una partida pròpia des del seu bàner a la pantalla d'inici.
    $('#custom-banners').on('click', '.custom-banner', function () {
      const id = $(this).attr('data-cid');
      if (!id) return;
      if (typeof window.openCustomGameScreen === 'function') window.openCustomGameScreen(String(id));
      else openCustom(String(id));
    });
    // Editar l'Elo/ROC de la partida pròpia (només el creador).
    $('#catalans-edit-strength').on('click', openEditCustomModal);

    // Finestra de crear/editar partida pròpia.
    $('#catalans-custom-save').on('click', confirmCustomModal);
    $('#catalans-custom-cancel').on('click', closeCustomModal);
    $('#catalans-custom-modal').on('click', function (e) { if (e.target === this) closeCustomModal(); });
    $('#catalans-custom-elo, #catalans-custom-name').on('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); confirmCustomModal(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeCustomModal(); }
    });
    // Canviar de compte (tanca sessió i torna a triar compte de Google).
    $('#catalans-switch').on('click', function () {
      setStatus('Canviant de compte…');
      try { localStorage.setItem('eltauler_cloud_returnToCatalans', '1'); } catch (e) {}
      if (window.CloudSync && typeof window.CloudSync.switchAccount === 'function') {
        window.CloudSync.switchAccount();
      } else if (window.CloudSync && typeof window.CloudSync.signIn === 'function') {
        window.CloudSync.signIn();
      }
    });
    // Revisió de jugades: clic a una jugada de la transcripció.
    $('#catalans-moves').on('click', '.cat-move', function () {
      const ply = parseInt($(this).attr('data-ply'), 10);
      if (!isNaN(ply)) previewMoveAtPly(ply);
    });
    // Revisió de propostes: clic a un moviment ja votat per veure'l al tauler.
    $('#catalans-vote-list').on('click', '.catalans-vote-row', function () {
      const uci = $(this).attr('data-uci');
      if (uci) previewVote(uci);
    });
    // Tornar de la revisió a la partida real.
    $('#catalans-preview-back').on('click', function () { exitPreview(); });

    // Finestra per explicar el moviment (primer proposant d'un moviment nou).
    $('#catalans-msg-confirm').on('click', confirmMessageModal);
    $('#catalans-msg-cancel').on('click', closeMessageModal);
    $('#catalans-msg-text').on('input', function () {
      $('#catalans-msg-count').text(String(($(this).val() || '').length));
    });
    // Enter (sense Maj) confirma; Esc cancel·la.
    $('#catalans-msg-text').on('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmMessageModal(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeMessageModal(); }
    });
    // Clic fora del contingut: tanca sense votar.
    $('#catalans-msg-modal').on('click', function (e) { if (e.target === this) closeMessageModal(); });

    // Historial: reproduir una partida.
    $('#catalans-history-list').on('click', '.catalans-hist-play', function () {
      const idx = parseInt($(this).attr('data-idx'), 10);
      if (!isNaN(idx)) openReplayGame(idx);
    });
    // Controls del reproductor.
    $('#catalans-replay-first').on('click', function () { replayStopPlay(); replaySeek(0); });
    $('#catalans-replay-prev').on('click', function () { replayStopPlay(); replayStep(-1); });
    $('#catalans-replay-play').on('click', function () { replayTogglePlay(); });
    $('#catalans-replay-next').on('click', function () { replayStopPlay(); replayStep(1); });
    $('#catalans-replay-last').on('click', function () { replayStopPlay(); replaySeek(replay ? replay.moves.length : 0); });
    $('#catalans-replay-close').on('click', function () { closeReplay(); });
  });
})();
