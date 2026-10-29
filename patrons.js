// patrons.js — 60 motius d'escacs en català amb un detector conservador.
// El catàleg inclou patrons pendents de validació: no es confonen amb deteccions.
// Lichess aporta exemples CC0; la verificació s'executa amb chess.js i,
// quan cal, les anàlisis Stockfish existents. No hi ha cap consulta de xarxa.
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerPatrons = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // id, nom, família, etiqueta Lichess si n'hi ha.
    const ROWS = [
        ['fork','forquilla','tactica','fork'],['pin','clavada','tactica','pin'],
        ['skewer','enfilada','tactica','skewer'],['discoveredAttack','atac a la descoberta','tactica','discoveredAttack'],
        ['discoveredCheck','escac a la descoberta','tactica','discoveredCheck'],['doubleCheck','escac doble','tactica','doubleCheck'],
        ['doubleAttack','atac doble','tactica',null],['mate','escac i mat','tactica','mate'],
        ['mateThreat','amenaça de mat','tactica',null],['sacrifice','sacrifici','tactica','sacrifice'],
        ['attraction','atracció','tactica','attraction'],['deflection','desviació','tactica','deflection'],
        ['interference','interferència','tactica','interference'],['clearance','alliberament de línia','tactica','clearance'],
        ['zwischenzug','jugada intermèdia','tactica','intermezzo'],['overloading','sobrecàrrega','tactica',null],
        ['removeDefender','eliminació del defensor','tactica',null],['trappedPiece','peça atrapada','tactica','trappedPiece'],
        ['hangingPiece','peça indefensa','tactica','hangingPiece'],['underpromotion','subpromoció','tactica','underPromotion'],
        ['promotion','coronació','tactica','promotion'],['backRankMate','mat de l’última fila','tactica','backRankMate'],
        ['centerOccupation','ocupació del centre','posicional',null],['centerControl','control del centre','posicional',null],
        ['openFile','columna oberta','posicional',null],['semiOpenFile','columna semioberta','posicional',null],
        ['doubledRooks','torres doblades','posicional',null],['rookSeventh','torre a la setena','posicional',null],
        ['isolatedPawn','peó aïllat','posicional',null],['doubledPawn','peons doblats','posicional',null],
        ['passedPawn','peó passat','posicional','advancedPawn'],['connectedPassedPawns','peons passats connectats','posicional',null],
        ['pawnMajority','majoria de peons','posicional',null],['pawnChain','cadena de peons','posicional',null],
        ['bishopPair','parella d’alfils','posicional',null],['fianchetto','alfil a la diagonal llarga','posicional',null],
        ['outpost','casella avançada protegida','posicional',null],['knightOutpost','cavall en posició avançada','posicional',null],
        ['weakSquare','casella feble','posicional',null],['pawnBreak','ruptura de peons','posicional',null],
        ['castling','enroc','defensa','castling'],['kingsideAttack','atac al flanc de rei','defensa','kingsideAttack'],
        ['queensideAttack','atac al flanc de dama','defensa','queensideAttack'],['kingExposure','rei exposat','defensa','exposedKing'],
        ['defensiveReinforcement','reforç de la defensa','defensa',null],['safeCapture','captura sense atac immediat','defensa',null],
        ['discoveredDefense','defensa a la descoberta','defensa',null],['check','escac','defensa',null],
        ['defensiveCounterattack','contraatac defensiu','defensa','defensiveMove'],['exchangeSimplification','simplificació de peces','defensa',null],
        ['activeKing','activació del rei','finals',null],['opposition','oposició de reis','finals',null],
        ['zugzwang','atzucac','finals','zugzwang'],['triangulation','triangulació','finals',null],
        ['rookEndgame','final de torres','finals','rookEndgame'],['pawnEndgame','final de peons','finals','pawnEndgame'],
        ['queenEndgame','final de dames','finals','queenEndgame'],['bishopEndgame','final d’alfils','finals','bishopEndgame'],
        ['fiftyMoveRule','regla dels cinquanta moviments','finals',null],['insufficientMaterial','material insuficient','finals',null]
    ];

    // Detector: prova visual/legal, no proves d'avantatge. Un motiu del
    // catàleg sense detector NO es pot comunicar automàticament.
    const AUTOMATIC = new Set([
        'fork','pin','skewer','discoveredAttack','discoveredCheck','doubleAttack','mate','underpromotion','promotion',
        'centerOccupation','openFile','semiOpenFile','doubledRooks','rookSeventh',
        'isolatedPawn','doubledPawn','passedPawn','connectedPassedPawns','pawnChain',
        'fianchetto','castling','check','safeCapture','activeKing',
        'rookEndgame','pawnEndgame','queenEndgame','bishopEndgame',
        'fiftyMoveRule','insufficientMaterial'
    ]);
    const CERTIFIED_VARIANTS = new Set(['deflection','interference','sacrifice']);
    const FAMILY = Object.freeze({ tactica: 'Tàctica', posicional: 'Estratègia posicional',
        defensa: 'Atac i defensa', finals: 'Finals' });
    const CATALOG = Object.freeze(ROWS.map(([id,name,family,lichessTheme]) =>
        Object.freeze({ id, name, family, lichessTheme,
            status: AUTOMATIC.has(id) ? 'detector' : CERTIFIED_VARIANTS.has(id) ? 'variant_certificada' : 'pendent_de_validacio',
            verification: AUTOMATIC.has(id) ? 'regles_del_tauler' : CERTIFIED_VARIANTS.has(id) ? 'stockfish_i_variant' : 'requereix_analisi' })));
    const INDEX = Object.freeze(Object.fromEntries(CATALOG.map(p => [p.id,p])));
    const SQUARES = 'abcdefgh';
    const CENTER = new Set(['d4','e4','d5','e5']);
    const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
    const RANK = sq => Number(sq[1]);
    const FILE = sq => SQUARES.indexOf(sq[0]);
    const opponent = c => c === 'w' ? 'b' : 'w';
    const sideName = c => c === 'w' ? 'blanques' : 'negres';
    function snapshot(game) {
        const pieces = [];
        for (let i = 0; i < 8; i++) for (let r = 1; r <= 8; r++) {
            const sq = SQUARES[i] + r, p = game.get(sq);
            if (p) pieces.push({sq, type: p.type, color: p.color});
        }
        const at = {};
        pieces.forEach(p => { at[p.sq] = p; });
        return {pieces,at};
    }
    function pieces(s, color, type) {
        return s.pieces.filter(p => p.color === color && (!type || p.type === type));
    }
    function fPawn(s, color, file) {
        return pieces(s,color,'p').filter(p => FILE(p.sq) === file);
    }
    function isPassed(s,p) {
        if (p.type !== 'p') return false;
        return !pieces(s,opponent(p.color),'p').some(q =>
            Math.abs(FILE(p.sq)-FILE(q.sq)) <= 1
            && (p.color === 'w' ? RANK(q.sq) > RANK(p.sq) : RANK(q.sq) < RANK(p.sq)));
    }
    function lineClear(s, from, to) {
        const a=FILE(from),b=FILE(to),c=RANK(from),d=RANK(to);
        const df=Math.sign(b-a),dr=Math.sign(d-c);
        let f=a+df,r=c+dr;
        while(f!==b||r!==d) {
            if (s.at[SQUARES[f]+r]) return false;
            f+=df;r+=dr;
        }
        return true;
    }
    function attacks(s,p,to) {
        if (p.sq===to) return false;
        const df=FILE(to)-FILE(p.sq),dr=RANK(to)-RANK(p.sq);
        if (p.type==='n') return Math.abs(df)*Math.abs(dr)===2;
        if (p.type==='k') return Math.max(Math.abs(df),Math.abs(dr))===1;
        if (p.type==='p') return Math.abs(df)===1 && dr===(p.color==='w'?1:-1);
        if (p.type==='b') return Math.abs(df)===Math.abs(dr)&&lineClear(s,p.sq,to);
        if (p.type==='r') return (df===0||dr===0)&&lineClear(s,p.sq,to);
        if (p.type==='q') return (df===0||dr===0||Math.abs(df)===Math.abs(dr))&&lineClear(s,p.sq,to);
        return false;
    }

    // Una línia d'atac geomètrica no és, per si sola, un guany de material.
    // Només s'afirma l'alineació: els qualificatius "forçat", "guanya"
    // o "decisiu" exigeixen una demostració de variants.
    const VALUE = {p:1,n:3,b:3,r:5,q:9,k:100};
    function direction(from,to) {
        const df=FILE(to)-FILE(from),dr=RANK(to)-RANK(from);
        if(!df&&!dr) return null;
        if(df && dr && Math.abs(df)!==Math.abs(dr)) return null;
        return {f:Math.sign(df),r:Math.sign(dr)};
    }
    function sameRay(origin,front,rear) {
        const one=direction(origin,front),two=direction(front,rear);
        return !!(one&&two&&one.f===two.f&&one.r===two.r);
    }
    function onSegment(origin,between,end) {
        return sameRay(origin,between,end);
    }
    function isSlider(p) {return !!p&&['r','b','q'].includes(p.type);}
    function xray(s,color) {
        const results=[];
        for(const slider of pieces(s,color).filter(isSlider)) {
            for(const front of pieces(s,opponent(color))) {
                if(!attacks(s,slider,front.sq)) continue;
                for(const rear of pieces(s,opponent(color))) {
                    if(front.sq===rear.sq||!sameRay(slider.sq,front.sq,rear.sq)
                        ||!lineClear(s,front.sq,rear.sq)) continue;
                    const first=VALUE[front.type],second=VALUE[rear.type];
                    const id=second>first?'pin':first>second?'skewer':null;
                    if(id) results.push({id,slider:slider.sq,front:front.sq,rear:rear.sq,
                        absolute:rear.type==='k'&&id==='pin'});
                }
            }
        }
        return results;
    }
    function discovered(s0,s1,played) {
        const results=[],color=played.color;
        const vacant=s0.at[played.from];
        if(!vacant||vacant.color!==color) return results;
        for(const slider of pieces(s1,color).filter(isSlider)) {
            // La peça que s'ha mogut no pot descobrir el seu propi atac.
            if(slider.sq===played.to || !s0.at[slider.sq] ||
                s0.at[slider.sq].type!==slider.type || s0.at[slider.sq].color!==color) continue;
            for(const target of pieces(s1,opponent(color))) {
                if(!s0.at[target.sq] || s0.at[target.sq].type!==target.type ||
                    s0.at[target.sq].color!==target.color ||
                    !onSegment(slider.sq,played.from,target.sq) ||
                    attacks(s0,slider,target.sq) ||
                    !attacks(s1,slider,target.sq)) continue;
                results.push({id:target.type==='k'?'discoveredCheck':'discoveredAttack',
                    slider:slider.sq,uncovered:played.from,target:target.sq});
            }
        }
        return results;
    }

    function counter(s,color,type,wing) {
        return pieces(s,color,type).filter(p=> !wing||(wing==='rei'?FILE(p.sq)>=4:FILE(p.sq)<=3)).length;
    }
    function only(s,types) {return s.pieces.every(p => p.type==='k'||p.type==='p'||types.includes(p.type));}
    function detect(ctx) {
        const c=ctx||{}, Chess=c.ChessCtor;
        if (typeof Chess!=='function'||typeof c.fenBefore!=='string'||typeof c.fenAfter!=='string'||!c.move)return [];
        try {
            const b=new Chess(c.fenBefore),a=new Chess(c.fenAfter);
            const mv=c.move, uci=mv.from+mv.to+(mv.promotion||'');
            if (!UCI.test(uci)||!['w','b'].includes(mv.color))return [];
            const played=b.move({from:mv.from,to:mv.to,promotion:mv.promotion});
            // No s'accepten jugades ni FEN fabricats que no coincideixin.
            if(!played||b.fen()!==a.fen())return [];
            const before=snapshot(new Chess(c.fenBefore)),after=snapshot(a);
            const color=played.color,enemy=opponent(color),p=after.at[played.to],out=[];
            const add=(id,evidence,text)=>{
                if(!INDEX[id]||!AUTOMATIC.has(id)||!evidence)return;
                if(out.some(x=>x.id===id))return;
                out.push({id,pattern:INDEX[id],evidence, text,
                    color, squares:[played.from,played.to], source:'regles_del_tauler'});
            };
            if (a.in_checkmate()) add('mate',{san:played.san},'Escac i mat: el rei rival no té cap resposta legal.');
            if (a.in_check()) add('check',{san:played.san},'El rei rival és en escac i ha de respondre a l’amenaça.');
            if (played.promotion) {
                add('promotion',{promoted:played.promotion},'El peó corona a '+played.to+'.');
                if(played.promotion!=='q')add('underpromotion',{promoted:played.promotion},'El peó corona en una peça diferent de la dama.');
            }
            if (played.flags && /[kq]/.test(played.flags))add('castling',{side:played.flags},'Les '+sideName(color)+' han enrocat.');
            if (p && played.piece !=='k' && !a.in_checkmate()) {
                const targets=pieces(after,enemy).filter(q=>q.type!=='k'&&attacks(after,p,q.sq));
                if(a.in_check()) targets.push({type:'k',sq:'escac'});
                if(targets.length>=2) {
                    const squares=targets.map(t=>t.sq);
                    add('doubleAttack',{targets:squares},'Una mateixa peça ataca diversos objectius.');
                    if(['n','p','k'].includes(p.type))add('fork',{targets:squares},
                        'La jugada crea una forquilla geomètrica contra dos objectius.');
                }
            }

            // Només els motius NO presents a la posició anterior.
            // Evita atribuir a l'última jugada una clavada o enfilada antiga.
            const priorRays=new Set(xray(before,color).map(x=>
                [x.id,x.slider,x.front,x.rear].join(':')));
            for(const x of xray(after,color)) {
                if(priorRays.has([x.id,x.slider,x.front,x.rear].join(':'))) continue;
                const evidence={attacker:x.slider,front:x.front,rear:x.rear,absolute:x.absolute};
                if(x.id==='pin') add('pin',evidence,
                    x.absolute
                    ? 'Clavada: la peça de '+x.front+' és davant del seu rei a '+x.rear+'.'
                    : 'Clavada relativa geomètrica: la peça de '+x.front+' tapa una peça rival de més valor a '+x.rear+'.');
                else add('skewer',evidence,
                    'Enfilada geomètrica: una peça de més valor a '+x.front+
                    ' és davant d’una altra peça rival a '+x.rear+'.');
            }
            for(const x of discovered(before,after,played)) {
                if(x.id==='discoveredCheck'&&!a.in_check()) continue;
                add(x.id,{attacker:x.slider,uncovered:x.uncovered,target:x.target},
                    x.id==='discoveredCheck'
                    ? 'Escac a la descoberta: en apartar-se una peça, s’obre una línia d’atac al rei rival.'
                    : 'Atac a la descoberta: una peça deixa lliure la línia d’atac d’una altra.');
            }

            if (played.piece==='r'&&((color==='w'&&RANK(played.to)===7)||(color==='b'&&RANK(played.to)===2))) {
                if(RANK(played.from)!==RANK(played.to)) add('rookSeventh',{sq:played.to},'Una torre entra a la setena fila rival.');
            }
            if (played.piece!=='p' && CENTER.has(played.to) && !CENTER.has(played.from))
                add('centerOccupation',{square:played.to},'Les '+sideName(color)+' ocupen una casella central amb una peça.');
            if (['r','q'].includes(played.piece) && FILE(played.to)!==FILE(played.from)) {
                const own=fPawn(after,color,FILE(played.to)).length;
                const rival=fPawn(after,enemy,FILE(played.to)).length;
                if (!own&&!rival) add('openFile',{file:played.to[0]},'La columna '+played.to[0]+' està oberta: no hi ha peons de cap bàndol.');
                else if (!own && rival) add('semiOpenFile',{file:played.to[0]},'La columna '+played.to[0]+' és semioberta: no hi ha peons propis.');
            }
            if(played.piece==='r' && pieces(after,color,'r').filter(q=>FILE(q.sq)===FILE(played.to)).length>=2 &&
                pieces(before,color,'r').filter(q=>FILE(q.sq)===FILE(played.to)).length<2)
                add('doubledRooks',{file:played.to[0]},'Les '+sideName(color)+' han situat dues torres a la mateixa columna.');
            if(played.piece==='b'&&['b2','g2','b7','g7'].includes(played.to))
                add('fianchetto',{square:played.to},'L’alfil s’instal·la a la diagonal llarga.');
            if(played.piece==='p' && p) {
                if(!fPawn(after,color,FILE(p.sq)-1).length && !fPawn(after,color,FILE(p.sq)+1).length &&
                    ((fPawn(before,color,FILE(played.from)-1).length + fPawn(before,color,FILE(played.from)+1).length)>0 || FILE(played.from)!==FILE(played.to)))
                    add('isolatedPawn',{square:p.sq},'Aquest peó ha quedat aïllat: no té peons propis a les columnes veïnes.');
                const oldDoubled=fPawn(before,color,FILE(played.to)).length, newDoubled=fPawn(after,color,FILE(played.to)).length;
                if(newDoubled>=2 && (oldDoubled<2||FILE(played.from)!==FILE(played.to)))
                    add('doubledPawn',{file:played.to[0]},'Hi ha peons propis doblats a la columna '+played.to[0]+'.');
                if(isPassed(after,p)) {
                    const previouslyPassed=before.at[played.from] && isPassed(before,before.at[played.from]);
                    add('passedPawn',{square:p.sq,alreadyPassed:!!previouslyPassed},previouslyPassed
                        ? 'Un peó passat avança a '+played.to+'.'
                        : 'El peó és passat: cap peó rival li barra el pas en aquesta columna ni a les veïnes.');
                    const neighbor=pieces(after,color,'p').find(q => q.sq!==p.sq && Math.abs(FILE(q.sq)-FILE(p.sq))===1 && isPassed(after,q));
                    if(neighbor)add('connectedPassedPawns',{squares:[p.sq,neighbor.sq]},'Les '+sideName(color)+' tenen peons passats en columnes veïnes.');
                }
                const defenders=pieces(after,color,'p').filter(q=>q.sq!==p.sq&&attacks(after,q,p.sq));
                const beforeDefenders=pieces(before,color,'p').filter(q=>q.sq!==played.from&&attacks(before,q,played.from));
                if(defenders.length&&!beforeDefenders.length)add('pawnChain',{square:p.sq},'Aquest peó queda protegit per un altre peó propi.');
            }
            if(played.captured && p && !pieces(after,enemy).some(q=>attacks(after,q,played.to)))
                add('safeCapture',{square:played.to},'Després de la captura, cap peça rival ataca immediatament la casella d’arribada.');
            if(played.piece==='k' && counter(after,'w','q')===0 && counter(after,'b','q')===0 &&
                pieces(after,color,'k').length===1) add('activeKing',{square:played.to},
                    'El rei es mou en una posició sense dames.');
            const majors=(s,cl)=>pieces(s,cl).filter(q=>!['k','p'].includes(q.type));
            const afterKinds=after.pieces.filter(q=>!['k','p'].includes(q.type)).map(q=>q.type);
            if(played.captured||played.promotion) {
                if(!afterKinds.length)add('pawnEndgame',{fen:c.fenAfter},'La posició només conserva reis i peons.');
                for (const [id,t] of [['rookEndgame','r'],['queenEndgame','q'],['bishopEndgame','b']]) {
                    if(afterKinds.length>0 && afterKinds.every(v=>v===t) && majors(after,'w').length>=1 && majors(after,'b').length>=1)
                        add(id,{fen:c.fenAfter},'La posició s’ha simplificat fins a un final de '+(t==='r'?'torres':t==='q'?'dames':'alfils')+'.');
                }
            }
            const ranks=c.fenAfter.split(' '),halfmove=Number(ranks[4]);
            if(halfmove>=100) add('fiftyMoveRule',{halfmove},'S’han completat cinquanta moviments de cada bàndol sense captures ni moviments de peó.');
            if(a.insufficient_material && a.insufficient_material() &&
                !(new Chess(c.fenBefore)).insufficient_material())
                add('insufficientMaterial',{fen:c.fenAfter},'Les peces restants no permeten fer escac i mat.');
            return out;
        } catch(err){return [];}
    }

    // Desviació, interferència i sacrifici: no s'activen mai a la TV ni amb un sol
    // moviment. Cal una línia COMPLETA de tres jugades, amb certificat
    // Stockfish preexistent, que torni a passar la inspecció d'escacs.
    function detectCertifiedLine(ctx) {
        const c=ctx||{},item=c.candidate,Chess=c.ChessCtor,H=c.Hieroclosure;
        const proof=item&&item.conclusion;
        if(typeof Chess!=='function'||!H||typeof H.matches!=='function'||
            typeof H.createVerifier!=='function'||typeof H.lineOf!=='function'||
            !H.matches(item)||!proof||!Number.isFinite(proof.requestedDepth)||
            proof.requestedDepth<16||proof.minDepth<14) return [];
        try {
            const inspected=H.createVerifier(Chess).inspect(item);
            if(!inspected||inspected.finalFen!==proof.finalFen||inspected.kind!==proof.kind||
                (inspected.gain!==null&&inspected.gain!==proof.gain)) return [];
            const line=H.lineOf(item),g=new Chess(item.fen),states=[snapshot(g)],moves=[];
            for(const u of line) {
                const m=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]});
                if(!m)return [];
                moves.push(m);states.push(snapshot(g));
            }
            const color=item.fen.split(' ')[1],enemy=opponent(color),out=[],seen=new Set();
            function addLine(id,evidence,text,step) {
                const key=id+':'+step+':'+evidence.target;
                if(seen.has(key))return;
                seen.add(key);
                out.push({id,pattern:INDEX[id],evidence,text,color,
                    squares:[moves[step].from,moves[step].to],
                    step:step/2+1,source:'variant_certificada'});
            }
            // Per comprovar causalitat, la peça/objectiu posterior és
            // capturada en un torn posterior del jugador dins la línia.
            function laterCapture(start,target) {
                return moves.some((m,j)=>j>start&&j%2===0&&
                    m.color===color&&m.captured&&m.to===target);
            }
            for(let i=0;i<=2;i+=2) {
                const before=states[i],after=states[i+1],move=moves[i],p=after.at[move.to];
                if(!p||p.color!==color)continue;
                // Interferència: el moviment del jugador ocupa una casella
                // abans buida entre un defensor lliscant i la peça defensada.
                if(!before.at[move.to]) for(const defender of pieces(before,enemy).filter(isSlider)) {
                    for(const target of pieces(before,enemy)) {
                        if(target.sq===defender.sq||!after.at[target.sq]||
                            !onSegment(defender.sq,move.to,target.sq)||
                            !attacks(before,defender,target.sq)||
                            attacks(after,defender,target.sq)||
                            !laterCapture(i,target.sq))continue;
                        addLine('interference',{defender:defender.sq,
                            blocking:move.to,target:target.sq},
                            'Interferència demostrada en aquesta variant: la jugada talla una línia defensiva abans de capturar la peça protegida.',i);
                    }
                }
                // Desviació: la primera jugada ataca un defensor (o dona
                // escac); aquest es mou en la rèplica i perd la defensa
                // d'una peça capturada després pel jugador.
                if(i+1>=moves.length)continue;
                const reply=moves[i+1],defender=after.at[reply.from],
                    afterReply=states[i+2];
                if(!defender||defender.color!==enemy||defender.type==='k'||
                    (!attacks(after,p,reply.from)&&!/[+#]/.test(move.san)))continue;
                for(const target of pieces(after,enemy)) {
                    if(target.sq===reply.from||!afterReply.at[target.sq]||
                        afterReply.at[target.sq].color!==enemy||
                        !attacks(after,defender,target.sq)||
                        !laterCapture(i+1,target.sq)||
                        pieces(afterReply,enemy).some(d=>attacks(afterReply,d,target.sq)))
                        continue;
                    addLine('deflection',{defender:reply.from,
                        displacedTo:reply.to,target:target.sq},
                        'Desviació demostrada en aquesta variant: el defensor abandona la protecció d’una peça que després es captura.',i);
                }
            }
            // Sacrifici: comprovació pròpia de balanç, captura acceptada,
            // resultat i alternatives Stockfish; cap identificació per etiqueta.
            if(typeof H.certifiedSacrifices==='function') {
                for(const s of H.certifiedSacrifices(item,Chess)) {
                    out.push({
                        id:'sacrifice',pattern:INDEX.sacrifice,
                        evidence:{offered:s.offered,offerUci:s.offerUci,
                            kind:s.kind,capture:s.captureUci||s.replyUci,
                            reply:s.replyUci,square:s.square,loss:s.loss,
                            checkedDefenses:s.checkedDefenses,
                            kingInCheck:s.kingInCheck,compensation:s.compensationKind},
                        text:s.kind==='refused'
                            ? 'Oferta de sacrifici refusada en aquesta variant: el rival podia capturar la peça, però ha triat una altra defensa. Stockfish valida la continuació hipotètica si l’accepta.'
                            : s.compensationKind==='mate'
                            ? 'Sacrifici verificat en aquesta variant: s’ha cedit material i la combinació acaba en mat.'
                            : 'Sacrifici verificat en aquesta variant: s’ha cedit material, però la combinació acaba amb un guany net comprovat.',
                        color,step:s.step,source:'variant_certificada',
                        squares:[s.offerUci.slice(0,2),s.offerUci.slice(2,4)]
                    });
                }
            }
            return out;
        }catch(err){return [];}
    }

    function candidates(ctx) {
        return detect(ctx).filter(hit=>!['mate','check','promotion','castling','fork','doubleAttack'].includes(hit.id))
            .slice(0,3).map(hit=>({
                kind:'pattern',priority:hit.id==='passedPawn'?57:hit.id==='safeCapture'?39:43,
                text:hit.text,variants:[hit.text],family:'patron:'+hit.id,
                key:'patron:'+hit.id+':'+hit.color+':'+hit.squares[1],
                sig:JSON.stringify(hit.evidence).slice(0,100),explanatory:true,reliability:'rules',
                tags:{color:hit.color,squares:hit.squares},payload:{patternId:hit.id}
            }));
    }
    function describe(ids) {
        return (Array.isArray(ids)?ids:[]).map(id=>INDEX[id]).filter(Boolean);
    }
    return { VERSION:1, CATALOG, INDEX, FAMILY, AUTOMATIC:[...AUTOMATIC],
        detect,detectCertifiedLine,candidates,describe, snapshot,isPassed };
});
