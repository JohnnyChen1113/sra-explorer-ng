# Scheduled Updates Recipe

Use this recipe when a project needs daily or hourly metadata refresh, such as latest releases, public pricing, model lists, or external status.

Recommended structure:

```text
scripts/check-upstream.mjs
.github/workflows/check-upstream.yml
src/features/<feature>/metadata.json
```

Workflow pattern:

```yaml
name: Check Upstream

on:
  schedule:
    - cron: '0 18 * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node scripts/check-upstream.mjs
      - run: |
          if git diff --quiet -- src/features/<feature>/metadata.json; then
            echo "No changes."
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add src/features/<feature>/metadata.json
          git commit -m "chore: update upstream metadata"
          git push
```

Keep the actual upstream URL, auth, and data shape in the derived project.
