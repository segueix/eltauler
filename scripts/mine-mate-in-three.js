#!/usr/bin/env node
'use strict';
// Tres partides reals Stockfish 19 vs Lozza 3.0 i mineria de mats forçats en tres.
// Acció separada: només publica a la reserva existent després de verificar.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');
const H = require('../hieroclosure');
const { readReserve, writeReserve, sound, reserveFenKey, addToPublicReserve } = require('./mine-hieroglyphics');
const ROOT = path.resolve(__dirname, '..');
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf('--' + name); return i < 0 ? def : Number(args[i + 1]); };
const GAMES = flag('games', 3), MAX_NEW = flag('add', 3), MINUTES = flag('minutes', 26);
const MAX_RESERVE = flag('max', 1000);
const MAX_PLIES = 160, SF_MS = 800, LOZZA_MS = 150, QUICK_MS = 650, VERIFY_MS = 5500;
if (!Number.isInteger(GAMES) || GAMES !== 3 || !Number.isInteger(MAX_NEW) || MAX_NEW < 1 || MAX_NEW > 9 ||
    !Number.isInteger(MAX_RESERVE) || MAX_RESERVE < MAX_NEW || !Number.isFinite(MINUTES) || MINUTES < 1 || MINUTES > 40) {
    throw Error('Paràmetres invàlids: --games 3 --add 1..9 --minutes 1..40 --max >= add');
}
const deadline = Date.now() + MINUTES * 60000;
const remaining = () => Date.now() < deadline;
const uci = m => m.from + m.to + (m.promotion || '');
const play = (g, s) => UCI.test(s || '') ? g.move({from:s.slice(0,2),to:s.slice(2,4),promotion:s[4] || 'q'}) : null;
const fenKey = fen => fen.split(' ').slice(0,4).join(' ');
function parseInfo(line) {
    if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
    const d = /\bdepth (\d+)/.exec(line), mpv = /\bmultipv (\d+)/.exec(line);
    const cp = /\bscore cp (-?\d+)/.exec(line), mate = /\bscore mate (-?\d+)/.exec(line);
    const pv = /\bpv (.+)$/.exec(line);
    if (!d || (!cp && !mate) || !pv || /\b(?:lowerbound|upperbound)\b/.test(line)) return null;
    const moves = pv[1].trim().split(/\s+/).filter(m => UCI.test(m));
    if (!moves.length) return null;
    return {depth:+d[1],rank:mpv?+mpv[1]:1,evalType:mate?'mate':'cp',eval:+(mate||cp)[1],
        bound:false,move:moves[0],pv:moves};
}
class Engine {
    constructor(file, name) {
        this.name = name; this.p = spawn(process.execPath, [file], {cwd:ROOT, stdio:['pipe','pipe','pipe']});
        this.dead = false; this.waiter = null; this.buffer = ''; this.info = new Map(); this.err = '';
        this.p.stdout.on('data', chunk => {this.buffer += chunk.toString(); let pos;
            while ((pos=this.buffer.indexOf('\n'))>=0) {const line=this.buffer.slice(0,pos).trim();
                this.buffer=this.buffer.slice(pos+1); this.line(line);}});
        this.p.stderr.on('data', chunk => {this.err=(this.err+chunk.toString()).slice(-1500);});
        this.p.on('error', e => this.fail(e));
        this.p.on('exit', code => this.fail(Error(this.name+' ha acabat ('+code+'): '+this.err)));
    }
    fail(e) {this.dead=true;if(this.waiter){const w=this.waiter;this.waiter=null;clearTimeout(w.timer);w.reject(e);}}
    line(line) {
        const info=parseInfo(line);
        if (info) {
            if (!this.info.has(info.depth)) this.info.set(info.depth,new Map());
            this.info.get(info.depth).set(info.rank,info);
        }
        const w=this.waiter;
        if(w && w.check(line)){this.waiter=null;clearTimeout(w.timer);w.resolve(line);}
    }
    send(s) {if(this.dead)throw Error(this.name+' no està disponible');this.p.stdin.write(s+'\n');}
    wait(check, timeout=30000) {if(this.waiter)throw Error('Ordres UCI simultànies: '+this.name);
        if(this.dead)throw Error(this.name+' no està disponible');
        return new Promise((resolve,reject) => {const timer=setTimeout(()=>{this.waiter=null;reject(Error(this.name+' no ha respost'))},timeout);
            this.waiter={check,resolve,reject,timer};});
    }
    async init() {let w=this.wait(s=>s==='uciok');this.send('uci');await w;
        w=this.wait(s=>s==='readyok');this.send('isready');await w;
        this.send('setoption name Hash value 32');}
    async reset() {
        // La UCI exigeix reiniciar la cerca entre partides i després d'un error.
        this.send('ucinewgame');
        const ready=this.wait(s=>s==='readyok');
        this.send('isready');
        await ready;
    }
    async search(fen, {ms=500,depth=0,multi=1,skill=null}={}) {
        this.send('setoption name MultiPV value '+multi);
        if(skill!==null)this.send('setoption name Skill Level value '+skill);
        let w=this.wait(s=>s==='readyok');this.send('isready');await w;
        this.info.clear();this.send('position fen '+fen);
        const go='go '+(depth?'depth '+depth+' ':'')+'movetime '+ms;
        w=this.wait(s=>/^bestmove\s/.test(s), Math.max(20000,ms*5+12000));this.send(go);
        const bm=await w; const match=/^bestmove\s+(\S+)/.exec(bm);
        // Conservar el darrer nivell complet de MultiPV, no barrejar profunditats.
        const complete=Array.from(this.info.entries()).filter(([d,rows])=>Array.from({length:multi},(_,i)=>rows.has(i+1)).every(Boolean))
            .sort((a,b)=>b[0]-a[0])[0];
        const fallback=Array.from(this.info.entries()).sort((a,b)=>b[0]-a[0])[0];
        const rows=complete?complete[1]:fallback?fallback[1]:new Map();
        const alternatives=Array.from(rows.values()).sort((a,b)=>a.rank-b.rank);
        return {best:match&&UCI.test(match[1])?match[1]:null,rawBest:match?match[1]:null,
            alternatives,bestMove:alternatives[0]||null,infos:this.info};
    }
    close(){this.dead=true;try{this.p.stdin.write('quit\n');this.p.kill();}catch(e){}}
}
// Mat forçat com a màxim en N semijugades: quantificadors existencial (atacant)
// i universal (defensor). El pressupost evita bloquejar la tasca amb arbres enormes.
function mateProof(fen, plies=5, maxNodes=400000, maxMs=5000) {
    const g = new Chess(fen), attacker = g.turn(), cache = new Map();
    const end=Date.now()+maxMs; let nodes=0;
    const solve = n => {
        if(++nodes>maxNodes || Date.now()>end) throw Error('massa nodes');
        if(g.in_checkmate()) return g.turn()!==attacker;
        if(g.game_over() || n===0) return false;
        const k=g.fen()+'@'+n;
        if(cache.has(k)) return cache.get(k);
        const atk=g.turn()===attacker;
        // Les jugades amb escac primer permeten demostrar més mats sense
        // augmentar artificialment la força ni descartar les jugades tranquil·les.
        const moves=g.moves({verbose:true}).sort((a,b)=>{
            const priority=m=>(/[+#]/.test(m.san)?10:0)+(m.captured?2:0);
            return priority(b)-priority(a);
        });
        let result=!atk;
        for(const m of moves){g.move(m);const win=solve(n-1);g.undo();
            if(atk&&win){result=true;break;}
            if(!atk&&!win){result=false;break;}}
        cache.set(k,result);return result;
    };
    try {
        if(!solve(plies))return null;
        // Excloure mat en una o dues: cal que l'exercici duri exactament tres.
        if(solve(plies-2))return null;
        const wins=[];
        for(const m of g.moves({verbose:true})) {g.move(m);const ok=solve(plies-1);g.undo();if(ok)wins.push(uci(m));}
        if(wins.length!==1)return null;
        // Construeix una línia completa emprant la mateixa demostració exacta.
        // El defensor tria una resposta que endarrereixi el mat, si existeix.
        const witness=[], sanLine=[];
        for(let n=plies;n>0;n--){
            const attackerTurn=g.turn()===attacker;
            const moves=g.moves({verbose:true});
            let picked=null, fallback=null;
            for(const move of moves){
                if(n===plies && uci(move)!==wins[0])continue;
                g.move(move);
                const winning=solve(n-1);
                const delays=(!attackerTurn && n>=4)?!solve(n-3):false;
                g.undo();
                if(!winning)continue;
                if(!fallback)fallback=move;
                if(attackerTurn || delays){picked=move;break;}
            }
            picked=picked||fallback;
            if(!picked)return null;
            g.move(picked);witness.push(uci(picked));sanLine.push(picked.san);
        }
        if(witness.length!==5 || !g.in_checkmate())return null;
        return {first:wins[0],nodes,line:witness,sanLine};
    }catch(e){return null;}
}
function legalEngineMove(chess, move) {
    if(!UCI.test(move || ''))return false;
    try {return !!play(new Chess(chess.fen()),move);}catch(e){return false;}
}
async function engineMoveWithRetry(engine,chess,opts,details) {
    const fen=chess.fen();
    for(let attempt=0;attempt<3;attempt++){
        if(attempt)await engine.reset();
        const params={...opts,ms:Math.round(opts.ms*Math.pow(2,attempt))};
        const result=await engine.search(fen,params);
        if(legalEngineMove(chess,result.best))return result.best;
        console.warn('Motor sense jugada legal: '+engine.name+
            ' | partida='+details.game+' ply='+details.ply+' intent='+(attempt+1)+
            ' | FEN='+fen+' | bestmove='+String(result.rawBest)+
            ' | PV='+String(result.alternatives[0]&&result.alternatives[0].move));
        // Si la sortida UCI diu (none), no inventar una jugada arbitrària:
        // només es pot recuperar una jugada calculada per aquest mateix motor.
        if(attempt===2 && !result.best && result.alternatives[0] &&
            legalEngineMove(chess,result.alternatives[0].move)) {
            console.warn('Recuperada una jugada PV real de '+engine.name);
            return result.alternatives[0].move;
        }
    }
    return null;
}
const OPENINGS = [
    ['e2e4','e7e5','g1f3','b8c6'],
    ['d2d4','d7d5','c2c4','e7e6'],
    ['e2e4','c7c5','g1f3','d7d6']
];
async function game(sf,lozza,index) {
    const chess=new Chess(), fens=[chess.fen()], moves=[];
    const sfColor=index===1?'b':'w', opening=OPENINGS[index];
    await Promise.all([sf.reset(),lozza.reset()]);
    for(let ply=0;ply<MAX_PLIES && !chess.game_over() && remaining();ply++){
        const forced=opening[ply]; let move=forced;
        if(!move){
            const sfTurn=chess.turn()===sfColor;
            move=await engineMoveWithRetry(sfTurn?sf:lozza,chess,sfTurn?
                {ms:SF_MS,multi:1,skill:20}:{ms:LOZZA_MS,depth:index%2?6:5,multi:1},
                {game:index+1,ply:ply+1});
        }
        if(!legalEngineMove(chess,move)){
            console.warn('Partida '+(index+1)+' interrompuda al ply '+(ply+1)+
                ', després de 3 intents. Es descarta, però no es perd la resta de la tanda.');
            return {moves,fens,sfColor,done:false,mate:false,incomplete:true};
        }
        play(chess,move);
        moves.push(move);fens.push(chess.fen());
    }
    console.log('Partida '+(index+1)+': '+moves.length+' semijugades, final: '+
        (chess.in_checkmate()?'mat':chess.in_draw()?'taules':'límit')+', Stockfish '+sfColor);
    return {moves,fens,sfColor,done:chess.game_over(),mate:chess.in_checkmate()};
}
function candidatesFrom(game) {
    const {fens, moves,sfColor}=game, items=[];
    // Posicions reals, fins i tot si el final de la partida no és mat.
    for(let i=fens.length-1;i>=Math.max(8,fens.length-90);i--){
        const g=new Chess(fens[i]); if(!g.game_over() && g.turn()===sfColor) items.push({fen:fens[i],kind:'partida',ply:i});
    }
    // Prioritat a l'inici del darrer tram de cinc semijugades quan hi ha mat.
    if(game.mate && fens.length>=6) items.unshift({fen:fens[fens.length-6],kind:'final',ply:moves.length-5});
    return items;
}
async function branches(sf,game) {
    const items=[], fens=game.fens;
    // Ramificacions separades: substituir una resposta de Lozza per la segona
    // o tercera línia plausible de Stockfish. La partida original no es modifica.
    for(let i=Math.max(8,fens.length-50);i<fens.length-1 && items.length<40 && remaining();i++) {
        const g=new Chess(fens[i]);if(g.game_over() || g.turn()===game.sfColor)continue;
        const a=await sf.search(g.fen(),{ms:350,depth:11,multi:3,skill:20});
        for(const alt of a.alternatives.slice(1,3)){
            if(!alt || !play(g,alt.move))continue;
            const fen=g.fen();g.undo();
            items.push({fen,kind:'defensa-alternativa',ply:i,reply:alt.move});
        }
    }
    return items;
}
async function makeLine(sf,fen,first) {
    const g=new Chess(fen),line=[], san=[];
    for(let ply=0;ply<5;ply++){
        const res=await sf.search(g.fen(),{ms:VERIFY_MS,depth:20,multi:ply%2===0?3:1,skill:20});
        const move=ply===0?first:res.best;
        if(!move || !play(g,move))return null;
        line.push(move);san.push(g.history().slice(-1)[0]);
        if(g.game_over() && ply!==4)return null;
    }
    if(!g.in_checkmate())return null;
    return {line,san};
}
function certifiedMateByProof(fen,proof) {
    // Certificació alternativa: arbre exhaustiu de totes les defenses a cinc
    // semijugades, amb única primera jugada i sense mat forçat en dues.
    // No s'inventa cap profunditat Stockfish.
    if(!proof || !Array.isArray(proof.line) || proof.line.length!==5 ||
        proof.first!==proof.line[0])return null;
    const g=new Chess(fen),sanLine=[];
    for(let i=0;i<proof.line.length;i++){
        const m=play(g,proof.line[i]);
        if(!m || (i<4 && g.game_over()))return null;
        sanLine.push(m.san);
    }
    if(!g.in_checkmate())return null;
    const last=sanLine[4],first=new Chess(fen);
    const line=proof.line;
    return {
        fen,solutionMoves:[line[0],line[2],line[4]],
        replyMoves:[line[1],line[3]],
        stepAlternatives:[],
        stepEvals:[],stepPvs:[],
        conclusion:{
            version:H.VERSION,fen,line,finalFen:g.fen(),kind:'mate',
            finalSan:last,gain:null,checkedReplies:0,
            checkedAlternatives:first.moves().length-1,
            explanation:last+' culmina un mat forçat en tres jugades, demostrat comprovant totes les defenses legals.',
            uniqueness:'Una única primera jugada força mat en tres; s’han comprovat exhaustivament les defenses possibles.',
            alternativeSan:null,alternativeLine:[],alternativeEval:null,
            minDepth:0,requestedDepth:0,sacrifices:[],
            proofMethod:'exhaustive_mate_tree',proofNodes:proof.nodes
        }
    };
}
async function validate(sf,fen,proof) {
    const line={line:proof.line,san:proof.sanLine};
    if(!line.line || line.line.length!==5)return null;
    const raw={fen,solutionMoves:[line.line[0],line.line[2],line.line[4]],replyMoves:[line.line[1],line.line[3]]};
    const verifier=H.createVerifier(Chess,async(fen,depth,multi,ms)=>{
        const a=await sf.search(fen,{ms:Math.min(VERIFY_MS,Math.max(2800,ms||VERIFY_MS)),depth:Math.max(depth,20),multi,skill:20});
        return {bestMove:a.bestMove,alternatives:a.alternatives};
    });
    // El verificador habitual és més estricte: exigeix unicitat també en
    // jugades posteriors. Això no és necessari per a un mat forçat en tres.
    // Si falla, el certificat exhaustiu continua sent matemàticament vàlid.
    const rich=await verifier.verify(raw,{depth:20,moveTimeMs:VERIFY_MS,shouldAbort:()=>!remaining()});
    const result=rich && rich.conclusion && rich.conclusion.kind==='mate'
        ? rich : certifiedMateByProof(fen,proof);
    if(!result || !H.matches(result))return null;
    const start=new Chess(fen), player=start.turn();
    return {...result,
        id:'',source:'reserve',fen,sideToMove:player,line:line.line,sanLine:line.san,
        bestMove:proof.first,bestMoveSan:line.san[0],finalType:'mate',finalMotif:'mate',
        finalMotifs:['mate'],theme:'mate',tacticKind:'escac i mat',difficulty:75,difficultyPercent:75,
        status:'new',attempts:0,startedAt:null,solvedAt:null,deviceCreated:null,playerMove:null,
        origin:'stockfish19_lozza3_mate3',sourceGameId:null,sourceFen:fen,sourceMoveNumber:Number(fen.split(' ')[5]||1),
        adaptationNote:null,pv:line.line,evalBefore:99999,ratingEstimate:null};
}
async function main(){
    let sf,lozza;let added=0,checked=0,found=0;
    const stats={games:0,candidates:0,finals:0,fastMate:0,highAdvantage:0,
        proofCalls:0,proofPass:0,verifyCalls:0,verified:0,published:0};
    const reserve=readReserve().filter(sound).slice(0,MAX_RESERVE), known=new Set(reserve.map(x=>reserveFenKey(x.fen)));
    try {
        sf=new Engine(path.join(ROOT,'stockfish-19-lite-single.js'),'Stockfish 19');
        lozza=new Engine(path.join(ROOT,'lozza.js'),'Lozza 3.0');
        await Promise.all([sf.init(),lozza.init()]);
        const games=[];
        // Les partides amb fallades UCI no s'accepten com a completes.
        // Reintentar amb una altra obertura sense perdre les partides ja fetes.
        let attempts=0;
        while(games.length<GAMES && attempts<GAMES*3 && remaining()){
            const g=await game(sf,lozza,attempts%OPENINGS.length);
            attempts++;
            if(!g.incomplete)games.push(g);
        }
        stats.games=games.length;
        if(games.length<GAMES)console.warn('Només '+games.length+'/'+GAMES+
            ' partides completes. Es minen les disponibles; cap partida incompleta es publica.');
        // No descartar una partida que acaba en taules: pot contenir variants amb mat.
        const items=[];
        for(const g of games){items.push(...candidatesFrom(g));if(remaining())items.push(...await branches(sf,g));}
        const candidates=[],seen=new Set();
        for(const x of items){const key=fenKey(x.fen);if(seen.has(key)||known.has(key))continue;seen.add(key);candidates.push(x);}
        stats.candidates=candidates.length;
        stats.finals=candidates.filter(x=>x.kind==='final').length;
        console.log('Posicions i branques candidates: '+candidates.length+
            ' | finals directes: '+stats.finals);
        for(const x of candidates){
            if(!remaining() || added>=MAX_NEW)break;
            // Un mat vist a la partida real no s'ha d'excloure per una cerca
            // ràpida insuficient. La prova exhaustiva determina si és forçat.
            let promising=x.kind==='final';
            if(!promising){
                const a=await sf.search(x.fen,{ms:Math.max(1000,QUICK_MS),depth:20,multi:1,skill:20});
                const best=a.bestMove;
                if(best && best.evalType==='mate' && best.eval>=3 && best.eval<=8){
                    stats.fastMate++;promising=true;
                }else if(best && best.evalType==='cp' && best.eval>=500){
                    // Pot existir un mat en 3 encara no descobert a la cerca curta.
                    stats.highAdvantage++;promising=true;
                }
            }
            if(!promising)continue;
            stats.proofCalls++;
            const proof=mateProof(x.fen,5,x.kind==='final'?800000:400000,
                x.kind==='final'?12000:5000);
            if(!proof)continue;
            stats.proofPass++;found++;
            stats.verifyCalls++;
            const item=await validate(sf,x.fen,proof);
            checked++;
            if(!item || !sound(item))continue;
            stats.verified++;
            const next=addToPublicReserve(reserve,item,MAX_RESERVE,Date.now());
            if(!next)continue;
            reserve.splice(0,reserve.length,...next);
            known.add(reserveFenKey(item.fen));added++;
            stats.published=added;
            writeReserve(reserve);
            console.log('MAT EN 3 VALIDAT ('+added+'/'+MAX_NEW+'): '+item.sanLine.join(' ')+' ['+x.kind+']');
        }
    } finally {if(sf)sf.close();if(lozza)lozza.close();}
    console.log('Resultats detallats: '+JSON.stringify(stats));
    console.log('Acabat: '+added+' nous mats en 3; '+found+' demostracions; '+checked+' verificacions completes.');
    if(!added)console.warn('CAP JEROGLÍFIC PUBLICAT: les partides han acabat, però cap posició ha superat tots els filtres. No és un error de desplegament.');
    if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        '### Mats en tres · Stockfish contra Lozza\n'+
        'Partides completes: **'+stats.games+'/3**. Posicions candidates: **'+stats.candidates+
        '**. Finals amb mat: **'+stats.finals+'**. Proves exhaustives: **'+stats.proofCalls+
        '**. Mats demostrats: **'+stats.proofPass+'**. Mats verificats: **'+stats.verified+
        '**. Publicats: **'+added+'**.\n'+
        (added?'Publicació sol·licitada en acabar el workflow.':
            'Cap mat nou ha passat tots els filtres. No hi ha fitxer modificat ni desplegament. '
            +'Consulteu els comptadors anteriors per saber en quin filtre s\'han descartat.')+'\n');
}
if(require.main===module)main().catch(e=>{console.error('ERROR: '+e.stack);process.exitCode=1;});
module.exports={parseInfo,mateProof,candidatesFrom,legalEngineMove,engineMoveWithRetry};
