from pathlib import Path
import re
import sys


TITLE = "Jugar a escacs online gratis en català | El Tauler"
DESCRIPTION = (
    "Juga a escacs online gratis en català a El Tauler: partides contra Stockfish "
    "adaptades al teu nivell, anàlisi de partides, obertures, jeroglífics i entrenament."
)


def replace_meta(html: str, key: str, value: str, content: str) -> str:
    pattern = rf'(<meta\s+{re.escape(key)}="{re.escape(value)}"\s+content=")[^"]*(">)'
    updated, count = re.subn(pattern, rf'\g<1>{content}\g<2>', html, count=1)
    if count == 0:
        raise SystemExit(f"No s'ha trobat la meta {key}={value}")
    return updated


def inject_seo(index_path: str) -> None:
    path = Path(index_path)
    html = path.read_text(encoding="utf-8")

    html, count = re.subn(r'<title>.*?</title>', f'<title>{TITLE}</title>', html, count=1)
    if count == 0:
        raise SystemExit("No s'ha trobat el <title>")

    html = replace_meta(html, "name", "description", DESCRIPTION)
    html = replace_meta(html, "property", "og:title", TITLE)
    html = replace_meta(html, "property", "og:description", DESCRIPTION)
    html = replace_meta(html, "name", "twitter:title", TITLE)
    html = replace_meta(html, "name", "twitter:description", DESCRIPTION)

    # Reforça la versió catalana i el domini canònic sense crear URLs duplicades.
    canonical = '<link rel="canonical" href="https://eltauler.cat/">'
    hreflang = (
        canonical
        + '\n    <link rel="alternate" hreflang="ca" href="https://eltauler.cat/">'
        + '\n    <link rel="alternate" hreflang="x-default" href="https://eltauler.cat/">'
    )
    if 'hreflang="ca"' not in html:
        if canonical not in html:
            raise SystemExit("No s'ha trobat el canonical")
        html = html.replace(canonical, hreflang, 1)

    # La dada estructurada ja existeix; actualitzem la descripció perquè coincideixi.
    old_description = (
        "Juga i millora als escacs en català: partides contra Stockfish al teu nivell, "
        "revisió de partides, jeroglífics, obertures i partides col·lectives."
    )
    html = html.replace(old_description, DESCRIPTION)

    # Text real i visible per a usuaris i cercadors: no és text ocult ni keyword stuffing.
    if 'class="seo-home-heading"' not in html:
        marker = '<h1>EL TAULER</h1>'
        block = '''<h1>EL TAULER</h1>
            <h2 class="seo-home-heading">Jugar a escacs online en català</h2>
            <p class="seo-home-intro">Juga gratis contra Stockfish al teu nivell i millora amb anàlisi de partides, obertures i exercicis d’escacs.</p>'''
        if marker not in html:
            raise SystemExit("No s'ha trobat el títol EL TAULER de la portada")
        html = html.replace(marker, block, 1)

    css = '''
        /* Text introductori indexable i visible de la portada */
        #start-screen .seo-home-heading {
            margin: 0.2rem auto 0.35rem;
            max-width: 30rem;
            font-family: 'Inter', system-ui, sans-serif;
            font-size: 1rem;
            font-weight: 600;
            line-height: 1.3;
            letter-spacing: 0;
            color: var(--text-secondary);
            text-align: center;
        }
        #start-screen .seo-home-intro {
            margin: 0 auto 0.9rem;
            max-width: 31rem;
            font-size: 0.88rem;
            line-height: 1.45;
            color: var(--text-secondary);
            text-align: center;
        }
        @media (max-width: 420px) {
            #start-screen .seo-home-heading { font-size: 0.95rem; }
            #start-screen .seo-home-intro { font-size: 0.82rem; }
        }
'''
    if '#start-screen .seo-home-heading {' not in html:
        marker = '</style>'
        if marker not in html:
            raise SystemExit("No s'ha trobat el final dels estils")
        html = html.replace(marker, css + '    </style>', 1)

    path.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Ús: inject-seo.py <index.html>")
    inject_seo(sys.argv[1])
