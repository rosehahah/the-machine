#!/bin/zsh
# The Machine — start the server and open the interface.
#   ./run.sh                      Mac + iPhone cameras
#   ./run.sh --source clip.mp4    add a video/image file as an extra feed
#   ./run.sh --no-cameras --source clip.mp4
cd "${0:A:h}"
if [[ ! -x .venv/bin/python ]]; then
  echo "Setting up Python environment (first run)…"
  uv venv -q -p 3.11 .venv && uv pip install -q --python .venv/bin/python -r requirements.txt || exit 1
fi
[[ -s models/object_detection_yolox_2022nov.onnx ]] || tools/fetch_models.sh || exit 1
if [[ ! -s web/media/clips/4000.mp4 ]]; then
  echo "Fetching stock footage for the console (first run)…"
  .venv/bin/python tools/build_clips.py || exit 1
fi
PORT=8000
(sleep 4 && open "http://localhost:$PORT") &
exec .venv/bin/python backend/server.py --port $PORT "$@"
