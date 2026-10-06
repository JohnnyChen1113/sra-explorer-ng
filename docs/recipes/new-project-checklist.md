# New Project Checklist

1. Replace app metadata in `.env.development`, `.env.production`, and `wrangler.jsonc`.
2. Replace `src/config/site.ts`.
3. Replace `src/features/landing/copy.ts`.
4. Replace `public/logo.svg` and `public/favicon.svg`.
5. Add project-specific features under `src/features/<feature-name>/`.
6. Add internal API routes under `src/routes/api/<feature-name>/`.
7. Run `pnpm build` and `pnpm cf:build`.
8. Deploy to a staging Worker first.
9. Bind production domains only after smoke testing.
