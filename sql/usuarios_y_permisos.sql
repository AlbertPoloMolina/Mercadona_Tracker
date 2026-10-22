-- =========================================================================
-- SQL PARA SUPABASE: USUARIOS, CARROS PRIVADOS Y ADMINISTRACIÓN
-- Ejecuta este script en el SQL Editor de tu Dashboard de Supabase
-- =========================================================================

-- 1. Añadir columna user_id a la tabla de lista de la compra (shopping_list_items)
ALTER TABLE IF EXISTS shopping_list_items 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Índice para acelerar las consultas por usuario
CREATE INDEX IF NOT EXISTS idx_shopping_list_user_id ON shopping_list_items(user_id);

-- 2. Habilitar Row Level Security (RLS) en shopping_list_items
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de seguridad: Cada usuario solo puede ver, insertar, actualizar y borrar SUS items
DROP POLICY IF EXISTS "Los usuarios pueden ver sus propios items" ON shopping_list_items;
CREATE POLICY "Los usuarios pueden ver sus propios items"
ON shopping_list_items FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Los usuarios pueden insertar sus propios items" ON shopping_list_items;
CREATE POLICY "Los usuarios pueden insertar sus propios items"
ON shopping_list_items FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Los usuarios pueden actualizar sus propios items" ON shopping_list_items;
CREATE POLICY "Los usuarios pueden actualizar sus propios items"
ON shopping_list_items FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Los usuarios pueden borrar sus propios items" ON shopping_list_items;
CREATE POLICY "Los usuarios pueden borrar sus propios items"
ON shopping_list_items FOR DELETE
USING (auth.uid() = user_id);

-- 4. Permitir lectura pública de supermercados, canónicos y productos de tienda
ALTER TABLE supermarkets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura publica de supermercados" ON supermarkets;
CREATE POLICY "Lectura publica de supermercados" ON supermarkets FOR SELECT USING (true);

ALTER TABLE canonical_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura publica de canonicos" ON canonical_products;
CREATE POLICY "Lectura publica de canonicos" ON canonical_products FOR SELECT USING (true);

-- Permitir actualización de canónicos y store_products (para el administrador)
DROP POLICY IF EXISTS "Actualizacion de canonicos para usuarios autenticados" ON canonical_products;
CREATE POLICY "Actualizacion de canonicos para usuarios autenticados" 
ON canonical_products FOR ALL 
USING (auth.role() = 'authenticated');

ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura publica de store_products" ON store_products;
CREATE POLICY "Lectura publica de store_products" ON store_products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Gestion de store_products para autenticados" ON store_products;
CREATE POLICY "Gestion de store_products para autenticados" 
ON store_products FOR ALL 
USING (auth.role() = 'authenticated');

-- =========================================================================
-- LISTO: Cada usuario tendrá su propio carro privado y tú podrás editar el catálogo
-- =========================================================================
