#!/bin/zsh
# Download the detection / face models from the OpenCV model zoo into models/.
# YuNet: MIT. SFace, YOLOX: Apache-2.0. The OWLv2 weapon model is built with tools/export_owlv2.py (optional).
cd "${0:A:h}/.."
mkdir -p models
BASE=https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models
for p in face_detection_yunet/face_detection_yunet_2023mar.onnx \
         face_recognition_sface/face_recognition_sface_2021dec.onnx \
         object_detection_yolox/object_detection_yolox_2022nov.onnx; do
  f=models/${p:t}
  [[ -s $f ]] && continue
  echo "Downloading $f…"
  curl -fL --progress-bar -o $f "$BASE/$p" || { rm -f $f; exit 1; }
done
