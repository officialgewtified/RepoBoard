#!/bin/bash
mkdir -p out
which ffmpeg || (sudo apt-get update -qq; sudo apt-get install -y -qq --no-install-recommends ffmpeg >/dev/null)
cd .github/s
node sky.js ../../out/data.json 2>&1 | cut -c1-500
cp ../../out/data.json ../../out/data0.json
time timeout 900 node broll.js ../../out/data.json 2>&1 | tail -12
for f in ../../out/broll/*.mp4; do ffprobe -v error -show_entries format=duration -of csv=p=0 $f; ffmpeg -loglevel error -y -ss 3 -i $f -frames:v 1 -vf scale=270:-2 "${f%.mp4}.jpg"; done
rm -f ../../out/broll/*.mp4
