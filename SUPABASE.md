# Activar Supabase gratis

## 1. Crear el proyecto

En [Supabase](https://supabase.com/dashboard), crea una organización **Free** y un proyecto para Momentum. Conserva la contraseña de base de datos en privado; no se usa en la aplicación. No selecciones Pro ni complementos de pago.

La cuota publicada incluye 500 MB de base de datos y 5 GB de transferencia. Los proyectos con poca actividad pueden pausarse durante un período de siete días; se reactivan desde el panel. Para una agenda personal, el volumen esperado es pequeño, pero no se promete disponibilidad continua ni gratuidad perpetua. [Precios](https://supabase.com/pricing) · [Pausas](https://supabase.com/docs/guides/platform/free-project-pausing).

## 2. Crear las tablas y aplicar seguridad

Abre **SQL Editor** y ejecuta el contenido completo de `supabase/migrations/202609090001_momentum.sql`, una sola vez. No desactives RLS ni utilices políticas abiertas de prueba.

Las tablas solo permiten a cada usuario autorizado leer y guardar su fila. El navegador no puede crear miembros ni eliminar directamente registros. Las actualizaciones comprueban una versión previa para detectar cambios concurrentes.

## 3. Crear tu única cuenta autorizada

En **Authentication → Users**, añade tu usuario con correo y una contraseña fuerte, usando confirmación automática del correo para este usuario creado por ti. Desactiva **Allow new users to sign up** en la configuración de autenticación. La interfaz no ofrece registro público.

Copia el UUID de ese usuario y ejecuta en SQL Editor, reemplazando el ejemplo:

```sql
insert into public.momentum_members (user_id)
values ('REEMPLAZAR_POR_EL_UUID_DEL_USUARIO')
on conflict do nothing;
```

Solo el propietario del proyecto debe ejecutar esto. Crear el usuario de Auth sin añadirlo a miembros permite iniciar sesión, pero no acceder a la base de datos de la agenda. Esta separación es deliberada.

Guarda la contraseña en tu gestor de contraseñas. Esta versión usa correo/contraseña y no integra Google ni correos de recuperación. Si necesitas recuperar acceso, gestiona el usuario mediante las herramientas administrativas de Supabase; no publiques una clave administrativa para hacerlo desde el navegador.

## 4. Configurar la aplicación

En la configuración de API del proyecto copia **Project URL** y la clave **Publishable** (`sb_publishable_...`). Son datos públicos de conexión, no credenciales administrativas. Los permisos reales están en RLS y la lista de miembros.

Copia `.env.example` a `.env.local` y reemplaza los valores:

```dotenv
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE_PUBLICA
```

Nunca uses `service_role`, `sb_secret_...` ni la contraseña de base de datos. La compilación rechaza claves que no sean publishable. `.env.local` se excluye de Git, aunque estos dos valores terminan necesariamente en el JavaScript público de la aplicación.

Ejecuta `npm run build`. Los encabezados de seguridad permiten conexiones únicamente al proyecto configurado. Cambiar variables requiere volver a compilar y desplegar.

## 5. Comprobar el servicio real

1. Inicia sesión con tu cuenta autorizada.
2. Crea un hábito y espera **Sincronizado con Supabase**.
3. Abre la misma aplicación en otro navegador, inicia sesión y comprueba el hábito.
4. En el teléfono, desconecta internet, crea otra tarea y recarga: debe permanecer. Reconecta y comprueba la sincronización.
5. Exporta un respaldo antes de probar conflictos o restauraciones.

Si la nube no está disponible, comprueba conexión, vigencia de sesión, tablas, pertenencia a `momentum_members` y que el proyecto no esté pausado. Los datos locales no se borran por ese error.

Referencias: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [cliente JavaScript](https://supabase.com/docs/reference/javascript/introduction).
