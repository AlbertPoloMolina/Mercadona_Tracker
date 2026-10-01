# 🛒 Mercadona Tracker & Comparador de Precios

Un dashboard web moderno, rápido y responsive (pensado para móvil y escritorio) que utiliza tu archivo `precios_productos.xlsx` como base de datos viva. Diseñado específicamente para consultar tus precios históricos de Mercadona y **comparar en tiempo real cuando estés en otros supermercados** (Carrefour, Lidl, Dia, Aldi, Alcampo, Consum, etc.) para saber si un producto está más barato o más caro.

---

## ✨ Características Principales

1. **📊 Catálogo Inteligente de Productos:**
   - Visualización de tus **414 productos** y **172+ tickets** registrados desde 2023.
   - Métricas por producto: **Último precio pagado** (y fecha), **Mínimo histórico**, **Máximo histórico**, **Precio medio** y número de compras.
   - Buscador ultrarrápido con filtrado instantáneo por nombre y categorías (Lácteos, Carnicería, Frutas/Verduras, Panadería, Despensa, Limpieza, Bebidas, etc.).
   - Filtros de estado: *Más habituales*, *En subida 🔺*, *En bajada 🔻*, *En mínimo histórico 💎*.
   - Selector de ordenación y cambio entre vista de tarjetas o tabla compacta.

2. **⚡ Comparador en Tienda (Modo Móvil):**
   - Diseñado para usar en el pasillo del supermercado con una sola mano.
   - Selecciona el producto de Mercadona y el competidor (Carrefour, Lidl, Dia, Aldi, etc.).
   - Introduce el precio que ves en la estantería: te calcula al instante el **ahorro o sobrecoste en euros y porcentaje**.
   - Semáforo visual dinámico:
     - 🟢 **¡Más económico aquí!**: Ahorras dinero respecto a Mercadona.
     - 🔴 **Más caro que en Mercadona**: Mejor esperar y comprarlo en Mercadona.
     - 🟡 **Precio idéntico o similar**.
   - **Conversor de formatos desiguales:** Compara precios por unidad o peso (ej. 12 huevos en Mercadona vs 10 huevos en Lidl, o 500g vs 750g).
   - **Mi Cesta de la Visita:** Guarda los productos comparados durante tu compra y calcula el ahorro neto acumulado de la visita.

3. **📈 Gráficos de Evolución Histórica:**
   - Haz clic en cualquier producto para abrir su ficha completa.
   - Gráfico interactivo con curva suave temporal y línea de precio medio de referencia.
   - Detección automática de **formatos y variantes alternativas** (ej. *12 Huevos L* vs *6 Huevos L*, o *Bronchales 1.5L* vs *Bronchales 330ml*).
   - Historial detallado de todas tus compras ticket a ticket con variaciones (+/- €).

4. **📉 Termómetro de Inflación & Tendencias:**
   - Ranking de productos con mayores subidas porcentuales desde su mínimo.
   - Ranking de oportunidades actualmente en precio mínimo.

5. **📱 100% Offline & Mobile First:**
   - Guarda los datos en la caché de tu navegador (`localStorage`) para que cargue al instante incluso en sótanos de supermercados sin cobertura 4G/5G.

---

## 🚀 Cómo Publicarlo en GitHub Pages (en 2 minutos)

Este proyecto está construido con tecnologías web estándar (HTML5, CSS3, JavaScript ES Modules, SheetJS y Chart.js). **No requiere Node.js, ni npm, ni compilación.**

1. **Sube los archivos a tu repositorio de GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Dashboard Mercadona Tracker"
   git branch -M main
   git remote add origin https://github.com/<tu-usuario>/<tu-repositorio>.git
   git push -u origin main
   ```

2. **Activa GitHub Pages:**
   - En tu repositorio de GitHub, ve a **Settings** > **Pages**.
   - En **Build and deployment** > **Source**, elige: `Deploy from a branch`.
   - En **Branch**, selecciona `main` y carpeta `/ (root)`.
   - Haz clic en **Save**.

3. **¡Listo!** En unos 60 segundos tu dashboard estará disponible públicamente en:
   `https://<tu-usuario>.github.io/<tu-repositorio>/`

---

## 🔄 ¿Cómo se actualizan los datos cuando añades nuevos tickets?

Tienes **tres formas muy sencillas** de actualizar:

### Opción A (La más automática):
1. Cuando ejecutas tu cuaderno `Lectura_recibos.ipynb`, se actualiza tu `precios_productos.xlsx`.
2. Simplemente subes el nuevo `precios_productos.xlsx` a tu repositorio de GitHub con `git push`.
3. El dashboard en GitHub Pages leerá directamente el nuevo Excel o puedes configurar la URL de tu repositorio en el botón **⚙️ Datos**.

### Opción B (Con el exportador JSON súper rápido):
Para que la carga inicial sea aún más ligera (menos de 50 milisegundos):
```bash
python3 exportar_datos.py
```
Esto regenera `data/precios.json`. Luego haces `git push` y listo.

### Opción C (Directamente en la web sin desplegar):
En cualquier momento, abre la web, pulsa en el icono de **⚙️** (arriba a la derecha), y arrastra tu archivo `precios_productos.xlsx` en la zona marcada. Se cargará y actualizará en tu navegador al instante.

---

## 📂 Estructura del Proyecto

```
├── index.html              # Estructura principal y vistas del dashboard
├── css/
│   └── styles.css          # Sistema de diseño, temas claro/oscuro y responsive
├── js/
│   ├── app.js              # Controlador central de la aplicación
│   ├── comparator.js       # Lógica del comparador de supermercados y cesta
│   ├── chart-manager.js    # Gráficos interactivos de evolución con Chart.js
│   ├── excel-parser.js     # Lector de Excel en el navegador con SheetJS
│   └── categories.js       # Categorización y detección de variantes
├── vendor/
│   ├── xlsx.full.min.js    # Librería SheetJS (empaquetada para uso offline)
│   └── chart.umd.min.js    # Librería Chart.js (empaquetada para uso offline)
├── data/
│   ├── precios.json        # Base de datos precompilada de Mercadona
│   └── precios_competencia.json # Histórico de precios registrados en otros súpers (Opción A)
├── exportar_datos.py       # Script de exportación de Excel a JSON
├── precios_productos.xlsx  # Tu archivo Excel maestro de Mercadona
└── README.md
```

---

## 🐙 Guardado Automático en GitHub (Opción A)

Cuando vas a otro supermercado (Carrefour, Lidl, Dia...) y registras una comparativa, los datos se guardan en el archivo `data/precios_competencia.json` de tu propio repositorio de GitHub mediante la **GitHub REST API**.

### ¿Cómo funciona?
1. **100% Sin Servidores:** Todo ocurre en el navegador web de tu móvil.
2. **Seguridad y Privacidad:** Tu Personal Access Token (PAT) se guarda **únicamente en el `localStorage` de tu navegador** (jamás se envía a servidores externos ni se sube a git).
3. **Commits Automáticos:** Cada vez que guardas una comparativa (o pulsas el botón ☁️ **Subir a GitHub**), la aplicación contacta directamente con la API de GitHub (`PUT /repos/{owner}/{repo}/contents/data/precios_competencia.json`) e inserta un nuevo commit en tu repositorio con los nuevos datos.

### Pasos para configurarlo (1 minuto):
1. En GitHub, crea un token de acceso personal:
   - Ve a [GitHub Tokens](https://github.com/settings/tokens/new?scopes=repo&description=MercadonaTracker).
   - Asígnale un nombre (ej. `MercadonaTracker`) y marca el permiso **`repo`** (o si es un Fine-Grained token, permisos de lectura y escritura en `Repository contents: Write`).
   - Copia el token generado (`ghp_...`).
2. Abre el dashboard en tu móvil o navegador y pulsa en el botón **⚙️ (Ajustes)** arriba a la derecha.
3. En la sección **🐙 Sincronización Automática con GitHub (Opción A)**:
   - **Usuario:** Tu nombre de usuario en GitHub (ej. `albert`).
   - **Repositorio:** El nombre de tu repositorio (ej. `Mercadona`).
   - **Rama:** `main`.
   - **GitHub Token:** Pega tu token `ghp_...`.
   - Pulsa **"☁️ Probar Conexión y Guardar en GitHub"**.
4. ¡Listo! Verás el indicador verde de conexión correcta. A partir de ese momento, cada comparativa que guardes en el súper se añadirá automáticamente a `data/precios_competencia.json` en tu repositorio.

---

## 💡 Consejo para el Supermercado
En tu teléfono móvil (iPhone o Android):
1. Abre la URL de tu GitHub Pages en Safari o Chrome.
2. Pulsa en **"Compartir"** > **"Añadir a pantalla de inicio"** (o "Instalar aplicación").
3. Se creará un icono como si fuera una aplicación nativa en tu móvil, permitiéndote abrirla al instante en pantalla completa cada vez que vayas a comprar.
