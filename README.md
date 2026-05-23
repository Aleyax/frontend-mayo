# Frontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.4.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Authorization Frontend (Roles & Permissions)

The project now includes a first permission layer in frontend:

- `src/app/auth/permission-catalog.ts`: base role-permission matrix.
- `src/app/auth/permission.service.ts`: reusable permission checks (`can`, `canAny`, `canAll`).
- `src/app/auth/permission.guard.ts`: route-level guard using `data.permission`.
- `src/app/admin/pages/forbidden-page/*`: `403` page for unauthorized access.
- `src/app/admin/pages/role-management-page/*`: initial UI for role management.

Main protected routes are defined in:

- `src/app/admin/admin-dashboard.routes.ts`
- `src/app/order/order.routes.ts`

Example route metadata:

```ts
{
  path: 'roles',
  canActivate: [PermissionGuard],
  data: { permission: 'roles.view' }
}
```

## CSS Conventions (Component Style Budgets)

To keep Angular `anyComponentStyle` budgets under control and avoid large single CSS files, use segmented stylesheets per component.

- Keep each component stylesheet file below `8kB` (production warning threshold in `angular.json`).
- Prefer semantic names over numeric parts.
- Keep the order in `styleUrls` stable (from base layout to overrides), because cascade order matters.

Recommended naming pattern:

- `<component>.base-*.css` or `<component>.layout-*.css` for structure/layout.
- `<component>.cart.css`, `<component>.items-actions.css`, etc. for feature sections.
- `<component>.theme-overrides.css` for theme-specific tweaks (`:host-context(...)`, color overrides).
- `<component>.print.css` for print/document views when needed.
- `<component>.drawer-responsive.css` (or similar) for responsive/media-query heavy sections.

Current examples in the codebase:

- `src/app/order/components/pos.component.*.css`
- `src/app/order/components/order-detail.component.*.css`
- `src/app/order/components/picking-board.component.*.css`
- `src/app/store/pages/product-detail/product-detail.component.*.css`

When editing styles:

1. Update the most specific segmented file (do not create a new large monolithic CSS file).
2. If a section grows too much, split it again by concern and update `styleUrls`.
3. Run `ng build` to verify budgets remain healthy.
