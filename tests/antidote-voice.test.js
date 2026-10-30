const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Core = require('../core.js');

const APP = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const first = APP.indexOf('function stopAntidoteVoice() {');
const last = APP.indexOf('// ANTIDOTE_LIVE_FEEDBACK_V1', first);
const voiceCode = APP.slice(first, last);

function coach(extra) {
    return Object.assign({
        theme: 'missed_tactic',
        subtheme: 'fork',
        result: 'failed',
        bestResponseSan: 'Nd5',
        responseCpLoss: 165
    }, extra);
}

function harness(options = {}) {
    const speak = jest.fn(() => Promise.resolve({ spoken: true }));
    const stop = jest.fn();
    const unlock = jest.fn();
    const notices = jest.fn();
    const speaker = { speak, stop, unlock, available: () => options.online !== false };
    const state = {
        antidoteVoiceEnabled: options.enabled !== false,
        antidoteVoiceActive: false,
        antidoteVoiceToken: 0,
        ANTIDOTE_VOICE_KEY: 'eltauler_antidote_veu',
        localStorage: { setItem: jest.fn() },
        document: { hidden: !!options.hidden },
        $: () => ({ is: () => true }),
        isAntidoteMode: () => options.mode !== false,
        timedGameInProgress: () => !!options.timed,
        voiceMusicApi: () => ({ prefs: () => ({ voice: options.globalVoice !== false }) }),
        neuralTtsAvailable: () => true,
        isNeuralTtsVoice: () => true,
        getEffectiveReviewTtsPreset: () => ({
            voiceURI: 'matxa:central:elia', rate: 1, matxaEffects: { profile: 'radio' }
        }),
        speakableChessText: str => str,
        stopGameNarration: notices,
        renderGameNarrationControls: jest.fn(),
        window: { ElTaulerVeuNeural: { sharedSpeaker: () => speaker } },
        Promise, console
    };
    vm.runInNewContext(voiceCode + '\nthis.api = { speakAntidoteFeedback, stopAntidoteVoice, saveAntidoteVoicePreference };', state);
    return { api: state.api, speak, stop, unlock, notices, state };
}

describe('Rival Antídot — estil directe, sense pistes', () => {
    test('la consigna i el pensament del rival no ofereixen cap text de veu', () => {
        expect(Core.antidoteTurnPrompt().speech).toBeUndefined();
        expect(Core.antidoteThinkingPrompt().speech).toBeUndefined();
        expect(Core.antidoteTurnPrompt().text.length).toBeLessThan(100);
    });
    test('cada resultat cert té una sola frase curta i específica', () => {
        ['passed', 'partial', 'failed'].forEach(result => {
            const message = Core.antidoteResultFeedback(coach({ result }));
            expect(message.speech).toBeTruthy();
            expect(message.speech.length).toBeLessThan(100);
            expect(message.speech).not.toMatch(/centipeons|provar de|situació que|ha tornat a passar/i);
        });
        expect(Core.antidoteResultFeedback(coach({ result: 'failed' })).speech).toContain('Nd5');
        expect(Core.antidoteResultFeedback(coach({ result: 'partial' })).speech).toContain('Nd5');
        expect(Core.antidoteResultFeedback(coach({ result: 'passed' })).speech).not.toContain('Nd5');
        expect(Core.antidoteResultFeedback(coach({ result: 'inconclusive' })).speech).toBeNull();
    });
    test('sense millor jugada comprovada no n’inventa cap', () => {
        const speech = Core.antidoteResultFeedback(coach({ bestResponseSan: null })).speech;
        expect(speech).not.toMatch(/millor|jugar|undefined/);
    });
    test('els textos complets de repàs segueixen disponibles per a cada tema', () => {
        expect(Core.antidoteResultFeedback(coach()).guide)
            .toContain(Core.antidoteGuidanceForTheme('missed_tactic'));
    });
});

describe('Rival Antídot — locució opcional i segura', () => {
    test('la configuració exposa un interruptor de veu independent', () => {
        expect(HTML).toContain('id="antidote-voice-toggle"');
        expect(APP).toContain("localStorage.getItem(ANTIDOTE_VOICE_KEY) === '1'");
        expect(APP).toContain("$('#antidote-voice-toggle').off('change')");
    });
    test('parla només després de la resposta i amb la veu Matxa del perfil', async () => {
        const h = harness();
        h.api.speakAntidoteFeedback(Core.antidoteResultFeedback(coach()));
        expect(h.speak).toHaveBeenCalledTimes(1);
        expect(h.speak.mock.calls[0][0]).toContain('Nd5');
        expect(h.speak.mock.calls[0][1]).toBe('matxa:central:elia');
        expect(h.notices).toHaveBeenCalledTimes(1);
        await Promise.resolve();
    });
    test.each([
        { enabled: false }, { timed: true }, { globalVoice: false },
        { hidden: true }, { online: false }, { mode: false }
    ])('no parla amb restriccions %p', opts => {
        const h = harness(opts);
        h.api.speakAntidoteFeedback(Core.antidoteResultFeedback(coach()));
        expect(h.speak).not.toHaveBeenCalled();
    });
    test('una prova inconclusa queda en silenci', () => {
        const h = harness();
        h.api.speakAntidoteFeedback(Core.antidoteResultFeedback(coach({ result: 'inconclusive' })));
        expect(h.speak).not.toHaveBeenCalled();
    });
    test('apagar la veu cancel·la la locució i no apaga l’àudio si no n’hi havia', () => {
        const h = harness();
        h.api.saveAntidoteVoicePreference(false);
        expect(h.stop).not.toHaveBeenCalled();
        h.api.saveAntidoteVoicePreference(true);
        expect(h.unlock).toHaveBeenCalled();
        h.api.speakAntidoteFeedback(Core.antidoteResultFeedback(coach()));
        h.api.saveAntidoteVoicePreference(false);
        expect(h.stop).toHaveBeenCalledTimes(1);
    });
    test('un canvi de partida atura la locució activa', () => {
        const h = harness();
        h.api.speakAntidoteFeedback(Core.antidoteResultFeedback(coach()));
        h.api.stopAntidoteVoice();
        expect(h.stop).toHaveBeenCalledTimes(1);
        expect(APP).toContain('stopAntidoteVoice();\n    antidoteSearchToken++');
    });
});
