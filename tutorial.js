// ============================================================================
// tutorial.js — «Aprèn a jugar» (lliçons d'escacs) i «Guia d'El Tauler»
// ============================================================================
// Dos tutorials integrats a l'app:
//
//   · APRÈN A JUGAR: les regles pas a pas sobre un tauler interactiu. Cada
//     lliçó és una seqüència de passos: text (amb posició i caselles
//     marcades), exploració (toca una peça i veus on pot anar) i exercicis
//     (fes una jugada concreta, captura, enroca, corona, fes mat...). El
//     progrés es desa a chess_tutorialProgress i viatja amb el compte.
//
//   · GUIA D'EL TAULER: què és cada modalitat i cada funció de l'app, amb un
//     botó que hi porta directament.
//
// El CONTINGUT i la LÒGICA PURA (validar una jugada d'exercici, destins d'una
// peça, resum del progrés) s'exporten també a Node perquè els tests comprovin,
// amb chess.js REAL, que totes les posicions són legals i que cada exercici
// té solució. La interfície (jQuery, chessboard.js) només s'activa al
// navegador.
//
// Es carrega com a:
//   - Navegador: <script src="tutorial.js"> → window.ElTaulerTutorial
//   - Node/Jest: require('./tutorial') → module.exports (contingut + lògica)
// ============================================================================
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.ElTaulerTutorial = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const PROGRESS_KEY = 'chess_tutorialProgress';
    const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    // ------------------------------------------------------------------
    // Lliçons. Cada pas:
    //   kind 'text'    → explicació; fen opcional ('empty' = tauler buit),
    //                    marks (caselles a ressaltar), showTargets (casella
    //                    d'una peça: es pinten les seves jugades legals).
    //   kind 'explore' → tauler on tocar una peça del bàndol que mou mostra
    //                    on pot anar.
    //   kind 'square'  → exercici: tocar una casella concreta.
    //   kind 'task'    → exercici: fer una jugada. accept: { moves: [uci…] }
    //                    o { predicate: 'checkmate'|'capture'|'castle'|
    //                    'promote'|'enpassant'|'check'|'any' }.
    // ------------------------------------------------------------------
    const LESSONS = [
        {
            id: 'tauler', title: 'El tauler i les peces', icon: '♟', summary: 'Caselles, columnes i files, i què hi ha a cada bàndol.',
            steps: [
                { kind: 'text', title: 'Un tauler de 64 caselles', fen: START_FEN, orientation: 'white',
                  text: 'El tauler té <strong>64 caselles</strong>, la meitat clares i la meitat fosques. Es col·loca de manera que cada jugador tingui una casella <strong>clara</strong> a la seva dreta. Les <strong>columnes</strong> van de la <em>a</em> a la <em>h</em>, d\'esquerra a dreta des del costat de les blanques, i les <strong>files</strong> de l\'1 al 8.' },
                { kind: 'text', title: 'El nom de cada casella', fen: 'empty', marks: ['e4'],
                  text: 'Cada casella té un nom: la lletra de la columna i el número de la fila. La casella marcada és <strong>e4</strong>: columna <em>e</em>, fila 4.' },
                { kind: 'square', fen: 'empty', square: 'd5',
                  text: 'Ara tu: toca la casella <strong>d5</strong>.',
                  success: 'Exacte: columna d, fila 5.', fail: 'Aquesta no és d5. Busca la columna d (la quarta) i la fila 5.' },
                { kind: 'text', title: 'Les peces', fen: START_FEN,
                  text: 'Cada bàndol comença amb <strong>16 peces</strong>: un rei, una dama, dues torres, dos alfils, dos cavalls i vuit peons. Fixa\'t que la dama comença a la casella del seu color (la dama blanca a d1, clara). Les <strong>blanques mouen primer</strong> i després els torns s\'alternen: una jugada cadascú.' },
                { kind: 'text', title: 'Què val cada peça', fen: '4k3/8/8/8/8/8/8/RNBQKB2 w - - 0 1', marks: ['a1', 'b1', 'c1', 'd1'],
                  text: 'Valor orientatiu per decidir canvis: <strong>peó 1</strong>, <strong>cavall 3</strong>, <strong>alfil 3</strong>, <strong>torre 5</strong>, <strong>dama 9</strong>. El rei no té valor: perdre\'l és perdre la partida, així que no es pot canviar per res.' }
            ]
        },
        {
            id: 'peo', title: 'El peó', icon: '♙', summary: 'Avança recte, captura en diagonal.',
            steps: [
                { kind: 'text', title: 'Endavant, mai enrere', fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', showTargets: 'e2',
                  text: 'El peó avança <strong>una casella</strong> cap endavant i mai no recula. Des de la seva casella inicial pot avançar <strong>una o dues</strong>. Les caselles marcades són on pot anar el peó de e2.' },
                { kind: 'explore', fen: '4k3/pp6/8/3p4/4P3/8/PP4PP/4K3 w - - 0 1',
                  text: 'Toca un peó blanc per veure on pot anar. Fixa\'t que el peó de <strong>e4</strong> pot capturar en diagonal el peó negre de d5, però no pot avançar si té una peça al davant.' },
                { kind: 'task', fen: START_FEN, accept: { moves: ['e2e4'] },
                  text: 'Avança el peó de <strong>e2</strong> dues caselles, fins a <strong>e4</strong>. Toca el peó i després la casella de destinació.',
                  success: 'Molt bé! 1. e4 és la jugada d\'obertura més popular.', fail: 'Volem el peó de e2 a e4. Toca primer el peó i després la casella e4.' },
                { kind: 'task', fen: '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', accept: { moves: ['e4d5'] },
                  text: 'Els peons capturen en <strong>diagonal</strong>. Captura el peó negre de d5 amb el peó de e4.',
                  success: 'Ben capturat: el peó ha pres en diagonal.', fail: 'El peó captura en diagonal cap endavant: de e4 a d5.' },
                { kind: 'text', title: 'La coronació', fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', marks: ['a7', 'a8'],
                  text: 'Quan un peó arriba a l\'<strong>última fila</strong>, es <strong>corona</strong>: es converteix en dama, torre, alfil o cavall (gairebé sempre, dama). Ho practicaràs a la lliçó de jugades especials.' }
            ]
        },
        {
            id: 'torre', title: 'La torre', icon: '♖', summary: 'Línies rectes, tan lluny com vulgui.',
            steps: [
                { kind: 'text', title: 'Rectes', fen: '4k3/8/8/8/3R4/8/8/4K3 w - - 0 1', showTargets: 'd4',
                  text: 'La torre es mou en <strong>línia recta</strong>, per columnes i files, tantes caselles com vulgui. Val 5 punts: només la dama val més.' },
                { kind: 'explore', fen: '4k3/1p6/8/8/8/8/8/R3K2R w - - 0 1',
                  text: 'Toca una torre per veure on pot anar. Les dues torres blanques es protegeixen mútuament per la primera fila.' },
                { kind: 'task', fen: '4k3/p7/8/8/8/8/8/R3K3 w - - 0 1', accept: { moves: ['a1a7'] },
                  text: 'Captura el peó negre de a7 amb la torre.',
                  success: 'Perfecte: la torre ha recorregut tota la columna.', fail: 'La torre de a1 arriba a a7 per la columna a: toca la torre i després el peó.' },
                { kind: 'text', title: 'No salta', fen: '4k3/8/8/8/8/8/P7/R3K3 w - - 0 1', showTargets: 'a1',
                  text: 'La torre <strong>no pot saltar</strong> peces: s\'atura davant de la primera que troba, o la captura si és del rival. Amb el peó propi a a2, la torre de a1 només pot moure\'s per la fila.' }
            ]
        },
        {
            id: 'alfil', title: 'L\'alfil', icon: '♗', summary: 'Diagonals, sempre del mateix color.',
            steps: [
                { kind: 'text', title: 'Diagonals', fen: '4k3/8/8/8/3B4/8/8/4K3 w - - 0 1', showTargets: 'd4',
                  text: 'L\'alfil es mou en <strong>diagonal</strong>, tantes caselles com vulgui. Cada alfil viu sempre en caselles del <strong>mateix color</strong>: un a les clares i l\'altre a les fosques. Val 3 punts.' },
                { kind: 'explore', fen: '4k3/8/2p5/8/8/8/8/2B1KB2 w - - 0 1',
                  text: 'Toca un alfil. L\'alfil de c1 va per les caselles fosques i el de f1 per les clares: mai no es trobaran.' },
                { kind: 'task', fen: '4k3/8/2p5/8/B7/8/8/4K3 w - - 0 1', accept: { moves: ['a4c6'] },
                  text: 'Captura el peó negre de c6 amb l\'alfil.',
                  success: 'Ben vist: a4, b5, c6, tot per la mateixa diagonal.', fail: 'L\'alfil de a4 arriba a c6 passant per b5. Toca l\'alfil i després el peó.' }
            ]
        },
        {
            id: 'dama', title: 'La dama', icon: '♕', summary: 'Torre i alfil alhora.',
            steps: [
                { kind: 'text', title: 'La peça més poderosa', fen: '4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1', showTargets: 'd4',
                  text: 'La dama combina la torre i l\'alfil: <strong>rectes i diagonals</strong>, tantes caselles com vulgui. Val 9 punts. Amb tant de poder, també és la peça que més convé protegir.' },
                { kind: 'task', fen: '4k3/6n1/8/8/3Q4/8/8/4K3 w - - 0 1', accept: { moves: ['d4g7'] },
                  text: 'Captura el cavall negre de g7 amb la dama.',
                  success: 'Exacte: d4, e5, f6, g7 per la diagonal.', fail: 'La dama arriba a g7 per la diagonal d4-e5-f6-g7.' },
                { kind: 'text', title: 'Amb seny', fen: 'rnbqkbnr/pppp1ppp/8/4p3/7Q/4P3/PPPP1PPP/RNB1KBNR b KQkq - 1 2',
                  text: 'Treure la dama massa aviat és un error habitual: el rival la va atacant amb peces menors i guanya temps mentre tu la salves. Desenvolupa primer cavalls i alfils.' }
            ]
        },
        {
            id: 'cavall', title: 'El cavall', icon: '♘', summary: 'Salta en forma de L.',
            steps: [
                { kind: 'text', title: 'En forma de L', fen: '4k3/8/8/8/3N4/8/8/4K3 w - - 0 1', showTargets: 'd4',
                  text: 'El cavall es mou en forma de <strong>L</strong>: dues caselles en una direcció i una en perpendicular. És l\'única peça que pot <strong>saltar</strong> per sobre d\'altres. Sempre canvia de color de casella. Val 3 punts.' },
                { kind: 'explore', fen: '4k3/8/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1',
                  text: 'Toca un cavall: des de la posició inicial pot saltar per sobre dels peons. Cap altra peça pot moure\'s a la primera jugada sense que abans es mogui un peó.' },
                { kind: 'task', fen: '4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1', accept: { moves: ['f3e5'] },
                  text: 'Captura el peó de e5 amb el cavall.',
                  success: 'Molt bé: de f3 a e5, dues amunt i una a l\'esquerra.', fail: 'El cavall de f3 arriba a e5: dues caselles amunt i una a l\'esquerra.' },
                { kind: 'task', fen: '2r3k1/8/8/3N4/8/8/8/6K1 w - - 0 1', accept: { moves: ['d5e7'] },
                  text: 'El cavall és ideal per a la <strong>forquilla</strong>: atacar dues peces alhora. Porta el cavall a la casella des d\'on ataca el rei i la torre a la vegada.',
                  success: 'Forquilla! El rei ha de sortir de l\'escac i el cavall es menjarà la torre.', fail: 'Busca la casella des d\'on el cavall ataca g8 i c8 alhora: és e7.' }
            ]
        },
        {
            id: 'rei', title: 'El rei', icon: '♔', summary: 'Una casella, mai a l\'escac.',
            steps: [
                { kind: 'text', title: 'Una casella en qualsevol direcció', fen: '4k3/8/8/8/3K4/8/8/8 w - - 0 1', showTargets: 'd4',
                  text: 'El rei es mou <strong>una casella</strong> en qualsevol direcció. No es pot posar mai en una casella <strong>atacada</strong> pel rival: seria posar-se en escac.' },
                { kind: 'text', title: 'Els reis no es toquen', fen: '8/8/8/3k4/8/3K4/8/8 w - - 0 1', showTargets: 'd3',
                  text: 'Els dos reis no poden ser mai a caselles veïnes: cadascun controla les que té al voltant. Per això el rei blanc de d3 no pot pujar a c4, d4 ni e4.' },
                { kind: 'task', fen: '4k3/8/8/8/8/3p4/3K4/8 w - - 0 1', accept: { moves: ['d2d3'] },
                  text: 'Captura el peó negre de d3 amb el rei: està desprotegit.',
                  success: 'Ben fet: el rei també captura, sempre que la casella no estigui atacada.', fail: 'El rei de d2 pot capturar a d3, just al davant.' },
                { kind: 'text', title: 'Protegeix-lo', fen: 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 w - - 6 6',
                  text: 'A l\'obertura el rei no és una peça d\'atac: posa\'l a cobert amb l\'<strong>enroc</strong> (ho veurem més endavant). Al final de la partida, amb poques peces, el rei sí que es torna actiu.' }
            ]
        },
        {
            id: 'escac', title: 'Escac i escac i mat', icon: '♚', summary: 'Com s\'ataca el rei i com s\'acaba la partida.',
            steps: [
                { kind: 'text', title: 'Escac', fen: '4k3/8/8/8/8/8/8/4R1K1 b - - 0 1', marks: ['e8', 'e1'],
                  text: 'Quan una peça ataca el rei, és <strong>escac</strong>. Aquí la torre de e1 fa escac al rei negre de e8. Qui rep escac està <strong>obligat</strong> a resoldre\'l a la jugada següent: no pot fer cap altra cosa.' },
                { kind: 'text', title: 'Tres maneres de sortir-ne', fen: '4k3/8/8/8/8/8/8/4R1K1 b - - 0 1',
                  text: 'Hi ha tres maneres de sortir d\'un escac: <strong>moure el rei</strong> a una casella segura, <strong>capturar</strong> la peça que ataca o <strong>interposar</strong> una peça entre l\'atacant i el rei (això últim no serveix contra un cavall ni un peó).' },
                { kind: 'task', fen: '4k3/8/8/8/8/8/8/4R1K1 b - - 0 1', accept: { predicate: 'any' },
                  text: 'Les negres reben escac de la torre. Surt de l\'escac movent el rei.',
                  success: 'El rei ha sortit de la columna atacada.', fail: 'Aquesta jugada no és legal: el rei ha de sortir de l\'escac.' },
                { kind: 'task', fen: '4k3/8/8/8/8/8/8/1q2R1K1 b - - 0 1', accept: { moves: ['b1e1'] },
                  text: 'Ara defensa <strong>capturant</strong>: la dama negra de b1 pot prendre la torre que fa escac.',
                  success: 'Escac resolt i torre guanyada. I a més fas escac tu!', fail: 'La dama de b1 arriba a e1 per la primera fila. Captura la torre.' },
                { kind: 'task', fen: '4k3/8/8/2b5/8/8/8/4R1K1 b - - 0 1', accept: { moves: ['c5e7', 'c5e3'] },
                  text: 'I ara <strong>interposa</strong>: bloqueja l\'escac de la torre amb l\'alfil.',
                  success: 'L\'alfil tapa la columna i el rei ja no està en escac.', fail: 'L\'alfil de c5 pot tapar la columna e a e7 (o a e3).' },
                { kind: 'text', title: 'Escac i mat', fen: 'R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', marks: ['g8', 'a8'],
                  text: 'Si no hi ha <strong>cap</strong> manera de sortir de l\'escac, és <strong>escac i mat</strong>: la partida s\'acaba i guanya qui l\'ha fet. Aquí la torre fa el <em>mat del passadís</em>: el rei no pot escapar perquè els seus propis peons li tanquen el pas.' },
                { kind: 'task', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', accept: { predicate: 'checkmate' },
                  text: 'Fes <strong>escac i mat</strong> en una jugada amb la torre.',
                  success: 'Escac i mat! Els peons de f7, g7 i h7 no deixen escapar el rei.', fail: 'Encara no és mat. Busca la jugada de torre que ataca el rei sense que pugui escapar: la vuitena fila.' },
                { kind: 'task', fen: '7k/3Q4/6K1/8/8/8/8/8 w - - 0 1', accept: { predicate: 'checkmate' },
                  text: 'Fes escac i mat en una jugada amb la dama. Recorda: si la dama es posa al costat del rei, ha d\'estar protegida.',
                  success: 'Escac i mat! El rei blanc protegeix la dama i el rei negre no té escapatòria.', fail: 'Encara no és mat. Prova la dama a g7, protegida pel rei de g6.' }
            ]
        },
        {
            id: 'taules', title: 'Ofegat i taules', icon: '½', summary: 'Quan ningú no guanya.',
            steps: [
                { kind: 'text', title: 'Ofegat', fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', marks: ['h8'],
                  text: 'Si a qui li toca moure no té <strong>cap jugada legal</strong> i <strong>no</strong> està en escac, és <strong>ofegat</strong>: la partida acaba en taules. Aquí les negres no poden moure el rei a cap casella segura i no estan en escac. Amb dama de més, un mal pas ho pot espatllar tot.' },
                { kind: 'task', fen: '7k/4Q3/6K1/8/8/8/8/8 w - - 0 1', accept: { predicate: 'checkmate' },
                  text: 'Fes mat <strong>sense ofegar</strong> el rei negre. Compte amb la casella f7!',
                  success: 'Escac i mat, i sense ofegar. Així es tanca un final de dama.', fail: 'Encara no és mat: busca una jugada de dama que faci escac sense escapatòria (g7 o la vuitena fila).',
                  stalemate: 'Compte: així les negres queden ofegades i són taules. Busca una jugada que faci escac.' },
                { kind: 'text', title: 'Altres taules', fen: '8/8/8/4k3/8/8/8/4K3 w - - 0 1',
                  text: 'També són taules la <strong>triple repetició</strong> de la mateixa posició, <strong>50 jugades</strong> seguides sense captures ni moviments de peó, el <strong>material insuficient</strong> per fer mat (rei contra rei, o rei i cavall contra rei) i l\'<strong>acord</strong> dels dos jugadors.' }
            ]
        },
        {
            id: 'especials', title: 'Jugades especials', icon: '⇄', summary: 'Enroc, captura al pas i coronació.',
            steps: [
                { kind: 'text', title: 'L\'enroc', fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', marks: ['e1', 'g1', 'h1', 'c1', 'a1'],
                  text: 'L\'<strong>enroc</strong> mou el rei dues caselles cap a una torre, i la torre salta a l\'altre costat del rei. Només es pot fer si ni el rei ni aquella torre s\'han mogut, no hi ha peces entremig, i el rei no està en escac ni passa per cap casella atacada.' },
                { kind: 'task', fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', accept: { moves: ['e1g1'] },
                  text: 'Fes l\'<strong>enroc curt</strong>, cap a la torre de h1: mou el rei de e1 a g1.',
                  success: 'Enroc curt fet: el rei a g1 i la torre a f1.', fail: 'Per enrocar, mou el rei dues caselles: de e1 a g1.' },
                { kind: 'task', fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', accept: { moves: ['e1c1'] },
                  text: 'Ara l\'<strong>enroc llarg</strong>, cap a la torre de a1: mou el rei de e1 a c1.',
                  success: 'Enroc llarg fet: el rei a c1 i la torre a d1.', fail: 'Per l\'enroc llarg, mou el rei dues caselles cap a l\'esquerra: de e1 a c1.' },
                { kind: 'text', title: 'Captura al pas', fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', marks: ['d5', 'd6', 'e5'],
                  text: '<strong>Captura al pas</strong>: si un peó rival avança dues caselles i queda al costat del teu peó, <strong>només a la jugada següent</strong> el pots capturar com si n\'hagués avançat una sola. El peó negre acaba d\'anar de d7 a d5; el teu peó de e5 el pot capturar anant a d6.' },
                { kind: 'task', fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', accept: { moves: ['e5d6'] },
                  text: 'Captura al pas el peó de d5: mou el teu peó de e5 a d6.',
                  success: 'Captura al pas! El peó negre desapareix de d5.', fail: 'Al pas es captura anant a la casella que el peó ha saltat: de e5 a d6.' },
                { kind: 'task', fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', accept: { predicate: 'promote' },
                  text: '<strong>Coronació</strong>: porta el peó de a7 fins a l\'última fila i converteix-lo en dama.',
                  success: 'Coronat! Una dama nova al tauler.', fail: 'Avança el peó de a7 a a8 per coronar-lo.' },
                { kind: 'text', title: 'Un peó val or', fen: '4k3/8/8/8/8/8/6p1/4K3 b - - 0 1', marks: ['g2', 'g1'],
                  text: 'Es pot coronar encara que ja tinguis dama. Per això, als finals, un peó que ja no pot ser aturat per cap peó rival (<em>peó passat</em>) val moltíssim: aquí les negres coronaran a g1.' }
            ]
        },
        {
            id: 'final', title: 'Com acaba una partida', icon: '🏁', summary: 'Victòria, derrota i taules.',
            steps: [
                { kind: 'text', title: 'Guanyar', fen: 'R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1',
                  text: 'Guanya qui fa <strong>escac i mat</strong>, qui rep la <strong>rendició</strong> del rival, o, amb rellotge, qui veu com al rival se li acaba el <strong>temps</strong>. Si cap dels dos pot guanyar, són <strong>taules</strong>.' },
                { kind: 'text', title: 'I després, aprendre\'n', fen: START_FEN,
                  text: 'A El Tauler, quan la partida s\'acaba en veuràs la <strong>revisió</strong>: la precisió, les errades comentades i el moment clau. Repassar-la és la millor manera de millorar. Les errades es guarden i les pots tornar a practicar.' }
            ]
        },
        {
            id: 'notacio', title: 'La notació', icon: 'Nf3', summary: 'Com s\'escriuen les jugades.',
            steps: [
                { kind: 'text', title: 'Peça i casella', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', marks: ['f3'],
                  text: 'Una jugada s\'escriu amb la <strong>inicial de la peça</strong> i la <strong>casella d\'arribada</strong>: <strong>Nf3</strong> és el cavall a f3. Els peons només duen la casella: <strong>e4</strong>. A l\'app veuràs les inicials internacionals: <strong>K</strong> rei, <strong>Q</strong> dama, <strong>R</strong> torre, <strong>B</strong> alfil, <strong>N</strong> cavall (en català serien R, D, T, A, C).' },
                { kind: 'text', title: 'Símbols', fen: 'r1bqkbnr/pppp1Bpp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 3', marks: ['f7'],
                  text: '<strong>x</strong> és captura (Bxf7+), <strong>+</strong> escac, <strong>#</strong> mat, <strong>O-O</strong> enroc curt, <strong>O-O-O</strong> enroc llarg i <strong>e8=Q</strong> coronació. Les jugades es numeren per parelles: <em>1. e4 e5 2. Nf3 Nc6 3. Bxf7+</em>.' },
                { kind: 'task', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', accept: { moves: ['g1f3'] },
                  text: 'Juga la jugada <strong>Nf3</strong>.',
                  success: 'Nf3: el cavall de g1 a f3, atacant el peó de e5.', fail: 'Nf3 vol dir el cavall (N) a la casella f3. Toca el cavall de g1.' },
                { kind: 'task', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', accept: { moves: ['f1c4'] },
                  text: 'Ara juga <strong>Bc4</strong>.',
                  success: 'Bc4: l\'alfil apunta a f7, la casella més feble de les negres.', fail: 'Bc4 vol dir l\'alfil (B) a c4. Toca l\'alfil de f1.' }
            ]
        },
        {
            id: 'consells', title: 'Consells per començar', icon: '💡', summary: 'Quatre idees per a les primeres partides.',
            steps: [
                { kind: 'text', title: '1. El centre', fen: START_FEN, marks: ['e4', 'd4', 'e5', 'd5'],
                  text: 'Controla el <strong>centre</strong> (e4, d4, e5, d5) amb peons i peces: des del centre, les peces arriben a tot arreu.' },
                { kind: 'text', title: '2. Desenvolupa', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
                  text: 'Treu els <strong>cavalls i els alfils</strong> abans que la dama, i no moguis la mateixa peça dues vegades a l\'obertura si no cal. Cada jugada ha de posar una peça nova en joc.' },
                { kind: 'text', title: '3. Enroca aviat', fen: 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w - - 6 6',
                  text: 'Fes l\'<strong>enroc</strong> abans que s\'obri la posició: el rei queda a cobert i la torre entra en joc.' },
                { kind: 'text', title: '4. Mira què amenaça el rival', fen: 'rnbqkbnr/ppp2ppp/8/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3',
                  text: 'Abans de moure, pregunta\'t sempre <strong>què amenaça l\'última jugada del rival</strong>. I abans de deixar una peça en una casella, comprova si hi està atacada: no regalis material.' },
                { kind: 'text', title: 'Ja pots jugar', fen: START_FEN, cta: { label: '♟ Juga la primera partida', action: 'new-game' },
                  text: 'Ja saps jugar. A El Tauler la primera partida és de <strong>calibratge</strong>: el rival s\'adapta al teu nivell durant la partida i, en acabar, sabràs el teu ROC. Després tens el <strong>Joc vista</strong> per aprendre a pensar cada jugada, i la <strong>Guia d\'El Tauler</strong> per descobrir la resta de l\'app.' }
            ]
        }
    ];

    // ------------------------------------------------------------------
    // Guia de l'app: seccions i targetes. `action` és el que fa el botó
    // «Vés-hi» (la interfície el resol contra els botons de la pàgina
    // d'inici); null quan no hi ha cap pantalla concreta on anar.
    // ------------------------------------------------------------------
    const GUIDE = [
        {
            id: 'jugar', title: 'Jugar contra Stockfish', items: [
                { id: 'nova', icon: 'ic-pawn', title: 'Nova partida', action: 'new-game', cta: 'Juga',
                  text: 'Partida contra Stockfish al teu nivell. La primera és la partida de <strong>calibratge</strong>: el rival comença suau i s\'adapta a la qualitat de les teves jugades; en acabar, tens el teu <strong>ROC</strong> (el nivell de l\'app) i s\'obren la resta de modalitats. Després, cada partida ajusta el nivell del rival i, si guanyes o perds amb regularitat, el teu ELO. En acabar veuràs la <strong>revisió</strong>: precisió, errades comentades, moments clau i un pla de 10 minuts. Si la pestanya es tanca a mitja partida, la pots reprendre des de la pàgina d\'inici.' },
                { id: 'rellotge', icon: 'ic-clock', title: 'Rellotge i ritmes', action: null,
                  text: 'Tria el ritme a les fitxes de sobre del botó de jugar: <strong>sense rellotge</strong>, bullet (30 s i 1+0), blitz (3+2 i 5+0), ràpid (10+0) i clàssic (15+10). Cada ritme té el seu <strong>ELO propi</strong> i la primera partida de cada ritme és de calibratge. El rival gestiona el rellotge com una persona del seu nivell (pot fins i tot caure de bandera) i tu pots marcar una <strong>jugada anticipada</strong> mentre pensa. Sona un avís quan et queda poc temps.' },
                { id: 'diaria', icon: 'ic-calendar', title: 'Partida diària (24 h)', action: 'daily', cta: 'Obre\'n una',
                  text: 'Partida per correspondència contra el motor: tens <strong>24 hores</strong> per cada jugada i el rival respon al cap de <strong>3 hores</strong>. Tries la jugada al tauler i la confirmes amb «Desa la jugada». Pots tenir fins a deu partides diàries en marxa i es sincronitzen amb el compte. A Configuració pots activar els <strong>avisos</strong> de resposta i de termini.' },
                { id: 'vista', icon: 'ic-scope', title: 'Joc vista', action: 'positional', cta: 'Juga-hi',
                  text: 'Per aprendre a jugar «en present». Tries quantes <strong>jugades vista</strong> té el rival (de zero a deu) i cada jugada teva rep un <strong>índex Stockfish</strong>: si no és de les bones, es desfà sola perquè en provis una altra. El botó <strong>Norma</strong> et recorda un principi per a la decisió que tens al davant. No puntua ELO.' },
                { id: 'antidot', icon: '🧬', title: 'Rival Antídot', action: 'antidote', cta: 'Juga-hi',
                  text: 'Stockfish a força màxima que, entre les jugades bones, tria la que més posa a prova les <strong>teves debilitats</strong> (les que surten de les teves errades desades). Durant la partida no et diu què s\'examina; després de cada resposta t\'ho explica. Entra a l\'historial però no puntua ELO.' },
                { id: 'lliga', icon: 'ic-trophy', title: 'Lliga', action: 'league', cta: 'Vés a la lliga',
                  text: 'Una temporada de <strong>9 jornades</strong> contra rivals simulats al voltant del teu nivell, amb classificació. La lliga es genera amb el ritme que tens triat i el manté fins al final. Abandonar una partida de lliga des del botó de casa compta com a derrota.' }
            ]
        },
        {
            id: 'entrenar', title: 'Entrenar', items: [
                { id: 'jeroglifics', icon: 'ic-puzzle-piece', title: 'Jeroglífics', action: 'hieroglyphics', cta: 'Resol-ne un',
                  text: 'Exercicis generats de les <strong>teves partides</strong>: has de trobar els tres millors moviments seguits. Es preparen en segon pla mentre fas servir l\'app, i pots triar quin <strong>final</strong> han de tenir (mat, forquilla, clavada, coronació...). L\'historial de jeroglífics guarda els que has resolt.' },
                { id: 'tria', icon: 'ic-shuffle', title: 'Tres camins', action: 'tria', cta: 'Fer el test',
                  text: 'Test de 20 preguntes fet amb posicions de les teves partides on no vas jugar la millor. A cada pregunta veus les <strong>tres millors jugades</strong> (A, B i C, cadascuna amb el seu tauler) i la que vas fer de veritat: tria la bona. La dificultat s\'ajusta al teu nivell.' },
                { id: 'tactiques', icon: 'ic-zap', title: 'Tàctiques', action: 'tactics', cta: 'Entrena',
                  text: 'Banc de posicions tàctiques verificades amb Stockfish, en què has de trobar la millor jugada (i completar la seqüència). Funciona fins i tot sense motor, perquè les línies ja venen resoltes.' },
                { id: 'errors', icon: 'ic-book', title: 'Els teus errors i el repàs intel·ligent', action: 'errors', cta: 'Revisa errors',
                  text: 'Cada errada de les teves partides es guarda amb la seva posició. A <strong>Revisa errors</strong> les practiques per categoria (o a l\'atzar) rectificant-les al tauler. El <strong>Repàs intel·ligent</strong> és una cua de repetició espaiada: et torna a posar cada errada quan toca, fins que la tens dominada.' }
            ]
        },
        {
            id: 'obertures', title: 'Obertures i anàlisi', items: [
                { id: 'obertures', icon: 'ic-book', title: 'Obertures', action: 'openings', cta: 'Obre les obertures',
                  text: 'Repertori recomanat amb blanques i defenses amb negres, amb <strong>lliçons guiades</strong>, correcció immediata i càlcul de precisió. <strong>La teva obertura</strong> construeix un repertori personal a partir del que ja jugues, reforçat pel motor on falla. I els <strong>jeroglífics d\'obertura</strong> et fan trobar la jugada teòrica a partir d\'una pista.' },
                { id: 'analisi', icon: 'ic-analysis', title: 'Tauler d\'anàlisi', action: 'explorer', cta: 'Obre el tauler',
                  text: 'Analitza qualsevol posició: carrega una FEN, munta-la amb l\'<strong>editor</strong> o enganxa un PGN. Veus la <strong>barra d\'avaluació</strong> i les línies del motor, pots jugar la millor jugada, navegar la línia i <strong>jugar la posició contra Stockfish</strong> (sense puntuar ELO).' }
            ]
        },
        {
            id: 'comunitat', title: 'Comunitat', items: [
                { id: 'catalans', icon: 'ic-swords', title: 'Catalans vs Stockfish', action: 'catalans', cta: 'Vota',
                  text: 'Partida col·lectiva: tothom <strong>vota</strong> la jugada de l\'equip movent al tauler i, passades 24 hores, es juga la més votada; després respon Stockfish, que puja o baixa de nivell segons el resultat. També pots <strong>crear la teva partida col·lectiva</strong> i compartir l\'enllaç amb el teu equip. Per votar cal iniciar sessió amb Google.' },
                { id: 'ranquing', icon: 'ic-trophy', title: 'Rànquing', action: 'ranking', cta: 'Veure',
                  text: 'Classificació global per ELO, estrelles, partides i jeroglífics resolts. Hi apareixes amb el nom d\'usuari del teu compte de Google, i només tu pots tocar la teva entrada.' }
            ]
        },
        {
            id: 'progres', title: 'El teu progrés', items: [
                { id: 'historial', icon: 'ic-history', title: 'Historial i revisió', action: 'history', cta: 'Obre l\'historial',
                  text: 'Totes les partides amb la seva precisió, el moment clau, l\'anàlisi per fases i les notes de les errades. Pots reproduir-les, explorar qualsevol posició al tauler d\'anàlisi, regenerar la ressenya o exportar-les en <strong>PGN</strong>. La revisió es pot <strong>escoltar</strong> amb les veus del navegador, en to casual, equilibrat o tècnic. La pestanya PGN guarda partides importades.' },
                { id: 'estadistiques', icon: 'ic-bars', title: 'Estadístiques i diagnòstic de l\'entrenador', action: 'stats', cta: 'Veure',
                  text: 'ELO per ritme, evolució, obertures més jugades, debilitats i el <strong>diagnòstic de l\'entrenador</strong>, que llegeix les teves darreres partides i et proposa un pla setmanal. A la pàgina d\'inici tens les <strong>missions diàries</strong>, la <strong>ratxa</strong> de dies actius i els <strong>trofeus</strong>.' }
            ]
        },
        {
            id: 'configuracio', title: 'Configuració i dades', items: [
                { id: 'nuvol', icon: 'ic-cloud', title: 'Compte i sincronització', action: 'settings', cta: 'Configuració',
                  text: 'Amb <strong>Inicia sessió amb Google</strong> totes les dades (partides, errors, ELO, lligues, obertures...) se sincronitzen entre els teus dispositius. També cal per al rànquing i per votar a les partides col·lectives. Sense sessió, tot es queda al teu aparell.' },
                { id: 'aparenca', icon: 'ic-gear', title: 'Tauler, aparença i sons', action: 'settings', cta: 'Configuració',
                  text: 'Control del tauler (<strong>tocar</strong> o <strong>arrossegar</strong>), temes de tauler i peces, mode «sempre tinc sort», mode dia i mode <strong>paper electrònic</strong>, mida de lletra, <strong>sons i vibració</strong> de la partida i avisos de les partides diàries. Aquestes preferències són de cada dispositiu.' },
                { id: 'copies', icon: 'ic-export', title: 'Còpies de seguretat', action: 'settings', cta: 'Configuració',
                  text: 'Des de Configuració pots <strong>exportar</strong> totes les dades a un fitxer, <strong>importar-les</strong>, exportar l\'historial sencer en PGN, tornar a calibrar el nivell, reiniciar la lliga o esborrar-ho tot.' }
            ]
        }
    ];

    // ------------------------------------------------------------------
    // Lògica pura
    // ------------------------------------------------------------------
    const STEP_KINDS = ['text', 'explore', 'square', 'task'];
    const ACTION_IDS = ['new-game', 'daily', 'positional', 'antidote', 'league', 'hieroglyphics', 'tria',
        'tactics', 'errors', 'openings', 'explorer', 'catalans', 'ranking', 'history', 'stats', 'settings', 'tutorial'];
    const PREDICATES = ['checkmate', 'capture', 'castle', 'promote', 'enpassant', 'check', 'any'];
    const SQUARE_RE = /^[a-h][1-8]$/;

    function isSquare(s) { return typeof s === 'string' && SQUARE_RE.test(s); }

    // Instància de chess.js per a un pas (null si el pas no en necessita o
    // la posició no carrega).
    function chessFor(ChessCtor, fen) {
        if (typeof ChessCtor !== 'function' || typeof fen !== 'string' || fen === 'empty') return null;
        try {
            const chess = new ChessCtor(fen);
            // chess.js accepta FEN dolentes en silenci i es queda amb la posició
            // inicial: es comprova que la posició carregada sigui la demanada.
            if (chess.fen().split(' ')[0] !== fen.split(' ')[0]) return null;
            return chess;
        } catch (e) { return null; }
    }

    // Destins legals de la peça d'una casella (del bàndol que mou).
    function lessonTargets(ChessCtor, fen, square) {
        const chess = chessFor(ChessCtor, fen);
        if (!chess || !isSquare(square)) return [];
        let moves = [];
        try { moves = chess.moves({ square, verbose: true }); } catch (e) { return []; }
        const seen = {};
        const out = [];
        moves.forEach(m => { if (!seen[m.to]) { seen[m.to] = true; out.push(m.to); } });
        return out;
    }

    // Resultat d'un intent en un pas d'exercici ('task').
    //   { ok, move, fenAfter, reason: null | 'illegal' | 'wrong' | 'stalemate' }
    function lessonAttempt(ChessCtor, step, from, to, promotion) {
        const result = { ok: false, move: null, fenAfter: null, reason: 'illegal' };
        if (!step || step.kind !== 'task') return result;
        const chess = chessFor(ChessCtor, step.fen);
        if (!chess || !isSquare(from) || !isSquare(to)) return result;
        let move = null;
        try { move = chess.move({ from, to, promotion: promotion || 'q' }); } catch (e) { move = null; }
        if (!move) return result;
        result.move = move;
        result.fenAfter = chess.fen();
        const accept = step.accept || {};
        let ok = false;
        if (Array.isArray(accept.moves) && accept.moves.length) {
            const uci = move.from + move.to;
            ok = accept.moves.some(m => typeof m === 'string' && (m === uci || m === uci + (move.promotion || '')));
        } else {
            const flags = typeof move.flags === 'string' ? move.flags : '';
            switch (accept.predicate) {
                case 'checkmate': ok = chess.in_checkmate(); break;
                case 'capture': ok = !!move.captured; break;
                case 'castle': ok = flags.indexOf('k') !== -1 || flags.indexOf('q') !== -1; break;
                case 'promote': ok = !!move.promotion; break;
                case 'enpassant': ok = flags.indexOf('e') !== -1; break;
                case 'check': ok = chess.in_check(); break;
                case 'any': ok = true; break;
                default: ok = false;
            }
        }
        result.ok = ok;
        if (ok) result.reason = null;
        else result.reason = chess.in_stalemate() ? 'stalemate' : 'wrong';
        return result;
    }

    // Totes les jugades legals que resolen un exercici (per als tests i per a
    // la pista): llista d'UCI.
    function lessonSolutions(ChessCtor, step) {
        const chess = chessFor(ChessCtor, step && step.fen);
        if (!chess || !step || step.kind !== 'task') return [];
        let moves = [];
        try { moves = chess.moves({ verbose: true }); } catch (e) { return []; }
        return moves
            .filter(m => lessonAttempt(ChessCtor, step, m.from, m.to, m.promotion).ok)
            .map(m => m.from + m.to + (m.promotion || ''));
    }

    function normalizeProgress(raw) {
        const out = { done: {}, last: null };
        if (!raw || typeof raw !== 'object') return out;
        if (raw.done && typeof raw.done === 'object') {
            Object.keys(raw.done).forEach(id => { if (raw.done[id]) out.done[id] = true; });
        }
        if (typeof raw.last === 'string') out.last = raw.last;
        return out;
    }

    // Resum per al bàner i l'índex: quantes lliçons fetes i quina toca ara.
    function progressSummary(progress, lessons) {
        const p = normalizeProgress(progress);
        const list = Array.isArray(lessons) ? lessons : LESSONS;
        const total = list.length;
        let done = 0;
        let nextId = null;
        list.forEach(l => {
            if (p.done[l.id]) done++;
            else if (nextId === null) nextId = l.id;
        });
        return { done, total, nextId, allDone: total > 0 && done >= total, last: p.last };
    }

    function progressLabel(summary) {
        if (!summary || !summary.total) return '';
        if (summary.allDone) return 'Totes les lliçons fetes ✓';
        if (!summary.done) return summary.total + ' lliçons curtes amb tauler interactiu';
        return summary.done + ' de ' + summary.total + ' lliçons fetes';
    }

    const api = {
        LESSONS,
        GUIDE,
        STEP_KINDS,
        PREDICATES,
        ACTION_IDS,
        PROGRESS_KEY,
        lessonTargets,
        lessonAttempt,
        lessonSolutions,
        normalizeProgress,
        progressSummary,
        progressLabel
    };

    // ==================================================================
    // Interfície (només al navegador)
    // ==================================================================
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        api.init = initUi;
        api.open = openTutorial;
        api.openGuide = openGuide;
        api.refreshBanner = refreshBanner;
        api.closeScreens = closeScreens;
    }

    const PIECE_THEME = 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png';
    let board = null;            // chessboard.js del tutorial
    let lessonIdx = -1;
    let stepIdx = 0;
    let stepSolved = false;
    let tapFrom = null;
    let stepChess = null;        // posició del pas (chess.js)

    function $q(id) { return document.getElementById(id); }
    function jq() { return (typeof window !== 'undefined' && window.jQuery) ? window.jQuery : null; }
    function ChessCtor() { return (typeof window !== 'undefined' && typeof window.Chess === 'function') ? window.Chess : null; }
    function core() { return (typeof window !== 'undefined' && window.ElTaulerCore) ? window.ElTaulerCore : null; }
    function playSound(kind) {
        try { if (window.ElTaulerSons && kind) window.ElTaulerSons.play(kind); } catch (e) {}
    }
    function toast(msg, type) {
        try { if (typeof window.showToast === 'function') window.showToast(msg, type || 'info'); } catch (e) {}
    }
    function escapeHtml(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ---- Progrés ----
    function loadProgress() {
        try { return normalizeProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null')); } catch (e) { return normalizeProgress(null); }
    }
    function saveProgress(progress) {
        try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(normalizeProgress(progress))); } catch (e) {}
        // La clau viatja amb el compte (prefix chess_): avisa la sincronització.
        try { if (window.CloudSync && typeof window.CloudSync.onLocalSave === 'function') window.CloudSync.onLocalSave(); } catch (e) {}
    }

    // ---- Navegació ----
    function showScreen(id) {
        const $ = jq();
        if (!$) return;
        $('#start-screen').hide();
        $('#' + id).show();
        try { if (typeof window.navPush === 'function') window.navPush(id); } catch (e) {}
    }
    function hideScreen(id) {
        const $ = jq();
        if (!$) return;
        $('#' + id).hide();
        $('#start-screen').show();
        try { if (typeof navStack !== 'undefined' && Array.isArray(navStack)) navStack.pop(); } catch (e) {}
    }
    // Tanca les dues pantalles (les fa servir app.js en tornar enrere).
    function closeScreens() {
        const $ = jq();
        if (!$) return;
        $('#tutorial-screen').hide();
        $('#guide-screen').hide();
    }

    function openTutorial(lessonId) {
        showScreen('tutorial-screen');
        if (lessonId) openLesson(indexOfLesson(lessonId));
        else showIndex();
    }
    function openGuide() {
        renderGuide();
        showScreen('guide-screen');
    }

    // Accions del botó «Vés-hi» de la guia i del CTA del tutorial: primer es
    // tanca la pantalla pròpia i després es reutilitza el botó de l'inici.
    const ACTIONS = {
        'new-game': () => click('#btn-new-game'),
        'daily': () => { if (typeof window.startNewDailyGame === 'function') window.startNewDailyGame(); else click('#btn-new-game'); },
        'positional': () => click('#btn-positional-game'),
        'antidote': () => click('#btn-antidote-game'),
        'league': () => click('#btn-league'),
        'hieroglyphics': () => click('#btn-hieroglyphic-banner'),
        'tria': () => click('#btn-tria-banner'),
        'tactics': () => click('#btn-tactics'),
        'errors': () => click('#btn-bundle-menu'),
        'openings': () => click('#btn-opening'),
        'explorer': () => click('#btn-explorer'),
        'catalans': () => click('#btn-catalans'),
        'ranking': () => click('#btn-ranking'),
        'history': () => click('#btn-history'),
        'stats': () => click('#btn-stats'),
        'settings': () => click('#btn-settings'),
        'tutorial': () => openTutorial()
    };
    function click(selector) {
        const $ = jq();
        const el = $ ? $(selector) : null;
        if (!el || !el.length) { toast('Aquesta secció no està disponible ara mateix.', 'warn'); return; }
        if (el.prop('disabled')) {
            toast('Aquesta modalitat es desbloqueja amb la partida inicial de calibratge.', 'warn');
            return;
        }
        el.trigger('click');
    }
    function runAction(action, fromScreen) {
        const fn = ACTIONS[action];
        if (!fn) return;
        if (fromScreen) hideScreen(fromScreen);
        setTimeout(fn, 0);
    }

    // ---- Bàner de la pàgina d'inici ----
    function refreshBanner() {
        const summary = progressSummary(loadProgress());
        const meta = $q('tutorial-banner-meta');
        if (meta) meta.textContent = progressLabel(summary);
        const cta = $q('tutorial-banner-cta');
        if (cta) cta.textContent = summary.allDone ? 'Repassa ›' : (summary.done ? 'Continua ›' : 'Comença ›');
        // Per a qui encara ha de fer la partida de calibratge: enllaç visible
        // sota la targeta de joc, que és on mira primer.
        const hint = $q('learn-hint');
        if (hint) {
            let calibrating = false;
            try { calibrating = typeof window.isCalibrationRequired === 'function' && window.isCalibrationRequired(); } catch (e) { calibrating = false; }
            hint.style.display = (calibrating && !summary.allDone) ? '' : 'none';
        }
    }

    // ---- Índex de lliçons ----
    function indexOfLesson(id) {
        const i = LESSONS.findIndex(l => l.id === id);
        return i === -1 ? 0 : i;
    }
    function showIndex() {
        const $ = jq();
        if (!$) return;
        destroyBoard();
        lessonIdx = -1;
        $('#tutorial-lesson').hide();
        renderIndex();
        $('#tutorial-index').show();
        try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) {}
    }
    function renderIndex() {
        const container = $q('tutorial-index');
        if (!container) return;
        const progress = loadProgress();
        const summary = progressSummary(progress);
        const pt = $q('tutorial-progress-text');
        if (pt) pt.textContent = summary.allDone
            ? 'Has fet totes les lliçons. Pots repassar-ne qualsevol.'
            : (summary.done ? summary.done + ' de ' + summary.total + ' lliçons fetes. Continua per on ho vas deixar.' : 'Tretze lliçons curtes, cadascuna amb el seu tauler. Toca la primera per començar.');
        let html = '';
        LESSONS.forEach((lesson, i) => {
            const done = !!progress.done[lesson.id];
            const isNext = !done && summary.nextId === lesson.id;
            html += '<button type="button" class="tutorial-lesson-row' + (done ? ' is-done' : '') + (isNext ? ' is-next' : '') + '" data-lesson="' + escapeHtml(lesson.id) + '">'
                + '<span class="tutorial-lesson-num">' + (done ? '✓' : (i + 1)) + '</span>'
                + '<span class="tutorial-lesson-body"><span class="tutorial-lesson-title">' + escapeHtml(lesson.title) + '</span>'
                + '<span class="tutorial-lesson-summary">' + escapeHtml(lesson.summary || '') + '</span></span>'
                + '<span class="tutorial-lesson-go">' + (done ? 'Repassa' : (isNext ? 'Continua' : 'Obre')) + ' ›</span>'
                + '</button>';
        });
        container.innerHTML = html;
    }

    // ---- Lliçó i passos ----
    function openLesson(i) {
        const $ = jq();
        if (!$ || i < 0 || i >= LESSONS.length) return;
        lessonIdx = i;
        stepIdx = 0;
        const progress = loadProgress();
        progress.last = LESSONS[i].id;
        saveProgress(progress);
        $('#tutorial-index').hide();
        $('#tutorial-lesson').show();
        renderStep();
        try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) {}
    }
    function currentLesson() { return lessonIdx >= 0 ? LESSONS[lessonIdx] : null; }
    function currentStep() { const l = currentLesson(); return l ? l.steps[stepIdx] : null; }

    function renderStep() {
        const $ = jq();
        const lesson = currentLesson();
        const step = currentStep();
        if (!$ || !lesson || !step) return;
        stepSolved = step.kind === 'text' || step.kind === 'explore';
        tapFrom = null;
        $('#tutorial-lesson-title').text(lesson.icon + ' ' + lesson.title);
        $('#tutorial-step-count').text('Pas ' + (stepIdx + 1) + ' de ' + lesson.steps.length);
        const title = step.title ? '<div class="tutorial-step-title">' + escapeHtml(step.title) + '</div>' : '';
        $('#tutorial-step-text').html(title + '<div>' + (step.text || '') + '</div>');
        const fb = $q('tutorial-feedback');
        if (fb) { fb.textContent = stepHint(step); fb.className = 'status-message tutorial-feedback'; }
        $('#btn-tutorial-retry').hide();
        // CTA final (p. ex. «Juga la primera partida»).
        const ctaWrap = $q('tutorial-cta');
        if (ctaWrap) {
            if (step.cta && step.cta.label) {
                ctaWrap.innerHTML = '<button type="button" class="btn btn-primary" id="btn-tutorial-cta">' + escapeHtml(step.cta.label) + '</button>';
                ctaWrap.style.display = '';
                const btn = $q('btn-tutorial-cta');
                if (btn) btn.addEventListener('click', () => { markLessonDone(); runAction(step.cta.action, 'tutorial-screen'); });
            } else {
                ctaWrap.innerHTML = '';
                ctaWrap.style.display = 'none';
            }
        }
        buildBoard(step);
        updateNav();
    }
    function stepHint(step) {
        if (step.kind === 'explore') return 'Toca una peça per veure les seves jugades.';
        if (step.kind === 'square') return 'Toca la casella al tauler.';
        if (step.kind === 'task') return 'Fes la jugada al tauler: toca la peça i després la casella.';
        return '';
    }
    function updateNav() {
        const $ = jq();
        const lesson = currentLesson();
        if (!$ || !lesson) return;
        const last = stepIdx >= lesson.steps.length - 1;
        $('#btn-tutorial-prev').prop('disabled', stepIdx === 0);
        const next = $('#btn-tutorial-next');
        next.prop('disabled', !stepSolved);
        next.text(last ? 'Acaba la lliçó ✓' : 'Següent ›');
    }
    function nextStep() {
        const lesson = currentLesson();
        if (!lesson || !stepSolved) return;
        if (stepIdx >= lesson.steps.length - 1) { finishLesson(); return; }
        stepIdx++;
        renderStep();
    }
    function prevStep() {
        if (stepIdx === 0) return;
        stepIdx--;
        renderStep();
    }
    function markLessonDone() {
        const lesson = currentLesson();
        if (!lesson) return;
        const progress = loadProgress();
        progress.done[lesson.id] = true;
        progress.last = lesson.id;
        saveProgress(progress);
        refreshBanner();
    }
    function finishLesson() {
        const lesson = currentLesson();
        markLessonDone();
        playSound('success');
        const summary = progressSummary(loadProgress());
        if (summary.allDone) {
            toast('Has completat totes les lliçons. Ja saps jugar: endavant amb la primera partida!', 'success');
            showIndex();
            return;
        }
        toast('Lliçó «' + (lesson ? lesson.title : '') + '» completada.', 'success');
        // Segueix amb la lliçó següent pendent.
        if (summary.nextId) openLesson(indexOfLesson(summary.nextId));
        else showIndex();
    }

    // ---- Tauler ----
    function destroyBoard() {
        if (board) { try { board.destroy(); } catch (e) {} board = null; }
        stepChess = null;
    }
    function boardOrientation(step) {
        if (step.orientation === 'black' || step.orientation === 'white') return step.orientation;
        if (typeof step.fen === 'string' && step.fen !== 'empty') {
            return (step.fen.split(' ')[1] === 'b') ? 'black' : 'white';
        }
        return 'white';
    }
    function buildBoard(step) {
        const $ = jq();
        if (!$ || typeof window.Chessboard !== 'function') return;
        destroyBoard();
        const Ctor = ChessCtor();
        stepChess = (step.kind === 'explore' || step.kind === 'task') ? chessFor(Ctor, step.fen) : null;
        let position = 'start';
        if (step.fen === 'empty') position = {};
        else if (typeof step.fen === 'string') position = step.fen.split(' ')[0];
        const mode = (typeof controlMode !== 'undefined') ? controlMode : null;
        const interactiveDrag = step.kind === 'task' && mode === 'drag';
        board = window.Chessboard('tutorial-board', {
            position,
            orientation: boardOrientation(step),
            draggable: interactiveDrag,
            onDragStart: onDragStart,
            onDrop: onDrop,
            onSnapEnd: () => { if (board && stepChess && !stepSolved) board.position(stepChess.fen()); },
            pieceTheme: PIECE_THEME
        });
        $('#tutorial-board').off('click.tut').on('click.tut', '.square-55d63', function () {
            const sq = $(this).attr('data-square');
            if (sq) onSquareTap(sq);
        });
        setTimeout(() => { resizeBoard(); applyStaticMarks(step); }, 0);
    }
    function resizeBoard() {
        const screen = $q('tutorial-screen');
        if (!board || !screen || screen.style.display === 'none') return;
        try { board.resize(); } catch (e) {}
        const step = currentStep();
        if (step) applyStaticMarks(step);
        if (tapFrom) markTargets(tapFrom);
    }
    function squareEl(sq) {
        const $ = jq();
        return $ ? $('#tutorial-board .square-' + sq) : null;
    }
    function clearMarks() {
        const $ = jq();
        if ($) $('#tutorial-board .square-55d63').removeClass('tap-selected tap-move tut-mark tut-ok tut-ko');
    }
    // Marques fixes del pas: caselles (marks) i destins d'una peça (showTargets).
    function applyStaticMarks(step) {
        if (!step) return;
        if (Array.isArray(step.marks)) step.marks.forEach(sq => { const el = squareEl(sq); if (el) el.addClass('tut-mark'); });
        if (step.showTargets) {
            const el = squareEl(step.showTargets);
            if (el) el.addClass('tap-selected');
            lessonTargets(ChessCtor(), step.fen, step.showTargets).forEach(sq => { const t = squareEl(sq); if (t) t.addClass('tap-move'); });
        }
    }
    function markTargets(from) {
        clearMarks();
        const step = currentStep();
        if (!step) return;
        const fromEl = squareEl(from);
        if (fromEl) fromEl.addClass('tap-selected');
        lessonTargets(ChessCtor(), stepChess ? stepChess.fen() : step.fen, from).forEach(sq => { const t = squareEl(sq); if (t) t.addClass('tap-move'); });
    }
    function ownPiece(sq) {
        if (!stepChess) return false;
        const piece = stepChess.get(sq);
        return !!(piece && piece.color === stepChess.turn());
    }

    function onDragStart(source, piece) {
        const step = currentStep();
        if (!step || step.kind !== 'task' || stepSolved || !stepChess) return false;
        const prefix = stepChess.turn() === 'w' ? /^w/ : /^b/;
        return piece.search(prefix) !== -1;
    }
    function onDrop(source, target) {
        const step = currentStep();
        if (!step || step.kind !== 'task' || stepSolved) return 'snapback';
        if (source === target) return 'snapback';
        attemptMove(source, target);
        return 'snapback';
    }
    function onSquareTap(sq) {
        const step = currentStep();
        if (!step) return;
        if (step.kind === 'square') { attemptSquare(sq); return; }
        if (step.kind === 'explore') {
            if (tapFrom === sq) { tapFrom = null; clearMarks(); applyStaticMarks(step); return; }
            if (ownPiece(sq)) { tapFrom = sq; markTargets(sq); }
            else { tapFrom = null; clearMarks(); applyStaticMarks(step); }
            return;
        }
        if (step.kind !== 'task' || stepSolved || !stepChess) return;
        if (tapFrom) {
            if (sq === tapFrom) { tapFrom = null; clearMarks(); return; }
            const targets = lessonTargets(ChessCtor(), stepChess.fen(), tapFrom);
            if (targets.indexOf(sq) !== -1) {
                const from = tapFrom;
                tapFrom = null;
                clearMarks();
                attemptMove(from, sq);
                return;
            }
        }
        if (ownPiece(sq) && lessonTargets(ChessCtor(), stepChess.fen(), sq).length) { tapFrom = sq; markTargets(sq); }
        else { tapFrom = null; clearMarks(); }
    }

    function attemptSquare(sq) {
        const step = currentStep();
        if (!step || step.kind !== 'square') return;
        clearMarks();
        const el = squareEl(sq);
        if (sq === step.square) {
            if (el) el.addClass('tut-ok');
            stepSolved = true;
            feedback(step.success || 'Correcte!', true);
            playSound('success');
        } else {
            if (el) el.addClass('tut-ko');
            feedback(step.fail || 'Aquesta no és la casella.', false);
            playSound('fail');
        }
        updateNav();
    }

    function attemptMove(from, to) {
        const step = currentStep();
        if (!step || step.kind !== 'task' || !stepChess) return;
        const Ctor = ChessCtor();
        // Coronació: selector de peça de l'app si hi és (com a les partides).
        let promotion = 'q';
        const needsPromotion = (typeof window.isUserPromotionMove === 'function') && window.isUserPromotionMove(stepChess, from, to);
        if (needsPromotion && typeof window.showPromotionPicker === 'function') {
            window.showPromotionPicker(stepChess.turn(), (piece) => { if (piece) finishAttempt(Ctor, step, from, to, piece); });
            return;
        }
        finishAttempt(Ctor, step, from, to, promotion);
    }
    function finishAttempt(Ctor, step, from, to, promotion) {
        const result = lessonAttempt(Ctor, step, from, to, promotion);
        if (result.reason === 'illegal') {
            feedback('Aquesta jugada no és legal.', false);
            playSound('fail');
            return;
        }
        clearMarks();
        if (board) board.position(result.fenAfter);
        const fromEl = squareEl(from);
        const toEl = squareEl(to);
        if (result.ok) {
            stepSolved = true;
            if (fromEl) fromEl.addClass('tut-ok');
            if (toEl) toEl.addClass('tut-ok');
            feedback(step.success || 'Correcte!', true);
            const c = core();
            let kind = 'success';
            try {
                const after = chessFor(Ctor, result.fenAfter);
                if (c && after) kind = c.soundKindForMove(result.move, { inCheck: after.in_check(), gameOver: after.game_over() }) || 'success';
                if (after && after.in_checkmate()) kind = 'gameover_win';
            } catch (e) { kind = 'success'; }
            playSound(kind);
            const jqr = jq();
            if (jqr) jqr('#btn-tutorial-retry').hide();
        } else {
            if (toEl) toEl.addClass('tut-ko');
            const msg = (result.reason === 'stalemate' && step.stalemate) ? step.stalemate : (step.fail || 'Aquesta no és la jugada que busquem.');
            feedback(msg, false);
            playSound('fail');
            const jqr = jq();
            if (jqr) jqr('#btn-tutorial-retry').show();
            // La posició torna a l'inici del pas al cap d'un moment (o amb el botó).
            setTimeout(() => { if (!stepSolved && currentStep() === step) resetStepPosition(); }, 1400);
        }
        updateNav();
    }
    function resetStepPosition() {
        const step = currentStep();
        if (!step || !board) return;
        stepChess = chessFor(ChessCtor(), step.fen);
        board.position(step.fen === 'empty' ? {} : step.fen.split(' ')[0]);
        tapFrom = null;
        clearMarks();
        applyStaticMarks(step);
        const jqr = jq();
        if (jqr) jqr('#btn-tutorial-retry').hide();
        const fb = $q('tutorial-feedback');
        if (fb) { fb.textContent = stepHint(step); fb.className = 'status-message tutorial-feedback'; }
    }
    function feedback(text, ok) {
        const fb = $q('tutorial-feedback');
        if (!fb) return;
        fb.textContent = text;
        fb.className = 'status-message tutorial-feedback ' + (ok ? 'is-ok' : 'is-ko');
    }

    // ---- Guia ----
    function renderGuide() {
        const container = $q('guide-content');
        if (!container || container.getAttribute('data-rendered') === '1') return;
        let chips = '<div class="guide-chips">';
        GUIDE.forEach(sec => { chips += '<button type="button" class="guide-chip" data-target="guide-sec-' + escapeHtml(sec.id) + '">' + escapeHtml(sec.title) + '</button>'; });
        chips += '</div>';
        let html = chips;
        GUIDE.forEach(sec => {
            html += '<div class="settings-panel guide-section" id="guide-sec-' + escapeHtml(sec.id) + '"><div class="settings-title">' + escapeHtml(sec.title) + '</div>';
            sec.items.forEach(item => {
                const icon = item.icon && item.icon.indexOf('ic-') === 0
                    ? '<svg class="guide-item-ic" aria-hidden="true"><use href="#' + escapeHtml(item.icon) + '"/></svg>'
                    : '<span class="guide-item-emoji" aria-hidden="true">' + escapeHtml(item.icon || '•') + '</span>';
                const btn = item.action
                    ? '<button type="button" class="btn btn-secondary guide-item-go" data-action="' + escapeHtml(item.action) + '">' + escapeHtml(item.cta || 'Vés-hi') + ' ›</button>'
                    : '';
                html += '<div class="guide-item"><div class="guide-item-head">' + icon + '<div class="guide-item-title">' + escapeHtml(item.title) + '</div></div>'
                    + '<div class="guide-item-text">' + (item.text || '') + '</div>'
                    + (btn ? '<div class="guide-item-actions">' + btn + '</div>' : '') + '</div>';
            });
            html += '</div>';
        });
        html += '<div class="settings-panel guide-section"><div class="settings-title">Aprèn a jugar</div><div class="guide-item"><div class="guide-item-text">Si encara no coneixes les regles (o vols repassar-les), el tutorial <strong>Aprèn a jugar</strong> les explica pas a pas amb un tauler interactiu.</div><div class="guide-item-actions"><button type="button" class="btn btn-secondary guide-item-go" data-action="tutorial">Aprèn a jugar ›</button></div></div></div>';
        container.innerHTML = html;
        container.setAttribute('data-rendered', '1');
    }

    // ---- Inicialització ----
    function initUi() {
        const $ = jq();
        if (!$) return;
        $('#btn-tutorial-banner').off('click').on('click', () => {
            const summary = progressSummary(loadProgress());
            openTutorial();
            // Si ja hi ha progrés, va directament a la lliçó que toca.
            if (summary.done && !summary.allDone && summary.nextId) openLesson(indexOfLesson(summary.nextId));
        });
        $('#learn-hint-link').off('click').on('click', (e) => { e.preventDefault(); openTutorial(); });
        $('#btn-guide-banner').off('click').on('click', () => openGuide());
        $('#btn-back-tutorial').off('click').on('click', () => { destroyBoard(); hideScreen('tutorial-screen'); });
        $('#btn-back-guide').off('click').on('click', () => hideScreen('guide-screen'));
        $('#btn-tutorial-index').off('click').on('click', () => showIndex());
        $('#tutorial-index').off('click').on('click', '.tutorial-lesson-row', function () {
            openLesson(indexOfLesson($(this).attr('data-lesson')));
        });
        $('#btn-tutorial-next').off('click').on('click', () => nextStep());
        $('#btn-tutorial-prev').off('click').on('click', () => prevStep());
        $('#btn-tutorial-retry').off('click').on('click', () => resetStepPosition());
        $('#guide-content').off('click').on('click', '.guide-item-go', function () {
            runAction($(this).attr('data-action'), 'guide-screen');
        }).on('click', '.guide-chip', function () {
            const el = $q($(this).attr('data-target'));
            if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        window.addEventListener('resize', () => resizeBoard());
        refreshBanner();
    }

    return api;
});
