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
        /* Accés a Remigi, a dalt a l'esquerra de la portada */
        #start-screen .home-topbar {
            position: relative !important;
            padding-left: 52px;
            min-height: 42px;
        }
        .remigi-home-link {
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 42px;
            height: 42px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 11px;
            overflow: hidden;
            border: 1px solid rgba(201, 162, 39, 0.42);
            background: rgba(0,0,0,0.18);
            box-shadow: 0 3px 10px rgba(0,0,0,0.25);
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
            transform: translateY(-50%) scale(1.06);
            border-color: var(--accent-gold);
            box-shadow: 0 5px 14px rgba(0,0,0,0.35);
            outline: none;
        }
        body.epaper-mode .remigi-home-link {
            border-color: #999;
            box-shadow: none;
        }
        @media (max-width: 420px) {
            #start-screen .home-topbar { padding-left: 46px; min-height: 38px; }
            .remigi-home-link { width: 38px; height: 38px; border-radius: 10px; }
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
