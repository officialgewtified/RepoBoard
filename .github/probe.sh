#!/bin/bash
pip install -q pillow 2>&1 | tail -1
which ffmpeg || (sudo apt-get update -qq; sudo apt-get install -y -qq --no-install-recommends ffmpeg >/dev/null)
python3 .github/cands.py
