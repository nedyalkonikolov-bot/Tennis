from pathlib import Path

path = Path("functions/api/db/sync.js")
text = path.read_text()
text = text.replace("const PLAYER_PROFILE_SYNC_LIMIT = 180;", "const PLAYER_PROFILE_SYNC_LIMIT = 6;")
path.write_text(text)
