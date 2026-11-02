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
function mateProof(fen, plies=5, maxNodes=260000, maxMs=3200) {
    const g = new Chess(fen), attacker = g.turn(), cache = new Map();
    const end=Date.now()+maxMs; let nodes=0;
    const solve = n => {
        if(++nodes>maxNodes || Date.now()>end) throw Error('massa nodes');
        if(g.in_checkmate()) return g.turn()!==attacker;
        if(g.game_over() || n===0) return false;
        const k=g.fen()+'@'+n;
        if(cache.has(k)) return cache.get(k);
        const atk=g.turn()===attacker, moves=g.moves({verbose:true});
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
        return wins.length===1?{first:wins[0],nodes}:null;
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
async function validate(sf,fen,first) {
    const line=await makeLine(sf,fen,first);if(!line)return null;
    const raw={fen,solutionMoves:[line.line[0],line.line[2],line.line[4]],replyMoves:[line.line[1],line.line[3]]};
    const verifier=H.createVerifier(Chess,async(fen,depth,multi,ms)=>{
        const a=await sf.search(fen,{ms:Math.min(VERIFY_MS,Math.max(2800,ms||VERIFY_MS)),depth:Math.max(depth,20),multi,skill:20});
        return {bestMove:a.bestMove,alternatives:a.alternatives};
    });
    const result=await verifier.verify(raw,{depth:20,moveTimeMs:VERIFY_MS,shouldAbort:()=>!remaining()});
    if(!result || result.conclusion.kind!=='mate')return null;
    const start=new Chess(fen), player=start.turn();
    return {...result,
        id:'',source:'reserve',fen,sideToMove:player,line:line.line,sanLine:line.san,
        bestMove:first,bestMoveSan:line.san[0],finalType:'mate',finalMotif:'mate',
        finalMotifs:['mate'],theme:'mate',tacticKind:'escac i mat',difficulty:75,difficultyPercent:75,
        status:'new',attempts:0,startedAt:null,solvedAt:null,deviceCreated:null,playerMove:null,
        origin:'stockfish19_lozza3_mate3',sourceGameId:null,sourceFen:fen,sourceMoveNumber:Number(fen.split(' ')[5]||1),
        adaptationNote:null,pv:line.line,evalBefore:99999,ratingEstimate:null};
}
async function main(){
    let sf,lozza;let added=0,checked=0,found=0;
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
        if(games.length<GAMES)console.warn('Només '+games.length+'/'+GAMES+
            ' partides completes. Es minen les disponibles; cap partida incompleta es publica.');
        // No descartar una partida que acaba en taules: pot contenir variants amb mat.
        const items=[];
        for(const g of games){items.push(...candidatesFrom(g));if(remaining())items.push(...await branches(sf,g));}
        const candidates=[],seen=new Set();
        for(const x of items){const key=fenKey(x.fen);if(seen.has(key)||known.has(key))continue;seen.add(key);candidates.push(x);}
        console.log('Posicions i branques candidates: '+candidates.length);
        for(const x of candidates){
            if(!remaining() || added>=MAX_NEW)break;
            const a=await sf.search(x.fen,{ms:QUICK_MS,depth:18,multi:1,skill:20});
            const best=a.bestMove;
            if(!best || best.evalType!=='mate' || best.eval!==3)continue;
            const proof=mateProof(x.fen);
            if(!proof)continue;
            found++;
            const item=await validate(sf,x.fen,proof.first);
            checked++;
            if(!item || !sound(item))continue;
            const next=addToPublicReserve(reserve,item,MAX_RESERVE,Date.now());
            if(!next)continue;
            reserve.splice(0,reserve.length,...next);
            known.add(reserveFenKey(item.fen));added++;
            writeReserve(reserve);
            console.log('MAT EN 3 VALIDAT ('+added+'/'+MAX_NEW+'): '+item.sanLine.join(' ')+' ['+x.kind+']');
        }
    } finally {if(sf)sf.close();if(lozza)lozza.close();}
    console.log('Acabat: '+added+' nous mats en 3; '+found+' demostracions; '+checked+' verificacions completes.');
    if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        '### Mats en tres · Stockfish contra Lozza\nPartides: **3**. Mats nous verificats: **'+added+'**. Cap candidat sense prova no es publica.\n');
}
if(require.main===module)main().catch(e=>{console.error('ERROR: '+e.stack);process.exitCode=1;});
module.exports={parseInfo,mateProof,candidatesFrom,legalEngineMove,engineMoveWithRetry};
