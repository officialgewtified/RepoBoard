"""Builds space/explain.html (Space Explained) from explain.part.html plus Liftoff's fonts, colours and logo from space.html.
usage (in space/game): python3 assemble_explain.py ../space.html"""
import re, sys
src = open(sys.argv[1]).read(); part = open("explain.part.html").read()
css = src[src.index("<style>") + 7:src.index("</style>")]
fonts = "".join(re.findall(r"@font-face\{[^}]*\}", css)); root = re.search(r":root\{[^}]*\}", css).group(0)
i = src.index("const MARK="); j = src.index("`;", i) + 2; mark = src[i:j]
pcss = part[part.index("<!--CSS-->") + 10:part.index("<!--JS-->")]; pjs = part[part.index("<!--JS-->") + 9:part.index("<!--ENDJS-->")]
ready = '''window.ready=()=>Promise.all(['900 100px "Unbounded"','800 100px "Unbounded"','400 30px "JBM"','600 30px "JBM"','700 30px "JBM"','800 30px "JBM"','600 30px "Archivo"'].map(f=>document.fonts.load(f)));'''
open("../explain.html", "w").write(f'''<!doctype html>
<html><head><meta charset="utf-8"><title>Liftoff space explained</title>
<style>{fonts}{root}{pcss}</style></head><body>
<div id="stage"></div><div id="thumb"></div><script>
{mark}
{pjs}
{ready}window.build=build;window.render=render;
</script></body></html>
''')
print("wrote space/explain.html")
