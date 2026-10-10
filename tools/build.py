"""Build step for the Just Living site.

- Generates one static page per product (product-<id>.html) from products.json,
  so product links work anywhere (no query strings, no client routing).
- Generates artifact.html, the version of index.html published to claude.ai.

Run from the project root:  docpython tools/build.py
"""
import json, re, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
products = json.loads((ROOT / "products.json").read_text())
index = (ROOT / "index.html").read_text()

HEAD = re.search(r"<head>(.*?)</head>", index, re.S).group(1)
NAV = re.search(r"(<nav class=\"nav\">.*?</nav>)", index, re.S).group(1)
FOOTER = re.search(r"(<footer>.*?</footer>)", index, re.S).group(1)

CHARTS = {
    "tee": ("Tees (inches, laid flat)", ["Size", "Chest", "Length", "Shoulder"],
            [["S", "22", "27.5", "22"], ["M", "23", "28.5", "23"], ["L", "24", "29.5", "24"], ["XL", "25", "30.5", "25"], ["XXL", "26", "31.5", "26"]],
            "Boxy fit. Size down for a regular fit. Sample measurements, replace with the factory spec sheet."),
    "shoe": ("Sneakers (US men's)", ["US", "EU", "UK", "CM"],
             [["7", "40", "6", "25"], ["8", "41", "7", "26"], ["9", "42", "8", "27"], ["10", "43", "9", "28"], ["11", "44", "10", "29"], ["12", "45", "11", "30"], ["13", "46", "12", "31"]],
             "True to size. Half sizes go up."),
    "hat": ("Hats", ["Size", "Fits"], [["One size", "Adjustable snapback, 22 to 24 in"]], ""),
}

def chart_html(key):
    title, head, rows, note = CHARTS[key]
    th = "".join(f"<th>{html.escape(h)}</th>" for h in head)
    tr = "".join("<tr>" + "".join(f"<td>{html.escape(c)}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class="tablewrap"><table class="chart"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>' + (f'<p class="dim" style="font-size:13px">{html.escape(note)}</p>' if note else "")

def money(n):
    return f"${n:,.2f}" if n % 1 else f"${n:,.0f}"

def product_page(p):
    e = html.escape
    imgs = "".join(f'<img src="assets/products/{e(f)}" alt="{e(p["name"])}">' for f in p["images"])
    sizes = "".join(f'<button type="button" data-size="{e(s)}"{" class=on" if i == 0 else ""}>{e(s)}</button>' for i, s in enumerate(p["sizes"]))
    details = "".join(f"<li>{e(d)}</li>" for d in p["details"])
    if p.get("soldOut"):
        price = f'<div class="price gone">{money(p["price"])}<span class="flag">Sold out</span></div>'
        cta = f'<button class="btn solid wide" data-notify="{e(p["id"])}">Notify me when it\'s back</button><a class="btn wide" href="index.html#shop">Back to shop</a>'
    else:
        price = f'<div class="price">{money(p["price"])}</div>'
        cta = f'<button class="btn solid wide" id="add" data-add="{e(p["id"])}" data-size="{e(p["sizes"][0])}">Add to cart</button>'
        if p.get("paymentLink"):
            cta += f'<a class="btn wide" href="{e(p["paymentLink"])}" target="_blank" rel="noopener">Buy now with Stripe</a>'
    head = HEAD.replace("<title>Just Living — NYC</title>", f"<title>{e(p['name'])} — Just Living</title>")
    head = re.sub(r'<meta property="og:image"[^>]*>', f'<meta property="og:image" content="assets/products/{e(p["images"][0])}">', head)
    head = re.sub(r'<meta name="description"[^>]*>', f'<meta name="description" content="{e(p["description"])}">', head)
    head = re.sub(r'<meta property="og:title"[^>]*>', f'<meta property="og:title" content="{e(p["name"])} — Just Living">', head)
    head = re.sub(r"<script type=\"importmap\">.*?</script>\s*", "", head, flags=re.S)
    return f"""<!doctype html>
<html lang="en">
<head>{head}</head>
<body class="grain">
{NAV}
<main class="pdp">
  <div class="wrap">
    <p class="crumbs pixel"><a href="index.html">Home</a> / <a href="index.html#shop">Shop</a> / {e(p['name'])}</p>
    <div class="grid">
      <div class="gallery">{imgs}</div>
      <div class="sticky">
        <h1>{e(p['name'])}</h1>
        <p class="sub">{e(p['color'])}</p>
        {price}
        <p class="desc">{e(p['description'])}</p>
        <p class="pixel" style="margin-bottom:10px">Size</p>
        <div class="sizes" id="sizes">{sizes}</div>
        <div class="cta">{cta}</div>
        <details open><summary>Details</summary><ul>{details}</ul></details>
        <details><summary>Size guide</summary>{chart_html(p['sizeChart'])}</details>
        <details><summary>Shipping &amp; returns</summary><ul><li>Ships from New York in 2 to 4 business days.</li><li>US shipping $8, free over $150. International at checkout.</li><li>Unworn items can be exchanged within 14 days. See <a href="info.html#returns" style="text-decoration:underline">returns</a>.</li></ul></details>
      </div>
    </div>
  </div>
</main>
{FOOTER}
<script type="module">
import {{ initStore }} from './js/store.js';
await initStore();
const sizes = document.getElementById('sizes'), add = document.getElementById('add');
sizes.addEventListener('click', e => {{
  const b = e.target.closest('button'); if (!b) return;
  sizes.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  if (add) add.dataset.size = b.dataset.size;
}});
</script>
</body>
</html>
"""

for p in products:
    (ROOT / f"product-{p['id']}.html").write_text(product_page(p))
print("product pages:", len(products))

# ---- artifact build (claude.ai wraps the page in its own skeleton) ----
head = re.sub(r"<meta[^>]*>\s*", "", HEAD).replace('<link rel="icon" href="assets/logo/jl-mark-white.png">', "")
body = re.search(r"<body class=\"grain\">(.*?)</body>", index, re.S).group(1)
art = head.strip() + "\n<div class=\"grain\" id=\"page\">" + body + "</div>\n"
art = art.replace('<link rel="stylesheet" href="css/site.css">', "<style>" + (ROOT / "css/site.css").read_text().replace(".grain::after{", "#page::after{").replace("url(../assets/", "url(assets/") + "</style>")
art = art.replace('href="index.html#', 'href="#').replace('href="index.html"', 'href="#top"')
(ROOT / "artifact.html").write_text(art)
print("artifact.html:", len(art), "bytes")
