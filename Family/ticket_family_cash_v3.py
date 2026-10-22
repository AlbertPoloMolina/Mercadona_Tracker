
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import csv
import re
import shutil

import cv2
import numpy as np
import pandas as pd
import pytesseract
from pytesseract import Output

ROOT = Path(__file__).resolve().parent
READ_DIR = ROOT / "Leidas"
CSV_PATH = ROOT / "compras.csv"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".heic", ".heif"}
# Tesseract se vuelve muy lento con fotos de varios megapíxeles. Este límite conserva
# suficiente detalle para el texto de un ticket, sin procesar innecesariamente una foto
# de 12 MP (o más).
OCR_MAX_DIMENSION = 2400
OCR_MIN_DIMENSION = 1800

try:
    from PIL import Image, ImageOps
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIC_SUPPORT = True
except ImportError:
    HEIC_SUPPORT = False

# Posiciones aproximadas del ticket original respecto al ancho completo de la imagen.
# Precio unitario/columna Precio a la izquierda de la descripción; Importe se ignora.
PRICE_X_MIN, PRICE_X_MAX = 0.325, 0.415
DESC_X_MIN, DESC_X_MAX = 0.405, 0.635

DATE_PATTERNS = [
    r"(?<!\d)(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})(?!\d)",
    r"(?<!\d)(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})(?!\d)",
]
PRICE_RE = re.compile(r"(?<!\d)(\d{1,3}[,.]\d{2})(?!\d)")
HEADER_WORDS = {
    "CANT", "CANT.", "PRECIO", "DESCRIPCION", "DESCRIPCIÓN", "ARTICULO",
    "ARTÍCULO", "IMPORTE", "OPER.", "HORA", "FECHA", "TOTAL", "BASE",
    "CAMBIO", "ENTREGADO", "I.V.A.", "IVA", "FRASIMPLIFICADA",
}
NON_PRODUCT_PREFIXES = (
    "TOTAL", "BASE", "CAMBIO", "ENTREGADO", "OPER.", "HORA", "FECHA",
    "CANT", "PRECIO", "DESCRIPCION", "DESCRIPCIÓN", "IMPORTE", "I.V.A",
    "IVA", "F. PAGO", "TARJETA", "EFECTIVO",
)


def normalise_price_token(text):
    """Normaliza el separador decimal que OCR suele confundir con una barra."""
    text = text.strip().replace("€", "")
    text = re.sub(r"(?<=\d)/(?=\d{2}$)", ",", text)
    # En la columna Precio, por ejemplo, 094 suele ser el 0,94 del ticket.
    # Se limita a importes que empiezan por cero para no inventar 3,15 a partir
    # de una lectura ambigua como "315".
    if re.fullmatch(r"0\d{2}", text):
        text = f"{text[0]},{text[1:]}"
    return text


def load_image(path: Path):
    image = cv2.imread(str(path))
    if image is None and path.suffix.lower() in {".heic", ".heif"}:
        if not HEIC_SUPPORT:
            raise ValueError("Para abrir HEIC/HEIF instala pillow-heif: python3 -m pip install pillow-heif")
        with Image.open(path) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            image = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
    if image is None:
        raise ValueError(f"No se puede abrir la imagen {path.name}")
    return image


def image_variants(image):
    """Dos variantes compactas y contrastadas para un OCR rápido y fiable."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    largest_dimension = max(gray.shape)
    if largest_dimension > OCR_MAX_DIMENSION:
        scale = OCR_MAX_DIMENSION / largest_dimension
    elif largest_dimension < OCR_MIN_DIMENSION:
        scale = OCR_MIN_DIMENSION / largest_dimension
    else:
        scale = 1
    if scale != 1:
        interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=interpolation)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    otsu = cv2.threshold(clahe, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    return [clahe, otsu]


def parse_date(text):
    candidates = []
    for pattern in DATE_PATTERNS:
        for match in re.finditer(pattern, text.replace("\u00a0", " ")):
            day, month, year = map(int, match.groups())
            if year < 100:
                year += 2000
            try:
                date = datetime(year, month, day)
            except ValueError:
                continue
            # Dar prioridad a una fecha con separadores y situada junto a FECHA/Oper./hora.
            before = text[max(0, match.start() - 80):match.start()].upper()
            score = 2 if any(s in before for s in ("FECHA", "OPER.", "HORA", "VENTA", "TICKET")) else 0
            if any(s in match.group(0) for s in ("/", ".", "-")):
                score += 1
            candidates.append((score, match.start(), date))
    if not candidates:
        return None
    candidates.sort(key=lambda x: (-x[0], x[1]))
    return candidates[0][2].strftime("%d/%m/%Y")


def run_ocr(image):
    """Prueba dos preparaciones compactas en el modo idóneo para tickets."""
    best_text, best_data, best_score, best_image = "", None, -1, None
    errors = []
    for variant in image_variants(image):
        # El modo 11 conserva las columnas del ticket. El modo 6 unía las filas y,
        # pese a devolver más palabras, impedía detectar correctamente la fecha.
        for psm in (11,):
            try:
                config = f"--oem 3 --psm {psm}"
                data = pytesseract.image_to_data(
                    variant, lang="spa", config=config, output_type=Output.DICT
                )
                # image_to_string repetiría el mismo OCR. Los tokens ya devueltos por
                # image_to_data bastan para localizar la fecha y extraer los productos.
                text = " ".join(word for word in data["text"] if word.strip())
                valid_words = sum(1 for w in data["text"] if w.strip())
                width = variant.shape[1]
                price_candidates = sum(
                    1 for i, word in enumerate(data["text"])
                    if PRICE_X_MIN * width <= int(data["left"][i]) + int(data["width"][i]) / 2 <= PRICE_X_MAX * width
                    and PRICE_RE.fullmatch(normalise_price_token(word))
                )
                # Una fecha válida y más precios en su columna son señales mucho más
                # fiables que la simple cantidad de palabras reconocidas.
                score = valid_words + price_candidates * 100 + (10_000 if parse_date(text) else 0)
                if score > best_score:
                    best_score, best_text, best_data, best_image = score, text, data, variant
            except pytesseract.TesseractError as exc:
                errors.append(str(exc))
    if best_data is None:
        raise ValueError("Tesseract no ha podido leer la imagen. " + " ".join(errors[:1]))
    return best_text, best_data, best_image


def words_from_data(data, width, height):
    words = []
    for i, raw in enumerate(data["text"]):
        text = raw.strip()
        if not text:
            continue
        try:
            conf = float(data["conf"][i])
        except (TypeError, ValueError):
            conf = -1
        if conf >= 0 and conf < 12:
            continue
        x, y = int(data["left"][i]), int(data["top"][i])
        w, h = int(data["width"][i]), int(data["height"][i])
        words.append({
            "text": text, "x": x, "y": y, "w": w, "h": h,
            "cx": x + w / 2, "cy": y + h / 2, "conf": conf,
        })
    return words


def cluster_words_by_line(words):
    """Agrupa palabras por altura geométrica, no por los números de línea de Tesseract."""
    ordered = sorted(words, key=lambda w: (w["cy"], w["x"]))
    lines = []
    for word in ordered:
        best_line = None
        best_distance = float("inf")
        for line in lines[-4:]:
            line_cy = sum(w["cy"] for w in line) / len(line)
            typical_h = max(8, sum(w["h"] for w in line) / len(line))
            distance = abs(word["cy"] - line_cy)
            if distance <= max(typical_h * 0.65, 8) and distance < best_distance:
                best_line, best_distance = line, distance
        if best_line is None:
            lines.append([word])
        else:
            best_line.append(word)
    for line in lines:
        line.sort(key=lambda w: w["x"])
    lines.sort(key=lambda line: sum(w["cy"] for w in line) / len(line))
    return lines


def clean_description(text):
    text = re.sub(r"\s+", " ", text).strip(" .,:;|-")
    # Corrige separaciones típicas de OCR sin inventar contenido.
    text = re.sub(r"\s+", " ", text)
    return text


def is_plausible_description(text):
    text = clean_description(text)
    upper = text.upper()
    if len(text) < 3 or not re.search(r"[A-ZÁÉÍÓÚÜÑ]", upper):
        return False
    if any(upper.startswith(prefix) for prefix in NON_PRODUCT_PREFIXES):
        return False
    if upper in HEADER_WORDS:
        return False
    return True


def extract_products(data, img_width, img_height):
    """
    Busca precios en la columna Precio y recoge las palabras de descripción de la
    misma línea y de las líneas de continuación hasta el siguiente precio.
    """
    words = words_from_data(data, img_width, img_height)
    lines = cluster_words_by_line(words)
    price_x_min = PRICE_X_MIN * img_width
    price_x_max = PRICE_X_MAX * img_width
    desc_x_min = DESC_X_MIN * img_width
    desc_x_max = DESC_X_MAX * img_width

    # Una línea con un precio en la columna Precio marca el comienzo de un producto.
    anchors = []
    for idx, line in enumerate(lines):
        text_line = " ".join(w["text"] for w in line).upper()
        if any(h in text_line for h in ("DESCRIPCION", "DESCRIPCIÓN", "PRECIO", "IMPORTE", "TOTAL", "CAMBIO")):
            continue
        candidates = [
            w for w in line
            if price_x_min <= w["cx"] <= price_x_max
            and PRICE_RE.fullmatch(normalise_price_token(w["text"]))
        ]
        if candidates:
            candidates.sort(key=lambda w: w["x"])
            price_text = normalise_price_token(candidates[0]["text"])
            anchors.append((idx, candidates[0], float(price_text.replace(",", "."))))

    products = []
    for anchor_pos, (line_idx, price_word, price) in enumerate(anchors):
        next_idx = anchors[anchor_pos + 1][0] if anchor_pos + 1 < len(anchors) else len(lines)
        desc_tokens = []
        # En la fila del precio y las líneas de continuación, extraer solo la columna descripción.
        for li in range(line_idx, next_idx):
            line = lines[li]
            cy = sum(w["cy"] for w in line) / len(line)
            # Evitar tragarse textos alejados de la fila: máximo unas 3 alturas de línea por ancla,
            # salvo continuaciones situadas antes del siguiente precio.
            for word in line:
                if desc_x_min <= word["cx"] <= desc_x_max:
                    if word["text"].upper().strip() not in HEADER_WORDS:
                        desc_tokens.append((word["x"], cy, word["text"]))
            # Si aparece una línea de sección o pago, termina la búsqueda de continuación.
            line_text = " ".join(w["text"] for w in line).upper()
            if li > line_idx and any(line_text.startswith(prefix) for prefix in (
                "TOTAL", "BASE", "CAMBIO", "ENTREGADO", "F. PAGO", "TARJETA", "EFECTIVO"
            )):
                break

        # Orden vertical y horizontal para conservar las descripciones que ocupan 2 líneas.
        desc_tokens.sort(key=lambda t: (t[1], t[0]))
        name = clean_description(" ".join(token[2] for token in desc_tokens))
        # Si el recorte geométrico no ha recogido nada, usa las palabras de descripción
        # de la propia línea, sin incorporar las columnas de cantidad o importe.
        if not is_plausible_description(name):
            line = lines[line_idx]
            fallback = [
                w for w in line
                if desc_x_min <= w["cx"] <= desc_x_max
                and PRICE_RE.fullmatch(normalise_price_token(w["text"])) is None
            ]
            name = clean_description(" ".join(w["text"] for w in sorted(fallback, key=lambda w: w["x"])))
        if is_plausible_description(name):
            # Quitar repeticiones consecutivas de tokens que pueden producirse al agrupar líneas.
            tokens = name.split()
            deduped = []
            for token in tokens:
                if not deduped or token.lower() != deduped[-1].lower():
                    deduped.append(token)
            name = " ".join(deduped)
            products.append((name, price))

    # Evitar entradas claramente duplicadas si varias variantes OCR han unido mal una fila.
    final = []
    seen = set()
    for name, price in products:
        key = (re.sub(r"\W+", "", name.lower()), round(price, 2))
        if key not in seen:
            final.append((name, price))
            seen.add(key)
    return final


def extract_products_from_table(image):
    """Lee conjuntamente Precio y Descripción, sin el fondo de la fotografía.

    Los tickets Family Cash mantienen ambas columnas en la zona central. Al recortar
    antes del OCR se evitan las palabras del suelo y de las columnas Cant./Importe,
    que hacían que Tesseract mezclara filas no relacionadas.
    """
    height, width = image.shape[:2]
    table = image[
        int(height * 0.12):int(height * 0.88),
        int(width * 0.36):int(width * 0.61),
    ]
    gray = cv2.cvtColor(table, cv2.COLOR_BGR2GRAY)
    enhanced = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    text = pytesseract.image_to_string(enhanced, lang="spa", config="--oem 3 --psm 6")

    products = []
    pending = []
    current_name = []
    current_price = None

    def finish_current():
        nonlocal current_name, current_price
        if current_price is None:
            return
        name = clean_description(" ".join(current_name).replace("|", " "))
        if is_plausible_description(name):
            products.append((name, current_price))
        current_name, current_price = [], None

    for raw_line in text.splitlines():
        line = clean_description(raw_line)
        if not line:
            continue
        # El precio unitario queda al inicio de cada nueva fila de la tabla.
        match = PRICE_RE.search(normalise_price_token(line))
        if match:
            finish_current()
            price = float(match.group(1).replace(",", "."))
            before = line[:match.start()].strip(" |")
            after = line[match.end():].strip(" |")
            # Si OCR leyó antes el texto de la fila que su precio, se conserva.
            current_name = pending + ([before] if before else []) + ([after] if after else [])
            pending = []
            current_price = price
        elif current_price is None:
            # Evitar usar los encabezados como nombre del primer producto.
            if not any(word in line.upper() for word in ("PRECIO", "DESCRIP", "ARTICULO")):
                pending.append(line)
        else:
            current_name.append(line)
    finish_current()

    # Conservar una sola entrada por artículo y precio, igual que la extracción general.
    final, seen = [], set()
    for name, price in products:
        key = (re.sub(r"\W+", "", name.lower()), round(price, 2))
        if key not in seen:
            final.append((name, price))
            seen.add(key)
    return final


def unique_destination(path):
    if not path.exists():
        return path
    counter = 1
    while True:
        candidate = path.with_name(f"{path.stem}_{counter}{path.suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def append_to_csv(row):
    """
    Lee CSV anteriores tanto con coma como con punto y coma; escribe siempre con
    punto y coma y decimal con coma para que Excel en configuración española lo abra bien.
    """
    if CSV_PATH.exists():
        try:
            df = pd.read_csv(CSV_PATH, sep=None, engine="python", dtype={"Fecha": str}, encoding="utf-8-sig")
        except Exception:
            df = pd.read_csv(CSV_PATH, dtype={"Fecha": str}, encoding="utf-8-sig")
    else:
        df = pd.DataFrame(columns=["Fecha"])

    if "Fecha" not in df.columns:
        df.insert(0, "Fecha", "")
    for col in row:
        if col not in df.columns:
            df[col] = pd.NA

    columns = ["Fecha"] + [c for c in df.columns if c != "Fecha"]
    new_row = {col: row.get(col, pd.NA) for col in columns}
    df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
    # Las columnas nuevas se crean con valores vacíos y Pandas puede dejarlas como
    # tipo texto; forzarlas a número permite que decimal="," se aplique de verdad.
    price_columns = [col for col in columns if col != "Fecha"]
    df[price_columns] = df[price_columns].apply(pd.to_numeric, errors="coerce")
    df.to_csv(CSV_PATH, index=False, encoding="utf-8-sig", sep=";", decimal=",", quoting=csv.QUOTE_MINIMAL)


def process_image(path):
    original = load_image(path)
    full_text, data, best_image = run_ocr(original)
    date = parse_date(full_text)
    if not date:
        diagnostic = ROOT / f"{path.stem}_ocr.txt"
        diagnostic.write_text(full_text or "[No se ha reconocido texto]", encoding="utf-8")
        raise ValueError(f"No se ha podido reconocer la fecha. Texto OCR guardado en {diagnostic.name}")

    height, width = best_image.shape[:2]
    products = extract_products(data, width, height)
    if not products:
        diagnostic = ROOT / f"{path.stem}_ocr.txt"
        diagnostic.write_text(full_text or "[No se ha reconocido texto]", encoding="utf-8")
        raise ValueError(f"No se han reconocido productos. Texto OCR guardado en {diagnostic.name}")

    row = {"Fecha": date}
    for name, price in products:
        # Si el nombre se repite, no sumar precios unitarios: mantener el primero.
        if name not in row:
            row[name] = price

    return row, len(products)


def main():
    READ_DIR.mkdir(exist_ok=True)
    images = sorted(
        p for p in ROOT.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
        and not p.stem.endswith("_ocr")
    )
    if not images:
        print("No hay imágenes de tickets en la carpeta del script.")
        return

    for image_path in images:
        try:
            print(f"Leyendo: {image_path.name}...", flush=True)
            row, count = process_image(image_path)
            append_to_csv(row)
            destination = unique_destination(READ_DIR / image_path.name)
            shutil.move(str(image_path), str(destination))
            print(f"OK: {image_path.name} -> Leidas/{destination.name} | fecha {row['Fecha']} | {count} productos")
            for name, price in row.items():
                if name != "Fecha":
                    print(f"  {name}: {price:.2f}".replace(".", ","))
        except Exception as exc:
            print(f"ERROR: {image_path.name}: {exc}")
            print("La imagen se conserva en la carpeta raíz para poder revisarla.")


if __name__ == "__main__":
    main()
