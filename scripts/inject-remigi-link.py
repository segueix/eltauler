from pathlib import Path
import sys


def inject_remigi_link(index_path: str) -> None:
    path = Path(index_path)
    html = path.read_text(encoding="utf-8")

    topbar = '<div class="home-topbar">'
    remigi_link = '''<div class="home-topbar">
                <a class="remigi-home-link" href="/remigi/" target="_self" aria-label="Obre Remigi" title="Remigi">
                    <img src="/remigi/icona-192.png" alt="Remigi">
                </a>'''

    if 'class="remigi-home-link"' not in html:
        if topbar not in html:
            raise SystemExit("No s'ha trobat la barra superior de la portada")
        html = html.replace(topbar, remigi_link, 1)

    css = '''
        /* Accés a Remigi: logo gran a l'esquerra; usuari i contacte a la dreta */
        #start-screen .home-topbar {
            position: relative !important;
            display: flex !important;
            align-items: flex-start !important;
            justify-content: flex-end !important;
            gap: 8px !important;
            width: 100%;
            min-height: 126px;
            padding-left: 138px;
        }
        #start-screen .home-user-chip,
        #start-screen .home-at-btn {
            flex: 0 0 auto;
        }
        .remigi-home-link {
            position: absolute;
            left: 0;
            top: 0;
            width: 126px;
            height: 126px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 18px;
            overflow: hidden;
            border: 1px solid rgba(201, 162, 39, 0.42);
            background: rgba(0,0,0,0.18);
            box-shadow: 0 6px 18px rgba(0,0,0,0.30);
            cursor: pointer;
            z-index: 2;
            transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
        }
        .remigi-home-link img {
            width: 100%;
            height: 100%;
            display: block;
            object-fit: cover;
        }
        .remigi-home-link:hover,
        .remigi-home-link:focus-visible {
            transform: scale(1.035);
            border-color: var(--accent-gold);
            box-shadow: 0 8px 22px rgba(0,0,0,0.38);
            outline: none;
        }
        body.epaper-mode .remigi-home-link {
            border-color: #999;
            box-shadow: none;
        }
        @media (max-width: 420px) {
            #start-screen .home-topbar {
                min-height: 114px;
                padding-left: 124px;
                gap: 6px !important;
            }
            .remigi-home-link {
                width: 114px;
                height: 114px;
                border-radius: 16px;
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
