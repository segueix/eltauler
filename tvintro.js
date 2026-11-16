// tvintro.js — Presentacions breus i variades de Stockfish vs Lozza TV.
// Les presentacions descriuen les condicions reals del duel. A la revenja
// es recupera el resultat de l'anada i es confirmen els colors nous.
(function(root,factory){
    const api=factory();
    if(typeof module!=='undefined'&&module.exports) module.exports=api;
    else root.ElTaulerTvIntro=api;
})(typeof self!=='undefined'?self:this,function(){
    'use strict';
    const VERSION='1.2.0';
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
    // Noms del graf ECO i del repertori local. Les variants específiques
    // han d'anar abans de la família general.
    const OPENING_PROFILES = [
        [/sveshnikov/i, 'Siciliana Sveshnikov', 'b', 'El peó avançat disputa el centre i guanya temps atacant el cavall blanc.'],
        [/najdorf.*english attack/i, 'Atac Anglès de la Siciliana Najdorf', 'w', 'Les peces blanques es coordinen per poder enrocar llarg i avançar els peons del flanc de rei.'],
        [/najdorf/i, 'Siciliana Najdorf', 'b', 'El peó de torre negre treu una casella al cavall blanc i prepara joc al flanc de dama.'],
        [/accelerat.*drag|drag.*accelerat/i, 'Siciliana del Dragó accelerat', 'b', 'L’alfil negre entra ràpid a la gran diagonal i encara es pot obrir el centre amb el peó de dama.'],
        [/dragon|dragó/i, 'Siciliana del Dragó', 'b', 'L’alfil de rei pressiona per la gran diagonal i dona suport al contrajoc al flanc de dama.'],
        [/rossolimo/i, 'Siciliana Rossolimo', 'w', 'Les blanques pressionen el cavall amb l’alfil i poden alterar l’estructura negra amb el canvi.'],
        [/taimanov/i, 'Siciliana Taimanov', 'b', 'Les negres conserven opcions de desplegament i mantenen oberta la possibilitat de trencar pel centre.'],
        [/sicilian.*\bkan\b|siciliana kan/i, 'Siciliana Kan', 'b', 'Les negres poden preparar el contrajoc pel flanc de dama mentre decideixen on situar els cavalls.'],
        [/sicilian|siciliana/i, 'Defensa Siciliana', 'b', 'Les negres disputen el centre des del costat i obtenen una estructura asimètrica amb opcions de contrajoc.'],
        [/winawer/i, 'Francesa Winawer', 'b', 'L’alfil pressiona el cavall i, amb el canvi, les negres poden doblar els peons blancs del flanc de dama.'],
        [/french defense.*tarrasch|francesa.*tarrasch/i, 'Francesa Tarrasch', 'w', 'El cavall de dama es desplega sense tapar el peó que pot atacar el centre negre.'],
        [/french defense.*advance|francesa.*avanç/i, 'Francesa de l’avanç', 'w', 'El peó de rei avançat guanya espai i limita les peces negres.'],
        [/french defense|defensa francesa/i, 'Defensa Francesa', 'b', 'La cadena de peons permet resistir al centre i preparar un atac contra la seva base.'],
        [/caro.kann.*(?:advance|avanç)/i, 'Caro-Kann de l’avanç', 'w', 'L’avanç del peó de rei dona espai per maniobrar i buscar joc pel flanc de rei.'],
        [/caro.kann/i, 'Defensa Caro-Kann', 'b', 'Les negres disputen el centre i tenen l’opció de desenvolupar l’alfil de dama fora de la cadena de peons.'],
        [/king.s gambit accepted|gambit de rei acceptat/i, 'Gambit de rei acceptat', 'w', 'El peó cedit deixa una columna semioberta per a la torre blanca i facilita l’atac si les peces es desenvolupen ràpid.'],
        [/king.s gambit|gambit de rei/i, 'Gambit de rei', 'w', 'El peó d’alfil lluita pel centre i crea opcions d’atac ràpid al flanc de rei.'],
        [/scotch.*classical|escocesa.*clàssic/i, 'Escocesa clàssica', 'b', 'L’alfil negre surt amb activitat i pressiona el cavall blanc que ocupa el centre.'],
        [/scotch|escocesa/i, 'Obertura Escocesa', 'w', 'El canvi de peons obre el centre aviat i permet donar joc ràpid als alfils.'],
        [/two knights defense|defensa dels dos cavalls/i, 'Defensa dels Dos Cavalls', 'b', 'El cavall surt atacant el peó central. Això dona opcions de contrajoc mentre les blanques preparen l’atac.'],
        [/italian game|obertura italiana|giuoco piano/i, 'Obertura Italiana', 'w', 'L’alfil blanc apunta a prop del rei rival i permet preparar una ruptura al centre.'],
        [/ruy lopez|ruy lópez|spanish opening|obertura espanyola/i, 'Obertura de Ruy López', 'w', 'L’alfil pressiona el cavall que sosté el peó central i les blanques queden a punt per enrocar.'],
        [/catalan opening|obertura catalana/i, 'Obertura Catalana', 'w', 'L’alfil de rei pressiona per la gran diagonal i pot mantenir activitat durant molt de temps.'],
        [/london system|sistema londres/i, 'Sistema Londres', 'w', 'L’alfil de dama surt abans de tancar la cadena de peons, que sosté el desplegament.'],
        [/tarrasch defense|defensa tarrasch/i, 'Defensa Tarrasch', 'b', 'El peó de dama pot quedar aïllat, però dona espai i obre línies perquè les peces negres surtin actives.'],
        [/queen.s gambit accepted|gambit de dama acceptat/i, 'Gambit de dama acceptat', 'b', 'Acceptar el peó allibera la tensió central i deixa preparar un contraatac amb el peó d’alfil de dama.'],
        [/queen.s gambit declined|gambit de dama refusat/i, 'Gambit de dama refusat', 'b', 'Les negres sostenen el centre amb una cadena de peons que també obre pas a l’alfil de rei.'],
        [/king.s indian defense|defensa (?:índia|india) de rei/i, 'Defensa Índia de Rei', 'b', 'L’alfil de la gran diagonal es combina amb ruptures de peons per atacar el centre o buscar joc al flanc de rei.'],
        [/nimzo.indian|nimzo.índia/i, 'Defensa Nimzo-Índia', 'b', 'L’alfil frena el cavall de dama i ajuda les negres a disputar les caselles centrals.'],
        [/pirc defense|defensa pirc/i, 'Defensa Pirc', 'b', 'Les negres despleguen l’alfil per la diagonal llarga i guarden els peons per colpejar el centre quan convingui.'],
        [/scandinavian defense|defensa escandinava/i, 'Defensa Escandinava', 'b', 'Les negres desafien immediatament el peó central blanc i poden resoldre de seguida aquesta tensió.'],
        [/english opening|obertura anglesa/i, 'Obertura Anglesa', 'w', 'Les blanques controlen el centre des del flanc i conserven flexibilitat per triar l’estructura de peons.']
    ];

    function openingProfile(entry) {
        if (!entry || typeof entry.name !== 'string') return null;
        const profile = OPENING_PROFILES.find(row => row[0].test(entry.name));
        if (!profile) return null;
        const [, name, color, strength] = profile;
        return { name, color, strength };
    }

    function openingTalk(ctx, previous) {
        const c = ctx;
        const memory = { ...(previous || {}) };
        const reached = openingProfile(c.named);
        if (reached) memory.active = reached;
        const known = reached || memory.active;
        if (c.theory !== true && !reached) memory.active = null;
        const newVariant = reached && !c.prepared && c.ply >= 4 && memory.lastName !== reached.name;
        if (!c.canSpeak || (!newVariant && c.ply - (memory.lastPly ?? -10) < 3) || (memory.count || 0) >= 4) return { memory };
        const engineName = color => c.engines[color] === 'lozza' ? 'Lozza' : 'Stockfish';
        const side = color => color === 'w' ? 'les blanques' : 'les negres';
        let profile = null, question, solo;
        if (c.preparedComplete && !memory.prepared) {
            profile = openingProfile(c.seed);
            if (profile) {
                solo = 'La línia preparada ens porta a «' + profile.name + '».';
                question = solo + ' Què hi guanya el bàndol que la planteja?';
                memory.prepared = true;
                if (c.theory === true && !memory.active) memory.active = profile;
            }
        }
        if (!profile && !c.prepared && c.ply >= 4 && known) {
            const player = engineName(c.color);
            const pattern = player + ':' + known.name;
            if (newVariant || (c.theory === true && memory[pattern] !== 'theory')) {
                profile = known;
                solo = newVariant ? 'Amb la jugada de ' + player + ' arribem a «' + profile.name + '».'
                    : player + ' segueix el patró de «' + profile.name + '».';
                question = solo + ' Quin és el punt fort d’aquesta línia?';
                memory[pattern] = 'theory';
            } else if (c.theory === false && memory[pattern] !== 'outside' && memory.lastName === known.name) {
                memory[pattern] = 'outside';
                memory.lastPly = c.ply;
                memory.count = (memory.count || 0) + 1;
                solo = player + ' surt de la línia d’obertura recollida al repertori.';
                return { memory, turns: [
                    { role: 'presenter', text: solo + ' En quina obertura érem fins ara?', solo },
                    { role: 'analyst', text: 'Veníem de «' + known.name + '». ' + known.strength }
                ] };
            }
        }
        if (!profile) return { memory };
        memory.lastPly = c.ply;
        memory.lastName = profile.name;
        memory.count = (memory.count || 0) + 1;
        return { memory, turns: [
            { role: 'presenter', text: question, solo },
            { role: 'analyst', text: 'El recurs és per a ' + engineName(profile.color) + ', amb ' + side(profile.color) + '. ' + profile.strength }
        ] };
    }

    function scene(options){
        const o=options||{}, d=o.duel, seq=Number.isInteger(o.gameSeq)?o.gameSeq:1;
        if(!d) return 'Comença una partida amb Stockfish als dos bàndols. Lozza no participa en aquesta sessió.';
        const engine=d.engines||{};
        // El color de Stockfish és l'única dada garantida, mai no s'infereix
        // per l'ordre dels noms en la capçalera.
        const stockfishColor=engine.w==='stockfish'&&engine.b==='lozza'?'w':
            engine.b==='stockfish'&&engine.w==='lozza'?'b':null;
        if(!stockfishColor) return 'Stockfish i Lozza es preparen per començar una nova partida.';
        if (d.untilMate && o.mateAngle) {
            if (!d.rematch) return 'Primer duel de la parella. ' + COLORS[stockfishColor] + ' ' + o.mateAngle;
            const lead = {
                stockfish: 'Stockfish va guanyar la primera partida.',
                lozza: 'Lozza va guanyar la primera partida.',
                draw: 'La primera partida va acabar en taules.'
            }[d.firstResult] || '';
            return (lead ? lead + ' ' : '') + 'Revenja des de la mateixa posició amb els colors intercanviats. ' + COLORS[stockfishColor];
        }
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
    return Object.freeze({VERSION,OPENINGS,COLORS,STYLES,scene,openingTalk});
});
