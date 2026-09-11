# Revisión técnica — 8 de septiembre de 2026

## Alcance y arquitectura

Se revisó momentum.zip sin ejecutar las dependencias incluidas. Se extrajo una copia independiente en momentum, sin sustituir el proyecto preexistente. El ZIP original no se modificó. Su README se trató como documentación a verificar, no como instrucciones del usuario.

La aplicación es una SPA React/Vite sin backend, autenticación ni sincronización. La preferencia confirmada fue teléfono y respaldo manual.

## Correcciones y mejoras

- Bloques de una fecha: aparecían todos los días; ahora se filtran correctamente.
- Fechas locales: historial, rachas y navegación ya no mezclan UTC con el día local.
- Agenda completa: incluye madrugada; antes empezaba a las 04:00.
- Temporizador: usa una hora de finalización, corrige tiempo tras suspensión y registra una sola sesión; duración bloqueada mientras corre y conservada al pausar.
- Agenda estable: no se remonta el componente y reinicia el desplazamiento con cada actualización del reloj.
- Guardado: errores visibles; datos dañados protegidos de sobrescritura; cambios en otra pestaña bloquean escrituras hasta recargar o restaurar.
- Respaldos: exportación y restauración en pantalla; validación de estructura, tipos, fechas, horarios, categorías, duplicados y tamaño; confirmación antes de reemplazar.
- Teléfono: navegación adaptada, estadísticas en dos columnas y controles más grandes.
- PWA: manifiesto, iconos y caché sin conexión con actualización al cerrar y volver a abrir.
- Accesibilidad: botones de navegación y completar, etiquetas de formulario, foco visible, Escape y ciclo de Tab en modales; mejor contraste de textos secundarios.
- Eliminación: pide confirmación para reducir borrados accidentales.
- Dependencias: Vite 8.2.2 y plugin React 6.1.1; instalación limpia y archivo de bloqueo actualizado.
- Seguridad: CSP, bloqueo de marcos, nosniff, referrer-policy, permisos limitados; sin fuentes remotas, analítica ni scripts externos.

## Verificación

Compilación de producción correcta y auditoría npm sin vulnerabilidades conocidas reportadas. Esto no prueba ausencia absoluta de fallos.

Seis pruebas de lógica cubren recurrencias, fecha local nocturna, suspensión del temporizador, compatibilidad de respaldos y rechazo de datos inválidos. Las pruebas de navegador cubren creación y persistencia, exportación/restauración, navegación móvil, recarga sin conexión, protección de datos corruptos, duración bloqueada y registro único. También se comprueban CSP en vista previa, madrugada/fecha única, importación inválida sin pérdida y pantallas estrechas.

Se usa Edge/Chromium con tamaños de teléfono. Safari/iOS, instalación y suspensión real del sistema requieren comprobarse en el teléfono. No se realizó pentest externo ni verificación de un despliegue público porque aún no se publicó.

## Límites conservados

Sin sincronización, cifrado del respaldo, cuentas, alarmas del sistema ni edición directa. El temporizador se reinicia al cerrar/recargar. Los bloques superpuestos siguen disponibles en la lista aunque se superpongan en el gráfico. El respaldo manual es necesario para recuperar datos si el navegador o el teléfono los pierde.

## Actualización Supabase — 9 de septiembre de 2026

Se incorporaron correo/contraseña, acceso restringido mediante lista de miembros y RLS, copia local por usuario, guardado automático con versiones, reintentos al reconectar, exportación de ambas copias en conflictos y migración explícita de la agenda local. Los datos de diferentes cuentas no se mezclan. Cerrar sesión oculta la agenda de la cuenta y conserva su copia local; no cifra ni borra ese almacenamiento.

Se amplió la política CSP para permitir solo el proyecto Supabase configurado, se rechazan claves secretas en la configuración pública y se limitaron a 15 segundos las solicitudes de red. Se añadió CI de GitHub y documentación para instalar el esquema y autorizar la cuenta. La configuración real y la publicación están pendientes.

Las pruebas de permisos ejecutan el SQL en PostgreSQL mediante PGlite: acceso anónimo denegado, usuario no autorizado denegado, aislamiento entre usuarios y control de revisión concurrente. Las pruebas del navegador simulan las respuestas de Supabase; no demuestran por sí solas que un proyecto remoto esté correctamente configurado. El modo local original sigue disponible.

Las menciones anteriores a una aplicación sin nube describen la versión inicial. Esta actualización envía la agenda a Supabase cuando el usuario inicia sesión y hay configuración válida. La versión gratuita no garantiza continuidad; se conserva la copia local y se indican cambios pendientes. No se implementó Google OAuth ni recuperación de contraseña por correo.

Resultado de la actualización: 18 pruebas de lógica/permisos SQL y 6 pruebas de navegador aprobadas (24 casos); compilación de producción correcta y auditoría npm sin vulnerabilidades conocidas reportadas. Los casos de nube se probaron con respuestas simuladas, y las políticas se ejecutaron en PostgreSQL local; queda pendiente la verificación contra tu Supabase real.
