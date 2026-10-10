# Catalogue search scale — measured 2026-09-16

Source checkout: `eb47d3ac68` plus `packages/database/src/catalogue-search-scale.bench.test.ts`.
Command (from worktree root; suite run alone):

```sh
CATALOGUE_SCALE_BENCH=1 PROBE_ROWS=2000,20000 PROBE_STORAGE=memory,fs \
PROBE_PROGRESS="$PWD/.claude/research/2026-09-16-search-scan-scale/bench-output.md" \
NODE_OPTIONS="--max-old-space-size=6144 --expose-gc" \
pnpm --filter @wcpos/database exec jest --maxWorkers=1 --coverage=false catalogue-search-scale
```

The spec's `test -- --...` invocation passes a literal `--` to Jest in this workspace, so the flags became test-name patterns and coverage was not disabled. The direct `exec jest` invocation above applies the intended flags. No dependency installation or configuration change was made.

The initial full run found the rare-query mismatch at 20,000 rows on both storages and stopped before printing tables. The final benchmark defers the hit-set assertion until after each table; the complete rerun below preserves that failure.

Catalogue bench: node=v24.14.0; platform=darwin/arm64; words=324; gc=true.
allowSlowCount=true; case-sensitive regex on folded columns (no $options). One warm-up, five measured runs; RxQuery cache evicted each run; storage/OS and RxDocument caches remain warm.
Index find includes document materialisation; C materialisation is warm findByIds, not cold disk IO. No public collection.closeSearch: index remains resident until db.remove(). Row bytes below mean JSON.stringify(stored doc).length (UTF-16 units); UTF-8 bytes also reported.

## memory

N=2000: seeding products + sidecar
N=2000: building production FlexSearch index
N=2000: seed=461.21 ms; build=144.24 ms; heap delta=34.19 MB; avg row bytes=2004.99; avg UTF-8 bytes=2021.54; dir bytes after seed=0; split={}
N=2000: measuring common (cotton)
N=2000: measuring midword (saippua)
N=2000: measuring rare (01234-)
N=2000: measuring two-terms (cotton linen)
N=20000: seeding products + sidecar
N=20000: building production FlexSearch index
N=20000: seed=4561.00 ms; build=1184.92 ms; heap delta=221.27 MB; avg row bytes=2014.52; avg UTF-8 bytes=2030.98; dir bytes after seed=0; split={}
N=20000: measuring common (cotton)
N=20000: measuring midword (saippua)
N=20000: measuring rare (01234-)
Mismatch 20000/rare/A index full: only actual=["product-012340","product-012341","product-012342","product-012343","product-012344","product-012345","product-012346","product-012347","product-012348","product-012349"]; only expected=[]
Mismatch 20000/rare/A index full: only actual=["product-012340","product-012341","product-012342","product-012343","product-012344","product-012345","product-012346","product-012347","product-012348","product-012349"]; only expected=[]
Mismatch 20000/rare/A index full: only actual=["product-012340","product-012341","product-012342","product-012343","product-012344","product-012345","product-012346","product-012347","product-012348","product-012349"]; only expected=[]
Mismatch 20000/rare/A index full: only actual=["product-012340","product-012341","product-012342","product-012343","product-012344","product-012345","product-012346","product-012347","product-012348","product-012349"]; only expected=[]
Mismatch 20000/rare/A index full: only actual=["product-012340","product-012341","product-012342","product-012343","product-012344","product-012345","product-012346","product-012347","product-012348","product-012349"]; only expected=[]
Mismatch 20000/rare/A index full: only actual=["product-012340","product-012341","product-012342","product-012343","product-012344","product-012345","product-012346","product-012347","product-012348","product-012349"]; only expected=[]
N=20000: measuring two-terms (cotton linen)

| N | path | query | hits | median ms | max ms |
| ---: | --- | --- | ---: | ---: | ---: |
| 2000 | A index full | common: cotton | 176 | 0.11 | 0.12 |
| 2000 | B inline page | common: cotton | 20 | 0.89 | 0.90 |
| 2000 | B inline full | common: cotton | 176 | 5.41 | 5.45 |
| 2000 | B inline count | common: cotton | 176 | 5.61 | 5.77 |
| 2000 | C sidecar page | common: cotton | 20 | 0.27 | 0.30 |
| 2000 | C sidecar full | common: cotton | 176 | 1.50 | 2.24 |
| 2000 | C materialise page | common: cotton | 20 | 0.01 | 0.01 |
| 2000 | A index full | midword: saippua | 16 | 0.02 | 0.03 |
| 2000 | B inline page | midword: saippua | 16 | 5.57 | 5.78 |
| 2000 | B inline full | midword: saippua | 16 | 5.63 | 5.83 |
| 2000 | B inline count | midword: saippua | 16 | 5.47 | 5.57 |
| 2000 | C sidecar page | midword: saippua | 16 | 1.50 | 1.55 |
| 2000 | C sidecar full | midword: saippua | 16 | 1.54 | 1.59 |
| 2000 | C materialise page | midword: saippua | 16 | 0.01 | 0.01 |
| 2000 | A index full | rare: 01234- | 1 | 0.01 | 0.01 |
| 2000 | B inline page | rare: 01234- | 1 | 5.82 | 5.89 |
| 2000 | B inline full | rare: 01234- | 1 | 5.64 | 5.65 |
| 2000 | B inline count | rare: 01234- | 1 | 5.76 | 5.94 |
| 2000 | C sidecar page | rare: 01234- | 1 | 1.61 | 1.87 |
| 2000 | C sidecar full | rare: 01234- | 1 | 1.66 | 1.68 |
| 2000 | C materialise page | rare: 01234- | 1 | 0.00 | 0.01 |
| 2000 | A index full | two-terms: cotton linen | 73 | 0.05 | 0.06 |
| 2000 | B inline page | two-terms: cotton linen | 20 | 2.04 | 2.05 |
| 2000 | B inline full | two-terms: cotton linen | 73 | 6.58 | 6.59 |
| 2000 | B inline count | two-terms: cotton linen | 73 | 5.52 | 5.59 |
| 2000 | C sidecar page | two-terms: cotton linen | 20 | 0.53 | 0.55 |
| 2000 | C sidecar full | two-terms: cotton linen | 73 | 1.71 | 1.73 |
| 2000 | C materialise page | two-terms: cotton linen | 20 | 0.01 | 0.01 |
| 20000 | A index full | common: cotton | 1622 | 0.59 | 0.61 |
| 20000 | B inline page | common: cotton | 20 | 0.86 | 0.90 |
| 20000 | B inline full | common: cotton | 1622 | 61.85 | 64.52 |
| 20000 | B inline count | common: cotton | 1622 | 62.80 | 63.54 |
| 20000 | C sidecar page | common: cotton | 20 | 0.26 | 0.28 |
| 20000 | C sidecar full | common: cotton | 1622 | 15.89 | 17.10 |
| 20000 | C materialise page | common: cotton | 20 | 0.01 | 0.01 |
| 20000 | A index full | midword: saippua | 202 | 0.08 | 0.10 |
| 20000 | B inline page | midword: saippua | 20 | 7.39 | 7.69 |
| 20000 | B inline full | midword: saippua | 202 | 63.46 | 63.89 |
| 20000 | B inline count | midword: saippua | 202 | 65.87 | 66.54 |
| 20000 | C sidecar page | midword: saippua | 20 | 1.82 | 1.84 |
| 20000 | C sidecar full | midword: saippua | 202 | 15.02 | 15.28 |
| 20000 | C materialise page | midword: saippua | 20 | 0.01 | 0.01 |
| 20000 | A index full | rare: 01234- | 11 | 0.01 | 0.02 |
| 20000 | B inline page | rare: 01234- | 1 | 64.48 | 65.36 |
| 20000 | B inline full | rare: 01234- | 1 | 63.81 | 64.36 |
| 20000 | B inline count | rare: 01234- | 1 | 67.76 | 67.94 |
| 20000 | C sidecar page | rare: 01234- | 1 | 15.95 | 16.18 |
| 20000 | C sidecar full | rare: 01234- | 1 | 15.67 | 16.25 |
| 20000 | C materialise page | rare: 01234- | 1 | 0.00 | 0.01 |
| 20000 | A index full | two-terms: cotton linen | 548 | 0.26 | 0.28 |
| 20000 | B inline page | two-terms: cotton linen | 20 | 1.89 | 1.91 |
| 20000 | B inline full | two-terms: cotton linen | 548 | 63.31 | 63.33 |
| 20000 | B inline count | two-terms: cotton linen | 548 | 66.55 | 66.72 |
| 20000 | C sidecar page | two-terms: cotton linen | 20 | 0.55 | 0.58 |
| 20000 | C sidecar full | two-terms: cotton linen | 548 | 15.67 | 16.31 |
| 20000 | C materialise page | two-terms: cotton linen | 20 | 0.01 | 0.01 |


## fs

N=2000: seeding products + sidecar
N=2000: building production FlexSearch index
N=2000: seed=476.36 ms; build=203.21 ms; heap delta=28.03 MB; avg row bytes=2004.99; avg UTF-8 bytes=2021.54; dir bytes after seed=6013002; split={"_rxdb_internal-0":4414,"productSearch-0":1154517,"products-0":4854071}
N=2000: measuring common (cotton)
N=2000: measuring midword (saippua)
N=2000: measuring rare (01234-)
N=2000: measuring two-terms (cotton linen)
N=20000: seeding products + sidecar
N=20000: building production FlexSearch index
N=20000: seed=4847.65 ms; build=1928.50 ms; heap delta=327.79 MB; avg row bytes=2014.52; avg UTF-8 bytes=2030.98; dir bytes after seed=64683089; split={"_rxdb_internal-0":4414,"productSearch-0":13736126,"products-0":50942549}
N=20000: measuring common (cotton)
Mismatch 20000/common/C sidecar page: only actual=["product-002002","product-002008","product-002009","product-002012","product-002027","product-002048","product-002084","product-002088","product-002111","product-002115","product-002123","product-002128","product-002148","product-002179","product-002180","product-002181","product-002193","product-002198","product-002202","product-002206"]; only expected=["product-000011","product-000055","product-000079","product-000094","product-000103","product-000111","product-000112","product-000122","product-000139","product-000167","product-000174","product-000176","product-000199","product-000201","product-000214","product-000216","product-000238","product-000240","product-000264","product-000275"]
N=20000: measuring midword (saippua)
N=20000: measuring rare (01234-)
Mismatch 20000/rare/A index full: only actual=["product-012340","product-012341","product-012342","product-012343","product-012344","product-012345","product-012346","product-012347","product-012348","product-012349"]; only expected=[]
Mismatch 20000/rare/A index full: only actual=["product-012340","product-012341","product-012342","product-012343","product-012344","product-012345","product-012346","product-012347","product-012348","product-012349"]; only expected=[]
Mismatch 20000/rare/A index full: only actual=["product-012340","product-012341","product-012342","product-012343","product-012344","product-012345","product-012346","product-012347","product-012348","product-012349"]; only expected=[]
Mismatch 20000/rare/A index full: only actual=["product-012340","product-012341","product-012342","product-012343","product-012344","product-012345","product-012346","product-012347","product-012348","product-012349"]; only expected=[]
Mismatch 20000/rare/A index full: only actual=["product-012340","product-012341","product-012342","product-012343","product-012344","product-012345","product-012346","product-012347","product-012348","product-012349"]; only expected=[]
Mismatch 20000/rare/A index full: only actual=["product-012340","product-012341","product-012342","product-012343","product-012344","product-012345","product-012346","product-012347","product-012348","product-012349"]; only expected=[]
N=20000: measuring two-terms (cotton linen)

| N | path | query | hits | median ms | max ms |
| ---: | --- | --- | ---: | ---: | ---: |
| 2000 | A index full | common: cotton | 176 | 0.08 | 0.09 |
| 2000 | B inline page | common: cotton | 20 | 11.89 | 12.57 |
| 2000 | B inline full | common: cotton | 176 | 11.97 | 12.95 |
| 2000 | B inline count | common: cotton | 176 | 12.22 | 13.29 |
| 2000 | C sidecar page | common: cotton | 20 | 2.26 | 2.39 |
| 2000 | C sidecar full | common: cotton | 176 | 2.28 | 2.98 |
| 2000 | C materialise page | common: cotton | 20 | 0.01 | 0.01 |
| 2000 | A index full | midword: saippua | 16 | 0.01 | 0.02 |
| 2000 | B inline page | midword: saippua | 16 | 12.18 | 12.86 |
| 2000 | B inline full | midword: saippua | 16 | 12.40 | 12.96 |
| 2000 | B inline count | midword: saippua | 16 | 12.04 | 12.80 |
| 2000 | C sidecar page | midword: saippua | 16 | 2.25 | 2.28 |
| 2000 | C sidecar full | midword: saippua | 16 | 2.25 | 2.79 |
| 2000 | C materialise page | midword: saippua | 16 | 0.01 | 0.01 |
| 2000 | A index full | rare: 01234- | 1 | 0.01 | 0.01 |
| 2000 | B inline page | rare: 01234- | 1 | 12.31 | 12.52 |
| 2000 | B inline full | rare: 01234- | 1 | 12.26 | 12.86 |
| 2000 | B inline count | rare: 01234- | 1 | 12.38 | 13.02 |
| 2000 | C sidecar page | rare: 01234- | 1 | 2.36 | 2.38 |
| 2000 | C sidecar full | rare: 01234- | 1 | 2.35 | 2.82 |
| 2000 | C materialise page | rare: 01234- | 1 | 0.00 | 0.00 |
| 2000 | A index full | two-terms: cotton linen | 73 | 0.04 | 0.06 |
| 2000 | B inline page | two-terms: cotton linen | 20 | 12.42 | 13.28 |
| 2000 | B inline full | two-terms: cotton linen | 73 | 12.42 | 13.26 |
| 2000 | B inline count | two-terms: cotton linen | 73 | 12.30 | 12.83 |
| 2000 | C sidecar page | two-terms: cotton linen | 20 | 2.32 | 2.35 |
| 2000 | C sidecar full | two-terms: cotton linen | 73 | 2.34 | 2.78 |
| 2000 | C materialise page | two-terms: cotton linen | 20 | 0.01 | 0.01 |
| 20000 | A index full | common: cotton | 1622 | 0.51 | 0.55 |
| 20000 | B inline page | common: cotton | 20 | 272.71 | 282.76 |
| 20000 | B inline full | common: cotton | 1622 | 265.85 | 284.28 |
| 20000 | B inline count | common: cotton | 1622 | 253.57 | 255.80 |
| 20000 | C sidecar page | common: cotton | 20 | 26.07 | 29.95 |
| 20000 | C sidecar full | common: cotton | 1622 | 27.11 | 27.47 |
| 20000 | C materialise page | common: cotton | 20 | 0.01 | 0.02 |
| 20000 | A index full | midword: saippua | 202 | 0.08 | 0.09 |
| 20000 | B inline page | midword: saippua | 20 | 263.87 | 285.63 |
| 20000 | B inline full | midword: saippua | 202 | 273.35 | 277.24 |
| 20000 | B inline count | midword: saippua | 202 | 259.05 | 274.78 |
| 20000 | C sidecar page | midword: saippua | 20 | 26.40 | 30.35 |
| 20000 | C sidecar full | midword: saippua | 202 | 26.48 | 27.01 |
| 20000 | C materialise page | midword: saippua | 20 | 0.01 | 0.02 |
| 20000 | A index full | rare: 01234- | 11 | 0.02 | 0.02 |
| 20000 | B inline page | rare: 01234- | 1 | 262.93 | 266.53 |
| 20000 | B inline full | rare: 01234- | 1 | 283.69 | 296.86 |
| 20000 | B inline count | rare: 01234- | 1 | 262.82 | 278.99 |
| 20000 | C sidecar page | rare: 01234- | 1 | 27.56 | 30.40 |
| 20000 | C sidecar full | rare: 01234- | 1 | 26.59 | 27.80 |
| 20000 | C materialise page | rare: 01234- | 1 | 0.00 | 0.01 |
| 20000 | A index full | two-terms: cotton linen | 548 | 0.22 | 0.25 |
| 20000 | B inline page | two-terms: cotton linen | 20 | 273.22 | 276.69 |
| 20000 | B inline full | two-terms: cotton linen | 548 | 274.68 | 276.71 |
| 20000 | B inline count | two-terms: cotton linen | 548 | 261.29 | 276.72 |
| 20000 | C sidecar page | two-terms: cotton linen | 20 | 28.49 | 30.66 |
| 20000 | C sidecar full | two-terms: cotton linen | 548 | 27.44 | 28.30 |
| 20000 | C materialise page | two-terms: cotton linen | 20 | 0.01 | 0.02 |

## Validation and findings

- **Observed PASS:** 2,000 rows, both storages, final benchmark source: 2 tests passed (exit 0).
- **Observed FAIL:** complete 2,000/20,000 matrix: all 112 timing rows printed; 2 tests failed on hit-set comparisons (exit 1, 41.916 seconds). No timing thresholds were asserted.
- **Observed PASS:** `pnpm --filter @wcpos/database exec eslint src/catalogue-search-scale.bench.test.ts` (exit 0).
- **Observed PASS:** `env -u CATALOGUE_SCALE_BENCH pnpm --filter @wcpos/database exec jest --maxWorkers=1 --coverage=false catalogue-search-scale`: 1 suite / 2 tests skipped (exit 0).
- **Observed:** benchmark source is exactly 340 lines. No production files, dependencies or configuration were changed. The pre-existing `.codex-bench.log` was not edited.

### Hit-set findings

1. **Observed on both storages at 20,000 rows:** rare term `01234-` returns 11 index hits versus 1 inline/sidecar hit. Both scans return `product-001234`; the index additionally returns `product-012340` through `product-012349`. All six executions (warm-up plus five measured) reproduce it. Direct execution of the existing `encodeSearchText('01234-')` returned `["01234"]`; the folded-column regex keeps the hyphen literal. These timings do **not** establish semantic equivalence.
2. **Observed on filesystem storage at 20,000 rows:** the sidecar common-query page warm-up returned a different 20-ID page than the first 20 sorted inline full-result IDs. The differing IDs are printed above. The five measured executions and full-result sets matched. **Unverified:** the cause of this one page/order discrepancy; no production change or retry was added.
3. All other full-result comparisons matched: common hits 176 / 1,622; midword hits 16 / 202; two-term hits 73 / 548 (2,000 / 20,000 rows).

### Harness caveats / accepted risks

- RxQuery result caches are evicted before each execution so timed scans reach storage. RxDocument caches, filesystem caches and OS caches are not flushed. Sidecar page materialisation is therefore a warm-cache measurement, not a claim about cold IO.
- The production search plugin has no public collection-level close method; its index remains resident during the scan measurements until database removal. Heap deltas are process-level build deltas, not an isolated deep-size accounting of FlexSearch.
- The installed filesystem implementation emitted internal-store index-rebuild warnings during `db.remove()` (`stale-changelog-op:D:index-1`, 5 documents, 0 skipped); this was after cell measurement and outside the timed queries. No repair code was changed.
- pnpm reported node_modules/lockfile workspace drift; ts-jest reported its existing deprecated `isolatedModules` configuration. No install or config edit was made.
- The referenced Electron test is no longer in this monorepo; the construction pattern was inspected in `/Users/kilbot/Projects/electron/src/main/opfs-targeted-recovery.test.mjs` and the installed storage source.
- No other test suite was launched by this task. Cross-session process enumeration was unavailable (`ps`: operation not permitted), so external test activity was not independently verified.

### Behavior changes / regressions

No production behavior changed. Existing index-versus-literal-scan differences are reported above, not fixed. Cold-cache behavior, other catalogue distributions, OPFS/native runtimes, and production UI latency were not evaluated.
