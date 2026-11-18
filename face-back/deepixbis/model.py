# -*- coding: utf-8 -*-
"""
DeePixBiS architecture — vendored from
https://github.com/Saiyam26/Face-Anti-Spoofing-using-DeePixBiS (itself based on
the "Deep Pixel-wise Binary Supervision for Face PAD" paper, ICB 2019). Kept as
a single small file since the whole model is ~20 lines: the first 8 layers of
DenseNet-161 (feature extractor) + a 1x1 conv "pixel map" head + a linear head
over the flattened map. Architecture must match the vendored DeePixBiS.pth
checkpoint exactly (layer names/shapes) — do not "clean up" the structure.
"""
import torch
from torch import nn
import torch.nn.functional as F
from torchvision import models


class DeePixBiS(nn.Module):
    def __init__(self, pretrained=False):
        super().__init__()
        # pretrained=False: we always immediately overwrite these weights with
        # the vendored checkpoint's state_dict, so downloading ImageNet weights
        # here would just be a slow, network-dependent no-op.
        dense = models.densenet161(weights=None) if not pretrained else models.densenet161(weights="DEFAULT")
        features = list(dense.features.children())
        self.enc = nn.Sequential(*features[:8])
        self.dec = nn.Conv2d(384, 1, kernel_size=1, stride=1, padding=0)
        self.linear = nn.Linear(14 * 14, 1)

    def forward(self, x):
        enc = self.enc(x)
        dec = self.dec(enc)
        out_map = torch.sigmoid(dec)
        out = self.linear(out_map.view(-1, 14 * 14))
        out = torch.sigmoid(out)
        out = torch.flatten(out)
        return out_map, out
