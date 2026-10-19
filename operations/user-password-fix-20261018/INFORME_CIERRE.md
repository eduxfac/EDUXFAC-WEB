# Cierre de corrección — Modificación de contraseña de usuarios

**Proyecto:** EDUXFAC WEB  
**Fecha de cierre:** 18 de octubre de 2026  
**Estado:** CERRADO — VALIDADO EN PRODUCCIÓN

## Alcance

Se corrigió exclusivamente el comportamiento del botón **Modificar contraseña** en la edición de usuarios. La causa era la ejecución duplicada del cambio de estado del formulario: el botón tenía simultáneamente un manejador directo y un manejador delegado, por lo que los campos de nueva contraseña se abrían y cerraban en el mismo clic.

La corrección eliminó el manejador delegado duplicado y conservó el manejador directo existente.

## Archivo productivo modificado

El único archivo productivo modificado fue:

`web/public/index.html`

Hash SHA-256 activo después del despliegue:

`12eadca887ac3c97e1f1e5b3b53b960b3a941cf611578113a32839f91d707ce9`

No se modificó ningún otro archivo productivo.

## Validación en producción

La modificación de contraseña fue validada exitosamente en producción con el usuario de prueba **VENDEDOR PRUEBA**:

- El formulario permitió establecer una contraseña nueva.
- La contraseña anterior dejó de permitir el inicio de sesión.
- La contraseña nueva permitió iniciar sesión correctamente.
- El sitio `https://app.eduxfac.com/` quedó operativo después de la validación.

## Base de datos

No hubo modificación directa de la base de datos durante la corrección ni durante el despliegue. No se ejecutaron cambios de esquema, migraciones, reconstrucciones ni operaciones manuales sobre la BD. La validación de **VENDEDOR PRUEBA** se realizó exclusivamente mediante el flujo normal de la aplicación.

## Resultado final

La incidencia de modificación de contraseña de usuarios queda cerrada y validada en producción. No se realizaron cambios funcionales adicionales ni modificaciones en otros módulos.
