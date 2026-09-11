# Momentum — Agenda personal con Supabase

Agenda en español para hábitos, tareas, bloques horarios, enfoque e historial. React + Vite, Cloudflare Pages y Supabase Free. Conserva una copia local y sincroniza al estar conectado.

## Estado de esta entrega

La integración está implementada y probada con un servicio simulado y con las políticas SQL ejecutadas en PostgreSQL local mediante PGlite. El 10 de septiembre de 2026 se verificaron el inicio de sesión, el guardado en Supabase real y la conservación de datos al recargar. Consulta ESTADO-CONEXION.md para el estado de configuración. Sin variables de configuración, funciona en modo local. No se ha publicado en GitHub ni en internet.

Sigue [SUPABASE.md](SUPABASE.md) para crear tu proyecto gratuito y autorizar tu cuenta. Después, [DESPLIEGUE.md](DESPLIEGUE.md) explica GitHub y Cloudflare Pages.

## Cómo se guardan los datos

- Sin sesión: se conserva la agenda local original del navegador.
- Con sesión: cada cuenta tiene una copia local separada y una agenda privada en Supabase.
- Un cambio se guarda primero localmente. La subida automática se intenta tras una breve espera; también al reconectar, volver a la aplicación y cada minuto mientras está visible.
- Solo se considera sincronizado cuando Supabase confirma el guardado. Los cambios pendientes permanecen en el teléfono aunque recargues.
- Otro dispositivo recibe la agenda al iniciar sesión o sincronizar. Si ambos dispositivos tienen cambios diferentes, la app muestra un conflicto y permite exportar ambas copias y elegir cuál conservar. No combina agendas ni sobrescribe silenciosamente.
- Cerrar sesión oculta la copia de esa cuenta, pero la conserva en el almacenamiento de ese dispositivo para recuperar cambios pendientes al volver a entrar. Ese almacenamiento no está cifrado: usa dispositivos de confianza.

## Pasar la agenda anterior a la nube

Exporta un respaldo antes de iniciar sesión. Una vez dentro, usa **Copiar agenda local anterior**, o **Restaurar respaldo** si cambiaste de navegador/dirección. Revisa la confirmación: reemplaza la agenda de la cuenta que estás viendo, no mezcla datos. La copia local anterior permanece intacta.

## Teléfono y respaldos

Abre la dirección HTTPS y espera la primera carga completa. Android: instalar aplicación/añadir a pantalla de inicio desde Chrome. iPhone: compartir → añadir a pantalla de inicio desde Safari. Después puede abrir sin conexión; la nube requiere internet.

Exporta un respaldo periódicamente. El JSON no está cifrado; guárdalo en privado. La restauración valida estructura y tamaño (máximo 5 MB). Si el almacenamiento está dañado, se protege de sobrescritura y permite exportar una copia de recuperación. No borres los datos del navegador si hay cambios pendientes de sincronizar.

## Desarrollo y verificación

Node 24 recomendado (mínimo 22.12 compatible con Vite).

```sh
npm ci
npm test
npm run build
npm run preview
```

Para desarrollar: `npm run dev`. Para el navegador: `npx playwright install chromium` y `npm run test:browser`. En Windows puedes definir `MOMENTUM_BROWSER` con la ruta de Edge/Chromium instalado.

Las pruebas de nube usan la URL ficticia `https://momentum-test.supabase.co` y la clave ficticia `sb_publishable_test_public_only`; las solicitudes son interceptadas en las pruebas. No uses esa configuración al publicar. El flujo de GitHub Actions comprueba ambos modos.

## Estructura

- `src/App.jsx`: agenda y acciones.
- `src/data.js`: validación, fechas y respaldos.
- `src/sync-store.js`: cola local, versiones y resolución de conflictos.
- `src/cloud.js`, `use-agenda.js`, `CloudPanel.jsx`: Supabase, sesión e interfaz de sincronización.
- `supabase/migrations`: esquema y permisos de base de datos.
- `tests`: lógica, permisos SQL y navegador.
- `public` y `scripts/build-sw.mjs`: instalación móvil, caché sin conexión y encabezados.

## Limitaciones

Supabase Free puede pausar proyectos poco activos. Los cambios permanecen locales hasta que haya conexión y el proyecto vuelva a estar disponible. El plan gratuito no incluye copias automáticas de base de datos; conserva tus exportaciones.

El temporizador corrige el tiempo al volver de segundo plano, pero no es una alarma del sistema y se reinicia al cerrar o recargar durante una sesión. No se registra esa sesión incompleta. Los bloques superpuestos siguen accesibles en la lista inferior; los bloques no cruzan medianoche. No hay edición directa: elimina y vuelve a crear.

La sesión inicial usa correo y contraseña de una cuenta previamente autorizada; no hay registro público, acceso con Google ni recuperación de contraseña por correo desde la app en esta versión. Las actualizaciones de la aplicación se activan al cerrar todas sus ventanas y abrirla nuevamente.
