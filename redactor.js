// ============================================================================
// redactor.js — Redactor i corrector normatiu del català de l'entrenador
// ============================================================================
// Tot el text que llegeix l'alumne (diagnòstic longitudinal, resums
// post-partida, notes d'errors, plans) passa per aquí. Tres capes:
//
//   1) corregirCatala(text): esmenes deterministes i SEGURES sobre errors
//      que la generació (OpenAI o plantilles) produeix de manera recurrent:
//      castellanismes ("tens que", "per a que"), subjuntiu usat com a present
//      ("cometis" → "comets"), participi usat com a imperatiu ("practicat
//      finals" → "practica finals"), règims verbals ("exerceix posicions" →
//      "exercita't amb posicions"), terminologia ("migjoc" → "mig joc"),
//      concordances ("el dama" → "la dama") i tipografia. Cada regla porta
//      guardes perquè no toqui usos correctes ("no cometis", "has practicat").
//
//   2) auditarCatala(text, opcions): detecta el que NO es pot corregir a
//      cegues i que faria el text imprecís o poc fiable: xifres que no surten
//      de les dades de la partida, percentatges sense símbol %, notació SAN
//      quan és prohibida, residus de JSON/markdown, etiquetes amb majúscula
//      enmig de frase. Si l'auditoria falla, l'app descarta el text extern i
//      es queda amb la redacció local, que sempre és correcta.
//
//   3) redactarDiagnostic(fets, llavor): redacta en local el diagnòstic
//      longitudinal de l'entrenador a partir dels fets calculats per l'app,
//      amb variació determinista (mateixa llavor → mateix text) i fidelitat
//      total a les xifres. Funciona sense cap clau d'API.
//
// Sense lookbehind ni sintaxi regex moderna: compatible amb navegadors vells.
// Es carrega com core.js:
//   - Navegador: <script src="redactor.js"> → window.ElTaulerRedactor
//   - Node/Jest: require('./redactor') → module.exports
// ============================================================================
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.ElTaulerRedactor = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ----------------------------------------------------------------------
    // Utilitats
    // ----------------------------------------------------------------------

    // Manté la majúscula inicial de la paraula substituïda ("Cometis" → "Comets").
    function conservaMajuscula(original, substitut) {
        if (!original || !substitut) return substitut;
        const inicial = original.charAt(0);
        if (inicial === inicial.toUpperCase() && inicial !== inicial.toLowerCase()) {
            return substitut.charAt(0).toUpperCase() + substitut.slice(1);
        }
        return substitut;
    }

    function minusculaInicial(text) {
        const s = String(text || '');
        return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
    }

    // ['a', 'b', 'c'] → 'a, b i c' (enumeració natural en català).
    function llistaEnCatala(parts) {
        const nets = (parts || []).filter(Boolean);
        if (!nets.length) return '';
        if (nets.length === 1) return nets[0];
        return nets.slice(0, -1).join(', ') + ' i ' + nets[nets.length - 1];
    }

    function plural(n, singular, pluralForm) {
        return n === 1 ? singular : pluralForm;
    }

    // ----------------------------------------------------------------------
    // Capa 1 — Correcció normativa determinista
    // ----------------------------------------------------------------------

    // Substitucions directes: castellanismes i formes proscrites que un model
    // de llengua (o una plantilla mal escrita) deixa anar sovint. Totes són
    // segures: la forma esquerra no és mai correcta en aquest context.
    const SUBSTITUCIONS_DIRECTES = [
        [/\bper a que\b/gi, 'perquè'],
        [/\btenir que\b/gi, 'haver de'],
        [/\btinc que\b/gi, 'he de'],
        [/\btens que\b/gi, 'has de'],
        [/\bté que\b/gi, 'ha de'],
        [/\btenim que\b/gi, 'hem de'],
        [/\bteniu que\b/gi, 'heu de'],
        [/\btenen que\b/gi, 'han de'],
        [/\bhi han\b/gi, 'hi ha'],
        [/\bdegut a que\b/gi, 'perquè'],
        [/\bdonat que\b/gi, 'com que'],
        [/\ben quant a\b/gi, 'quant a'],
        [/\balgo\b/gi, 'alguna cosa'],
        [/\binclús\b/gi, 'fins i tot'],
        [/\btablas\b/gi, 'taules'],
        [/\bel més aviat possible\b/gi, 'com més aviat millor'],
        [/\bvàries(?=\s+(?:partides|errades|jugades|posicions|vegades|coses|fases|opcions|obertures)\b)/gi, 'diverses'],
        [/\bvaris(?=\s+(?:errors|temes|moments|exercicis|plans|finals|atacs)\b)/gi, 'diversos'],
        // "i/o" no és normatiu; en aquests textos "o" ja és inclusiu.
        [/\bi\/o\b/gi, 'o'],
        // Contraccions obligatòries.
        [/\bde el\b/g, 'del'], [/\bDe el\b/g, 'Del'],
        [/\ba el\b/g, 'al'], [/\bA el\b/g, 'Al'],
        [/\bper el\b/g, 'pel'], [/\bPer el\b/g, 'Pel'],
        [/\bde els\b/g, 'dels'], [/\bDe els\b/g, 'Dels'],
        [/\ba els\b/g, 'als'], [/\bA els\b/g, 'Als'],
        [/\bper els\b/g, 'pels'], [/\bPer els\b/g, 'Pels'],
        // Terminologia d'escacs: la forma normativa és "mig joc".
        [/\bmigjoc\b/gi, 'mig joc'],
        [/\bmigjocs\b/gi, 'migs jocs']
    ];

    // Apostrofació segura davant de vocal (lèxic tancat del domini, per no
    // tocar casos dubtosos).
    const APOSTROFACIONS = [
        [/\bla (errada|obertura|estructura|activitat|amenaça|anàlisi|estratègia|iniciativa|ala)\b/gi, "l'$1"],
        [/\bel (escac|atac|error|enroc|avantatge|alfil|objectiu|exercici)\b/gi, "l'$1"],
        [/\bde (errades?|errors?|escacs?|obertures?|atacs?|iniciativa|avantatge|entrenament|exercicis?|OpenAI)\b/gi, "d'$1"]
    ];

    // Concordança de gènere amb els noms femenins del tauler.
    const NOMS_FEMENINS = 'dama|torre|peça|columna|fila|diagonal|casella|clavada|forquilla|jugada|partida|errada';
    const DETERMINANT_FEMENI = { el: 'la', un: 'una', aquest: 'aquesta', aquell: 'aquella' };

    // Subjuntiu present usat (malament) com a indicatiu: "cometis la majoria
    // d'errors" → "comets". Només es corregeix si la paraula anterior NO és
    // una partícula que justifiqui el subjuntiu (que, quan, no...).
    const SUBJUNTIU_PER_INDICATIU = {
        cometis: 'comets', prioritzis: 'prioritzes', treballis: 'treballes',
        milloris: 'millores', revisis: 'revises', oblidis: 'oblides',
        juguis: 'jugues', perdis: 'perds', guanyis: 'guanyes',
        repeteixis: 'repeteixes', aprenguis: 'aprens',
        converteixis: 'converteixes', aconsegueixis: 'aconsegueixes',
        defensis: 'defenses', ataquis: 'ataques', calculis: 'calcules'
    };
    // Partícules que justifiquen el subjuntiu, més clítics i conjuncions:
    // davant d'un pronom feble ("no els oblidis") o d'una conjunció ("treballis
    // i milloris") no es toca res, perquè el context real pot quedar més enrere.
    const DISPARADORS_SUBJUNTIU = /^(que|què|quan|si|no|ni|perquè|potser|mentre|on|com|sense|abans|tant|prou|encara|mai|i|o|el|els|la|les|em|et|es|ho|hi|en|li|ens|us|te|se)$/i;
    const RE_SUBJUNTIU = new RegExp(
        "(^|[^\\wàèéíòóúïüç'’])([\\wàèéíòóúïüç'’]+[ \\t]+)?(" +
        Object.keys(SUBJUNTIU_PER_INDICATIU).join('|') + ')\\b', 'gi'
    );

    // Participi usat (malament) com a imperatiu dins d'una sèrie de consells:
    // "treballa tàctiques, practicat finals" → "practica finals". Només si va
    // seguit d'un objecte clar i NO el precedeix cap auxiliar de perfet.
    const PARTICIPI_PER_IMPERATIU = {
        practicat: 'practica', treballat: 'treballa', entrenat: 'entrena',
        revisat: 'revisa', repassat: 'repassa', estudiat: 'estudia'
    };
    // Si el mot anterior és un auxiliar de perfet, un adverbi de grau, una
    // conjunció ("has treballat i practicat") o "cop/vegada" ("un cop revisat
    // el pla"), el participi és legítim i no es toca. Els clítics aglutinats
    // ("l'he") es despullen abans de comprovar la llista.
    const AUXILIARS_PERFET = /^(he|has|ha|hem|heu|han|havia|havies|havíem|havíeu|havien|hagi|hagis|hàgim|hàgiu|hagin|hauré|hauràs|haurà|haurem|haureu|hauran|hauria|hauries|hauríem|hauríeu|haurien|haver|d'haver|d’haver|és|era|està|estàs|estan|estat|sigui|ser|ben|molt|poc|gens|ja|prou|i|o|ni|cop|vegada|tot|més)$/i;
    const OBJECTES_IMPERATIU = "el|els|la|les|l['’][\\wàèéíòóúïüç]+|un|una|uns|unes|aquest|aquesta|aquests|aquestes|cada|més|dues|dos|tres|finals?|tàctiques?|posicions?|exercicis?|errades?|errors?|escacs|obertures?|mats?|jugades?|partides?|combinacions?|clavades?|forquilles?";
    const RE_PARTICIPI = new RegExp(
        "(^|[^\\wàèéíòóúïüç'’])([\\wàèéíòóúïüç'’]+[ \\t]+)?(" +
        Object.keys(PARTICIPI_PER_IMPERATIU).join('|') +
        ')([ \\t]+)((?:' + OBJECTES_IMPERATIU + ')\\b)', 'gi'
    );

    // Normalitza el mot anterior d'una coincidència: treu el clític aglutinat
    // ("l'he" → "he") perquè les llistes de guarda el reconeguin.
    function motAnterior(previ) {
        return (previ || '').trim().toLowerCase().replace(/^[lmnst]['’]/, '');
    }

    // Règims verbals: "exercir/exercitar" no admeten aquest objecte directe.
    const RE_EXERCEIX = /\bexerceix\s+(?=(?:posicions|finals|tàctiques|exercicis|atacs|jugades|combinacions)\b)/gi;
    const RE_EXERCIR = /\bexercir\s+(?=(?:posicions|finals|tàctiques|exercicis|atacs|jugades|combinacions)\b)/gi;

    // Termes de la interfície que un model copia amb majúscula enmig de frase
    // ("...més nombrosos en Finals, Atacs i Tàctica"). En minúscula llegeixen
    // com a prosa normal.
    const TERMES_INTERFICIE = '(?:Finals?|Atacs?|Tàctiques|Tàctica|Obertures?|Clavades?|Forquilles?|Errades?|Errors?|Precisió|Material|Centre|Seguretat|Mig joc|Raigs? X|Migjoc)';
    const RE_TERME_ENMIG = new RegExp('([a-zàèéíòóúïüç0-9%,):][ \\t])(' + TERMES_INTERFICIE + ')\\b', 'g');

    function corregeixLinia(linia) {
        let out = String(linia);
        // Tipografia bàsica (dins de la línia; els salts de línia es conserven fora).
        out = out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,.;:!?])/g, '$1');
        // Decimals amb coma (sense tocar milers com "1.000" ni jugades "23.d4").
        out = out.replace(/(\d)\.(\d)(?!\d)/g, '$1,$2');
        // Barra entre paraules → conjunció ("tàctica/guany" → "tàctica i guany").
        out = out.replace(/([a-zàèéíòóúïüç]{2,})\s*\/\s*([a-zàèéíòóúïüç]{2,})/gi, '$1 i $2');
        SUBSTITUCIONS_DIRECTES.forEach(([re, repl]) => {
            out = out.replace(re, m => conservaMajuscula(m, repl));
        });
        // Primer el gènere ("el errada" → "la errada") i després l'apòstrof
        // ("la errada" → "l'errada"), perquè una cosa alimenta l'altra.
        out = out.replace(
            new RegExp('\\b(el|un|aquest|aquell)\\s+(' + NOMS_FEMENINS + ')\\b', 'gi'),
            (m, det, nom) => conservaMajuscula(det, DETERMINANT_FEMENI[det.toLowerCase()] || det) + ' ' + nom
        );
        APOSTROFACIONS.forEach(([re, repl]) => {
            out = out.replace(re, (m, nom) => conservaMajuscula(m, repl.replace('$1', nom)));
        });
        out = out.replace(RE_SUBJUNTIU, (tot, pre, previ, verb) => {
            const anterior = motAnterior(previ);
            if (anterior && DISPARADORS_SUBJUNTIU.test(anterior)) return tot;
            return pre + (previ || '') + conservaMajuscula(verb, SUBJUNTIU_PER_INDICATIU[verb.toLowerCase()]);
        });
        out = out.replace(RE_PARTICIPI, (tot, pre, previ, verb, espai, objecte) => {
            const anterior = motAnterior(previ);
            if (anterior && AUXILIARS_PERFET.test(anterior)) return tot;
            return pre + (previ || '') + conservaMajuscula(verb, PARTICIPI_PER_IMPERATIU[verb.toLowerCase()]) + espai + objecte;
        });
        out = out.replace(RE_EXERCEIX, "exercita't amb ");
        out = out.replace(RE_EXERCIR, 'exercitar-se amb ');
        out = out.replace(RE_TERME_ENMIG, (tot, pre, terme) => pre + minusculaInicial(terme));
        return out;
    }

    // Corrector principal. Conserva l'estructura de línies (els plans i les
    // notes multilínia no es poden aixafar en un sol paràgraf).
    function corregirCatala(text) {
        return String(text == null ? '' : text).split('\n').map(corregeixLinia).join('\n');
    }

    // Afegeix el símbol % als valors de precisió escrits entre parèntesis
    // sense unitat: "(80)" → "(80%)". Només toca valors coneguts com a
    // percentatges; la resta de casos els resol l'auditoria.
    function forcarPercentatges(text, valors) {
        const permesos = new Set((valors || []).map(Number).filter(v => isFinite(v)));
        if (!permesos.size) return String(text == null ? '' : text);
        return String(text).replace(/\((\d{1,3})\)/g, (tot, num) =>
            permesos.has(Number(num)) ? '(' + num + '%)' : tot
        );
    }

    // ----------------------------------------------------------------------
    // Capa 2 — Auditoria: el que no es pot corregir, es detecta i es rebutja
    // ----------------------------------------------------------------------

    // Formes que, si sobreviuen a la correcció, indiquen que el text no és fiable.
    const FORMES_PROSCRITES = [
        /\bper a que\b/i, /\bten(?:ir|s|en|im|iu)\s+que\b/i, /\bhi han\b/i,
        /\bmigjocs?\b/i, /\bel\s+dama\b/i, /\bel\s+torre\b/i,
        /\bexerceix\s+(?:posicions|finals|tàctiques|exercicis)\b/i,
        /\balgo\b/i, /\binclús\b/i, /\bdegut a que\b/i
    ];

    // Notació SAN (amb inicials angleses o catalanes de peça): prohibida quan
    // el text ha d'anomenar les jugades de manera descriptiva.
    const RE_SAN = /\b[KQRBNTACD][a-h]?[1-8]?x[a-h][1-8][+#]?\b|\b[KQRBN][a-h][1-8][+#]?\b|\bO-O(?:-O)?\b|=[QRBNTACD]\b/;

    // Text inacabat: frases tallades que no s'han de mostrar mai a l'alumne.
    // Es detecten els punts suspensius finals ("en lloc de…", "i la dama...")
    // i els finals en connector o determinant ("i el", "la columna", "amb"),
    // que delaten un tall a mitja frase.
    const RE_PUNTS_SUSPENSIUS_FINAL = /(\.\.\.|…)["'”’)\]]*$/;
    const CONNECTORS_FINALS = [
        // Conjuncions i preposicions que mai tanquen una frase.
        /(^|\s)(i|o|ni|però|perquè|que|com|amb|per|de|del|dels|a|al|als|en|sense|entre|contra|sobre|sota|davant|darrere|cap a|fins a|des de)$/i,
        // Determinants i articles penjats ("i la", "el seu", "aquesta").
        /(^|\s)(el|la|els|les|un|una|uns|unes|aquest|aquesta|aquests|aquestes|seu|seva|seus|seves|cada|cap)$/i,
        /l['’]$/i,
        // Locucions típiques dels talls de l'entrenador.
        /\ben lloc de$/i,
        /\bla columna$/i,
        /\bla fila$/i,
        /\bla diagonal$/i
    ];
    function esTextIncomplet(text) {
        const brut = String(text == null ? '' : text).trim();
        if (!brut) return false;
        if (RE_PUNTS_SUSPENSIUS_FINAL.test(brut)) return true;
        // Un final en coma, dos punts o guionet deixa la frase penjada.
        if (/[,;:–—-]$/.test(brut)) return true;
        // Amb puntuació final la frase és completa ("obre la columna." és
        // vàlid); els connectors només delaten un tall quan no n'hi ha.
        if (/[.!?]["'”’)\]]*$/.test(brut)) return false;
        const senseCometes = brut.replace(/["'”’)\]]+$/, '').trim();
        return CONNECTORS_FINALS.some(re => re.test(senseCometes));
    }

    // Escurça un text SENSE deixar mai una frase a mitges: talla per frases
    // senceres fins al límit de paraules. Si ni la primera frase hi cap, la
    // retorna sencera quan és raonable (fins al doble del límit) o res si és
    // desmesurada: millor menys text que text trencat amb "…".
    function escurcaFrasesSenceres(text, maxParaules) {
        const brut = String(text == null ? '' : text).trim();
        if (!brut) return '';
        const max = Number(maxParaules) > 0 ? Number(maxParaules) : 18;
        if (brut.split(/\s+/).length <= max) return brut;
        const frases = brut.match(/[^.!?]+[.!?]+["'”’)\]]*\s*/g) || [brut];
        let sortida = '';
        let paraules = 0;
        for (let i = 0; i < frases.length; i++) {
            const f = frases[i].trim();
            const n = f.split(/\s+/).length;
            if (paraules + n > max) break;
            sortida += (sortida ? ' ' : '') + f;
            paraules += n;
        }
        if (sortida) return sortida;
        const primera = frases[0].trim();
        return primera.split(/\s+/).length <= max * 2 ? primera : '';
    }

    function auditarCatala(text, opcions) {
        const opts = opcions || {};
        const brut = String(text == null ? '' : text).trim();
        const problemes = [];
        const afegeix = (codi, detall) => problemes.push(detall ? { codi, detall } : { codi });

        if (!brut) {
            return { ok: false, problemes: [{ codi: 'buit' }], puntuacio: 0, paraules: 0 };
        }

        if (!opts.permetSan && RE_SAN.test(brut)) afegeix('notacio_san');

        // Residus d'estructura: JSON, markdown, valors sense redactar.
        if (/[{}\[\]`]|\*\*|__/.test(brut)) afegeix('residus_estructura');
        if (/\b(null|undefined|NaN)\b/.test(brut)) afegeix('valor_no_redactat');
        if (/\b[a-zàèéíòóúïüç]+[A-Z][A-Za-zàèéíòóúïüç]+\b/.test(brut)) afegeix('clau_json');

        FORMES_PROSCRITES.forEach(re => {
            const m = brut.match(re);
            if (m) afegeix('forma_incorrecta', m[0]);
        });

        // Subjuntiu sense partícula que el justifiqui (la correcció ja ho hauria
        // resolt; si encara hi és, és un context que no hem sabut arreglar).
        RE_SUBJUNTIU.lastIndex = 0;
        let m;
        while ((m = RE_SUBJUNTIU.exec(brut)) !== null) {
            const anterior = motAnterior(m[2]);
            if (!anterior || !DISPARADORS_SUBJUNTIU.test(anterior)) afegeix('subjuntiu_sospitos', m[3]);
        }

        // Etiquetes amb majúscula enmig de frase.
        RE_TERME_ENMIG.lastIndex = 0;
        if (RE_TERME_ENMIG.test(brut)) afegeix('majuscula_enmig');

        // Text inacabat: cap línia pot quedar tallada amb punts suspensius ni
        // acabar en un connector penjat ("i el", "en lloc de", "la columna").
        brut.split('\n').forEach(linia => {
            const l = linia.trim();
            if (l && esTextIncomplet(l)) afegeix('text_inacabat', l.slice(-30));
        });

        // Xifres: cada número del text ha de sortir de les dades permeses.
        const numeros = [];
        const perc = new Set();
        const reNum = /(\d+(?:[.,]\d+)?)(\s*(?:%|per cent))?/g;
        let nm;
        while ((nm = reNum.exec(brut)) !== null) {
            const valor = Number(nm[1].replace(',', '.'));
            numeros.push(valor);
            if (nm[2]) perc.add(valor);
        }
        if (Array.isArray(opts.xifresPermeses)) {
            const permeses = new Set(opts.xifresPermeses.map(Number).filter(v => isFinite(v)));
            numeros.forEach(v => { if (!permeses.has(v)) afegeix('xifra_inventada', String(v)); });
        }
        if (Array.isArray(opts.percentatges)) {
            opts.percentatges.forEach(v => {
                const n = Number(v);
                if (isFinite(n) && numeros.indexOf(n) !== -1 && !perc.has(n)) {
                    afegeix('percentatge_sense_simbol', String(n));
                }
            });
        }

        const paraules = brut.split(/\s+/).length;
        if (opts.maxParaules && paraules > opts.maxParaules) afegeix('massa_llarg', String(paraules));

        if (/(\b[\wàèéíòóúïüç]+\b)(?:\s+\1\b){2,}/i.test(brut)) afegeix('paraula_repetida');

        const puntuacio = Math.max(0, 100 - problemes.length * 25);
        return { ok: problemes.length === 0, problemes, puntuacio, paraules };
    }

    // Canonada completa per a text extern (OpenAI): corregeix el que és segur,
    // fixa els percentatges coneguts i audita la resta. Si `ok` és fals, qui
    // crida ha de descartar el text i quedar-se amb la redacció local.
    function esmenarTextEntrenador(text, opcions) {
        const opts = opcions || {};
        let esmenat = corregirCatala(text);
        if (Array.isArray(opts.percentatges) && opts.percentatges.length) {
            esmenat = forcarPercentatges(esmenat, opts.percentatges);
        }
        const auditoria = auditarCatala(esmenat, opts);
        return { text: esmenat, ok: auditoria.ok, problemes: auditoria.problemes, puntuacio: auditoria.puntuacio };
    }

    // ----------------------------------------------------------------------
    // Regles d'estil compartides per a tots els prompts de l'entrenador
    // ----------------------------------------------------------------------
    const REGLES_ESTIL_CATALA = [
        'NORMES DE REDACCIÓ OBLIGATÒRIES:',
        "- Català normatiu i natural, de tu a tu, com un entrenador de club; res de construccions calcades del castellà (mai \"tens que\", \"per a que\", \"hi han\").",
        "- Present d'indicatiu i imperatiu correctes de segona persona: \"comets massa errades\", \"practica finals\", \"revisa la partida\" (mai \"cometis\" ni \"practicat\" en aquests contextos).",
        '- Escriu sempre "mig joc" (mai "migjoc") i posa el símbol % a cada percentatge, per exemple "un 74% de precisió".',
        '- Fes servir només xifres que surtin de les dades, integrades en frases naturals; cap xifra inventada ni arrodonida.',
        '- No copiïs etiquetes ni noms de claus de les dades: enmig de frase escriu "els finals", no "Finals".',
        '- Res de notació algebraica (Nf3, O-O): anomena les jugades amb el nom de la peça i la casella (cavall a f3).'
    ].join('\n');

    // ----------------------------------------------------------------------
    // Capa 3 — Redacció local del diagnòstic longitudinal
    // ----------------------------------------------------------------------

    // Variació determinista: mateixa llavor (empremta de dades) → mateix text,
    // però cada canvi de dades fa girar les variants. Sense estat global.
    function creaAleatoriDeterminista(llavor) {
        let h = 2166136261 >>> 0;
        const s = String(llavor == null ? '' : llavor);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return function () {
            h += 0x6D2B79F5;
            let t = h;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function tria(rnd, llista) {
        return llista[Math.floor(rnd() * llista.length) % llista.length];
    }

    const FASE_LOCATIU = { obertura: "a l'obertura", migjoc: 'al mig joc', final: 'al final' };
    const FASE_NOM = { obertura: "l'obertura", migjoc: 'el mig joc', final: 'el final' };

    // Converteix una etiqueta d'interfície ("Atacs i seguretat del rei") en la
    // forma que llegeix bé enmig de frase ("atacs i seguretat del rei").
    function etiquetaEnFrase(etiqueta) {
        return minusculaInicial(String(etiqueta || '').trim());
    }

    // Consells de prioritat per tema, en imperatiu correcte i sense xifres
    // (així mai poden contradir les dades).
    const PRIORITATS_PER_TEMA = {
        endgame: [
            "practica cada dia un final essencial (rei i peó, torre contra peó) fins que la conversió et surti sola",
            "rejuga els finals de les teves últimes partides contra la màquina i busca on es va escapar el resultat"
        ],
        king_attack: [
            "abans de cada jugada pregunta't com queda el teu rei, i quan ataquis, calcula la seqüència fins al final",
            "entrena posicions d'atac al rei: suma una peça més abans del cop i no persegueixis escacs buits"
        ],
        material: [
            "fes una sessió curta de tàctica cada dia i compta atacants i defensors abans de cada captura",
            "repassa les errades tàctiques guardades fins a encertar-les dues vegades seguides"
        ],
        center: [
            "decideix cada canvi al centre amb un pla concret al cap: obre la posició només quan les teves peces hi arriben primer",
            "treballa posicions amb tensió central i pregunta't a cada jugada quin canvi millora les teves peces"
        ],
        opening: [
            "repassa les primeres deu jugades de les teves obertures habituals i fixa't on perds el fil",
            "abans de jugar, recorda el bàsic de l'obertura: desenvolupa, enroca i disputa el centre sense repetir peça"
        ],
        fork: [
            "entrena forquilles: busca cada dia la casella des d'on una peça ataca dos objectius alhora",
            "repassa les teves errades de doble amenaça i pregunta't quina peça quedava indefensa"
        ],
        pin: [
            "treballa les clavades: identifica quina peça rival no es pot moure i pressiona-la abans que s'alliberi",
            "repassa les posicions amb peces clavades i busca la segona amenaça que decideix"
        ],
        skewer: [
            "busca alineacions de peces valuoses a cada posició d'entrenament: la línia oberta fa la feina",
            "repassa les errades de raig X i pregunta't què hi havia darrere de la primera peça"
        ],
        general: [
            "revisa les errades guardades i rejuga cada posició fins a trobar el pla correcte sense ajuda",
            "abans de cada jugada, repassa escacs, captures i amenaces: la rutina simple evita la meitat de les errades"
        ]
    };

    // Fets esperats (els calcula app.js):
    // { partidesTotals, errorsAcumulats, temesAmbMesErrors: [{clau, tema, errors}],
    //   errorsPerFase: {obertura, migjoc, final},
    //   precisioPerFase: {obertura, migjoc, final},
    //   ultimesPartides: {quantes, resultats: {victories, taules, derrotes}, precisioMitjana} }
    function redactarDiagnostic(fets, llavor) {
        const f = fets || {};
        const rnd = creaAleatoriDeterminista(llavor);
        const frases = [];

        // 1) Patró d'errades: fase amb més errades + temes més repetits.
        const fases = f.errorsPerFase || {};
        let faseTop = null, faseTopN = 0;
        ['obertura', 'migjoc', 'final'].forEach(fase => {
            const n = Number(fases[fase]) || 0;
            if (n > faseTopN) { faseTop = fase; faseTopN = n; }
        });
        const temes = (Array.isArray(f.temesAmbMesErrors) ? f.temesAmbMesErrors : [])
            .filter(t => t && t.errors > 0).slice(0, 3);
        const llistaTemes = llistaEnCatala(temes.map(t => etiquetaEnFrase(t.tema) + ' (' + t.errors + ')'));
        const total = Number(f.errorsAcumulats) || 0;
        if (faseTop && total > 0) {
            frases.push(tria(rnd, [
                'On acumules més errades és ' + FASE_LOCATIU[faseTop] + ': ' + faseTopN + ' de les ' + total + ' que tens registrades.',
                'El patró més clar apareix ' + FASE_LOCATIU[faseTop] + ', amb ' + faseTopN + ' de les ' + total + ' errades registrades.',
                'Les dades assenyalen ' + FASE_NOM[faseTop] + ' com el teu tram més fràgil: ' + faseTopN + ' errades de ' + total + '.'
            ]));
            if (llistaTemes) {
                frases.push(tria(rnd, [
                    'Els temes que més es repeteixen són ' + llistaTemes + '.',
                    'Per temes, on més ensopegues és en ' + llistaTemes + '.',
                    "Si mirem els temes, encapçalen la llista " + llistaTemes + '.'
                ]));
            }
        } else if (llistaTemes) {
            frases.push('Els temes on més ensopegues són ' + llistaTemes + '.');
        }

        // 2) Punt fort: la fase amb millor precisió.
        const prec = f.precisioPerFase || {};
        let millorFase = null, millorVal = -1, fasesAmbDades = 0;
        ['obertura', 'migjoc', 'final'].forEach(fase => {
            if (typeof prec[fase] === 'number' && isFinite(prec[fase])) {
                fasesAmbDades++;
                if (prec[fase] > millorVal) { millorVal = prec[fase]; millorFase = fase; }
            }
        });
        if (millorFase) {
            const comparativa = fasesAmbDades >= 3 ? ', la més alta de les tres fases' : '';
            frases.push(tria(rnd, [
                'El teu punt fort és la precisió ' + FASE_LOCATIU[millorFase] + comparativa + ': un ' + millorVal + '%.',
                'Hi ha una base sòlida: ' + FASE_LOCATIU[millorFase] + ' firmes un ' + millorVal + '% de precisió' + comparativa + '.',
                'La dada bona és que ' + FASE_LOCATIU[millorFase] + ' et mous en un ' + millorVal + '% de precisió' + comparativa + '.'
            ]));
        }

        // 3) Forma recent: resultats i precisió de les últimes partides.
        const u = f.ultimesPartides || {};
        const r = u.resultats || {};
        const resultats = llistaEnCatala([
            r.victories ? r.victories + ' ' + plural(r.victories, 'victòria', 'victòries') : '',
            r.taules ? r.taules + ' ' + plural(r.taules, 'empat', 'empats') : '',
            r.derrotes ? r.derrotes + ' ' + plural(r.derrotes, 'derrota', 'derrotes') : ''
        ]);
        if (u.quantes >= 2) {
            if (typeof u.precisioMitjana === 'number' && resultats) {
                frases.push(tria(rnd, [
                    'En les últimes ' + u.quantes + ' partides has fet un ' + u.precisioMitjana + '% de precisió de mitjana, amb ' + resultats + '.',
                    'La forma recent: ' + resultats + ' en ' + u.quantes + ' partides, amb una precisió mitjana del ' + u.precisioMitjana + '%.',
                    'Les últimes ' + u.quantes + ' partides deixen ' + resultats + ' i un ' + u.precisioMitjana + '% de precisió de mitjana.'
                ]));
            } else if (resultats) {
                frases.push('Les últimes ' + u.quantes + ' partides deixen ' + resultats + '.');
            } else if (typeof u.precisioMitjana === 'number') {
                frases.push('En les últimes ' + u.quantes + ' partides la teva precisió mitjana ha estat del ' + u.precisioMitjana + '%.');
            }
        }

        // 4) Prioritat d'entrenament segons el tema amb més errades.
        const clauTema = (temes[0] && temes[0].clau) || 'general';
        const consell = tria(rnd, PRIORITATS_PER_TEMA[clauTema] || PRIORITATS_PER_TEMA.general);
        const arrencada = tria(rnd, [
            'Prioritat per als pròxims dies:',
            'La prioritat ara mateix:',
            'La feina dels pròxims dies és clara:'
        ]);
        frases.push(arrencada + ' ' + consell + '.');

        // El corrector final és una xarxa de seguretat (i garanteix idempotència).
        return corregirCatala(frases.join(' '));
    }

    // ----------------------------------------------------------------------
    // Descripció d'un moviment d'escacs en català planer
    // ----------------------------------------------------------------------
    // Rep els FETS d'un moviment (calculats amb chess.js fora d'aquí:
    // core.createPvBoardHelpers().moveFacts) i redacta la frase. Sempre diu el
    // COLOR de la peça que mou ("la dama blanca captura a h7", no "la dama
    // captura a h7", que és ambigu quan tots dos bàndols tenen dama) i, si la
    // jugada és una captura, anomena la peça capturada ("el rei negre captura
    // la dama a h7").

    const NOMS_PECES = { p: 'peó', n: 'cavall', b: 'alfil', r: 'torre', q: 'dama', k: 'rei' };
    const PECES_FEMENINES = { r: true, q: true };

    // "dama blanca" → "la dama blanca"; "alfil negre de f8" → "l'alfil negre de f8".
    function articleNomPeca(nom) {
        const n = String(nom || '').trim();
        if (!n) return 'la peça';
        if (/^(dama|torre)\b/.test(n)) return 'la ' + n;
        if (/^alfil\b/.test(n)) return "l'" + n;
        return 'el ' + n;
    }

    function adjectiuColorPeca(peca, color) {
        const femeni = !!PECES_FEMENINES[peca];
        if (color === 'b') return femeni ? 'negra' : 'negre';
        return femeni ? 'blanca' : 'blanc';
    }

    // fets = { peca:'q', color:'w'|'b', origen:'d1', desti:'h5', captura:'q'|null,
    //          escac:bool, mat:bool, enroc:'k'|'q'|null, coronacio:'q'|null,
    //          desambigua:bool } → frase en català. Retorna '' si no hi ha fets.
    function descriuMovimentFets(fets) {
        const f = fets || {};
        if (f.enroc === 'k') return 'enroc curt';
        if (f.enroc === 'q') return 'enroc llarg';
        const nom = NOMS_PECES[f.peca];
        if (!nom || !f.desti) return '';
        const adjectiu = adjectiuColorPeca(f.peca, f.color);
        let subjecte;
        if (f.peca === 'p') {
            const columna = String(f.origen || '').charAt(0);
            subjecte = 'el peó ' + adjectiu + (columna ? ' de la columna ' + columna : '');
        } else {
            let nomComplet = nom + ' ' + adjectiu;
            // Desambiguació per casella d'origen només quan hi ha dues peces
            // iguals del mateix color: és verificable al tauler.
            if (f.desambigua && f.origen) nomComplet += ' de ' + f.origen;
            subjecte = articleNomPeca(nomComplet);
        }
        let text;
        if (f.captura) {
            const objecte = articleNomPeca(NOMS_PECES[f.captura] || 'peça');
            text = subjecte + ' captura ' + objecte + ' a ' + f.desti;
        } else if (f.peca === 'p') {
            text = subjecte + ' avança a ' + f.desti;
        } else {
            text = subjecte + ' va a ' + f.desti;
        }
        if (f.coronacio) text += ' i corona ' + (NOMS_PECES[f.coronacio] || 'dama');
        if (f.mat) text += ' amb escac i mat';
        else if (f.escac) text += ' amb escac';
        return text;
    }

    // ----------------------------------------------------------------------
    // Descripció d'una jugada segons la veu de l'entrenador
    // ----------------------------------------------------------------------
    // Rep els MATEIXOS fets verificats que descriuMovimentFets (calculats amb
    // chess.js sobre la FEN real) i retorna les peces per compondre frases en
    // cada registre, SENSE el color de la peça (el context de la ressenya ja
    // diu amb quin color jugava l'usuari):
    //   accio    → infinitiu per a "vas ..." o "el millor pla era ...":
    //              "portar el cavall de f3 a h4", "capturar el cavall a f6
    //              amb el cavall de g4", "coronar el peó a e8 en dama".
    //   clausula → subjecte + verb per acompanyar la SAN ("Nh4: el cavall de
    //              f3 va a h4"); amb estil 'technical' les jugades tranquil·les
    //              fan servir "es reubica a".
    // La SAN no s'inclou aquí: la composa qui crida segons la veu. Retorna
    // null si els fets no són vàlids (jugada no verificable).
    function descriuJugadaPerVeu(fets, opcions) {
        const f = fets || {};
        const o = opcions || {};
        const tecnic = o.estil === 'technical';
        if (f.enroc === 'k') return { accio: "fer l'enroc curt", clausula: "el rei fa l'enroc curt" };
        if (f.enroc === 'q') return { accio: "fer l'enroc llarg", clausula: "el rei fa l'enroc llarg" };
        const nom = NOMS_PECES[f.peca];
        if (!nom || !f.desti) return null;

        // Subjecte sense color: casella d'origen només quan desambigua de debò
        // (dues peces iguals del mateix color) i, per al peó, la columna.
        let subjecte;
        if (f.peca === 'p') {
            const columna = String(f.origen || '').charAt(0);
            subjecte = 'el peó' + (columna ? ' de ' + columna : '');
        } else {
            subjecte = articleNomPeca(nom + (f.desambigua && f.origen ? ' de ' + f.origen : ''));
        }

        let accio, clausula;
        if (f.captura) {
            const objecte = articleNomPeca(NOMS_PECES[f.captura] || 'peça');
            // Sense casella d'origen, "amb el teu cavall" llegeix millor que
            // "amb el cavall" (sobretot si captura una peça del mateix nom).
            const ambQui = (f.peca !== 'p' && !(f.desambigua && f.origen))
                ? (PECES_FEMENINES[f.peca] ? 'la teva ' : 'el teu ') + nom
                : subjecte;
            accio = 'capturar ' + objecte + ' a ' + f.desti + ' amb ' + ambQui;
            // La peça capturada no es repeteix a la clàusula: la SAN del davant
            // (p. ex. Nxf6) ja diu que és una captura.
            clausula = subjecte + ' captura a ' + f.desti;
        } else if (f.peca === 'p') {
            accio = 'avançar ' + subjecte + ' a ' + f.desti;
            clausula = subjecte + ' avança a ' + f.desti;
        } else {
            accio = 'portar ' + subjecte + ' a ' + f.desti;
            clausula = subjecte + (tecnic ? ' es reubica a ' : ' va a ') + f.desti;
        }
        if (f.coronacio) {
            const nova = NOMS_PECES[f.coronacio] || 'dama';
            accio = 'coronar el peó a ' + f.desti + ' en ' + nova;
            clausula += ' i corona en ' + nova;
        }
        if (f.mat) { accio += ' amb escac i mat'; clausula += ' amb escac i mat'; }
        else if (f.escac) { accio += ' amb escac'; clausula += ' amb escac'; }
        return { accio: accio, clausula: clausula };
    }

    // Presenta els fets del diagnòstic com a frases en català per al prompt,
    // en lloc de JSON: així el model no copia claus ("precisioPerFase") ni
    // etiquetes amb majúscula, i veu els percentatges ja formatats amb %.
    function fetsEnCatala(fets) {
        const f = fets || {};
        const linies = [];
        if (typeof f.partidesTotals === 'number') {
            linies.push('Partides jugades en total: ' + f.partidesTotals + '.');
        }
        const fases = f.errorsPerFase || {};
        if (typeof f.errorsAcumulats === 'number') {
            const repartiment = [];
            if (typeof fases.obertura === 'number') repartiment.push(fases.obertura + " a l'obertura");
            if (typeof fases.migjoc === 'number') repartiment.push(fases.migjoc + ' al mig joc');
            if (typeof fases.final === 'number') repartiment.push(fases.final + ' al final');
            linies.push('Errades acumulades: ' + f.errorsAcumulats +
                (repartiment.length ? ' (' + llistaEnCatala(repartiment) + ')' : '') + '.');
        }
        if (Array.isArray(f.temesAmbMesErrors) && f.temesAmbMesErrors.length) {
            linies.push('Temes amb més errades: ' + llistaEnCatala(
                f.temesAmbMesErrors.map(t => etiquetaEnFrase(t.tema) + ' (' + t.errors + ')')
            ) + '.');
        }
        const prec = f.precisioPerFase || {};
        const trams = [];
        if (typeof prec.obertura === 'number') trams.push(prec.obertura + "% a l'obertura");
        if (typeof prec.migjoc === 'number') trams.push(prec.migjoc + '% al mig joc');
        if (typeof prec.final === 'number') trams.push(prec.final + '% al final');
        if (trams.length) linies.push('Precisió mitjana per fase: ' + llistaEnCatala(trams) + '.');
        const u = f.ultimesPartides;
        if (u && u.quantes > 0) {
            const r = u.resultats || {};
            const resultats = llistaEnCatala([
                r.victories ? r.victories + ' ' + plural(r.victories, 'victòria', 'victòries') : '',
                r.taules ? r.taules + ' ' + plural(r.taules, 'empat', 'empats') : '',
                r.derrotes ? r.derrotes + ' ' + plural(r.derrotes, 'derrota', 'derrotes') : ''
            ]);
            let linia = 'Últimes ' + u.quantes + ' partides: ' + (resultats || 'sense resultats registrats');
            if (typeof u.precisioMitjana === 'number') linia += ', amb una precisió mitjana del ' + u.precisioMitjana + '%';
            linies.push(linia + '.');
        }
        return linies.map(l => '- ' + l).join('\n');
    }

    return {
        corregirCatala,
        forcarPercentatges,
        auditarCatala,
        esTextIncomplet,
        escurcaFrasesSenceres,
        esmenarTextEntrenador,
        redactarDiagnostic,
        descriuMovimentFets,
        descriuJugadaPerVeu,
        fetsEnCatala,
        llistaEnCatala,
        etiquetaEnFrase,
        plural,
        REGLES_ESTIL_CATALA
    };
});
