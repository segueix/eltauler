// estratagemes.js — frases originals inspirades en «Les 36 estratagemes»,
// el recull xinès tradicional d'estratagemes militars.
// Com artdelaguerra.js, NO és cap detector d'escacs: només rep fets ja
// certificats per chess.js, Stockfish o una variant certificada, i cap text
// no és una citació literal ni d'una traducció concreta. Els títols dels
// estratagemes són els tradicionals, traduïts al català.
//
// Contracte (el mateix que l'Art de la Guerra):
// choose({ ply, gameId, comment: { kind, text, priority }, certified: true,
//          evidence: { source: 'rules'|'stockfish'|'certified-line',
//                      reliable: true, depth?: number },
//          urgent?: boolean, prepared?: boolean, terminal?: boolean }, memory)
// -> { maxim, memory, reason }. Els casos no elegibles retornen maxim:null i
// la memòria normalitzada. El programador de TV decideix SI s'emet.
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ElTaulerEstratagemes = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSION = '1.0.0';
    const BOOK_ID = 'estratagemes';
    const BOOK_LABEL = 'Les 36 estratagemes';
    const ATTRIBUTION = 'Frase original inspirada en «Les 36 estratagemes», no una citació';
    const MIN_GAP_PLIES = 7;        // màxim aproximat: 1 frase per 7 semijugades
    const STRATAGEM_GAP_PLIES = 12; // el mateix estratagema no torna de seguida
    const RECENT_IDS = 36;          // no repeteix literalment cap frase dins la partida
    const MIN_STOCKFISH_DEPTH = 10;

    // Estratagemes que s'hi adapten bé, amb el número tradicional i 4 frases
    // cadascun. Les frases són generals i condicionals: mai no diuen que hi
    // hagi una jugada forçada ni una victòria segura, i totes valen per a
    // cadascun dels motius verificats als quals l'estratagema està lligat.
    const STRATAGEMS = Object.freeze({
        mar: { n: 1, title: 'Travessar el mar sense que el cel ho vegi', texts: [
            '«Travessar el mar sense que el cel ho vegi»: les jugades tranquil·les sovint amaguen el camí més llarg.',
            'Qui avança sense fer soroll no regala informació al rival.',
            'Una maniobra discreta pot preparar el que una amenaça oberta només anunciaria.',
            'El vell estratagema xinès aconsella moure’s a la vista de tothom com si no passés res.'] },
        wei: { n: 2, title: 'Assetjar Wei per salvar Zhao', texts: [
            '«Assetjar Wei per salvar Zhao»: de vegades la millor defensa és amenaçar allà on l’altre no mira.',
            'Quan una plaça pateix, atacar-ne una altra del rival pot obligar-lo a recular.',
            'Respondre a una amenaça amb una altra amenaça canvia qui ha de fer els comptes.',
            'No sempre cal córrer cap al foc: també se’n pot encendre un a casa de l’enemic.'] },
        ganivet: { n: 3, title: 'Matar amb un ganivet manllevat', texts: [
            '«Matar amb un ganivet manllevat»: la peça que es mou obre el camí a una altra que no s’ha mogut.',
            'L’atac més difícil de veure és el de la peça que semblava quieta.',
            'Qui fa la feina amb les mans d’un altre no s’exposa ell mateix.',
            'Quan una peça s’aparta, la línia que deixa lliure pot ser més perillosa que la jugada mateixa.'] },
        descansat: { n: 4, title: 'Esperar descansat l’enemic cansat', texts: [
            '«Esperar descansat l’enemic cansat»: una posició ben protegida deixa que sigui l’altre qui s’esgoti.',
            'La paciència també és una arma quan la defensa és sòlida.',
            'Qui ho té tot protegit pot deixar que el rival gasti les forces.',
            'Defensar amb calma és obligar l’enemic a fer el pas següent.'] },
        casa: { n: 5, title: 'Saquejar la casa que crema', texts: [
            '«Saquejar la casa que crema»: quan el rival té problemes, és el moment d’aprofitar-ne el desordre.',
            'Una peça desprotegida és una porta oberta en una casa en flames.',
            'El desordre de l’enemic és una ocasió que no espera.',
            'Qui no aprofita la confusió de l’altre potser no tindrà una segona oportunitat.'] },
        soroll: { n: 6, title: 'Fer soroll a l’est i atacar a l’oest', texts: [
            '«Fer soroll a l’est i atacar a l’oest»: amenaçar dos punts alhora obliga a triar què se salva.',
            'Una sola peça que mira dos objectius val per dues.',
            'Si l’enemic no pot defensar-ho tot, haurà de decidir què deixa anar.',
            'L’estratagema no és enganyar amb el soroll, sinó obligar a mirar a dos llocs alhora.'] },
        nores: { n: 7, title: 'Crear alguna cosa del no-res', texts: [
            '«Crear alguna cosa del no-res»: d’una majoria de peons pot néixer un peó que cap peó rival no pot aturar.',
            'Un peó passat és un petit exèrcit que avança amb el camí lliure de peons.',
            'Allà on només hi havia peons, comença a dibuixar-se una amenaça per al futur.',
            'Les petites diferències d’un flanc poden créixer fins a decidir una partida.'] },
        chencang: { n: 8, title: 'Reparar el camí a la vista i passar d’amagat per Chencang', texts: [
            '«Reparar el camí a la vista i passar d’amagat per Chencang»: una columna oberta és una ruta que pot portar lluny.',
            'Les torres necessiten camins; quan en tenen un, el viatge pot començar.',
            'Ocupar una ruta abans que l’altre és guanyar temps per a més endavant.',
            'Qui controla la carretera decideix per on passaran les tropes.'] },
        riba: { n: 9, title: 'Mirar l’incendi des de l’altra riba', texts: [
            '«Mirar l’incendi des de l’altra riba»: no sempre convé ser el primer a resoldre la tensió.',
            'Quan els peons es troben, sol treure’n profit qui sap esperar el moment.',
            'Mantenir la tensió és deixar que l’altre decideixi primer.',
            'De vegades, la jugada més forta és la que no precipita res.'] },
        somriure: { n: 10, title: 'Amagar el ganivet darrere un somriure', texts: [
            '«Amagar el ganivet darrere un somriure»: una jugada d’aparença tranquil·la pot portar una amenaça.',
            'Les amenaces més perilloses són les que arriben sense fer soroll.',
            'Abans de respondre a una jugada, cal mirar què ataca.',
            'Una amenaça ben amagada obliga el rival a pensar més del que voldria.'] },
        prunera: { n: 11, title: 'Sacrificar la prunera per salvar el presseguer', texts: [
            '«Sacrificar la prunera per salvar el presseguer»: es dona una cosa petita per protegir-ne una de més valuosa.',
            'Cedir material només té sentit quan el que es guanya val més del que es perd.',
            'Un sacrifici és una inversió: es paga ara i es cobra després.',
            'L’arbre que es perd pot salvar l’hort sencer.'] },
        cabra: { n: 12, title: 'Endur-se la cabra que passa', texts: [
            '«Endur-se la cabra que passa»: el material que ningú no defensa no s’ha de deixar escapar.',
            'Una peça sense protecció és un regal que el tauler no sempre torna a oferir.',
            'Les petites ganàncies, sumades, també guanyen guerres.',
            'Qui recull el que l’altre abandona no necessita cap pla complicat.'] },
        serp: { n: 13, title: 'Picar l’herba per espantar la serp', texts: [
            '«Picar l’herba per espantar la serp»: un peó que ataca obliga la peça rival a moure’s i a mostrar-se.',
            'Un petit avanç pot fer recular una peça gran.',
            'Atacar amb el més petit és posar a prova el més gran.',
            'La peça que ha de fugir perd el temps que volia fer servir per atacar.'] },
        anima: { n: 14, title: 'Manllevar un cos per tornar l’ànima', texts: [
            '«Manllevar un cos per tornar l’ànima»: una peça que semblava adormida torna a la batalla.',
            'Una peça a casa no lluita; una peça activa, sí.',
            'Activar una peça oblidada és com rebre reforços sense demanar-los.',
            'Quan una peça troba un camí nou, tota la posició respira diferent.'] },
        tigre: { n: 15, title: 'Fer sortir el tigre de la muntanya', texts: [
            '«Fer sortir el tigre de la muntanya»: si el defensor s’allunya, la fortalesa queda descoberta.',
            'Treure una peça del seu lloc pot ser més útil que capturar-la.',
            'Un guardià distret no protegeix res.',
            'Abans d’atacar el castell, convé fer sortir qui el vigila.'] },
        deixaranar: { n: 16, title: 'Deixar anar per capturar després', texts: [
            '«Deixar anar per capturar després»: no cal tenir pressa per recuperar el que es pot recuperar.',
            'El que es dona amb un compte clar es recupera amb calma.',
            'Una captura no s’acaba fins que l’altre ha respost.',
            'En un canvi de peces, el que importa és com queda el tauler al final.'] },
        cap: { n: 18, title: 'Per vèncer la banda, captura el cap', texts: [
            '«Per vèncer la banda, captura el cap»: quan les peces apunten al rei, cada jugada del rival es fa més difícil.',
            'Un escac obliga a respondre; mentre el rei es defensa, la resta de l’exèrcit espera.',
            'L’atac al rei no busca peces: busca el cor de la posició.',
            'Qui fa tremolar el rei condiciona totes les decisions del rival.'] },
        llenya: { n: 19, title: 'Treure la llenya de sota l’olla', texts: [
            '«Treure la llenya de sota l’olla»: quan desapareix la peça que ho sostenia tot, el que en depenia queda a l’aire.',
            'No cal apagar el foc a cops: n’hi ha prou de treure-li la llenya.',
            'Una posició sovint depèn de poques peces; si en falta una, les altres queden soles.',
            'Eliminar la peça que fa de pilar és més eficaç que atacar-ne deu de petites.'] },
        aigua: { n: 20, title: 'Remenar l’aigua per pescar', texts: [
            '«Remenar l’aigua per pescar»: quan la posició es complica, qui veu més lluny en pot treure profit.',
            'En l’aigua tèrbola, les peces mal defensades són les primeres a caure.',
            'Les complicacions afavoreixen qui les ha preparat.',
            'Obrir la lluita és triar un terreny on el càlcul val més que la calma.'] },
        cigala: { n: 21, title: 'La cigala es desfà de la closca daurada', texts: [
            '«La cigala es desfà de la closca daurada»: una resposta a temps deixa l’enemic sense objectiu.',
            'Saber sortir d’un mal lloc també és saber jugar.',
            'Defensar-se bé és no deixar res al rival per endur-se.',
            'La millor resposta a una amenaça és la que no deixa cap ferida.'] },
        porta: { n: 22, title: 'Tancar la porta per atrapar el lladre', texts: [
            '«Tancar la porta per atrapar el lladre»: en els finals, el rei que barra el pas a l’altre guanya terreny.',
            'Quan els reis s’enfronten, sovint té l’avantatge qui no ha de moure.',
            'En els finals, cada casella que es nega al rei rival compta.',
            'Tancar el pas és, de vegades, més fort que atacar.'] },
        vei: { n: 23, title: 'Pactar amb el lluny i atacar el veí', texts: [
            '«Pactar amb el lluny i atacar el veí»: la pressió més eficaç és la que es concentra a prop.',
            'Les peces llunyanes donen suport; les properes fan la feina.',
            'Concentrar forces en un punt val més que escampar-les per tot el tauler.',
            'Qui pressiona la casella veïna prepara el terreny per a més endavant.'] },
        bigues: { n: 25, title: 'Canviar les bigues per fusta podrida', texts: [
            '«Canviar les bigues per fusta podrida»: els peons debilitats són bigues que poden cedir quan menys s’espera.',
            'Una estructura de peons tocada fa trontollar tot l’edifici.',
            'Les debilitats d’avui són els objectius de demà.',
            'Qui afebleix els fonaments del rival no necessita atacar el teulat.'] },
        escala: { n: 28, title: 'Treure l’escala quan l’enemic és al terrat', texts: [
            '«Treure l’escala quan l’enemic és al terrat»: una peça lligada a la seva línia ja no és lliure de fugir.',
            'Una peça que no es pot moure és com un soldat que s’ha quedat sense escala per baixar.',
            'Lligar una peça és deixar-la fora de joc mentre el lligam aguanta.',
            'Quan dues peces queden en la mateixa línia, una pot pagar per l’altra.'] },
        flors: { n: 29, title: 'Guarnir l’arbre amb flors falses', texts: [
            '«Guarnir l’arbre amb flors falses»: un exèrcit ben desplegat sembla més gran del que és.',
            'Les peces ben col·locades impressionen abans d’haver fet res.',
            'Un exèrcit desplegat fa dubtar l’enemic abans de la primera batalla.',
            'Cada peça que surt de casa és una flor més a l’arbre de l’exèrcit.'] },
        hoste: { n: 30, title: 'Que l’hoste passi a ser l’amfitrió', texts: [
            '«Que l’hoste passi a ser l’amfitrió»: la peça que esperava a casa ara surt a dictar el ritme.',
            'Una peça que entra en joc canvia el repartiment de forces.',
            'Les peces que esperaven ordres poden passar a donar-les.',
            'Prendre la iniciativa és canviar el paper de cadascú al tauler.'] }
    });

    // Motius verificats (tvCommentCandidates i patrons.js) → estratagemes que
    // hi encaixen. Un motiu desconegut no rep mai cap frase.
    const KIND_TO_STRATAGEMS = Object.freeze({
        center: ['vei', 'flors'], centerOccupation: ['flors'], centerControl: ['vei', 'flors'],
        development: ['mar', 'flors'], activation: ['anima', 'hoste'], diagonal: ['anima'],
        fork: ['soroll'], doubleAttack: ['soroll'], pin: ['escala'],
        'discovered-attack': ['ganivet'], 'remove-defender': ['tigre', 'llenya'], deflection: ['tigre'],
        'open-file': ['chencang'], openFile: ['chencang'], seventh: ['chencang'],
        'doubled-rooks': ['chencang'], doubledRooks: ['chencang'],
        pressure: ['vei'], 'king-pressure': ['cap'], check: ['cap'],
        threat: ['somriure'], 'threat-pawn': ['serp'],
        defend: ['descansat', 'cigala'], castle: ['descansat'], reply: ['cigala'],
        'tactic-reply': ['wei', 'aigua'], sacrifice: ['prunera'],
        recapture: ['deixaranar'], 'capture-recoverable': ['deixaranar'],
        'capture-free': ['cabra'], hanging: ['casa', 'cabra'], missed: ['casa'],
        'passed-new': ['nores'], majority: ['nores'],
        structure: ['bigues'], blocked: ['riba'], tension: ['riba', 'aigua'],
        opposition: ['porta'], 'king-activity': ['hoste'], 'queens-off': ['llenya']
    });

    // La frase només complementa un fet: no retarda cap urgència.
    const CRITICAL_KINDS = Object.freeze([
        'mate', 'end', 'missed-mate', 'allows-mate', 'mate-threat',
        'double-check', 'out-of-check', 'promotion', 'fork-check'
    ]);
    const CRITICAL = new Set(CRITICAL_KINDS);
    const VALID_SOURCES = new Set(['rules', 'stockfish', 'certified-line']);
    const has = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);

    const CATALOG = Object.freeze(Object.keys(STRATAGEMS).flatMap((id) =>
        STRATAGEMS[id].texts.map((text, i) => Object.freeze({
            id: id + '-' + (i + 1), stratagem: id, number: STRATAGEMS[id].n, title: STRATAGEMS[id].title,
            label: BOOK_LABEL, text, attribution: ATTRIBUTION
        }))
    ));
    const BY_STRATAGEM = Object.freeze(Object.fromEntries(Object.keys(STRATAGEMS).map(id =>
        [id, Object.freeze(CATALOG.filter(x => x.stratagem === id))])));
    const KNOWN_IDS = new Set(CATALOG.map(x => x.id));

    function initialMemory() {
        return { lastPly: -1000, lastByStratagem: {}, recentIds: [], count: 0 };
    }
    function normalizeMemory(raw) {
        const r = raw && typeof raw === 'object' ? raw : {};
        const lastByStratagem = {};
        for (const id of Object.keys(STRATAGEMS)) {
            if (r.lastByStratagem && Number.isInteger(r.lastByStratagem[id])) lastByStratagem[id] = r.lastByStratagem[id];
        }
        return {
            lastPly: Number.isInteger(r.lastPly) ? r.lastPly : -1000,
            lastByStratagem,
            recentIds: Array.isArray(r.recentIds) ? r.recentIds.filter(id => KNOWN_IDS.has(id)).slice(-RECENT_IDS) : [],
            count: Number.isInteger(r.count) && r.count >= 0 ? r.count : 0
        };
    }
    function stratagemsFor(kind) { return has(KIND_TO_STRATAGEMS, kind) ? KIND_TO_STRATAGEMS[kind].slice() : []; }

    function eligibility(ctx, memory) {
        const c = ctx && typeof ctx === 'object' ? ctx : {};
        const comment = c.comment || {};
        const evidence = c.evidence || {};
        const options = stratagemsFor(comment.kind);
        if (!c.certified || !options.length || typeof comment.text !== 'string' || !comment.text.trim()) return { reason: 'unverified', options: [] };
        if (!Number.isInteger(c.ply) || c.ply < 0) return { reason: 'invalid-ply', options };
        if (c.prepared || c.terminal || c.urgent || CRITICAL.has(comment.kind)
                || (Number.isFinite(comment.priority) && comment.priority >= 85)) return { reason: 'critical', options };
        if (evidence.reliable !== true || !VALID_SOURCES.has(evidence.source)) return { reason: 'no-evidence', options };
        if (evidence.source === 'stockfish' && (!Number.isFinite(evidence.depth) || evidence.depth < MIN_STOCKFISH_DEPTH))
            return { reason: 'shallow-analysis', options };
        // Un sacrifici només amb una variant completa prèviament certificada.
        if (comment.kind === 'sacrifice' && evidence.source !== 'certified-line') return { reason: 'sacrifice-not-certified', options };
        if (c.ply < memory.lastPly || c.ply - memory.lastPly < MIN_GAP_PLIES) return { reason: 'too-soon', options };
        const fresh = options.filter(id => !Number.isInteger(memory.lastByStratagem[id]) || c.ply - memory.lastByStratagem[id] >= STRATAGEM_GAP_PLIES);
        if (!fresh.length) return { reason: 'same-stratagem', options };
        return { reason: null, options: fresh };
    }

    function hash32(value) {
        let h = 2166136261;
        for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }
    function pick(options, ctx, memory) {
        const seed = hash32(String(ctx.gameId || 'partida') + ':' + ctx.ply + ':' + String(ctx.comment && ctx.comment.kind || ''));
        // L'estratagema menys recent dels que encaixen; en cas d'empat, l'atzar repetible.
        const ordered = options.slice().sort((a, b) => {
            const la = Number.isInteger(memory.lastByStratagem[a]) ? memory.lastByStratagem[a] : -1000;
            const lb = Number.isInteger(memory.lastByStratagem[b]) ? memory.lastByStratagem[b] : -1000;
            return la - lb || ((hash32(a + seed) % 97) - (hash32(b + seed) % 97));
        });
        const stratagem = ordered[0];
        const texts = BY_STRATAGEM[stratagem] || [];
        const fresh = texts.filter(x => !memory.recentIds.includes(x.id));
        const pool = fresh.length ? fresh : texts;
        return pool.length ? pool[seed % pool.length] : null;
    }

    // Funció PURA: mai no modifica ctx ni memory.
    function choose(ctx, rawMemory) {
        const memory = normalizeMemory(rawMemory);
        const check = eligibility(ctx, memory);
        if (check.reason) return { maxim: null, memory, reason: check.reason };
        const maxim = pick(check.options, ctx, memory);
        if (!maxim) return { maxim: null, memory, reason: 'no-template' };
        return { maxim, memory: {
            lastPly: ctx.ply,
            lastByStratagem: { ...memory.lastByStratagem, [maxim.stratagem]: ctx.ply },
            recentIds: memory.recentIds.concat(maxim.id).slice(-RECENT_IDS),
            count: memory.count + 1
        }, reason: null };
    }

    return Object.freeze({
        VERSION, BOOK_ID, BOOK_LABEL, ATTRIBUTION, MIN_GAP_PLIES, STRATAGEM_GAP_PLIES, MIN_STOCKFISH_DEPTH,
        STRATAGEMS, CATALOG, KIND_TO_STRATAGEMS, CRITICAL_KINDS,
        initialMemory, normalizeMemory, stratagemsFor, eligibility, choose
    });
});
