# play-rojo

Userscript para Tampermonkey que, en YouTube:

- **Adelanta los anuncios del reproductor**: los silencia, los pone a velocidad máxima, salta al final y hace clic en "Omitir" apenas aparece. No bloquea peticiones, así YouTube lo detecta menos.
- **Oculta banners y anuncios** de la portada, las búsquedas y el panel lateral.
- **Mantiene el audio en segundo plano**: la página siempre cree que está visible.
- **Solo audio** (opcional): oculta el video y baja la calidad al mínimo.

Funciona en www.youtube.com, m.youtube.com y music.youtube.com.

## Reglas remotas (rotación)

Los selectores viven en [`reglas.json`](reglas.json). El script lo descarga de GitHub cada hora y lo guarda en caché. Cuando YouTube cambia algo, basta con editar `reglas.json` y subirlo: nadie tiene que reinstalar nada.

Si el script ve un anuncio y ninguna regla funciona, muestra el aviso **"Reglas desactualizadas"**.

Al cambiar las reglas:

1. Editar `reglas.json` y subir el número de `version` (por ejemplo `2026-11-25.2`).
2. `node herramientas/sincronizar.mjs`: valida el JSON y copia las reglas dentro del script como respaldo sin conexión.
3. Commit y push a `main`.
4. En el navegador: menú de Tampermonkey → **Actualizar reglas ahora** (o esperar hasta una hora).

Si cambia el código del script, también hay que subir `@version` en la cabecera para que Tampermonkey ofrezca la actualización.

## Instalación

Enlace de instalación: <https://raw.githubusercontent.com/jschacosta/play-rojo/main/play-rojo.user.js>

### Chrome (Mac)

1. Instalar [Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo).
2. En `chrome://extensions` → Tampermonkey → **Detalles** → activar **Permitir scripts de usuario**.
3. Abrir el enlace de instalación y pulsar **Instalar**.

### Firefox en Android

1. Instalar Firefox (es el único navegador de Android que acepta userscripts).
2. Menú → Complementos → instalar **Tampermonkey**.
3. Abrir el enlace de instalación en Firefox y pulsar **Instalar**.
4. Para que el audio siga con la pantalla apagada: Ajustes de Android → Apps → Firefox → Batería → **Sin restricciones**.
5. Usar la versión de escritorio o la móvil de YouTube en Firefox, no la app.

## Menú de Tampermonkey

- **Actualizar reglas ahora**
- **Solo audio** (activar o desactivar)
- **Audio en segundo plano** (activar o desactivar; requiere recargar)
- **Ver estado**: versión de las reglas, última descarga y anuncios adelantados en la pestaña.
