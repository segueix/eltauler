from pathlib import Path

p = Path('app.js')
text = p.read_text(encoding='utf-8')
old = """function saveAntidoteNoticesPreference(enabled) {
    antidoteNoticesEnabled = !!enabled;
    try { localStorage.setItem(ANTIDOTE_NOTICES_KEY, antidoteNoticesEnabled ? '1' : '0'); } catch (e) {    if (!antidoteNoticesEnabled) hideAntidoteLivePanel();
}
}
"""
new = """function saveAntidoteNoticesPreference(enabled) {
    antidoteNoticesEnabled = !!enabled;
    try { localStorage.setItem(ANTIDOTE_NOTICES_KEY, antidoteNoticesEnabled ? '1' : '0'); } catch (e) {}
    if (!antidoteNoticesEnabled) hideAntidoteLivePanel();
}
"""
count = text.count(old)
if count != 1:
    raise SystemExit(f'Expected one malformed preference block, found {count}')
p.write_text(text.replace(old, new, 1), encoding='utf-8')
