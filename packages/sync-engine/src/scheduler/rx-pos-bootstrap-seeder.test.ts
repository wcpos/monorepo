// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { posBootstrapTasks, referenceLaneTasks, referenceLaneTaskFor } from './rx-pos-bootstrap-seeder';

describe('posBootstrapTasks', () => {
  it('seeds the greedy tax-rates lane at top priority (Tier 0 — the POS cannot sell without tax rates)', () => {
    const tasks = posBootstrapTasks();
    const tax = tasks.find((task) => task.collection === 'taxRates');

    expect(tax).toBeDefined();
    // The tax-rate scheduler fetcher only accepts queryKey 'taxRates:all' + mode
    // 'greedy' + NO targeted ids (isSupportedTaxRateSchedulerTask). Priority 1000
    // is the canonical Tier-0 value (schedulerScenarios.ts 'POS startup').
    expect(tax).toMatchObject({
      requirementId: 'taxRates.all',
      collection: 'taxRates',
      queryKey: 'taxRates:all',
      mode: 'greedy',
      priority: 1000,
    });
    expect(tax?.ids).toBeUndefined();
    expect((tax?.limit ?? 0) > 0).toBe(true);
  });

  it('only seeds eager greedy lanes — never a bulk order/product backlog pull (orders stay on-demand)', () => {
    const tasks = posBootstrapTasks();
    // Guardrail G3: the bootstrap never bulk-downloads huge historical collections.
    expect(tasks.some((task) => task.collection === 'orders')).toBe(false);
    // Every bootstrap lane is a small required greedy lane (no windowed/on-demand
    // historical backlog seeded eagerly here).
    expect(tasks.every((task) => task.mode === 'greedy')).toBe(true);
  });

  it('seeds greedy categories + brands + tags + coupons reference lanes just below tax rates', () => {
    const tasks = posBootstrapTasks();
    const byCollection = (collection: string) => tasks.find((task) => task.collection === collection);

    const categories = byCollection('categories');
    const brands = byCollection('brands');
    const tags = byCollection('tags');
    const coupons = byCollection('coupons');
    expect(categories).toMatchObject({ queryKey: 'categories:all', mode: 'greedy' });
    expect(brands).toMatchObject({ queryKey: 'brands:all', mode: 'greedy' });
    expect(tags).toMatchObject({ queryKey: 'tags:all', mode: 'greedy' });
    expect(coupons).toMatchObject({ queryKey: 'coupons:all', mode: 'greedy' });
    // Priority order: tax (1000) > categories > brands > tags > coupons > everything operational.
    const tax = byCollection('taxRates');
    expect((tax?.priority ?? 0) > (categories?.priority ?? 0)).toBe(true);
    expect((categories?.priority ?? 0) > (brands?.priority ?? 0)).toBe(true);
    expect((brands?.priority ?? 0) > (tags?.priority ?? 0)).toBe(true);
    expect((tags?.priority ?? 0) > (coupons?.priority ?? 0)).toBe(true);
  });
});

describe('referenceLaneTasks (F11 — in-session reference refresh)', () => {
  it('returns ONLY the greedy categories + brands + tags + coupons lanes (not tax rates)', () => {
    const tasks = referenceLaneTasks();
    const collections = tasks.map((task) => task.collection).sort();

    expect(collections).toEqual(['brands', 'categories', 'coupons', 'tags']);
    expect(tasks.every((task) => task.mode === 'greedy')).toBe(true);
    expect(tasks.some((task) => task.collection === 'taxRates')).toBe(false); // tax rates have their own change-signal refresh
  });

  it('matches the reference lanes posBootstrapTasks seeds at boot (same ids re-queue on re-seed)', () => {
    const referenceCollections = new Set(['categories', 'brands', 'tags', 'coupons']);
    const bootRef = posBootstrapTasks().filter((task) => referenceCollections.has(task.collection));
    expect(referenceLaneTasks()).toEqual(bootRef);
  });
});

describe('referenceLaneTaskFor (change-signal reference refresh)', () => {
  it.each(['coupons', 'categories', 'brands', 'tags'] as const)(
    'returns ONLY the greedy %s:all lane, identical to the one in referenceLaneTasks',
    (collection) => {
      const task = referenceLaneTaskFor(collection);

      expect(task).toMatchObject({ collection, queryKey: `${collection}:all`, mode: 'greedy' });
      // Re-seeding must re-queue the SAME task id the boot lane uses, so a refresh
      // reconciles the existing greedy lane rather than forking a duplicate.
      const bootTask = referenceLaneTasks().find((t) => t.collection === collection);
      expect(task).toEqual(bootTask);
    },
  );
});
