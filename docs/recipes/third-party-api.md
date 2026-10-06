# Third-party API Recipe

Use this recipe when a project needs to wrap a third-party API, payment page, key service, license service, or other external backend.

Recommended structure:

```text
src/features/<service-name>/
  widget.tsx
  copy.ts
src/lib/<service-name>.ts
src/routes/api/<service-name>/
  config.ts
  action.ts
```

Rules:

- Keep secrets in Cloudflare Worker vars or `.env.*`, never in client code.
- Public pages should call local `/api/...` routes, not the third-party API directly.
- Do not save user keys unless the product explicitly needs accounts and storage.
- Return a stable JSON shape from internal API routes: `{ ok, data, message }`.
- Document external API assumptions in this folder for future sessions.

Placeholder API examples already exist:

```text
src/routes/api/health.ts
src/routes/api/config.ts
```
