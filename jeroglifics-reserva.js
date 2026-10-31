// Reserva de jeroglífics minats per autojoc de Stockfish 19 i verificats amb
// la mateixa prova que el generador de l'app (hieroclosure.js). L'app la fa
// servir com a banc acumulat de nous. No s'edita a mà: es regenera amb
// `node scripts/mine-hieroglyphics.js`.
(function (root) {
    'use strict';
// >>> RESERVA (generat) >>>
const RESERVE = [
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
  "finalType": "major_win",
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
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
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
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 7 punts nets de material a favor.",
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
  "finalType": "major_win",
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
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
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
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 5 punts nets de material a favor.",
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
  "finalType": "major_win",
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
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
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
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 5 punts nets de material a favor.",
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
  "finalType": "major_win",
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
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
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
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 6 punts nets de material a favor.",
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
  "finalType": "major_win",
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
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
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
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 5 punts nets de material a favor.",
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
  "finalType": "major_win",
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
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
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
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
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
  "finalType": "major_win",
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
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
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
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 3 punts nets de material a favor.",
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
  "finalType": "major_win",
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
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
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
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 5 punts nets de material a favor.",
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
  "finalType": "major_win",
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
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
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
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 9 punts nets de material a favor.",
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
  "finalType": "major_win",
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
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
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
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 5 punts nets de material a favor.",
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
  "finalType": "major_win",
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
  "theme": "major_win",
  "tacticKind": "guany de dama o torre",
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
  "finalMotif": "major_win",
  "finalMotifs": [
   "major_win",
   "check"
  ],
  "finalMotifLabel": "guany de dama o torre",
  "finalMotifReason": "La línia captura una peça major i acaba amb 4 punts nets de material a favor.",
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
