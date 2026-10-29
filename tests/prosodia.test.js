const P = require('../prosodia');
const TV = require('../stockfishtv');
const fs = require('fs');
const path = require('path');

describe('Prosòdia catalana de Matxa', () => {
    test('les caselles es llegeixen com a lletres i nombres en català', () => {
        expect(P.squares('cavall a f 3 i dama a d 8.')).toBe('cavall a efa tres i dama a de vuit.');
        expect(P.squares('e 4, b 7, h 1.')).toBe('e quatre, be set, hac un.');
        expect(P.squares('Un 74% de precisió.')).toBe('Un 74% de precisió.');
    });
    test('el ritme de les pauses respecta frases, escacs i puntuació', () => {
        const p = P.prepare('Atenció: el cavall captura a e 4; escac i mat…');
        expect(p).toBe('Atenció: el cavall captura a e quatre. Escac i mat.');
        expect(P.prepare('')).toBe('');
        expect(P.prepare(null)).toBe('');
        expect(P.prepare('Taules Taules.')).toBe('Taules.');
    });
    test('les paraules originals i la valoració no es reescriuen', () => {
        const source = 'L’anàlisi dona un avantatge de 2,5 peons.';
        expect(P.prepare(source)).toBe(source);
        expect(P.prepare('Stockfish contra Lozza.')).toBe('Stockfish contra Lozza.');
    });
    test('l’àudio neuronal utilitza el mateix text preparat quan es precalcula i quan es reprodueix', async () => {
        const neural = {
            available: () => true, speak: jest.fn(async () => ({ spoken: true })),
            prefetch: jest.fn(), stop: jest.fn(), isSpeaking: () => false
        };
        const voice = TV.createTvVoice({
            neural, getNeuralVoiceId: () => 'matxa:central:elia',
            loadPref: () => 'on', prepareNeuralText: P.prepare
        });
        const original = 'El cavall a f 3 fa escac; el rei respon a h 7.';
        voice.prefetch(original);
        expect(neural.prefetch).toHaveBeenCalledTimes(1);
        expect(neural.prefetch.mock.calls[0][0]).toBe(P.prepare(original));
        await voice.speak(original);
        expect(neural.speak).toHaveBeenCalledTimes(1);
        expect(neural.speak.mock.calls[0][0]).toBe(P.prepare(original));
        expect(voice.engine()).toBe('neural');
    });
    test('el text per a la veu del sistema continua intacte si Matxa no està disponible', async () => {
        const utterances = [];
        const synth = {
            getVoices: () => [{ lang: 'ca-ES', name: 'Català' }],
            speak(u) { utterances.push(u); u.onend(); },
            cancel() {}, addEventListener() {}
        };
        function Utterance(text) { this.text = text; }
        const neural = { available: () => false, stop: jest.fn(), isSpeaking: () => false };
        const voice = TV.createTvVoice({
            neural, speechSynthesis: synth, SpeechSynthesisUtterance: Utterance,
            getNeuralVoiceId: () => 'matxa:central:elia',
            loadPref: () => 'on', prepareNeuralText: P.prepare,
            setTimeout: () => 1, clearTimeout: () => {}
        });
        const source = 'La torre a f 3.';
        const result = await voice.speak(source);
        expect(result.spoken).toBe(true);
        expect(utterances[0].text).toBe(source);
    });
    test('la versió web inclou tots dos mòduls abans dels guions que els fan servir', () => {
        const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
        expect(html.indexOf('jeropedagogia.js')).toBeGreaterThan(html.indexOf('hieroclosure.js'));
        expect(html.indexOf('<script src="jeropedagogia.js')).toBeLessThan(html.indexOf('<script src="app.js'));
        expect(html.indexOf('<script src="prosodia.js')).toBeLessThan(html.indexOf('<script src="stockfishtv.js'));
    });
});


describe('Director radiofònic de Stockfish vs Lozza', () => {
    test('assigna un ritme per motiu verificat sense alterar cap contingut', () => {
        expect(P.direction({ kind: 'mate' })).toMatchObject({ mood: 'finale', rate: 0.91 });
        expect(P.direction({ kind: 'fork' }).mood).toBe('surprise');
        expect(P.direction({ kind: 'missed' }).mood).toBe('tense');
        expect(P.direction({ kind: 'summary' }).mood).toBe('teaching');
        expect(P.direction({ kind: 'describe' }).mood).toBe('calm');
        expect(TV.tvSpeechDirection({ kind: 'mate' })).toEqual(P.direction({ kind: 'mate' }));
        for (const k of ['mate', 'fork', 'summary', 'quiet', 'unknown']) {
            const d = P.direction({ kind: k });
            expect(d.rate).toBeGreaterThanOrEqual(0.9);
            expect(d.rate).toBeLessThanOrEqual(1.05);
            expect(d.pauseMs).toBeGreaterThanOrEqual(850);
        }
    });
    test('Matxa rep EXACTAMENT la mateixa velocitat en precàlcul i emissió', async () => {
        const neural = {
            available: () => true, speak: jest.fn(async () => ({ spoken: true })),
            prefetch: jest.fn(), stop: jest.fn(), isSpeaking: () => false
        };
        const voice = TV.createTvVoice({
            neural, getNeuralVoiceId: () => 'matxa:central:elia',
            getNeuralRate: () => 1.1, loadPref: () => 'on',
            prepareNeuralText: P.prepare
        });
        const dir = TV.tvSpeechDirection({ kind: 'mate' });
        voice.prefetch('Escac i mat.', dir);
        await voice.speak('Escac i mat.', dir);
        const prefRate = neural.prefetch.mock.calls[0][2].rate;
        const spokenRate = neural.speak.mock.calls[0][2].rate;
        expect(prefRate).toBe(spokenRate);
        expect(spokenRate).toBeCloseTo(1.001);
    });
    test('la veu catalana del dispositiu interpreta ritme i altura sense alterar la frase', async () => {
        const spoken = [];
        const synth = {
            getVoices: () => [{ lang: 'ca-ES', name: 'Català' }],
            speak(u) { spoken.push(u); u.onend(); },
            cancel() {}, addEventListener() {}
        };
        function Utterance(text) { this.text = text; }
        const voice = TV.createTvVoice({
            speechSynthesis: synth, SpeechSynthesisUtterance: Utterance,
            loadPref: () => 'on', setTimeout: () => 1, clearTimeout: () => {}
        });
        const dir = TV.tvSpeechDirection({kind:'fork'});
        await voice.speak('El cavall crea una forquilla.',dir);
        expect(spoken[0].text).toBe('El cavall crea una forquilla.');
        expect(spoken[0].rate).toBe(dir.rate);
        expect(spoken[0].pitch).toBe(dir.pitch);
    });
});

describe('Dues veus Matxa a Stockfish TV', () => {
    const elia = TV.TV_DUO.presenter, grau = TV.TV_DUO.analyst;
    test('Elia narra les jugades i Grau interpreta els resums pedagògics', () => {
        expect(TV.tvDialogueTurns({speech:'Escac i mat.',kind:'mate',ply:9},true))
            .toEqual([{text:'Escac i mat.',voiceId:elia,role:'presenter'}]);
        expect(TV.tvDialogueTurns({speech:'Les negres ocupen el centre.',kind:'summary',ply:9},true))
            .toEqual([{text:'Les negres ocupen el centre.',voiceId:grau,role:'analyst'}]);
        expect(TV.tvDialogueTurns({speech:'El peó avança.',kind:'describe',ply:9},true)[0].voiceId).toBe(elia);
    });
    test('un comentari de dues frases es reparteix sense repetir ni afegir fets', () => {
        const speech='El cavall captura el peó de d cinc. Així obre la diagonal de l’alfil blanc.';
        const turns=TV.tvDialogueTurns({speech,kind:'summary',explanatory:true,ply:10},true);
        expect(turns.map(t=>t.voiceId)).toEqual([elia,grau]);
        expect(turns.map(t=>t.text).join(' ')).toBe(speech);
        expect(turns).toHaveLength(2);
    });
    test('només una veu si el duet és desactivat o no hi ha text vàlid per separar', () => {
        const speech='El rei es retira a g vuit.';
        expect(TV.tvDialogueTurns({speech,kind:'summary',ply:12},false))
            .toEqual([{text:speech,voiceId:null,role:'presenter'}]);
        expect(TV.tvDialogueTurns({speech,kind:'summary',ply:12},true)).toHaveLength(1);
        expect(TV.tvDialogueTurns({kind:'mate'},true)).toEqual([]);
    });
    test('el mateix identificador Matxa s’usa al precàlcul i a la lectura', async () => {
        const neural={available:()=>true,speak:jest.fn(async()=>({spoken:true,reason:'end'})),
            prefetch:jest.fn(),stop:jest.fn(),isSpeaking:()=>false};
        let on=true;
        const v=TV.createTvVoice({neural,loadPref:()=> 'on',getDualEnabled:()=>on,
            getNeuralVoiceId:()=>elia,prepareNeuralText:P.prepare});
        for(const voiceId of [elia,grau]) {
            v.prefetch('Una bona jugada.',{voiceId,rate:0.96});
            await v.speak('Una bona jugada.',{voiceId,rate:0.96});
        }
        expect(neural.prefetch.mock.calls.map(x=>x[1])).toEqual([elia,grau]);
        expect(neural.speak.mock.calls.map(x=>x[1])).toEqual([elia,grau]);
        expect(neural.prefetch.mock.calls[1][2].rate).toBe(neural.speak.mock.calls[1][2].rate);
        expect(v.supportsDual()).toBe(true);
        on=false;
        expect(v.supportsDual()).toBe(false);
        await v.speak('Veu única.',{voiceId:grau});
        expect(neural.speak.mock.lastCall[1]).toBe(elia);
    });
    test('les preferències permeten desactivar el duet i conservar altres paràmetres', () => {
        expect(TV.tvNormalizePrefs(null).duo).toBe(true);
        expect(TV.tvNormalizePrefs({duo:false,speed:'quick'})).toMatchObject({duo:false,speed:'quick'});
    });
});
