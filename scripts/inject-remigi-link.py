from pathlib import Path
import sys


def inject_remigi_link(index_path: str) -> None:
    path = Path(index_path)
    html = path.read_text(encoding="utf-8")

    # La capçalera de la portada té la marca a l'esquerra i, a la dreta,
    # .home-topbar (nom d'usuari i contacte): Remigi hi entra el primer.
    topbar = '<div class="home-topbar">'
    remigi_link = '''<div class="home-topbar">
                    <a class="remigi-home-link" href="/remigi/" target="_self" aria-label="Obre Remigi" title="Remigi">
                        <img src="/remigi/icona-192.png" alt="">
                        <span class="remigi-home-label">Remigi</span>
                    </a>'''

    if 'class="remigi-home-link"' not in html:
        if topbar not in html:
            raise SystemExit("No s'ha trobat la barra superior de la portada")
        html = html.replace(topbar, remigi_link, 1)

    css = '''
        /* Accés a Remigi a la capçalera de la portada, abans del nom d'usuari */
        .remigi-home-link {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            flex: 0 0 auto;
            height: 36px;
            padding: 0 11px 0 3px;
            border-radius: 999px;
            border: 1px solid rgba(201, 162, 39, 0.35);
            background: rgba(255, 255, 255, 0.06);
            color: var(--text-primary);
            font-family: var(--hd-font, inherit);
            font-size: 0.85rem;
            font-weight: 700;
            line-height: 1;
            text-decoration: none;
            transition: background .15s ease, border-color .15s ease;
        }
        .remigi-home-link img {
            width: 30px;
            height: 30px;
            display: block;
            border-radius: 50%;
            object-fit: cover;
            background: #16867d;
        }
        .remigi-home-link:hover,
        .remigi-home-link:focus-visible {
            background: rgba(255, 255, 255, 0.12);
            border-color: var(--accent-gold);
        }
        .remigi-home-link:focus-visible { outline: 3px solid var(--accent-gold); outline-offset: 2px; }
        body.day-mode .remigi-home-link {
            background: rgba(120, 95, 40, 0.08);
            border-color: rgba(120, 95, 40, 0.3);
        }
        body.epaper-mode .remigi-home-link {
            background: #f4f4f4;
            border-color: #9e9e9e;
            color: #222;
        }
        /* Al mòbil només la icona: el nom ja el diu l'etiqueta accessible. */
        @media (max-width: 480px) {
            .remigi-home-link { padding: 0 3px; }
            .remigi-home-label { display: none; }
        }
'''

    if '.remigi-home-link {' not in html:
        marker = '</style>'
        if marker not in html:
            raise SystemExit("No s'ha trobat el final dels estils de la portada")
        html = html.replace(marker, css + '    </style>', 1)

    path.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Ús: inject-remigi-link.py <index.html>")
    inject_remigi_link(sys.argv[1])
