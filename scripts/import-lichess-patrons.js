#!/usr/bin/env node
// Extracció LOCAL i optativa d'un subconjunt del CSV CC0 de Lichess.
// Descàrrega manual: https://database.lichess.org/#puzzles
// Ús: node scripts/import-lichess-patrons.js lichess_db_puzzle.csv data/patrons-exemples.json
// Mai es carrega el CSV massiu a la PWA ni es confonen etiquetes externes
// amb patrons detectats o verificats per Stockfish en una nova posició.
const fs = require('fs');
const readline = require('readline');
const { Chess } = require('chess.js');
const { INDEX } = require('../patrons');

const ACTIVE_THEMES = Object.create(null);
Object.values(INDEX).forEach(p => { if(p.lichessTheme) ACTIVE_THEMES[p.lichessTheme] = p.id; });

function fields(line) {
    const out=[]; let field='',quoted=false;
    for (let i=0;i<line.length;i++) {
        const ch=line[i];
        if(ch==='"') {
            if(quoted && line[i+1]==='"'){field+='"';i++;}
            else quoted=!quoted;
        } else if (ch===','&&!quoted) {out.push(field);field='';}
        else field+=ch;
    }
    out.push(field);
    return out;
}
function parse(row) {
    const [id,fen,moves,rating,deviation,popularity,plays,themes,gameUrl]=fields(row);
    if(!/^[A-Za-z0-9]{5}$/.test(id||'')||!fen||!moves||!themes)return null;
    const used=themes.split(/\s+/).filter(Boolean);
    const matched=used.filter(t=>ACTIVE_THEMES[t]);
    const pop=Number(popularity),rate=Number(rating);
    if(!matched.length||!Number.isFinite(pop)||!Number.isFinite(rate))return null;
    return {id,fen,moves,rate,pop,matched,used,gameUrl:gameUrl||null};
}
function verify(record) {
    try {
        const g=new Chess(record.fen),list=record.moves.trim().split(/\s+/);
        if(list.length<3)return false;
        for(const u of list) {
            if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u))return false;
            if(!g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]}))return false;
        }
        return true;
    } catch(e) {return false;}
}
async function extract(input,output,opts) {
    const o=opts||{},limit=Math.min(1000,Math.max(1,o.limit||100)),minPopularity=o.minPopularity??70;
    const byTheme=new Map(), chosen=[],seen=new Set();
    const stream=fs.createReadStream(input,{encoding:'utf8'});
    const rows=readline.createInterface({input:stream,crlfDelay:Infinity});
    for await (const line of rows) {
        if(line.startsWith('PuzzleId,'))continue;
        const record=parse(line);
        if(!record||seen.has(record.id)||record.pop<minPopularity)continue;
        const keys=record.matched.filter(t=>(byTheme.get(t)||0)<Math.max(1,Math.ceil(limit/12)));
        if(!keys.length||!verify(record))continue;
        const best=keys.sort((a,b)=>(byTheme.get(a)||0)-(byTheme.get(b)||0))[0];
        const source={id:record.id,fen:record.fen,moves:record.moves,theme:best,
            patternId:ACTIVE_THEMES[best],rating:record.rate,popularity:record.pop,
            labels:record.used,source:'Lichess CC0',verifiedLine:true,
            // FEN és ANTERIOR al primer moviment del rival.
            firstMoveByOpponent:true};
        chosen.push(source);seen.add(record.id);byTheme.set(best,(byTheme.get(best)||0)+1);
        if(chosen.length>=limit)break;
    }
    const data={source:'https://database.lichess.org/',license:'CC0',
        semantics:'FEN before opponent move; solution starts with moves[1]',
        note:'Lichess labels are external annotations, not automatically verified local tactical claims',
        examples:chosen};
    fs.writeFileSync(output,JSON.stringify(data,null,2)+'\n','utf8');
    return data;
}
if(require.main===module){
    const [input,output,...args]=process.argv.slice(2);
    if(!input||!output){console.error('Ús: node scripts/import-lichess-patrons.js input.csv output.json [--limit=100] [--min-popularity=70]');process.exitCode=2;}
    else {
        const get=(prefix,defaultValue)=>{const v=args.find(a=>a.startsWith(prefix));return v?Number(v.slice(prefix.length)):defaultValue;};
        extract(input,output,{limit:get('--limit=',100),minPopularity:get('--min-popularity=',70)})
            .then(d=>console.log('Exemples CC0 importats i validats:',d.examples.length))
            .catch(e=>{console.error(e.message);process.exitCode=1;});
    }
}
module.exports={fields,parse,verify,extract};
