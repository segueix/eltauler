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
  const RESULT_DISPLAY_MS = 30 * 1000;   // temps mostrant el resultat abans de la nova partida
  const START_SF_ELO = 1280;             // Stockfish comença aquí
  const ENGINE_FLOOR = 1350;             // terra real de força del binari inclòs (informatiu)
  const SF_ELO_MIN = 800;
  const SF_ELO_MAX = 2850;
  const CAT_ELO_MIN = 500;
  const CAT_ELO_MAX = 2900;
  const ENGINE_MOVETIME_MS = 1500;       // temps de càlcul de la jugada de Stockfish
  const TIEBREAK_DEPTH = 12;             // profunditat per triar el millor entre empatats

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
  let opened = false;        // la pantalla s'ha obert alguna vegada
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
    let onBest = null;       // callback quan arriba "bestmove"
    let lastScore = null;    // últim "score" (cp, des del bàndol que mou) de l'anàlisi en curs

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

    function handleLine(line) {
      if (!line) return;
      if (line.indexOf('uciok') === 0 || line === 'uciok') { ready = true; return; }
      if (line.indexOf('info') === 0) {
        // Captura l'última puntuació de la línia principal.
        const m = line.match(/score (cp|mate) (-?\d+)/);
        if (m) {
          if (m[1] === 'cp') lastScore = parseInt(m[2], 10);
          else lastScore = (parseInt(m[2], 10) >= 0 ? 1 : -1) * (100000 - Math.abs(parseInt(m[2], 10)));
        }
        return;
      }
      if (line.indexOf('bestmove') === 0) {
        const parts = line.split(/\s+/);
        const best = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
        const cb = onBest;
        onBest = null;
        busy = false;
        if (cb) cb({ bestmove: best, score: lastScore });
      }
    }

    function send(cmd) { if (worker) worker.postMessage(cmd); }

    // Executa una cerca i resol amb { bestmove, score }. Serialitzat: una alhora.
    function search(opts) {
      return new Promise(function (resolve) {
        if (!ensure()) { resolve({ bestmove: null, score: null }); return; }
        const run = function () {
          busy = true;
          lastScore = null;
          onBest = resolve;
          send('setoption name UCI_LimitStrength value ' + (opts.elo ? 'true' : 'false'));
          if (opts.elo) send('setoption name UCI_Elo value ' + Math.round(opts.elo));
          send('position fen ' + opts.fen);
          send(opts.depth ? ('go depth ' + opts.depth) : ('go movetime ' + (opts.movetime || ENGINE_MOVETIME_MS)));
        };
        // Espera que el motor estigui llest i lliure.
        const wait = function (n) {
          if (ready && !busy) return run();
          if (n <= 0) { busy = true; lastScore = null; onBest = resolve; setTimeout(run, 50); return; }
          setTimeout(function () { wait(n - 1); }, 100);
        };
        wait(60);
      });
    }

    return {
      // Millor jugada de Stockfish a una força (Elo) determinada.
      move: function (fen, elo) {
        return search({ fen: fen, elo: elo, movetime: ENGINE_MOVETIME_MS })
          .then(function (r) { return r.bestmove; });
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
            return search({ fen: childFen, depth: TIEBREAK_DEPTH }).then(function (r) {
              // r.score és des del bàndol que mou DESPRÉS del moviment (el negre):
              // el valor per al blanc és el negatiu.
              const whiteVal = r.score == null ? 0 : -r.score;
              if (whiteVal > bestVal) { bestVal = whiteVal; best = uci; }
            });
          });
        });
        return chain.then(function () { return best; });
      }
    };
  })();

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
    const sfElo = prev ? clampSfElo(prev.nextSfElo || prev.sfElo || START_SF_ELO) : START_SF_ELO;
    const catalansElo = prev ? (prev.catalansElo || START_SF_ELO) : START_SF_ELO;
    const now = Date.now();
    return {
      fen: c.fen(),
      movesSan: [],
      movesUci: [],
      ply: 0,
      phase: 'catalans',           // 'catalans' | 'stockfish' | 'finished'
      turnStartedAt: now,
      deadlineAt: now + TURN_MS,
      sfElo: sfElo,
      catalansElo: catalansElo,
      gameNumber: gameNumber,
      result: null,
      lastMove: null,
      votes: {},
      lastGame: prev && prev.lastGame ? prev.lastGame : null,
      updatedAt: now
    };
  }

  function clampSfElo(v) {
    return Math.max(SF_ELO_MIN, Math.min(SF_ELO_MAX, Math.round(v || START_SF_ELO)));
  }
  function clampCatElo(v) {
    return Math.max(CAT_ELO_MIN, Math.min(CAT_ELO_MAX, Math.round(v)));
  }

  // Actualització d'Elo del col·lectiu segons el resultat (S: 1 victòria, 0.5
  // taules, 0 derrota dels Catalans) contra un Stockfish de força sfElo.
  function updatedCatalansElo(catalansElo, sfElo, S, gameNumber) {
    const expected = 1 / (1 + Math.pow(10, (sfElo - catalansElo) / 400));
    const K = gameNumber <= 10 ? 40 : 24;
    return clampCatElo(catalansElo + K * (S - expected));
  }

  // ---------------------------------------------------------------------------
  //  Inicialització del document (crea'l si no existeix)
  // ---------------------------------------------------------------------------
  function ensureDoc() {
    return docRef.get().then(function (snap) {
      if (snap.exists) return;
      return docRef.set(freshGameState(null));
    }).catch(function (e) { console.warn('[Catalans] ensureDoc', e); });
  }

  // ---------------------------------------------------------------------------
  //  Subscripció en temps real
  // ---------------------------------------------------------------------------
  function subscribe() {
    if (unsub) { unsub(); unsub = null; }
    unsub = docRef.onSnapshot(function (snap) {
      if (!snap.exists) { ensureDoc(); return; }
      state = snap.data();
      onStateChanged();
    }, function (err) {
      console.warn('[Catalans] onSnapshot', err);
      setStatus('Error de connexió amb la partida global.');
    });
  }

  // ---------------------------------------------------------------------------
  //  Reacció a un nou estat
  // ---------------------------------------------------------------------------
  function onStateChanged() {
    if (!state) return;

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
      pendingHistory = null;
      return db.runTransaction(function (tx) {
        return tx.get(docRef).then(function (snap) {
          const d = snap.data();
          if (!d || d.phase !== 'catalans' || d.ply !== expectedPly) return; // ja resolt
          if (Date.now() < (d.deadlineAt || 0)) return;                       // encara hi ha temps
          applyMoveInTransaction(tx, d, winnerUci, 'catalans');
        });
      }).then(flushPendingHistory);
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
    setStatus('Stockfish està pensant…');
    return Engine.move(fen, sfElo).then(function (uci) {
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
  function applyMoveInTransaction(tx, d, uci, mover) {
    const c = newChess(d.fen);
    const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || 'q' });
    if (!mv) return; // jugada il·legal: no facis res

    const now = Date.now();
    const movesSan = (d.movesSan || []).concat(mv.san);
    const movesUci = (d.movesUci || []).concat(uciOf(mv));
    const lastMove = { uci: uciOf(mv), san: mv.san, by: mover, from: mv.from, to: mv.to };

    const base = {
      fen: c.fen(),
      movesSan: movesSan,
      movesUci: movesUci,
      ply: (d.ply || 0) + 1,
      lastMove: lastMove,
      votes: {},                 // neteja els vots per al proper torn
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
      const newCatElo = updatedCatalansElo(d.catalansElo || START_SF_ELO, d.sfElo || START_SF_ELO, S, d.gameNumber || 1);
      const summary = {
        gameNumber: d.gameNumber || 1,
        result: result,
        sfElo: d.sfElo || START_SF_ELO,
        prevCatalansElo: d.catalansElo || START_SF_ELO,
        catalansElo: newCatElo,
        movesSan: movesSan,
        date: now
      };
      tx.update(docRef, Object.assign(base, {
        phase: 'finished',
        result: result,
        catalansElo: newCatElo,
        nextSfElo: clampSfElo(newCatElo),     // la propera partida, Stockfish juga a l'estimació
        deadlineAt: now + RESULT_DISPLAY_MS,
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
    return isCatalansTurn() && !!currentUser();
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

  function fmtDuration(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + sec + 's';
    return sec + 's';
  }

  function renderInfo() {
    $('#catalans-game-number').text('Partida #' + (state.gameNumber || 1));
    $('#catalans-elo').text(Math.round(state.catalansElo || START_SF_ELO));
    $('#catalans-sf-elo').text(Math.round(state.sfElo || START_SF_ELO));

    // Resum de l'última partida acabada.
    const lg = state.lastGame;
    if (lg) {
      const r = lg.result === 'catalans' ? '✅ Han guanyat els Catalans'
        : lg.result === 'stockfish' ? '❌ Ha guanyat Stockfish'
        : '🤝 Taules';
      const delta = Math.round(lg.catalansElo - lg.prevCatalansElo);
      const arrow = delta > 0 ? '▲ +' + delta : (delta < 0 ? '▼ ' + delta : '±0');
      $('#catalans-lastgame').html(
        'Partida #' + lg.gameNumber + ': ' + r +
        ' · ELO col·lectiu ' + Math.round(lg.catalansElo) + ' (' + arrow + ')'
      ).show();
    } else {
      $('#catalans-lastgame').hide();
    }

    // Llista de moviments.
    const moves = state.movesSan || [];
    let pgn = '';
    for (let i = 0; i < moves.length; i += 2) {
      pgn += (i / 2 + 1) + '. ' + moves[i] + (moves[i + 1] ? ' ' + moves[i + 1] + ' ' : ' ');
    }
    $('#catalans-moves').text(pgn || '—');
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
      const row = $(
        '<div class="catalans-vote-row' + mine + '">' +
        '<span class="catalans-vote-san">' + item.san + '</span>' +
        '<span class="catalans-vote-bar"><span style="width:' + pct + '%"></span></span>' +
        '<span class="catalans-vote-n">' + item.n + '</span>' +
        '</div>'
      );
      container.append(row);
    });
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
      if (left <= 0) maybeDriveTransition();
    } else if (state.phase === 'stockfish') {
      $('#catalans-phase').text('🟣 Torn de Stockfish');
      $('#catalans-countdown').text('Stockfish està movent…');
    } else if (state.phase === 'finished') {
      const r = state.result === 'catalans' ? 'Han guanyat els Catalans! ✅'
        : state.result === 'stockfish' ? 'Ha guanyat Stockfish ❌' : 'Taules 🤝';
      $('#catalans-phase').text('🏁 Partida acabada — ' + r);
      $('#catalans-countdown').text('Nova partida en ' + fmtDuration((state.deadlineAt || 0) - now));
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
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
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
  });
})();
