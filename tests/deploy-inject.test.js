// Scripts que el desplegament (.github/workflows/desplega-web.yml) aplica a la
// portada abans de publicar-la: l'accés a Remigi a la capçalera i el títol i
// la presentació indexables (SEO). Si index.html canvia les marques que fan
// servir, el desplegament falla després del merge: aquí es comprova abans.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const hasPython = spawnSync('python3', ['--version']).status === 0;
const maybe = hasPython ? test : test.skip;

function run(script, file) {
    return spawnSync('python3', [path.join(ROOT, 'scripts', script), file], { encoding: 'utf8' });
}

describe('injeccions del desplegament a la portada', () => {
    let dir;
    let file;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eltauler-deploy-'));
        file = path.join(dir, 'index.html');
        fs.copyFileSync(path.join(ROOT, 'index.html'), file);
    });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    maybe('Remigi i SEO s\'apliquen, en el mateix ordre que el workflow', () => {
        const remigi = run('inject-remigi-link.py', file);
        expect(remigi.stderr + remigi.stdout).toBe('');
        expect(remigi.status).toBe(0);
        const seo = run('inject-seo.py', file);
        expect(seo.stderr + seo.stdout).toBe('');
        expect(seo.status).toBe(0);

        const html = fs.readFileSync(file, 'utf8');
        // Remigi: dins la barra de la capçalera, abans del nom d'usuari.
        const topbar = html.indexOf('<div class="home-topbar">');
        const link = html.indexOf('class="remigi-home-link"');
        const chip = html.indexOf('id="home-user-chip"');
        expect(topbar).toBeGreaterThan(-1);
        expect(link).toBeGreaterThan(topbar);
        expect(link).toBeLessThan(chip);
        // SEO: títol i presentació visibles sota la capçalera, abans de les xifres.
        const seoBlock = html.indexOf('class="seo-home-heading"');
        expect(seoBlock).toBeGreaterThan(html.indexOf('class="home-head"'));
        expect(seoBlock).toBeLessThan(html.indexOf('<div class="stats-row">'));
        expect(html).not.toContain('<!-- seo-home -->');
        expect(html).toContain('<title>Jugar a escacs online gratis en català | El Tauler</title>');
        // Els estils s'afegeixen al bloc principal, un sol cop.
        expect(html.split('/* Accés a Remigi a la capçalera de la portada').length - 1).toBe(1);
        expect(html.split('/* Text introductori indexable i visible de la portada').length - 1).toBe(1);
    });

    maybe('tornar-los a aplicar no duplica res', () => {
        for (let i = 0; i < 2; i++) {
            expect(run('inject-remigi-link.py', file).status).toBe(0);
            expect(run('inject-seo.py', file).status).toBe(0);
        }
        const html = fs.readFileSync(file, 'utf8');
        expect(html.split('class="remigi-home-link"').length - 1).toBe(1);
        expect(html.split('class="seo-home-heading"').length - 1).toBe(1);
        expect(html.split('hreflang="ca"').length - 1).toBe(1);
    });
});

describe('injecció del desplegament a Remigi: l\'accés a El Tauler a la partida', () => {
    let dir;
    let file;
    // El tros de GameScreen.tsx de Remigi on va l'enllaç (la llista de jugadors).
    const GAME = [
        'export function GameScreen() {',
        '  return (',
        '      <header className="game-top">',
        '        <ul className="players">',
        '          {game.players.map((player, index) => {',
        '            return <li key={index} />;',
        '          })}',
        '        </ul>',
        '      </header>',
        '  );',
        '}',
        ''
    ].join('\n');
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eltauler-remigi-'));
        file = path.join(dir, 'GameScreen.tsx');
        fs.writeFileSync(file, GAME);
    });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    maybe('hi posa la icona d\'El Tauler (no el rei d\'escacs), un sol cop', () => {
        for (let i = 0; i < 2; i++) {
            const r = run('inject-tauler-link-remigi.py', file);
            expect(r.stderr + r.stdout).toBe('');
            expect(r.status).toBe(0);
        }
        const tsx = fs.readFileSync(file, 'utf8');
        expect(tsx.split('className="tauler-home-link"').length - 1).toBe(1);
        expect(tsx).toContain('href="https://eltauler.cat/"');
        expect(tsx).toContain('eltauler-192.png');
        expect(tsx).not.toContain('♔');
        // Davant dels jugadors.
        expect(tsx.indexOf('tauler-home-link')).toBeLessThan(tsx.indexOf('{game.players.map('));
    });
});
