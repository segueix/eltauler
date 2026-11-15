from pathlib import Path
import sys


def inject_tauler_link(game_screen_path: str) -> None:
    path = Path(game_screen_path)
    source = path.read_text(encoding="utf-8")

    if 'className="tauler-home-link"' in source:
        return

    marker = '        <ul className="players">\n          {game.players.map((player, index) => {'
    replacement = '''        <ul className="players">
          <li
            aria-label="El Tauler"
            style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center' }}
          >
            <a
              className="tauler-home-link"
              href="https://eltauler.cat/"
              target="_self"
              aria-label="Obre El Tauler"
              title="El Tauler"
              style={{
                width: '2.65rem',
                height: '2.65rem',
                display: 'grid',
                placeItems: 'center',
                overflow: 'hidden',
                borderRadius: '50%',
                border: '1px solid color-mix(in srgb, var(--or) 65%, var(--vora))',
                background: '#fff',
                textDecoration: 'none',
                boxShadow: '0 1px 3px rgb(0 0 0 / 0.16)',
              }}
            >
              {/* La icona d'El Tauler (la de Remigi: public/eltauler-192.png), no un rei d'escacs. */}
              <img
                src={`${import.meta.env.BASE_URL}eltauler-192.png`}
                alt=""
                width={42}
                height={42}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </a>
          </li>
          {game.players.map((player, index) => {'''

    if marker not in source:
        raise SystemExit("No s'ha trobat la llista de jugadors de Remigi")

    path.write_text(source.replace(marker, replacement, 1), encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Ús: inject-tauler-link-remigi.py <GameScreen.tsx>")
    inject_tauler_link(sys.argv[1])
