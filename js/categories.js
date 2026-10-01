/**
 * Categorías y normalización de productos de Mercadona
 */

export const CATEGORIES_MAP = {
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
};

export function determineCategory(productName) {
  if (!productName) return '📦 Otros productos';
  const upper = productName.toUpperCase();
  for (const [category, keywords] of Object.entries(CATEGORIES_MAP)) {
    for (const kw of keywords) {
      if (upper.includes(kw)) {
        return category;
      }
    }
  }
  return '📦 Otros productos';
}

export function cleanTokensForVariants(name) {
  if (!name) return [];
  let s = name
    .replace(/\b\d+(?:[\.,]\d+)?\s*(?:KG|G|GR|L|ML|CL|UDS?|UNID\.?)\b/gi, '')
    .replace(/\b(?:PACK|PK|X|\d+X)\s*[-]?\s*\d+\b/gi, '')
    .replace(/^\d+\s+/, '')
    .replace(/[-/]/g, ' ');
  const stopWords = new Set(['DE', 'DEL', 'CON', 'SIN', 'PARA', 'POR', 'LOS', 'LAS', 'EL', 'LA', 'EN', 'UN', 'UNA']);
  return s.split(/\s+/)
    .map(t => t.trim().toUpperCase())
    .filter(t => t.length > 2 && !stopWords.has(t));
}
