"""
Anuvadini Detector - NVIDIA NIM AI Vision Audit
Uses NVIDIA NIM (Llama-3.2-11B-Vision-Instruct or Nemotron) to classify screenshot
forensics into WORK, GAMING, STREAMING, SOCIAL, or ANTI_AFK.
Includes local heuristic fallback and API key validation.
"""

import base64
import json
import os
import urllib.request
import urllib.error
from typing import Dict, Any, Optional

NIM_MODELS = [
    {"id": "meta/llama-3.2-11b-vision-instruct", "name": "Llama 3.2 11B Vision (Recommended)"},
    {"id": "meta/llama-3.2-90b-vision-instruct", "name": "Llama 3.2 90B Vision (High Precision)"},
    {"id": "nvidia/neva-22b", "name": "NVIDIA NeVA 22B"},
    {"id": "microsoft/phi-3.5-vision-instruct", "name": "Phi-3.5 Vision"},
    {"id": "google/deplot", "name": "DePlot Visual Table Engine"}
]

DEFAULT_NIM_MODEL = "meta/llama-3.2-11b-vision-instruct"
DEFAULT_NIM_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions"

class NvidiaNimVisionAuditor:
    def __init__(self, api_key: Optional[str] = None, model: str = DEFAULT_NIM_MODEL):
        self.api_key = api_key or os.getenv("NVIDIA_API_KEY", "")
        self.model = model

    def set_config(self, api_key: str, model: Optional[str] = None):
        self.api_key = api_key
        if model:
            self.model = model

    def test_connection(self) -> Dict[str, Any]:
        """Tests the NVIDIA NIM API key with a minimal text prompt."""
        if not self.api_key:
            return {"success": False, "error": "No NVIDIA NIM API key configured"}

        payload = {
            "model": self.model,
            "messages": [
                {"role": "user", "content": "Respond with 'NIM_OK' if you can read this."}
            ],
            "max_tokens": 10
        }

        try:
            req = urllib.request.Request(
                DEFAULT_NIM_ENDPOINT,
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "Anuvadini-Detector/2.0"
                }
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                return {
                    "success": True,
                    "model": self.model,
                    "response": data["choices"][0]["message"]["content"]
                }
        except urllib.error.HTTPError as e:
            return {"success": False, "error": f"HTTP {e.code}: {e.reason}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def classify_screenshot(self, image_b64: str, window_title: str = "") -> Dict[str, Any]:
        """
        Classifies screen content using Llama-3.2 Vision.
        Returns category (WORK, GAMING, STREAMING, SOCIAL, ANTI_AFK), confidence, and justification.
        Falls back to local heuristic rules if API is offline or unconfigured.
        """
        if not self.api_key or not image_b64:
            return self._local_heuristic_fallback(window_title)

        prompt = (
            "You are an enterprise surveillance security auditor analyzing a desktop screen thumbnail. "
            "Examine the image and classify the primary user activity into EXACTLY ONE of the following tags:\n"
            "WORK, GAMING, STREAMING, SOCIAL, ANTI_AFK.\n"
            "Return a strictly valid JSON object in this format:\n"
            "{\"verdict\": \"<CATEGORY>\", \"confidence\": <0.0-1.0>, \"summary\": \"<one-sentence rationale>\"}"
        )

        image_url = f"data:image/jpeg;base64,{image_b64}"
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": image_url}}
                    ]
                }
            ],
            "max_tokens": 120,
            "temperature": 0.1
        }

        try:
            req = urllib.request.Request(
                DEFAULT_NIM_ENDPOINT,
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "Anuvadini-Detector/2.0"
                }
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                raw_text = result["choices"][0]["message"]["content"].strip()

                # Clean markdown blocks if present
                if raw_text.startswith("```"):
                    raw_text = raw_text.split("```")[1]
                    if raw_text.startswith("json"):
                        raw_text = raw_text[4:]
                parsed = json.loads(raw_text.strip())
                return {
                    "source": "nvidia_nim",
                    "model": self.model,
                    "verdict": parsed.get("verdict", "WORK"),
                    "confidence": parsed.get("confidence", 0.95),
                    "summary": parsed.get("summary", "Vision model classified screen content.")
                }
        except Exception as e:
            # Fall back gracefully to local heuristic
            fallback = self._local_heuristic_fallback(window_title)
            fallback["nim_error"] = str(e)
            return fallback

    def _local_heuristic_fallback(self, window_title: str) -> Dict[str, Any]:
        """High-speed local heuristic classifier when NIM API is unavailable."""
        title_lower = window_title.lower()

        # Check gaming
        for kw in ["game", "steam", "valorant", "roblox", "cs2", "poki", "stake", "bet365", "minecraft"]:
            if kw in title_lower:
                return {
                    "source": "local_heuristic",
                    "verdict": "GAMING",
                    "confidence": 0.88,
                    "summary": f"Local heuristic matched gaming signature '{kw}' in window title."
                }

        # Check streaming
        for kw in ["youtube", "twitch", "netflix", "prime video", "disney"]:
            if kw in title_lower:
                return {
                    "source": "local_heuristic",
                    "verdict": "STREAMING",
                    "confidence": 0.85,
                    "summary": f"Local heuristic detected media streaming: '{kw}'."
                }

        # Check social
        for kw in ["facebook", "instagram", "tiktok", "twitter", "reddit"]:
            if kw in title_lower:
                return {
                    "source": "local_heuristic",
                    "verdict": "SOCIAL",
                    "confidence": 0.82,
                    "summary": f"Local heuristic detected social media activity: '{kw}'."
                }

        return {
            "source": "local_heuristic",
            "verdict": "WORK",
            "confidence": 0.90,
            "summary": "Normal enterprise workflow."
        }
