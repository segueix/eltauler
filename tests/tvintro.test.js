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
        const calm=scene(6,{duel:plan('w',{sharp:true}),sharpOpening:false,preparedPlies:6});
        expect(calm).not.toMatch(/perfil més dinàmic/);
        const sharp=scene(6,{duel:plan('w',{sharp:true}),sharpOpening:true,preparedPlies:6});
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
