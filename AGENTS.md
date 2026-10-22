# Reglas de Flujo de Trabajo del Proyecto (Git & Producción)

## Política de Git, Commits y Despliegues
1. **PROHIBIDO hacer commit o push automáticamente:** El usuario realizará **personalmente y de forma manual** todos los `git commit` y `git push`. El asistente nunca debe ejecutarlos salvo que el usuario lo solicite de forma expresa y puntual.
2. **PROHIBIDO hacer merge o push a `main` de forma automática:** La rama `main` es el entorno de producción (desplegado en GitHub Pages).
3. **Desarrollo en ramas específicas (Feature Branches):** Todos los desarrollos, correcciones y pruebas deben realizarse únicamente en su rama correspondiente.
4. **Validación previa obligatoria por parte del usuario:** El usuario debe probar y validar primero los cambios antes de que nada pase a producción.
5. **Despliegue a producción solo bajo orden explícita:** Solo se hará merge hacia `main` o push a `origin/main` cuando el usuario lo solicite expresamente con una instrucción directa como "haz merge a main", "despliega a producción" o "pásalo a main".

