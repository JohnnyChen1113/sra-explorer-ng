# Downloads Recipe

Use this recipe when a project needs a download section for desktop apps, documents, datasets, or release assets.

Recommended structure:

```text
src/features/downloads/
  downloads-panel.tsx
  release-metadata.json
src/lib/releases.ts
src/routes/api/releases/latest.ts
```

Suggested behavior:

- Render the latest cached metadata from `release-metadata.json`.
- Try a live upstream request from `/api/releases/latest` when freshness matters.
- Keep a fallback JSON file so the public page still works when the upstream API is unavailable.
- Include version, publish date, asset name, size, download URL, and checksum when available.

Do not hard-code a specific project's GitHub repository in this template. Add that in the derived project.
