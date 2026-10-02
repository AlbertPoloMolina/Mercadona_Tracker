# Reglas de Flujo de Trabajo del Proyecto (Git & Producción)

## Política de Ramas y Despliegues a Producción
1. **PROHIBIDO hacer merge o push a `main` de forma automática:** La rama `main` es el entorno de producción (desplegado en GitHub Pages).
2. **Desarrollo en ramas específicas (Feature Branches):** Todos los desarrollos, correcciones y pruebas deben realizarse y commitearse únicamente en su rama correspondiente (por ejemplo `Mejoras-manejavilidad` u otra rama de trabajo).
3. **Validación previa obligatoria por parte del usuario:** El usuario debe probar y validar primero los cambios antes de que nada pase a producción.
4. **Despliegue a producción solo bajo orden explícita:** Solo se hará merge hacia `main` o push a `origin/main` cuando el usuario lo solicite expresamente con una instrucción directa como "haz merge a main", "despliega a producción" o "pásalo a main".
