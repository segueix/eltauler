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

test('el seguiment del patró exigeix una continuació del repertori i es talla quan se’n surt', () => {
    const common = { canSpeak: true, prepared: false, engines: { w: 'stockfish', b: 'lozza' } };
    const named = { name: 'Sicilian Defense: Najdorf Variation' };
    const first = I.openingTalk({ ...common, named, theory: true, color: 'b', ply: 9 });
    expect(first.turns[0].text).toContain('jugada de Lozza');
    const follows = I.openingTalk({ ...common, theory: true, color: 'w', ply: 12 }, first.memory);
    expect(follows.turns[0].text).toContain('Stockfish segueix el patró');
    const leaves = I.openingTalk({ ...common, theory: false, color: 'b', ply: 15 }, follows.memory);
    expect(leaves.turns[0].text).toContain('Lozza surt de la línia');
    expect(I.openingTalk({ ...common, theory: true, color: 'w', ply: 20 }, leaves.memory).turns).toBeUndefined();
});

describe('cap obertura reconeguda queda sense explicació', () => {
    const common = { canSpeak: true, engines: { w: 'stockfish', b: 'lozza' }, color: 'b' };
    test('cobreix tot el repertori real, incloent les famílies sense plantilla', () => {
        const fs = require('fs');
        const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
        const start = source.indexOf('const CURATED_OPENINGS = [');
        const end = source.indexOf('\n];', start) + 3;
        const repertoire = new Function(source.slice(start, end) + '; return CURATED_OPENINGS;')();
        expect(repertoire.length).toBeGreaterThan(40);
        for (const seed of repertoire) {
            const board = new Chess();
            for (const san of seed.moves) expect(board.move(san)).toBeTruthy();
            const talk = I.openingTalk({ ...common, seed, prepared: true, preparedComplete: true, ply: seed.moves.length - 1 });
            expect(talk.turns).toHaveLength(2);
            expect(talk.turns[0].text).toContain(require('../tallerobertures').translateOpeningName(seed.name));
            expect(talk.turns[1].text.length).toBeGreaterThan(40);
            expect(talk.turns[1].text).not.toContain('encara no tenim');
        }
    });
    test('les variants consecutives d’una mateixa família no es col·lapsen ni tenen límit de quatre', () => {
        const names = ['Sicilian Defense', 'Sicilian Defense: Open', 'Sicilian Defense: Dragon Variation',
            'Sicilian Defense: Dragon Variation, Classical Variation', 'Sicilian Defense: Dragon Variation, Yugoslav Attack'];
        let memory;
        names.forEach((name, ply) => {
            const talk = I.openingTalk({ ...common, named: { name }, ply }, memory);
            expect(talk.turns[0].text).toContain(require('../tallerobertures').translateOpeningName(name));
            memory = talk.memory;
        });
        expect(memory.seen).toHaveLength(5);
    });
    test('una urgència conserva les explicacions pendents i l’historial no les duplica', () => {
        const named = { name: 'Sicilian Defense: Najdorf Variation' };
        const first = I.openingTalk({ ...common, named, ply: 9, canSpeak: false });
        expect(first.turns).toBeUndefined();
        const next = I.openingTalk({ ...common, ply: 10, discoveries: [{ named, ply: 9 }] }, first.memory);
        expect(first.memory.pending).toHaveLength(1);
        expect(next.memory.pending).toHaveLength(0);
        expect(next.turns[0].text).toContain('En aquesta partida hem arribat');
        const repeated = I.openingTalk({ ...common, ply: 11, discoveries: [{ named, ply: 9 }] }, next.memory);
        expect(repeated.turns).toBeUndefined();
    });
    test('un nom sense plantilla conserva la variant i explica el fet verificat', () => {
        const moveIdea = 'L’enroc porta el rei cap a un flanc i activa la torre.';
        const talk = I.openingTalk({ ...common, named: { name: 'Línia de prova: variant sense fitxa' }, moveIdea, ply: 8 });
        expect(talk.turns[0].text).toContain('variant sense fitxa');
        expect(talk.turns[1].text).toBe(moveIdea);
    });
    test('una seqüència no identificada s’explica sense inventar un nom', () => {
        const moveIdea = 'El peó ocupa una casella central i controla les diagonals del davant.';
        const talk = I.openingTalk({ ...common, moveIdea, ply: 7 });
        expect(talk.turns[0].text).toContain('no tenim un nom');
        expect(talk.turns[1].text).toBe(moveIdea);
    });
    test('el mat es diu abans de recuperar les variants pendents, amb totes dues veus', () => {
        const pending = I.openingTalk({ ...common, canSpeak: false, ply: 1,
            named: { name: 'Obertura de Viena' } });
        const board = new Chess();
        ['f3', 'e5', 'g4'].forEach(san => board.move(san));
        const fenBefore = board.fen(), move = board.move('Qh4#');
        const step = TV.tvBroadcastStep({ ChessCtor: Chess, move, fenBefore, fenAfter: board.fen(), ply: 3,
            tier: 'mid', end: { reason: 'checkmate', text: 'Escac i mat. Guanyen les negres.' },
            memory: { ...TV.tvEmptyMemory(), openingTalk: pending.memory },
            opening: { engines: common.engines }, visio: null });
        expect(step.comment.kind).toBe('mate');
        expect(step.comment.dialogue[0].text).toMatch(/Escac i mat/);
        expect(step.comment.dialogue[1].text).toContain('Obertura de Viena');
        const turns = TV.tvDialogueTurns({ ...step.comment, speech: step.comment.text }, true);
        expect(turns).toHaveLength(3);
        expect(turns[2].voiceId).toBe(TV.TV_DUO.analyst);
        expect(step.memory.openingTalk.pending).toHaveLength(0);
    });
});
