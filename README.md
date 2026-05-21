# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## Facturacion ARCA local

La emision de comprobantes ARCA/AFIP se ejecuta desde el backend Node en
`server/`, usando el SDK oficial `@afipsdk/afip.js`.

1. Configurar `server/.env` a partir de `server/.env.example`.
2. Usar `AFIPSDK_ENV=dev` para homologacion.
3. Configurar `SUPABASE_SERVICE_ROLE_KEY` para que el backend pueda registrar
   la factura en `arca_invoices` antes de emitir.
4. Iniciar el backend:

```bash
npm run arca
```

5. Iniciar el frontend en otra terminal:

```bash
npm run dev
```

El frontend usa `VITE_ARCA_API_URL` si esta definida; si no, llama a
`http://localhost:3001`.

Por defecto el backend no emite si antes no puede insertar el registro
`procesando` en Supabase. Solo para diagnostico local se puede habilitar
`ARCA_ALLOW_EMIT_WITHOUT_DB=true`.

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
