from flask import Flask, request, jsonify
from deepface import DeepFace
import os
import uuid
import cv2
import numpy as np
from flask_cors import CORS


app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "temp_uploads"
FACE_DB_FOLDER = "face"

# Ensure upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def save_temp_image(file_storage):
    """Save incoming image temporarily and return its path."""
    ext = os.path.splitext(file_storage.filename)[1]
    filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    file_storage.save(file_path)
    return file_path


# @app.route("/verify-face", methods=["POST"])
# def verify_face():
#     user_id = request.form.get("user_id")
#     face_image = request.files.get("face_image")

#     if not user_id or not face_image:
#         return jsonify({"error": "user_id and face_image are required"}), 400

#     uploaded_img_path = save_temp_image(face_image)
#     user_folder = os.path.join(FACE_DB_FOLDER, user_id)

#     if not os.path.exists(user_folder):
#         os.remove(uploaded_img_path)
#         return jsonify({"match": False, "reason": "No face data for user"}), 404

#     try:
#         for filename in os.listdir(user_folder):
#             stored_img_path = os.path.join(user_folder, filename)

#             result = DeepFace.verify(
#                 img1_path=uploaded_img_path,
#                 img2_path=stored_img_path,
#                 model_name="VGG-Face",
#                 detector_backend="opencv",
#                 enforce_detection=False,
#                 distance_metric="cosine"
#             )

#             print("DISTANCE:", result["distance"], "THRESHOLD:", result["threshold"])

#             if result["distance"] <= 0.1:
#                 os.remove(uploaded_img_path)
#                 return jsonify({"match": True})

#         os.remove(uploaded_img_path)
#         return jsonify({"match": False})

#     except Exception as e:
#         os.remove(uploaded_img_path)
        
#         return jsonify({"error": str(e)}), 500


@app.route("/verify-face", methods=["POST"])
def verify_face():
    user_id = request.form.get("user_id")
    face_image = request.files.get("face_image")
    print("user_id:", user_id)
    print("face_image:", face_image)

    if not user_id or not face_image:
        return jsonify({"error": "user_id and face_image are required"}), 400

    uploaded_img_path = save_temp_image(face_image)
    user_folder = os.path.join(FACE_DB_FOLDER, user_id)

    if not os.path.exists(user_folder):
        # os.remove(uploaded_img_path)
        return jsonify({"match": False, "reason": "No face data for user"}), 404

    try:
        for filename in os.listdir(user_folder):
            stored_img_path = os.path.join(user_folder, filename)

            result = DeepFace.verify(
                img1_path=uploaded_img_path,
                img2_path=stored_img_path,
                model_name="Facenet512",
                detector_backend="retinaface",
                enforce_detection=False,
                distance_metric="cosine"
            )

            print("DISTANCE:", result["distance"], "THRESHOLD:", result["threshold"])

            if result["distance"] <= 0.4:
                # os.remove(uploaded_img_path)
                return jsonify({"match": True})

        # os.remove(uploaded_img_path)
        return jsonify({"match": False})

    except Exception as e:
        # os.remove(uploaded_img_path)
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    app.run(host="0.0.0.0", port=port, debug=True)


