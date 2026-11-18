"""
Anuvadini Detector - "Website Blocked" popup window (with the Anuvadini logo).

Runs as its own tiny process (`python -m anuvadini_detector.popup_ui <site> <category>`) so it never blocks the
detection engine and a crash here can never take the engine/agent down. Auto-closes after a few seconds.
"""
import ctypes
import os
import sys
from pathlib import Path

LOGO_PATH = Path(__file__).resolve().parent / "assets" / "logo.png"

ACCENT = "#DC2626"
TEXT = "#0F172A"
MUTED = "#64748B"
BG = "#FFFFFF"
FOOTER_BG = "#F1F5F9"


def _make_dpi_aware():
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


def show(site: str, category: str = "", seconds: int = 8) -> None:
    import tkinter as tk

    if sys.platform == "win32":
        _make_dpi_aware()

    root = tk.Tk()
    root.title("ANUVADINI FOUNDATION - WEBSITE BLOCKED")
    root.configure(bg=BG)
    root.resizable(False, False)
    root.minsize(500, 0)
    root.attributes("-topmost", True)

    logo = None
    try:
        logo = tk.PhotoImage(file=str(LOGO_PATH))
        root.iconphoto(True, logo)
    except Exception:
        logo = None

    tk.Frame(root, bg=ACCENT, height=6).pack(fill="x")

    body = tk.Frame(root, bg=BG)
    body.pack(fill="both", expand=True, padx=22, pady=(18, 10))

    if logo is not None:
        tk.Label(body, image=logo, bg=BG).pack(side="left", anchor="n", padx=(0, 18))

    text = tk.Frame(body, bg=BG)
    text.pack(side="left", fill="both", expand=True)

    tk.Label(text, text="Website Blocked", font=("Segoe UI", 15, "bold"), fg=ACCENT, bg=BG, anchor="w").pack(fill="x")
    tk.Label(text, text="This website is not allowed.", font=("Segoe UI", 10), fg=TEXT, bg=BG, anchor="w").pack(fill="x", pady=(2, 8))

    def row(label, value):
        line = tk.Frame(text, bg=BG)
        line.pack(fill="x", pady=1)
        tk.Label(line, text=f"{label}:", font=("Segoe UI", 10, "bold"), fg=TEXT, bg=BG, width=9, anchor="w").pack(side="left")
        tk.Label(line, text=value, font=("Segoe UI", 10), fg=TEXT, bg=BG, anchor="w", wraplength=300, justify="left").pack(side="left")

    row("Website", site or "-")
    if category:
        row("Category", category)

    tk.Label(
        text,
        text="Anuvadini Foundation has blocked this website.\nThe page has been closed.",
        font=("Segoe UI", 10), fg=MUTED, bg=BG, anchor="w", justify="left",
    ).pack(fill="x", pady=(10, 0))

    footer = tk.Frame(root, bg=FOOTER_BG)
    footer.pack(fill="x")
    countdown = tk.Label(footer, text="", font=("Segoe UI", 9), fg=MUTED, bg=FOOTER_BG)
    countdown.pack(side="left", padx=18, pady=10)
    tk.Button(
        footer, text="OK", command=root.destroy, font=("Segoe UI", 10, "bold"), fg="white", bg=ACCENT,
        activebackground="#B91C1C", activeforeground="white", relief="flat", padx=26, pady=4, cursor="hand2",
    ).pack(side="right", padx=18, pady=8)

    remaining = {"s": max(1, int(seconds))}

    def tick():
        countdown.config(text=f"Closing in {remaining['s']}s")
        if remaining["s"] <= 0:
            root.destroy()
            return
        remaining["s"] -= 1
        root.after(1000, tick)

    # centre on screen
    root.update_idletasks()
    w, h = root.winfo_reqwidth(), root.winfo_reqheight()
    x = (root.winfo_screenwidth() - w) // 2
    y = (root.winfo_screenheight() - h) // 3
    root.geometry(f"+{x}+{y}")
    root.lift()
    root.focus_force()

    tick()
    root.mainloop()


if __name__ == "__main__":
    args = sys.argv[1:]
    show(args[0] if args else "", args[1] if len(args) > 1 else "")
