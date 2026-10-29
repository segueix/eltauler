// Finals concloents dels jeroglífics. La forma tàctica no és una prova de guany.
// Chess verifica el desenllaç; Stockfish contrasta les tries i les defenses.
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerHieroClosure = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const VERSION = 1;
    // Un jeroglífic són SEMPRE tres jugades del jugador amb les dues rèpliques
    // del rival entremig: cinc mitges jugades, ni més ni menys.
    const PLAYER_MOVES = 3;
    const LINE_PLIES = PLAYER_MOVES * 2 - 1;
    const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    const uci = m => m.from + m.to + (m.promotion || '');
    const play = (g, u) => typeof u === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)
        ? g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }) : null;
    const balance = (g, color) => g.board().flat().reduce((sum, p) => sum + (p ? VALUES[p.type] * (p.color === color ? 1 : -1) : 0), 0);
    function lineOf(candidate) {
        const sol = candidate.solutionMoves || [], rep = candidate.replyMoves || [], line = [];
        sol.forEach((m, i) => { line.push(m); if (i < sol.length - 1) line.push(rep[i]); });
        return line;
    }
    function hasThreeMoves(candidate) {
        if (!candidate || !Array.isArray(candidate.solutionMoves) || candidate.solutionMoves.length !== PLAYER_MOVES) return false;
        const line = lineOf(candidate);
        return line.length === LINE_PLIES && line.every(Boolean);
    }
    // Una prova antiga d'una línia més curta (abans s'acceptaven mats en 1 o 2) ja no val.
    function matches(candidate) {
        const proof = candidate && candidate.conclusion;
        return !!(proof && proof.version === VERSION && proof.fen === candidate.fen && hasThreeMoves(candidate)
            && JSON.stringify(proof.line) === JSON.stringify(lineOf(candidate)));
    }
    // Un MultiPV incomplet no demostra unicitat. Tampoc dos mats de durada diferent.
    function uniqueChoice(analysis, expected, legalCount, minDepth = 14, mateNow = false) {
        const list = analysis && analysis.alternatives;
        if (!Array.isArray(list) || !list.length) return false;
        const count = Math.min(2, legalCount);
        if (count < 1 || list.length < count) return false;
        const top = list.slice(0, count);
        if (top.some(a => !a || !a.move || !Number.isFinite(a.eval) || a.depth < minDepth || !Number.isFinite(a.depth) || a.bound)) return false;
        if (top[0].move !== expected || new Set(top.map(a => a.move)).size !== count) return false;
        if (count === 2 && top[0].depth !== top[1].depth) return false;
        const best = top[0], second = top[1];
        if (best.evalType === 'mate') return best.eval > 0 && (!mateNow || best.eval === 1)
            && (!second || !(second.evalType === 'mate' && second.eval > 0 && (!mateNow || second.eval === 1)));
        if (best.evalType !== 'cp' || best.eval < 300) return false;
        if (!second) return true;
        if (second.evalType === 'mate') return second.eval < 0;
        return second.evalType === 'cp' && second.eval < 200 && best.eval - second.eval >= 150;
    }


    // Un sacrifici només és identificable quan la peça oferta és CAPTURADA
    // en la resposta del rival i el balanç cau realment respecte a l'inici.
    // No confondre-ho amb intercanvis equivalents ni amb gambits de peó.
    function materialOffers(candidate, Chess) {
        if(typeof Chess!=='function'||!hasThreeMoves(candidate))return [];
        try {
            const g=new Chess(candidate.fen),color=g.turn(),initial=balance(g,color);
            const line=lineOf(candidate),out=[];
            for(let i=0;i<line.length;i++) {
                if(g.game_over())return [];
                const own=play(g,line[i]);if(!own)return [];
                if(i%2!==0||i>=3)continue; // cal la rèplica en aquesta línia
                if(g.game_over())return [];
                const replyPosition=g.fen();
                const reply=play(g,line[++i]);if(!reply)return [];
                const lost=initial-balance(g,color);
                if(reply.captured && reply.captured!=='p'&&
                    reply.to===own.to&&reply.captured===(own.promotion||own.piece)&&
                    lost>=2&&!g.game_over()) {
                    out.push({step:(i+1)/2,offered:own.piece,
                        offerUci:uci(own),replyUci:uci(reply),
                        square:reply.to,loss:lost,replyPosition,
                        kingInCheck:g.in_check()});
                }
            }
            return out;
        }catch(err){return [];}
    }
    function verifiedScore(x, side) {
        return !!(x&&Number.isFinite(x.depth)&&x.depth>=14&&
            Number.isFinite(x.eval)&&!x.bound&&
            ((x.evalType==='mate'&&(side==='player'?x.eval>0:x.eval<0))||
             (x.evalType==='cp'&&(side==='player'?x.eval>=300:x.eval<=-300))));
    }
    // Només retorna les anotacions creades durant verify, i les contrasta
    // novament contra la línia legal, les valoracions i el desenllaç.
    function certifiedSacrifices(candidate, Chess) {
        const proof=candidate&&candidate.conclusion;
        if(!matches(candidate)||!proof||!Number.isFinite(proof.requestedDepth)||
            proof.requestedDepth<16||!Number.isFinite(proof.minDepth)||
            proof.minDepth<14||!Array.isArray(proof.sacrifices)||
            !Array.isArray(candidate.stepAlternatives))return [];
        try {
            const inspected=createVerifier(Chess).inspect(candidate);
            if(!inspected||inspected.finalFen!==proof.finalFen||
                inspected.kind!==proof.kind||inspected.gain!==proof.gain)return [];
            const legal=materialOffers(candidate,Chess);
            const refused=refusedOffers(candidate,Chess);
            return proof.sacrifices.filter(x=>{
                if(x.kind==='refused') {
                    const offer=refused.find(y=>y.step===x.step&&y.offered===x.offered&&
                        y.offerUci===x.offerUci&&y.replyUci===x.replyUci&&
                        y.captureUci===x.captureUci&&y.acceptedFen===x.acceptedFen&&
                        y.loss===x.loss&&y.square===x.square);
                    return !!(offer&&x.compensationKind===proof.kind&&
                        Number.isInteger(x.checkedDepth)&&x.checkedDepth>=18&&
                        x.captureEvalType&&Number.isFinite(x.captureEval)&&
                        ((x.captureEvalType==='mate'&&x.captureEval>0)||
                         (x.captureEvalType==='cp'&&x.captureEval>=300)));
                }
                const offer=legal.find(y=>y.step===x.step&&
                    y.offered===x.offered&&y.offerUci===x.offerUci&&y.replyUci===x.replyUci&&
                    y.loss===x.loss&&y.square===x.square&&
                    y.kingInCheck===x.kingInCheck);
                const answer=candidate.stepAlternatives[x.step]&&
                    candidate.stepAlternatives[x.step][0];
                const g=offer&&new Chess(offer.replyPosition);
                return offer&&g&&Number.isInteger(x.checkedDefenses)&&
                    x.checkedDefenses>=1&&x.checkedDefenses<=g.moves().length&&
                    x.compensationKind===proof.kind&&
                    verifiedScore(answer,'player')&&
                    answer.move===candidate.solutionMoves[x.step]&&
                    x.continuationType===answer.evalType&&
                    x.continuationEval===answer.eval;
            }).map(x=>({kind:x.kind||'accepted',step:x.step,offered:x.offered,offerUci:x.offerUci,
                replyUci:x.replyUci,captureUci:x.captureUci||null,
                square:x.square,loss:x.loss,kingInCheck:x.kingInCheck,
                checkedDefenses:x.checkedDefenses||0,compensationKind:x.compensationKind}));
        }catch(err){return [];}
    }


    // L'adversari ha tingut una captura LEGAL de la peça oferta, però ha
    // preferit una altra resposta. No és un sacrifici consumat.
    function refusedOffers(candidate, Chess) {
        if(typeof Chess!=='function'||!hasThreeMoves(candidate))return [];
        try {
            const g=new Chess(candidate.fen),color=g.turn(),original=balance(g,color),line=lineOf(candidate),out=[];
            for(let i=0;i<4;i+=2) {
                if(g.game_over())return [];
                const m=play(g,line[i]);if(!m)return [];
                const offeredFen=g.fen(),options=g.moves({verbose:true});
                const captures=options.filter(x=>x.to===m.to&&x.captured===m.piece&&
                    m.piece!=='p'&&m.piece!=='k');
                const actual=play(g,line[i+1]);if(!actual)return [];
                if(actual.to===m.to&&actual.captured===m.piece)continue;
                for(const cap of captures) {
                    const hypothetical=new Chess(offeredFen),accepted=play(hypothetical,uci(cap));
                    if(!accepted||hypothetical.game_over())continue;
                    const projectedLoss=original-balance(hypothetical,color);
                    if(projectedLoss<2)continue;
                    out.push({step:i/2+1,offered:m.piece,offerUci:uci(m),
                        replyUci:uci(actual),captureUci:uci(cap),square:m.to,
                        loss:projectedLoss,acceptedFen:hypothetical.fen(),
                        offeredFen,kingInCheck:hypothetical.in_check()});
                }
            }
            return out;
        }catch(e){return [];}
    }
    function stablePlayerAdvantage(row, minDepth=18, minCp=300) {
        const best=row&&row.bestMove;
        return !!(best&&Number.isFinite(best.depth)&&best.depth>=minDepth&&!best.bound&&
            Number.isFinite(best.eval)&&
            ((best.evalType==='mate'&&best.eval>0)||
             (best.evalType==='cp'&&best.eval>=minCp)));
    }

    function createVerifier(Chess, analyze) {
        async function request(...args) {
            try { return await analyze(...args); } catch (err) { return null; }
        }
        // Una captura/coronació ha de deixar un guany JA materialitzat, fins i
        // tot després de qualsevol rèplica legal (incloses recaptures i mats).
        function endpoint(g, move, color, initialBalance) {
            if (g.in_checkmate()) return { kind: 'mate', gain: null, replies: 0 };
            if (g.game_over() || (!move.captured && !move.promotion)) return null;
            let gain = balance(g, color) - initialBalance;
            if (gain < 3) return null;
            const replies = g.moves({ verbose: true });
            for (const reply of replies) {
                g.move(reply);
                const invalid = g.game_over();
                const net = balance(g, color) - initialBalance;
                g.undo();
                if (invalid || net < 3) return null;
                gain = Math.min(gain, net);
            }
            return { kind: move.promotion ? 'promotion' : 'material', gain, replies: replies.length };
        }
        function inspect(candidate) {
            try {
                const line = lineOf(candidate);
                // Tres jugades exactes: un mat o un guany abans de la tercera no fa jeroglífic.
                if (!hasThreeMoves(candidate)) return null;
                const g = new Chess(candidate.fen), color = g.turn(), initialBalance = balance(g, color);
                const positions = [];
                let last;
                for (let i = 0; i < line.length; i++) {
                    if (g.game_over()) return null;
                    positions.push(g.fen());
                    last = play(g, line[i]);
                    if (!last) return null;
                }
                const result = endpoint(g, last, color, initialBalance);
                if (!result) return null;
                const finalFen = g.fen(), finalSan = last.san;
                g.undo();
                const legal = g.moves({ verbose: true });
                const alternatives = [];
                for (const move of legal) {
                    if (uci(move) === line[line.length - 1]) continue;
                    g.move(move);
                    const other = endpoint(g, move, color, initialBalance);
                    g.undo();
                    // Mat: només una jugada fa mat ara. Material: cap altra
                    // jugada tanca el mateix guany (o fa mat).
                    if (other && (result.kind !== 'mate' || other.kind === 'mate')) return null;
                    alternatives.push(move.san);
                }
                return { ...result, line, positions, finalFen, finalSan, alternatives, color };
            } catch (err) { return null; }
        }
        async function verify(candidate, opts = {}) {
            const end = inspect(candidate);
            if (!end || typeof analyze !== 'function') return null;
            const abort = () => !!(opts.shouldAbort && opts.shouldAbort());
            const depth = Math.max(16, opts.depth || 0), stepAlternatives = [], stepEvals = [], stepPvs = [], opponentRows = [];
            let finalAnalysis = null;
            for (let i = 0; i < end.positions.length; i++) {
                if (abort()) return null;
                const fen = end.positions[i], g = new Chess(fen), player = i % 2 === 0;
                // MultiPV 2 com a mínim per a les tries del jugador; no es
                // confon una sola variant rebuda amb una sola jugada legal.
                const a = await request(fen, depth, player ? 3 : 1, opts.moveTimeMs || 8000, opts.shouldAbort || null);
                if (abort() || !a || !a.bestMove || a.bestMove.move !== end.line[i]) return null;
                if (player) {
                    if (!uniqueChoice(a, end.line[i], g.moves().length, 14, end.kind === 'mate' && i === end.positions.length - 1)) return null;
                    stepAlternatives.push(a.alternatives);
                    stepEvals.push(a.bestMove.eval);
                    stepPvs.push(a.bestMove.pv || []);
                    finalAnalysis = a;
                } else {
                    if (!Number.isFinite(a.bestMove.depth) || a.bestMove.depth < 14 || a.bestMove.bound) return null;
                    opponentRows.push(a);
                }
            }
            if (end.kind !== 'mate') {
                const a = await request(end.finalFen, depth, 1, opts.moveTimeMs || 8000, opts.shouldAbort || null);
                const best = a && a.bestMove;
                // L'avaluació és del rival, que té el torn: ha de ser NEGATIVA.
                if (abort() || !best || best.depth < 14 || !Number.isFinite(best.depth) || !Number.isFinite(best.eval) || best.bound
                    || !play(new Chess(end.finalFen), best.move)
                    || !((best.evalType === 'cp' && best.eval <= -300) || (best.evalType === 'mate' && best.eval < 0))) return null;
            }
            const alternative = finalAnalysis.alternatives[1];
            const finalPosition = new Chess(end.positions[end.positions.length - 1]);
            const altMove = alternative && play(finalPosition, alternative.move);
            const alternativeLine = [];
            const replay = new Chess(end.positions[end.positions.length - 1]);
            for (const u of (alternative && alternative.pv || []).slice(0, 4)) {
                if (replay.game_over()) break;
                const move = play(replay, u);
                if (!move) break;
                alternativeLine.push(move.san);
            }
            const explanation = end.kind === 'mate'
                ? end.finalSan + ' és escac i mat: el rei està amenaçat i el rival no té cap resposta legal.'
                : end.finalSan + ' culmina la combinació: el guany material ja s’ha produït i es conserven almenys ' + end.gain + ' punts nets després de qualsevol resposta immediata legal. Stockfish confirma que la millor defensa no iguala la posició.';
            const uniqueness = end.kind === 'mate'
                ? (end.alternatives.length ? 'S’han comprovat les altres ' + end.alternatives.length + ' jugades legals: cap no fa mat en aquesta posició.' : 'Era l’única jugada legal.')
                : 'Cap altra jugada legal culmina aquest guany material ara. Stockfish també descarta una altra continuació amb avantatge decisiu.';

            // Evidència addicional, NOMÉS per a sacrificis ja legalment observats.
            // La línia principal no autoritza dir que totes les defenses perden:
            // comprovem com a mínim les dues defenses principals, si existeixen.
            const sacrifices=[];
            for(const offer of materialOffers(candidate,Chess)) {
                if(abort())return null;
                const next=stepAlternatives[offer.step]&&stepAlternatives[offer.step][0];
                const replyGame=new Chess(offer.replyPosition);
                const legal=replyGame.moves({verbose:true});
                const required=Math.min(2,legal.length);
                if(!verifiedScore(next,'player')||
                    next.move!==candidate.solutionMoves[offer.step])continue;
                let defense=opponentRows[offer.step-1];
                if(required>1) {
                    defense=await request(offer.replyPosition,depth,3,
                        opts.moveTimeMs||8000,opts.shouldAbort||null);
                }
                if(abort())return null;
                const lines=defense&&defense.alternatives;
                if(!defense||!defense.bestMove||
                    defense.bestMove.move!==offer.replyUci||
                    !Array.isArray(lines)||lines.length<required)continue;
                const seen=new Set(),choices=lines.slice(0,required);
                const legitimate=choices.every(x=>{
                    if(!x||!verifiedScore(x,'opponent')||seen.has(x.move))return false;
                    const g=new Chess(offer.replyPosition),m=play(g,x.move);
                    if(!m)return false;
                    seen.add(x.move);return true;
                });
                if(!legitimate)continue;
                sacrifices.push({
                    step:offer.step,offered:offer.offered,
                    offerUci:offer.offerUci,replyUci:offer.replyUci,
                    square:offer.square,loss:offer.loss,
                    kingInCheck:offer.kingInCheck,checkedDefenses:choices.length,
                    compensationKind:end.kind,
                    continuationType:next.evalType,continuationEval:next.eval
                });
            }


            // Una oferta REFUSADA no és un sacrifici efectiu. Per esmentar-la,
            // el motor ha de confirmar que acceptar la peça era una opció
            // legal i que, en la posició hipotètica després de la captura,
            // el bàndol ofertant encara té una continuació guanyadora.
            for(const offer of refusedOffers(candidate,Chess)) {
                if(abort())return null;
                const depthRefused=Math.max(18,depth);
                const acceptedAnalysis=await request(offer.acceptedFen,depthRefused,2,
                    opts.moveTimeMs||8000,opts.shouldAbort||null);
                if(abort())return null;
                if(!stablePlayerAdvantage(acceptedAnalysis,18,300))continue;
                const chosen=acceptedAnalysis.bestMove;
                const g=new Chess(offer.acceptedFen);
                if(!play(g,chosen.move))continue;
                sacrifices.push({
                    kind:'refused',step:offer.step,offered:offer.offered,
                    offerUci:offer.offerUci,replyUci:offer.replyUci,
                    captureUci:offer.captureUci,acceptedFen:offer.acceptedFen,
                    square:offer.square,loss:offer.loss,
                    compensationKind:end.kind,checkedDepth:chosen.depth,
                    captureEvalType:chosen.evalType,captureEval:chosen.eval
                });
            }

            return { ...candidate, stepAlternatives, stepEvals, stepPvs,
                conclusion: { version: VERSION, fen: candidate.fen, line: end.line, finalFen: end.finalFen,
                    kind: end.kind, finalSan: end.finalSan, gain: end.gain, checkedReplies: end.replies,
                    checkedAlternatives: end.alternatives.length, explanation, uniqueness,
                    alternativeSan: altMove ? altMove.san : null,
                    alternativeLine,
                    alternativeEval: alternative ? { type: alternative.evalType, value: alternative.eval } : null,
                    minDepth: 14, requestedDepth: depth, sacrifices }
            };
        }
        return { inspect, verify };
    }

    // Verificació independent per a partides/revisions: un sacrifici amb
    // compensació POSICIONAL no exigeix mat ni recuperació immediata.
    // La funció consumeix el mateix analitzador local de Stockfish que verify.
    // Els indicadors de peons i iniciativa descriuen fets, NO proven causalitat.
    function createPositionalVerifier(Chess, analyze) {
        function positionBalance(g,color){return balance(g,color);}
        function pawnStructure(g,color) {
            const own=g.board().flat().filter(p=>p&&p.color===color&&p.type==='p');
            const foes=g.board().flat().filter(p=>p&&p.color!==color&&p.type==='p');
            const files=Array(8).fill(0);
            // board() inclou les peces; get(sq) determina la columna exacta.
            const passed=[];
            for(let f=0;f<8;f++)for(let r=1;r<=8;r++){
                const sq='abcdefgh'[f]+r,p=g.get(sq);
                if(!p||p.color!==color||p.type!=='p')continue;
                files[f]++;
                let isPassed=true;
                for(let enemyF=Math.max(0,f-1);enemyF<=Math.min(7,f+1);enemyF++)
                    for(let enemyR=1;enemyR<=8;enemyR++){
                        const enemy=g.get('abcdefgh'[enemyF]+enemyR);
                        if(enemy&&enemy.type==='p'&&enemy.color!==color&&
                            (color==='w'?enemyR>r:enemyR<r))isPassed=false;
                    }
                if(isPassed)passed.push(sq);
            }
            return {pawns:own.length,enemyPawns:foes.length,
                doubled:files.reduce((n,v)=>n+Math.max(0,v-1),0),
                islands:files.reduce((n,v,i)=>n+(v>0&&(i===0||files[i-1]===0)?1:0),0),
                passed};
        }
        function pvEvidence(g,pv,color) {
            if(!Array.isArray(pv)||pv.length<4)return null;
            const line=[],initial=positionBalance(g,color);
            for(const move of pv.slice(0,8)){
                if(g.game_over())break;
                const m=play(g,move);if(!m)return null;
                line.push({uci:uci(m),san:m.san,color:m.color,
                    check:g.in_check(),capture:!!m.captured});
            }
            if(line.length<4)return null;
            const own=line.filter(x=>x.color===color);
            const recovered=positionBalance(g,color)-initial>=2;
            return {line:line.map(x=>x.uci),checks:own.filter(x=>x.check).length,
                captures:own.filter(x=>x.capture).length,
                immediateRecovery:recovered};
        }
        async function verify(ctx,opts={}) {
            if(typeof Chess!=='function'||typeof analyze!=='function'||!ctx||
                typeof ctx.fen!=='string'||typeof ctx.move!=='string'||
                typeof ctx.reply!=='string')return null;
            const abort=()=>!!(opts.shouldAbort&&opts.shouldAbort());
            const request=async(fen,depth,pv)=>{
                try{return await analyze(fen,depth,pv,opts.moveTimeMs||8000,
                    opts.shouldAbort||null);}catch(e){return null;}
            };
            try{
                const start=new Chess(ctx.fen),color=start.turn(),
                    original=positionBalance(start,color);
                if(start.game_over()||abort())return null;
                const before=await request(start.fen(),22,2);
                if(abort()||!before||!before.bestMove||before.bestMove.move!==ctx.move||
                    !Number.isFinite(before.bestMove.depth)||before.bestMove.depth<20||
                    before.bestMove.bound)return null;
                const offer=play(start,ctx.move);
                if(!offer||offer.piece==='p'||offer.piece==='k'||start.game_over())return null;
                const afterOffer=start.fen(),choices=start.moves({verbose:true});
                const reply=choices.find(m=>uci(m)===ctx.reply);
                if(!reply)return null;
                const captures=choices.filter(m=>m.to===offer.to&&m.captured===offer.piece);
                if(!captures.length)return null;
                const accepted=captures.some(m=>uci(m)===ctx.reply);
                if(!accepted)return null; // refusals remain a distinct type
                const response=await request(afterOffer,22,3);
                if(abort()||!response||!Array.isArray(response.alternatives)||
                    !response.alternatives.some(a=>a.move===ctx.reply&&
                        Number.isFinite(a.depth)&&a.depth>=20&&!a.bound))return null;
                if(!play(start,ctx.reply)||start.game_over())return null;
                const loss=original-positionBalance(start,color);
                if(loss<2||abort())return null;
                const low=await request(start.fen(),18,2);
                const high=await request(start.fen(),22,2);
                if(abort()||!low||!high||!low.bestMove||!high.bestMove)return null;
                const a=low.bestMove,b=high.bestMove;
                if(a.evalType!=='cp'||b.evalType!=='cp'||
                    a.bound||b.bound||a.depth<18||b.depth<22||
                    !Number.isFinite(a.eval)||!Number.isFinite(b.eval)||
                    a.eval< -70||b.eval< -70||Math.abs(a.eval-b.eval)>100)return null;
                if(a.move!==b.move||!Array.isArray(b.pv)||b.pv[0]!==b.move)return null;
                const evidence=pvEvidence(new Chess(start.fen()),b.pv,color);
                // No classifiquem una recaptura material immediata com
                // a compensació posicional.
                if(!evidence||evidence.immediateRecovery)return null;
                const kingInCheck=start.in_check();
                const structure=pawnStructure(start,color);
                return {
                    type:'positional_sacrifice',fen:ctx.fen,move:ctx.move,
                    reply:ctx.reply,accepted:true,loss,
                    evaluations:[{depth:a.depth,cp:a.eval},{depth:b.depth,cp:b.eval}],
                    kingInCheck,structure,initiative:{
                        checks:evidence.checks,captures:evidence.captures,
                        pv:evidence.line},
                    text:'Sacrifici material acceptat en aquesta variant: Stockfish manté una valoració pròxima a l’equilibri o favorable sense recuperació material immediata. Els indicadors de pressió i peons descriuen la posició, però no en demostren per si sols la compensació.'
                };
            }catch(e){return null;}
        }
        return {verify,pawnStructure};
    }

    return { VERSION, PLAYER_MOVES, lineOf, hasThreeMoves, matches, uniqueChoice,
        materialOffers,refusedOffers,certifiedSacrifices,createVerifier,createPositionalVerifier };
});
