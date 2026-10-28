# Memòria narrativa de Stockfish vs Lozza TV — fase 2

## Funció

La retransmissió deixa de presentar els motius verificats com a frases desconnectades. El mòdul local **narrativa.js** recorda els temes que l'espectador ha sentit i pot recuperar-los quan tornen a aparèixer de forma comprovable.

És una capa de **redacció contextual**, no un nou motor d'escacs. No s'atribueixen intencions als jugadors ni es dedueixen avantatges de cap expressió lingüística.

## Fils implementats

- Centre: ocupació i control de caselles centrals per un bàndol.
- Columnes: ocupació de columna oberta o semioberta i posterior duplicació de torres a la mateixa columna.
- Peons passats: aparició i avanç del mateix peó identificat per color i columna.
- Pressió: el mateix bàndol pressiona una peça a una casella concreta.
- Seguretat del rei: deteccions successives de pressió a la zona del rei adversari.
- Majoria de peons: accions al flanc de rei o de dama.

Les connexions s'identifiquen per l'etiqueta estructurada de cada motiu (kind/key/sig), no per coincidències aproximades entre textos. Només es recorden fets que realment s'han comentat. La continuïtat s'expressa com a recuperació d'un tema, sense afirmar que la pressió ha estat permanent entre les dues jugades.

Hi ha tancaments específics, amb comprovació del moviment legal, quan es captura una peça que prèviament havia estat identificada com a objectiu de pressió o un peó passat seguit durant la partida.

## Límits contra la monotonia i els errors

- Màxim de 16 fils de memòria per partida.
- Caducitat dels fils després de 48 semijugades sense tornar-ne a parlar.
- Un comentari narratiu ampliat com a màxim cada 8 semijugades.
- Un mínim de 3 semijugades des de la menció anterior per recuperar el fil.
- Comentaris de fins a 37 paraules quan s'hi afegeix context.
- Els mats, resums i avisos tàctics crítics conserven la formulació prioritària.
- Cap frase de continuïtat si no existeix un motiu verificat actualment.
- Memòria reiniciada a cada nova partida.

## Reprendre i desfer jugades

La memòria forma part de les instantànies ja guardades per cada moviment. Es restaura quan l'usuari tira enrere, es manté en pausa i es recomputa quan l'usuari pren el control. No s'emmagatzema a les preferències ni es comparteix entre dispositius.

La interfície mostra un discret resum de **fils comentats**; no els presenta com si fossin necessàriament plans actius o avantatges actuals.

## Proves

- `tests/narrativa.test.js`: continuïtat, comprovacions de captures, límits, immutabilitat, integració amb la TV i simulació.
- `npm test`: regressió general amb els comentaris, jugades legals i controls.
- Si el mòdul falla o no es carrega, els comentaris existents continuen funcionant.

## Fases següents

- **Fase 3**: explicacions dels jeroglífics i prosòdia de la veu Matxa.
- **Fase 4**: auditar partides completes, mesurar monotonia, validar la qualitat narrativa i optimitzar el rendiment.
