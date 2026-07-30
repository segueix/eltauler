const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

describe('Rival Antídot — comentaris i alerta en viu', () => {
  test('inclou un panell persistent amb estat accessible', () => {
    expect(app).toContain('ANTIDOTE_LIVE_FEEDBACK_V1');
    expect(app).toContain("panel.setAttribute('aria-live', 'polite')");
    expect(app).toContain('function showAntidoteTurnAlert(test)');
  });

  test('avisa just després de la jugada rival i abans de la premove', () => {
    const alertAt = app.indexOf('showAntidoteTurnAlert(antidoteState ? antidoteState.pendingTest : null)');
    const premoveAt = app.indexOf('playPremoveIfQueued();', alertAt);
    expect(alertAt).toBeGreaterThan(-1);
    expect(premoveAt).toBeGreaterThan(alertAt);
  });

  test('ofereix pautes específiques per les categories principals', () => {
    ['missed_tactic', 'lost_material', 'king_safety', 'endgame_turning_point', 'strategic_error']
      .forEach(theme => expect(app).toContain(theme + ':'));
  });

  test('explica els quatre resultats sense revelar la jugada abans de moure', () => {
    expect(app).toContain("test.result === 'passed'");
    expect(app).toContain("test.result === 'partial'");
    expect(app).toContain("test.result === 'failed'");
    expect(app).toContain('no et donarà la jugada correcta abans de moure');
  });

  test('la configuració descriu els nous comentaris i l’alerta', () => {
    expect(html).toContain('avisa quan el rival activa un error habitual');
    expect(html).toContain('app.js?v=1.0.69');
  });
});
