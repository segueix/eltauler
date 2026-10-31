# Motor Matxa ONNX — Eltauler

La pàgina `laboratori-veu.html` ofereix **Matxa en línia** (opció predeterminada) i **Matxa ONNX (servidor propi)**. El fitxer `matxa-onnx.js` és l'adaptador del segon motor.

## Servidor necessari
Eltauler s'allotja a GitHub Pages i no executa processos Python o ONNX al servidor. Per activar el segon motor cal desplegar una instància pròpia de [projecte-aina/tts-api](https://github.com/projecte-aina/tts-api), descarregar els pesos ONNX segons les instruccions oficials, i servir-la sota un domini HTTPS. El README oficial documenta el desplegament Docker i la crida POST a `/api/tts`.

Exemple de petició:
```json
{"text":"Escac i mat!","voice":"elia","language":"ca-es","type":"text"}
```

En el laboratori, selecciona «Matxa ONNX (servidor propi)», introdueix la URL base HTTPS (sense `/api/tts`) i prem «Configura ONNX». El navegador envia les peticions directament al servidor configurat. Per funcionar des de `eltauler.cat`, el servidor ha de permetre CORS per a aquest origen. Comprova també els noms de les veus admeses per la versió del model instal·lada.

## Abast i límits
- L'adaptador **no inclou** pesos ONNX ni desplega cap servidor. Per tant, la nova opció només funcionarà després de configurar una instància accessible.
- El control de velocitat de la versió ONNX actual canvia la velocitat de reproducció al navegador, no la generació neuronal. La versió oficial del servidor ofereix una variable `SPEECH_SPEED` d'arrencada.
- Les veus ONNX poden no coincidir amb les de la demo en línia; cal validar-les al servidor instal·lat.
- Sense configuració, es manté Matxa en línia. No s'envien textos a una URL ONNX desconeguda.
- No s'ha verificat la síntesi d'àudio de punta a punta en un servidor ONNX desplegat.

## Fonts i llicències
- [AINA tts-api](https://github.com/projecte-aina/tts-api): codi MPL-2.0.
- Les llicències dels pesos són independents i s'han de consultar abans de redistribuir-los.
