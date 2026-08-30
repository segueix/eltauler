from pathlib import Path
import sys


def inject_remigi_link(index_path: str) -> None:
    path = Path(index_path)
    html = path.read_text(encoding="utf-8")

    topbar = '<div class="home-topbar">'
    remigi_link = '''<div class="home-topbar">
                <a class="remigi-home-link" href="/remigi/" target="_self" aria-label="Obre Remigi" title="Remigi">
                    <img src="/remigi/icona-192.png" alt="Remigi">
                    <span class="remigi-home-label">Remigi</span>
                </a>'''

    if 'class="remigi-home-link"' not in html:
        if topbar not in html:
            raise SystemExit("No s'ha trobat la barra superior de la portada")
        html = html.replace(topbar, remigi_link, 1)

    css = '''
        /* Accés a Remigi: logo i nom a l'esquerra; usuari i contacte a la dreta */
        #start-screen .home-topbar {
            position: relative !important;
            display: flex !important;
            align-items: flex-start !important;
            justify-content: flex-end !important;
            gap: 8px !important;
            width: 100%;
            min-height: 126px;
            padding-left: 116px;
        }
        #start-screen .home-user-chip,
        #start-screen .home-at-btn {
            flex: 0 0 auto;
        }
        .remigi-home-link {
            position: absolute;
            left: 0;
            top: 0;
            width: 104px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            color: inherit;
            text-decoration: none;
            cursor: pointer;
            z-index: 2;
            outline: none;
        }
        .remigi-home-link img {
            width: 104px;
            height: 104px;
            display: block;
            object-fit: cover;
            object-position: center;
            border-radius: 4px;
            border: 1px solid rgba(201, 162, 39, 0.52);
            background: #16867d;
            box-shadow: 0 5px 16px rgba(0,0,0,0.30);
            transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
        }
        .remigi-home-label {
            display: block;
            width: 100%;
            margin-top: 5px;
            text-align: center;
            font-size: 0.82rem;
            font-weight: 600;
            line-height: 1.1;
            letter-spacing: 0.03em;
            color: color-mix(in srgb, var(--bg-dark) 65%, var(--text-secondary));
            text-shadow: 0 1px 1px rgba(0,0,0,0.18);
        }
        .remigi-home-link:hover img,
        .remigi-home-link:focus-visible img {
            transform: scale(1.035);
            border-color: var(--accent-gold);
            box-shadow: 0 7px 20px rgba(0,0,0,0.38);
        }
        /* Corona principal d'El Tauler: més gran per equilibrar-la amb Remigi. */
        #start-screen > .app-logo {
            font-size: 4.4rem;
            line-height: 1;
            margin-top: 2px;
            margin-bottom: 7px;
        }
        body.epaper-mode .remigi-home-link img {
            border-color: #999;
            box-shadow: none;
        }
        body.epaper-mode .remigi-home-label {
            color: #777;
            text-shadow: none;
        }
        @media (max-width: 420px) {
            #start-screen .home-topbar {
                min-height: 114px;
                padding-left: 104px;
                gap: 6px !important;
            }
            .remigi-home-link {
                width: 94px;
            }
            .remigi-home-link img {
                width: 94px;
                height: 94px;
                border-radius: 4px;
            }
            .remigi-home-label {
                margin-top: 4px;
                font-size: 0.76rem;
            }
            #start-screen > .app-logo {
                font-size: 3.9rem;
            }
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
