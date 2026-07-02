const Redactor = require('../redactor.js');

// ---------------------------------------------------------------------------
// Capa 1 — corregirCatala: esmenes normatives segures
// ---------------------------------------------------------------------------
describe('corregirCatala — subjuntiu usat com a present', () => {
    test("corregeix 'cometis' quan fa d'indicatiu", () => {
        expect(Redactor.corregirCatala("Veig un patró clar: cometis la majoria d'errors"))
            .toBe("Veig un patró clar: comets la majoria d'errors");
    });

    test("respecta el subjuntiu legítim rere 'que', 'quan' o 'no'", () => {
        expect(Redactor.corregirCatala('No cometis errades al final')).toBe('No cometis errades al final');
        expect(Redactor.corregirCatala('quan cometis una errada, apunta-la')).toBe('quan cometis una errada, apunta-la');
        expect(Redactor.corregirCatala('evita que perdis material')).toBe('evita que perdis material');
    });

    test('respecta clítics i coordinacions ambigües', () => {
        expect(Redactor.corregirCatala('no els oblidis mai')).toBe('no els oblidis mai');
        expect(Redactor.corregirCatala('vull que treballis i milloris cada dia'))
            .toBe('vull que treballis i milloris cada dia');
    });

    test('manté la majúscula inicial', () => {
        expect(Redactor.corregirCatala('Cometis massa errades al final.'))
            .toBe('Comets massa errades al final.');
    });
});

describe('corregirCatala — participi usat com a imperatiu', () => {
    test("corregeix 'practicat finals' dins d'una sèrie de consells", () => {
        expect(Redactor.corregirCatala('treballa tàctiques concretes, practicat finals essencials'))
            .toBe('treballa tàctiques concretes, practica finals essencials');
    });

    test('respecta el perfet amb auxiliar', () => {
        expect(Redactor.corregirCatala('aquesta setmana has practicat finals essencials'))
            .toBe('aquesta setmana has practicat finals essencials');
        expect(Redactor.corregirCatala("l'he revisat les vegades que calia"))
            .toBe("l'he revisat les vegades que calia");
        expect(Redactor.corregirCatala('has treballat i practicat les obertures'))
            .toBe('has treballat i practicat les obertures');
        expect(Redactor.corregirCatala('un cop revisat el pla, juga'))
            .toBe('un cop revisat el pla, juga');
    });
});

describe('corregirCatala — règims verbals i terminologia', () => {
    test("'exerceix posicions' esdevé 'exercita't amb posicions'", () => {
        expect(Redactor.corregirCatala('exerceix posicions de migjoc amb atacs reals'))
            .toBe("exercita't amb posicions de mig joc amb atacs reals");
    });

    test("'migjoc' esdevé 'mig joc' a tot arreu", () => {
        expect(Redactor.corregirCatala('cometo errors al migjoc i al final')).toContain('al mig joc');
        expect(Redactor.corregirCatala('Migjoc complicat')).toBe('Mig joc complicat');
    });

    test('barra entre paraules esdevé conjunció', () => {
        expect(Redactor.corregirCatala('tàctica/guany de material')).toBe('tàctica i guany de material');
        expect(Redactor.corregirCatala('victòria i/o taules')).toBe('victòria o taules');
    });
});

describe('corregirCatala — castellanismes i concordances', () => {
    test('castellanismes freqüents', () => {
        expect(Redactor.corregirCatala('tens que revisar la partida per a que millori'))
            .toBe('has de revisar la partida perquè millori');
        expect(Redactor.corregirCatala('hi han moltes errades')).toBe('hi ha moltes errades');
        expect(Redactor.corregirCatala('sempre falta algo')).toBe('sempre falta alguna cosa');
    });

    test('concordança de gènere amb les peces', () => {
        expect(Redactor.corregirCatala('mou el dama i el torre')).toBe('mou la dama i la torre');
        expect(Redactor.corregirCatala('un torre activa')).toBe('una torre activa');
    });

    test('apostrofació i contraccions', () => {
        expect(Redactor.corregirCatala('la errada de el final')).toBe("l'errada del final");
        expect(Redactor.corregirCatala('de errors greus')).toBe("d'errors greus");
    });

    test('decimals amb coma sense tocar milers', () => {
        expect(Redactor.corregirCatala('una pèrdua de 2.5 peons')).toBe('una pèrdua de 2,5 peons');
        expect(Redactor.corregirCatala('més de 1.000 partides')).toBe('més de 1.000 partides');
    });
});

describe('corregirCatala — etiquetes amb majúscula enmig de frase', () => {
    test('minusculitza els termes de la interfície copiats pel model', () => {
        expect(Redactor.corregirCatala('els errors més nombrosos en Finals, Atacs i Tàctica'))
            .toBe('els errors més nombrosos en finals, atacs i tàctica');
    });

    test('no toca el terme a inici de frase', () => {
        expect(Redactor.corregirCatala('Finals: el teu punt feble.')).toContain('Finals:');
    });
});

describe('corregirCatala — estructura', () => {
    test('conserva els salts de línia (plans multibloc)', () => {
        const pla = 'PLA 1: títol\nDiagnòstic: una frase.\n\nPLA 2: altre títol\nPla: una altra frase.';
        expect(Redactor.corregirCatala(pla).split('\n').length).toBe(5);
    });

    test('és idempotent', () => {
        const original = "Veig un patró clar: cometis errors al migjoc, practicat finals i exerceix posicions en Finals, Atacs i Tàctica.";
        const unCop = Redactor.corregirCatala(original);
        expect(Redactor.corregirCatala(unCop)).toBe(unCop);
    });
});

// ---------------------------------------------------------------------------
// forcarPercentatges
// ---------------------------------------------------------------------------
describe('forcarPercentatges', () => {
    test('afegeix % als valors de precisió entre parèntesis', () => {
        expect(Redactor.forcarPercentatges('la més alta entre fases (80) i correcta (71)', [80, 71]))
            .toBe('la més alta entre fases (80%) i correcta (71%)');
    });

    test('no toca números que no són percentatges coneguts', () => {
        expect(Redactor.forcarPercentatges('amb 38 errades (18)', [80])).toBe('amb 38 errades (18)');
    });
});

// ---------------------------------------------------------------------------
// Capa 2 — auditarCatala
// ---------------------------------------------------------------------------
describe('auditarCatala', () => {
    test('un text correcte passa net', () => {
        const r = Redactor.auditarCatala('Has jugat amb un 74% de precisió i has comès 3 errades al mig joc.', {
            xifresPermeses: [74, 3], percentatges: [74]
        });
        expect(r.ok).toBe(true);
        expect(r.problemes).toEqual([]);
    });

    test('detecta xifres que no surten dels fets', () => {
        const r = Redactor.auditarCatala('Has comès 12 errades.', { xifresPermeses: [3, 74] });
        expect(r.ok).toBe(false);
        expect(r.problemes.some(p => p.codi === 'xifra_inventada' && p.detall === '12')).toBe(true);
    });

    test('detecta percentatges sense símbol', () => {
        const r = Redactor.auditarCatala('La teva precisió mitjana és 71 aquesta setmana.', {
            xifresPermeses: [71], percentatges: [71]
        });
        expect(r.problemes.some(p => p.codi === 'percentatge_sense_simbol')).toBe(true);
    });

    test('detecta notació SAN prohibida i la tolera amb permetSan', () => {
        expect(Redactor.auditarCatala('La millor era Nxe5 seguida de Qh5.').ok).toBe(false);
        expect(Redactor.auditarCatala('La millor era Nxe5.', { permetSan: true }).problemes
            .some(p => p.codi === 'notacio_san')).toBe(false);
    });

    test("no confon 'cavall f3' descriptiu amb SAN", () => {
        expect(Redactor.auditarCatala('Porta el cavall a f3 i enroca.').ok).toBe(true);
    });

    test('detecta residus de JSON i claus camelCase', () => {
        const r = Redactor.auditarCatala('El teu precisioPerFase és bo segons {dades}.');
        expect(r.problemes.some(p => p.codi === 'clau_json')).toBe(true);
        expect(r.problemes.some(p => p.codi === 'residus_estructura')).toBe(true);
    });

    test('detecta formes proscrites que la correcció no ha netejat', () => {
        const r = Redactor.auditarCatala('Al migjoc tens que vigilar més.');
        expect(r.ok).toBe(false);
        expect(r.problemes.some(p => p.codi === 'forma_incorrecta')).toBe(true);
    });

    test('detecta textos massa llargs', () => {
        const llarg = new Array(60).fill('paraula').map((p, i) => p + i).join(' ');
        expect(Redactor.auditarCatala(llarg, { maxParaules: 40 }).problemes
            .some(p => p.codi === 'massa_llarg')).toBe(true);
    });

    test('el text buit no és vàlid', () => {
        expect(Redactor.auditarCatala('').ok).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// esmenarTextEntrenador — el cas real que va motivar el corrector
// ---------------------------------------------------------------------------
describe('esmenarTextEntrenador (diagnòstic real generat per OpenAI)', () => {
    const textReal = "Veig un patró clar: cometis la majoria d’errors al migjoc, especialment en temes de finals, atacs i seguretat del rei i tàctica/guany de material; això es reflecteix en 38 errors al migjoc i 18 al final, amb els errors més nombrosos en Finals, Atacs i Tàctica. Un punt fort és la precisió al final, que és la més alta entre fases (80), i la teva precisió mitjana en les cinc últimes partides és correcta (71) amb dues victòries entre cinc. Prioritza entrenar el joc tàctic i la defensa del rei al migjoc i la conversió en finals ara mateix: treballa tàctiques concretes, practicat finals essencials i exerceix posicions de migjoc amb atacs reals.";
    const opcions = { xifresPermeses: [38, 18, 80, 71, 2, 5], percentatges: [80, 71], maxParaules: 140 };

    test('corregeix tots els errors normatius i valida el resultat', () => {
        const r = Redactor.esmenarTextEntrenador(textReal, opcions);
        expect(r.text).toContain('comets la majoria');
        expect(r.text).not.toMatch(/\bmigjoc\b/i);
        expect(r.text).toContain('(80%)');
        expect(r.text).toContain('(71%)');
        expect(r.text).toContain('practica finals essencials');
        expect(r.text).toContain("exercita't amb posicions de mig joc");
        expect(r.text).toContain('en finals, atacs i tàctica');
        expect(r.ok).toBe(true);
    });

    test('descarta el mateix text si les xifres no quadren amb els fets', () => {
        const r = Redactor.esmenarTextEntrenador(textReal, {
            xifresPermeses: [7, 9], percentatges: [80, 71]
        });
        expect(r.ok).toBe(false);
        expect(r.problemes.some(p => p.codi === 'xifra_inventada')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Capa 3 — redacció local del diagnòstic
// ---------------------------------------------------------------------------
const FETS_EXEMPLE = {
    partidesTotals: 24,
    errorsAcumulats: 56,
    temesAmbMesErrors: [
        { clau: 'endgame', tema: 'Finals', errors: 12 },
        { clau: 'king_attack', tema: 'Atacs i seguretat del rei', errors: 9 },
        { clau: 'material', tema: 'Tàctica i guany de material', errors: 7 }
    ],
    errorsPerFase: { obertura: 8, migjoc: 38, final: 10 },
    precisioPerFase: { obertura: 74, migjoc: 66, final: 80 },
    ultimesPartides: {
        quantes: 5,
        resultats: { victories: 2, taules: 1, derrotes: 2 },
        precisioMitjana: 71
    }
};

describe('redactarDiagnostic', () => {
    test('cita les xifres exactes dels fets, amb % i "mig joc"', () => {
        const text = Redactor.redactarDiagnostic(FETS_EXEMPLE, '24:56');
        expect(text).toMatch(/38/);
        expect(text).toMatch(/56/);
        expect(text).toMatch(/80%/);
        expect(text).toMatch(/71%/);
        expect(text).toContain('mig joc');
        expect(text).not.toMatch(/migjoc/i);
    });

    test('passa la seva pròpia auditoria (cap xifra inventada, % correctes)', () => {
        const text = Redactor.redactarDiagnostic(FETS_EXEMPLE, '24:56');
        const auditoria = Redactor.auditarCatala(text, {
            xifresPermeses: [24, 56, 12, 9, 7, 8, 38, 10, 74, 66, 80, 71, 5, 2, 1],
            percentatges: [74, 66, 80, 71],
            maxParaules: 150
        });
        expect(auditoria.problemes).toEqual([]);
    });

    test('és determinista per a la mateixa llavor', () => {
        expect(Redactor.redactarDiagnostic(FETS_EXEMPLE, 'a:1'))
            .toBe(Redactor.redactarDiagnostic(FETS_EXEMPLE, 'a:1'));
    });

    test('acaba sempre amb una prioritat en imperatiu', () => {
        const text = Redactor.redactarDiagnostic(FETS_EXEMPLE, '24:56');
        expect(text).toMatch(/[Pp]rioritat|feina dels pròxims dies/);
    });

    test('aguanta fets incomplets sense trencar-se', () => {
        const text = Redactor.redactarDiagnostic({
            errorsAcumulats: 0,
            temesAmbMesErrors: [],
            errorsPerFase: {},
            precisioPerFase: { obertura: null, migjoc: null, final: null },
            ultimesPartides: { quantes: 0, resultats: {}, precisioMitjana: null }
        }, 'buit');
        expect(typeof text).toBe('string');
        expect(text.length).toBeGreaterThan(20);
    });

    test('concordança singular/plural als resultats', () => {
        const fets = JSON.parse(JSON.stringify(FETS_EXEMPLE));
        fets.ultimesPartides.resultats = { victories: 1, taules: 0, derrotes: 4 };
        const text = Redactor.redactarDiagnostic(fets, 'x:1');
        expect(text).toContain('1 victòria');
        expect(text).not.toContain('1 victòries');
    });
});

// ---------------------------------------------------------------------------
// fetsEnCatala — fets redactats per al prompt (res de JSON)
// ---------------------------------------------------------------------------
describe('fetsEnCatala', () => {
    test('escriu els fets com a frases amb % i sense claus internes', () => {
        const linies = Redactor.fetsEnCatala(FETS_EXEMPLE);
        expect(linies).toContain('mig joc');
        expect(linies).toContain('74%');
        expect(linies).toContain('2 victòries, 1 empat i 2 derrotes');
        expect(linies).not.toMatch(/migjoc|precisioPerFase|temesAmbMesErrors|[{}"]/);
    });

    test('les etiquetes van en minúscula dins de frase', () => {
        expect(Redactor.fetsEnCatala(FETS_EXEMPLE)).toContain('finals (12)');
        expect(Redactor.fetsEnCatala(FETS_EXEMPLE)).toContain('atacs i seguretat del rei (9)');
    });
});

// ---------------------------------------------------------------------------
// Utilitats exportades
// ---------------------------------------------------------------------------
describe('utilitats', () => {
    test('llistaEnCatala enumera amb comes i "i"', () => {
        expect(Redactor.llistaEnCatala(['a'])).toBe('a');
        expect(Redactor.llistaEnCatala(['a', 'b'])).toBe('a i b');
        expect(Redactor.llistaEnCatala(['a', 'b', 'c'])).toBe('a, b i c');
    });

    test('plural concorda', () => {
        expect(Redactor.plural(1, 'errada', 'errades')).toBe('errada');
        expect(Redactor.plural(3, 'errada', 'errades')).toBe('errades');
    });

    test('les regles d\'estil per als prompts existeixen', () => {
        expect(Redactor.REGLES_ESTIL_CATALA).toContain('mig joc');
        expect(Redactor.REGLES_ESTIL_CATALA).toContain('%');
    });
});
