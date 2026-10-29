const fs = require('fs');
const vm = require('vm');
const Neural = require('../veuneural');
const Redactor = require('../redactor');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const speechCode = source.slice(source.indexOf('const REVIEW_TTS_STATE ='), source.indexOf('function getCoachDiagnosisText()'));
const CA_ES = { lang: 'ca-ES', name: 'Català Espanya', voiceURI: 'catala-es' };
const CA_AD = { lang: 'ca-AD', name: 'Català Andorra', voiceURI: 'catala-ad' };
const FLAT = { low: 0, lowmid: 0, mid: 0, presence: 0, high: 0 };

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
    test('els controls de TV copien el perfil base una vegada i desen els quatre ajustos', () => {
        const app = setup({ saved: 'matxa-radio' });
        app.run("updateNeuralTtsSettings({ effects: { intensity: 0.8 } })");
        const id = app.run('getDefaultReviewTtsPresetId()');
        app.run("updateNeuralTtsSettings({ effects: { clarity: 0.7, volume: 0 }, rate: 1.05 })");
        expect(app.run('readReviewTtsPresets().length')).toBe(1);
        expect(app.run('getDefaultReviewTtsPresetId()')).toBe(id);
        expect(app.run('defaultNeuralTtsVoice()')).toEqual({ id: 'matxa:central:elia', rate: 1.05,
            effects: { profile: 'radio', intensity: 0.8, clarity: 0.7, volume: 0, eq: FLAT } });
        // L'antic perfil base «Ràdio» ara és el perfil base Matxa (sempre Ràdio).
        expect(app.run("getReviewTtsPresetById('matxa-radio').matxaEffects")).toEqual({ profile: 'radio' });
        app.run("beginReviewTts('Una forquilla.', 'settings')");
        expect(app.speaker.speak.mock.calls[0][2]).toMatchObject({ rate: 1.05,
            effects: { profile: 'radio', intensity: 0.8, clarity: 0.7, volume: 0 } });
    });

    test('l’equalitzador de TV es desa al perfil i arriba a les ressenyes', () => {
        const app = setup({ saved: 'matxa' });
        app.run("updateNeuralTtsSettings({ effects: { eq: { low: 5, presence: -3, high: 40 } } })");
        expect(app.run('defaultNeuralTtsVoice().effects.eq')).toEqual({ low: 5, lowmid: 0, mid: 0, presence: -3, high: 12 });
        app.run("updateNeuralTtsSettings({ effects: { volume: 0.5 } })");
        expect(app.run('defaultNeuralTtsVoice().effects.eq.low')).toBe(5);
        app.run("beginReviewTts('Una forquilla.', 'settings')");
        expect(app.speaker.speak.mock.calls[0][2].effects.eq).toMatchObject({ low: 5, presence: -3 });
    });

    test('només hi ha un perfil base Matxa, el de Ràdio', () => {
        const app = setup();
        expect(app.run('builtinReviewTtsPresets().map(p => p.id)')).toEqual(['matxa', 'system-ca-es']);
        expect(app.run('builtinReviewTtsPresets()[0].name')).toBe('Matxa · Elia · Ràdio');
    });

    test('TV actualitza el perfil personal existent i limita la velocitat de Matxa', () => {
        const app = setup({ saved: 'personal', presets: [{ id: 'personal', name: 'La meva veu', voiceURI: 'matxa:balear:quim', rate: 1 }] });
        app.run("updateNeuralTtsSettings({ rate: 2, effects: { profile: 'warm' } })");
        expect(app.run('defaultNeuralTtsVoice().rate')).toBe(1.11);
        expect(app.run('defaultNeuralTtsVoice().id')).toBe('matxa:balear:quim');
        expect(app.run('readReviewTtsPresets().length')).toBe(1);
        expect(app.run('readReviewTtsPresets()[0].name')).toBe('La meva veu');
        app.run('updateNeuralTtsSettings({ rate: 0.1 })');
        expect(app.run('defaultNeuralTtsVoice().rate')).toBe(0.81);
    });

    test('els ajustos de TV no modifiquen cap perfil del sistema', () => {
        const app = setup({ saved: 'system-ca-es' });
        expect(app.run("updateNeuralTtsSettings({ rate: 1.1, effects: { volume: 0.2 } })")).toBeNull();
        expect(app.run('readReviewTtsPresets()')).toEqual([]);
        expect(app.run('getDefaultReviewTtsPresetId()')).toBe('system-ca-es');
    });

    test.each(['matxa', 'matxa-warm', 'matxa-radio'])('el perfil base desat %s arriba com a Ràdio a les ressenyes i al pont de TV', saved => {
        const app = setup({ saved });
        expect(app.run('defaultNeuralTtsVoice().effects')).toEqual({ profile: 'radio', intensity: 0.6, clarity: 0.5, volume: 1, eq: FLAT });
        app.run("beginReviewTts('Una forquilla.', 'settings')");
        expect(app.speaker.speak.mock.calls[0][2].effects).toEqual({ profile: 'radio' });
    });

    test('els perfils personals antics passen a Ràdio i conserven els ajustos', () => {
        const app = setup({ saved: 'personal', presets: [{ id: 'personal', name: 'Personal', voiceURI: 'matxa:central:elia' }] });
        expect(app.run('defaultNeuralTtsVoice().effects.profile')).toBe('radio');
        app.run("writeReviewTtsPresets([{ id: 'personal', name: 'Personal', voiceURI: 'matxa:central:elia', matxaEffects: { profile: 'warm', intensity: 0.3, clarity: 0.8, volume: 0 } }])");
        expect(app.run('defaultNeuralTtsVoice().effects')).toEqual({ profile: 'radio', intensity: 0.3, clarity: 0.8, volume: 0, eq: FLAT });
    });

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
