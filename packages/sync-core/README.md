# `@wcpos/sync-core`

PORTED-FROM: woo-rxdb-replication-lab@c081086

Shared synchronization contracts and runtime primitives for WCPOS.

## Using it outside the monorepo

Install from GitHub Packages with this line in your `.npmrc` and a token with
`read:packages` access:

```ini
@wcpos:registry=https://npm.pkg.github.com
```

The package has no runtime dependencies. The `@wcpos/sync-core/testing` entry
imports JSON with `with { type: 'json' }`, so plain Node needs 20.10+ (or 18.20+).
The main entry has no JSON imports.

It is published in lockstep with `@wcpos/sync-engine` by
[`.github/workflows/publish-sync-packages.yml`](../../.github/workflows/publish-sync-packages.yml):
manual dispatch publishes `<base>-next.<run>.g<sha7>` on dist-tag `next`, and a
`sync-packages-v<version>` tag publishes that version.
