#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lee tickets Lidl y guarda el PRECIO POR UNIDAD DE MEDIDA (€/kg, €/ud, €/l...)
en un CSV acumulativo.

Requisitos:
    python3 -m pip install pytesseract opencv-python
    Instalar Tesseract OCR y el idioma español (spa).

Uso:
    1. Guarda este script en una carpeta.
    2. Copia en esa carpeta las imágenes de los tickets.
    3. Ejecuta: python3 leer_tickets_lidl.py

Salida:
    precios_unitarios.csv
    - Una fila por ticket.
    - Una columna por producto y unidad de medida.
    - El valor es el precio por kg/unidad/litro indicado en el ticket.
    - No usa el importe total de la línea.
    - Ignora las líneas promocionales/descuentos y la sección de devoluciones.
    - Mueve la imagen a ./Leidas/ solo cuando se procesa correctamente.

Nota:
    Si un mismo producto aparece varias veces en el ticket, conserva el primer precio
    unitario detectado. Revisa el CSV, porque el OCR puede cometer errores.
"""

from pathlib import Path
from datetime import datetime
import csv
import re
import shutil

import cv2
import pytesseract

# En Windows, si Tesseract no está en PATH, descomenta y adapta:
# pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

ROOT = Path(__file__).resolve().parent
CSV_PATH = ROOT / "precios_unitarios.csv"
READ_DIR = ROOT / "Leidas"
EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}

# Detecta formatos como:
# "1,112 kg x 1,89 EUR/kg", "1 x 2,50 EUR/ud", "0,75 l x 1,20 EUR/l"
UNIT_PRICE_RE = re.compile(
    r"(?P<price>\d{1,4}[,.]\d{2})\s*EUR\s*/\s*"
    r"(?P<unit>kg|g|ud(?:s)?|unidad(?:es)?|l|lt|litro(?:s)?|m)"
    r"\b",
    re.IGNORECASE,
)
DATE_RE = re.compile(r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b")

IGNORE_EXACT_OR_START = (
    "PROMO", "TOTAL", "ENTREGA", "ENTREGADO", "CAMBIO", "RECIBO",
    "LIDL", "SUPERMERCADOS", "AVD.", "AVENIDA", "NIF", "DEVOLUCION",
    "DEVOLUCIÓN", "DEV.", "CAUSA", "OFERTAS", "PUNTOS", "COMPRA",
    "INFORMACION", "INFORMACIÓN", "IVA", "SUMA", "DESC.", "DESCUENTO",
    "FIRMA", "Nº", "N°", "POS", "EUR", "WWW.", "GRACIAS",
)


def preparar_imagen(path: Path):
    image = cv2.imread(str(path))
    if image is None:
        raise ValueError("No se puede abrir la imagen.")
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    # Ampliar y mejorar contraste para texto de ticket.
    gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    return cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]


def limpiar_nombre(texto: str):
    texto = re.sub(r"\s+", " ", texto).strip(" \t:;,.*-")
    # Quita códigos o restos habituales de OCR al principio/final.
    texto = re.sub(r"^[\d.,\s]+", "", texto)
    texto = re.sub(r"[\s:;,.*-]+$", "", texto)
    return texto.upper()


def es_nombre_producto(texto: str):
    texto = limpiar_nombre(texto)
    if len(texto) < 3:
        return False
    upper = texto.upper()
    if any(upper.startswith(prefix) for prefix in IGNORE_EXACT_OR_START):
        return False
    if not re.search(r"[A-ZÁÉÍÓÚÜÑ]", upper):
        return False
    # Evita elegir líneas de peso/cantidad o líneas puramente numéricas.
    if re.fullmatch(r"[\d.,\sXxKGgLl]+", upper):
        return False
    return True


def extraer_fecha(texto: str):
    for match in DATE_RE.finditer(texto):
        day, month, year = map(int, match.groups())
        if year < 100:
            year += 2000
        try:
            return datetime(year, month, day).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return None


def extraer_zona_compra(texto: str):
    """
    En capturas que incluyen la página de ofertas y un justificante de devolución,
    analiza únicamente el recibo de compra original.
    """
    stop_patterns = [
        r"OFERTAS\s+LIDL\s+PLUS",
        r"DEVOLUCI[ÓO]N",
        r"\bDEVOLUCI[ÓO]N\s+REALIZADA\b",
    ]
    end = len(texto)
    for pattern in stop_patterns:
        match = re.search(pattern, texto, re.IGNORECASE)
        if match:
            end = min(end, match.start())
    return texto[:end]


def extraer_productos(texto_compra: str):
    lines = [re.sub(r"\s+", " ", line).strip() for line in texto_compra.splitlines()]
    products = []
    previous_product_line = None

    for line in lines:
        if not line:
            continue

        match = UNIT_PRICE_RE.search(line)
        if match:
            # Si el nombre aparece antes del patrón en la misma línea, úsalo.
            before = line[:match.start()].strip(" -:;,.")
            if es_nombre_producto(before):
                name = limpiar_nombre(before)
            elif previous_product_line:
                name = limpiar_nombre(previous_product_line)
            else:
                name = None

            if name:
                price = float(match.group("price").replace(",", "."))
                unit = match.group("unit").lower()
                if unit.startswith(("ud", "unidad")):
                    unit_label = "€/ud"
                elif unit in ("l", "lt") or unit.startswith("litro"):
                    unit_label = "€/l"
                elif unit == "g":
                    unit_label = "€/g"
                elif unit == "m":
                    unit_label = "€/m"
                else:
                    unit_label = "€/kg"

                # Etiquetar con unidad evita mezclar, por ejemplo, €/kg con €/ud.
                column_name = f"{name} ({unit_label})"
                if not any(p["producto"] == column_name for p in products):
                    products.append({"producto": column_name, "precio": price})

            previous_product_line = None
            continue

        # Las promociones suelen estar entre productos y no deben convertirse
        # en artículos ni alterar el precio por kg/unidad que imprime el ticket.
        if line.upper().startswith(("PROMO", "DESCUENTO", "TOTAL", "ENTREGA")):
            previous_product_line = None
            continue

        # Las líneas de peso/cantidad no incluyen el precio unitario reconocido.
        # Conserva como posible nombre la última línea que parezca descripción.
        if es_nombre_producto(line):
            previous_product_line = line

    return products


def destino_unico(path: Path):
    if not path.exists():
        return path
    n = 1
    while True:
        candidate = path.with_name(f"{path.stem}_{n}{path.suffix}")
        if not candidate.exists():
            return candidate
        n += 1


def guardar_csv(fecha, productos):
    # CSV separado por punto y coma y con coma decimal, cómodo para Excel en España.
    if CSV_PATH.exists():
        with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f, delimiter=";")
            existing_columns = reader.fieldnames or ["Fecha"]
            rows = list(reader)
    else:
        existing_columns = ["Fecha"]
        rows = []

    for product in productos:
        if product["producto"] not in existing_columns:
            existing_columns.append(product["producto"])

    row = {column: "" for column in existing_columns}
    row["Fecha"] = fecha
    for product in productos:
        row[product["producto"]] = f'{product["precio"]:.2f}'.replace(".", ",")

    rows.append(row)
    with CSV_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=existing_columns, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)


def procesar(path: Path):
    image = preparar_imagen(path)
    text = pytesseract.image_to_string(image, lang="spa", config="--oem 3 --psm 6")
    purchase_text = extraer_zona_compra(text)

    fecha = extraer_fecha(purchase_text)
    if not fecha:
        raise ValueError("No se ha podido reconocer la fecha del recibo de compra.")

    products = extraer_productos(purchase_text)
    if not products:
        raise ValueError(
            "No se han detectado precios por unidad/kg. "
            "La imagen se conservará para poder revisarla."
        )

    guardar_csv(fecha, products)
    READ_DIR.mkdir(exist_ok=True)
    destination = destino_unico(READ_DIR / path.name)
    shutil.move(str(path), str(destination))
    return fecha, products, destination


def main():
    READ_DIR.mkdir(exist_ok=True)
    images = sorted(
        p for p in ROOT.iterdir()
        if p.is_file() and p.suffix.lower() in EXTENSIONS
    )
    if not images:
        print("No hay imágenes de tickets en la carpeta del script.")
        return

    for path in images:
        try:
            fecha, products, destination = procesar(path)
            print(f"OK: {path.name} | Fecha: {fecha} | Productos: {len(products)}")
            for product in products:
                print(f"  - {product['producto']}: {product['precio']:.2f}")
            print(f"  Imagen archivada en: {destination.relative_to(ROOT)}")
        except Exception as exc:
            print(f"ERROR: {path.name}: {exc}")
            print("La imagen no se ha movido; puedes revisarla y volver a intentarlo.")


if __name__ == "__main__":
    main()
