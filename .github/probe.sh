#!/bin/bash
mkdir -p out/f && cd out/f
npm pack -q @fontsource-variable/unbounded @fontsource/jetbrains-mono >/dev/null 2>&1
for f in *.tgz; do mkdir -p x; tar xzf $f -C x; done
find x -name "*latin-wght-normal.woff2" -o -name "jetbrains-mono-latin-[4578]00-normal.woff2" | while read f; do cp "$f" .; done
find x -name LICENSE | head -2 | while read f; do cp "$f" "LICENSE-$(basename $(dirname $f))"; done
rm -rf x *.tgz; ls -la
cd ../..
# b-roll: file sizes of a few candidates
for id in "Earth Views from the International Space Station" "GSFC_20160426_SDO_m12224_SolarFlare"; do
  curl -sL "https://images-assets.nasa.gov/video/${id// /%20}/collection.json" | tr ',' '\n' | grep -i "mp4" | while read u; do u=$(echo $u | tr -d '[]"'); echo "$u $(curl -sIL "${u// /%20}" | grep -i content-length | tail -1)"; done
done
