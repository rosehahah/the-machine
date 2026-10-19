"""Rebuild models/owlv2_weapons.onnx (only needed if the file is lost or the queries change).

OWLv2 finds objects from text. The weapon queries are encoded once here, so the exported model takes an
image only and the Machine runs it with onnxruntime, without PyTorch. Needs a throwaway environment:

    uv venv -p 3.11 /tmp/owl && uv pip install --python /tmp/owl/bin/python torch transformers==4.56.2 onnx
    /tmp/owl/bin/python tools/export_owlv2.py
"""
import json
from pathlib import Path

import torch
from transformers import Owlv2Processor, Owlv2ForObjectDetection

MODELS = Path(__file__).resolve().parent.parent / "models"
NAME = "google/owlv2-base-patch16-ensemble"  # Apache-2.0
QUERIES = ["a knife", "a gun", "a pistol", "a rifle", "scissors", "a baseball bat"]

proc = Owlv2Processor.from_pretrained(NAME)
model = Owlv2ForObjectDetection.from_pretrained(NAME).eval()
tok = proc.tokenizer(QUERIES, padding="max_length", max_length=16, return_tensors="pt")
with torch.no_grad():
    q = model.owlv2.get_text_features(input_ids=tok.input_ids, attention_mask=tok.attention_mask)


class ImageOnly(torch.nn.Module):
    def __init__(self, m, q):
        super().__init__()
        self.m = m
        self.register_buffer("q", q)

    def forward(self, px):
        fm = self.m.image_embedder(pixel_values=px)[0]
        b, h, w, d = fm.shape
        feats = fm.reshape(b, h * w, d)
        logits = self.m.class_predictor(feats, self.q[None], torch.ones(1, self.q.shape[0], dtype=torch.bool))[0]
        return logits, self.m.box_predictor(feats, fm)


torch.onnx.export(ImageOnly(model, q).eval(), (torch.zeros(1, 3, 960, 960),), str(MODELS / "owlv2_weapons.onnx"),
                  input_names=["pixel_values"], output_names=["logits", "boxes"], opset_version=17, dynamo=False)
(MODELS / "owlv2_weapons.json").write_text(json.dumps(QUERIES))
print("wrote", MODELS / "owlv2_weapons.onnx")
