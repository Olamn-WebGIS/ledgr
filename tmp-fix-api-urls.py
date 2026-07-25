from pathlib import Path
import re

path = Path('src/App.jsx')
text = path.read_text(encoding='utf-8')
pattern = re.compile(r"(['\"`])http://localhost:5000([^'\"`]*)\1")
new_text = pattern.sub(lambda m: f"`\${{apiBaseUrl}}{m.group(2)}`", text)
path.write_text(new_text, encoding='utf-8')
print('changed' if new_text != text else 'unchanged')
