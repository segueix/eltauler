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
        ['bishopPair','parella d’alfils','posicional',null],['fianchetto','fianquet','posicional',null],
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
        'fork','doubleAttack','mate','underpromotion','promotion',
        'centerOccupation','openFile','semiOpenFile','doubledRooks','rookSeventh',
        'isolatedPawn','doubledPawn','passedPawn','connectedPassedPawns','pawnChain',
        'fianchetto','castling','check','safeCapture','activeKing',
        'rookEndgame','pawnEndgame','queenEndgame','bishopEndgame',
        'fiftyMoveRule','insufficientMaterial'
    ]);
    const FAMILY = Object.freeze({ tactica: 'Tàctica', posicional: 'Estratègia posicional',
        defensa: 'Atac i defensa', finals: 'Finals' });
    const CATALOG = Object.freeze(ROWS.map(([id,name,family,lichessTheme]) =>
        Object.freeze({ id, name, family, lichessTheme,
            status: AUTOMATIC.has(id) ? 'detector' : 'pendent_de_validacio',
            verification: AUTOMATIC.has(id) ? 'regles_del_tauler' : 'requereix_analisi' })));
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
                add('fianchetto',{square:played.to},'L’alfil ocupa una casella típica de fianquet.');
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
        detect,candidates,describe, snapshot,isPassed };
});
