#!/usr/bin/env python3
"""
Script para exportar los datos de precios_productos.xlsx a un archivo JSON optimizado (data/precios.json)
para el dashboard web de comparación de precios de Mercadona.
"""

import os
import json
import re
from datetime import datetime
from pathlib import Path
import pandas as pd
import numpy as np

BASE_DIR = Path(__file__).parent
EXCEL_PATH = BASE_DIR / "precios_productos.xlsx"
DATA_DIR = BASE_DIR / "data"
OUTPUT_JSON = DATA_DIR / "precios.json"

CATEGORIES_MAP = {
    '🥩 Carnicería y Pescadería': [
        'CONEJO', 'POLLO', 'PAVO', 'TERNERA', 'CERDO', 'CARNE', 'ALAS', 'CONTRAMUSLO',
        'PECHUGA', 'FILETE', 'ALBONDIGA', 'HAMBURGUESA', 'LOMO', 'BACON', 'CHOPPED',
        'JAMON', 'JAMÓN', 'SALCHICHAS', 'ANCHOA', 'ATUN', 'ATÚN', 'SALMON', 'SALMÓN',
        'MERLUZA', 'BACALAO', 'ANILLAS', 'LANGOSTINO', 'GAMBA', 'BOQUERON', 'BOQUERÓN',
        'SURIMI', 'GULA', 'MORTADELA', 'FUET', 'CHORIZO', 'SALCHICHON', 'SOBRASADA',
        'COSTILLA', 'PICADA', 'SECRETO', 'MAGRO', 'SOLOMILLO', 'SALCHICHA', 'CHULETA'
    ],
    '🥛 Lácteos y Huevos': [
        'HUEVO', 'HUEVOS', 'LECHE', 'YOGUR', 'QUESO', 'MANTEQUILLA', 'NATA', 'FETA',
        'MOZZARELLA', 'MASCARPONE', 'CUAJADA', 'BEBIDA DE', 'KEFIR', 'KÉFIR', 'FLAN',
        'GOUDA', 'EDAM', 'PARMESANO', 'GRANA', 'CHEDDAR', 'BRIE', 'CAMEMBERT', 'RALLADO'
    ],
    '🥖 Panadería y Dulces': [
        'PAN', 'BOCADILLO', 'CROISSANT', 'FARTON', 'FARTONS', 'BOLLO', 'GALLETA',
        'BIZCOCHO', 'TARTA', 'MAGDALENA', 'TOSTADA', 'DONUT', 'DONUTS', 'EMPANADILLA',
        'HOJALDRE', 'BERLINA', 'MUFFIN', 'PALMERA', 'ENSAYMADA', 'SOBAOS', 'ROSQUILLA',
        'BARRA DE PAN', 'BOLLERIA', 'PULGUITA', 'MOLDE', 'COLINES', 'PICOS'
    ],
    '🥗 Frutas y Verduras': [
        'TOMATE', 'CHERRY', 'CANÓNIGO', 'CANONIGO', 'LECHUGA', 'AGUACATE', 'PLÁTANO',
        'PLATANO', 'MANZANA', 'PERA', 'NARANJA', 'LIMON', 'LIMÓN', 'FRESA', 'ARÁNDANO',
        'ARANDANO', 'SANDÍA', 'SANDIA', 'MELON', 'MELÓN', 'CEBOLLA', 'AJO', 'PATATA',
        'PIMIENTO', 'ZANAHORIA', 'CHAMPIÑON', 'CHAMPIÑÓN', 'ESPINACA', 'CALABACIN',
        'CALABACÍN', 'BROCOLI', 'BRÓCOLI', 'JUDIA', 'JUDÍA', 'PEPINO', 'PUERRO',
        'ENSALADA', 'RÚCULA', 'RUCULA', 'KALE', 'CALABAZA', 'ALCACHOFA', 'SETAS'
    ],
    '🥫 Despensa y Conservas': [
        'ACEITE', 'ARROZ', 'PASTA', 'MACARRON', 'MACARRÓN', 'ESPAGUETI', 'LEGUMBRE',
        'ALUBIA', 'GARBANZO', 'LENTEJA', 'HARINA', 'AZUCAR', 'AZÚCAR', 'SAL ', 'ESPECIA',
        'CALDO', 'CACAO', 'CAFÉ', 'CAFE', 'INFUSION', 'INFUSIÓN', 'MAYONESA',
        'TOMATE FRITO', 'CONSERVA', 'KETCHUP', 'MOSTAZA', 'VINAGRE', 'LEVADURA',
        'BICARBONATO', 'FIDEOS', 'TALLARINES', 'SOJA', 'OREGANO', 'PIMIENTA'
    ],
    '🥤 Bebidas': [
        'AGUA MINERAL', 'CERVEZA', 'REFRESCO', 'COLA', 'ZUMO', 'VINO', 'TÓNICA',
        'TONICA', 'GASEOSA', 'ISOTONICA', 'ISOTÓNICA', 'BRONCHALES', 'AQUARIUS',
        'FANTA', 'CORTES', 'BATIDO', 'BIFRUTAS', 'AQUA', 'NECTAR', 'NÉCTAR', 'TINTO'
    ],
    '🧹 Limpieza y Hogar': [
        'LEJIA', 'LEJÍA', 'DETERGENTE', 'SUAVIZANTE', 'FREGASUELOS', 'LAVAVAJILLAS',
        'PAPEL', 'HIGIENICO', 'HIGIÉNICO', 'COCINA', 'BOLSA', 'BOLSAS', 'ALUMINIO',
        'FILM', 'ANTICAL', 'LIMPIADOR', 'DESINFECTANTE', 'BAYETA', 'ESTROPAJO',
        'SALFUMAN', 'SALFUMÁN', 'FREGONA', 'BASURA', 'SERVILLETA', 'GUANTE', 'LAVAVAJILLA'
    ],
    '🧴 Higiene y Cuidado': [
        'CHAMPU', 'CHAMPÚ', 'GEL', 'JABON', 'JABÓN', 'DESODORANTE', 'CREMA', 'DENTAL',
        'PASTA DIENTES', 'CEPILLO', 'TOALLITAS', 'AFEITAR', 'MAQUINILLA', 'APOSITO',
        'APÓSITO', 'ALIVIO PICOR', 'COLONIA', 'COMPRESA', 'TAMPON', 'TAMPÓN',
        'PAÑUELO', 'BASTONCILLO', 'ALGODON', 'ALGODÓN', 'ENJUAGUE', 'PROTECTOR'
    ],
    '🍫 Aperitivos y Snacks': [
        'PAT. CLASSICAS', 'PATATAS', 'CHIPS', 'FRUTOS SECOS', 'CACAHUETE', 'ALMENDRA',
        'NUEZ', 'PIPA', 'PALOMITAS', 'ACEITUNAS', 'SNACK', 'CHOCOLATE', 'BOMBÓN',
        'BOMBON', 'CHICLE', 'GUSANITOS', 'NACHOS', 'TORTITA', 'TURRÓN', 'TURRON'
    ],
    '🍕 Congelados y Platos': [
        'PIZZA', 'CANELONES', 'LASAÑA', 'PAELLA', 'NUGGETS', 'CROQUETAS', 'EMPANADA',
        'BURGER', 'HAMBURGUESA', 'HELADO', 'HIELO', 'CONGELADO', 'ARREGLO PAELLA'
    ]
}

def determine_category(product_name: str) -> str:
    name_upper = product_name.upper()
    for category, keywords in CATEGORIES_MAP.items():
        for kw in keywords:
            if kw in name_upper:
                return category
    return '📦 Otros productos'

def clean_tokens_for_variants(name: str):
    s = re.sub(r'\b\d+(?:[\.,]\d+)?\s*(?:KG|G|GR|L|ML|CL|UDS?|UNID\.?)\b', '', name, flags=re.I)
    s = re.sub(r'\b(?:PACK|PK|X|\d+X)\s*[-]?\s*\d+\b', '', s, flags=re.I)
    s = re.sub(r'^\d+\s+', '', s)
    s = re.sub(r'[-/]', ' ', s)
    tokens = [t for t in s.split() if len(t) > 2 and t not in ('DE', 'DEL', 'CON', 'SIN', 'PARA', 'POR', 'LOS', 'LAS')]
    return tokens

def parse_date_str(date_str: str):
    s = str(date_str).strip()
    clean = s.split(' ')[0]
    suffix = ''
    if '(' in s:
        suffix = ' ' + s[s.find('('):s.find(')')+1]
    try:
        dt = datetime.strptime(clean, '%d/%m/%Y')
        return dt, dt.strftime('%Y-%m-%d') + suffix, s
    except Exception:
        return None, None, s

def main():
    if not EXCEL_PATH.exists():
        print(f"❌ Error: No se encuentra {EXCEL_PATH}")
        return

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"📖 Leyendo {EXCEL_PATH}...")
    df = pd.read_excel(EXCEL_PATH, index_col=0)

    # Filtrar filas vacías si las hay
    non_empty_mask = df.notna().sum(axis=1) > 0
    df = df[non_empty_mask]

    # Ordenar cronológicamente las fechas
    parsed_rows = []
    for idx in df.index:
        dt, dt_iso, original = parse_date_str(idx)
        if dt:
            parsed_rows.append((dt, dt_iso, original))
        else:
            print(f"⚠️ Advertencia: Fecha no reconocida: {idx}")

    sorted_dates = [x[2] for x in sorted(parsed_rows, key=lambda x: (x[0], x[1]))]
    df_sorted = df.loc[sorted_dates]

    product_names = list(df.columns)
    print(f"📊 Procesando {len(sorted_dates)} tickets y {len(product_names)} productos...")

    # Pre-calcular tokens de variantes
    product_tokens = {p: set(clean_tokens_for_variants(p)) for p in product_names}

    products_data = []
    categories_set = set()

    for col in product_names:
        series = df_sorted[col].dropna()
        if len(series) == 0:
            continue

        cat = determine_category(col)
        categories_set.add(cat)

        history = []
        for ticket_date, price in series.items():
            dt, dt_iso, _ = parse_date_str(ticket_date)
            history.append({
                "date": str(ticket_date),
                "dateISO": dt.strftime('%Y-%m-%d') if dt else "",
                "price": round(float(price), 2)
            })

        # Precios clave
        prices = [h["price"] for h in history]
        last_item = history[-1]
        last_price = last_item["price"]
        last_date = last_item["date"]
        last_date_iso = last_item["dateISO"]

        min_price = round(float(min(prices)), 2)
        min_idx = prices.index(min_price)
        min_date = history[min_idx]["date"]

        max_price = round(float(max(prices)), 2)
        max_idx = prices.index(max_price)
        max_date = history[max_idx]["date"]

        avg_price = round(float(np.mean(prices)), 2)

        # Variación respecto a la anterior compra
        prev_price = None
        change_prev = 0.0
        change_prev_pct = 0.0
        if len(history) >= 2:
            prev_price = history[-2]["price"]
            change_prev = round(last_price - prev_price, 2)
            if prev_price > 0:
                change_prev_pct = round((change_prev / prev_price) * 100, 1)

        # Variación respecto al mínimo histórico
        change_min_pct = round(((last_price - min_price) / min_price) * 100, 1) if min_price > 0 else 0.0

        # Tendencia
        if change_prev > 0.01:
            trend = "up"
        elif change_prev < -0.01:
            trend = "down"
        else:
            trend = "stable"

        # Detectar variantes / otros formatos
        current_tokens = product_tokens[col]
        variants = []
        if current_tokens:
            for other_col in product_names:
                if other_col == col:
                    continue
                other_t = product_tokens[other_col]
                overlap = current_tokens.intersection(other_t)
                if (len(current_tokens) >= 2 and len(overlap) >= 2) or \
                   (len(current_tokens) == 1 and len(overlap) == 1 and ('HUEVO' in current_tokens or 'LECHE' in current_tokens or 'ACEITE' in current_tokens or 'PAN' in current_tokens or 'AGUA' in current_tokens)):
                    variants.append(other_col)

        products_data.append({
            "id": re.sub(r'[^a-zA-Z0-9]', '-', col).lower().strip('-'),
            "name": col,
            "category": cat,
            "totalPurchases": len(history),
            "lastPrice": last_price,
            "lastDate": last_date,
            "lastDateISO": last_date_iso,
            "minPrice": min_price,
            "minDate": min_date,
            "maxPrice": max_price,
            "maxDate": max_date,
            "avgPrice": avg_price,
            "prevPrice": prev_price,
            "changePrev": change_prev,
            "changePrevPct": change_prev_pct,
            "changeMinPct": change_min_pct,
            "trend": trend,
            "variants": variants[:6],  # limit to top 6 variants
            "history": history
        })

    # Ordenar categorías en orden lógico
    ordered_cats = ["Todas"] + [c for c in CATEGORIES_MAP.keys() if c in categories_set]
    if '📦 Otros productos' in categories_set:
        ordered_cats.append('📦 Otros productos')

    dt_first, _, _ = parse_date_str(sorted_dates[0])
    dt_last, _, _ = parse_date_str(sorted_dates[-1])

    result = {
        "metadata": {
            "generatedAt": datetime.now().isoformat(),
            "totalTickets": len(sorted_dates),
            "totalProducts": len(products_data),
            "dateRange": {
                "first": sorted_dates[0],
                "firstISO": dt_first.strftime('%Y-%m-%d') if dt_first else "",
                "last": sorted_dates[-1],
                "lastISO": dt_last.strftime('%Y-%m-%d') if dt_last else ""
            }
        },
        "categories": ordered_cats,
        "products": products_data
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    file_size_kb = os.path.getsize(OUTPUT_JSON) / 1024
    print(f"✅ Archivo JSON exportado con éxito:")
    print(f"   • Destino: {OUTPUT_JSON.resolve()}")
    print(f"   • Tamaño: {file_size_kb:.1f} KB")
    print(f"   • Productos: {len(products_data)}")
    print(f"   • Tickets: {len(sorted_dates)}")
    print(f"   • Periodo: {sorted_dates[0]} ➔ {sorted_dates[-1]}")

if __name__ == "__main__":
    main()
