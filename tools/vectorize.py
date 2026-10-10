import sys, cv2, numpy as np, potrace

def trace(binary, out_svg, out_png, scale, w, h, pad=40, split=False):
    """binary: uint8 mask (255 = ink), already upscaled. Writes SVG + transparent PNG."""
    bmp = potrace.Bitmap(binary < 127)
    path = bmp.trace(turdsize=int(8*scale), alphamax=1.0, opticurve=True, opttolerance=0.2)
    parts = []
    for curve in path:
        s = curve.start_point
        d = [f"M{s.x:.2f} {s.y:.2f}"]
        for seg in curve:
            if seg.is_corner:
                d.append(f"L{seg.c.x:.2f} {seg.c.y:.2f} L{seg.end_point.x:.2f} {seg.end_point.y:.2f}")
            else:
                d.append(f"C{seg.c1.x:.2f} {seg.c1.y:.2f} {seg.c2.x:.2f} {seg.c2.y:.2f} {seg.end_point.x:.2f} {seg.end_point.y:.2f}")
        d.append("Z")
        parts.append(" ".join(d))
    if split:
        body = "".join(f'<path id="bone-{i}" fill="#000" d="{p}"/>' for i, p in enumerate(parts))
    else:
        body = f'<path fill="#000" fill-rule="nonzero" d="{" ".join(parts)}"/>'
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{body}</svg>')
    open(out_svg, "w").write(svg)
    # transparent PNG from the cleaned mask (anti-aliased by downscale)
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., 3] = binary
    cv2.imwrite(out_png, rgba)
    print(out_svg, "curves:", len(list(path)), "size:", w, h)

def clean_mask(mask, k=3):
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((k, k), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
    return mask

def crop_to_ink(mask, pad):
    ys, xs = np.where(mask > 0)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    y0 = max(0, y0 - pad); x0 = max(0, x0 - pad)
    y1 = min(mask.shape[0], y1 + pad); x1 = min(mask.shape[1], x1 + pad)
    return mask[y0:y1, x0:x1]


def repair_clipped_tip(ink, circle_eroded, r_round=70):
    """The IG profile-pic circle clips the bottom tip of the V bone. Extend the two
    outer arm edges until they meet and round the corner, so the bone reads whole."""
    yy, _ = np.where(ink > 0); ymax = yy.max()
    cut = ink.copy(); cut[:ymax - 30, :] = 0
    ys, xs = np.where(cut > 0)
    xa, xb = xs.min(), xs.max(); ycut = int(np.median(ys))
    print("clip span x:", xa, xb, "y~", ycut)
    H, W = ink.shape
    def bottom_edge(x0, x1):
        pts = []
        for x in range(max(0,x0), min(W,x1)):
            col = np.where(ink[:, x] > 0)[0]
            col = col[col > ycut - 900]
            if len(col): pts.append((x, col.max()))
        return np.array(pts, np.float32)
    L = bottom_edge(xa - 260, xa - 20); R = bottom_edge(xb + 20, xb + 260)
    (vx1, vy1, x1, y1) = cv2.fitLine(L, cv2.DIST_L2, 0, 0.01, 0.01).ravel()
    (vx2, vy2, x2, y2) = cv2.fitLine(R, cv2.DIST_L2, 0, 0.01, 0.01).ravel()
    # intersection of the two edge lines
    A = np.array([[vx1, -vx2], [vy1, -vy2]], np.float64); b = np.array([x2 - x1, y2 - y1], np.float64)
    t, _ = np.linalg.solve(A, b); P = (x1 + vx1*t, y1 + vy1*t)
    print("tip extends to", int(P[0]), int(P[1]), "(+%d px below the cut)" % int(P[1]-ycut))
    poly = np.array([[xa - 40, int(L[-1][1]) ], [P[0], P[1]], [xb + 40, int(R[0][1])], [xb + 40, ycut - 300], [xa - 40, ycut - 300]], np.int32)
    out = ink.copy(); cv2.fillPoly(out, [poly], 255)
    out = cv2.bitwise_or(out, ink)
    # round the new sharp tip: morphological opening limited to the tip region
    region = np.zeros_like(ink); region[ycut - 400:, max(0, xa - 400):min(W, xb + 400)] = 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*r_round+1, 2*r_round+1))
    opened = cv2.morphologyEx(out, cv2.MORPH_OPEN, k)
    out = np.where(region > 0, opened, out).astype(np.uint8)
    return out

# ---------- JL mark (black bones on white circle on gray gradient) ----------
img = cv2.imread("assets/logo/src-jl-mark.jpg")
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
scale = 4
big = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
big = cv2.GaussianBlur(big, (0, 0), 1.2)
# white circle mask -> largest bright blob, eroded so the circle's soft edge is excluded
_, white = cv2.threshold(big, 200, 255, cv2.THRESH_BINARY)
cnts, _ = cv2.findContours(white, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
circle = np.zeros_like(big); cv2.drawContours(circle, [max(cnts, key=cv2.contourArea)], -1, 255, -1)
circle = cv2.erode(circle, np.ones((9, 9), np.uint8))
_, ink = cv2.threshold(big, 110, 255, cv2.THRESH_BINARY_INV)
ink = cv2.bitwise_and(ink, circle)
ink = clean_mask(ink, 5)
ink = repair_clipped_tip(ink, circle)
ink = cv2.copyMakeBorder(ink, 0, 400, 0, 0, cv2.BORDER_CONSTANT, value=0)
ink = crop_to_ink(ink, 60)
h, w = ink.shape
trace(ink, "assets/logo/jl-mark.svg", "assets/logo/jl-mark-black.png", scale, w, h, split=True)
n, lab, stats, _ = cv2.connectedComponentsWithStats(ink); print("components areas:", sorted(stats[1:, cv2.CC_STAT_AREA].tolist(), reverse=True))
white_png = np.zeros((h, w, 4), np.uint8); white_png[..., :3] = 255; white_png[..., 3] = ink
cv2.imwrite("assets/logo/jl-mark-white.png", white_png)

# ---------- "Just Living EST. 2020" script wordmark (black on white) ----------
img = cv2.imread("assets/logo/src-wordmark.jpg")
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
big = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
big = cv2.GaussianBlur(big, (0, 0), 1.2)
_, ink = cv2.threshold(big, 128, 255, 255 and cv2.THRESH_BINARY_INV)
# drop the thin frame/edge artifacts: keep only components well inside the image
ink[:12, :] = 0; ink[-12:, :] = 0; ink[:, :12] = 0; ink[:, -12:] = 0
ink = clean_mask(ink, 5)
ink = crop_to_ink(ink, 60)
h, w = ink.shape
trace(ink, "assets/logo/wordmark.svg", "assets/logo/wordmark-black.png", scale, w, h)
white_png = np.zeros((h, w, 4), np.uint8); white_png[..., :3] = 255; white_png[..., 3] = ink
cv2.imwrite("assets/logo/wordmark-white.png", white_png)
