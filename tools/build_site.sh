#!/bin/zsh
# Build the public demo site (landing page + console on the mock city) into _site/,
# and with --publish push it to the gh-pages branch (GitHub Pages).
# Needs the console footage first: .venv/bin/python tools/build_clips.py, and web/data/world.json (run.sh makes it).
set -e
cd "${0:A:h}/.."
rm -rf _site && mkdir -p _site/media _site/screenshots
cp site/index.html _site/
cp web/console.html web/hud.js _site/
cp -R web/console web/fonts web/data _site/
cp -R web/media/clips web/media/crops.jpg _site/media/
cp docs/screenshots/*.jpg _site/screenshots/
sips -Z 1200 docs/screenshots/mpov.jpg --out _site/screenshots/card.jpg >/dev/null
touch _site/.nojekyll
du -sh _site
if [[ $1 == --publish ]]; then
  cd _site
  git init -q -b gh-pages
  git add -A
  git -c user.name="$(git -C .. config user.name || echo rosehahah)" -c user.email="$(git -C .. config user.email || echo rosehahah@users.noreply.github.com)" \
    commit -qm "Publish site"
  git push -qf "$(git -C .. remote get-url origin)" gh-pages
  echo "pushed to gh-pages"
fi
