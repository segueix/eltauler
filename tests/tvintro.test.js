// Introduccions Stockfish vs Lozza: 50 variants i context factual discret.
const I=require('../tvintro');
const TV=require('../stockfishtv');
const {Chess}=require('chess.js');

const plan=(sfColor='w', extra={})=>({
    engines:sfColor==='w'?{w:'stockfish',b:'lozza'}:{w:'lozza',b:'stockfish'},
    sharp:false, bias:0, draws:0, ...extra
});
const scene=(gameSeq,extra={})=>I.scene({
    gameSeq, duel:plan(), preparedPlies:6,
    sharpOpening:false,strengthAdjusted:true,
    ...extra
});

describe('50 presentacions breus, genuïnes i sense espòilers',()=>{
    test('exactament 50 frases distintes, sempre els noms Stockfish i Lozza',()=>{
        expect(I.OPENINGS).toHaveLength(50);
        expect(new Set(I.OPENINGS)).toHaveProperty('size',50);
        for(const phrase of I.OPENINGS){
            expect(phrase).toMatch(/Stockfish/);
            expect(phrase).toMatch(/Lozza/);
            expect(phrase.length).toBeLessThan(115);
        }
    });
    test('cada nova partida rep una frase diferent abans de repetir el cicle',()=>{
        const texts=Array.from({length:50},(_,i)=>scene(i+1));
        expect(new Set(texts).size).toBe(50);
        expect(scene(51).startsWith(I.OPENINGS[0])).toBe(true);
        expect(scene(1)).toBe(scene(1));
    });
    test('no avança noms d’obertures, jugades, Elo ni resultat',()=>{
        for(let n=1;n<=50;n++){
            const txt=scene(n,{
                opening:{name:'Gambit de Rei',idea:'Sacrifica el peó f.',moves:['e4','e5','f4']},
                duel:plan('w',{sharp:true,draws:2,bias:1}),
                preparedPlies:6,sharpOpening:true,styles:{w:'attacker',b:'wall'}
            });
            expect(txt).not.toMatch(/Gambit de Rei|Sacrifica|\\be4\\b|\\be5\\b|\\bf4\\b|mate?\\s+en|victòria assegurada|\\bElo\\b|profunditat\\s+\\d/i);
            expect(txt.split('.').length).toBeLessThanOrEqual(3);
        }
    });
    test('els colors esmentats són els que el sistema ha triat',()=>{
        const a=scene(1,{duel:plan('w'),preparedPlies:0});
        const b=scene(1,{duel:plan('b'),preparedPlies:0});
        expect(a).toContain('Stockfish porta les blanques');
        expect(b).toContain('Lozza porta les blanques');
    });
    test('s’omet el context fals si no s’han pres aquelles decisions',()=>{
        const normal=I.scene({gameSeq:1,duel:plan('w'),preparedPlies:0,sharpOpening:false,styles:null});
        expect(normal).not.toMatch(/perfil més dinàmic|preparat un inici|repartiment de força/);
        const missing=I.scene({gameSeq:10,duel:null});
        expect(missing).toContain('Stockfish');
        expect(missing).not.toMatch(/Stockfish contra Lozza|duel entre Stockfish i Lozza/);
    });
    test('la detecció d’obertura dinàmica no inventa tàctica quan no hi és',()=>{
        const calm=scene(5,{duel:plan('w',{sharp:true}),sharpOpening:false,preparedPlies:6});
        expect(calm).not.toMatch(/perfil més dinàmic/);
        const sharp=scene(5,{duel:plan('w',{sharp:true}),sharpOpening:true,preparedPlies:6});
        expect(sharp).toContain('perfil més dinàmic');
    });
    test('la frase inicial continua sent una locució senzilla per a Matxa',()=>{
        const duel=plan('b');
        const text=scene(13,{duel});
        const turns=TV.tvDialogueTurns({kind:'intro',speech:text},true);
        expect(turns).toHaveLength(1);
        expect(turns[0].voiceId).toBe(TV.TV_DUO.presenter);
        const initial=new Chess();
        expect(initial.fen()).toContain(' w KQkq ');
    });
});

describe('obertures: bàndol correcte i comentaris espaiats', () => {
    const common = { canSpeak: true, engines: { w: 'stockfish', b: 'lozza' }, color: 'b' };
    const named = { name: 'Sicilian Defense: Najdorf Variation' };

    test.each([
        [{ w: 'stockfish', b: 'lozza' }, 'Lozza'],
        [{ w: 'lozza', b: 'stockfish' }, 'Stockfish']
    ])('una defensa detectada amb blanques espera la jugada negra: %j', (engines, player) => {
        const first = I.openingTalk({ ...common, engines, named, color: 'w', ply: 10 });
        expect(first.turns).toBeUndefined();
        expect(first.memory.pending).toHaveLength(1);
        const next = I.openingTalk({ ...common, engines, ply: 11 }, first.memory);
        expect(next.turns[1].text).toContain(player + ', amb les negres');
        expect(next.turns[0].text).not.toContain('Amb la jugada');
        expect(first.memory.pending).toHaveLength(1); // memòria anterior intacta
    });

    test.each([
        ['Defensa Siciliana', 'b'], ['Defensa Francesa', 'b'],
        ['Semieslava', 'b'], ['Gambit de Dama Refusat', 'b'],
        ['Obertura Italiana', 'w'], ['Sistema Londres', 'w'],
        ['Sicilian Defense: Dragon Variation, Yugoslav Attack', 'w'],
        ['Sicilian Defense: Alapin Variation', 'w']
    ])('%s només s’explica al color %s, encara que el repertori s’estudiï des de l’altre', (name, color) => {
        const rival = color === 'w' ? 'b' : 'w';
        const first = I.openingTalk({ ...common, named: { name, userColor: rival }, color: rival, ply: 10 });
        expect(first.turns).toBeUndefined();
        const next = I.openingTalk({ ...common, color, ply: 11 }, first.memory);
        expect(next.turns[1].text).toContain(color === 'w' ? 'Stockfish, amb les blanques' : 'Lozza, amb les negres');
    });

    test('l’atac anglès de les blanques espera el seu torn i l’interval', () => {
        const first = I.openingTalk({ ...common, named, ply: 9 });
        const attack = { name: 'Sicilian Defense: Najdorf Variation, English Attack' };
        let state = I.openingTalk({ ...common, named: attack, color: 'w', ply: 10 }, first.memory);
        expect(state.turns).toBeUndefined();
        for (let ply = 11; ply <= 15; ply++) {
            state = I.openingTalk({ ...common, color: ply % 2 ? 'b' : 'w', ply }, state.memory);
            expect(state.turns).toBeUndefined();
        }
        state = I.openingTalk({ ...common, color: 'w', ply: 16 }, state.memory);
        expect(state.turns[1].text).toMatch(/Stockfish, amb les blanques.*enrocar llarg/);
    });

    test('no repeteix la defensa quan qualsevol bàndol segueix o abandona la teoria', () => {
        let state = I.openingTalk({ ...common, named, ply: 9 });
        for (let ply = 10; ply < 35; ply++) {
            state = I.openingTalk({ ...common, named, color: ply % 2 ? 'b' : 'w', ply,
                theory: ply < 25 }, state.memory);
            expect(state.turns).toBeUndefined();
        }
    });

    test('les etiquetes de la mateixa família no repeteixen la mateixa explicació', () => {
        let state = I.openingTalk({ ...common, named: { name: 'Sicilian Defense: Dragon Variation' }, ply: 9 });
        for (const [ply, name] of [[17, 'Sicilian Defense: Dragon Variation, Classical Variation'],
            [25, 'Sicilian Defense: Dragon Variation, Classical Variation, Normal Line']]) {
            state = I.openingTalk({ ...common, named: { name }, ply }, state.memory);
            expect(state.turns).toBeUndefined();
        }
    });

    test('com a màxim explica dues idees per bàndol', () => {
        let memory;
        const names = ['Sicilian Defense', 'Sicilian Defense: Najdorf Variation', 'Sicilian Defense: Dragon Variation'];
        names.forEach((name, i) => {
            const talk = I.openingTalk({ ...common, named: { name }, ply: 1 + i * 8 }, memory);
            if (i < 2) expect(talk.turns).toHaveLength(2);
            else expect(talk.turns).toBeUndefined();
            memory = talk.memory;
        });
        expect(memory.counts.b).toBe(2);
    });

    test('un graf tardà conserva la variant més recent de cada color', () => {
        const discoveries = [
            { named: { name: 'Sicilian Defense' }, ply: 1, color: 'b' },
            { named, ply: 9, color: 'b' },
            { named: { name: 'Sicilian Defense: Najdorf Variation, English Attack' }, ply: 10, color: 'w' }
        ];
        const first = I.openingTalk({ ...common, discoveries, ply: 13 });
        expect(first.turns[0].text).toContain('variant Najdorf');
        expect(first.memory.pending).toHaveLength(1);
        const white = I.openingTalk({ ...common, discoveries, color: 'w', ply: 20 }, first.memory);
        expect(white.turns[1].text).toContain('Stockfish, amb les blanques');
        expect(white.memory.pending).toHaveLength(0);
    });

    test('una urgència ajorna la defensa fins a una jugada tranquil·la del seu color', () => {
        const first = I.openingTalk({ ...common, named, ply: 9, canSpeak: false });
        const white = I.openingTalk({ ...common, color: 'w', ply: 10 }, first.memory);
        expect(white.turns).toBeUndefined();
        const black = I.openingTalk({ ...common, ply: 11 }, white.memory);
        expect(black.turns[0].text).toContain('En aquesta partida hem arribat');
        expect(black.memory.pending).toHaveLength(0);
    });

    test('un nom sense perfil no atribueix un pla a cap jugador', () => {
        const moveIdea = 'L’enroc porta el rei cap a un flanc i activa la torre.';
        const talk = I.openingTalk({ ...common, named: { name: 'Línia de prova: variant sense fitxa' }, moveIdea, ply: 8 });
        expect(talk.turns[0].text).toContain('variant sense fitxa');
        expect(talk.turns[0].text).not.toContain('jugada de');
        expect(talk.turns[1].text).toBe(moveIdea);
    });

    test('una seqüència no identificada s’explica una sola vegada', () => {
        const moveIdea = 'El peó ocupa una casella central.';
        const talk = I.openingTalk({ ...common, moveIdea, ply: 7 });
        expect(talk.turns[0].text).toContain('no tenim un nom');
        expect(I.openingTalk({ ...common, moveIdea, ply: 15 }, talk.memory).turns).toBeUndefined();
    });

    test('tot el repertori es presenta al torn que correspon al perfil', () => {
        const source = require('fs').readFileSync(require.resolve('../app.js'), 'utf8');
        const start = source.indexOf('const CURATED_OPENINGS = [');
        const end = source.indexOf('\n];', start) + 3;
        const repertoire = new Function(source.slice(start, end) + '; return CURATED_OPENINGS;')();
        expect(repertoire.length).toBeGreaterThan(40);
        for (const seed of repertoire) {
            const ply = seed.moves.length - 1;
            const first = I.openingTalk({ ...common, seed, color: ply % 2 ? 'b' : 'w',
                prepared: true, preparedComplete: true, ply });
            const talk = first.turns ? first : I.openingTalk({ ...common, color: ply % 2 ? 'w' : 'b', ply: ply + 1 }, first.memory);
            expect(talk.turns).toHaveLength(2);
            expect(talk.turns[0].text).toContain(require('../tallerobertures').translateOpeningName(seed.name));
            expect(talk.turns[1].text.length).toBeGreaterThan(40);
        }
    });

    test('el mat no recupera cap explicació pendent d’obertura', () => {
        const pending = I.openingTalk({ ...common, canSpeak: false, ply: 1, named });
        const board = new Chess();
        ['f3', 'e5', 'g4'].forEach(san => board.move(san));
        const fenBefore = board.fen(), move = board.move('Qh4#');
        const step = TV.tvBroadcastStep({ ChessCtor: Chess, move, fenBefore, fenAfter: board.fen(), ply: 3,
            tier: 'mid', end: { reason: 'checkmate', text: 'Escac i mat. Guanyen les negres.' },
            memory: { ...TV.tvEmptyMemory(), openingTalk: pending.memory },
            opening: { engines: common.engines }, visio: null });
        expect(step.comment.kind).toBe('mate');
        expect(step.comment.text).not.toMatch(/Siciliana|Najdorf/);
        expect(step.memory.openingTalk.pending).toHaveLength(0);
    });
});
