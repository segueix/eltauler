const Core = require('../core.js');

// Constants reals d'app.js.
const ELO_MIN = 200;
const ELO_MAX = 2000;
const ELO_MILESTONES = [800, 1000, 1200, 1400, 1600, 1800, 2000];
const CALIBRATION_START_ROC = 300;
const CALIBRATION_STEPS = [220, 160, 110, 80];
const CALIBRATION_ROC_MIN = 200;
const CALIBRATION_ROC_MAX = 2000;
const CALIB_CONFIG = {
    startRoc: CALIBRATION_START_ROC,
    steps: CALIBRATION_STEPS,
    rocMin: CALIBRATION_ROC_MIN,
    rocMax: CALIBRATION_ROC_MAX
};

describe('clampUserElo', () => {
    test('el terra flexible és el 45% del terra de calibratge', () => {
        // floor 1000 → terra flexible = max(200, 450) = 450
        expect(Core.clampUserElo(100, 1000, ELO_MIN, ELO_MAX)).toBe(450);
        expect(Core.clampUserElo(900, 1000, ELO_MIN, ELO_MAX)).toBe(900);
    });

    test('mai per sota del mínim global', () => {
        // floor 300 → terra flexible = max(200, 135) = 200
        expect(Core.clampUserElo(50, 300, ELO_MIN, ELO_MAX)).toBe(200);
    });

    test('limita pel màxim global', () => {
        expect(Core.clampUserElo(5000, 1000, ELO_MIN, ELO_MAX)).toBe(ELO_MAX);
    });

    test('floor no numèric recau al mínim global', () => {
        expect(Core.clampUserElo(100, null, ELO_MIN, ELO_MAX)).toBe(ELO_MIN);
    });
});

describe('getBaselineAdjustmentDelta', () => {
    test('victòria de qualitat puja més que una de justa', () => {
        expect(Core.getBaselineAdjustmentDelta('win', 0.8)).toBe(10);
        expect(Core.getBaselineAdjustmentDelta('win', 0.5)).toBe(6);
    });

    test('derrota digna penalitza menys que una de dolenta', () => {
        expect(Core.getBaselineAdjustmentDelta('loss', 0.7)).toBe(-10);
        expect(Core.getBaselineAdjustmentDelta('loss', 0.3)).toBe(-18);
    });

    test('les taules no ajusten', () => {
        expect(Core.getBaselineAdjustmentDelta('draw', 0.9)).toBe(0);
    });
});

describe('getNewlyUnlockedMilestones', () => {
    test('retorna les fites creuades en pujar', () => {
        expect(Core.getNewlyUnlockedMilestones(950, 1250, ELO_MILESTONES, []))
            .toEqual([1000, 1200]);
    });

    test('ignora les ja desbloquejades', () => {
        expect(Core.getNewlyUnlockedMilestones(950, 1250, ELO_MILESTONES, [1000]))
            .toEqual([1200]);
    });

    test('no desbloqueja res en baixar de nivell', () => {
        expect(Core.getNewlyUnlockedMilestones(1300, 1100, ELO_MILESTONES, []))
            .toEqual([]);
    });

    test('és pura: no muta la llista de ja desbloquejades', () => {
        const already = [800];
        Core.getNewlyUnlockedMilestones(950, 1250, ELO_MILESTONES, already);
        expect(already).toEqual([800]);
    });
});

describe('clampCalibrationRoc', () => {
    test('arrodoneix i limita al rang de calibratge', () => {
        expect(Core.clampCalibrationRoc(123.4, CALIBRATION_ROC_MIN, CALIBRATION_ROC_MAX)).toBe(200);
        expect(Core.clampCalibrationRoc(9999, CALIBRATION_ROC_MIN, CALIBRATION_ROC_MAX)).toBe(2000);
        expect(Core.clampCalibrationRoc(750.6, CALIBRATION_ROC_MIN, CALIBRATION_ROC_MAX)).toBe(751);
    });
});

describe('getCalibrationOpponentRoc (cerca adaptativa)', () => {
    test('la primera partida usa el ROC inicial', () => {
        expect(Core.getCalibrationOpponentRoc([], CALIB_CONFIG)).toBe(CALIBRATION_START_ROC);
    });

    test('guanyar fa pujar el rival el primer pas', () => {
        const games = [{ result: 'win', opponentElo: 300 }];
        expect(Core.getCalibrationOpponentRoc(games, CALIB_CONFIG)).toBe(300 + 220);
    });

    test('perdre fa baixar el rival', () => {
        const games = [{ result: 'loss', opponentElo: 600 }];
        expect(Core.getCalibrationOpponentRoc(games, CALIB_CONFIG)).toBe(600 - 220);
    });

    test('les taules apugen poc (20% del pas)', () => {
        const games = [{ result: 'draw', opponentElo: 500 }];
        expect(Core.getCalibrationOpponentRoc(games, CALIB_CONFIG)).toBe(500 + Math.round(220 * 0.2));
    });

    test('els passos decreixen a mesura que avança el calibratge', () => {
        const games = [
            { result: 'win', opponentElo: 300 },
            { result: 'win', opponentElo: 520 }
        ];
        // segona transició → pas índex 1 (160)
        expect(Core.getCalibrationOpponentRoc(games, CALIB_CONFIG)).toBe(520 + 160);
    });

    test('el resultat queda dins del rang de calibratge', () => {
        const games = [{ result: 'loss', opponentElo: 250 }];
        expect(Core.getCalibrationOpponentRoc(games, CALIB_CONFIG)).toBe(CALIBRATION_ROC_MIN);
    });
});

describe('getCalibrationGameQuality', () => {
    test('partida neta i precisa dona qualitat alta', () => {
        expect(Core.getCalibrationGameQuality({ avgCpLoss: 10, precision: 90, blunders: 0 }))
            .toBeGreaterThan(0.8);
    });

    test('molta pèrdua i blunders donen qualitat baixa', () => {
        expect(Core.getCalibrationGameQuality({ avgCpLoss: 300, precision: 30, blunders: 5 }))
            .toBeLessThan(0.3);
    });

    test('queda dins de [0, 1] amb valors extrems', () => {
        const q = Core.getCalibrationGameQuality({ avgCpLoss: 9999, precision: 0, blunders: 50 });
        expect(q).toBeGreaterThanOrEqual(0);
        expect(q).toBeLessThanOrEqual(1);
    });
});

describe('getCalibrationPerformanceScore', () => {
    test('sense partides retorna el valor neutre 0.5', () => {
        expect(Core.getCalibrationPerformanceScore([])).toBe(0.5);
        expect(Core.getCalibrationPerformanceScore(undefined)).toBe(0.5);
    });

    test('guanyar amb bona qualitat puntua més que perdre malament', () => {
        const bo = Core.getCalibrationPerformanceScore([{ result: 'win', avgCpLoss: 10, precision: 90, blunders: 0 }]);
        const dolent = Core.getCalibrationPerformanceScore([{ result: 'loss', avgCpLoss: 300, precision: 20, blunders: 4 }]);
        expect(bo).toBeGreaterThan(dolent);
        expect(bo).toBeLessThanOrEqual(1);
        expect(dolent).toBeGreaterThanOrEqual(0);
    });
});
