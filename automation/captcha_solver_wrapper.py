"""
Multi-step captcha solver for BeeSERP Student Self-Service.

Captcha profile (observed):
- 6 chars, charset A-Z0-9 (uppercase)
- Black bold rotated glyphs on white
- Thin light-gray strike-through noise lines
- Size ~160x45px (element screenshot)

Strategy — predict-correct via multiple steps:
  Step 1: load + upscale (2.0x, 2.5x) so thin lines separate from glyphs
  Step 2: generate N preprocessing variants, each tuned to suppress
          the gray strike lines while keeping black glyphs:
            v0 raw
            v1 upscale-2x
            v2 gray + OTSU
            v3 dark-pixel keep (thr 120) + median + dilate
            v4 bilateral + adaptive-threshold
            v5 upscale-2.5x + thr 140 + morph-open (removes 1px lines)
            v6 gray + median5 + OTSU (aggressive denoise)
  Step 3: ddddocr classification on each variant (with probability=True)
  Step 4: normalize (upper, keep A-Z0-9) + score + majority vote.
          Prefer length==6, high probability, high frequency.

Stdout contract (for automation.js): prints ONLY the final code.
All diagnostics go to stderr.
"""
import sys
import os
import re
import warnings
from collections import Counter

warnings.filterwarnings("ignore")
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None
    np = None

try:
    import ddddocr
except ImportError:
    print("ERROR", flush=True)
    print("ddddocr not installed", file=sys.stderr)
    sys.exit(1)

CHARSET_RE = re.compile(r"[^A-Z0-9]")


def eprint(*a, **k):
    print(*a, file=sys.stderr, flush=True, **k)


def normalize(text: str) -> str:
    if not text:
        return ""
    t = str(text).upper().strip()
    # common OCR confusions are NOT auto-fixed: server is exact-match.
    # Only strip out-of-charset junk.
    t = CHARSET_RE.sub("", t)
    return t


def score_candidate(text: str, prob: float) -> float:
    """Heuristic score: length==6 strongly preferred, then prob."""
    s = 0.0
    L = len(text)
    if L == 6:
        s += 10.0
    elif L == 5:
        s += 3.0
    elif L in (4, 7):
        s += 1.0
    else:
        s -= 2.0
    # charset bonus: all alnum already by normalize
    if L and all(c.isalnum() for c in text):
        s += 1.0
    try:
        s += float(prob or 0) * 2.0  # prob in [0,1]
    except Exception:
        pass
    return s


def build_variants(img_bgr):
    """Return list of (name, png_bytes)."""
    variants = []
    if img_bgr is None:
        return variants

    def enc(img, name):
        ok, buf = cv2.imencode(".png", img)
        if ok:
            variants.append((name, bytes(buf)))

    h, w = img_bgr.shape[:2]

    # v0 raw
    enc(img_bgr, "v0_raw")

    # v1 upscale 2x
    up2 = cv2.resize(img_bgr, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
    enc(up2, "v1_up2x")

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    gray_up2 = cv2.resize(gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)

    # v2 gray + OTSU (on upscaled)
    _, otsu = cv2.threshold(gray_up2, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    enc(otsu, "v2_otsu_up2x")

    # v3 dark-pixel keep: text is near-black (<120), noise lines are gray (>140).
    # Keep only dark pixels -> white bg, then median denoise + slight dilate.
    _, dark = cv2.threshold(gray_up2, 120, 255, cv2.THRESH_BINARY)
    dark = cv2.medianBlur(dark, 3)
    kernel = np.ones((2, 2), np.uint8)
    dark = cv2.dilate(dark, kernel, iterations=1)
    enc(dark, "v3_dark120_median_dilate")

    # v4 bilateral (edge-preserving smooth) + adaptive threshold
    bil = cv2.bilateralFilter(gray_up2, 9, 75, 75)
    adap = cv2.adaptiveThreshold(
        bil, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 2,
    )
    enc(adap, "v4_bilateral_adaptive")

    # v5 upscale 2.5x + thr 140 + morph-open to erase 1px strike lines
    up25 = cv2.resize(img_bgr, (int(w * 2.5), int(h * 2.5)),
                      interpolation=cv2.INTER_CUBIC)
    g25 = cv2.cvtColor(up25, cv2.COLOR_BGR2GRAY)
    _, t140 = cv2.threshold(g25, 140, 255, cv2.THRESH_BINARY)
    k3 = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    opened = cv2.morphologyEx(t140, cv2.MORPH_OPEN, k3)
    enc(opened, "v5_up25_thr140_open")

    # v6 aggressive denoise: median5 + OTSU
    med5 = cv2.medianBlur(gray_up2, 5)
    _, otsu5 = cv2.threshold(med5, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    enc(otsu5, "v6_median5_otsu")

    return variants


_OCR = None


def get_ocr():
    global _OCR
    if _OCR is None:
        _OCR = ddddocr.DdddOcr(show_ad=False)
    return _OCR


def classify_bytes(ocr, img_bytes):
    """Return (text, prob). Never raises."""
    try:
        out = ocr.classification(img_bytes, probability=True)
        if isinstance(out, dict):
            # ddddocr>=1.5 returns {'text':..., 'probabilities': [[...], ...]}
            # older docs mention {'prediction':..., 'probability': [...]}
            pred = (out.get("text") or out.get("prediction") or "")
            raw_prob = out.get("probabilities", out.get("probability", []))
            try:
                import numpy as _np
                arr = _np.array(raw_prob, dtype=float)
                # probabilities shape: [1, seq_len, num_classes] or [seq_len]
                # take max per position then mean
                if arr.size == 0:
                    prob = 0.0
                elif arr.ndim == 3:
                    prob = float(arr.max(axis=2).mean())
                elif arr.ndim == 2:
                    prob = float(arr.max(axis=1).mean())
                else:
                    prob = float(arr.mean())
            except Exception:
                prob = 0.0
            return str(pred), prob
        return str(out), 0.0
    except Exception:
        try:
            return str(ocr.classification(img_bytes)), 0.0
        except Exception:
            return "", 0.0


def solve_multistep(image_path, debug=False):
    ocr = get_ocr()

    if cv2 is None:
        # Fallback: single-pass
        with open(image_path, "rb") as f:
            raw = f.read()
        txt, _ = classify_bytes(ocr, raw)
        return normalize(txt), [(normalize(txt), 0.0, "v0_raw_fallback")]

    img = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if img is None:
        # maybe playwright captured with alpha; try unchanged
        with open(image_path, "rb") as f:
            raw = f.read()
        txt, _ = classify_bytes(ocr, raw)
        return normalize(txt), [(normalize(txt), 0.0, "raw_fallback")]

    variants = build_variants(img)
    if not variants:
        return "", []

    results = []  # (norm, prob, variant_name, raw_pred)
    for name, b in variants:
        pred, prob = classify_bytes(ocr, b)
        norm = normalize(pred)
        results.append((norm, prob, name, pred))
        if debug:
            eprint(f"[{name}] raw={pred!r} norm={norm!r} prob={prob:.3f}")

    # --- voting (weighted: length-6 bonus outweighs raw majority) ---
    # Count frequency of each non-empty normalized prediction
    freq = Counter(r[0] for r in results if r[0])
    if not freq:
        return "", results

    # Best per unique text: keep max prob seen for it
    best_prob = {}
    for norm, prob, _, _ in results:
        if norm:
            best_prob[norm] = max(best_prob.get(norm, 0.0), prob)

    def final_score(text):
        count = freq[text]
        # length bonus: +10 for the expected 6-char captcha so that
        # 2 votes for a full 6-char beat 5 votes for a truncated 5-char
        L = len(text)
        if L == 6:
            lb = 10.0
        elif L == 5:
            lb = 3.0
        elif L in (4, 7):
            lb = 1.0
        else:
            lb = -2.0
        return count * 2.0 + lb + float(best_prob.get(text, 0.0)) * 2.0

    ranked = sorted(freq.keys(), key=final_score, reverse=True)
    winner = ranked[0]

    if debug:
        eprint(f"freq={dict(freq)} probs={{"
               + ", ".join(f"{k}:{best_prob.get(k,0):.3f}" for k in ranked)
               + f"}} winner={winner!r}")
    return winner, results


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Multi-step captcha solver")
    ap.add_argument("image", help="captcha image path")
    ap.add_argument("--debug", action="store_true", help="print per-variant diagnostics to stderr")
    ap.add_argument("--benchmark", action="store_true",
                    help="print winner plus all candidates (for manual verification)")
    args = ap.parse_args()

    if not os.path.exists(args.image):
        eprint(f"File not found: {args.image}")
        print("ERROR")
        sys.exit(1)

    winner, results = solve_multistep(args.image, debug=args.debug or args.benchmark)
    if winner:
        print(winner)  # stdout: ONLY the code (automation.js parses this)
        if args.benchmark:
            eprint("candidates:")
            for norm, prob, name, raw in results:
                eprint(f"  {name}: raw={raw!r} norm={norm!r} prob={prob:.3f}")
    else:
        print("ERROR")
        sys.exit(1)


if __name__ == "__main__":
    main()
