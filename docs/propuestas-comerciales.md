# Propuestas comerciales internas

## Acceso

El modulo `Propuestas` es una herramienta interna. Solo aparece en el sidebar cuando `canAccessInternalTools(currentUser)` devuelve `true`.

Usuarios autorizados:

- `francomarquetti@gmail.com`
- Usuarios con rol/perfil que incluya `admin` o `administrador`

El usuario demo `user@mail.com` no debe ver este modulo. Si un usuario no autorizado intenta entrar manualmente, la pantalla muestra `Acceso restringido`.

## Cargar propuesta CEDIM

1. Ingresar con un usuario interno autorizado.
2. Abrir `Administracion > Propuestas`.
3. Presionar `Cargar propuesta CEDIM completa`.
4. Revisar URL demo y contrasena demo antes de generar el PDF.

No guardar contrasenas reales en el repositorio ni en archivos `.env` versionados.

## Actualizar capturas

Las capturas se generan con Playwright usando usuario demo para evitar datos sensibles reales.

1. Ejecutar la app local:

```bash
npm run dev
```

2. Configurar variables de entorno si hace falta:

```bash
PROPOSAL_CAPTURE_URL=http://localhost:5173
PROPOSAL_CAPTURE_EMAIL=user@mail.com
PROPOSAL_CAPTURE_PASSWORD=...
PROPOSAL_CAPTURE_OUTPUT=public/proposal-screenshots
```

3. Ejecutar capturas:

```bash
npm run capture:proposal
```

Si es la primera vez en la maquina, instalar Chromium:

```bash
npx playwright install chromium
```

## Generar PDF

1. Abrir el modulo interno.
2. Cargar o editar datos comerciales.
3. Seleccionar y ordenar modulos incluidos.
4. Verificar la vista previa.
5. Presionar `Generar PDF`.

El PDF se genera aunque no existan capturas. En ese caso muestra `Captura no disponible`.

## Catalogo funcional

El alcance automatico esta centralizado en:

```text
src/data/systemModulesCatalog.js
```

Cada modulo define titulo, grupo, ruta interna, descripcion, valor comercial, funcionalidades, flujo, integraciones y clave de captura.

## Capturas

Las imagenes se guardan en:

```text
public/proposal-screenshots/
```

El manifest queda en:

```text
public/proposal-screenshots/manifest.json
```

## Ocultar a clientes

No agregar permisos de `propuestasComerciales` a clientes ni usuarios demo. Mantener el item con `internalOnly: true` en el sidebar y la validacion de acceso dentro de `PropuestasComerciales.jsx`.
