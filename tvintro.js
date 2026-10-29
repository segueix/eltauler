// tvintro.js — Presentacions breus i variades de Stockfish vs Lozza TV.
// Cap introducció revela el nom de l'obertura, la línia preparada,
// jugades futures, ni promet resultats. Les condicions explicades
// provenen del pla real de la partida, no d'hipòtesis sobre els motors.
(function(root,factory){
    const api=factory();
    if(typeof module!=='undefined'&&module.exports) module.exports=api;
    else root.ElTaulerTvIntro=api;
})(typeof self!=='undefined'?self:this,function(){
    'use strict';
    const VERSION='1.0.0';
    const OPENINGS=Object.freeze([
        'Tot és a punt per a un nou duel entre Stockfish i Lozza.',
        'Stockfish i Lozza es preparen per compartir el tauler.',
        'Comença una nova trobada entre Stockfish i Lozza.',
        'Tornem al tauler: Stockfish s’enfronta a Lozza.',
        'Dues maneres de jugar, un sol tauler: Stockfish contra Lozza.',
        'Stockfish i Lozza són a punt de posar les peces en moviment.',
        'La rivalitat continua: Stockfish i Lozza tornen a trobar-se.',
        'Obrim una nova partida de Stockfish contra Lozza.',
        'El tauler està preparat per rebre Stockfish i Lozza.',
        'Una altra història escaquística comença amb Stockfish i Lozza.',
        'Avui els protagonistes tornen a ser Stockfish i Lozza.',
        'Els motors estan a punt: Stockfish contra Lozza.',
        'Nova partida, noves decisions: Stockfish i Lozza entren en escena.',
        'Stockfish i Lozza tenen una altra ocasió per mesurar les seves forces.',
        'S’alça el teló d’un nou Stockfish contra Lozza.',
        'Tot està preparat per seguir Stockfish i Lozza jugada a jugada.',
        'El rellotge narratiu es posa en marxa: Stockfish davant de Lozza.',
        'Stockfish i Lozza enceten un nou capítol de la seva rivalitat.',
        'Tornem a les seixanta-quatre caselles amb Stockfish i Lozza.',
        'A punt de començar una partida entre dos motors: Stockfish i Lozza.',
        'Una nova pàgina al tauler: Stockfish contra Lozza.',
        'Stockfish espera Lozza per a una nova partida.',
        'Lozza i Stockfish tornen a prendre posicions al tauler.',
        'Deixem parlar les peces: Stockfish contra Lozza.',
        'S’acosta la primera jugada del duel entre Stockfish i Lozza.',
        'La partida encara no ha començat, però Stockfish i Lozza ja són a punt.',
        'Stockfish i Lozza tornen a posar a prova les seves decisions.',
        'Una nova confrontació escaquística enfronta Stockfish amb Lozza.',
        'El tauler obre les portes a Stockfish i Lozza.',
        'Stockfish i Lozza es retroben en una nova partida.',
        'Preparats per descobrir com juguen Stockfish i Lozza aquesta vegada.',
        'Comença una altra sessió de Stockfish contra Lozza.',
        'Una rivalitat de motors torna a escena: Stockfish i Lozza.',
        'El primer moviment s’acosta: Stockfish i Lozza ja són a punt.',
        'Una partida diferent espera Stockfish i Lozza.',
        'Seguirem una nova batalla d’idees entre Stockfish i Lozza.',
        'Stockfish s’asseu davant de Lozza en un altre duel.',
        'El tauler queda en mans de Stockfish i Lozza.',
        'A punt per veure quin camí segueixen Stockfish i Lozza.',
        'Una altra trobada sense guió: Stockfish contra Lozza.',
        'Torna el duel dels motors, amb Stockfish i Lozza.',
        'Dues intel·ligències escaquístiques, una partida: Stockfish i Lozza.',
        'Stockfish i Lozza són els convidats d’aquesta nova retransmissió.',
        'La següent història del tauler l’escriuran Stockfish i Lozza.',
        'És hora de retrobar Stockfish i Lozza cara a cara.',
        'Comença el pròleg d’una altra partida entre Stockfish i Lozza.',
        'Stockfish contra Lozza: aviat coneixerem les primeres decisions.',
        'El tauler espera les primeres passes de Stockfish i Lozza.',
        'Aquesta vegada tornarem a observar Stockfish contra Lozza.',
        'Benvinguts a un nou duel entre Stockfish i Lozza.'
    ]);
    const COLORS=Object.freeze({
        w:'Stockfish porta les blanques i Lozza les negres.',
        b:'Lozza porta les blanques i Stockfish les negres.'
    });
    const STYLES=Object.freeze({
        attacker:'un perfil més orientat a l’atac',
        wall:'un perfil més prudent',
        hunter:'un perfil atent a les oportunitats de captura',
        strategist:'un perfil més posicional'
    });
    function scene(options){
        const o=options||{}, d=o.duel, seq=Number.isInteger(o.gameSeq)?o.gameSeq:1;
        if(!d) return 'Comença una partida amb Stockfish als dos bàndols. Lozza no participa en aquesta sessió.';
        const engine=d.engines||{};
        // El color de Stockfish és l'única dada garantida, mai no s'infereix
        // per l'ordre dels noms en la capçalera.
        const stockfishColor=engine.w==='stockfish'&&engine.b==='lozza'?'w':
            engine.b==='stockfish'&&engine.w==='lozza'?'b':null;
        if(!stockfishColor) return 'Stockfish i Lozza es preparen per començar una nova partida.';
        const contexts=[
            COLORS[stockfishColor],
            'El sistema ha fixat les condicions del duel; la partida decidirà la resta.',
            'Els colors ja estan assignats i les primeres decisions encara són per descobrir.',
            'La configuració és a punt, però el desenvolupament continua obert.'
        ];
        if(o.preparedPlies>0){
            contexts.push('El sistema ha preparat un inici, però descobrirem la línia sobre el tauler.');
        }
        if(d.sharp&&o.sharpOpening===true&&o.preparedPlies>0){
            contexts.push('La selecció inicial afavoreix una obertura de perfil més dinàmic.');
        }
        if(Number.isFinite(d.bias)&&d.bias!==0&&o.strengthAdjusted===true){
            contexts.push('El sistema ha retocat lleugerament el repartiment de força respecte del nivell base.');
        }
        if(Number.isInteger(d.draws)&&d.draws>=2){
            contexts.push('Les taules recents s’han tingut en compte en la preparació d’aquest duel.');
        }
        const sfStyle=o.styles&&o.styles[stockfishColor];
        if(sfStyle&&Object.prototype.hasOwnProperty.call(STYLES,sfStyle)){
            contexts.push('Stockfish jugarà amb '+STYLES[sfStyle]+', sempre dins el seu nivell fixat.');
        }
        // 50 entrades en ordre de rotació; no repetim la mateixa presentació
        // fins a completar el cicle. Els detalls factuals giren per separat.
        const index=((seq-1)%OPENINGS.length+OPENINGS.length)%OPENINGS.length;
        const detail=contexts[(Math.floor((seq-1)/3)+seq-1)%contexts.length];
        return OPENINGS[index]+' '+detail;
    }
    return Object.freeze({VERSION,OPENINGS,COLORS,STYLES,scene});
});
