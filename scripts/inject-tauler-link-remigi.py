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
                borderRadius: '50%',
                border: '1px solid color-mix(in srgb, var(--or) 65%, var(--vora))',
                background: 'linear-gradient(145deg, color-mix(in srgb, var(--or) 12%, var(--superficie)), var(--superficie))',
                color: 'var(--or)',
                fontSize: '2rem',
                lineHeight: 1,
                textDecoration: 'none',
                boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.35), 0 1px 3px rgb(0 0 0 / 0.16)',
                textShadow: '0 1px 1px rgb(0 0 0 / 0.12)',
              }}
            >
              ♔
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
