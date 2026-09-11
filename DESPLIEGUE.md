# GitHub y despliegue de Momentum

## Repositorio

Usa **solo el contenido de la carpeta momentum** como raíz del nuevo repositorio. La carpeta contenedora tiene otro proyecto y no debe subirse junto a esta agenda. Así GitHub encontrará `.github/workflows/ci.yml`.

Incluye `src`, `public`, `scripts`, `tests`, `supabase`, los archivos de configuración, la documentación y el archivo de bloqueo. Excluye `.env.local`, `node_modules`, `dist`, respaldos personales y ZIPs. La entrega está preparada para GitHub; todavía no se creó ni publicó un repositorio.

GitHub Actions verificará lógica, permisos SQL y navegador con una nube simulada. No necesita claves reales para esas pruebas. Conserva `.env.example` como ejemplo sin datos del proyecto.

## Cloudflare Pages Free

Recomiendo crear un proyecto Pages mediante **integración Git**, porque ahora quieres mantener el código en GitHub:

- Repositorio: el nuevo repositorio de Momentum.
- Directorio raíz: raíz del repositorio.
- Compilación: `npm run build`.
- Salida: `dist`.
- Node: 24.
- Variables de producción: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, según SUPABASE.md.

No añadas claves administrativas. Para vistas previas, deja las variables de nube vacías (modo local), o usa un proyecto de pruebas separado; no conectes código no revisado con tus datos reales.

El subdominio pages.dev evita comprar un dominio. Publica como **Pages**, para que se aplique `_headers`. [Integración Git](https://developers.cloudflare.com/pages/get-started/git-integration/) · [Encabezados](https://developers.cloudflare.com/pages/configuration/headers/).

## Carga directa opcional

También puedes ejecutar `npm run build` con las variables reales configuradas y subir únicamente el contenido de `dist` mediante Direct Upload. Un proyecto Direct Upload no puede convertirse posteriormente en uno de integración Git; por eso conviene elegir Git desde el principio. [Carga directa](https://developers.cloudflare.com/pages/get-started/direct-upload/).

Los ZIP compilados anteriores a la conexión con Supabase funcionan en modo local. El paquete actualizado para GitHub contiene las fuentes y excluye la configuración privada local: configura las dos variables de producción indicadas arriba al desplegar. El guardado con el proyecto real ya se verificó en la vista previa local.

## Después de publicar

Comprueba HTTPS, inicio de sesión, guardado confirmado, segundo dispositivo y funcionamiento sin conexión. Sigue siempre la misma URL. Importa o copia tu agenda local anterior dentro de la cuenta después de exportar un respaldo.

Para actualizar, sube cambios al mismo repositorio/proyecto. Cierra todas las ventanas de la app y vuelve a abrirla para activar una actualización del service worker. Los datos de la agenda no están dentro de la caché de archivos de la aplicación.
