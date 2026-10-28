const fs = require('fs');
const vm = require('vm');
const Neural = require('../veuneural');
const Redactor = require('../redactor');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const speechCode = source.slice(source.indexOf('const REVIEW_TTS_STATE ='), source.indexOf('function getCoachDiagnosisText()'));
const CA_ES = { lang: 'ca-ES', name: 'Català Espanya', voiceURI: 'catala-es' };
const CA_AD = { lang: 'ca-AD', name: 'Català Andorra', voiceURI: 'catala-ad' };

function setup({ saved, presets = [], voices = [CA_AD, CA_ES], available = true, neural = true, result = { spoken: true } } = {}) {
    const data = new Map([
        ['eltauler_tts_presets', JSON.stringify(presets)],
        ['eltauler_tts_default_preset', saved]
    ]);
    const speaker = {
        available: () => available,
        speak: jest.fn(() => Promise.resolve(result)),
        prefetch: jest.fn(), stop: jest.fn()
    };
    const synth = { getVoices: () => voices, speak: jest.fn(), cancel: jest.fn() };
    function Utterance(text) { this.text = text; }
    const context = vm.createContext({
        window: { Audio: function () {}, speechSynthesis: synth, SpeechSynthesisUtterance: Utterance,
            ElTaulerVeuNeural: neural ? { ...Neural, sharedSpeaker: () => speaker } : undefined },
        SpeechSynthesisUtterance: Utterance,
        ElTaulerRedactor: Redactor,
        localStorage: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) },
        setTimeout, clearTimeout, showToast: jest.fn()
    });
    const coachSpeechCode = source.slice(source.indexOf('function speakableChessText(text)'), source.indexOf('function speakCoachText(text)'));
    vm.runInContext(speechCode + '\n' + coachSpeechCode + '\nupdateReviewTtsButtons = () => {};', context);
    return { run: code => vm.runInContext(code, context), synth, speaker };
}

describe('perfil de lectura Matxa i alternativa catalana del sistema', () => {
    test.each([true, false])('la ressenya diu peó i peons amb Matxa disponible: %s', available => {
        const app = setup({ available });
        app.run("beginReviewTts('El pawn defensa dos pawns.', 'settings')");
        const text = available ? app.speaker.speak.mock.calls[0][0] : app.synth.speak.mock.calls[0][0].text;
        expect(text).toBe('El peó defensa dos peons.');
    });

    test('la lectura de l’entrenador també normalitza els noms', () => {
        const app = setup();
        expect(app.run("speakableChessText('El pawn defensa dos pawns amb Nf3.')"))
            .toBe('El peó defensa dos peons amb cavall f 3.');
    });

    test.each([undefined, '', 'default', 'perfil-esborrat'])('Elia per defecte amb preferència %s', saved => {
        const app = setup({ saved });
        expect(app.run('getEffectiveReviewTtsPreset().voiceURI')).toBe('matxa:central:elia');
        expect(app.run('defaultNeuralTtsVoice().id')).toBe('matxa:central:elia');
    });

    test('migra els perfils antics amb veu automàtica i conserva els ajustos', () => {
        const app = setup({ saved: 'personal', presets: [{ id: 'personal', name: 'Personal', voiceURI: '', rate: 0.8 }] });
        expect(app.run('getEffectiveReviewTtsPreset().voiceURI')).toBe('matxa:central:elia');
        expect(app.run('getEffectiveReviewTtsPreset().rate')).toBe(0.8);
    });

    test('respecta una veu explícita desada', () => {
        const app = setup({ saved: 'personal', presets: [{ id: 'personal', name: 'Personal', voiceURI: CA_ES.voiceURI }] });
        expect(app.run('getEffectiveReviewTtsPreset().voiceURI')).toBe(CA_ES.voiceURI);
        expect(app.run('defaultNeuralTtsVoice()')).toBeNull();
    });

    test('llegeix amb Elia si el servei respon', async () => {
        const app = setup();
        app.run("beginReviewTts('Bon dia.', 'settings')");
        await Promise.resolve();
        expect(app.speaker.speak).toHaveBeenCalledWith('Bon dia.', 'matxa:central:elia', expect.any(Object));
        expect(app.synth.speak).not.toHaveBeenCalled();
    });

    test('si Matxa falla, repeteix el fragment amb ca-ES encara que ca-AD aparegui primer', async () => {
        const app = setup({ result: { spoken: false, reason: 'network' } });
        app.run("beginReviewTts('Bon dia.', 'settings')");
        await Promise.resolve();
        expect(app.synth.speak).toHaveBeenCalledTimes(1);
        expect(app.synth.speak.mock.calls[0][0]).toMatchObject({ text: 'Bon dia.', voice: CA_ES, lang: 'ca-ES' });
    });

    test.each([{ available: false }, { neural: false }, { saved: 'system-ca-es' }])('fa servir el sistema directament quan correspon: %j', options => {
        const app = setup(options);
        app.run("beginReviewTts('Bon dia.', 'settings')");
        expect(app.speaker.speak).not.toHaveBeenCalled();
        expect(app.synth.speak.mock.calls[0][0]).toMatchObject({ voice: CA_ES, lang: 'ca-ES' });
    });

    test('amb veus encara no carregades demana ca-ES al navegador', () => {
        const app = setup({ voices: [], available: false });
        app.run("beginReviewTts('Bon dia.', 'settings')");
        expect(app.synth.speak.mock.calls[0][0].lang).toBe('ca-ES');
    });

    test('aturar la lectura evita una alternativa tardana després de la fallada neuronal', async () => {
        const app = setup({ result: { spoken: false, reason: 'network' } });
        app.run("beginReviewTts('Bon dia.', 'settings'); stopReviewTts();");
        await Promise.resolve();
        expect(app.synth.speak).not.toHaveBeenCalled();
    });
});
