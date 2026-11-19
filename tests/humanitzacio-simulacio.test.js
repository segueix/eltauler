// Humanització · el sistema de proves per lots (scripts/simula-humanitzacio.js):
// una partida real amb els motors de l'app, en les tres configuracions, i el resum.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

describe('Humanització · simulació per lots', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'humanitzacio-'));
  afterAll(() => { try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) { /* res */ } });

  test('juga una partida a cada configuració i en deixa el resum (resum.json)', () => {
    execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'simula-humanitzacio.js'),
      '--games', '1', '--workers', '1', '--analysis-ms', '200', '--player-ms', '10', '--out', out], { stdio: 'pipe', timeout: 150000 });
    const resum = JSON.parse(fs.readFileSync(path.join(out, 'resum.json'), 'utf8'));
    ['sense', 'anterior', 'humanitzada'].forEach((m) => {
      const s = resum.modes[m];
      expect(s.games).toBe(1);
      expect(s.whiteWins + s.blackWins + s.draws).toBeCloseTo(100, 0);
      expect(s.measuredMoves).toBeGreaterThan(10);
      expect(Object.keys(s.per100)).toEqual(['bona', 'imprecisio', 'error', 'errorGreu']);
      expect(s.errorTypes.tots).toBeDefined();
    });
    expect(resum.modes.humanitzada.human.decisions).toBeGreaterThan(5);
    expect(resum.modes.sense.human).toBeUndefined();
  }, 160000);
});
