import os
import cv2
import sys
import numpy as np
from check import face_quality_gate, get_face_embedding
try:
    from antispoof_service import predict_safe as antispoof_predict
except Exception as e:
    antispoof_predict = None

def test_image(img_path):
    print(f"Testing image: {img_path}")
    img = cv2.imread(img_path)
    if img is None:
        print("Failed to read image")
        return
    print(f"Image shape: {img.shape}")
    
    ok, reason = face_quality_gate(img_path)
    print(f"face_quality_gate: ok={ok}, reason={reason}")
    
    if antispoof_predict:
        spoof = antispoof_predict(image_path=img_path)
        print(f"antispoof_predict: {spoof}")
    else:
        print("antispoof_predict: Not available")
        
    emb = get_face_embedding(img_path)
    if emb is not None:
        print(f"Embedding generated! Shape: {emb.shape}")
    else:
        print("Embedding generation failed.")

if __name__ == "__main__":
    test_image("test_face.jpg")
