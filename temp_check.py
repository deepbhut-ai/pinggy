import pathlib
p = pathlib.Path('c:/Users/gattu/OneDrive/Desktop/officework/pinggy/app/static/landing.html')
html = p.read_text(encoding='utf-8')
print('lines', len(html.splitlines()))
print('head', html[:200])
