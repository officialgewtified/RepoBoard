"""Builds space/hol.html: the Liftoff report's own chrome (styles, stars, HUD, rocket ending) from space.html + hol.part.html."""
import sys
src=open(sys.argv[1]).read(); part=open("hol.part.html").read()
def between(s,a,b,inc_a=True):
    i=s.index(a); j=s.index(b,i+len(a)); return s[i if inc_a else i+len(a):j]
css=between(src,"<style>","</style>",False); body=between(src,'<svg id="stars"></svg>','<script>')
helpers=between(src,"const clamp=","// ---- graphics"); ret=between(src,"function reticle(){","// ---- build")
cov=between(src,"function coverReticle(){","window.thumb="); endlogo=between(src," // the mark spins in hud","\n// cover image")
ready=between(src,"window.ready=","window.build=")
pcss=between(part,"<!--CSS-->","<!--JS-->",False); pjs=between(part,"<!--JS-->","<!--ENDJS-->",False)
pthumb=part[part.index("<!--ENDJS-->")+len("<!--ENDJS-->"):]
open("hol.html","w").write(f'''<!doctype html>
<html><head><meta charset="utf-8"><title>Liftoff higher or lower</title>
<style>{css}{pcss}</style></head><body>
{body}<script>
{helpers}{ret}{cov}{pjs}{endlogo}
{pthumb.strip()}
{ready}window.ready=(r=>()=>Promise.all([r(),typeof PRE!=="undefined"?PRE:0]))(window.ready);window.build=build;window.render=render;
</script></body></html>
''')
