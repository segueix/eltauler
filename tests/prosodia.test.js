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
        expect(p).toBe('Atenció: el cavall captura a e quatre. escac i mat.');
        expect(P.prepare('')).toBe('');
        expect(P.prepare(null)).toBe('');
        expect(P.prepare('Taules Taules.')).toBe('taules.');
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
        expect(html.indexOf('prosodia.js')).toBeLessThan(html.indexOf('stockfishtv.js'));
    });
});
