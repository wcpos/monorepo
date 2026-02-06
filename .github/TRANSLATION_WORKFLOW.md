# Translation Workflow: Pushing English Strings

Each repo that has translatable JS/TS strings needs a workflow to push its English locale files to the `wcpos/translations` repo.

## How it works

1. You maintain English locale files in your repo as flat JSON: `{ "symbolic.key": "English string" }`
2. When those files change on `main`, a workflow copies them to an orphan `translations-source` branch
3. The workflow dispatches an `update-js-strings` event to `wcpos/translations`, which picks up the files

## Source file format

The locale files are the source of truth. They should look like this:

```json
{
  "auth.connect": "Connect",
  "auth.enter_demo_store": "Enter Demo Store",
  "common.add_to_cart": "Add to Cart",
  "common.product_found_locally_one": "{count} product found locally",
  "common.product_found_locally_other": "{count} products found locally"
}
```

- Keys are symbolic (e.g. `namespace.descriptive_name`), not raw English strings
- Values are the English text, with `{interpolation}` placeholders where needed
- i18next plural suffixes (`_one`, `_other`, etc.) go directly in the keys

## Workflow template

Create `.github/workflows/push-js-strings.yml` in your repo:

```yaml
name: Push JS Strings to Translations

on:
  push:
    branches:
      - main
    paths:
      # Update these to your English locale file paths
      - 'src/locales/en/my-namespace.json'
  workflow_dispatch:
    inputs:
      force:
        description: 'Push even if strings have not changed'
        required: false
        default: false
        type: boolean

jobs:
  push-and-dispatch:
    permissions:
      contents: write
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Push to translations-source branch
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

          # Update these to your English locale file paths
          mkdir -p /tmp/translations-out
          cp src/locales/en/my-namespace.json /tmp/translations-out/

          git checkout --orphan translations-source
          git rm -rf .
          cp /tmp/translations-out/*.json .
          git add .
          git commit -m "translation source strings from ${{ github.sha }}"
          git push -f origin translations-source

          git checkout ${{ github.sha }} -- .github

      - name: Generate GitHub App token
        id: app-token
        uses: actions/create-github-app-token@v2
        with:
          app-id: ${{ secrets.TRANSLATION_APP_ID }}
          private-key: ${{ secrets.TRANSLATION_APP_PRIVATE_KEY }}
          owner: wcpos
          repositories: translations

      - name: Notify translations repo
        run: |
          gh api repos/wcpos/translations/dispatches \
            -f event_type=update-js-strings \
            -f "client_payload[repo_name]=${{ github.event.repository.name }}" \
            -f "client_payload[ref]=translations-source" \
            -f "client_payload[force]=${{ inputs.force || 'false' }}"
        env:
          GH_TOKEN: ${{ steps.app-token.outputs.token }}
```

## Required secrets

Your repo needs these secrets configured:

- `TRANSLATION_APP_ID` - GitHub App ID for the translation bot
- `TRANSLATION_APP_PRIVATE_KEY` - Private key for the translation bot

## What to customize

1. **`paths` trigger** - Point to your English locale file(s)
2. **`cp` commands** - Copy your locale files to `/tmp/translations-out/`
3. **Namespace filenames** - Use names that won't collide with other repos (e.g. `electron.json`, `core.json`)

## No extraction needed

The English locale files are pushed directly. There's no build step, no `pnpm install`, no extraction script. Just `checkout` and `cp`.
