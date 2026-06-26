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

  const TURN_MS = 24 * 60 * 60 * 1000;   // 24 h perquè votin els Catalans
  const NEXT_GAME_MS = 24 * 60 * 60 * 1000; // 24 h entre el final d'una partida i la següent
  const START_SF_ELO = 1350;             // Stockfish comença aquí
  // Terra real de força del binari inclòs: per sota d'aquest valor el motor no
  // pot jugar més fluix amb UCI_Elo, així que passem a mode ROC (debilitació via
  // MultiPV + profunditat reduïda), igual que fa app.js per a usuaris febles.
  const ENGINE_FLOOR = 1350;
  const STRENGTH_MIN = 1350;             // ELO mínim de Stockfish (mínim detectable del motor)
  const STRENGTH_MAX = 2850;             // UCI_Elo màxim del binari
  // Progressió de la força de Stockfish entre partides (els Catalans no tenen ELO):
  // si guanyen, el rival es fa més fort; si perden, més fluix però mai per sota de 1350.
  const SF_WIN_STEP = 40;
  const SF_DRAW_STEP = 10;
  const SF_LOSS_STEP = 40;
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
  function freshGameState(prev) {
    const c = newChess();
    const gameNumber = prev ? (prev.gameNumber || 1) + 1 : 1;
    const sfElo = prev ? clampStrength(prev.nextSfElo || prev.sfElo || START_SF_ELO) : START_SF_ELO;
    const now = Date.now();
    return {
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
  }

  // Nova força de Stockfish per a la propera partida segons el resultat (els
  // Catalans no tenen ELO): victòria → més fort; derrota → més fluix; sempre >=1350.
  function nextStockfishElo(prevStrength, result) {
    let next = prevStrength;
    if (result === 'catalans') next = prevStrength + SF_WIN_STEP;
    else if (result === 'draw') next = prevStrength + SF_DRAW_STEP;
    else next = prevStrength - SF_LOSS_STEP;
    return clampStrength(next);
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
      return docRef.set(freshGameState(null)).then(function () { return true; });
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
      const hRef = db.collection(COLLECTION).doc(HISTORY_DOC_ID);
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
    const sfElo = state.sfElo || START_SF_ELO;
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

      const prevStrength = clampStrength(d.sfElo || START_SF_ELO);
      const avgCpLoss = teamStats.moves ? Math.round(teamStats.totalCpLoss / teamStats.moves) : null;
      // Els Catalans NO tenen ELO. La força de Stockfish per a la propera partida
      // puja si l'exèrcit guanya i baixa si perd, però mai per sota de 1350.
      const nextStrength = nextStockfishElo(prevStrength, result);

      const summary = {
        gameNumber: d.gameNumber || 1,
        result: result,
        sfElo: prevStrength,         // ELO de Stockfish a què s'ha enfrontat l'exèrcit
        nextStrength: nextStrength,  // ELO de Stockfish la propera partida
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
        tx.set(docRef, freshGameState(d));
      });
    });
  }

  // Desa un resum de partida a l'historial (millor esforç; no és crític).
  function appendHistory(summary) {
    try {
      const hRef = db.collection(COLLECTION).doc(HISTORY_DOC_ID);
      hRef.set({
        games: firebase.firestore.FieldValue.arrayUnion(summary),
        updatedAt: Date.now()
      }, { merge: true }).catch(function () {});
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  //  Votació de l'usuari
  // ---------------------------------------------------------------------------
  function castVote(uci, san) {
    const u = currentUser();
    if (!u) { promptSignIn(); return; }
    if (!state || state.phase !== 'catalans') return;
    const ply = state.ply;
    const update = {};
    update['votes.' + u.uid] = { uci: uci, san: san, name: userName(u), ply: ply, at: Date.now() };
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
    castVote(uciOf(legal), legal.san);
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
        castVote(uciOf(legal), legal.san);
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
    $('.catalans-elo-box.cat').hide();
    $('.catalans-elo-box.sf').show();
    const sfVal = Math.round(state.sfElo || START_SF_ELO);
    $('#catalans-sf-elo').text(sfVal);
    $('#catalans-sf-label').text('ELO Stockfish');

    // Resum de l'última partida acabada.
    const lg = state.lastGame;
    if (lg) {
      const r = lg.result === 'catalans' ? '✅ Ha guanyat l\'exèrcit'
        : lg.result === 'stockfish' ? '❌ Ha guanyat Stockfish'
        : '🤝 Taules';
      const faced = Math.round(lg.sfElo || START_SF_ELO);
      const next = Math.round(lg.nextStrength || faced);
      const delta = next - faced;
      const arrow = delta > 0 ? '▲ +' + delta : (delta < 0 ? '▼ ' + delta : '±0');
      $('#catalans-lastgame').html(
        'Partida #' + lg.gameNumber + ': ' + r +
        ' · Stockfish ELO ' + faced + ' → propera ' + next + ' (' + arrow + ')'
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

  function renderVotes() {
    const votes = state.votes || {};
    const counts = {};
    const sanByUci = {};
    let total = 0;
    Object.keys(votes).forEach(function (uid) {
      const v = votes[uid];
      if (!v || v.ply !== state.ply || !v.uci) return;
      counts[v.uci] = (counts[v.uci] || 0) + 1;
      sanByUci[v.uci] = v.san;
      total++;
    });
    const list = Object.keys(counts).map(function (u) {
      return { uci: u, san: sanByUci[u], n: counts[u] };
    }).sort(function (a, b) { return b.n - a.n; });

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
      const row = $(
        '<div class="catalans-vote-row' + mine + prev + '" data-uci="' + item.uci + '" title="Toca per veure aquesta jugada al tauler">' +
        '<span class="catalans-vote-san">' + escapeSan(item.san) + '</span>' +
        '<span class="catalans-vote-bar"><span style="width:' + pct + '%"></span></span>' +
        '<span class="catalans-vote-n">' + item.n + '</span>' +
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
      const elo = Math.round(g.sfElo || g.catalansElo || 0); // ELO de Stockfish a què es va enfrontar l'exèrcit
      const res = g.result === 'catalans' ? '✅' : (g.result === 'stockfish' ? '❌' : '🤝');
      const nMoves = Array.isArray(g.movesSan) ? g.movesSan.length : 0;
      const playable = nMoves > 0 ? '<button class="btn btn-secondary catalans-hist-play" data-idx="' + i + '">▶ Reproduir</button>' : '';
      html += '<div class="catalans-hist-row">' +
        '<div class="catalans-hist-main">' +
          '<span class="catalans-hist-res">' + res + '</span>' +
          '<span class="catalans-hist-elo">Stockfish ' + elo + '</span>' +
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
    $('#catalans-replay-title').text('Partida #' + (g.gameNumber || '?') + ' · Stockfish ' + elo +
      ' · ' + d.toLocaleDateString('ca-ES', { day: '2-digit', month: 'short', year: 'numeric' }));
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
      $('#catalans-phase').text('🟡 Torn dels Catalans — voteu el moviment');
      $('#catalans-countdown').text('Es tanca en ' + fmtDuration(left));
      $('#catalans-next-banner').hide();
      if (left <= 0) maybeDriveTransition();
    } else if (state.phase === 'stockfish') {
      $('#catalans-phase').text('🟣 Torn de Stockfish');
      $('#catalans-countdown').text('Stockfish està movent…');
      $('#catalans-next-banner').hide();
    } else if (state.phase === 'finished') {
      const r = state.result === 'catalans' ? 'Han guanyat els Catalans! ✅'
        : state.result === 'stockfish' ? 'Ha guanyat Stockfish ❌' : 'Taules 🤝';
      $('#catalans-phase').text('🏁 Partida acabada — ' + r);
      $('#catalans-countdown').text('');
      // Compte enrere GRAN i centrat sobre el tauler fins a la pròxima partida.
      const left = (state.deadlineAt || 0) - now;
      const next = Math.round(state.nextSfElo || START_SF_ELO);
      $('#catalans-next-countdown').text(fmtDuration(left));
      $('#catalans-next-detail').text('Stockfish jugarà a ELO ' + next);
      $('#catalans-next-banner').css('display', 'block');
      if (now >= (state.deadlineAt || 0)) maybeDriveTransition();
    }
  }

  function setStatus(msg) { $('#catalans-status').text(msg || ''); }

  function renderAuthState() {
    const u = currentUser();
    if (u) {
      $('#catalans-signin').hide();
      $('#catalans-whoami').text('Votes com a ' + userName(u)).show();
    } else {
      $('#catalans-signin').show();
      $('#catalans-whoami').hide();
    }
  }

  // ---------------------------------------------------------------------------
  //  Obrir / tancar la pantalla
  // ---------------------------------------------------------------------------
  function open() {
    const dbi = getDb();
    if (!dbi) {
      setStatus('La partida global necessita Firebase configurat (sincronització al núvol).');
      $('#catalans-screen').show();
      return;
    }
    db = dbi;
    docRef = db.collection(COLLECTION).doc(DOC_ID);

    $('#catalans-screen').show();
    renderAuthState();

    if (!opened) {
      opened = true;
      // Re-render de l'estat d'autenticació quan canviï.
      try {
        firebase.auth().onAuthStateChanged(function () {
          renderAuthState();
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

  function close() {
    if (unsub) { unsub(); unsub = null; }
    if (historyUnsub) { historyUnsub(); historyUnsub = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    replayStopPlay();
    $('#catalans-screen').hide();
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
    close: close,
    signIn: promptSignIn
  };

  // Permet que la pantalla de login reusi CloudSync.
  $(function () {
    $('#catalans-signin').on('click', promptSignIn);
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
