export type ConnectivityMode = 'online' | 'offline' | 'degraded';

export type OfflineReadBehavior = 'serve-local' | 'require-fresh' | 'fail-if-missing';
export type OfflineWriteBehavior = 'queue' | 'reject';

export type ReplicationMode = 'greedy' | 'windowed' | 'on-demand';

export type ReplicationPolicy = {
  mode: ReplicationMode;
  priority: number;
  batchSize: number;
  maxRequests?: number;
  pollingIntervalMs?: number;
  staleAfterMs?: number;
  offline: {
    read: OfflineReadBehavior;
    write: OfflineWriteBehavior;
  };
};

export type ReplicationRequirementKind = 'lane' | 'query' | 'targeted-records';

export type ReplicationRequirement = {
  id: string;
  collection: string;
  kind: ReplicationRequirementKind;
  queryKey: string;
  ids?: string[];
  /**
   * The numeric Woo server ids for a targeted-records requirement, carried
   * explicitly so a targeted fetcher reads them directly. Document keys are uuids
   * (the P0-1 cutover shipped), so the numeric server id CANNOT be recovered from
   * the key — this channel is the ONLY way a targeted fetcher learns its server ids.
   * REQUIRED whenever `ids` marks the requirement as targeted: the order/product
   * fetchers throw a contract error on a missing/empty `wooIds` (the interim
   * `/^woo-order:(\d+)$/` reverse-parse scaffolding is deleted). It stays optional
   * in the type only because lane/query requirements carry no ids at all.
   */
  wooIds?: number[];
  policy: ReplicationPolicy;
};

export type FetchTask = {
  id: string;
  requirementId: string;
  collection: string;
  queryKey: string;
  ids?: string[];
  /**
   * Numeric Woo server ids for a targeted fetch — the only channel: targeted
   * fetchers throw a contract error when it is missing/empty (see
   * {@link ReplicationRequirement.wooIds}). Optional only because non-targeted
   * (lane/query) tasks carry no ids.
   */
  wooIds?: number[];
  limit: number;
  priority: number;
  mode: ReplicationMode;
};

export type FetchTaskResult = {
  taskId: string;
  documentCount: number;
  requestCount: number;
  completed: boolean;
  /**
   * Local docs tombstoned by a set-difference prune on a completed greedy
   * refresh (deleted upstream, absent from the authoritative full set). Omitted
   * by fetchers that don't prune. Surfaced so deletions aren't silent.
   */
  prunedCount?: number;
};

export type SchedulerRunResult = {
  tasks: FetchTask[];
  results: FetchTaskResult[];
  skipped: Array<{ requirementId: string; reason: string }>;
  totalDocuments: number;
  totalRequests: number;
};
