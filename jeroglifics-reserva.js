// Reserva de jeroglífics minats per autojoc de Stockfish 19 i verificats amb
// la mateixa prova que el generador de l'app (hieroclosure.js). L'app la fa
// servir com a banc acumulat de nous. No s'edita a mà: es regenera amb
// `node scripts/mine-hieroglyphics.js`.
(function (root) {
    'use strict';
// >>> RESERVA (generat) >>>
const RESERVE = [
 {
  "id": "hgr_6k14qppp83R4r2pP37P5PP12R3K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "6k1/4qppp/8/3R4/r2pP3/7P/5PP1/2R3K1 w - - 0 34",
  "sideToMove": "w",
  "line": [
   "c1c8",
   "e7f8",
   "d5d8",
   "g7g6",
   "d8f8"
  ],
  "sanLine": [
   "Rc8+",
   "Qf8",
   "Rdd8",
   "g6",
   "Rxf8+"
  ],
  "finalType": "pin",
  "difficulty": 52,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "c1c8",
  "bestMoveSan": "Rc8+",
  "solutionMoves": [
   "c1c8",
   "d5d8",
   "d8f8"
  ],
  "replyMoves": [
   "e7f8",
   "g7g6"
  ],
  "theme": "pin",
  "tacticKind": "clavada",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "6k1/4qppp/8/3R4/r2pP3/7P/5PP1/2R3K1 w - - 0 34",
   "line": [
    "c1c8",
    "e7f8",
    "d5d8",
    "g7g6",
    "d8f8"
   ],
   "finalFen": "2R2Rk1/5p1p/6p1/8/r2pP3/7P/5PP1/6K1 b - - 0 36",
   "kind": "material",
   "finalSan": "Rxf8+",
   "gain": 9,
   "checkedReplies": 1,
   "checkedAlternatives": 23,
   "explanation": "Rxf8+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 9 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "f3",
   "alternativeLine": [
    "f3",
    "Qxd8",
    "Rxd8+",
    "Kg7"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 15
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "kind": "refused",
     "step": 2,
     "offered": "r",
     "offerUci": "d5d8",
     "replyUci": "g7g6",
     "captureUci": "f8d8",
     "acceptedFen": "2Rq2k1/5ppp/8/8/r2pP3/7P/5PP1/6K1 w - - 0 36",
     "square": "d8",
     "loss": 5,
     "compensationKind": "material",
     "checkedDepth": 18,
     "captureEvalType": "mate",
     "captureEval": 1
    }
   ]
  },
  "finalMotif": "pin",
  "finalMotifs": [
   "pin",
   "major_win",
   "check"
  ],
  "finalMotifLabel": "clavada",
  "finalMotifReason": "Segona jugada (Rdd8): La torre a d8 clava la dama contra el rei. La jugada final (Rxf8+) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "6k1/4qppp/8/3R4/r2pP3/7P/5PP1/2R3K1 w - - 0 34",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 52,
  "ratingEstimate": null,
  "pv": [
   "c1c8",
   "e7f8",
   "d5d8",
   "g7g6",
   "d8f8"
  ],
  "evalBefore": 502,
  "publishedAt": 1793975227023
 },
 {
  "id": "hgr_6k11p61r2pr2p2p2p13P1N1bP3P3KP3n2R3BR2wg",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "6k1/1p6/1r2pr2/p2p2p1/3P1N1b/P3P3/KP3n2/R3BR2 w - g6 0 32",
  "sideToMove": "w",
  "line": [
   "e1f2",
   "h4f2",
   "f4d3",
   "f2e3",
   "f1f6"
  ],
  "sanLine": [
   "Bxf2",
   "Bxf2",
   "Nd3",
   "Bxe3",
   "Rxf6"
  ],
  "finalType": "pin",
  "difficulty": 36,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "e1f2",
  "bestMoveSan": "Bxf2",
  "solutionMoves": [
   "e1f2",
   "f4d3",
   "f1f6"
  ],
  "replyMoves": [
   "h4f2",
   "f2e3"
  ],
  "theme": "pin",
  "tacticKind": "clavada",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "6k1/1p6/1r2pr2/p2p2p1/3P1N1b/P3P3/KP3n2/R3BR2 w - g6 0 32",
   "line": [
    "e1f2",
    "h4f2",
    "f4d3",
    "f2e3",
    "f1f6"
   ],
   "finalFen": "6k1/1p6/1r2pR2/p2p2p1/3P4/P2Nb3/KP6/R7 b - - 0 34",
   "kind": "material",
   "finalSan": "Rxf6",
   "gain": 3,
   "checkedReplies": 19,
   "checkedAlternatives": 25,
   "explanation": "Rxf6 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Rg1",
   "alternativeLine": [
    "Rg1",
    "Bxg1",
    "Rxg1",
    "Rf5"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -483
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "pin",
  "finalMotifs": [
   "pin",
   "major_win"
  ],
  "finalMotifLabel": "clavada",
  "finalMotifReason": "La torre a f6 clava el peó contra la torre.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "6k1/1p6/1r2pr2/p2p2p1/3P1N1b/P3P3/KP3n2/R3BR2 w - g6 0 32",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 36,
  "ratingEstimate": null,
  "pv": [
   "e1f2",
   "h4f2",
   "f4d3",
   "f2e3",
   "f1f6"
  ],
  "evalBefore": 470,
  "publishedAt": 1793975090533
 },
 {
  "id": "hgr_3r3k3q2pp2rb4p3Bp22QP41P4P1P4P1P2R3K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "3r3k/3q2pp/2rb4/p3Bp2/2QP4/1P4P1/P4P1P/2R3K1 w - - 0 23",
  "sideToMove": "w",
  "line": [
   "c4c6",
   "d7c6",
   "c1c6",
   "d6e5",
   "d4e5"
  ],
  "sanLine": [
   "Qxc6",
   "Qxc6",
   "Rxc6",
   "Bxe5",
   "dxe5"
  ],
  "finalType": "major_win",
  "difficulty": 56,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "c4c6",
  "bestMoveSan": "Qxc6",
  "solutionMoves": [
   "c4c6",
   "c1c6",
   "d4e5"
  ],
  "replyMoves": [
   "d7c6",
   "d6e5"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "3r3k/3q2pp/2rb4/p3Bp2/2QP4/1P4P1/P4P1P/2R3K1 w - - 0 23",
   "line": [
    "c4c6",
    "d7c6",
    "c1c6",
    "d6e5",
    "d4e5"
   ],
   "finalFen": "3r3k/6pp/2R5/p3Pp2/8/1P4P1/P4P1P/6K1 b - - 0 25",
   "kind": "material",
   "finalSan": "dxe5",
   "gain": 5,
   "checkedReplies": 20,
   "checkedAlternatives": 26,
   "explanation": "dxe5 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 5 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Rc5",
   "alternativeLine": [
    "Rc5",
    "Bxd4",
    "Rxa5",
    "g6"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -218
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 1,
     "offered": "q",
     "offerUci": "c4c6",
     "replyUci": "d7c6",
     "square": "c6",
     "loss": 4,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 526
    }
   ]
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 5 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "3r3k/3q2pp/2rb4/p3Bp2/2QP4/1P4P1/P4P1P/2R3K1 w - - 0 23",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 56,
  "ratingEstimate": null,
  "pv": [
   "c4c6",
   "d7c6",
   "c1c6",
   "d6e5",
   "d4e5"
  ],
  "evalBefore": 492,
  "publishedAt": 1793975049522
 },
 {
  "id": "hgr_r75r2pq3nk13p1N1p1P1P1PpPP5P12Q54R1K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "r7/5r2/pq3nk1/3p1N1p/1P1P1PpP/P5P1/2Q5/4R1K1 w - - 1 43",
  "sideToMove": "w",
  "line": [
   "f5e7",
   "g6g7",
   "c2g6",
   "g7h8",
   "g6f7"
  ],
  "sanLine": [
   "Ne7+",
   "Kg7",
   "Qg6+",
   "Kh8",
   "Qxf7"
  ],
  "finalType": "fork",
  "difficulty": 38,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "f5e7",
  "bestMoveSan": "Ne7+",
  "solutionMoves": [
   "f5e7",
   "c2g6",
   "g6f7"
  ],
  "replyMoves": [
   "g6g7",
   "g7h8"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "r7/5r2/pq3nk1/3p1N1p/1P1P1PpP/P5P1/2Q5/4R1K1 w - - 1 43",
   "line": [
    "f5e7",
    "g6g7",
    "c2g6",
    "g7h8",
    "g6f7"
   ],
   "finalFen": "r6k/4NQ2/pq3n2/3p3p/1P1P1PpP/P5P1/8/4R1K1 b - - 0 45",
   "kind": "material",
   "finalSan": "Qxf7",
   "gain": 4,
   "checkedReplies": 26,
   "checkedAlternatives": 36,
   "explanation": "Qxf7 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Kg2",
   "alternativeLine": [
    "Kg2",
    "Rh7",
    "Qg5",
    "Qd6"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -48
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Segona jugada (Qg6+): La dama a g6 ataca alhora la torre i el cavall i el rei. La jugada final (Qxf7) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "r7/5r2/pq3nk1/3p1N1p/1P1P1PpP/P5P1/2Q5/4R1K1 w - - 1 43",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 38,
  "ratingEstimate": null,
  "pv": [
   "f5e7",
   "g6g7",
   "c2g6",
   "g7h8",
   "g6f7"
  ],
  "evalBefore": 539,
  "publishedAt": 1793922666025
 },
 {
  "id": "hgr_1brr2k11bqn1pp11p2p2pp6n2PPB3P1N2N1P1B2Q",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "1brr2k1/1bqn1pp1/1p2p2p/p6n/2PPB3/P1N2N1P/1B2QPP1/3RR1K1 w - - 5 23",
  "sideToMove": "w",
  "line": [
   "c3b5",
   "h5f4",
   "e2f1",
   "b7e4",
   "b5c7"
  ],
  "sanLine": [
   "Nb5",
   "Nf4",
   "Qf1",
   "Bxe4",
   "Nxc7"
  ],
  "finalType": "major_win",
  "difficulty": 38,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "c3b5",
  "bestMoveSan": "Nb5",
  "solutionMoves": [
   "c3b5",
   "e2f1",
   "b5c7"
  ],
  "replyMoves": [
   "h5f4",
   "b7e4"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "1brr2k1/1bqn1pp1/1p2p2p/p6n/2PPB3/P1N2N1P/1B2QPP1/3RR1K1 w - - 5 23",
   "line": [
    "c3b5",
    "h5f4",
    "e2f1",
    "b7e4",
    "b5c7"
   ],
   "finalFen": "1brr2k1/2Nn1pp1/1p2p2p/p7/2PPbn2/P4N1P/1B3PP1/3RRQK1 b - - 0 25",
   "kind": "material",
   "finalSan": "Nxc7",
   "gain": 3,
   "checkedReplies": 38,
   "checkedAlternatives": 29,
   "explanation": "Nxc7 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Rxe4",
   "alternativeLine": [
    "Rxe4",
    "Qxc4",
    "Ree1",
    "Nf6"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -324
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 6 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "1brr2k1/1bqn1pp1/1p2p2p/p6n/2PPB3/P1N2N1P/1B2QPP1/3RR1K1 w - - 5 23",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 38,
  "ratingEstimate": null,
  "pv": [
   "c3b5",
   "h5f4",
   "e2f1",
   "b7e4",
   "b5c7"
  ],
  "evalBefore": 362,
  "publishedAt": 1793922408364
 },
 {
  "id": "hgr_8pp2bqk14R32r1p1p14P31P4PQP4P1P6K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "8/pp2bqk1/4R3/2r1p1p1/4P3/1P4PQ/P4P1P/6K1 w - - 3 31",
  "sideToMove": "w",
  "line": [
   "h3h6",
   "g7g8",
   "e6g6",
   "f7g6",
   "h6g6"
  ],
  "sanLine": [
   "Qh6+",
   "Kg8",
   "Rg6+",
   "Qxg6",
   "Qxg6+"
  ],
  "finalType": "major_win",
  "difficulty": 52,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "h3h6",
  "bestMoveSan": "Qh6+",
  "solutionMoves": [
   "h3h6",
   "e6g6",
   "h6g6"
  ],
  "replyMoves": [
   "g7g8",
   "f7g6"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "8/pp2bqk1/4R3/2r1p1p1/4P3/1P4PQ/P4P1P/6K1 w - - 3 31",
   "line": [
    "h3h6",
    "g7g8",
    "e6g6",
    "f7g6",
    "h6g6"
   ],
   "finalFen": "6k1/pp2b3/6Q1/2r1p1p1/4P3/1P4P1/P4P1P/6K1 b - - 0 33",
   "kind": "material",
   "finalSan": "Qxg6+",
   "gain": 4,
   "checkedReplies": 2,
   "checkedAlternatives": 19,
   "explanation": "Qxg6+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Qh3",
   "alternativeLine": [
    "Qh3",
    "Rc1+",
    "Qf1",
    "Rxf1+"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -1290
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 2,
     "offered": "r",
     "offerUci": "e6g6",
     "replyUci": "f7g6",
     "square": "g6",
     "loss": 5,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 612
    }
   ]
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win",
   "check"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 4 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "8/pp2bqk1/4R3/2r1p1p1/4P3/1P4PQ/P4P1P/6K1 w - - 3 31",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 52,
  "ratingEstimate": null,
  "pv": [
   "h3h6",
   "g7g8",
   "e6g6",
   "f7g6",
   "h6g6"
  ],
  "evalBefore": 608,
  "publishedAt": 1793922226361
 },
 {
  "fen": "6k1/1p3rq1/4Q1R1/6p1/5p2/P3p3/1PP2PP1/2K4R w - - 0 40",
  "solutionMoves": [
   "g6g7",
   "e6h6",
   "h6h8"
  ],
  "replyMoves": [
   "g8g7",
   "g7g8"
  ],
  "stepAlternatives": [],
  "stepEvals": [],
  "stepPvs": [],
  "conclusion": {
   "version": 1,
   "fen": "6k1/1p3rq1/4Q1R1/6p1/5p2/P3p3/1PP2PP1/2K4R w - - 0 40",
   "line": [
    "g6g7",
    "g8g7",
    "e6h6",
    "g7g8",
    "h6h8"
   ],
   "finalFen": "6kQ/1p3r2/8/6p1/5p2/P3p3/1PP2PP1/2K4R b - - 3 42",
   "kind": "mate",
   "finalSan": "Qh8#",
   "gain": null,
   "checkedReplies": 0,
   "checkedAlternatives": 45,
   "explanation": "Qh8# culmina un mat forçat en tres jugades, demostrat comprovant totes les defenses legals.",
   "uniqueness": "Una única primera jugada força mat en tres; s’han comprovat exhaustivament les defenses possibles.",
   "alternativeSan": null,
   "alternativeLine": [],
   "alternativeEval": null,
   "minDepth": 0,
   "requestedDepth": 0,
   "sacrifices": [],
   "proofMethod": "exhaustive_mate_tree",
   "proofNodes": 28373
  },
  "id": "hgr_6k11p3rq14Q1R16p15p2P3p31PP2PP12K4Rw",
  "source": "reserve",
  "sideToMove": "w",
  "line": [
   "g6g7",
   "g8g7",
   "e6h6",
   "g7g8",
   "h6h8"
  ],
  "sanLine": [
   "Rxg7+",
   "Kxg7",
   "Qh6+",
   "Kg8",
   "Qh8#"
  ],
  "bestMove": "g6g7",
  "bestMoveSan": "Rxg7+",
  "finalType": "mate",
  "finalMotif": "mate",
  "finalMotifs": [
   "mate"
  ],
  "theme": "mate",
  "tacticKind": "escac i mat",
  "difficulty": 75,
  "difficultyPercent": 75,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "playerMove": null,
  "origin": "stockfish19_lozza3_mate3",
  "sourceGameId": null,
  "sourceFen": "6k1/1p3rq1/4Q1R1/6p1/5p2/P3p3/1PP2PP1/2K4R w - - 0 40",
  "sourceMoveNumber": 40,
  "adaptationNote": null,
  "pv": [
   "g6g7",
   "g8g7",
   "e6h6",
   "g7g8",
   "h6h8"
  ],
  "evalBefore": null,
  "ratingEstimate": null,
  "createdAt": 0,
  "updatedAt": 0,
  "publishedAt": 1793909402967
 },
 {
  "fen": "5k2/1R4p1/3rBp2/B4P2/P2p4/6Pp/3K3P/8 w - - 1 35",
  "solutionMoves": [
   "a5b4",
   "b4d6",
   "b7b8"
  ],
  "replyMoves": [
   "f8e8",
   "e8d8"
  ],
  "stepAlternatives": [],
  "stepEvals": [],
  "stepPvs": [],
  "conclusion": {
   "version": 1,
   "fen": "5k2/1R4p1/3rBp2/B4P2/P2p4/6Pp/3K3P/8 w - - 1 35",
   "line": [
    "a5b4",
    "f8e8",
    "b4d6",
    "e8d8",
    "b7b8"
   ],
   "finalFen": "1R1k4/6p1/3BBp2/5P2/P2p4/6Pp/3K3P/8 b - - 2 37",
   "kind": "mate",
   "finalSan": "Rb8#",
   "gain": null,
   "checkedReplies": 0,
   "checkedAlternatives": 32,
   "explanation": "Rb8# culmina un mat forçat en tres jugades, demostrat comprovant totes les defenses legals.",
   "uniqueness": "Una única primera jugada força mat en tres; s’han comprovat exhaustivament les defenses possibles.",
   "alternativeSan": null,
   "alternativeLine": [],
   "alternativeEval": null,
   "minDepth": 0,
   "requestedDepth": 0,
   "sacrifices": [],
   "proofMethod": "exhaustive_mate_tree",
   "proofNodes": 11586
  },
  "id": "hgr_5k21R4p13rBp2B4P2P2p46Pp3K3P8w",
  "source": "reserve",
  "sideToMove": "w",
  "line": [
   "a5b4",
   "f8e8",
   "b4d6",
   "e8d8",
   "b7b8"
  ],
  "sanLine": [
   "Bb4",
   "Ke8",
   "Bxd6",
   "Kd8",
   "Rb8#"
  ],
  "bestMove": "a5b4",
  "bestMoveSan": "Bb4",
  "finalType": "mate",
  "finalMotif": "mate",
  "finalMotifs": [
   "mate"
  ],
  "theme": "mate",
  "tacticKind": "escac i mat",
  "difficulty": 75,
  "difficultyPercent": 75,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "playerMove": null,
  "origin": "stockfish19_lozza3_mate3",
  "sourceGameId": null,
  "sourceFen": "5k2/1R4p1/3rBp2/B4P2/P2p4/6Pp/3K3P/8 w - - 1 35",
  "sourceMoveNumber": 35,
  "adaptationNote": null,
  "pv": [
   "a5b4",
   "f8e8",
   "b4d6",
   "e8d8",
   "b7b8"
  ],
  "evalBefore": null,
  "ratingEstimate": null,
  "createdAt": 0,
  "updatedAt": 0,
  "publishedAt": 1793909295734
 },
 {
  "fen": "5k2/1R3B2/3r1p2/5Pp1/PB1p4/6Pp/3K3P/8 w - g6 0 37",
  "solutionMoves": [
   "f7e6",
   "b4d6",
   "b7b8"
  ],
  "replyMoves": [
   "f8e8",
   "e8d8"
  ],
  "stepAlternatives": [],
  "stepEvals": [],
  "stepPvs": [],
  "conclusion": {
   "version": 1,
   "fen": "5k2/1R3B2/3r1p2/5Pp1/PB1p4/6Pp/3K3P/8 w - g6 0 37",
   "line": [
    "f7e6",
    "f8e8",
    "b4d6",
    "e8d8",
    "b7b8"
   ],
   "finalFen": "1R1k4/8/3BBp2/5Pp1/P2p4/6Pp/3K3P/8 b - - 2 39",
   "kind": "mate",
   "finalSan": "Rb8#",
   "gain": null,
   "checkedReplies": 0,
   "checkedAlternatives": 29,
   "explanation": "Rb8# culmina un mat forçat en tres jugades, demostrat comprovant totes les defenses legals.",
   "uniqueness": "Una única primera jugada força mat en tres; s’han comprovat exhaustivament les defenses possibles.",
   "alternativeSan": null,
   "alternativeLine": [],
   "alternativeEval": null,
   "minDepth": 0,
   "requestedDepth": 0,
   "sacrifices": [],
   "proofMethod": "exhaustive_mate_tree",
   "proofNodes": 17999
  },
  "id": "hgr_5k21R3B23r1p25Pp1PB1p46Pp3K3P8wg6",
  "source": "reserve",
  "sideToMove": "w",
  "line": [
   "f7e6",
   "f8e8",
   "b4d6",
   "e8d8",
   "b7b8"
  ],
  "sanLine": [
   "Be6",
   "Ke8",
   "Bxd6",
   "Kd8",
   "Rb8#"
  ],
  "bestMove": "f7e6",
  "bestMoveSan": "Be6",
  "finalType": "mate",
  "finalMotif": "mate",
  "finalMotifs": [
   "mate"
  ],
  "theme": "mate",
  "tacticKind": "escac i mat",
  "difficulty": 75,
  "difficultyPercent": 75,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "playerMove": null,
  "origin": "stockfish19_lozza3_mate3",
  "sourceGameId": null,
  "sourceFen": "5k2/1R3B2/3r1p2/5Pp1/PB1p4/6Pp/3K3P/8 w - g6 0 37",
  "sourceMoveNumber": 37,
  "adaptationNote": null,
  "pv": [
   "f7e6",
   "f8e8",
   "b4d6",
   "e8d8",
   "b7b8"
  ],
  "evalBefore": null,
  "ratingEstimate": null,
  "createdAt": 0,
  "updatedAt": 0,
  "publishedAt": 1793909189354
 },
 {
  "id": "hgr_r1q55k24p1pp2Np1p21brP1P21R2P36PPRQ4K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "r1q5/5k2/4p1pp/2Np1p2/1brP1P2/1R2P3/6PP/RQ4K1 w - - 6 30",
  "sideToMove": "w",
  "line": [
   "a1a8",
   "c8a8",
   "b3b4",
   "c4b4",
   "b1b4"
  ],
  "sanLine": [
   "Rxa8",
   "Qxa8",
   "Rxb4",
   "Rxb4",
   "Qxb4"
  ],
  "finalType": "major_win",
  "difficulty": 57,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "a1a8",
  "bestMoveSan": "Rxa8",
  "solutionMoves": [
   "a1a8",
   "b3b4",
   "b1b4"
  ],
  "replyMoves": [
   "c8a8",
   "c4b4"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "r1q5/5k2/4p1pp/2Np1p2/1brP1P2/1R2P3/6PP/RQ4K1 w - - 6 30",
   "line": [
    "a1a8",
    "c8a8",
    "b3b4",
    "c4b4",
    "b1b4"
   ],
   "finalFen": "q7/5k2/4p1pp/2Np1p2/1Q1P1P2/4P3/6PP/6K1 b - - 0 32",
   "kind": "material",
   "finalSan": "Qxb4",
   "gain": 3,
   "checkedReplies": 25,
   "checkedAlternatives": 28,
   "explanation": "Qxb4 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Qe1",
   "alternativeLine": [
    "Qe1",
    "Qb8",
    "Kf2",
    "Rb2+"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -262
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 2,
     "offered": "r",
     "offerUci": "b3b4",
     "replyUci": "c4b4",
     "square": "b4",
     "loss": 2,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 588
    }
   ]
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "r1q5/5k2/4p1pp/2Np1p2/1brP1P2/1R2P3/6PP/RQ4K1 w - - 6 30",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 57,
  "ratingEstimate": null,
  "pv": [
   "a1a8",
   "c8a8",
   "b3b4",
   "c4b4",
   "b1b4"
  ],
  "evalBefore": 589,
  "publishedAt": 1793890616637
 },
 {
  "id": "hgr_81p4k12bp1Np12p1bPKp2P1P31P1B1QP17r5R2b",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "8/1p4k1/2bp1Np1/2p1bPKp/2P1P3/1P1B1QP1/7r/5R2 b - - 0 46",
  "sideToMove": "b",
  "line": [
   "e5f6",
   "g5f4",
   "g6g5",
   "f4e3",
   "f6d4"
  ],
  "sanLine": [
   "Bxf6+",
   "Kf4",
   "g5+",
   "Ke3",
   "Bd4#"
  ],
  "finalType": "mate",
  "difficulty": 53,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "e5f6",
  "bestMoveSan": "Bxf6+",
  "solutionMoves": [
   "e5f6",
   "g6g5",
   "f6d4"
  ],
  "replyMoves": [
   "g5f4",
   "f4e3"
  ],
  "theme": "mate",
  "tacticKind": "escac i mat",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "8/1p4k1/2bp1Np1/2p1bPKp/2P1P3/1P1B1QP1/7r/5R2 b - - 0 46",
   "line": [
    "e5f6",
    "g5f4",
    "g6g5",
    "f4e3",
    "f6d4"
   ],
   "finalFen": "8/1p4k1/2bp4/2p2Ppp/2PbP3/1P1BKQP1/7r/5R2 w - - 2 49",
   "kind": "mate",
   "finalSan": "Bd4#",
   "gain": null,
   "checkedReplies": 0,
   "checkedAlternatives": 33,
   "explanation": "Bd4# és escac i mat: el rei està amenaçat i el rival no té cap resposta legal.",
   "uniqueness": "S’han comprovat les altres 33 jugades legals: cap no fa mat en aquesta posició.",
   "alternativeSan": "g4",
   "alternativeLine": [
    "g4",
    "Qd1",
    "Bd4+",
    "Kf4"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 0
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "mate",
  "finalMotifs": [
   "mate",
   "check"
  ],
  "finalMotifLabel": "escac i mat",
  "finalMotifReason": "La seqüència acaba en escac i mat.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "8/1p4k1/2bp1Np1/2p1bPKp/2P1P3/1P1B1QP1/7r/5R2 b - - 0 46",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 53,
  "ratingEstimate": null,
  "pv": [
   "e5f6",
   "g5f4",
   "g6g5",
   "f4e3",
   "f6d4"
  ],
  "evalBefore": 9970,
  "publishedAt": 1793890279326
 },
 {
  "id": "hgr_2r5P3k1p181N4p1P782P4P2K5w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "2r5/P3k1p1/8/1N4p1/P7/8/2P4P/2K5 w - - 1 44",
  "sideToMove": "w",
  "line": [
   "b5c7",
   "e7d6",
   "a7a8q",
   "c8a8",
   "c7a8"
  ],
  "sanLine": [
   "Nc7",
   "Kd6",
   "a8=Q",
   "Rxa8",
   "Nxa8"
  ],
  "finalType": "major_win",
  "difficulty": 52,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "b5c7",
  "bestMoveSan": "Nc7",
  "solutionMoves": [
   "b5c7",
   "a7a8q",
   "c7a8"
  ],
  "replyMoves": [
   "e7d6",
   "c8a8"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "2r5/P3k1p1/8/1N4p1/P7/8/2P4P/2K5 w - - 1 44",
   "line": [
    "b5c7",
    "e7d6",
    "a7a8q",
    "c8a8",
    "c7a8"
   ],
   "finalFen": "N7/6p1/3k4/6p1/P7/8/2P4P/2K5 b - - 0 46",
   "kind": "material",
   "finalSan": "Nxa8",
   "gain": 4,
   "checkedReplies": 9,
   "checkedAlternatives": 14,
   "explanation": "Nxa8 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Nb5+",
   "alternativeLine": [
    "Nb5+",
    "Ke5",
    "Nc3",
    "Rh8"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -478
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "kind": "refused",
     "step": 1,
     "offered": "n",
     "offerUci": "b5c7",
     "replyUci": "e7d6",
     "captureUci": "c8c7",
     "acceptedFen": "8/P1r1k1p1/8/6p1/P7/8/2P4P/2K5 w - - 0 45",
     "square": "c7",
     "loss": 3,
     "compensationKind": "material",
     "checkedDepth": 18,
     "captureEvalType": "cp",
     "captureEval": 830
    }
   ]
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 4 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "2r5/P3k1p1/8/1N4p1/P7/8/2P4P/2K5 w - - 1 44",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 52,
  "ratingEstimate": null,
  "pv": [
   "b5c7",
   "e7d6",
   "a7a8q",
   "c8a8",
   "c7a8"
  ],
  "evalBefore": 716,
  "publishedAt": 1793890234751
 },
 {
  "id": "hgr_3q1rk16Bp4p1p12r2p21PB4P85PP14Q1K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "3q1rk1/6Bp/4p1p1/2r2p2/1PB4P/8/5PP1/4Q1K1 w - - 0 40",
  "sideToMove": "w",
  "line": [
   "g7f8",
   "c5c4",
   "e1e6",
   "g8f8",
   "e6c4"
  ],
  "sanLine": [
   "Bxf8",
   "Rxc4",
   "Qxe6+",
   "Kxf8",
   "Qxc4"
  ],
  "finalType": "fork",
  "difficulty": 37,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "g7f8",
  "bestMoveSan": "Bxf8",
  "solutionMoves": [
   "g7f8",
   "e1e6",
   "e6c4"
  ],
  "replyMoves": [
   "c5c4",
   "g8f8"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "3q1rk1/6Bp/4p1p1/2r2p2/1PB4P/8/5PP1/4Q1K1 w - - 0 40",
   "line": [
    "g7f8",
    "c5c4",
    "e1e6",
    "g8f8",
    "e6c4"
   ],
   "finalFen": "3q1k2/7p/6p1/5p2/1PQ4P/8/5PP1/6K1 b - - 0 42",
   "kind": "material",
   "finalSan": "Qxc4",
   "gain": 4,
   "checkedReplies": 25,
   "checkedAlternatives": 28,
   "explanation": "Qxc4 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "g3",
   "alternativeLine": [
    "g3",
    "Qd4",
    "b5",
    "Rc2"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -628
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Segona jugada (Qxe6+): La dama a e6 ataca alhora el rei i la torre. La jugada final (Qxc4) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "3q1rk1/6Bp/4p1p1/2r2p2/1PB4P/8/5PP1/4Q1K1 w - - 0 40",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 37,
  "ratingEstimate": null,
  "pv": [
   "g7f8",
   "c5c4",
   "e1e6",
   "g8f8",
   "e6c4"
  ],
  "evalBefore": 398,
  "publishedAt": 1793836011395
 },
 {
  "id": "hgr_k4q27pPpNr2p184Q2P6p15P1K8w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "k4q2/7p/PpNr2p1/8/4Q2P/6p1/5P1K/8 w - - 0 49",
  "sideToMove": "w",
  "line": [
   "h2g3",
   "d6d7",
   "c6e5",
   "a8a7",
   "e5d7"
  ],
  "sanLine": [
   "Kxg3",
   "Rd7",
   "Ne5+",
   "Ka7",
   "Nxd7"
  ],
  "finalType": "discovery",
  "difficulty": 45,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "h2g3",
  "bestMoveSan": "Kxg3",
  "solutionMoves": [
   "h2g3",
   "c6e5",
   "e5d7"
  ],
  "replyMoves": [
   "d6d7",
   "a8a7"
  ],
  "theme": "discovery",
  "tacticKind": "descoberta",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "k4q2/7p/PpNr2p1/8/4Q2P/6p1/5P1K/8 w - - 0 49",
   "line": [
    "h2g3",
    "d6d7",
    "c6e5",
    "a8a7",
    "e5d7"
   ],
   "finalFen": "5q2/k2N3p/Pp4p1/8/4Q2P/6K1/5P2/8 b - - 0 51",
   "kind": "material",
   "finalSan": "Nxd7",
   "gain": 5,
   "checkedReplies": 25,
   "checkedAlternatives": 35,
   "explanation": "Nxd7 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 5 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Nc6+",
   "alternativeLine": [
    "Nc6+",
    "Kxa6",
    "Qa4+",
    "Kb7"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 0
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "discovery",
  "finalMotifs": [
   "discovery",
   "major_win"
  ],
  "finalMotifLabel": "descoberta",
  "finalMotifReason": "Segona jugada (Ne5+): En moure a e5 es destapa un escac descobert de la dama. La jugada final (Nxd7) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "k4q2/7p/PpNr2p1/8/4Q2P/6p1/5P1K/8 w - - 0 49",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 45,
  "ratingEstimate": null,
  "pv": [
   "h2g3",
   "d6d7",
   "c6e5",
   "a8a7",
   "e5d7"
  ],
  "evalBefore": 477,
  "publishedAt": 1793836007288
 },
 {
  "id": "hgr_5rk12R2p1p5rp13pQ3p3P1PqP3P31P2B33R2K1b",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "5rk1/2R2p1p/5rp1/3pQ3/p3P1Pq/P3P3/1P2B3/3R2K1 b - - 2 39",
  "sideToMove": "b",
  "line": [
   "h4f2",
   "g1h1",
   "f2e2",
   "e5f6",
   "e2d1"
  ],
  "sanLine": [
   "Qf2+",
   "Kh1",
   "Qxe2",
   "Qxf6",
   "Qxd1+"
  ],
  "finalType": "major_win",
  "difficulty": 33,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "h4f2",
  "bestMoveSan": "Qf2+",
  "solutionMoves": [
   "h4f2",
   "f2e2",
   "e2d1"
  ],
  "replyMoves": [
   "g1h1",
   "e5f6"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "5rk1/2R2p1p/5rp1/3pQ3/p3P1Pq/P3P3/1P2B3/3R2K1 b - - 2 39",
   "line": [
    "h4f2",
    "g1h1",
    "f2e2",
    "e5f6",
    "e2d1"
   ],
   "finalFen": "5rk1/2R2p1p/5Qp1/3p4/p3P1P1/P3P3/1P6/3q3K w - - 0 42",
   "kind": "material",
   "finalSan": "Qxd1+",
   "gain": 3,
   "checkedReplies": 3,
   "checkedAlternatives": 25,
   "explanation": "Qxd1+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Qxg4",
   "alternativeLine": [
    "Qxg4",
    "Rd2",
    "Qg3",
    "Rc1"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -382
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win",
   "check"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "5rk1/2R2p1p/5rp1/3pQ3/p3P1Pq/P3P3/1P2B3/3R2K1 b - - 2 39",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 33,
  "ratingEstimate": null,
  "pv": [
   "h4f2",
   "g1h1",
   "f2e2",
   "e5f6",
   "e2d1"
  ],
  "evalBefore": 445,
  "publishedAt": 1793835785067
 },
 {
  "fen": "6k1/2p2p2/8/p2r3p/Pp6/3bbPBp/1P5P/R2B3K b - - 4 37",
  "solutionMoves": [
   "d3f1",
   "e3f2",
   "f1g2"
  ],
  "replyMoves": [
   "g3f2",
   "f3f4"
  ],
  "stepAlternatives": [],
  "stepEvals": [],
  "stepPvs": [],
  "conclusion": {
   "version": 1,
   "fen": "6k1/2p2p2/8/p2r3p/Pp6/3bbPBp/1P5P/R2B3K b - - 4 37",
   "line": [
    "d3f1",
    "g3f2",
    "e3f2",
    "f3f4",
    "f1g2"
   ],
   "finalFen": "6k1/2p2p2/8/p2r3p/Pp3P2/7p/1P3bbP/R2B3K w - - 1 40",
   "kind": "mate",
   "finalSan": "Bg2#",
   "gain": null,
   "checkedReplies": 0,
   "checkedAlternatives": 40,
   "explanation": "Bg2# culmina un mat forçat en tres jugades, demostrat comprovant totes les defenses legals.",
   "uniqueness": "Una única primera jugada força mat en tres; s’han comprovat exhaustivament les defenses possibles.",
   "alternativeSan": null,
   "alternativeLine": [],
   "alternativeEval": null,
   "minDepth": 0,
   "requestedDepth": 0,
   "sacrifices": [],
   "proofMethod": "exhaustive_mate_tree",
   "proofNodes": 45509
  },
  "id": "hgr_6k12p2p28p2r3pPp63bbPBp1P5PR2B3Kb",
  "source": "reserve",
  "sideToMove": "b",
  "line": [
   "d3f1",
   "g3f2",
   "e3f2",
   "f3f4",
   "f1g2"
  ],
  "sanLine": [
   "Bf1",
   "Bf2",
   "Bxf2",
   "f4",
   "Bg2#"
  ],
  "bestMove": "d3f1",
  "bestMoveSan": "Bf1",
  "finalType": "mate",
  "finalMotif": "mate",
  "finalMotifs": [
   "mate"
  ],
  "theme": "mate",
  "tacticKind": "escac i mat",
  "difficulty": 75,
  "difficultyPercent": 75,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "playerMove": null,
  "origin": "stockfish19_lozza3_mate3",
  "sourceGameId": null,
  "sourceFen": "6k1/2p2p2/8/p2r3p/Pp6/3bbPBp/1P5P/R2B3K b - - 4 37",
  "sourceMoveNumber": 37,
  "adaptationNote": null,
  "pv": [
   "d3f1",
   "g3f2",
   "e3f2",
   "f3f4",
   "f1g2"
  ],
  "evalBefore": null,
  "ratingEstimate": null,
  "createdAt": 0,
  "updatedAt": 0,
  "publishedAt": 1793822129545
 },
 {
  "id": "hgr_r1kb3r1p3pppp3pn2Q1p1q34NB23P2P1PPP4PR3K",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "r1kb3r/1p3ppp/p3pn2/Q1p1q3/4NB2/3P2P1/PPP4P/R3K2R w KQ - 2 16",
  "sideToMove": "w",
  "line": [
   "a5d8",
   "h8d8",
   "f4e5",
   "f6e4",
   "d3e4"
  ],
  "sanLine": [
   "Qxd8+",
   "Rxd8",
   "Bxe5",
   "Nxe4",
   "dxe4"
  ],
  "finalType": "major_win",
  "difficulty": 56,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "a5d8",
  "bestMoveSan": "Qxd8+",
  "solutionMoves": [
   "a5d8",
   "f4e5",
   "d3e4"
  ],
  "replyMoves": [
   "h8d8",
   "f6e4"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "r1kb3r/1p3ppp/p3pn2/Q1p1q3/4NB2/3P2P1/PPP4P/R3K2R w KQ - 2 16",
   "line": [
    "a5d8",
    "h8d8",
    "f4e5",
    "f6e4",
    "d3e4"
   ],
   "finalFen": "r1kr4/1p3ppp/p3p3/2p1B3/4P3/6P1/PPP4P/R3K2R b KQ - 0 18",
   "kind": "material",
   "finalSan": "dxe4",
   "gain": 3,
   "checkedReplies": 24,
   "checkedAlternatives": 28,
   "explanation": "dxe4 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "O-O",
   "alternativeLine": [
    "O-O",
    "f6",
    "dxe4",
    "fxe5"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 56
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 1,
     "offered": "q",
     "offerUci": "a5d8",
     "replyUci": "h8d8",
     "square": "d8",
     "loss": 6,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 462
    }
   ]
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "r1kb3r/1p3ppp/p3pn2/Q1p1q3/4NB2/3P2P1/PPP4P/R3K2R w KQ - 2 16",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 56,
  "ratingEstimate": null,
  "pv": [
   "a5d8",
   "h8d8",
   "f4e5",
   "f6e4",
   "d3e4"
  ],
  "evalBefore": 478,
  "publishedAt": 1793803824056
 },
 {
  "id": "hgr_84Rp1p5rpkP1q583r2P1PQ3P24R1K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "8/4Rp1p/5rpk/P1q5/8/3r2P1/PQ3P2/4R1K1 w - - 0 33",
  "sideToMove": "w",
  "line": [
   "b2f6",
   "d3g3",
   "g1h2",
   "c5g5",
   "f6g5"
  ],
  "sanLine": [
   "Qxf6",
   "Rxg3+",
   "Kh2",
   "Qg5",
   "Qxg5+"
  ],
  "finalType": "fork",
  "difficulty": 36,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "b2f6",
  "bestMoveSan": "Qxf6",
  "solutionMoves": [
   "b2f6",
   "g1h2",
   "f6g5"
  ],
  "replyMoves": [
   "d3g3",
   "c5g5"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "8/4Rp1p/5rpk/P1q5/8/3r2P1/PQ3P2/4R1K1 w - - 0 33",
   "line": [
    "b2f6",
    "d3g3",
    "g1h2",
    "c5g5",
    "f6g5"
   ],
   "finalFen": "8/4Rp1p/6pk/P5Q1/8/6r1/P4P1K/4R3 b - - 0 35",
   "kind": "material",
   "finalSan": "Qxg5+",
   "gain": 4,
   "checkedReplies": 3,
   "checkedAlternatives": 47,
   "explanation": "Qxg5+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "R7e6",
   "alternativeLine": [
    "R7e6",
    "Rg2+",
    "Kh1",
    "fxe6"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 12
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win",
   "check"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "La dama a g5 ataca alhora el rei i la torre.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "8/4Rp1p/5rpk/P1q5/8/3r2P1/PQ3P2/4R1K1 w - - 0 33",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 36,
  "ratingEstimate": null,
  "pv": [
   "b2f6",
   "d3g3",
   "g1h2",
   "c5g5",
   "f6g5"
  ],
  "evalBefore": 691,
  "publishedAt": 1793803170756
 },
 {
  "id": "hgr_1r3k2R4p27p1P685R1Pp4PPK1r6b",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "1r3k2/R4p2/7p/1P6/8/5R1P/p4PPK/1r6 b - - 3 38",
  "sideToMove": "b",
  "line": [
   "a2a1q",
   "f3f7",
   "f8g8",
   "a7a1",
   "b1a1"
  ],
  "sanLine": [
   "a1=Q",
   "Rfxf7+",
   "Kg8",
   "Rxa1",
   "Rxa1"
  ],
  "finalType": "major_win",
  "difficulty": 35,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "a2a1q",
  "bestMoveSan": "a1=Q",
  "solutionMoves": [
   "a2a1q",
   "f8g8",
   "b1a1"
  ],
  "replyMoves": [
   "f3f7",
   "a7a1"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "1r3k2/R4p2/7p/1P6/8/5R1P/p4PPK/1r6 b - - 3 38",
   "line": [
    "a2a1q",
    "f3f7",
    "f8g8",
    "a7a1",
    "b1a1"
   ],
   "finalFen": "1r4k1/5R2/7p/1P6/8/7P/5PPK/r7 w - - 0 41",
   "kind": "material",
   "finalSan": "Rxa1",
   "gain": 3,
   "checkedReplies": 19,
   "checkedAlternatives": 21,
   "explanation": "Rxa1 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "R1xb5",
   "alternativeLine": [
    "R1xb5",
    "Raa7",
    "R5b6",
    "Rg7+"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -484
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "1r3k2/R4p2/7p/1P6/8/5R1P/p4PPK/1r6 b - - 3 38",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 35,
  "ratingEstimate": null,
  "pv": [
   "a2a1q",
   "f3f7",
   "f8g8",
   "a7a1",
   "b1a1"
  ],
  "evalBefore": 480,
  "publishedAt": 1793803105963
 },
 {
  "id": "hgr_r3k3pp2b2p83pn2n3p46P1PqbN2PPR3QRK1wq",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "r3k3/pp2b2p/8/3pn2n/3p4/6P1/PqbN2PP/R3QRK1 w q - 0 19",
  "sideToMove": "w",
  "line": [
   "e1e5",
   "h5f6",
   "a1e1",
   "e8c8",
   "e5e7"
  ],
  "sanLine": [
   "Qxe5",
   "Nf6",
   "Rae1",
   "O-O-O",
   "Qxe7"
  ],
  "finalType": "fork",
  "difficulty": 39,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "e1e5",
  "bestMoveSan": "Qxe5",
  "solutionMoves": [
   "e1e5",
   "a1e1",
   "e5e7"
  ],
  "replyMoves": [
   "h5f6",
   "e8c8"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "r3k3/pp2b2p/8/3pn2n/3p4/6P1/PqbN2PP/R3QRK1 w q - 0 19",
   "line": [
    "e1e5",
    "h5f6",
    "a1e1",
    "e8c8",
    "e5e7"
   ],
   "finalFen": "2kr4/pp2Q2p/5n2/3p4/3p4/6P1/PqbN2PP/4RRK1 b - - 0 21",
   "kind": "material",
   "finalSan": "Qxe7",
   "gain": 5,
   "checkedReplies": 38,
   "checkedAlternatives": 38,
   "explanation": "Qxe7 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 5 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Nb3",
   "alternativeLine": [
    "Nb3",
    "Bb4",
    "Qxf6",
    "Bxe1"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 0
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "La dama a e7 ataca alhora la torre i el cavall.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "r3k3/pp2b2p/8/3pn2n/3p4/6P1/PqbN2PP/R3QRK1 w q - 0 19",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 39,
  "ratingEstimate": null,
  "pv": [
   "e1e5",
   "h5f6",
   "a1e1",
   "e8c8",
   "e5e7"
  ],
  "evalBefore": 340,
  "publishedAt": 1793748528125
 },
 {
  "id": "hgr_1k1r4pp3R1p4Q1n13p3B3p46P1Pqbb2PP4R1K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "1k1r4/pp3R1p/4Q1n1/3p3B/3p4/6P1/Pqbb2PP/4R1K1 w - - 0 23",
  "sideToMove": "w",
  "line": [
   "e6d6",
   "d8d6",
   "e1e8",
   "d6d8",
   "e8d8"
  ],
  "sanLine": [
   "Qd6+",
   "Rxd6",
   "Re8+",
   "Rd8",
   "Rxd8#"
  ],
  "finalType": "mate",
  "difficulty": 66,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "e6d6",
  "bestMoveSan": "Qd6+",
  "solutionMoves": [
   "e6d6",
   "e1e8",
   "e8d8"
  ],
  "replyMoves": [
   "d8d6",
   "d6d8"
  ],
  "theme": "mate",
  "tacticKind": "escac i mat",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "1k1r4/pp3R1p/4Q1n1/3p3B/3p4/6P1/Pqbb2PP/4R1K1 w - - 0 23",
   "line": [
    "e6d6",
    "d8d6",
    "e1e8",
    "d6d8",
    "e8d8"
   ],
   "finalFen": "1k1R4/pp3R1p/6n1/3p3B/3p4/6P1/Pqbb2PP/6K1 b - - 0 25",
   "kind": "mate",
   "finalSan": "Rxd8#",
   "gain": null,
   "checkedReplies": 0,
   "checkedAlternatives": 36,
   "explanation": "Rxd8# és escac i mat: el rei està amenaçat i el rival no té cap resposta legal.",
   "uniqueness": "S’han comprovat les altres 36 jugades legals: cap no fa mat en aquesta posició.",
   "alternativeSan": "Rfe7",
   "alternativeLine": [
    "Rfe7",
    "Qc1+",
    "Kf2",
    "Be3+"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -1986
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 1,
     "offered": "q",
     "offerUci": "e6d6",
     "replyUci": "d8d6",
     "square": "d6",
     "loss": 9,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "mate",
     "continuationType": "mate",
     "continuationEval": 2
    }
   ]
  },
  "finalMotif": "mate",
  "finalMotifs": [
   "mate",
   "fork",
   "check"
  ],
  "finalMotifLabel": "escac i mat",
  "finalMotifReason": "La seqüència acaba en escac i mat.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "1k1r4/pp3R1p/4Q1n1/3p3B/3p4/6P1/Pqbb2PP/4R1K1 w - - 0 23",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 66,
  "ratingEstimate": null,
  "pv": [
   "e6d6",
   "d8d6",
   "e1e8",
   "d6d8",
   "e8d8"
  ],
  "evalBefore": 9970,
  "publishedAt": 1793748522201
 },
 {
  "id": "hgr_5k21P3pp17pp3q2P83p2P15P22R3K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "5k2/1P3pp1/7p/p3q2P/8/3p2P1/5P2/2R3K1 w - - 0 61",
  "sideToMove": "w",
  "line": [
   "c1c8",
   "f8e7",
   "b7b8q",
   "e5b8",
   "c8b8"
  ],
  "sanLine": [
   "Rc8+",
   "Ke7",
   "b8=Q",
   "Qxb8",
   "Rxb8"
  ],
  "finalType": "major_win",
  "difficulty": 33,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "c1c8",
  "bestMoveSan": "Rc8+",
  "solutionMoves": [
   "c1c8",
   "b7b8q",
   "c8b8"
  ],
  "replyMoves": [
   "f8e7",
   "e5b8"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "5k2/1P3pp1/7p/p3q2P/8/3p2P1/5P2/2R3K1 w - - 0 61",
   "line": [
    "c1c8",
    "f8e7",
    "b7b8q",
    "e5b8",
    "c8b8"
   ],
   "finalFen": "1R6/4kpp1/7p/p6P/8/3p2P1/5P2/6K1 b - - 0 63",
   "kind": "material",
   "finalSan": "Rxb8",
   "gain": 8,
   "checkedReplies": 10,
   "checkedAlternatives": 19,
   "explanation": "Rxb8 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 8 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Rc1",
   "alternativeLine": [
    "Rc1",
    "d2",
    "Rd1",
    "Qe5"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -1006
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 8 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "5k2/1P3pp1/7p/p3q2P/8/3p2P1/5P2/2R3K1 w - - 0 61",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 33,
  "ratingEstimate": null,
  "pv": [
   "c1c8",
   "f8e7",
   "b7b8q",
   "e5b8",
   "c8b8"
  ],
  "evalBefore": 556,
  "publishedAt": 1793748521934
 },
 {
  "fen": "2r2b1k/5q2/p2p3P/1p1Np1Q1/2r1p3/8/PPPR1P2/1K4R1 w - - 3 31",
  "solutionMoves": [
   "d5f6",
   "g5g8",
   "g1g8"
  ],
  "replyMoves": [
   "c8d8",
   "f7g8"
  ],
  "stepAlternatives": [],
  "stepEvals": [],
  "stepPvs": [],
  "conclusion": {
   "version": 1,
   "fen": "2r2b1k/5q2/p2p3P/1p1Np1Q1/2r1p3/8/PPPR1P2/1K4R1 w - - 3 31",
   "line": [
    "d5f6",
    "c8d8",
    "g5g8",
    "f7g8",
    "g1g8"
   ],
   "finalFen": "3r1bRk/8/p2p1N1P/1p2p3/2r1p3/8/PPPR1P2/1K6 b - - 0 33",
   "kind": "mate",
   "finalSan": "Rxg8#",
   "gain": null,
   "checkedReplies": 0,
   "checkedAlternatives": 44,
   "explanation": "Rxg8# culmina un mat forçat en tres jugades, demostrat comprovant totes les defenses legals.",
   "uniqueness": "Una única primera jugada força mat en tres; s’han comprovat exhaustivament les defenses possibles.",
   "alternativeSan": null,
   "alternativeLine": [],
   "alternativeEval": null,
   "minDepth": 0,
   "requestedDepth": 0,
   "sacrifices": [],
   "proofMethod": "exhaustive_mate_tree",
   "proofNodes": 43660
  },
  "id": "hgr_2r2b1k5q2p2p3P1p1Np1Q12r1p38PPPR1P21K4R1",
  "source": "reserve",
  "sideToMove": "w",
  "line": [
   "d5f6",
   "c8d8",
   "g5g8",
   "f7g8",
   "g1g8"
  ],
  "sanLine": [
   "Nf6",
   "Rd8",
   "Qg8+",
   "Qxg8",
   "Rxg8#"
  ],
  "bestMove": "d5f6",
  "bestMoveSan": "Nf6",
  "finalType": "mate",
  "finalMotif": "mate",
  "finalMotifs": [
   "mate"
  ],
  "theme": "mate",
  "tacticKind": "escac i mat",
  "difficulty": 75,
  "difficultyPercent": 75,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "playerMove": null,
  "origin": "stockfish19_lozza3_mate3",
  "sourceGameId": null,
  "sourceFen": "2r2b1k/5q2/p2p3P/1p1Np1Q1/2r1p3/8/PPPR1P2/1K4R1 w - - 3 31",
  "sourceMoveNumber": 31,
  "adaptationNote": null,
  "pv": [
   "d5f6",
   "c8d8",
   "g5g8",
   "f7g8",
   "g1g8"
  ],
  "evalBefore": null,
  "ratingEstimate": null,
  "createdAt": 0,
  "updatedAt": 0,
  "publishedAt": 1793734823313
 },
 {
  "fen": "k5r1/2B3R1/1p5P/pBp5/P7/6P1/1P4K1/8 w - - 1 45",
  "solutionMoves": [
   "b5c6",
   "g7g8",
   "g8a8"
  ],
  "replyMoves": [
   "a8a7",
   "a7a6"
  ],
  "stepAlternatives": [],
  "stepEvals": [],
  "stepPvs": [],
  "conclusion": {
   "version": 1,
   "fen": "k5r1/2B3R1/1p5P/pBp5/P7/6P1/1P4K1/8 w - - 1 45",
   "line": [
    "b5c6",
    "a8a7",
    "g7g8",
    "a7a6",
    "g8a8"
   ],
   "finalFen": "R7/2B5/kpB4P/p1p5/P7/6P1/1P4K1/8 b - - 2 47",
   "kind": "mate",
   "finalSan": "Ra8#",
   "gain": null,
   "checkedReplies": 0,
   "checkedAlternatives": 32,
   "explanation": "Ra8# culmina un mat forçat en tres jugades, demostrat comprovant totes les defenses legals.",
   "uniqueness": "Una única primera jugada força mat en tres; s’han comprovat exhaustivament les defenses possibles.",
   "alternativeSan": null,
   "alternativeLine": [],
   "alternativeEval": null,
   "minDepth": 0,
   "requestedDepth": 0,
   "sacrifices": [],
   "proofMethod": "exhaustive_mate_tree",
   "proofNodes": 9350
  },
  "id": "hgr_k5r12B3R11p5PpBp5P76P11P4K18w",
  "source": "reserve",
  "sideToMove": "w",
  "line": [
   "b5c6",
   "a8a7",
   "g7g8",
   "a7a6",
   "g8a8"
  ],
  "sanLine": [
   "Bc6+",
   "Ka7",
   "Rxg8",
   "Ka6",
   "Ra8#"
  ],
  "bestMove": "b5c6",
  "bestMoveSan": "Bc6+",
  "finalType": "mate",
  "finalMotif": "mate",
  "finalMotifs": [
   "mate"
  ],
  "theme": "mate",
  "tacticKind": "escac i mat",
  "difficulty": 75,
  "difficultyPercent": 75,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "playerMove": null,
  "origin": "stockfish19_lozza3_mate3",
  "sourceGameId": null,
  "sourceFen": "k5r1/2B3R1/1p5P/pBp5/P7/6P1/1P4K1/8 w - - 1 45",
  "sourceMoveNumber": 45,
  "adaptationNote": null,
  "pv": [
   "b5c6",
   "a8a7",
   "g7g8",
   "a7a6",
   "g8a8"
  ],
  "evalBefore": null,
  "ratingEstimate": null,
  "createdAt": 0,
  "updatedAt": 0,
  "publishedAt": 1793734740491
 },
 {
  "fen": "8/k1r3RP/1p6/pBp5/P7/6P1/1P4K1/8 w - - 0 46",
  "solutionMoves": [
   "g7c7",
   "c7d7",
   "h7h8q"
  ],
  "replyMoves": [
   "a7b8",
   "b8c8"
  ],
  "stepAlternatives": [],
  "stepEvals": [],
  "stepPvs": [],
  "conclusion": {
   "version": 1,
   "fen": "8/k1r3RP/1p6/pBp5/P7/6P1/1P4K1/8 w - - 0 46",
   "line": [
    "g7c7",
    "a7b8",
    "c7d7",
    "b8c8",
    "h7h8q"
   ],
   "finalFen": "2k4Q/3R4/1p6/pBp5/P7/6P1/1P4K1/8 b - - 0 48",
   "kind": "mate",
   "finalSan": "h8=Q#",
   "gain": null,
   "checkedReplies": 0,
   "checkedAlternatives": 29,
   "explanation": "h8=Q# culmina un mat forçat en tres jugades, demostrat comprovant totes les defenses legals.",
   "uniqueness": "Una única primera jugada força mat en tres; s’han comprovat exhaustivament les defenses possibles.",
   "alternativeSan": null,
   "alternativeLine": [],
   "alternativeEval": null,
   "minDepth": 0,
   "requestedDepth": 0,
   "sacrifices": [],
   "proofMethod": "exhaustive_mate_tree",
   "proofNodes": 4798
  },
  "id": "hgr_8k1r3RP1p6pBp5P76P11P4K18w",
  "source": "reserve",
  "sideToMove": "w",
  "line": [
   "g7c7",
   "a7b8",
   "c7d7",
   "b8c8",
   "h7h8q"
  ],
  "sanLine": [
   "Rxc7+",
   "Kb8",
   "Rd7",
   "Kc8",
   "h8=Q#"
  ],
  "bestMove": "g7c7",
  "bestMoveSan": "Rxc7+",
  "finalType": "mate",
  "finalMotif": "mate",
  "finalMotifs": [
   "mate"
  ],
  "theme": "mate",
  "tacticKind": "escac i mat",
  "difficulty": 75,
  "difficultyPercent": 75,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "playerMove": null,
  "origin": "stockfish19_lozza3_mate3",
  "sourceGameId": null,
  "sourceFen": "8/k1r3RP/1p6/pBp5/P7/6P1/1P4K1/8 w - - 0 46",
  "sourceMoveNumber": 46,
  "adaptationNote": null,
  "pv": [
   "g7c7",
   "a7b8",
   "c7d7",
   "b8c8",
   "h7h8q"
  ],
  "evalBefore": null,
  "ratingEstimate": null,
  "createdAt": 0,
  "updatedAt": 0,
  "publishedAt": 1793734629839
 },
 {
  "id": "hgr_5k23Rb34P3p6QP4r281q3BK18w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "5k2/3Rb3/4P3/p6Q/P4r2/8/1q3BK1/8 w - - 0 58",
  "sideToMove": "w",
  "line": [
   "h5h6",
   "b2g7",
   "h6g7",
   "f8g7",
   "d7e7"
  ],
  "sanLine": [
   "Qh6+",
   "Qg7+",
   "Qxg7+",
   "Kxg7",
   "Rxe7+"
  ],
  "finalType": "fork",
  "difficulty": 34,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "h5h6",
  "bestMoveSan": "Qh6+",
  "solutionMoves": [
   "h5h6",
   "h6g7",
   "d7e7"
  ],
  "replyMoves": [
   "b2g7",
   "f8g7"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "5k2/3Rb3/4P3/p6Q/P4r2/8/1q3BK1/8 w - - 0 58",
   "line": [
    "h5h6",
    "b2g7",
    "h6g7",
    "f8g7",
    "d7e7"
   ],
   "finalFen": "8/4R1k1/4P3/p7/P4r2/8/5BK1/8 b - - 0 60",
   "kind": "material",
   "finalSan": "Rxe7+",
   "gain": 3,
   "checkedReplies": 7,
   "checkedAlternatives": 25,
   "explanation": "Rxe7+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Rd4",
   "alternativeLine": [
    "Rd4",
    "Rf6",
    "Re4",
    "Rf5"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 4
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win",
   "check"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Segona jugada (Qxg7+): La dama a g7 ataca alhora el rei i l'alfil. La jugada final (Rxe7+) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "5k2/3Rb3/4P3/p6Q/P4r2/8/1q3BK1/8 w - - 0 58",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 34,
  "ratingEstimate": null,
  "pv": [
   "h5h6",
   "b2g7",
   "h6g7",
   "f8g7",
   "d7e7"
  ],
  "evalBefore": 531,
  "publishedAt": 1793715851487
 },
 {
  "id": "hgr_7R1p2rk22p1p1p1p5r1P71P1P42PK47Rw",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "7R/1p2rk2/2p1p1p1/p5r1/P7/1P1P4/2PK4/7R w - - 0 33",
  "sideToMove": "w",
  "line": [
   "h1h7",
   "f7f6",
   "h8f8",
   "f6e5",
   "h7e7"
  ],
  "sanLine": [
   "R1h7+",
   "Kf6",
   "Rf8+",
   "Ke5",
   "Rxe7"
  ],
  "finalType": "pin",
  "difficulty": 36,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "h1h7",
  "bestMoveSan": "R1h7+",
  "solutionMoves": [
   "h1h7",
   "h8f8",
   "h7e7"
  ],
  "replyMoves": [
   "f7f6",
   "f6e5"
  ],
  "theme": "pin",
  "tacticKind": "clavada",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "7R/1p2rk2/2p1p1p1/p5r1/P7/1P1P4/2PK4/7R w - - 0 33",
   "line": [
    "h1h7",
    "f7f6",
    "h8f8",
    "f6e5",
    "h7e7"
   ],
   "finalFen": "5R2/1p2R3/2p1p1p1/p3k1r1/P7/1P1P4/2PK4/8 b - - 0 35",
   "kind": "material",
   "finalSan": "Rxe7",
   "gain": 5,
   "checkedReplies": 12,
   "checkedAlternatives": 33,
   "explanation": "Rxe7 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 5 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "d4+",
   "alternativeLine": [
    "d4+",
    "Kd6",
    "Rd8+",
    "Kc7"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 18
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "pin",
  "finalMotifs": [
   "pin",
   "skewer",
   "major_win"
  ],
  "finalMotifLabel": "clavada",
  "finalMotifReason": "La torre a e7 clava el peó contra el rei.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "7R/1p2rk2/2p1p1p1/p5r1/P7/1P1P4/2PK4/7R w - - 0 33",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 36,
  "ratingEstimate": null,
  "pv": [
   "h1h7",
   "f7f6",
   "h8f8",
   "f6e5",
   "h7e7"
  ],
  "evalBefore": 532,
  "publishedAt": 1793715708145
 },
 {
  "id": "hgr_6k11Q2q36pp6n17K6P13r3P5R2w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "6k1/1Q2q3/6pp/6n1/7K/6P1/3r3P/5R2 w - - 0 48",
  "sideToMove": "w",
  "line": [
   "b7e7",
   "d2d4",
   "g3g4",
   "g5f3",
   "f1f3"
  ],
  "sanLine": [
   "Qxe7",
   "Rd4+",
   "g4",
   "Nf3+",
   "Rxf3"
  ],
  "finalType": "major_win",
  "difficulty": 31,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "b7e7",
  "bestMoveSan": "Qxe7",
  "solutionMoves": [
   "b7e7",
   "g3g4",
   "f1f3"
  ],
  "replyMoves": [
   "d2d4",
   "g5f3"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "6k1/1Q2q3/6pp/6n1/7K/6P1/3r3P/5R2 w - - 0 48",
   "line": [
    "b7e7",
    "d2d4",
    "g3g4",
    "g5f3",
    "f1f3"
   ],
   "finalFen": "6k1/4Q3/6pp/8/3r2PK/5R2/7P/8 b - - 0 50",
   "kind": "material",
   "finalSan": "Rxf3",
   "gain": 11,
   "checkedReplies": 16,
   "checkedAlternatives": 2,
   "explanation": "Rxf3 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 11 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Kg3",
   "alternativeLine": [
    "Kg3",
    "Rxg4+",
    "Kxf3",
    "Rg5"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 1120
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 12 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "6k1/1Q2q3/6pp/6n1/7K/6P1/3r3P/5R2 w - - 0 48",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 31,
  "ratingEstimate": null,
  "pv": [
   "b7e7",
   "d2d4",
   "g3g4",
   "g5f3",
   "f1f3"
  ],
  "evalBefore": 9930,
  "publishedAt": 1793715704961
 },
 {
  "id": "hgr_2q1Rbk15p1pp2n2p11p1N45B2P4P1P1PP3K18w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "2q1Rbk1/5p1p/p2n2p1/1p1N4/5B2/P4P1P/1PP3K1/8 w - - 0 30",
  "sideToMove": "w",
  "line": [
   "d5e7",
   "g8g7",
   "e8c8",
   "d6c8",
   "e7c8"
  ],
  "sanLine": [
   "Ne7+",
   "Kg7",
   "Rxc8",
   "Nxc8",
   "Nxc8"
  ],
  "finalType": "fork",
  "difficulty": 35,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "d5e7",
  "bestMoveSan": "Ne7+",
  "solutionMoves": [
   "d5e7",
   "e8c8",
   "e7c8"
  ],
  "replyMoves": [
   "g8g7",
   "d6c8"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "2q1Rbk1/5p1p/p2n2p1/1p1N4/5B2/P4P1P/1PP3K1/8 w - - 0 30",
   "line": [
    "d5e7",
    "g8g7",
    "e8c8",
    "d6c8",
    "e7c8"
   ],
   "finalFen": "2N2b2/5pkp/p5p1/1p6/5B2/P4P1P/1PP3K1/8 b - - 0 32",
   "kind": "material",
   "finalSan": "Nxc8",
   "gain": 6,
   "checkedReplies": 15,
   "checkedAlternatives": 28,
   "explanation": "Nxc8 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 6 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Nd5",
   "alternativeLine": [
    "Nd5",
    "Bd6",
    "Bxd6",
    "Nxd6"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 9
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Primera jugada (Ne7+): El cavall a e7 ataca alhora el rei i la dama. La jugada final (Nxc8) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "2q1Rbk1/5p1p/p2n2p1/1p1N4/5B2/P4P1P/1PP3K1/8 w - - 0 30",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 35,
  "ratingEstimate": null,
  "pv": [
   "d5e7",
   "g8g7",
   "e8c8",
   "d6c8",
   "e7c8"
  ],
  "evalBefore": 374,
  "publishedAt": 1793667881607
 },
 {
  "id": "hgr_2k1rr21bpp2pp1p61P6P74P1PN3K1nBPR4R2b",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "2k1rr2/1bpp2pp/1p6/1P6/P7/4P1PN/3K1nBP/R4R2 b - - 2 26",
  "sideToMove": "b",
  "line": [
   "b7g2",
   "f1f2",
   "g2h3",
   "f2f8",
   "e8f8"
  ],
  "sanLine": [
   "Bxg2",
   "Rxf2",
   "Bxh3",
   "Rxf8",
   "Rxf8"
  ],
  "finalType": "major_win",
  "difficulty": 34,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "b7g2",
  "bestMoveSan": "Bxg2",
  "solutionMoves": [
   "b7g2",
   "g2h3",
   "e8f8"
  ],
  "replyMoves": [
   "f1f2",
   "f2f8"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "2k1rr2/1bpp2pp/1p6/1P6/P7/4P1PN/3K1nBP/R4R2 b - - 2 26",
   "line": [
    "b7g2",
    "f1f2",
    "g2h3",
    "f2f8",
    "e8f8"
   ],
   "finalFen": "2k2r2/2pp2pp/1p6/1P6/P7/4P1Pb/3K3P/R7 w - - 0 29",
   "kind": "material",
   "finalSan": "Rxf8",
   "gain": 3,
   "checkedReplies": 19,
   "checkedAlternatives": 17,
   "explanation": "Rxf8 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Rd8",
   "alternativeLine": [
    "Rd8",
    "Rxd8+",
    "Kxd8",
    "Kc3"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -433
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "2k1rr2/1bpp2pp/1p6/1P6/P7/4P1PN/3K1nBP/R4R2 b - - 2 26",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 34,
  "ratingEstimate": null,
  "pv": [
   "b7g2",
   "f1f2",
   "g2h3",
   "f2f8",
   "e8f8"
  ],
  "evalBefore": 516,
  "publishedAt": 1793667750289
 },
 {
  "id": "hgr_5rk13Q4p1pPn2q2N54P1pP6b1P3NpK15R2b",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "5rk1/3Q4/p1pPn2q/2N5/4P1pP/6b1/P3NpK1/5R2 b - - 1 29",
  "sideToMove": "b",
  "line": [
   "h6h4",
   "d7e6",
   "g8h8",
   "e6e5",
   "g3e5"
  ],
  "sanLine": [
   "Qxh4",
   "Qxe6+",
   "Kh8",
   "Qe5+",
   "Bxe5"
  ],
  "finalType": "major_win",
  "difficulty": 33,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "h6h4",
  "bestMoveSan": "Qxh4",
  "solutionMoves": [
   "h6h4",
   "g8h8",
   "g3e5"
  ],
  "replyMoves": [
   "d7e6",
   "e6e5"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "5rk1/3Q4/p1pPn2q/2N5/4P1pP/6b1/P3NpK1/5R2 b - - 1 29",
   "line": [
    "h6h4",
    "d7e6",
    "g8h8",
    "e6e5",
    "g3e5"
   ],
   "finalFen": "5r1k/8/p1pP4/2N1b3/4P1pq/8/P3NpK1/5R2 w - - 0 32",
   "kind": "material",
   "finalSan": "Bxe5",
   "gain": 6,
   "checkedReplies": 24,
   "checkedAlternatives": 4,
   "explanation": "Bxe5 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 6 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Rf6",
   "alternativeLine": [
    "Rf6",
    "Qxg3",
    "Qh3+",
    "Qxh3+"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -736
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 7 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "5rk1/3Q4/p1pPn2q/2N5/4P1pP/6b1/P3NpK1/5R2 b - - 1 29",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 33,
  "ratingEstimate": null,
  "pv": [
   "h6h4",
   "d7e6",
   "g8h8",
   "e6e5",
   "g3e5"
  ],
  "evalBefore": 1348,
  "publishedAt": 1793667657134
 },
 {
  "id": "hgr_6Q18p5pk4q2p7PP5r1KP65R2w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "6Q1/8/p5pk/4q2p/7P/P5r1/KP6/5R2 w - - 2 43",
  "sideToMove": "w",
  "line": [
   "g8f8",
   "e5g7",
   "f8f4",
   "h6h7",
   "f4g3"
  ],
  "sanLine": [
   "Qf8+",
   "Qg7",
   "Qf4+",
   "Kh7",
   "Qxg3"
  ],
  "finalType": "fork",
  "difficulty": 37,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "g8f8",
  "bestMoveSan": "Qf8+",
  "solutionMoves": [
   "g8f8",
   "f8f4",
   "f4g3"
  ],
  "replyMoves": [
   "e5g7",
   "h6h7"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "6Q1/8/p5pk/4q2p/7P/P5r1/KP6/5R2 w - - 2 43",
   "line": [
    "g8f8",
    "e5g7",
    "f8f4",
    "h6h7",
    "f4g3"
   ],
   "finalFen": "8/6qk/p5p1/7p/7P/P5Q1/KP6/5R2 b - - 0 45",
   "kind": "material",
   "finalSan": "Qxg3",
   "gain": 4,
   "checkedReplies": 20,
   "checkedAlternatives": 35,
   "explanation": "Qxg3 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Qe4",
   "alternativeLine": [
    "Qe4",
    "Qd7",
    "Rf8",
    "Rg4"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 14
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "pin",
   "major_win"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Segona jugada (Qf4+): La dama a f4 ataca alhora el rei i la torre. La jugada final (Qxg3) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "6Q1/8/p5pk/4q2p/7P/P5r1/KP6/5R2 w - - 2 43",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 37,
  "ratingEstimate": null,
  "pv": [
   "g8f8",
   "e5g7",
   "f8f4",
   "h6h7",
   "f4g3"
  ],
  "evalBefore": 716,
  "publishedAt": 1793635335248
 },
 {
  "id": "hgr_85ppk7p3p4n74PP2r3BKPP1R6b",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "8/5ppk/7p/3p4/n7/4PP2/r3BKPP/1R6 b - - 7 34",
  "sideToMove": "b",
  "line": [
   "a2e2",
   "f2e2",
   "a4c3",
   "e2d3",
   "c3b1"
  ],
  "sanLine": [
   "Rxe2+",
   "Kxe2",
   "Nc3+",
   "Kd3",
   "Nxb1"
  ],
  "finalType": "fork",
  "difficulty": 52,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "a2e2",
  "bestMoveSan": "Rxe2+",
  "solutionMoves": [
   "a2e2",
   "a4c3",
   "c3b1"
  ],
  "replyMoves": [
   "f2e2",
   "e2d3"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "8/5ppk/7p/3p4/n7/4PP2/r3BKPP/1R6 b - - 7 34",
   "line": [
    "a2e2",
    "f2e2",
    "a4c3",
    "e2d3",
    "c3b1"
   ],
   "finalFen": "8/5ppk/7p/3p4/8/3KPP2/6PP/1n6 w - - 0 37",
   "kind": "material",
   "finalSan": "Nxb1",
   "gain": 3,
   "checkedReplies": 9,
   "checkedAlternatives": 15,
   "explanation": "Nxb1 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "d4",
   "alternativeLine": [
    "d4",
    "Rb4",
    "Nd5",
    "Rxd4"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -524
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 1,
     "offered": "r",
     "offerUci": "a2e2",
     "replyUci": "f2e2",
     "square": "e2",
     "loss": 2,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 514
    }
   ]
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Segona jugada (Nc3+): El cavall a c3 ataca alhora el rei i la torre. La jugada final (Nxb1) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "8/5ppk/7p/3p4/n7/4PP2/r3BKPP/1R6 b - - 7 34",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 52,
  "ratingEstimate": null,
  "pv": [
   "a2e2",
   "f2e2",
   "a4c3",
   "e2d3",
   "c3b1"
  ],
  "evalBefore": 331,
  "publishedAt": 1793635310342
 },
 {
  "id": "hgr_2q2rk1p2nbppp1p2p3881PB1Pb2P2NBPPPR2Q2K1",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "2q2rk1/p2nbppp/1p2p3/8/8/1PB1Pb2/P2NBPPP/R2Q2K1 w - - 0 17",
  "sideToMove": "w",
  "line": [
   "d2f3",
   "c8c3",
   "a1c1",
   "c3c1",
   "d1c1"
  ],
  "sanLine": [
   "Nxf3",
   "Qxc3",
   "Rc1",
   "Qxc1",
   "Qxc1"
  ],
  "finalType": "major_win",
  "difficulty": 36,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "d2f3",
  "bestMoveSan": "Nxf3",
  "solutionMoves": [
   "d2f3",
   "a1c1",
   "d1c1"
  ],
  "replyMoves": [
   "c8c3",
   "c3c1"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "2q2rk1/p2nbppp/1p2p3/8/8/1PB1Pb2/P2NBPPP/R2Q2K1 w - - 0 17",
   "line": [
    "d2f3",
    "c8c3",
    "a1c1",
    "c3c1",
    "d1c1"
   ],
   "finalFen": "5rk1/p2nbppp/1p2p3/8/8/1P2PN2/P3BPPP/2Q3K1 b - - 0 19",
   "kind": "material",
   "finalSan": "Qxc1",
   "gain": 4,
   "checkedReplies": 28,
   "checkedAlternatives": 23,
   "explanation": "Qxc1 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Qf1",
   "alternativeLine": [
    "Qf1",
    "Qxf1+",
    "Kxf1",
    "Rc8"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -644
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 4 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "2q2rk1/p2nbppp/1p2p3/8/8/1PB1Pb2/P2NBPPP/R2Q2K1 w - - 0 17",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 36,
  "ratingEstimate": null,
  "pv": [
   "d2f3",
   "c8c3",
   "a1c1",
   "c3c1",
   "d1c1"
  ],
  "evalBefore": 503,
  "publishedAt": 1793635234391
 },
 {
  "fen": "2rr2k1/pp3p2/3p1qpQ/3np3/4P3/P1N2R2/1PP2PP1/1K5R w - - 2 25",
  "solutionMoves": [
   "f3f6",
   "b2c3",
   "h6h8"
  ],
  "replyMoves": [
   "d5c3",
   "c8c7"
  ],
  "stepAlternatives": [],
  "stepEvals": [],
  "stepPvs": [],
  "conclusion": {
   "version": 1,
   "fen": "2rr2k1/pp3p2/3p1qpQ/3np3/4P3/P1N2R2/1PP2PP1/1K5R w - - 2 25",
   "line": [
    "f3f6",
    "d5c3",
    "b2c3",
    "c8c7",
    "h6h8"
   ],
   "finalFen": "3r2kQ/ppr2p2/3p1Rp1/4p3/4P3/P1P5/2P2PP1/1K5R b - - 2 27",
   "kind": "mate",
   "finalSan": "Qh8#",
   "gain": null,
   "checkedReplies": 0,
   "checkedAlternatives": 44,
   "explanation": "Qh8# culmina un mat forçat en tres jugades, demostrat comprovant totes les defenses legals.",
   "uniqueness": "Una única primera jugada força mat en tres; s’han comprovat exhaustivament les defenses possibles.",
   "alternativeSan": null,
   "alternativeLine": [],
   "alternativeEval": null,
   "minDepth": 0,
   "requestedDepth": 0,
   "sacrifices": [],
   "proofMethod": "exhaustive_mate_tree",
   "proofNodes": 14892
  },
  "id": "hgr_2rr2k1pp3p23p1qpQ3np34P3P1N2R21PP2PP11K5",
  "source": "reserve",
  "sideToMove": "w",
  "line": [
   "f3f6",
   "d5c3",
   "b2c3",
   "c8c7",
   "h6h8"
  ],
  "sanLine": [
   "Rxf6",
   "Nxc3+",
   "bxc3",
   "Rc7",
   "Qh8#"
  ],
  "bestMove": "f3f6",
  "bestMoveSan": "Rxf6",
  "finalType": "mate",
  "finalMotif": "mate",
  "finalMotifs": [
   "mate"
  ],
  "theme": "mate",
  "tacticKind": "escac i mat",
  "difficulty": 75,
  "difficultyPercent": 75,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "playerMove": null,
  "origin": "stockfish19_lozza3_mate3",
  "sourceGameId": null,
  "sourceFen": "2rr2k1/pp3p2/3p1qpQ/3np3/4P3/P1N2R2/1PP2PP1/1K5R w - - 2 25",
  "sourceMoveNumber": 25,
  "adaptationNote": null,
  "pv": [
   "f3f6",
   "d5c3",
   "b2c3",
   "c8c7",
   "h6h8"
  ],
  "evalBefore": null,
  "ratingEstimate": null,
  "createdAt": 0,
  "updatedAt": 0,
  "publishedAt": 1793626503762
 },
 {
  "fen": "2r2k2/pp5r/3p2Q1/3Ppp2/8/P7/1PP2PP1/1K5R w - - 1 35",
  "solutionMoves": [
   "h1h7",
   "h7h8",
   "g6g7"
  ],
  "replyMoves": [
   "c8c7",
   "f8e7"
  ],
  "stepAlternatives": [],
  "stepEvals": [],
  "stepPvs": [],
  "conclusion": {
   "version": 1,
   "fen": "2r2k2/pp5r/3p2Q1/3Ppp2/8/P7/1PP2PP1/1K5R w - - 1 35",
   "line": [
    "h1h7",
    "c8c7",
    "h7h8",
    "f8e7",
    "g6g7"
   ],
   "finalFen": "7R/ppr1k1Q1/3p4/3Ppp2/8/P7/1PP2PP1/1K6 b - - 4 37",
   "kind": "mate",
   "finalSan": "Qg7#",
   "gain": null,
   "checkedReplies": 0,
   "checkedAlternatives": 36,
   "explanation": "Qg7# culmina un mat forçat en tres jugades, demostrat comprovant totes les defenses legals.",
   "uniqueness": "Una única primera jugada força mat en tres; s’han comprovat exhaustivament les defenses possibles.",
   "alternativeSan": null,
   "alternativeLine": [],
   "alternativeEval": null,
   "minDepth": 0,
   "requestedDepth": 0,
   "sacrifices": [],
   "proofMethod": "exhaustive_mate_tree",
   "proofNodes": 8806
  },
  "id": "hgr_2r2k2pp5r3p2Q13Ppp28P71PP2PP11K5Rw",
  "source": "reserve",
  "sideToMove": "w",
  "line": [
   "h1h7",
   "c8c7",
   "h7h8",
   "f8e7",
   "g6g7"
  ],
  "sanLine": [
   "Rxh7",
   "Rc7",
   "Rh8+",
   "Ke7",
   "Qg7#"
  ],
  "bestMove": "h1h7",
  "bestMoveSan": "Rxh7",
  "finalType": "mate",
  "finalMotif": "mate",
  "finalMotifs": [
   "mate"
  ],
  "theme": "mate",
  "tacticKind": "escac i mat",
  "difficulty": 75,
  "difficultyPercent": 75,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "playerMove": null,
  "origin": "stockfish19_lozza3_mate3",
  "sourceGameId": null,
  "sourceFen": "2r2k2/pp5r/3p2Q1/3Ppp2/8/P7/1PP2PP1/1K5R w - - 1 35",
  "sourceMoveNumber": 35,
  "adaptationNote": null,
  "pv": [
   "h1h7",
   "c8c7",
   "h7h8",
   "f8e7",
   "g6g7"
  ],
  "evalBefore": null,
  "ratingEstimate": null,
  "createdAt": 0,
  "updatedAt": 0,
  "publishedAt": 1793626387845
 },
 {
  "fen": "r4k2/8/2B1R1PP/p7/1p4p1/1P4K1/2P5/8 w - - 3 43",
  "solutionMoves": [
   "c6a8",
   "a8c6",
   "e6e8"
  ],
  "replyMoves": [
   "a5a4",
   "f8g8"
  ],
  "stepAlternatives": [],
  "stepEvals": [],
  "stepPvs": [],
  "conclusion": {
   "version": 1,
   "fen": "r4k2/8/2B1R1PP/p7/1p4p1/1P4K1/2P5/8 w - - 3 43",
   "line": [
    "c6a8",
    "a5a4",
    "a8c6",
    "f8g8",
    "e6e8"
   ],
   "finalFen": "4R1k1/8/2B3PP/8/pp4p1/1P4K1/2P5/8 b - - 3 45",
   "kind": "mate",
   "finalSan": "Re8#",
   "gain": null,
   "checkedReplies": 0,
   "checkedAlternatives": 29,
   "explanation": "Re8# culmina un mat forçat en tres jugades, demostrat comprovant totes les defenses legals.",
   "uniqueness": "Una única primera jugada força mat en tres; s’han comprovat exhaustivament les defenses possibles.",
   "alternativeSan": null,
   "alternativeLine": [],
   "alternativeEval": null,
   "minDepth": 0,
   "requestedDepth": 0,
   "sacrifices": [],
   "proofMethod": "exhaustive_mate_tree",
   "proofNodes": 15833
  },
  "id": "hgr_r4k282B1R1PPp71p4p11P4K12P58w",
  "source": "reserve",
  "sideToMove": "w",
  "line": [
   "c6a8",
   "a5a4",
   "a8c6",
   "f8g8",
   "e6e8"
  ],
  "sanLine": [
   "Bxa8",
   "a4",
   "Bc6",
   "Kg8",
   "Re8#"
  ],
  "bestMove": "c6a8",
  "bestMoveSan": "Bxa8",
  "finalType": "mate",
  "finalMotif": "mate",
  "finalMotifs": [
   "mate"
  ],
  "theme": "mate",
  "tacticKind": "escac i mat",
  "difficulty": 75,
  "difficultyPercent": 75,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "playerMove": null,
  "origin": "stockfish19_lozza3_mate3",
  "sourceGameId": null,
  "sourceFen": "r4k2/8/2B1R1PP/p7/1p4p1/1P4K1/2P5/8 w - - 3 43",
  "sourceMoveNumber": 43,
  "adaptationNote": null,
  "pv": [
   "c6a8",
   "a5a4",
   "a8c6",
   "f8g8",
   "e6e8"
  ],
  "evalBefore": null,
  "ratingEstimate": null,
  "createdAt": 0,
  "updatedAt": 0,
  "publishedAt": 1793626199858
 },
 {
  "id": "hgr_6k14r2R3p2K181p3b2888w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "6k1/4r2R/3p2K1/8/1p3b2/8/8/8 w - - 0 57",
  "sideToMove": "w",
  "line": [
   "h7e7",
   "g8f8",
   "e7f7",
   "f8e8",
   "f7f4"
  ],
  "sanLine": [
   "Rxe7",
   "Kf8",
   "Rf7+",
   "Ke8",
   "Rxf4"
  ],
  "finalType": "fork",
  "difficulty": 32,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "h7e7",
  "bestMoveSan": "Rxe7",
  "solutionMoves": [
   "h7e7",
   "e7f7",
   "f7f4"
  ],
  "replyMoves": [
   "g8f8",
   "f8e8"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "6k1/4r2R/3p2K1/8/1p3b2/8/8/8 w - - 0 57",
   "line": [
    "h7e7",
    "g8f8",
    "e7f7",
    "f8e8",
    "f7f4"
   ],
   "finalFen": "4k3/8/3p2K1/8/1p3R2/8/8/8 b - - 0 59",
   "kind": "material",
   "finalSan": "Rxf4",
   "gain": 8,
   "checkedReplies": 5,
   "checkedAlternatives": 15,
   "explanation": "Rxf4 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 8 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Kf6",
   "alternativeLine": [
    "Kf6",
    "Be5+",
    "Ke6",
    "b3"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 6
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Segona jugada (Rf7+): La torre a f7 ataca alhora el rei i l'alfil. La jugada final (Rxf4) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "6k1/4r2R/3p2K1/8/1p3b2/8/8/8 w - - 0 57",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 32,
  "ratingEstimate": null,
  "pv": [
   "h7e7",
   "g8f8",
   "e7f7",
   "f8e8",
   "f7f4"
  ],
  "evalBefore": 511,
  "publishedAt": 1793571038563
 },
 {
  "id": "hgr_1rb2q21pb2pk1p3p2p1B3p28P3Q31PP2PPP3R2K1",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "1rb2q2/1pb2pk1/p3p2p/1B3p2/8/P3Q3/1PP2PPP/3R2K1 w - - 0 28",
  "sideToMove": "w",
  "line": [
   "e3c3",
   "e6e5",
   "c3c7",
   "c8e6",
   "c7e5"
  ],
  "sanLine": [
   "Qc3+",
   "e5",
   "Qxc7",
   "Be6",
   "Qxe5+"
  ],
  "finalType": "fork",
  "difficulty": 37,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "e3c3",
  "bestMoveSan": "Qc3+",
  "solutionMoves": [
   "e3c3",
   "c3c7",
   "c7e5"
  ],
  "replyMoves": [
   "e6e5",
   "c8e6"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "1rb2q2/1pb2pk1/p3p2p/1B3p2/8/P3Q3/1PP2PPP/3R2K1 w - - 0 28",
   "line": [
    "e3c3",
    "e6e5",
    "c3c7",
    "c8e6",
    "c7e5"
   ],
   "finalFen": "1r3q2/1p3pk1/p3b2p/1B2Qp2/8/P7/1PP2PPP/3R2K1 b - - 0 30",
   "kind": "material",
   "finalSan": "Qxe5+",
   "gain": 4,
   "checkedReplies": 4,
   "checkedAlternatives": 48,
   "explanation": "Qxe5+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Ba4",
   "alternativeLine": [
    "Ba4",
    "e4",
    "Bb3",
    "Bxb3"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 90
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "check"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "La dama a e5 ataca alhora el rei i la torre i l'alfil.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "1rb2q2/1pb2pk1/p3p2p/1B3p2/8/P3Q3/1PP2PPP/3R2K1 w - - 0 28",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 37,
  "ratingEstimate": null,
  "pv": [
   "e3c3",
   "e6e5",
   "c3c7",
   "c8e6",
   "c7e5"
  ],
  "evalBefore": 342,
  "publishedAt": 1793570753122
 },
 {
  "id": "hgr_r1b5p4kp13Rp1Np3nPp1P3P481P3PP16K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "r1b5/p4kp1/3Rp1Np/3nPp1P/3P4/8/1P3PP1/6K1 w - - 0 28",
  "sideToMove": "w",
  "line": [
   "d6d8",
   "c8b7",
   "d8d7",
   "f7g8",
   "d7b7"
  ],
  "sanLine": [
   "Rd8",
   "Bb7",
   "Rd7+",
   "Kg8",
   "Rxb7"
  ],
  "finalType": "fork",
  "difficulty": 34,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "d6d8",
  "bestMoveSan": "Rd8",
  "solutionMoves": [
   "d6d8",
   "d8d7",
   "d7b7"
  ],
  "replyMoves": [
   "c8b7",
   "f7g8"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "r1b5/p4kp1/3Rp1Np/3nPp1P/3P4/8/1P3PP1/6K1 w - - 0 28",
   "line": [
    "d6d8",
    "c8b7",
    "d8d7",
    "f7g8",
    "d7b7"
   ],
   "finalFen": "r5k1/pR4p1/4p1Np/3nPp1P/3P4/8/1P3PP1/6K1 b - - 0 30",
   "kind": "material",
   "finalSan": "Rxb7",
   "gain": 3,
   "checkedReplies": 17,
   "checkedAlternatives": 21,
   "explanation": "Rxb7 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "g4",
   "alternativeLine": [
    "g4",
    "Rb8",
    "gxf5",
    "exf5"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -147
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Segona jugada (Rd7+): La torre a d7 ataca alhora el rei i l'alfil i el cavall. La jugada final (Rxb7) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "r1b5/p4kp1/3Rp1Np/3nPp1P/3P4/8/1P3PP1/6K1 w - - 0 28",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": 34,
  "ratingEstimate": null,
  "pv": [
   "d6d8",
   "c8b7",
   "d8d7",
   "f7g8",
   "d7b7"
  ],
  "evalBefore": 338,
  "publishedAt": 1793570710347
 },
 {
  "id": "hgr_81p3p1p2p2Ppk6r17P1P2P36RK3q1B2w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "8/1p3p1p/2p2Ppk/6r1/7P/1P2P3/6RK/3q1B2 w - - 0 46",
  "sideToMove": "w",
  "line": [
   "h4g5",
   "h6h5",
   "f1e2",
   "d1e2",
   "g2e2"
  ],
  "sanLine": [
   "hxg5+",
   "Kh5",
   "Be2+",
   "Qxe2",
   "Rxe2"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "h4g5",
  "bestMoveSan": "hxg5+",
  "solutionMoves": [
   "h4g5",
   "f1e2",
   "g2e2"
  ],
  "replyMoves": [
   "h6h5",
   "d1e2"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "8/1p3p1p/2p2Ppk/6r1/7P/1P2P3/6RK/3q1B2 w - - 0 46",
   "line": [
    "h4g5",
    "h6h5",
    "f1e2",
    "d1e2",
    "g2e2"
   ],
   "finalFen": "8/1p3p1p/2p2Pp1/6Pk/8/1P2P3/4R2K/8 b - - 0 48",
   "kind": "material",
   "finalSan": "Rxe2",
   "gain": 10,
   "checkedReplies": 7,
   "checkedAlternatives": 7,
   "explanation": "Rxe2 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 10 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "e4",
   "alternativeLine": [
    "e4",
    "Qxe4",
    "Rf2",
    "Kxg5"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -801
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 11 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "8/1p3p1p/2p2Ppk/6r1/7P/1P2P3/6RK/3q1B2 w - - 0 46",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "h4g5",
   "h6h5",
   "f1e2",
   "d1e2",
   "g2e2"
  ],
  "evalBefore": 470,
  "publishedAt": 1793539993986
 },
 {
  "id": "hgr_rr4k1pRpb1p1pB1pp1p2882P1P3P1P2PPP4K2RbK",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "rr4k1/pRpb1p1p/B1pp1p2/8/8/2P1P3/P1P2PPP/4K2R b K - 3 15",
  "sideToMove": "b",
  "line": [
   "b8b7",
   "a6b7",
   "a8b8",
   "e1d2",
   "b8b7"
  ],
  "sanLine": [
   "Rxb7",
   "Bxb7",
   "Rb8",
   "Kd2",
   "Rxb7"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "b8b7",
  "bestMoveSan": "Rxb7",
  "solutionMoves": [
   "b8b7",
   "a8b8",
   "b8b7"
  ],
  "replyMoves": [
   "a6b7",
   "e1d2"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "rr4k1/pRpb1p1p/B1pp1p2/8/8/2P1P3/P1P2PPP/4K2R b K - 3 15",
   "line": [
    "b8b7",
    "a6b7",
    "a8b8",
    "e1d2",
    "b8b7"
   ],
   "finalFen": "6k1/prpb1p1p/2pp1p2/8/8/2P1P3/P1PK1PPP/7R w - - 0 18",
   "kind": "material",
   "finalSan": "Rxb7",
   "gain": 3,
   "checkedReplies": 22,
   "checkedAlternatives": 21,
   "explanation": "Rxb7 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Kg7",
   "alternativeLine": [
    "Kg7",
    "Ba6",
    "f5",
    "a3"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 0
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "rr4k1/pRpb1p1p/B1pp1p2/8/8/2P1P3/P1P2PPP/4K2R b K - 3 15",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "b8b7",
   "a6b7",
   "a8b8",
   "e1d2",
   "b8b7"
  ],
  "evalBefore": 478,
  "publishedAt": 1793539954808
 },
 {
  "id": "hgr_4k35p26pB1P1R3pn7P2b2rP6P16K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "4k3/5p2/6pB/1P1R3p/n7/P2b2rP/6P1/6K1 w - - 4 35",
  "sideToMove": "w",
  "line": [
   "d5e5",
   "e8d7",
   "h6f4",
   "g3g2",
   "g1g2"
  ],
  "sanLine": [
   "Re5+",
   "Kd7",
   "Bf4",
   "Rxg2+",
   "Kxg2"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "d5e5",
  "bestMoveSan": "Re5+",
  "solutionMoves": [
   "d5e5",
   "h6f4",
   "g1g2"
  ],
  "replyMoves": [
   "e8d7",
   "g3g2"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "4k3/5p2/6pB/1P1R3p/n7/P2b2rP/6P1/6K1 w - - 4 35",
   "line": [
    "d5e5",
    "e8d7",
    "h6f4",
    "g3g2",
    "g1g2"
   ],
   "finalFen": "8/3k1p2/6p1/1P2R2p/n4B2/P2b3P/6K1/8 b - - 0 37",
   "kind": "material",
   "finalSan": "Kxg2",
   "gain": 3,
   "checkedReplies": 20,
   "checkedAlternatives": 1,
   "explanation": "Kxg2 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Kh1",
   "alternativeLine": [
    "Kh1",
    "Rf2",
    "Rd5+",
    "Kc8"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -486
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 4 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "4k3/5p2/6pB/1P1R3p/n7/P2b2rP/6P1/6K1 w - - 4 35",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "d5e5",
   "e8d7",
   "h6f4",
   "g3g2",
   "g1g2"
  ],
  "evalBefore": 403,
  "publishedAt": 1793539942913
 },
 {
  "id": "hgr_r1b1kbn1q3ppp1pQp585Bp18PP2NP2R3K2BwQq",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "r1b1kbn1/q3ppp1/pQp5/8/5Bp1/8/PP2NP2/R3K2B w Qq - 2 19",
  "sideToMove": "w",
  "line": [
   "b6c6",
   "c8d7",
   "c6a8",
   "a7a8",
   "h1a8"
  ],
  "sanLine": [
   "Qxc6+",
   "Bd7",
   "Qxa8+",
   "Qxa8",
   "Bxa8"
  ],
  "finalType": "fork",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "b6c6",
  "bestMoveSan": "Qxc6+",
  "solutionMoves": [
   "b6c6",
   "c6a8",
   "h1a8"
  ],
  "replyMoves": [
   "c8d7",
   "a7a8"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "r1b1kbn1/q3ppp1/pQp5/8/5Bp1/8/PP2NP2/R3K2B w Qq - 2 19",
   "line": [
    "b6c6",
    "c8d7",
    "c6a8",
    "a7a8",
    "h1a8"
   ],
   "finalFen": "B3kbn1/3bppp1/p7/8/5Bp1/8/PP2NP2/R3K3 b Q - 0 21",
   "kind": "material",
   "finalSan": "Bxa8",
   "gain": 6,
   "checkedReplies": 17,
   "checkedAlternatives": 34,
   "explanation": "Bxa8 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 6 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Ng3",
   "alternativeLine": [
    "Ng3",
    "Bc6",
    "Bxc6+",
    "Qxc6"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -612
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 2,
     "offered": "q",
     "offerUci": "c6a8",
     "replyUci": "a7a8",
     "square": "a8",
     "loss": 3,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 545
    }
   ]
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Primera jugada (Qxc6+): La dama a c6 ataca alhora el rei i la torre i l'alfil. La jugada final (Bxa8) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "r1b1kbn1/q3ppp1/pQp5/8/5Bp1/8/PP2NP2/R3K2B w Qq - 2 19",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "b6c6",
   "c8d7",
   "c6a8",
   "a7a8",
   "h1a8"
  ],
  "evalBefore": 480,
  "publishedAt": 1793527464646
 },
 {
  "id": "hgr_r1bR1b1kpp5p6pB4p34N31Q3r2PP3Pq14K2RwK",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "r1bR1b1k/pp5p/6pB/4p3/4N3/1Q3r2/PP3Pq1/4K2R w K - 8 28",
  "sideToMove": "w",
  "line": [
   "b3f3",
   "g2f3",
   "d8f8",
   "f3f8",
   "h6f8"
  ],
  "sanLine": [
   "Qxf3",
   "Qxf3",
   "Rxf8+",
   "Qxf8",
   "Bxf8"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "b3f3",
  "bestMoveSan": "Qxf3",
  "solutionMoves": [
   "b3f3",
   "d8f8",
   "h6f8"
  ],
  "replyMoves": [
   "g2f3",
   "f3f8"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "r1bR1b1k/pp5p/6pB/4p3/4N3/1Q3r2/PP3Pq1/4K2R w K - 8 28",
   "line": [
    "b3f3",
    "g2f3",
    "d8f8",
    "f3f8",
    "h6f8"
   ],
   "finalFen": "r1b2B1k/pp5p/6p1/4p3/4N3/8/PP3P2/4K2R b K - 0 30",
   "kind": "material",
   "finalSan": "Bxf8",
   "gain": 3,
   "checkedReplies": 14,
   "checkedAlternatives": 30,
   "explanation": "Bxf8 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Rh4",
   "alternativeLine": [
    "Rh4",
    "Qb4+",
    "Bd2",
    "Qxb2"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -617
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 1,
     "offered": "q",
     "offerUci": "b3f3",
     "replyUci": "g2f3",
     "square": "f3",
     "loss": 4,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 486
    },
    {
     "step": 2,
     "offered": "r",
     "offerUci": "d8f8",
     "replyUci": "f3f8",
     "square": "f8",
     "loss": 6,
     "kingInCheck": false,
     "checkedDefenses": 1,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 502
    }
   ]
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "r1bR1b1k/pp5p/6pB/4p3/4N3/1Q3r2/PP3Pq1/4K2R w K - 8 28",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "b3f3",
   "g2f3",
   "d8f8",
   "f3f8",
   "h6f8"
  ],
  "evalBefore": 320,
  "publishedAt": 1793527463148
 },
 {
  "id": "hgr_r7pp3pk12pn1q1rN2n2pp1Q1P43N3PPP2R1P15RK",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "r7/pp3pk1/2pn1q1r/N2n2pp/1Q1P4/3N3P/PP2R1P1/5RK1 w - - 5 26",
  "sideToMove": "w",
  "line": [
   "f1f6",
   "d5b4",
   "f6h6",
   "g7h6",
   "d3b4"
  ],
  "sanLine": [
   "Rxf6",
   "Nxb4",
   "Rxh6",
   "Kxh6",
   "Nxb4"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "f1f6",
  "bestMoveSan": "Rxf6",
  "solutionMoves": [
   "f1f6",
   "f6h6",
   "d3b4"
  ],
  "replyMoves": [
   "d5b4",
   "g7h6"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "r7/pp3pk1/2pn1q1r/N2n2pp/1Q1P4/3N3P/PP2R1P1/5RK1 w - - 5 26",
   "line": [
    "f1f6",
    "d5b4",
    "f6h6",
    "g7h6",
    "d3b4"
   ],
   "finalFen": "r7/pp3p2/2pn3k/N5pp/1N1P4/7P/PP2R1P1/6K1 b - - 0 28",
   "kind": "material",
   "finalSan": "Nxb4",
   "gain": 3,
   "checkedReplies": 24,
   "checkedAlternatives": 31,
   "explanation": "Nxb4 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Nxb7",
   "alternativeLine": [
    "Nxb7",
    "Nxd3",
    "Nxd6",
    "Kg6"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 26
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "r7/pp3pk1/2pn1q1r/N2n2pp/1Q1P4/3N3P/PP2R1P1/5RK1 w - - 5 26",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "f1f6",
   "d5b4",
   "f6h6",
   "g7h6",
   "d3b4"
  ],
  "evalBefore": 421,
  "publishedAt": 1793527451159
 },
 {
  "id": "hgr_r1bq1rk11p1nb1pp4pn22P5p72PB1N2PP2QPPPR1",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "r1bq1rk1/1p1nb1pp/4pn2/2P5/p7/2PB1N2/PP2QPPP/R1B1R1K1 w - - 0 15",
  "sideToMove": "w",
  "line": [
   "e2e6",
   "g8h8",
   "e6e7",
   "d8e7",
   "e1e7"
  ],
  "sanLine": [
   "Qxe6+",
   "Kh8",
   "Qxe7",
   "Qxe7",
   "Rxe7"
  ],
  "finalType": "fork",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "e2e6",
  "bestMoveSan": "Qxe6+",
  "solutionMoves": [
   "e2e6",
   "e6e7",
   "e1e7"
  ],
  "replyMoves": [
   "g8h8",
   "d8e7"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "r1bq1rk1/1p1nb1pp/4pn2/2P5/p7/2PB1N2/PP2QPPP/R1B1R1K1 w - - 0 15",
   "line": [
    "e2e6",
    "g8h8",
    "e6e7",
    "d8e7",
    "e1e7"
   ],
   "finalFen": "r1b2r1k/1p1nR1pp/5n2/2P5/p7/2PB1N2/PP3PPP/R1B3K1 b - - 0 17",
   "kind": "material",
   "finalSan": "Rxe7",
   "gain": 3,
   "checkedReplies": 26,
   "checkedAlternatives": 40,
   "explanation": "Rxe7 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Bf4",
   "alternativeLine": [
    "Bf4",
    "Qxc5",
    "Bf1",
    "Ng8"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -521
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 2,
     "offered": "q",
     "offerUci": "e6e7",
     "replyUci": "d8e7",
     "square": "e7",
     "loss": 5,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 487
    }
   ]
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Primera jugada (Qxe6+): La dama a e6 ataca alhora el rei i els dos cavalls i l'alfil. La jugada final (Rxe7) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "r1bq1rk1/1p1nb1pp/4pn2/2P5/p7/2PB1N2/PP2QPPP/R1B1R1K1 w - - 0 15",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "e2e6",
   "g8h8",
   "e6e7",
   "d8e7",
   "e1e7"
  ],
  "evalBefore": 583,
  "publishedAt": 1793522597500
 },
 {
  "id": "hgr_rnbqkbnr1p2p1ppp4p23pN33P48PPP2PPPRNBQKB",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "rnbqkbnr/1p2p1pp/p4p2/3pN3/3P4/8/PPP2PPP/RNBQKB1R w KQkq - 0 6",
  "sideToMove": "w",
  "line": [
   "d1h5",
   "g7g6",
   "e5g6",
   "h7g6",
   "h5h8"
  ],
  "sanLine": [
   "Qh5+",
   "g6",
   "Nxg6",
   "hxg6",
   "Qxh8"
  ],
  "finalType": "pin",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "d1h5",
  "bestMoveSan": "Qh5+",
  "solutionMoves": [
   "d1h5",
   "e5g6",
   "h5h8"
  ],
  "replyMoves": [
   "g7g6",
   "h7g6"
  ],
  "theme": "pin",
  "tacticKind": "clavada",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "rnbqkbnr/1p2p1pp/p4p2/3pN3/3P4/8/PPP2PPP/RNBQKB1R w KQkq - 0 6",
   "line": [
    "d1h5",
    "g7g6",
    "e5g6",
    "h7g6",
    "h5h8"
   ],
   "finalFen": "rnbqkbnQ/1p2p3/p4pp1/3p4/3P4/8/PPP2PPP/RNB1KB1R b KQq - 0 8",
   "kind": "material",
   "finalSan": "Qxh8",
   "gain": 3,
   "checkedReplies": 25,
   "checkedAlternatives": 42,
   "explanation": "Qxh8 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Qxg6+",
   "alternativeLine": [
    "Qxg6+",
    "Kd7",
    "c4",
    "Qe8"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -97
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 2,
     "offered": "n",
     "offerUci": "e5g6",
     "replyUci": "h7g6",
     "square": "g6",
     "loss": 2,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 466
    }
   ]
  },
  "finalMotif": "pin",
  "finalMotifs": [
   "pin",
   "major_win"
  ],
  "finalMotifLabel": "clavada",
  "finalMotifReason": "Primera jugada (Qh5+): La dama a h5 clava el peó contra la torre. La jugada final (Qxh8) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "rnbqkbnr/1p2p1pp/p4p2/3pN3/3P4/8/PPP2PPP/RNBQKB1R w KQkq - 0 6",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "d1h5",
   "g7g6",
   "e5g6",
   "h7g6",
   "h5h8"
  ],
  "evalBefore": 370,
  "publishedAt": 1793522513724
 },
 {
  "id": "hgr_81p61B2R36pkP1P4p82q3BK8b",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "8/1p6/1B2R3/6pk/P1P4p/8/2q3BK/8 b - - 6 46",
  "sideToMove": "b",
  "line": [
   "h4h3",
   "h2h3",
   "c2f5",
   "h3h2",
   "f5e6"
  ],
  "sanLine": [
   "h3",
   "Kxh3",
   "Qf5+",
   "Kh2",
   "Qxe6"
  ],
  "finalType": "fork",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "h4h3",
  "bestMoveSan": "h3",
  "solutionMoves": [
   "h4h3",
   "c2f5",
   "f5e6"
  ],
  "replyMoves": [
   "h2h3",
   "h3h2"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "8/1p6/1B2R3/6pk/P1P4p/8/2q3BK/8 b - - 6 46",
   "line": [
    "h4h3",
    "h2h3",
    "c2f5",
    "h3h2",
    "f5e6"
   ],
   "finalFen": "8/1p6/1B2q3/6pk/P1P5/8/6BK/8 w - - 0 49",
   "kind": "material",
   "finalSan": "Qxe6",
   "gain": 3,
   "checkedReplies": 22,
   "checkedAlternatives": 23,
   "explanation": "Qxe6 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Qf4+",
   "alternativeLine": [
    "Qf4+",
    "Kg1",
    "Qxc4",
    "Re4"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -28
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Segona jugada (Qf5+): La dama a f5 ataca alhora la torre i el rei. La jugada final (Qxe6) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "8/1p6/1B2R3/6pk/P1P4p/8/2q3BK/8 b - - 6 46",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "h4h3",
   "h2h3",
   "c2f5",
   "h3h2",
   "f5e6"
  ],
  "evalBefore": 342,
  "publishedAt": 1793522493642
 },
 {
  "id": "hgr_3r1k21R2pp1p2Pp2p11p61p2P34B2P1b3PP16K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "3r1k2/1R2pp1p/2Pp2p1/1p6/1p2P3/4B2P/1b3PP1/6K1 w - - 2 26",
  "sideToMove": "w",
  "line": [
   "c6c7",
   "d8c8",
   "b7b8",
   "f8e8",
   "b8c8"
  ],
  "sanLine": [
   "c7",
   "Rc8",
   "Rb8",
   "Ke8",
   "Rxc8+"
  ],
  "finalType": "pin",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "c6c7",
  "bestMoveSan": "c7",
  "solutionMoves": [
   "c6c7",
   "b7b8",
   "b8c8"
  ],
  "replyMoves": [
   "d8c8",
   "f8e8"
  ],
  "theme": "pin",
  "tacticKind": "clavada",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "3r1k2/1R2pp1p/2Pp2p1/1p6/1p2P3/4B2P/1b3PP1/6K1 w - - 2 26",
   "line": [
    "c6c7",
    "d8c8",
    "b7b8",
    "f8e8",
    "b8c8"
   ],
   "finalFen": "2R1k3/2P1pp1p/3p2p1/1p6/1p2P3/4B2P/1b3PP1/6K1 b - - 0 28",
   "kind": "material",
   "finalSan": "Rxc8+",
   "gain": 5,
   "checkedReplies": 1,
   "checkedAlternatives": 22,
   "explanation": "Rxc8+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 5 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Bc1",
   "alternativeLine": [
    "Bc1",
    "Bxc1",
    "Rxc8+",
    "Kd7"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 0
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "kind": "refused",
     "step": 2,
     "offered": "r",
     "offerUci": "b7b8",
     "replyUci": "f8e8",
     "captureUci": "c8b8",
     "acceptedFen": "1r3k2/2P1pp1p/3p2p1/1p6/1p2P3/4B2P/1b3PP1/6K1 w - - 0 28",
     "square": "b8",
     "loss": 5,
     "compensationKind": "material",
     "checkedDepth": 18,
     "captureEvalType": "cp",
     "captureEval": 789
    }
   ]
  },
  "finalMotif": "pin",
  "finalMotifs": [
   "pin",
   "major_win",
   "check"
  ],
  "finalMotifLabel": "clavada",
  "finalMotifReason": "Segona jugada (Rb8): La torre a b8 clava la torre contra el rei. La jugada final (Rxc8+) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "3r1k2/1R2pp1p/2Pp2p1/1p6/1p2P3/4B2P/1b3PP1/6K1 w - - 2 26",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "c6c7",
   "d8c8",
   "b7b8",
   "f8e8",
   "b8c8"
  ],
  "evalBefore": 480,
  "publishedAt": 1793522020467
 },
 {
  "id": "hgr_8p75k2KQqn4P787P8b",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "8/p7/5k2/KQqn4/P7/8/7P/8 b - - 1 55",
  "sideToMove": "b",
  "line": [
   "c5c3",
   "a5a6",
   "d5c7",
   "a6a7",
   "c7b5"
  ],
  "sanLine": [
   "Qc3+",
   "Ka6",
   "Nc7+",
   "Kxa7",
   "Nxb5+"
  ],
  "finalType": "fork",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "c5c3",
  "bestMoveSan": "Qc3+",
  "solutionMoves": [
   "c5c3",
   "d5c7",
   "c7b5"
  ],
  "replyMoves": [
   "a5a6",
   "a6a7"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "8/p7/5k2/KQqn4/P7/8/7P/8 b - - 1 55",
   "line": [
    "c5c3",
    "a5a6",
    "d5c7",
    "a6a7",
    "c7b5"
   ],
   "finalFen": "8/K7/5k2/1n6/P7/2q5/7P/8 w - - 0 58",
   "kind": "material",
   "finalSan": "Nxb5+",
   "gain": 5,
   "checkedReplies": 6,
   "checkedAlternatives": 30,
   "explanation": "Nxb5+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 5 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Ke6",
   "alternativeLine": [
    "Ke6",
    "Qb1",
    "Nd5",
    "Qg6+"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 27
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win",
   "check"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Segona jugada (Nc7+): El cavall a c7 ataca alhora la dama i el rei. La jugada final (Nxb5+) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "8/p7/5k2/KQqn4/P7/8/7P/8 b - - 1 55",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "c5c3",
   "a5a6",
   "d5c7",
   "a6a7",
   "c7b5"
  ],
  "evalBefore": 691,
  "publishedAt": 1793521954562
 },
 {
  "id": "hgr_3k4Q1r1nR2p5p14p34N1P181P3P1K4q3w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "3k4/Q1r1nR2/p5p1/4p3/4N1P1/8/1P3P1K/4q3 w - - 8 35",
  "sideToMove": "w",
  "line": [
   "a7b8",
   "d8d7",
   "f7e7",
   "d7e7",
   "b8c7"
  ],
  "sanLine": [
   "Qb8+",
   "Kd7",
   "Rxe7+",
   "Kxe7",
   "Qxc7+"
  ],
  "finalType": "skewer",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "a7b8",
  "bestMoveSan": "Qb8+",
  "solutionMoves": [
   "a7b8",
   "f7e7",
   "b8c7"
  ],
  "replyMoves": [
   "d8d7",
   "d7e7"
  ],
  "theme": "skewer",
  "tacticKind": "enfilada",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "3k4/Q1r1nR2/p5p1/4p3/4N1P1/8/1P3P1K/4q3 w - - 8 35",
   "line": [
    "a7b8",
    "d8d7",
    "f7e7",
    "d7e7",
    "b8c7"
   ],
   "finalFen": "8/2Q1k3/p5p1/4p3/4N1P1/8/1P3P1K/4q3 b - - 0 37",
   "kind": "material",
   "finalSan": "Qxc7+",
   "gain": 3,
   "checkedReplies": 3,
   "checkedAlternatives": 28,
   "explanation": "Qxc7+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Qb6",
   "alternativeLine": [
    "Qb6",
    "Qxe4",
    "Qxc7+",
    "Kf8"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 0
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 2,
     "offered": "r",
     "offerUci": "f7e7",
     "replyUci": "d7e7",
     "square": "e7",
     "loss": 2,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "mate",
     "continuationEval": 12
    }
   ]
  },
  "finalMotif": "skewer",
  "finalMotifs": [
   "skewer",
   "major_win",
   "check"
  ],
  "finalMotifLabel": "enfilada",
  "finalMotifReason": "Segona jugada (Rxe7+): La torre a e7 fa una enfilada: el rei s'ha d'apartar i deixa al descobert la torre. La jugada final (Qxc7+) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "3k4/Q1r1nR2/p5p1/4p3/4N1P1/8/1P3P1K/4q3 w - - 8 35",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "a7b8",
   "d8d7",
   "f7e7",
   "d7e7",
   "b8c7"
  ],
  "evalBefore": 716,
  "publishedAt": 1793521930254
 },
 {
  "id": "hgr_6k12q4p1p4p1r1rn41p1RQ36NP3R1PPK8w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "6k1/2q4p/1p4p1/r1rn4/1p1RQ3/6NP/3R1PPK/8 w - - 5 39",
  "sideToMove": "w",
  "line": [
   "d4d5",
   "c5d5",
   "d2d5",
   "a5d5",
   "e4d5"
  ],
  "sanLine": [
   "Rxd5",
   "Rxd5",
   "Rxd5",
   "Rxd5",
   "Qxd5+"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "d4d5",
  "bestMoveSan": "Rxd5",
  "solutionMoves": [
   "d4d5",
   "d2d5",
   "e4d5"
  ],
  "replyMoves": [
   "c5d5",
   "a5d5"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "6k1/2q4p/1p4p1/r1rn4/1p1RQ3/6NP/3R1PPK/8 w - - 5 39",
   "line": [
    "d4d5",
    "c5d5",
    "d2d5",
    "a5d5",
    "e4d5"
   ],
   "finalFen": "6k1/2q4p/1p4p1/3Q4/1p6/6NP/5PPK/8 b - - 0 41",
   "kind": "material",
   "finalSan": "Qxd5+",
   "gain": 3,
   "checkedReplies": 4,
   "checkedAlternatives": 24,
   "explanation": "Qxd5+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Qxb4",
   "alternativeLine": [
    "Qxb4",
    "h5",
    "h4",
    "Qd6"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -374
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 1,
     "offered": "r",
     "offerUci": "d4d5",
     "replyUci": "c5d5",
     "square": "d5",
     "loss": 2,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 506
    },
    {
     "step": 2,
     "offered": "r",
     "offerUci": "d2d5",
     "replyUci": "a5d5",
     "square": "d5",
     "loss": 2,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 500
    }
   ]
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win",
   "check"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "6k1/2q4p/1p4p1/r1rn4/1p1RQ3/6NP/3R1PPK/8 w - - 5 39",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "d4d5",
   "c5d5",
   "d2d5",
   "a5d5",
   "e4d5"
  ],
  "evalBefore": 470,
  "publishedAt": 1793483213615
 },
 {
  "id": "hgr_r2q1k1r1p4p14p1P1pB1p3pP5n12P4Q5PP1R3K2R",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "r2q1k1r/1p4p1/4p1P1/pB1p3p/P5n1/2P4Q/5PP1/R3K2R w KQ - 1 23",
  "sideToMove": "w",
  "line": [
   "h3g4",
   "h5g4",
   "h1h8",
   "f8e7",
   "h8d8"
  ],
  "sanLine": [
   "Qxg4",
   "hxg4",
   "Rxh8+",
   "Ke7",
   "Rxd8"
  ],
  "finalType": "skewer",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "h3g4",
  "bestMoveSan": "Qxg4",
  "solutionMoves": [
   "h3g4",
   "h1h8",
   "h8d8"
  ],
  "replyMoves": [
   "h5g4",
   "f8e7"
  ],
  "theme": "skewer",
  "tacticKind": "enfilada",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "r2q1k1r/1p4p1/4p1P1/pB1p3p/P5n1/2P4Q/5PP1/R3K2R w KQ - 1 23",
   "line": [
    "h3g4",
    "h5g4",
    "h1h8",
    "f8e7",
    "h8d8"
   ],
   "finalFen": "r2R4/1p2k1p1/4p1P1/pB1p4/P5p1/2P5/5PP1/R3K3 b Q - 0 25",
   "kind": "material",
   "finalSan": "Rxd8",
   "gain": 3,
   "checkedReplies": 11,
   "checkedAlternatives": 32,
   "explanation": "Rxd8 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Re8+",
   "alternativeLine": [
    "Re8+",
    "Qxe8",
    "Bxe8",
    "Rxe8"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -232
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 1,
     "offered": "q",
     "offerUci": "h3g4",
     "replyUci": "h5g4",
     "square": "g4",
     "loss": 6,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 479
    }
   ]
  },
  "finalMotif": "skewer",
  "finalMotifs": [
   "skewer",
   "major_win"
  ],
  "finalMotifLabel": "enfilada",
  "finalMotifReason": "Segona jugada (Rxh8+): La torre a h8 fa una enfilada: el rei s'ha d'apartar i deixa al descobert la dama. La jugada final (Rxd8) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "r2q1k1r/1p4p1/4p1P1/pB1p3p/P5n1/2P4Q/5PP1/R3K2R w KQ - 1 23",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "h3g4",
   "h5g4",
   "h1h8",
   "f8e7",
   "h8d8"
  ],
  "evalBefore": 427,
  "publishedAt": 1793482781765
 },
 {
  "id": "hgr_r2qkb1r5pppp3pn21pN53P46P14PPbPR1BQNRK1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "r2qkb1r/5ppp/p3pn2/1pN5/3P4/6P1/4PPbP/R1BQNRK1 w kq - 0 14",
  "sideToMove": "w",
  "line": [
   "e1g2",
   "f8c5",
   "d4c5",
   "d8d1",
   "f1d1"
  ],
  "sanLine": [
   "Nxg2",
   "Bxc5",
   "dxc5",
   "Qxd1",
   "Rxd1"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "e1g2",
  "bestMoveSan": "Nxg2",
  "solutionMoves": [
   "e1g2",
   "d4c5",
   "f1d1"
  ],
  "replyMoves": [
   "f8c5",
   "d8d1"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "r2qkb1r/5ppp/p3pn2/1pN5/3P4/6P1/4PPbP/R1BQNRK1 w kq - 0 14",
   "line": [
    "e1g2",
    "f8c5",
    "d4c5",
    "d8d1",
    "f1d1"
   ],
   "finalFen": "r3k2r/5ppp/p3pn2/1pP5/8/6P1/4PPNP/R1BR2K1 b kq - 0 16",
   "kind": "material",
   "finalSan": "Rxd1",
   "gain": 3,
   "checkedReplies": 22,
   "checkedAlternatives": 27,
   "explanation": "Rxd1 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "c6",
   "alternativeLine": [
    "c6",
    "Qxf1+",
    "Kxf1",
    "O-O"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -497
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "r2qkb1r/5ppp/p3pn2/1pN5/3P4/6P1/4PPbP/R1BQNRK1 w kq - 0 14",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "e1g2",
   "f8c5",
   "d4c5",
   "d8d1",
   "f1d1"
  ],
  "evalBefore": 438,
  "publishedAt": 1793482762901
 },
 {
  "id": "hgr_2r3k1p2nnrpp1p2B33p486P1PPP4P3RR1K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "2r3k1/p2nnrpp/1p2B3/3p4/8/6P1/PPP4P/3RR1K1 w - - 1 22",
  "sideToMove": "w",
  "line": [
   "e6d7",
   "c8c2",
   "d7e6",
   "g8f8",
   "e6f7"
  ],
  "sanLine": [
   "Bxd7",
   "Rxc2",
   "Be6",
   "Kf8",
   "Bxf7"
  ],
  "finalType": "pin",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "e6d7",
  "bestMoveSan": "Bxd7",
  "solutionMoves": [
   "e6d7",
   "d7e6",
   "e6f7"
  ],
  "replyMoves": [
   "c8c2",
   "g8f8"
  ],
  "theme": "pin",
  "tacticKind": "clavada",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "2r3k1/p2nnrpp/1p2B3/3p4/8/6P1/PPP4P/3RR1K1 w - - 1 22",
   "line": [
    "e6d7",
    "c8c2",
    "d7e6",
    "g8f8",
    "e6f7"
   ],
   "finalFen": "5k2/p3nBpp/1p6/3p4/8/6P1/PPr4P/3RR1K1 b - - 0 24",
   "kind": "material",
   "finalSan": "Bxf7",
   "gain": 4,
   "checkedReplies": 27,
   "checkedAlternatives": 26,
   "explanation": "Bxf7 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Bxd5",
   "alternativeLine": [
    "Bxd5",
    "Nxd5",
    "Rxd5",
    "g6"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -99
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "pin",
  "finalMotifs": [
   "pin",
   "major_win"
  ],
  "finalMotifLabel": "clavada",
  "finalMotifReason": "Segona jugada (Be6): L'alfil a e6 clava la torre contra el rei. La jugada final (Bxf7) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "2r3k1/p2nnrpp/1p2B3/3p4/8/6P1/PPP4P/3RR1K1 w - - 1 22",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "e6d7",
   "c8c2",
   "d7e6",
   "g8f8",
   "e6f7"
  ],
  "evalBefore": 429,
  "publishedAt": 1793450935312
 },
 {
  "id": "hgr_r1bq1rk15pp14p3p2p2bp6n11PN2QPPPB2PPB1R4",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "r1bq1rk1/5pp1/4p3/p2p2bp/6n1/1PN2QPP/PB2PPB1/R4RK1 b - - 2 19",
  "sideToMove": "b",
  "line": [
   "g4e5",
   "f3h5",
   "g7g6",
   "h5g5",
   "d8g5"
  ],
  "sanLine": [
   "Ne5",
   "Qxh5",
   "g6",
   "Qxg5",
   "Qxg5"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "g4e5",
  "bestMoveSan": "Ne5",
  "solutionMoves": [
   "g4e5",
   "g7g6",
   "d8g5"
  ],
  "replyMoves": [
   "f3h5",
   "h5g5"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "r1bq1rk1/5pp1/4p3/p2p2bp/6n1/1PN2QPP/PB2PPB1/R4RK1 b - - 2 19",
   "line": [
    "g4e5",
    "f3h5",
    "g7g6",
    "h5g5",
    "d8g5"
   ],
   "finalFen": "r1b2rk1/5p2/4p1p1/p2pn1q1/8/1PN3PP/PB2PPB1/R4RK1 w - - 0 22",
   "kind": "material",
   "finalSan": "Qxg5",
   "gain": 4,
   "checkedReplies": 31,
   "checkedAlternatives": 27,
   "explanation": "Qxg5 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Nf3+",
   "alternativeLine": [
    "Nf3+",
    "exf3",
    "Qxg5",
    "f4"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 164
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 5 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "r1bq1rk1/5pp1/4p3/p2p2bp/6n1/1PN2QPP/PB2PPB1/R4RK1 b - - 2 19",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "g4e5",
   "f3h5",
   "g7g6",
   "h5g5",
   "d8g5"
  ],
  "evalBefore": 374,
  "publishedAt": 1793450702404
 },
 {
  "id": "hgr_6k11p3pPp83P1r22P1p2P1N1n3b1R2K31R6b",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "6k1/1p3pPp/8/3P1r2/2P1p2P/1N1n3b/1R2K3/1R6 b - - 0 32",
  "sideToMove": "b",
  "line": [
   "f5f2",
   "e2e3",
   "f2b2",
   "b1b2",
   "d3b2"
  ],
  "sanLine": [
   "Rf2+",
   "Ke3",
   "Rxb2",
   "Rxb2",
   "Nxb2"
  ],
  "finalType": "skewer",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "f5f2",
  "bestMoveSan": "Rf2+",
  "solutionMoves": [
   "f5f2",
   "f2b2",
   "d3b2"
  ],
  "replyMoves": [
   "e2e3",
   "b1b2"
  ],
  "theme": "skewer",
  "tacticKind": "enfilada",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "6k1/1p3pPp/8/3P1r2/2P1p2P/1N1n3b/1R2K3/1R6 b - - 0 32",
   "line": [
    "f5f2",
    "e2e3",
    "f2b2",
    "b1b2",
    "d3b2"
   ],
   "finalFen": "6k1/1p3pPp/8/3P4/2P1p2P/1N2K2b/1n6/8 w - - 0 35",
   "kind": "material",
   "finalSan": "Nxb2",
   "gain": 4,
   "checkedReplies": 15,
   "checkedAlternatives": 21,
   "explanation": "Nxb2 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "b5",
   "alternativeLine": [
    "b5",
    "Rh2",
    "bxc4",
    "Nd4"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -330
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "skewer",
  "finalMotifs": [
   "skewer",
   "major_win"
  ],
  "finalMotifLabel": "enfilada",
  "finalMotifReason": "Primera jugada (Rf2+): La torre a f2 fa una enfilada: el rei s'ha d'apartar i deixa al descobert la torre. La jugada final (Nxb2) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "6k1/1p3pPp/8/3P1r2/2P1p2P/1N1n3b/1R2K3/1R6 b - - 0 32",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "f5f2",
   "e2e3",
   "f2b2",
   "b1b2",
   "d3b2"
  ],
  "evalBefore": 417,
  "publishedAt": 1793450454444
 },
 {
  "id": "hgr_4r1k13R46p11p66P12q2P25Q27Kw",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "4r1k1/3R4/6p1/1p6/6P1/2q2P2/5Q2/7K w - - 6 38",
  "sideToMove": "w",
  "line": [
   "f2a2",
   "c3c4",
   "a2a1",
   "c4f7",
   "d7f7"
  ],
  "sanLine": [
   "Qa2+",
   "Qc4",
   "Qa1",
   "Qf7",
   "Rxf7"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "f2a2",
  "bestMoveSan": "Qa2+",
  "solutionMoves": [
   "f2a2",
   "a2a1",
   "d7f7"
  ],
  "replyMoves": [
   "c3c4",
   "c4f7"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "4r1k1/3R4/6p1/1p6/6P1/2q2P2/5Q2/7K w - - 6 38",
   "line": [
    "f2a2",
    "c3c4",
    "a2a1",
    "c4f7",
    "d7f7"
   ],
   "finalFen": "4r1k1/5R2/6p1/1p6/6P1/5P2/8/Q6K b - - 0 40",
   "kind": "material",
   "finalSan": "Rxf7",
   "gain": 4,
   "checkedReplies": 15,
   "checkedAlternatives": 36,
   "explanation": "Rxf7 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Rd3",
   "alternativeLine": [
    "Rd3",
    "Qe6",
    "Qd1",
    "Qe5"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 11
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 9 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "4r1k1/3R4/6p1/1p6/6P1/2q2P2/5Q2/7K w - - 6 38",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "f2a2",
   "c3c4",
   "a2a1",
   "c4f7",
   "d7f7"
  ],
  "evalBefore": 663,
  "publishedAt": 1793441096520
 },
 {
  "id": "hgr_4rrk1p71n4NQ81Pp3pPP3R1P15PK1q7w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "4rrk1/p7/1n4NQ/8/1Pp3pP/P3R1P1/5PK1/q7 w - - 2 31",
  "sideToMove": "w",
  "line": [
   "g6e7",
   "e8e7",
   "e3e7",
   "f8f2",
   "g2f2"
  ],
  "sanLine": [
   "Ne7+",
   "Rxe7",
   "Rxe7",
   "Rxf2+",
   "Kxf2"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "g6e7",
  "bestMoveSan": "Ne7+",
  "solutionMoves": [
   "g6e7",
   "e3e7",
   "g2f2"
  ],
  "replyMoves": [
   "e8e7",
   "f8f2"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "4rrk1/p7/1n4NQ/8/1Pp3pP/P3R1P1/5PK1/q7 w - - 2 31",
   "line": [
    "g6e7",
    "e8e7",
    "e3e7",
    "f8f2",
    "g2f2"
   ],
   "finalFen": "6k1/p3R3/1n5Q/8/1Pp3pP/P5P1/5K2/q7 b - - 0 33",
   "kind": "material",
   "finalSan": "Kxf2",
   "gain": 5,
   "checkedReplies": 24,
   "checkedAlternatives": 0,
   "explanation": "Kxf2 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 5 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": null,
   "alternativeLine": [],
   "alternativeEval": null,
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 1,
     "offered": "n",
     "offerUci": "g6e7",
     "replyUci": "e8e7",
     "square": "e7",
     "loss": 3,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 767
    }
   ]
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 6 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "4rrk1/p7/1n4NQ/8/1Pp3pP/P3R1P1/5PK1/q7 w - - 2 31",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "g6e7",
   "e8e7",
   "e3e7",
   "f8f2",
   "g2f2"
  ],
  "evalBefore": 649,
  "publishedAt": 1793441052286
 },
 {
  "id": "hgr_7rp4pk1PpP1pbp16p12P3B14R1P15P1r3R2K1b",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "7r/p4pk1/PpP1pbp1/6p1/2P3B1/4R1P1/5P1r/3R2K1 b - - 1 30",
  "sideToMove": "b",
  "line": [
   "h2h1",
   "g1g2",
   "h8h2",
   "g2f3",
   "h1d1"
  ],
  "sanLine": [
   "Rh1+",
   "Kg2",
   "R8h2+",
   "Kf3",
   "Rxd1"
  ],
  "finalType": "skewer",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "h2h1",
  "bestMoveSan": "Rh1+",
  "solutionMoves": [
   "h2h1",
   "h8h2",
   "h1d1"
  ],
  "replyMoves": [
   "g1g2",
   "g2f3"
  ],
  "theme": "skewer",
  "tacticKind": "enfilada",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "7r/p4pk1/PpP1pbp1/6p1/2P3B1/4R1P1/5P1r/3R2K1 b - - 1 30",
   "line": [
    "h2h1",
    "g1g2",
    "h8h2",
    "g2f3",
    "h1d1"
   ],
   "finalFen": "8/p4pk1/PpP1pbp1/6p1/2P3B1/4RKP1/5P1r/3r4 w - - 0 33",
   "kind": "material",
   "finalSan": "Rxd1",
   "gain": 4,
   "checkedReplies": 17,
   "checkedAlternatives": 25,
   "explanation": "Rxd1 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Be7",
   "alternativeLine": [
    "Be7",
    "Rd7",
    "Kf6",
    "c7"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -340
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "skewer",
  "finalMotifs": [
   "skewer",
   "major_win"
  ],
  "finalMotifLabel": "enfilada",
  "finalMotifReason": "Primera jugada (Rh1+): La torre a h1 fa una enfilada: el rei s'ha d'apartar i deixa al descobert la torre. La jugada final (Rxd1) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "7r/p4pk1/PpP1pbp1/6p1/2P3B1/4R1P1/5P1r/3R2K1 b - - 1 30",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "h2h1",
   "g1g2",
   "h8h2",
   "g2f3",
   "h1d1"
  ],
  "evalBefore": 479,
  "publishedAt": 1793441042093
 },
 {
  "id": "hgr_6k12R3p13p1b1p3N44P3r4PP13q3P1Q4K1b",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "6k1/2R3p1/3p1b1p/3N4/4P3/r4PP1/3q3P/1Q4K1 b - - 14 40",
  "sideToMove": "b",
  "line": [
   "f6d4",
   "g1h1",
   "a3a1",
   "b1a1",
   "d4a1"
  ],
  "sanLine": [
   "Bd4+",
   "Kh1",
   "Ra1",
   "Qxa1",
   "Bxa1"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "f6d4",
  "bestMoveSan": "Bd4+",
  "solutionMoves": [
   "f6d4",
   "a3a1",
   "d4a1"
  ],
  "replyMoves": [
   "g1h1",
   "b1a1"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "6k1/2R3p1/3p1b1p/3N4/4P3/r4PP1/3q3P/1Q4K1 b - - 14 40",
   "line": [
    "f6d4",
    "g1h1",
    "a3a1",
    "b1a1",
    "d4a1"
   ],
   "finalFen": "6k1/2R3p1/3p3p/3N4/4P3/5PP1/3q3P/b6K w - - 0 43",
   "kind": "material",
   "finalSan": "Bxa1",
   "gain": 3,
   "checkedReplies": 26,
   "checkedAlternatives": 33,
   "explanation": "Bxa1 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Qe2",
   "alternativeLine": [
    "Qe2",
    "Rc3",
    "Kh7",
    "Qc1"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -341
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 2,
     "offered": "r",
     "offerUci": "a3a1",
     "replyUci": "b1a1",
     "square": "a1",
     "loss": 5,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 674
    }
   ]
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 4 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "6k1/2R3p1/3p1b1p/3N4/4P3/r4PP1/3q3P/1Q4K1 b - - 14 40",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "f6d4",
   "g1h1",
   "a3a1",
   "b1a1",
   "d4a1"
  ],
  "evalBefore": 436,
  "publishedAt": 1793401330082
 },
 {
  "id": "hgr_5r1k1pp5p4N1p6p11P2b1P18P4q1PQ5K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "5r1k/1pp5/p4N1p/6p1/1P2b1P1/8/P4q1P/Q5K1 w - - 0 39",
  "sideToMove": "w",
  "line": [
   "g1f2",
   "h8g7",
   "f2e3",
   "f8f6",
   "e3e4"
  ],
  "sanLine": [
   "Kxf2",
   "Kg7",
   "Ke3",
   "Rxf6",
   "Kxe4"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "g1f2",
  "bestMoveSan": "Kxf2",
  "solutionMoves": [
   "g1f2",
   "f2e3",
   "e3e4"
  ],
  "replyMoves": [
   "h8g7",
   "f8f6"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "5r1k/1pp5/p4N1p/6p1/1P2b1P1/8/P4q1P/Q5K1 w - - 0 39",
   "line": [
    "g1f2",
    "h8g7",
    "f2e3",
    "f8f6",
    "e3e4"
   ],
   "finalFen": "8/1pp3k1/p4r1p/6p1/1P2K1P1/8/P6P/Q7 b - - 0 41",
   "kind": "material",
   "finalSan": "Kxe4",
   "gain": 9,
   "checkedReplies": 12,
   "checkedAlternatives": 20,
   "explanation": "Kxe4 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 9 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Qc3",
   "alternativeLine": [
    "Qc3",
    "Bc6",
    "Qe5",
    "Kg6"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 56
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 9 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "5r1k/1pp5/p4N1p/6p1/1P2b1P1/8/P4q1P/Q5K1 w - - 0 39",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "g1f2",
   "h8g7",
   "f2e3",
   "f8f6",
   "e3e4"
  ],
  "evalBefore": 382,
  "publishedAt": 1793401095282
 },
 {
  "id": "hgr_81pnrkr22p1p1p12P3Pp1p2RN1P5P2P72K1R3w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "8/1pnrkr2/2p1p1p1/2P3Pp/1p2RN1P/5P2/P7/2K1R3 w - - 1 34",
  "sideToMove": "w",
  "line": [
   "f4g6",
   "e7e8",
   "g6e5",
   "d7d5",
   "e5f7"
  ],
  "sanLine": [
   "Nxg6+",
   "Ke8",
   "Ne5",
   "Rd5",
   "Nxf7"
  ],
  "finalType": "fork",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "f4g6",
  "bestMoveSan": "Nxg6+",
  "solutionMoves": [
   "f4g6",
   "g6e5",
   "e5f7"
  ],
  "replyMoves": [
   "e7e8",
   "d7d5"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "8/1pnrkr2/2p1p1p1/2P3Pp/1p2RN1P/5P2/P7/2K1R3 w - - 1 34",
   "line": [
    "f4g6",
    "e7e8",
    "g6e5",
    "d7d5",
    "e5f7"
   ],
   "finalFen": "4k3/1pn2N2/2p1p3/2Pr2Pp/1p2R2P/5P2/P7/2K1R3 b - - 0 36",
   "kind": "material",
   "finalSan": "Nxf7",
   "gain": 3,
   "checkedReplies": 22,
   "checkedAlternatives": 26,
   "explanation": "Nxf7 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "f4",
   "alternativeLine": [
    "f4",
    "Rxc5+",
    "Kb1",
    "Rg7"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 76
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Segona jugada (Ne5): El cavall a e5 ataca alhora les dues torres. La jugada final (Nxf7) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "8/1pnrkr2/2p1p1p1/2P3Pp/1p2RN1P/5P2/P7/2K1R3 w - - 1 34",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "f4g6",
   "e7e8",
   "g6e5",
   "d7d5",
   "e5f7"
  ],
  "evalBefore": 435,
  "publishedAt": 1793401058864
 },
 {
  "id": "hgr_5k24qP25Qp1p7P4PK15BPpP72r5w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "5k2/4qP2/5Qp1/p7/P4PK1/5BPp/P7/2r5 w - - 4 45",
  "sideToMove": "w",
  "line": [
   "f6h8",
   "f8f7",
   "f3d5",
   "e7e6",
   "d5e6"
  ],
  "sanLine": [
   "Qh8+",
   "Kxf7",
   "Bd5+",
   "Qe6+",
   "Bxe6+"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "f6h8",
  "bestMoveSan": "Qh8+",
  "solutionMoves": [
   "f6h8",
   "f3d5",
   "d5e6"
  ],
  "replyMoves": [
   "f8f7",
   "e7e6"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "5k2/4qP2/5Qp1/p7/P4PK1/5BPp/P7/2r5 w - - 4 45",
   "line": [
    "f6h8",
    "f8f7",
    "f3d5",
    "e7e6",
    "d5e6"
   ],
   "finalFen": "7Q/5k2/4B1p1/p7/P4PK1/6Pp/P7/2r5 b - - 0 47",
   "kind": "material",
   "finalSan": "Bxe6+",
   "gain": 5,
   "checkedReplies": 2,
   "checkedAlternatives": 4,
   "explanation": "Bxe6+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 5 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "f5",
   "alternativeLine": [
    "f5",
    "Qxd5",
    "Qh7+",
    "Ke8"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -659
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win",
   "check"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 8 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "5k2/4qP2/5Qp1/p7/P4PK1/5BPp/P7/2r5 w - - 4 45",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "f6h8",
   "f8f7",
   "f3d5",
   "e7e6",
   "d5e6"
  ],
  "evalBefore": 638,
  "publishedAt": 1793400647019
 },
 {
  "id": "hgr_3R3Qp72r2qk12p56p14P386K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "3R3Q/p7/2r2qk1/2p5/6p1/4P3/8/6K1 w - - 4 54",
  "sideToMove": "w",
  "line": [
   "d8g8",
   "g6f5",
   "g8f8",
   "f6f8",
   "h8f8"
  ],
  "sanLine": [
   "Rg8+",
   "Kf5",
   "Rf8",
   "Qxf8",
   "Qxf8+"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "d8g8",
  "bestMoveSan": "Rg8+",
  "solutionMoves": [
   "d8g8",
   "g8f8",
   "h8f8"
  ],
  "replyMoves": [
   "g6f5",
   "f6f8"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "3R3Q/p7/2r2qk1/2p5/6p1/4P3/8/6K1 w - - 4 54",
   "line": [
    "d8g8",
    "g6f5",
    "g8f8",
    "f6f8",
    "h8f8"
   ],
   "finalFen": "5Q2/p7/2r5/2p2k2/6p1/4P3/8/6K1 b - - 0 56",
   "kind": "material",
   "finalSan": "Qxf8+",
   "gain": 4,
   "checkedReplies": 6,
   "checkedAlternatives": 21,
   "explanation": "Qxf8+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "e4+",
   "alternativeLine": [
    "e4+",
    "Kxe4",
    "Qxf8",
    "c4"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 136
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 2,
     "offered": "r",
     "offerUci": "g8f8",
     "replyUci": "f6f8",
     "square": "f8",
     "loss": 5,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 621
    }
   ]
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win",
   "check"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 4 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "3R3Q/p7/2r2qk1/2p5/6p1/4P3/8/6K1 w - - 4 54",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "d8g8",
   "g6f5",
   "g8f8",
   "f6f8",
   "h8f8"
  ],
  "evalBefore": 471,
  "publishedAt": 1793400602387
 },
 {
  "id": "hgr_rn1qk2rpp2ppbp4b1p12p51nBP41QN1PN2PP3PPP",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "rn1qk2r/pp2ppbp/4b1p1/2p5/1nBP4/1QN1PN2/PP3PPP/R1B1K2R b KQkq - 4 9",
  "sideToMove": "b",
  "line": [
   "e6c4",
   "b3c4",
   "b4c2",
   "e1e2",
   "c2a1"
  ],
  "sanLine": [
   "Bxc4",
   "Qxc4",
   "Nc2+",
   "Ke2",
   "Nxa1"
  ],
  "finalType": "fork",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "e6c4",
  "bestMoveSan": "Bxc4",
  "solutionMoves": [
   "e6c4",
   "b4c2",
   "c2a1"
  ],
  "replyMoves": [
   "b3c4",
   "e1e2"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "rn1qk2r/pp2ppbp/4b1p1/2p5/1nBP4/1QN1PN2/PP3PPP/R1B1K2R b KQkq - 4 9",
   "line": [
    "e6c4",
    "b3c4",
    "b4c2",
    "e1e2",
    "c2a1"
   ],
   "finalFen": "rn1qk2r/pp2ppbp/6p1/2p5/2QP4/2N1PN2/PP2KPPP/n1B4R w kq - 0 12",
   "kind": "material",
   "finalSan": "Nxa1",
   "gain": 4,
   "checkedReplies": 43,
   "checkedAlternatives": 38,
   "explanation": "Nxa1 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "cxd4",
   "alternativeLine": [
    "cxd4",
    "Qa4+",
    "Nd7",
    "Rb1"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 126
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Segona jugada (Nc2+): El cavall a c2 ataca alhora el rei i la torre. La jugada final (Nxa1) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "rn1qk2r/pp2ppbp/4b1p1/2p5/1nBP4/1QN1PN2/PP3PPP/R1B1K2R b KQkq - 4 9",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "e6c4",
   "b3c4",
   "b4c2",
   "e1e2",
   "c2a1"
  ],
  "evalBefore": 373,
  "publishedAt": 1793400239809
 },
 {
  "id": "hgr_1k61r2b1p1p6pB1p2Bp181R6PPP2n1r2KR4w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "1k6/1r2b1p1/p6p/B1p2Bp1/8/1R6/PPP2n1r/2KR4 w - - 5 38",
  "sideToMove": "w",
  "line": [
   "b3b7",
   "b8b7",
   "d1d7",
   "b7c6",
   "d7e7"
  ],
  "sanLine": [
   "Rxb7+",
   "Kxb7",
   "Rd7+",
   "Kc6",
   "Rxe7"
  ],
  "finalType": "fork",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "b3b7",
  "bestMoveSan": "Rxb7+",
  "solutionMoves": [
   "b3b7",
   "d1d7",
   "d7e7"
  ],
  "replyMoves": [
   "b8b7",
   "b7c6"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "1k6/1r2b1p1/p6p/B1p2Bp1/8/1R6/PPP2n1r/2KR4 w - - 5 38",
   "line": [
    "b3b7",
    "b8b7",
    "d1d7",
    "b7c6",
    "d7e7"
   ],
   "finalFen": "8/4R1p1/p1k4p/B1p2Bp1/8/8/PPP2n1r/2K5 b - - 0 40",
   "kind": "material",
   "finalSan": "Rxe7",
   "gain": 3,
   "checkedReplies": 18,
   "checkedAlternatives": 32,
   "explanation": "Rxe7 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Ra7",
   "alternativeLine": [
    "Ra7",
    "Bd6",
    "c4",
    "Bb8"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 0
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Segona jugada (Rd7+): La torre a d7 ataca alhora l'alfil i el rei. La jugada final (Rxe7) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "1k6/1r2b1p1/p6p/B1p2Bp1/8/1R6/PPP2n1r/2KR4 w - - 5 38",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "b3b7",
   "b8b7",
   "d1d7",
   "b7c6",
   "d7e7"
  ],
  "evalBefore": 433
 },
 {
  "id": "hgr_83Rrkp1p6p5p25N1PP1b3P15P26K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "8/3Rrkp1/p6p/5p2/5N1P/P1b3P1/5P2/6K1 w - - 9 47",
  "sideToMove": "w",
  "line": [
   "d7e7",
   "f7e7",
   "f4d5",
   "e7d6",
   "d5c3"
  ],
  "sanLine": [
   "Rxe7+",
   "Kxe7",
   "Nd5+",
   "Kd6",
   "Nxc3"
  ],
  "finalType": "fork",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "d7e7",
  "bestMoveSan": "Rxe7+",
  "solutionMoves": [
   "d7e7",
   "f4d5",
   "d5c3"
  ],
  "replyMoves": [
   "f7e7",
   "e7d6"
  ],
  "theme": "fork",
  "tacticKind": "forquilla",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "8/3Rrkp1/p6p/5p2/5N1P/P1b3P1/5P2/6K1 w - - 9 47",
   "line": [
    "d7e7",
    "f7e7",
    "f4d5",
    "e7d6",
    "d5c3"
   ],
   "finalFen": "8/6p1/p2k3p/5p2/7P/P1N3P1/5P2/6K1 b - - 0 49",
   "kind": "material",
   "finalSan": "Nxc3",
   "gain": 3,
   "checkedReplies": 12,
   "checkedAlternatives": 16,
   "explanation": "Nxc3 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Ne3",
   "alternativeLine": [
    "Ne3",
    "f4",
    "gxf4",
    "Kc5"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -134
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "fork",
  "finalMotifs": [
   "fork",
   "major_win"
  ],
  "finalMotifLabel": "forquilla",
  "finalMotifReason": "Segona jugada (Nd5+): El cavall a d5 ataca alhora el rei i l'alfil. La jugada final (Nxc3) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "8/3Rrkp1/p6p/5p2/5N1P/P1b3P1/5P2/6K1 w - - 9 47",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "d7e7",
   "f7e7",
   "f4d5",
   "e7d6",
   "d5c3"
  ],
  "evalBefore": 360
 },
 {
  "id": "hgr_3qk2rp4p1p1pr2np12b2n22P52QP2P1PB4BPRN5K",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "3qk2r/p4p1p/1pr2np1/2b2n2/2P5/2QP2P1/PB4BP/RN5K w k - 0 19",
  "sideToMove": "w",
  "line": [
   "g2c6",
   "e8f8",
   "c3f6",
   "d8f6",
   "b2f6"
  ],
  "sanLine": [
   "Bxc6+",
   "Kf8",
   "Qxf6",
   "Qxf6",
   "Bxf6"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "g2c6",
  "bestMoveSan": "Bxc6+",
  "solutionMoves": [
   "g2c6",
   "c3f6",
   "b2f6"
  ],
  "replyMoves": [
   "e8f8",
   "d8f6"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "3qk2r/p4p1p/1pr2np1/2b2n2/2P5/2QP2P1/PB4BP/RN5K w k - 0 19",
   "line": [
    "g2c6",
    "e8f8",
    "c3f6",
    "d8f6",
    "b2f6"
   ],
   "finalFen": "5k1r/p4p1p/1pB2Bp1/2b2n2/2P5/3P2P1/P6P/RN5K b - - 0 21",
   "kind": "material",
   "finalSan": "Bxf6",
   "gain": 7,
   "checkedReplies": 24,
   "checkedAlternatives": 25,
   "explanation": "Bxf6 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 7 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Nc3",
   "alternativeLine": [
    "Nc3",
    "Qxc6+",
    "Ne4",
    "Nd6"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -759
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 8 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "3qk2r/p4p1p/1pr2np1/2b2n2/2P5/2QP2P1/PB4BP/RN5K w k - 0 19",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "g2c6",
   "e8f8",
   "c3f6",
   "d8f6",
   "b2f6"
  ],
  "evalBefore": 334
 },
 {
  "id": "hgr_3r2k1p1q1Rr22p2p1p6p16P12Bb4PP2QP1P4R1K1",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "3r2k1/p1q1Rr2/2p2p1p/6p1/6P1/2Bb4/PP2QP1P/4R1K1 w - - 0 29",
  "sideToMove": "w",
  "line": [
   "e7c7",
   "d3e2",
   "c7f7",
   "g8f7",
   "e1e2"
  ],
  "sanLine": [
   "Rxc7",
   "Bxe2",
   "Rxf7",
   "Kxf7",
   "Rxe2"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "e7c7",
  "bestMoveSan": "Rxc7",
  "solutionMoves": [
   "e7c7",
   "c7f7",
   "e1e2"
  ],
  "replyMoves": [
   "d3e2",
   "g8f7"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "3r2k1/p1q1Rr2/2p2p1p/6p1/6P1/2Bb4/PP2QP1P/4R1K1 w - - 0 29",
   "line": [
    "e7c7",
    "d3e2",
    "c7f7",
    "g8f7",
    "e1e2"
   ],
   "finalFen": "3r4/p4k2/2p2p1p/6p1/6P1/2B5/PP2RP1P/6K1 b - - 0 31",
   "kind": "material",
   "finalSan": "Rxe2",
   "gain": 3,
   "checkedReplies": 23,
   "checkedAlternatives": 21,
   "explanation": "Rxe2 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Bxf6",
   "alternativeLine": [
    "Bxf6",
    "Rd1",
    "Rxd1",
    "Bxd1"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 21
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "3r2k1/p1q1Rr2/2p2p1p/6p1/6P1/2Bb4/PP2QP1P/4R1K1 w - - 0 29",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "e7c7",
   "d3e2",
   "c7f7",
   "g8f7",
   "e1e2"
  ],
  "evalBefore": 569
 },
 {
  "id": "hgr_r3rk2p4p1Q3b1qp13Pp3P2p3R6PP5P2R1B3K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "r3rk2/p4p1Q/3b1qp1/3Pp3/P2p3R/6PP/5P2/R1B3K1 w - - 6 25",
  "sideToMove": "w",
  "line": [
   "h4g4",
   "f8e7",
   "c1g5",
   "f6g5",
   "g4g5"
  ],
  "sanLine": [
   "Rg4",
   "Ke7",
   "Bg5",
   "Qxg5",
   "Rxg5"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "h4g4",
  "bestMoveSan": "Rg4",
  "solutionMoves": [
   "h4g4",
   "c1g5",
   "g4g5"
  ],
  "replyMoves": [
   "f8e7",
   "f6g5"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "r3rk2/p4p1Q/3b1qp1/3Pp3/P2p3R/6PP/5P2/R1B3K1 w - - 6 25",
   "line": [
    "h4g4",
    "f8e7",
    "c1g5",
    "f6g5",
    "g4g5"
   ],
   "finalFen": "r3r3/p3kp1Q/3b2p1/3Pp1R1/P2p4/6PP/5P2/R5K1 b - - 0 27",
   "kind": "material",
   "finalSan": "Rxg5",
   "gain": 6,
   "checkedReplies": 22,
   "checkedAlternatives": 27,
   "explanation": "Rxg5 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 6 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Rb1",
   "alternativeLine": [
    "Rb1",
    "Qf6",
    "Rb7+",
    "Kf8"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -327
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 2,
     "offered": "b",
     "offerUci": "c1g5",
     "replyUci": "f6g5",
     "square": "g5",
     "loss": 3,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 601
    }
   ]
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 6 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "r3rk2/p4p1Q/3b1qp1/3Pp3/P2p3R/6PP/5P2/R1B3K1 w - - 6 25",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "h4g4",
   "f8e7",
   "c1g5",
   "f6g5",
   "g4g5"
  ],
  "evalBefore": 538
 },
 {
  "id": "hgr_81pk1pp22p4Q7p2P1R2PPq1r1P1N1P3P21K6b",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "8/1pk1pp2/2p4Q/7p/2P1R2P/Pq1r1P1N/1P3P2/1K6 b - - 4 31",
  "sideToMove": "b",
  "line": [
   "d3d1",
   "h6c1",
   "b3d3",
   "b1a2",
   "d1c1"
  ],
  "sanLine": [
   "Rd1+",
   "Qc1",
   "Qd3+",
   "Ka2",
   "Rxc1"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "d3d1",
  "bestMoveSan": "Rd1+",
  "solutionMoves": [
   "d3d1",
   "b3d3",
   "d1c1"
  ],
  "replyMoves": [
   "h6c1",
   "b1a2"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "8/1pk1pp2/2p4Q/7p/2P1R2P/Pq1r1P1N/1P3P2/1K6 b - - 4 31",
   "line": [
    "d3d1",
    "h6c1",
    "b3d3",
    "b1a2",
    "d1c1"
   ],
   "finalFen": "8/1pk1pp2/2p5/7p/2P1R2P/P2q1P1N/KP3P2/2r5 w - - 0 34",
   "kind": "material",
   "finalSan": "Rxc1",
   "gain": 8,
   "checkedReplies": 17,
   "checkedAlternatives": 35,
   "explanation": "Rxc1 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 8 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Qxe4",
   "alternativeLine": [
    "Qxe4",
    "Qxd1",
    "Qxc4+",
    "Qb3"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -203
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 9 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "8/1pk1pp2/2p4Q/7p/2P1R2P/Pq1r1P1N/1P3P2/1K6 b - - 4 31",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "d3d1",
   "h6c1",
   "b3d3",
   "b1a2",
   "d1c1"
  ],
  "evalBefore": 1440
 },
 {
  "id": "hgr_85K1k6R1p1bB41p688r7w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "8/5K1k/6R1/p1bB4/1p6/8/8/r7 w - - 15 51",
  "sideToMove": "w",
  "line": [
   "d5e4",
   "a1e1",
   "g6g1",
   "h7h6",
   "g1e1"
  ],
  "sanLine": [
   "Be4",
   "Re1",
   "Rg1+",
   "Kh6",
   "Rxe1"
  ],
  "finalType": "discovery",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "d5e4",
  "bestMoveSan": "Be4",
  "solutionMoves": [
   "d5e4",
   "g6g1",
   "g1e1"
  ],
  "replyMoves": [
   "a1e1",
   "h7h6"
  ],
  "theme": "discovery",
  "tacticKind": "descoberta",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "8/5K1k/6R1/p1bB4/1p6/8/8/r7 w - - 15 51",
   "line": [
    "d5e4",
    "a1e1",
    "g6g1",
    "h7h6",
    "g1e1"
   ],
   "finalFen": "8/5K2/7k/p1b5/1p2B3/8/8/4R3 b - - 0 53",
   "kind": "material",
   "finalSan": "Rxe1",
   "gain": 5,
   "checkedReplies": 13,
   "checkedAlternatives": 26,
   "explanation": "Rxe1 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 5 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Rg6+",
   "alternativeLine": [
    "Rg6+",
    "Kh5",
    "Bc2",
    "Kh4"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -89
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "discovery",
  "finalMotifs": [
   "discovery",
   "major_win"
  ],
  "finalMotifLabel": "descoberta",
  "finalMotifReason": "Segona jugada (Rg1+): En moure a g1 es destapa un escac descobert de l'alfil. La jugada final (Rxe1) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "8/5K1k/6R1/p1bB4/1p6/8/8/r7 w - - 15 51",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "d5e4",
   "a1e1",
   "g6g1",
   "h7h6",
   "g1e1"
  ],
  "evalBefore": 438
 },
 {
  "id": "hgr_4r1k15p25PpQq2pn36pPP3RB25rK17Rw",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "4r1k1/5p2/5PpQ/q2pn3/6pP/P3RB2/5rK1/7R w - - 0 32",
  "sideToMove": "w",
  "line": [
   "g2g3",
   "f2f3",
   "e3f3",
   "a5e1",
   "h1e1"
  ],
  "sanLine": [
   "Kg3",
   "Rxf3+",
   "Rxf3",
   "Qe1+",
   "Rxe1"
  ],
  "finalType": "pin",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "g2g3",
  "bestMoveSan": "Kg3",
  "solutionMoves": [
   "g2g3",
   "e3f3",
   "h1e1"
  ],
  "replyMoves": [
   "f2f3",
   "a5e1"
  ],
  "theme": "pin",
  "tacticKind": "clavada",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "4r1k1/5p2/5PpQ/q2pn3/6pP/P3RB2/5rK1/7R w - - 0 32",
   "line": [
    "g2g3",
    "f2f3",
    "e3f3",
    "a5e1",
    "h1e1"
   ],
   "finalFen": "4r1k1/5p2/5PpQ/3pn3/6pP/P4RK1/8/4R3 b - - 0 34",
   "kind": "material",
   "finalSan": "Rxe1",
   "gain": 6,
   "checkedReplies": 15,
   "checkedAlternatives": 4,
   "explanation": "Rxe1 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 6 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Rf2",
   "alternativeLine": [
    "Rf2",
    "Qe3+",
    "Qxe3",
    "Kh7"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 1055
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "kind": "refused",
     "step": 2,
     "offered": "r",
     "offerUci": "e3f3",
     "replyUci": "a5e1",
     "captureUci": "e5f3",
     "acceptedFen": "4r1k1/5p2/5PpQ/q2p4/6pP/P4nK1/8/7R w - - 0 34",
     "square": "f3",
     "loss": 3,
     "compensationKind": "material",
     "checkedDepth": 18,
     "captureEvalType": "mate",
     "captureEval": 1
    },
    {
     "kind": "refused",
     "step": 2,
     "offered": "r",
     "offerUci": "e3f3",
     "replyUci": "a5e1",
     "captureUci": "g4f3",
     "acceptedFen": "4r1k1/5p2/5PpQ/q2pn3/7P/P4pK1/8/7R w - - 0 34",
     "square": "f3",
     "loss": 3,
     "compensationKind": "material",
     "checkedDepth": 18,
     "captureEvalType": "mate",
     "captureEval": 1
    }
   ]
  },
  "finalMotif": "pin",
  "finalMotifs": [
   "pin",
   "major_win"
  ],
  "finalMotifLabel": "clavada",
  "finalMotifReason": "La torre a e1 clava el cavall contra la torre.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "4r1k1/5p2/5PpQ/q2pn3/6pP/P3RB2/5rK1/7R w - - 0 32",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "g2g3",
   "f2f3",
   "e3f3",
   "a5e1",
   "h1e1"
  ],
  "evalBefore": 9950
 },
 {
  "id": "hgr_4r1k15p25PpQq2pn36pPP3RrK187Rw",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "4r1k1/5p2/5PpQ/q2pn3/6pP/P3RrK1/8/7R w - - 0 33",
  "sideToMove": "w",
  "line": [
   "e3f3",
   "a5e1",
   "h1e1",
   "d5d4",
   "h6g7"
  ],
  "sanLine": [
   "Rxf3",
   "Qe1+",
   "Rxe1",
   "d4",
   "Qg7#"
  ],
  "finalType": "mate",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "e3f3",
  "bestMoveSan": "Rxf3",
  "solutionMoves": [
   "e3f3",
   "h1e1",
   "h6g7"
  ],
  "replyMoves": [
   "a5e1",
   "d5d4"
  ],
  "theme": "mate",
  "tacticKind": "escac i mat",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "4r1k1/5p2/5PpQ/q2pn3/6pP/P3RrK1/8/7R w - - 0 33",
   "line": [
    "e3f3",
    "a5e1",
    "h1e1",
    "d5d4",
    "h6g7"
   ],
   "finalFen": "4r1k1/5pQ1/5Pp1/4n3/3p2pP/P4RK1/8/4R3 b - - 1 35",
   "kind": "mate",
   "finalSan": "Qg7#",
   "gain": null,
   "checkedReplies": 0,
   "checkedAlternatives": 35,
   "explanation": "Qg7# és escac i mat: el rei està amenaçat i el rival no té cap resposta legal.",
   "uniqueness": "S’han comprovat les altres 35 jugades legals: cap no fa mat en aquesta posició.",
   "alternativeSan": "Ra1",
   "alternativeLine": [
    "Ra1",
    "Nxf3",
    "Qg7#"
   ],
   "alternativeEval": {
    "type": "mate",
    "value": 2
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "mate",
  "finalMotifs": [
   "mate",
   "major_win",
   "check"
  ],
  "finalMotifLabel": "escac i mat",
  "finalMotifReason": "La seqüència acaba en escac i mat.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "4r1k1/5p2/5PpQ/q2pn3/6pP/P3RrK1/8/7R w - - 0 33",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "e3f3",
   "a5e1",
   "h1e1",
   "d5d4",
   "h6g7"
  ],
  "evalBefore": 9970
 },
 {
  "id": "hgr_1r4k15p1pr2q2p13R42p1p3P3P2P5PP11Q1R2K1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "1r4k1/5p1p/r2q2p1/3R4/2p1p3/P3P2P/5PP1/1Q1R2K1 w - - 0 31",
  "sideToMove": "w",
  "line": [
   "d5d6",
   "b8b1",
   "d6d8",
   "g8g7",
   "d1b1"
  ],
  "sanLine": [
   "Rxd6",
   "Rxb1",
   "Rd8+",
   "Kg7",
   "Rxb1"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "d5d6",
  "bestMoveSan": "Rxd6",
  "solutionMoves": [
   "d5d6",
   "d6d8",
   "d1b1"
  ],
  "replyMoves": [
   "b8b1",
   "g8g7"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "1r4k1/5p1p/r2q2p1/3R4/2p1p3/P3P2P/5PP1/1Q1R2K1 w - - 0 31",
   "line": [
    "d5d6",
    "b8b1",
    "d6d8",
    "g8g7",
    "d1b1"
   ],
   "finalFen": "3R4/5pkp/r5p1/8/2p1p3/P3P2P/5PP1/1R4K1 b - - 0 33",
   "kind": "material",
   "finalSan": "Rxb1",
   "gain": 4,
   "checkedReplies": 18,
   "checkedAlternatives": 25,
   "explanation": "Rxb1 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Rg8+",
   "alternativeLine": [
    "Rg8+",
    "Kxg8",
    "Rxb1",
    "Rxa3"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -21
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 5 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "1r4k1/5p1p/r2q2p1/3R4/2p1p3/P3P2P/5PP1/1Q1R2K1 w - - 0 31",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "d5d6",
   "b8b1",
   "d6d8",
   "g8g7",
   "d1b1"
  ],
  "evalBefore": 522
 },
 {
  "id": "hgr_3rk2rpp3ppp2q1pn21Nbp4Q3P35N2PP1B1PPP5RK",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "3rk2r/pp3ppp/2q1pn2/1Nbp4/Q3P3/5N2/PP1B1PPP/5RK1 w k - 0 20",
  "sideToMove": "w",
  "line": [
   "f3e5",
   "c6b6",
   "d2a5",
   "e8g8",
   "a5b6"
  ],
  "sanLine": [
   "Ne5",
   "Qb6",
   "Ba5",
   "O-O",
   "Bxb6"
  ],
  "finalType": "skewer",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "f3e5",
  "bestMoveSan": "Ne5",
  "solutionMoves": [
   "f3e5",
   "d2a5",
   "a5b6"
  ],
  "replyMoves": [
   "c6b6",
   "e8g8"
  ],
  "theme": "skewer",
  "tacticKind": "enfilada",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "3rk2r/pp3ppp/2q1pn2/1Nbp4/Q3P3/5N2/PP1B1PPP/5RK1 w k - 0 20",
   "line": [
    "f3e5",
    "c6b6",
    "d2a5",
    "e8g8",
    "a5b6"
   ],
   "finalFen": "3r1rk1/pp3ppp/1B2pn2/1NbpN3/Q3P3/8/PP3PPP/5RK1 b - - 0 22",
   "kind": "material",
   "finalSan": "Bxb6",
   "gain": 6,
   "checkedReplies": 30,
   "checkedAlternatives": 39,
   "explanation": "Bxb6 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 6 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "b4",
   "alternativeLine": [
    "b4",
    "Qa6",
    "bxc5",
    "Rc8"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -33
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "kind": "refused",
     "step": 2,
     "offered": "b",
     "offerUci": "d2a5",
     "replyUci": "e8g8",
     "captureUci": "b6a5",
     "acceptedFen": "3rk2r/pp3ppp/4pn2/qNbpN3/Q3P3/8/PP3PPP/5RK1 w k - 0 22",
     "square": "a5",
     "loss": 3,
     "compensationKind": "material",
     "checkedDepth": 18,
     "captureEvalType": "cp",
     "captureEval": 541
    }
   ]
  },
  "finalMotif": "skewer",
  "finalMotifs": [
   "skewer",
   "major_win"
  ],
  "finalMotifLabel": "enfilada",
  "finalMotifReason": "Segona jugada (Ba5): L'alfil a a5 fa una enfilada: la dama s'ha d'apartar i deixa al descobert la torre. La jugada final (Bxb6) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "3rk2r/pp3ppp/2q1pn2/1Nbp4/Q3P3/5N2/PP1B1PPP/5RK1 w k - 0 20",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "f3e5",
   "c6b6",
   "d2a5",
   "e8g8",
   "a5b6"
  ],
  "evalBefore": 406
 },
 {
  "id": "hgr_2r3k15pp17pP5b18P4Q1P6P12rR3Kb",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "2r3k1/5pp1/7p/P5b1/8/P4Q1P/6P1/2rR3K b - - 2 48",
  "sideToMove": "b",
  "line": [
   "c1d1",
   "f3d1",
   "c8c1",
   "d1c1",
   "g5c1"
  ],
  "sanLine": [
   "Rxd1+",
   "Qxd1",
   "Rc1",
   "Qxc1",
   "Bxc1"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "c1d1",
  "bestMoveSan": "Rxd1+",
  "solutionMoves": [
   "c1d1",
   "c8c1",
   "g5c1"
  ],
  "replyMoves": [
   "f3d1",
   "d1c1"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "2r3k1/5pp1/7p/P5b1/8/P4Q1P/6P1/2rR3K b - - 2 48",
   "line": [
    "c1d1",
    "f3d1",
    "c8c1",
    "d1c1",
    "g5c1"
   ],
   "finalFen": "6k1/5pp1/7p/P7/8/P6P/6P1/2b4K w - - 0 51",
   "kind": "material",
   "finalSan": "Bxc1",
   "gain": 4,
   "checkedReplies": 7,
   "checkedAlternatives": 14,
   "explanation": "Bxc1 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "f5",
   "alternativeLine": [
    "f5",
    "Qc8+",
    "Kh7",
    "Qxf5+"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -1057
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 2,
     "offered": "r",
     "offerUci": "c8c1",
     "replyUci": "d1c1",
     "square": "c1",
     "loss": 5,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 385
    }
   ]
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 4 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "2r3k1/5pp1/7p/P5b1/8/P4Q1P/6P1/2rR3K b - - 2 48",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "c1d1",
   "f3d1",
   "c8c1",
   "d1c1",
   "g5c1"
  ],
  "evalBefore": 406
 },
 {
  "id": "hgr_r1b2rk11pqn1ppp2P1p31B61b2P35N2pP3PPPR1Q",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "r1b2rk1/1pqn1ppp/2P1p3/1B6/1b2P3/5N2/pP3PPP/R1Q2RK1 w - - 0 17",
  "sideToMove": "w",
  "line": [
   "c6d7",
   "c7c1",
   "f1c1",
   "c8d7",
   "b5d7"
  ],
  "sanLine": [
   "cxd7",
   "Qxc1",
   "Rfxc1",
   "Bxd7",
   "Bxd7"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "c6d7",
  "bestMoveSan": "cxd7",
  "solutionMoves": [
   "c6d7",
   "f1c1",
   "b5d7"
  ],
  "replyMoves": [
   "c7c1",
   "c8d7"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "r1b2rk1/1pqn1ppp/2P1p3/1B6/1b2P3/5N2/pP3PPP/R1Q2RK1 w - - 0 17",
   "line": [
    "c6d7",
    "c7c1",
    "f1c1",
    "c8d7",
    "b5d7"
   ],
   "finalFen": "r4rk1/1p1B1ppp/4p3/8/1b2P3/5N2/pP3PPP/R1R3K1 b - - 0 19",
   "kind": "material",
   "finalSan": "Bxd7",
   "gain": 5,
   "checkedReplies": 31,
   "checkedAlternatives": 34,
   "explanation": "Bxd7 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 5 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Be2",
   "alternativeLine": [
    "Be2",
    "Rfd8",
    "Rd1",
    "Be7"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -299
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 5 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "r1b2rk1/1pqn1ppp/2P1p3/1B6/1b2P3/5N2/pP3PPP/R1Q2RK1 w - - 0 17",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "c6d7",
   "c7c1",
   "f1c1",
   "c8d7",
   "b5d7"
  ],
  "evalBefore": 336
 },
 {
  "id": "hgr_2r3k11p3p2p5n17pP3P3Q1q3P16BPR6Kb",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "2r3k1/1p3p2/p5n1/7p/P3P3/Q1q3P1/6BP/R6K b - - 3 36",
  "sideToMove": "b",
  "line": [
   "c3a3",
   "a1a3",
   "c8c1",
   "g2f1",
   "c1f1"
  ],
  "sanLine": [
   "Qxa3",
   "Rxa3",
   "Rc1+",
   "Bf1",
   "Rxf1+"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "c3a3",
  "bestMoveSan": "Qxa3",
  "solutionMoves": [
   "c3a3",
   "c8c1",
   "c1f1"
  ],
  "replyMoves": [
   "a1a3",
   "g2f1"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "2r3k1/1p3p2/p5n1/7p/P3P3/Q1q3P1/6BP/R6K b - - 3 36",
   "line": [
    "c3a3",
    "a1a3",
    "c8c1",
    "g2f1",
    "c1f1"
   ],
   "finalFen": "6k1/1p3p2/p5n1/7p/P3P3/R5P1/7P/5r1K w - - 0 39",
   "kind": "material",
   "finalSan": "Rxf1+",
   "gain": 3,
   "checkedReplies": 1,
   "checkedAlternatives": 27,
   "explanation": "Rxf1+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Ne5",
   "alternativeLine": [
    "Ne5",
    "Kg2",
    "Rc2+",
    "Kg1"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 72
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win",
   "check"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "2r3k1/1p3p2/p5n1/7p/P3P3/Q1q3P1/6BP/R6K b - - 3 36",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "c3a3",
   "a1a3",
   "c8c1",
   "g2f1",
   "c1f1"
  ],
  "evalBefore": 546
 },
 {
  "id": "hgr_2r3k11p3p2p5n17pP3P32q3P11Q4BP1R5Kb",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "2r3k1/1p3p2/p5n1/7p/P3P3/2q3P1/1Q4BP/1R5K b - - 3 36",
  "sideToMove": "b",
  "line": [
   "c3b2",
   "b1b2",
   "c8c1",
   "g2f1",
   "c1f1"
  ],
  "sanLine": [
   "Qxb2",
   "Rxb2",
   "Rc1+",
   "Bf1",
   "Rxf1+"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "c3b2",
  "bestMoveSan": "Qxb2",
  "solutionMoves": [
   "c3b2",
   "c8c1",
   "c1f1"
  ],
  "replyMoves": [
   "b1b2",
   "g2f1"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "2r3k1/1p3p2/p5n1/7p/P3P3/2q3P1/1Q4BP/1R5K b - - 3 36",
   "line": [
    "c3b2",
    "b1b2",
    "c8c1",
    "g2f1",
    "c1f1"
   ],
   "finalFen": "6k1/1p3p2/p5n1/7p/P3P3/6P1/1R5P/5r1K w - - 0 39",
   "kind": "material",
   "finalSan": "Rxf1+",
   "gain": 3,
   "checkedReplies": 1,
   "checkedAlternatives": 27,
   "explanation": "Rxf1+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "h4",
   "alternativeLine": [
    "h4",
    "Kg2",
    "h3+",
    "Kf2"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 29
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win",
   "check"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "2r3k1/1p3p2/p5n1/7p/P3P3/2q3P1/1Q4BP/1R5K b - - 3 36",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "c3b2",
   "b1b2",
   "c8c1",
   "g2f1",
   "c1f1"
  ],
  "evalBefore": 571
 },
 {
  "id": "hgr_4rk23Q45b2ppp1r2p3q1N1P84R2K6R1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "4rk2/3Q4/5b2/ppp1r2p/3q1N1P/8/4R2K/6R1 w - - 4 48",
  "sideToMove": "w",
  "line": [
   "f4g6",
   "f8g8",
   "g6e5",
   "d4g1",
   "h2g1"
  ],
  "sanLine": [
   "Ng6+",
   "Kg8",
   "Nxe5+",
   "Qxg1+",
   "Kxg1"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "f4g6",
  "bestMoveSan": "Ng6+",
  "solutionMoves": [
   "f4g6",
   "g6e5",
   "h2g1"
  ],
  "replyMoves": [
   "f8g8",
   "d4g1"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "4rk2/3Q4/5b2/ppp1r2p/3q1N1P/8/4R2K/6R1 w - - 4 48",
   "line": [
    "f4g6",
    "f8g8",
    "g6e5",
    "d4g1",
    "h2g1"
   ],
   "finalFen": "4r1k1/3Q4/5b2/ppp1N2p/7P/8/4R3/6K1 b - - 0 50",
   "kind": "material",
   "finalSan": "Kxg1",
   "gain": 6,
   "checkedReplies": 20,
   "checkedAlternatives": 1,
   "explanation": "Kxg1 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 6 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Kh3",
   "alternativeLine": [
    "Kh3",
    "Rxe5",
    "Rg2+",
    "Qxg2+"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -99
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 9 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "4rk2/3Q4/5b2/ppp1r2p/3q1N1P/8/4R2K/6R1 w - - 4 48",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "f4g6",
   "f8g8",
   "g6e5",
   "d4g1",
   "h2g1"
  ],
  "evalBefore": 835
 },
 {
  "id": "hgr_3rr32Qnb1ppkp6p1pb1pNq7PP4NB11P3PP14R1KR",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "3rr3/2Qnb1pp/kp6/p1pb1pNq/7P/P4NB1/1P3PP1/4R1KR w - - 4 24",
  "sideToMove": "w",
  "line": [
   "e1e7",
   "e8e7",
   "c7d8",
   "h5e8",
   "d8e8"
  ],
  "sanLine": [
   "Rxe7",
   "Rxe7",
   "Qxd8",
   "Qe8",
   "Qxe8"
  ],
  "finalType": "major_win",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "e1e7",
  "bestMoveSan": "Rxe7",
  "solutionMoves": [
   "e1e7",
   "c7d8",
   "d8e8"
  ],
  "replyMoves": [
   "e8e7",
   "h5e8"
  ],
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "3rr3/2Qnb1pp/kp6/p1pb1pNq/7P/P4NB1/1P3PP1/4R1KR w - - 4 24",
   "line": [
    "e1e7",
    "e8e7",
    "c7d8",
    "h5e8",
    "d8e8"
   ],
   "finalFen": "4Q3/3nr1pp/kp6/p1pb1pN1/7P/P4NB1/1P3PP1/6KR b - - 0 26",
   "kind": "material",
   "finalSan": "Qxe8",
   "gain": 3,
   "checkedReplies": 33,
   "checkedAlternatives": 31,
   "explanation": "Qxe8 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 3 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Bc7",
   "alternativeLine": [
    "Bc7",
    "Qxd8",
    "Bxd8",
    "Re8"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": 121
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 1,
     "offered": "r",
     "offerUci": "e1e7",
     "replyUci": "e8e7",
     "square": "e7",
     "loss": 2,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 308
    }
   ]
  },
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 12 punts nets de material a favor.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "3rr3/2Qnb1pp/kp6/p1pb1pNq/7P/P4NB1/1P3PP1/4R1KR w - - 4 24",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "e1e7",
   "e8e7",
   "c7d8",
   "h5e8",
   "d8e8"
  ],
  "evalBefore": 309
 },
 {
  "id": "hgr_7k7p4R35P1K2B583b46r1w",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "7k/7p/4R3/5P1K/2B5/8/3b4/6r1 w - - 7 58",
  "sideToMove": "w",
  "line": [
   "e6e8",
   "h8g7",
   "e8g8",
   "g7f6",
   "g8g1"
  ],
  "sanLine": [
   "Re8+",
   "Kg7",
   "Rg8+",
   "Kf6",
   "Rxg1"
  ],
  "finalType": "skewer",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "e6e8",
  "bestMoveSan": "Re8+",
  "solutionMoves": [
   "e6e8",
   "e8g8",
   "g8g1"
  ],
  "replyMoves": [
   "h8g7",
   "g7f6"
  ],
  "theme": "skewer",
  "tacticKind": "enfilada",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "7k/7p/4R3/5P1K/2B5/8/3b4/6r1 w - - 7 58",
   "line": [
    "e6e8",
    "h8g7",
    "e8g8",
    "g7f6",
    "g8g1"
   ],
   "finalFen": "8/7p/5k2/5P1K/2B5/8/3b4/6R1 b - - 0 60",
   "kind": "material",
   "finalSan": "Rxg1",
   "gain": 4,
   "checkedReplies": 13,
   "checkedAlternatives": 24,
   "explanation": "Rxg1 culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Rf8+",
   "alternativeLine": [
    "Rf8+",
    "Ke5",
    "Be6",
    "Be3"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -11
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": []
  },
  "finalMotif": "skewer",
  "finalMotifs": [
   "skewer",
   "major_win"
  ],
  "finalMotifLabel": "enfilada",
  "finalMotifReason": "Segona jugada (Rg8+): La torre a g8 fa una enfilada: el rei s'ha d'apartar i deixa al descobert la torre. La jugada final (Rxg1) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "7k/7p/4R3/5P1K/2B5/8/3b4/6r1 w - - 7 58",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "e6e8",
   "h8g7",
   "e8g8",
   "g7f6",
   "g8g1"
  ],
  "evalBefore": 494
 },
 {
  "id": "hgr_1k6p4NR15p2pPp1p3P1PpP32qP1Q26K12b4rb",
  "createdAt": 0,
  "updatedAt": 0,
  "source": "reserve",
  "fen": "1k6/p4NR1/5p2/pPp1p3/P1PpP3/2qP1Q2/6K1/2b4r b - - 23 52",
  "sideToMove": "b",
  "line": [
   "c3e1",
   "f3f2",
   "h1h2",
   "g2h2",
   "e1f2"
  ],
  "sanLine": [
   "Qe1",
   "Qf2",
   "Rh2+",
   "Kxh2",
   "Qxf2+"
  ],
  "finalType": "skewer",
  "difficulty": 1,
  "status": "new",
  "attempts": 0,
  "startedAt": null,
  "solvedAt": null,
  "deviceCreated": null,
  "bestMove": "c3e1",
  "bestMoveSan": "Qe1",
  "solutionMoves": [
   "c3e1",
   "h1h2",
   "e1f2"
  ],
  "replyMoves": [
   "f3f2",
   "g2h2"
  ],
  "theme": "skewer",
  "tacticKind": "enfilada",
  "playerMove": null,
  "conclusion": {
   "version": 1,
   "fen": "1k6/p4NR1/5p2/pPp1p3/P1PpP3/2qP1Q2/6K1/2b4r b - - 23 52",
   "line": [
    "c3e1",
    "f3f2",
    "h1h2",
    "g2h2",
    "e1f2"
   ],
   "finalFen": "1k6/p4NR1/5p2/pPp1p3/P1PpP3/3P4/5q1K/2b5 w - - 0 55",
   "kind": "material",
   "finalSan": "Qxf2+",
   "gain": 4,
   "checkedReplies": 3,
   "checkedAlternatives": 23,
   "explanation": "Qxf2+ culmina la combinació: el guany material ja s’ha produït i es conserven almenys 4 punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.",
   "uniqueness": "Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.",
   "alternativeSan": "Bf4+",
   "alternativeLine": [
    "Bf4+",
    "Kg2",
    "Qd1",
    "Nd8"
   ],
   "alternativeEval": {
    "type": "cp",
    "value": -456
   },
   "minDepth": 14,
   "requestedDepth": 16,
   "sacrifices": [
    {
     "step": 2,
     "offered": "r",
     "offerUci": "h1h2",
     "replyUci": "g2h2",
     "square": "h2",
     "loss": 5,
     "kingInCheck": false,
     "checkedDefenses": 2,
     "compensationKind": "material",
     "continuationType": "cp",
     "continuationEval": 1375
    }
   ]
  },
  "finalMotif": "skewer",
  "finalMotifs": [
   "skewer",
   "major_win",
   "check"
  ],
  "finalMotifLabel": "enfilada",
  "finalMotifReason": "Segona jugada (Rh2+): La torre a h2 fa una enfilada: el rei s'ha d'apartar i deixa al descobert la dama. La jugada final (Qxf2+) en cobra el guany.",
  "origin": "engine_selfplay",
  "sourceGameId": null,
  "sourceFen": "1k6/p4NR1/5p2/pPp1p3/P1PpP3/2qP1Q2/6K1/2b4r b - - 23 52",
  "sourceMoveNumber": null,
  "adaptationNote": null,
  "difficultyPercent": null,
  "ratingEstimate": null,
  "pv": [
   "c3e1",
   "f3f2",
   "h1h2",
   "g2h2",
   "e1f2"
  ],
  "evalBefore": 674
 }
];
// <<< RESERVA <<<
    if (typeof module !== 'undefined' && module.exports) module.exports = RESERVE;
    else root.ElTaulerHieroReserve = RESERVE;
})(typeof self !== 'undefined' ? self : this);
