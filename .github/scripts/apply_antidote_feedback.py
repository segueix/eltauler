from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


app = Path('app.js')
source = app.read_text(encoding='utf-8')
marker = 'ANTIDOTE_LIVE_FEEDBACK_V1'

if marker not in source:
    old_pref = """function saveAntidoteNoticesPreference(enabled) {
    antidoteNoticesEnabled = !!enabled;
    try { localStorage.setItem(ANTIDOTE_NOTICES_KEY, antidoteNoticesEnabled ? '1' : '0'); } catch (e) {}
}
"""
    helper = r'''
// ANTIDOTE_LIVE_FEEDBACK_V1
// Comentari en viu del Rival Antídot. Avisa que s'està treballant un patró
// personal i explica què convé observar, però no revela mai la jugada correcta
// abans que l'usuari decideixi.
function ensureAntidoteLivePanel() {
    let panel = document.getElementById('antidote-live-coach');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'antidote-live-coach';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.style.display = 'none';
    panel.innerHTML = '<div class="antidote-live-head"><span class="antidote-live-icon">🧬</span><strong class="antidote-live-title">Rival Antídot</strong></div>'
        + '<div class="antidote-live-text"></div><div class="antidote-live-guide"></div>';
    const anchor = document.getElementById('tactic-theme-banner');
    if (anchor && anchor.parentNode) anchor.insertAdjacentElement('afterend', panel);
    else {
        const gameScreen = document.getElementById('game-screen');
        if (gameScreen) gameScreen.insertBefore(panel, gameScreen.querySelector('.board-container'));
    }
    if (!document.getElementById('antidote-live-feedback-style')) {
        const style = document.createElement('style');
        style.id = 'antidote-live-feedback-style';
        style.textContent = `
            #antidote-live-coach{margin:10px 0 12px;padding:11px 13px;border:1px solid rgba(153,132,224,.42);border-left:5px solid #7b68b8;border-radius:12px;background:linear-gradient(135deg,rgba(74,61,114,.34),rgba(35,29,58,.52));text-align:left;line-height:1.4;box-shadow:0 4px 14px rgba(0,0,0,.16)}
            #antidote-live-coach .antidote-live-head{display:flex;align-items:center;gap:7px;margin-bottom:4px}
            #antidote-live-coach .antidote-live-title{font-size:.88rem;letter-spacing:.2px}
            #antidote-live-coach .antidote-live-text{font-size:.86rem;color:var(--text-primary)}
            #antidote-live-coach .antidote-live-guide{font-size:.78rem;color:var(--text-secondary);margin-top:5px}
            #antidote-live-coach.antidote-live-alert{border-left-color:#f0a02f;background:linear-gradient(135deg,rgba(138,83,20,.32),rgba(56,35,29,.58));animation:antidoteAlertPulse 1.2s ease-out 1}
            #antidote-live-coach.antidote-live-success{border-left-color:#4c9a5a;background:linear-gradient(135deg,rgba(40,105,57,.3),rgba(27,55,38,.5))}
            #antidote-live-coach.antidote-live-partial{border-left-color:#c9a227}
            #antidote-live-coach.antidote-live-failed{border-left-color:#c0504d;background:linear-gradient(135deg,rgba(126,50,48,.3),rgba(58,29,29,.54))}
            #antidote-live-coach.antidote-live-thinking{opacity:.86}
            @keyframes antidoteAlertPulse{0%{transform:scale(.985);box-shadow:0 0 0 0 rgba(240,160,47,.48)}55%{transform:scale(1);box-shadow:0 0 0 8px rgba(240,160,47,0)}100%{box-shadow:0 4px 14px rgba(0,0,0,.16)}}
            body.epaper-mode #antidote-live-coach{background:#f2f2f2;border-color:#aaa;color:#222;box-shadow:none;animation:none}
            @media(max-width:420px){#antidote-live-coach{padding:9px 10px;margin:8px 0 10px}#antidote-live-coach .antidote-live-text{font-size:.82rem}}
        `;
        document.head.appendChild(style);
    }
    return panel;
}

function hideAntidoteLivePanel() {
    const panel = document.getElementById('antidote-live-coach');
    if (panel) panel.style.display = 'none';
}

function setAntidoteLiveComment(kind, title, text, guide) {
    if (!antidoteNoticesEnabled || !isAntidoteMode()) {
        hideAntidoteLivePanel();
        return;
    }
    const panel = ensureAntidoteLivePanel();
    if (!panel) return;
    panel.className = 'antidote-live-' + (kind || 'info');
    const titleEl = panel.querySelector('.antidote-live-title');
    const textEl = panel.querySelector('.antidote-live-text');
    const guideEl = panel.querySelector('.antidote-live-guide');
    if (titleEl) titleEl.textContent = title || 'Rival Antídot';
    if (textEl) textEl.textContent = text || '';
    if (guideEl) {
        guideEl.textContent = guide || '';
        guideEl.style.display = guide ? '' : 'none';
    }
    panel.style.display = 'block';
}

function antidoteGuidanceForTheme(theme) {
    const guides = {
        missed_win: 'Busca primer escacs, captures i amenaces; pot haver-hi una continuació que decideixi la partida.',
        lost_advantage: 'Abans de simplificar o accelerar, comprova què manté la iniciativa i quines peces necessiten millorar.',
        turned_losing: 'Atura’t i revisa amenaces immediates, peces sense defensa i canvis irreversibles.',
        missed_tactic: 'Fes l’escaneig tàctic: escacs, captures, amenaces, peces clavades i dobles atacs.',
        lost_material: 'Comprova totes les peces atacades i defensades, especialment les que només tenen un defensor.',
        king_safety: 'Mira línies obertes, peces que apunten al rei, caselles d’escapada i possibles canvis de dames.',
        endgame_turning_point: 'Valora activitat del rei, peons passats, oposició i si el canvi de peces t’afavoreix.',
        strategic_error: 'Pregunta’t quina és la teva pitjor peça, quin pla prepara el rival i quina jugada millora la posició.'
    };
    return guides[theme] || 'Mira què ha canviat amb l’última jugada, què amenaça el rival i quines respostes candidates tens.';
}

function showAntidoteThinkingComment() {
    setAntidoteLiveComment('thinking', '🧬 El rival prepara la prova',
        'Stockfish compara diverses jugades fortes i busca quina et farà treballar millor.',
        'La jugada continuarà sent objectivament bona: la diferència és el valor d’entrenament per al teu perfil.');
}

function showAntidoteTurnAlert(test) {
    if (!isAntidoteMode() || !antidoteNoticesEnabled) return;
    if (!test || !test.theme) {
        setAntidoteLiveComment('info', '🧬 Jugada d’entrenament',
            'El rival ha fet una jugada forta, però aquesta vegada no activa cap prova personal prou clara.',
            'Juga amb normalitat: revisa amenaces, captures i el teu pla abans de decidir.');
        return;
    }
    const themeLabel = ElTaulerCore.antidoteWeaknessLabel(test.theme) || 'patró personal';
    const subthemeLabel = test.subtheme ? ElTaulerCore.antidoteThemeLabel(test.subtheme) : '';
    const focus = subthemeLabel && subthemeLabel !== themeLabel ? themeLabel + ' · ' + subthemeLabel : themeLabel;
    setAntidoteLiveComment('alert', '⚠️ Alerta Antídot · ' + focus,
        'Aquesta posició practica un patró que ja t’ha costat en partides anteriors.',
        antidoteGuidanceForTheme(test.theme));
    showToast('Alerta Antídot: estàs practicant ' + themeLabel.toLowerCase(), 'warn');
}

function antidoteResultComment(test) {
    const themeLabel = ElTaulerCore.antidoteWeaknessLabel(test.theme) || 'aquest patró';
    const best = test.bestResponseSan || test.bestResponse || null;
    const loss = typeof test.responseCpLoss === 'number' ? Math.round(test.responseCpLoss) : null;
    if (test.result === 'passed') {
        return { kind:'success', title:'✅ Prova superada · ' + themeLabel,
            text:'Has reconegut bé el problema i la teva resposta ha mantingut la posició sota control.',
            guide:(loss !== null && loss > 0 ? 'La resposta ha cedit només ' + loss + ' centpeons.' : 'Aquesta resolució farà baixar gradualment el pes d’aquest error al teu perfil.'),
            toast:'Prova superada: ' + themeLabel, toastKind:'success' };
    }
    if (test.result === 'partial') {
        return { kind:'partial', title:'🟡 Prova parcial · ' + themeLabel,
            text:'Has vist una part del problema, però la posició encara permetia una resposta més precisa.',
            guide:(best ? 'La resposta més precisa era ' + best + '. ' : '') + 'Aquest patró continuarà apareixent amb menys insistència.',
            toast:'Prova parcial: ' + themeLabel, toastKind:'info' };
    }
    if (test.result === 'failed') {
        return { kind:'failed', title:'🔴 Error practicat · ' + themeLabel,
            text:'Ha reaparegut un patró que ja t’havia costat. No és només una errada aïllada: era la situació que el Rival Antídot volia entrenar.',
            guide:(best ? 'La resposta recomanada era ' + best + '. ' : '') + 'La posició quedarà disponible al repàs de les teves fallades.',
            toast:'Alerta confirmada: aquest patró tornarà al teu entrenament', toastKind:'warn' };
    }
    return { kind:'info', title:'🧬 Prova sense conclusió · ' + themeLabel,
        text:'La posició no permet mesurar amb prou seguretat si el patró s’ha resolt.',
        guide:'No comptarà ni com a encert ni com a fallada.', toast:'Prova sense conclusió', toastKind:'info' };
}
'''
    new_pref = old_pref.replace("}\n", "    if (!antidoteNoticesEnabled) hideAntidoteLivePanel();\n}\n", 1) + helper
    source = source.replace(old_pref, new_pref, 1)

    replacements = [
        ("""    antidoteState = null;
    antidoteSearchToken++;   // invalida qualsevol cerca Antídot encara viva
    if (!antidoteRequest) releaseAntidoteEngine();
    currentReview = [];
""",
"""    antidoteState = null;
    antidoteSearchToken++;   // invalida qualsevol cerca Antídot encara viva
    if (!antidoteRequest) {
        releaseAntidoteEngine();
        hideAntidoteLivePanel();
    }
    currentReview = [];
"""),
        ("""        $('#engine-elo').text('Antídot · Stockfish');
        $('#game-mode-title').text('🧬 Rival Antídot');
        // El worker COMPARTIT es queda com sempre (el fallback l'ha de trobar
""",
"""        $('#engine-elo').text('Antídot · Stockfish');
        $('#game-mode-title').text('🧬 Rival Antídot');
        setTimeout(() => setAntidoteLiveComment('info', '🧬 Entrenament personal actiu',
            'Durant la partida t’avisaré quan Stockfish porti la posició cap a un error que ja has comès altres vegades.',
            'L’alerta indicarà què convé observar, però no et donarà la jugada correcta abans de moure.'), 0);
        // El worker COMPARTIT es queda com sempre (el fallback l'ha de trobar
"""),
        ("""    isEngineThinking = true;
    $('#status').text("L'adversari pensa...");
    if (engineReplyStartTs === null) engineReplyStartTs = nowMs();
""",
"""    isEngineThinking = true;
    $('#status').text("L'adversari pensa...");
    showAntidoteThinkingComment();
    if (engineReplyStartTs === null) engineReplyStartTs = nowMs();
"""),
        ("""// Avís breu i no intrusiu (mai una finestra modal). Es pot desactivar des de
// Configuració. No diu MAI quina categoria s'estava examinant.
function showAntidoteMoveNotice(test) {
    if (!antidoteNoticesEnabled || !test) return;
    if (test.result === 'passed') showToast('Prova superada', 'success');
    else if (test.result === 'partial') showToast('Ho has defensat parcialment', 'info');
    else if (test.result === 'failed') showToast('Aquest patró tornarà al teu entrenament', 'warn');
}
""",
"""// Comentari immediat després de la resposta. Manté el missatge visible al
// panell perquè es pugui llegir amb calma i deixa el toast com a resum curt.
function showAntidoteMoveNotice(test) {
    if (!antidoteNoticesEnabled || !test) return;
    const comment = antidoteResultComment(test);
    setAntidoteLiveComment(comment.kind, comment.title, comment.text, comment.guide);
    showToast(comment.toast, comment.toastKind);
}
"""),
        ("""        resetGameMoveNav();
        board.position(game.fen());
        // La premove, si encara és legal després de la resposta, es
""",
"""        resetGameMoveNav();
        board.position(game.fen());
        // En el Rival Antídot, aquest és el moment exacte en què comença el
        // torn del jugador: l'avís apareix després de veure la jugada rival i
        // abans d'una possible premove.
        if (isAntidoteMode()) showAntidoteTurnAlert(antidoteState ? antidoteState.pendingTest : null);
        // La premove, si encara és legal després de la resposta, es
""")
    ]
    for old, new in replacements:
        count = source.count(old)
        if count != 1:
            raise SystemExit(f'app.js: expected one match, found {count}: {old[:120]!r}')
        source = source.replace(old, new, 1)

    app.write_text(source, encoding='utf-8')

replace_once(
    'index.html',
    "Mostra un avís breu després de respondre una prova durant la partida. El resum final sempre es veu.",
    "Mostra comentaris durant cada prova: avisa quan el rival activa un error habitual, dona una pauta d’observació i explica la resposta després de moure. El resum final sempre es veu."
)
replace_once('index.html', 'app.js?v=1.0.68', 'app.js?v=1.0.69')
replace_once('sw.js', "const SW_VERSION = '3.9.90';", "const SW_VERSION = '3.9.91';")

Path('tests/antidote-feedback.test.js').write_text("""const fs = require('fs');
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
""", encoding='utf-8')

tests_doc = Path('TESTS.md')
doc = tests_doc.read_text(encoding='utf-8')
if 'antidote-feedback.test.js' not in doc:
    tests_doc.write_text(doc.rstrip() + """

- **`antidote-feedback.test.js`** — comprova el panell de comentaris en viu,
  l’alerta abans de la resposta del jugador, les pautes específiques per
  categoria, els quatre resultats pedagògics i el text de Configuració.
""" + '\n', encoding='utf-8')
