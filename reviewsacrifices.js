// Candidats de sacrifici de les partides: només fets legals, sense Stockfish.
// El veredicte posicional requereix ElTaulerHieroClosure.createPositionalVerifier.
(function(root,factory) {
    const api=factory();
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    else root.ElTaulerReviewSacrifices=api;
})(typeof self!=='undefined'?self:this,function() {
    'use strict';
    const VERSION=1;
    const VALUES={p:1,n:3,b:3,r:5,q:9,k:0};
    const UCI=/^[a-h][1-8][a-h][1-8][qrbn]?$/;
    const uci=m=>m.from+m.to+(m.promotion||'');
    const fenKey=fen=>String(fen||'').split(' ').slice(0,4).join(' ');
    function balance(g,color) {
        return g.board().flat().reduce((n,p)=>n+(p?(p.color===color?1:-1)*VALUES[p.type]:0),0);
    }
    function cacheKey(entry,moves) {
        // Detecta versions velles o un PGN modificat: no reutilitzar proves
        // que pertanyen a una altra seqüència de jugades o un altre color.
        const raw=(entry&&entry.playerColor||'w')+'|'+(Array.isArray(moves)?moves.join('|'):'');
        let h=2166136261;
        for(let i=0;i<raw.length;i++)h=Math.imul(h^raw.charCodeAt(i),16777619)>>>0;
        return VERSION+':'+raw.length+':'+h.toString(16);
    }
    function collect(entry,moves,Chess) {
        if(!entry||!Array.isArray(entry.moveReviews)||!entry.moveReviews.length||
            !Array.isArray(moves)||!moves.length||typeof Chess!=='function')return [];
        const color=entry.playerColor==='b'?'b':'w';
        const matched=new Set(entry.moveReviews.filter(r=>r&&typeof r.fen==='string'&&
            typeof r.playerMove==='string'&&UCI.test(r.playerMove)&&
            (!r.color||r.color===color))
            .map(r=>fenKey(r.fen)+'|'+r.playerMove));
        const found=[],g=new Chess();
        try {
            for(let i=0;i<moves.length;i++) {
                const before=g.fen(),turn=g.turn(),baseline=balance(g,turn);
                const played=g.move(moves[i],{sloppy:true});
                if(!played)break; // un PGN incomplet no justifica inventar jugades
                if(turn!==color||i+1>=moves.length||!['n','b','r','q'].includes(played.piece)||
                    !matched.has(fenKey(before)+'|'+uci(played))||g.game_over())continue;
                const afterOffer=g.fen(),response=new Chess(afterOffer);
                const reply=response.move(moves[i+1],{sloppy:true});
                if(!reply||reply.to!==played.to||reply.captured!==played.piece||response.game_over())continue;
                const loss=baseline-balance(response,color);
                if(loss<2)continue;
                found.push({fen:before,move:uci(played),reply:uci(reply),
                    san:played.san,replySan:reply.san,offered:played.piece,
                    loss,moveNumber:Math.floor(i/2)+1,ply:i});
            }
        } catch(e) {return [];}
        return found;
    }
    function cached(entry,moves) {
        const saved=entry&&entry.positionalSacrificeReview;
        if(!saved||saved.version!==VERSION||
            saved.key!==cacheKey(entry,moves)||!Array.isArray(saved.results))return null;
        return saved;
    }
    return {VERSION,collect,cacheKey,cached};
});
