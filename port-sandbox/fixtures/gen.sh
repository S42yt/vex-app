#!/bin/sh
# Regenerates the audio fixtures (git-ignored) with ffmpeg. Run from anywhere: sh fixtures/gen.sh
set -e
cd "$(dirname "$0")"
ffmpeg -v error -y -f lavfi -i "color=c=0x6a3cff:s=300x300:d=1" -frames:v 1 cover.jpg
ffmpeg -v error -y -f lavfi -i "sine=frequency=440:duration=240" -i cover.jpg -map 0:a -map 1:v -c:a libmp3lame -b:a 320k -c:v copy -id3v2_version 3 -metadata title="Café Déjà Vu (Original Mix)" -metadata artist="Zoë" -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" -disposition:v attached_pic tagged.mp3
ffmpeg -v error -y -f lavfi -i "sine=frequency=330:duration=200" -c:a aac -b:a 192k -metadata title="M4A Title" tagged.m4a
ffmpeg -v error -y -f lavfi -i "sine=frequency=550:duration=180" -c:a flac -metadata TITLE="Flac Título" tagged.flac
ffmpeg -v error -y -f lavfi -i "sine=frequency=440:duration=10" -c:a libvorbis untagged.ogg
ffmpeg -v error -y -f lavfi -i "sine=frequency=440:duration=240" -c:a libmp3lame -b:a 320k stream.mp3
