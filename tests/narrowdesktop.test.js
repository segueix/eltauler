const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Finestra estreta d'ordinador: les disposicions «d'escriptori» (dues
// columnes, rajoles en quatre columnes, escala de nivell vertical) només
// s'apliquen amb la finestra prou ampla. Sense aquest límit, a 420 px les
// rajoles de l'inici feien 50 px (text partit lletra a lletra), el tauler del
// taller d'obertures 4 px i el de la TV 0 px.
// ---------------------------------------------------------------------------
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../tallerobertures.css'), 'utf8');

// Retorna la condició @media que envolta la primera aparició de `needle`
// (o null si és fora de cap @media).
function enclosingMedia(src, needle) {
    const at = src.indexOf(needle);
    expect(at).toBeGreaterThan(-1);
    const open = src.lastIndexOf('@media', at);
    if (open < 0) return null;
    // L'@media ha de contenir el selector (les claus s'equilibren entremig).
    let depth = 0;
    for (let i = src.indexOf('{', open); i < at; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
    }
    return depth >= 1 ? src.slice(open, src.indexOf('{', open)).trim() : null;
}

describe('disposicions d’escriptori, només amb la finestra ampla', () => {
    test('inici: dues columnes i rajoles a quatre columnes a partir de 1000 px', () => {
        expect(enclosingMedia(html, 'body.device-desktop #start-screen .home-sections {')).toMatch(/min-width: 1000px/);
        expect(enclosingMedia(html, 'body.device-desktop #start-screen .home-sec--entrena > .home-tiles { grid-template-columns: repeat(4')).toMatch(/min-width: 1000px/);
        expect(enclosingMedia(html, 'body.device-desktop #start-screen .hb-hero .play-clock-chips')).toMatch(/min-width: 720px/);
    });
    test('TV i taller d’obertures: dues columnes a partir de 760 px', () => {
        expect(enclosingMedia(html, 'body.device-desktop .sftv-layout {')).toMatch(/min-width: 760px/);
        expect(enclosingMedia(html, 'body.device-desktop .sftv-board-row {')).toMatch(/min-width: 760px/);
        expect(enclosingMedia(css, 'body.device-desktop .olab-main {')).toMatch(/min-width: 760px/);
    });
});
