// artdelaguerra.js — màximes originals inspirades en la filosofia estratègica.
// Fase 1: biblioteca local i selector determinista. NO és un detector d'escacs.
// Només rep fets prèviament certificats per chess.js, Stockfish o una variant
// certificada. Cap text no és una citació atribuïda a Sunzi.
//
// Contracte d'integració futur:
// choose({ ply, gameId, comment: { kind, text, priority }, certified: true,
//          evidence: { source: 'rules'|'stockfish'|'certified-line',
//                      reliable: true, depth?: number },
//          urgent?: boolean, prepared?: boolean, terminal?: boolean }, memory)
// -> { maxim, memory, reason }. Els casos no elegibles retornen maxim:null i
// memòria inalterada (clonada). El programador de TV decideix SI s'emet.
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerArtDeLaGuerra = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSION = '1.0.0';
    const MIN_GAP_PLIES = 7;       // màxim aproximat: 1 màxima per 7 semijugades
    const FAMILY_GAP_PLIES = 12;   // evita repetir immediatament la mateixa metàfora
    const RECENT_IDS = 36;        // evita repetir literalment textos dins la partida
    const MIN_STOCKFISH_DEPTH = 10;
    const STYLES = Object.freeze(['sentencia', 'paradoxa', 'advertiment', 'imatge']);

    // Tots els textos són originals, generals i condicionals. Mai no diuen
    // que existeixi una jugada forçada, un pla ocult o una victòria inevitable.
    // Això només ho pot afirmar un comentari factual previ i verificat.
    const BANK = Object.freeze({
        territori: Object.freeze([
            "El territori valuós no és el més extens, sinó el que obre més camins.",
            "Dominar una cruïlla no és dominar la batalla; és poder decidir on continuar-la.",
            "Qui disputa el centre busca llibertat de moviment, no una corona anticipada.",
            "Un espai petit, ben defensat, pot ordenar un exèrcit sencer.",
            "El bon estrateg distingeix entre ocupar terreny i poder-lo conservar.",
            "Conquerir una plaça sense sortides pot convertir la victòria en presó.",
            "El centre no és un trofeu: és un lloc des d’on preparar decisions.",
            "No tots els camins neixen a la frontera; alguns comencen al cor del camp.",
            "Una plaça forta no té valor si les forces no saben utilitzar-la.",
            "Quan dues rutes es creuen, la disciplina pesa més que la pressa.",
            "Cap territori no és segur només perquè avui sigui nostre.",
            "L’espai que guanyes ha de donar feina a les peces, no només omplir el mapa.",
            "L’estratègia comença distingint allò que cal defensar d’allò que només es pot ocupar."
        ]),
        desplegament: Object.freeze([
            "Un exèrcit que arriba per separat perd la força de la seva unió.",
            "Preparar una peça és donar-li un camí abans de demanar-li una victòria.",
            "L’ordre del desplegament pot ser més important que la velocitat de la marxa.",
            "Qui envia totes les forces al mateix lloc deixa altres portes sense guarda.",
            "La millor preparació fa que diverses peces treballin sense estorbar-se.",
            "Una força immòbil no és inútil, però encara no ha complert el seu encàrrec.",
            "Abans de travessar el riu, comprova que els ponts siguin prou sòlids.",
            "No confonguis activitat amb agitació: moure's molt no sempre és avançar.",
            "Un bon desplegament deixa alternatives quan el primer pla ja no serveix.",
            "L’exèrcit prudent no exigeix a una sola peça la feina de totes.",
            "Una peça ben situada pot fer més que tres peces que competeixen pel mateix pas.",
            "La coordinació és una forma de força que no apareix a l’inventari.",
            "Com més clara és la tasca de cada peça, menys ordres cal improvisar."
        ]),
        dos_fronts: Object.freeze([
            "Dues portes en perill fan difícil defensar una sola muralla.",
            "Un adversari amb dues preguntes urgents pot no tenir temps per respondre-les totes.",
            "La força d’una amenaça doble és la tria difícil que imposa.",
            "Atacar en dos fronts no serveix si cap dels dos no és real.",
            "L’estratega no multiplica els cops: multiplica els problemes que cal resoldre.",
            "Quan les defenses es divideixen, cada resposta deixa un altre interrogant.",
            "Una maniobra precisa pot obligar un exèrcit a mirar en direccions oposades.",
            "És preferible una pregunta decisiva a dues amenaces sorolloses i buides.",
            "El millor atac doble neix d’una posició preparada, no d’un cop de sort.",
            "Fer triar l’adversari pot valer més que córrer darrere d’una presa.",
            "No hi ha dues victòries en un sol cop; hi ha dues obligacions de defensa.",
            "Si dues peces depenen de la mateixa resposta, el temps esdevé un recurs escàs.",
            "La pressió simultània només té sentit quan cada objectiu és autèntic."
        ]),
        lligams: Object.freeze([
            "L’exèrcit lligat a un sol deure perd llibertat per complir-ne d’altres.",
            "Una porta custodiada pot convertir-se en cadena per al seu guardià.",
            "No cal enderrocar una muralla per limitar-ne els defensors.",
            "Qui immobilitza una força no n’ha eliminat encara la resistència.",
            "La disciplina imposada des de fora sovint es confon amb quietud voluntària.",
            "Un defensor que protegeix massa coses pot acabar sense marge de maniobra.",
            "La línia recta també pot ser una trampa per a qui no veu què hi ha al darrere.",
            "Desviar un guardià pot obrir una porta sense tocar-ne el pany.",
            "La pressió útil redueix opcions abans de reclamar resultats.",
            "Una peça fermada a la defensa no pot acudir lliurement a qualsevol front.",
            "El camí més curt no sempre passa per la peça que sembla més exposada.",
            "Quan una força ha de quedar-se, les altres han d’aprendre a defensar soles.",
            "Trencar un lligam sense comprendre’l pot alliberar justament allò que volies retenir."
        ]),
        camins: Object.freeze([
            "Una ruta oberta és una promesa de pas, no una victòria escrita.",
            "Les torres necessiten camins tant com els exèrcits necessiten provisions.",
            "Dues forces al mateix corredor poden cooperar o fer-se nosa: decideix-ho abans.",
            "Un camí lliure pot portar cap a l’objectiu o cap a una emboscada.",
            "La profunditat d’una columna importa menys si ningú no pot entrar-hi.",
            "Una porta oberta demana primer reconeixement, després decisió.",
            "L’estratega valora el trajecte complet, no només el primer pas.",
            "Controlar una ruta és poder-ne impedir l’ús a l’altre, no recórrer-la cegament.",
            "El pas que sembla buit pot ser el centre de tota la resistència.",
            "Fer treballar juntes dues peces exigeix més que posar-les en fila.",
            "Una via de comunicació segura permet que la força arribi quan cal.",
            "Entrar en territori rival només té sentit si també existeix una retirada.",
            "Els camins oberts són eines; cal una finalitat perquè esdevinguin estratègia."
        ]),
        setge: Object.freeze([
            "Un setge es construeix limitant sortides abans de buscar una entrada.",
            "La pressió útil fa que cada defensa costi temps i llibertat.",
            "Una fortalesa no cau perquè sigui envoltada, sinó perquè ja no pot respondre.",
            "Insistir en una porta tancada pot deixar invisible una altra ruta.",
            "L’estratega prudent confon tan poc la pressió amb la victòria com el soroll amb la força.",
            "Una amenaça és més valuosa quan obliga a canviar el pla.",
            "Assetjar sense calcular el retorn pot esgotar abans l’atacant.",
            "La paciència és una arma quan cada moviment estreny una opció real.",
            "No tot cercle és una xarxa: comprova sempre per on es pot escapar.",
            "La força d’un atac també depèn de les peces que encara no hi participen.",
            "Un castell amb molts murs pot tenir un únic punt que mereixi atenció.",
            "Quan la pressió no progressa, cal revisar el pla, no apujar el to.",
            "Un bon setge transforma la iniciativa en decisions difícils per al defensor."
        ]),
        defensa: Object.freeze([
            "La defensa més sòlida és la que encara permet escollir el demà.",
            "Protegir el rei no és abandonar el tauler, sinó ordenar les prioritats.",
            "Una muralla sense sortides pot protegir avui i empresonar demà.",
            "No tota retirada és una derrota; de vegades recupera el terreny de la decisió.",
            "Qui guarda les forces conserva la possibilitat de respondre.",
            "El coratge sense prudència obre portes que l’enemic no havia trobat.",
            "La defensa eficaç pensa també en la jugada que vindrà després.",
            "El refugi més segur és aquell que no aïlla els seus defensors.",
            "Un pas enrere pot fer que una amenaça perdi la seva raó de ser.",
            "Resistir no vol dir esperar immòbil que l’altre decideixi.",
            "La bona protecció preserva peces, temps i opcions alhora.",
            "És més savi tancar una esquerda que elogiar la solidesa de la paret.",
            "Un escut ben orientat pot convertir una urgència en una nova oportunitat."
        ]),
        cessio: Object.freeze([
            "No es cedeix una força per bellesa, sinó per allò que el canvi permet obtenir.",
            "El cost visible no explica tot el valor d’una decisió.",
            "Un sacrifici sense continuació és una pèrdua amb un nom solemne.",
            "L’estratega compta els recursos que entrega i els camins que obre.",
            "Cedir terreny pot ser prudent; cedir-lo sense objectiu és diferent.",
            "Una concessió útil exigeix proves, no només esperança.",
            "No confonguis generositat amb càlcul: al tauler cada renúncia té un preu.",
            "La força que marxa ha de deixar alguna cosa més que un buit.",
            "El pla és sòlid quan sobreviu a la millor resposta rival.",
            "Allò que sembla un regal pot amagar una exigència; comprova-la abans de celebrar res.",
            "Una renúncia calculada no necessita espectacularitat per ser profunda.",
            "L’atac que costa material també ha de poder justificar-ne el retorn.",
            "Els grans canvis es valoren per la posició que deixen, no pel soroll que fan."
        ]),
        peons: Object.freeze([
            "Un soldat modest pot arribar lluny quan el camí és lliure.",
            "Avançar no és triomfar: cada pas també canvia allò que queda enrere.",
            "El peó que camina sol necessita una ruta, no una llegenda.",
            "Qui menysté les forces petites pot descobrir massa tard la seva persistència.",
            "Una marxa llarga es guanya amb passos que encara es poden sostenir.",
            "El valor d’un avanç depèn també de qui pot impedir el següent.",
            "No tots els peons són iguals quan el camp comença a buidar-se.",
            "El soldat que progressa canvia les obligacions dels dos exèrcits.",
            "Una ruta oberta exigeix vigilància fins al darrer pas.",
            "La força d’un peó sovint és el temps que obliga l’altre a dedicar-li.",
            "Prometre una coronació no és el mateix que poder assolir-la.",
            "Els petits avanços creen grans decisions només si tenen continuació.",
            "Quan el final s’acosta, els camins dels peons esdevenen una altra mena de mapa."
        ]),
        estructura: Object.freeze([
            "La forma de l’exèrcit determina quins camins són possibles.",
            "Una cadena aguanta segons els seus lligams, no segons la lluentor del primer.",
            "Cada avanç deixa una casella enrere i una responsabilitat nova.",
            "La solidesa no consisteix a no tenir esquerdes, sinó a saber on són.",
            "Un obstacle pot protegir un bàndol i limitar-lo alhora.",
            "No trencar una tensió també és una decisió, però cal saber per què.",
            "Una muralla de peons no és un refugi si impedeix moure les pròpies forces.",
            "La pressió sobre una peça pot començar molt lluny de la seva casella.",
            "L’estructura és la memòria dels passos que ja no es poden desfer.",
            "Un camí tancat pot preparar l’obertura d’un altre.",
            "Els avantatges duradors acostumen a demanar manteniment discret.",
            "Un bon pla respecta els espais que la posició permet, no els que imaginem.",
            "La tensió ben gestionada guarda opcions; la precipitació les consumeix."
        ]),
        final: Object.freeze([
            "Quan el camp es buida, cada pas pesa més.",
            "La paciència dels finals no és lentitud: és precisió.",
            "Un rei actiu pot deixar de ser només una peça a protegir.",
            "La distància més curta fins a l’objectiu no sempre és el millor camí.",
            "Al final, una casella pot valer més que un gran discurs.",
            "La força escassa exigeix una coordinació encara més exacta.",
            "Qui arriba abans no sempre guanya; importa en quin torn hi arriba.",
            "La senzillesa del camp deixa al descobert qualsevol càlcul imprecís.",
            "Quan queden poques forces, l’ordre dels moviments esdevé essencial.",
            "Un petit avantatge no treballa sol: cal saber convertir-lo.",
            "La calma del final és enganyosa per a qui deixa de comptar.",
            "Una ruta correcta no admet dreceres només perquè sembli fàcil.",
            "L’estratega del final escolta el temps, les distàncies i les caselles."
        ]),
        decisions: Object.freeze([
            "L’error més costós sovint és respondre a una pregunta que ningú no ha fet.",
            "Abans de prendre una peça, pregunta què queda desprotegit.",
            "Qui només veu el premi pot oblidar el preu.",
            "Una ocasió perduda no autoritza una promesa de victòria.",
            "El càlcul que ignora la millor resposta rival encara no és un càlcul complet.",
            "Cada decisió obre possibilitats i en tanca d’altres.",
            "El bon estrateg distingeix entre una oportunitat i una obligació.",
            "Una resposta òbvia pot ser només la primera capa del problema.",
            "Quan una jugada sembla gratuïta, és el moment de revisar-ne les conseqüències.",
            "La prudència pregunta què pot fer l’altre, no què desitgem que faci.",
            "No hi ha avantatge segur en una variant que encara no s’ha comprovat.",
            "La jugada vistosa no necessita admiració; necessita verificació.",
            "La pressa escurça el pensament abans d’escurçar la partida."
        ])
    });

    const LABELS = Object.freeze({
        territori: 'Domini del territori',
        desplegament: 'Coordinació de forces',
        dos_fronts: 'Atac en dos fronts',
        lligams: 'Restricció i desviació',
        camins: 'Columnes i rutes obertes',
        setge: 'Pressió i assetjament',
        defensa: 'Defensa i prudència',
        cessio: 'Cessió i sacrifici',
        peons: 'Avanç i coronació',
        estructura: 'Estructura i tensió',
        final: 'Precisió dels finals',
        decisions: 'Decisions i oportunitats'
    });

    // IDs efectius de tvCommentCandidates i de patrons.js. La relació és
    // conservadora: un motiu desconegut no rep mai una màxima.
    const KIND_TO_FAMILY = Object.freeze({
        center: 'territori', centerOccupation: 'territori', centerControl: 'territori',
        development: 'desplegament', activation: 'desplegament', diagonal: 'desplegament',
        fork: 'dos_fronts', 'fork-check': 'dos_fronts', doubleAttack: 'dos_fronts',
        pin: 'lligams', skewer: 'lligams', 'remove-defender': 'lligams',
        'discovered-attack': 'lligams', deflection: 'lligams', interference: 'lligams',
        'open-file': 'camins', 'doubled-rooks': 'camins', seventh: 'camins',
        openFile: 'camins', doubledRooks: 'camins',
        pressure: 'setge', 'king-pressure': 'setge', threat: 'setge', 'threat-pawn': 'setge',
        defend: 'defensa', castle: 'defensa', reply: 'defensa', 'out-of-check': 'defensa',
        sacrifice: 'cessio',
        'passed-new': 'peons', 'passed-advance': 'peons', passedPawn: 'peons',
        majority: 'peons', promotion: 'peons',
        structure: 'estructura', blocked: 'estructura', tension: 'estructura',
        endgame: 'final', opposition: 'final', 'king-activity': 'final', 'queens-off': 'final',
        missed: 'decisions', hanging: 'decisions', material: 'decisions',
        'capture-free': 'decisions', 'only-move': 'decisions'
    });

    // La màxima només complementa un fet; no retarda l'avís de mat,
    // abandonament, promoció o cap altra urgència excepcional.
    const CRITICAL_KINDS = Object.freeze([
        'mate', 'end', 'missed-mate', 'allows-mate', 'mate-threat',
        'double-check', 'out-of-check', 'promotion', 'fork-check'
    ]);
    const CRITICAL = new Set(CRITICAL_KINDS);
    const VALID_SOURCES = new Set(['rules', 'stockfish', 'certified-line']);
    const CATALOG = Object.freeze(Object.keys(BANK).flatMap((family) =>
        BANK[family].map((text, i) => Object.freeze({
            id: family + '-' + String(i + 1).padStart(2, '0'),
            family, label: LABELS[family],
            register: STYLES[i % STYLES.length],
            text, attribution: 'Màxima original inspirada en la filosofia de Sunzi'
        }))
    ));
    const BY_FAMILY = Object.freeze(Object.fromEntries(Object.keys(BANK).map(family =>
        [family, Object.freeze(CATALOG.filter(x => x.family === family))])));
    const KNOWN_IDS = new Set(CATALOG.map(x => x.id));

    function initialMemory() {
        return { lastPly: -1000, lastFamily: null, lastByFamily: {}, recentIds: [], count: 0 };
    }
    function normalizeMemory(raw) {
        const r = raw && typeof raw === 'object' ? raw : {};
        const lastByFamily = {};
        for (const f of Object.keys(BANK)) {
            if (Number.isInteger(r.lastByFamily && r.lastByFamily[f]))
                lastByFamily[f] = r.lastByFamily[f];
        }
        return {
            lastPly: Number.isInteger(r.lastPly) ? r.lastPly : -1000,
            lastFamily: Object.prototype.hasOwnProperty.call(BANK, r.lastFamily) ? r.lastFamily : null,
            lastByFamily,
            recentIds: Array.isArray(r.recentIds) ? r.recentIds.filter(id => KNOWN_IDS.has(id)).slice(-RECENT_IDS) : [],
            count: Number.isInteger(r.count) && r.count >= 0 ? r.count : 0
        };
    }

    function familyFor(kind) {
        return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(KIND_TO_FAMILY, kind)
            ? KIND_TO_FAMILY[kind] : null;
    }
    function eligibility(ctx, memory) {
        const c = ctx && typeof ctx === 'object' ? ctx : {};
        const comment = c.comment || {};
        const evidence = c.evidence || {};
        const family = familyFor(comment.kind);
        if (!c.certified || !family || typeof comment.text !== 'string' || !comment.text.trim()) return { reason: 'unverified', family: null };
        if (!Number.isInteger(c.ply) || c.ply < 0) return { reason: 'invalid-ply', family };
        if (c.prepared || c.terminal || c.urgent || CRITICAL.has(comment.kind)
                || (Number.isFinite(comment.priority) && comment.priority >= 85))
            return { reason: 'critical', family };
        if (evidence.reliable !== true || !VALID_SOURCES.has(evidence.source))
            return { reason: 'no-evidence', family };
        if (evidence.source === 'stockfish' && (!Number.isFinite(evidence.depth) ||
                evidence.depth < MIN_STOCKFISH_DEPTH))
            return { reason: 'shallow-analysis', family };
        // No n'hi ha prou amb una peça aparentment lliurada. Només una
        // variant completa, prèviament certificada, permet la família cessió.
        if (family === 'cessio' && evidence.source !== 'certified-line')
            return { reason: 'sacrifice-not-certified', family };
        if (c.ply < memory.lastPly || c.ply - memory.lastPly < MIN_GAP_PLIES)
            return { reason: 'too-soon', family };
        const lastFamilyPly = memory.lastByFamily[family];
        if (Number.isInteger(lastFamilyPly) && c.ply - lastFamilyPly < FAMILY_GAP_PLIES)
            return { reason: 'same-family', family };
        return { reason: null, family };
    }

    function hash32(value) {
        let h = 2166136261;
        for (let i = 0; i < value.length; i++) {
            h ^= value.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }
    function pick(family, ctx, memory) {
        const options = BY_FAMILY[family] || [];
        if (!options.length) return null;
        const seed = hash32(String(ctx.gameId || 'partida') + ':' + ctx.ply + ':' +
            family + ':' + String(ctx.comment && ctx.comment.kind || ''));
        const fresh = options.filter(x => !memory.recentIds.includes(x.id));
        const pool = fresh.length ? fresh : options; // rotació si la partida és molt llarga
        return pool[seed % pool.length];
    }

    // Funció PURA: mai no modifica ctx, comment, evidence ni memory.
    function choose(ctx, rawMemory) {
        const memory = normalizeMemory(rawMemory);
        const check = eligibility(ctx, memory);
        if (check.reason) return { maxim: null, memory, reason: check.reason };
        const maxim = pick(check.family, ctx, memory);
        if (!maxim) return { maxim: null, memory, reason: 'no-template' };
        const next = {
            lastPly: ctx.ply,
            lastFamily: check.family,
            lastByFamily: { ...memory.lastByFamily, [check.family]: ctx.ply },
            recentIds: memory.recentIds.concat(maxim.id).slice(-RECENT_IDS),
            count: memory.count + 1
        };
        return { maxim, memory: next, reason: null };
    }

    return Object.freeze({
        VERSION, MIN_GAP_PLIES, FAMILY_GAP_PLIES, MIN_STOCKFISH_DEPTH,
        CATALOG, BANK, LABELS, KIND_TO_FAMILY, CRITICAL_KINDS,
        initialMemory, normalizeMemory, familyFor, eligibility, choose
    });
});
