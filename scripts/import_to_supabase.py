#!/usr/bin/env python3
"""
Script de importación y sincronización de datos iniciales hacia Supabase
- Importa productos canónicos (genéricos)
- Importa productos específicos de Mercadona (con sus formatos y precios)
- Importa productos específicos de Family Cash (desde ticket_FC.xlsx)
- Importa comparativas registradas de otros supermercados (desde precios_competencia.json)
"""

import json
import re
import urllib.request
import urllib.error
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SUPABASE_URL = "https://blxmcvaotrabcibzsduh.supabase.co"
SUPABASE_KEY = "sb_publishable_37n5COslCzzF3xstXup2Gg_rYum-T4M"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

def supabase_post(endpoint, data):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        print(f"❌ Error en POST {endpoint}: {e.code} - {err_msg}")
        return e.code, err_msg

# Diccionario de categorías mapped a IDs de Supabase
CAT_ID_MAP = {
    '🥩 Carnicería y Pescadería': 'carniceria-pescaderia',
    '🥛 Lácteos y Huevos': 'lacteos-huevos',
    '🥖 Panadería y Dulces': 'panaderia-dulces',
    '🥗 Frutas y Verduras': 'frutas-verduras',
    '🥫 Despensa y Conservas': 'despensa-conservas',
    '🥤 Bebidas': 'bebidas',
    '🧹 Limpieza y Hogar': 'limpieza-hogar',
    '🧴 Higiene y Cuidado': 'higiene-cuidado',
    '🍫 Aperitivos y Snacks': 'aperitivos-snacks',
    '🍕 Congelados y Platos': 'congelados-platos',
    '📦 Otros productos': 'otros'
}

def clean_canonical_name(name):
    # Quitar cantidades al final como (Bote 1 kg), (1 L), (500 g), (Pack 6), etc.
    s = re.sub(r'\s*\([^)]*\)', '', name).strip()
    s = re.sub(r'\s+Hacendado\b', '', s, flags=re.I).strip()
    return s

def slugify(text):
    s = text.lower().strip()
    s = re.sub(r'[áàä]', 'a', s)
    s = re.sub(r'[éèë]', 'e', s)
    s = re.sub(r'[íìï]', 'i', s)
    s = re.sub(r'[óòö]', 'o', s)
    s = re.sub(r'[úùü]', 'u', s)
    s = re.sub(r'[ñ]', 'n', s)
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')

def main():
    print("🚀 Iniciando importación hacia Supabase...")
    
    # 1. Cargar Mercadona y personalizaciones
    with open(ROOT / "data" / "precios.json", encoding="utf-8") as f:
        precios_data = json.load(f)
    
    custom_path = ROOT / "data" / "productos_personalizados.json"
    custom_map = {}
    if custom_path.exists():
        with open(custom_path, encoding="utf-8") as f:
            custom_map = json.load(f)

    # 2. Cargar Family Cash
    fc_excel = ROOT / "Family" / "ticket_FC.xlsx"
    fc_products = {}
    if fc_excel.exists():
        fc_df = pd.read_excel(fc_excel)
        fc_row = fc_df.iloc[0]
        fc_date = str(fc_row.get("Fecha", "2026-10-02"))
        # Parse fecha
        try:
            fc_date_iso = pd.to_datetime(fc_date, dayfirst=True).strftime("%Y-%m-%d")
        except:
            fc_date_iso = "2026-10-02"

        for col, val in fc_row.items():
            if col != "Fecha" and pd.notna(val):
                fc_products[col.strip()] = {
                    "price": float(val),
                    "date": fc_date_iso
                }
    
    # Mapeo manual curado de productos de Family Cash con productos de Mercadona
    FC_CANONICAL_MATCH = {
        'GALLETAS MARIA DORADA FAMILY 800': 'galletas-maria-dorada',
        'CALDO LIQ. COCIDO FAMILY 1 LTOB': 'caldo-de-cocido-tradicional',
        'LENTEJA NATURAL TARRO 400 GR FAM A': 'lentejas-cocidas',
        'MACARRÓN FAMILY 1KG': 'macarrones',
        'TOMATE TRITURADO DIDI 4006': 'tomate-natural-triturado',
        'TOMATE FRITO DIDI 3906': 'tomate-frito',
        'ARROZ REDONDO EXTRA 7 FAMILY 1KG': 'arroz-redondo',
        'TOMATE CHERRY PRA. BANDEJA': 'tomates-cherry',
        'PAN MOLDE FAMILIAR FAMILY 8206': 'pan-de-molde-blanco-familiar',
        'QUESO RALLADO FU DIDO. ROYAL ORAN L': 'queso-rallado-especial-para-fundir',
        'BACON AHUMADO TRAE FAMILY 2X:100': 'cintas-de-bacon-ahumado',
        'TORTILLA TRIGÓ 256M 6U FAMILY 36': 'tortillas-de-trigo',
        'LONGANTZA DE CERDO S/TR E A DE CERDO S/TRIPA': 'longanizas-frescas-sin-tripa',
        'ENSALADA CANUINIGUS FAMILY 1256': 'cananigos-frescos-en-bolsa',
        'BURGER MEAT DE POLLO PACK-6 590': 'hamburguesas-burger-meat-de-pollo',
        'JAMON SERRANO RESERVA LONCHAS FA': 'jamon-serrano-reserva-en-lonchas',
        'PECHUGA PAVO LONCHAS FAMILY EL P': 'pechuga-de-pavo-en-lonchas',
        'FLETE PECHUGA DE POLLO': 'filetes-de-pechuga-de-pollo',
        'QUESO LONCHAS SABANITAS': 'queso-havarti-en-lonchas',
        'BANANA KG': 'platano-banana-a-granel',
        'PAN HAMBURGUESA FAMILY PPARK-4 30': 'pan-de-hamburguesa-pack-4',
        'GEL ORIGINAL FAMILY CARE. 750 ML': 'gel-de-ducha-original',
        'CAFE EXTRA INTENSO NÓ1O COMPDG': 'capsulas-cafe-extra-intenso',
        'MAIZ PALOMITAS JUGDNS 7': 'palomitas-de-maiz-para-microondas',
        'PRATATASCARTUCHO LL ENARKS8IGO UN': 'patatas-fritas-cartucho',
        'NACHOS QUESO BOTANAS 200 - LGR': 'nachos-con-queso',
        'DIP CON QUESO 300 GR': 'salsa-dip-con-queso',
        'DIP PICANTE MEXICANA 310 GR': 'salsa-dip-mexicana-picante',
        'PREPARADO DE CARNE PICADA POLLO= MM!': 'carne-picada-de-pollo',
        'PIMIENTO TIRAS PACI3.. FAMILY 180': 'pimiento-en-tiras'
    }

    canonical_dict = {}
    store_products = []

    # 3. Procesar productos de Mercadona
    print("📦 Procesando productos de Mercadona...")
    for prod in precios_data.get("products", []):
        p_id = prod["id"]
        ticket_name = prod["name"]
        custom = custom_map.get(p_id, {})
        disp_name = custom.get("displayName") or ticket_name
        fmt = custom.get("format", {})
        
        # Canonical name & slug
        clean_name = clean_canonical_name(disp_name)
        can_id = slugify(clean_name)
        if not can_id:
            can_id = p_id

        cat_id = CAT_ID_MAP.get(prod.get("category"), "otros")
        
        mode = fmt.get("mode", "direct")
        qty = fmt.get("qty", 1)
        unit = fmt.get("unit", "envase")

        # Calcular precio unitario
        price = float(prod.get("lastPrice", 0))
        unit_price = price
        base_unit = 'ud'

        if mode == 'weight':
            u_clean = str(unit).lower().strip()
            if u_clean in ('g', 'gr'):
                qty_base = qty / 1000.0
                base_unit = 'kg'
            elif u_clean == 'kg':
                qty_base = qty
                base_unit = 'kg'
            elif u_clean in ('ml', 'cl'):
                qty_base = qty / 1000.0
                base_unit = 'L'
            elif u_clean == 'l':
                qty_base = qty
                base_unit = 'L'
            else:
                qty_base = qty
                base_unit = 'kg'
            unit_price = (price / qty_base) if qty_base > 0 else price
        elif mode == 'units':
            base_unit = 'ud'
            unit_price = (price / qty) if qty > 0 else price
        
        if can_id not in canonical_dict:
            canonical_dict[can_id] = {
                "id": can_id,
                "name": clean_name,
                "category_id": cat_id,
                "base_unit": base_unit
            }

        # Store product Mercadona
        last_date = prod.get("lastDateISO") or "2026-10-02"
        if len(last_date) > 10:
            last_date = last_date[:10]

        store_products.append({
            "supermarket_id": "mercadona",
            "canonical_product_id": can_id,
            "ticket_name": ticket_name,
            "display_name": disp_name,
            "package_mode": mode,
            "package_qty": float(qty),
            "package_unit": str(unit),
            "last_price": round(price, 2),
            "last_unit_price": round(unit_price, 3),
            "last_date": last_date
        })

    # 4. Procesar productos de Family Cash
    print("🛒 Procesando productos de Family Cash...")
    for fc_ticket, fc_info in fc_products.items():
        matched_can_id = FC_CANONICAL_MATCH.get(fc_ticket)
        price = fc_info["price"]
        date = fc_info["date"]

        if matched_can_id and matched_can_id in canonical_dict:
            can_id = matched_can_id
            can_obj = canonical_dict[can_id]
        else:
            # Crear canonical nuevo si no existía
            can_name = clean_canonical_name(fc_ticket.title())
            can_id = slugify(can_name)
            can_obj = {
                "id": can_id,
                "name": can_name,
                "category_id": "otros",
                "base_unit": "ud"
            }
            canonical_dict[can_id] = can_obj

        # Detectar formato Family Cash
        mode = "direct"
        qty = 1
        unit = "envase"
        unit_price = price

        m_weight = re.search(r'(\d+)\s*(KG|G|GR|L|ML)\b', fc_ticket.upper())
        if m_weight:
            q_val = float(m_weight.group(1))
            u_raw = m_weight.group(2).lower()
            if u_raw in ('g', 'gr'):
                mode = 'weight'
                qty = q_val
                unit = 'g'
                unit_price = price / (q_val / 1000.0)
            elif u_raw == 'kg':
                mode = 'weight'
                qty = q_val
                unit = 'kg'
                unit_price = price / q_val
            elif u_raw in ('l', 'lt'):
                mode = 'weight'
                qty = q_val
                unit = 'L'
                unit_price = price / q_val

        store_products.append({
            "supermarket_id": "family-cash",
            "canonical_product_id": can_id,
            "ticket_name": fc_ticket,
            "display_name": fc_ticket.title(),
            "package_mode": mode,
            "package_qty": float(qty),
            "package_unit": str(unit),
            "last_price": round(price, 2),
            "last_unit_price": round(unit_price, 3),
            "last_date": date
        })

    print(f"📊 Resumen generado: {len(canonical_dict)} productos canónicos y {len(store_products)} productos de tienda.")

    # 5. Insertar canonical_products en lotes de 50
    canonical_list = list(canonical_dict.values())
    batch_size = 50
    print(f"📤 Enviando {len(canonical_list)} productos canónicos a Supabase...")
    for i in range(0, len(canonical_list), batch_size):
        batch = canonical_list[i:i+batch_size]
        status, resp = supabase_post("canonical_products", batch)
        if status not in (200, 201):
            print(f"⚠️ Error subiendo lote {i}-{i+batch_size} canónicos: {resp}")

    # 6. Insertar store_products en lotes de 50
    print(f"📤 Enviando {len(store_products)} productos de tienda a Supabase...")
    for i in range(0, len(store_products), batch_size):
        batch = store_products[i:i+batch_size]
        status, resp = supabase_post("store_products", batch)
        if status not in (200, 201):
            print(f"⚠️ Error subiendo lote {i}-{i+batch_size} store_products: {resp}")

    print("🎉 ¡Importación a Supabase completada con éxito!")

if __name__ == "__main__":
    main()
