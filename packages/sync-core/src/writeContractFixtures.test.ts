import { describe, expect, it, vi } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import writeContractSchema from '../../../contracts/write-contract/schema.json';
import validFixtures from '../../../contracts/write-contract/fixtures/valid-envelopes.json';
import responseFixtures from '../../../contracts/write-contract/fixtures/responses.json';
import type { RecordMutation } from './recordMutation';
import { pushRecordMutation } from './recordPushAdapter';

type WireFixture = (typeof validFixtures)[number];
const response = (status: number, body: unknown): Response =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

function mutationFrom(fixture: WireFixture): RecordMutation {
  const wire = fixture.envelope;
  return {
    mutationId: wire.mutationId,
    collectionName: fixture.collection,
    operation: wire.operation as RecordMutation['operation'],
    recordId: wire.recordId,
    origin: wire.operation === 'create' ? 'minted' : 'existing',
    payload: ('payload' in wire && wire.payload ? wire.payload : {}) as Record<string, unknown>,
    baseRevision: wire.baseRevision,
    queuedAt: '2026-07-11T00:00:00.000Z',
  };
}

describe('version 1 write-contract golden fixtures', () => {
  it('validates every golden envelope and response against the contract root', () => {
    const validate = new Ajv2020({ strict: false }).compile(writeContractSchema);
    for (const fixture of validFixtures) expect(validate(fixture.envelope), fixture.name).toBe(true);
    for (const fixture of responseFixtures) expect(validate(fixture.body), fixture.name).toBe(true);
  });

  it.each(validFixtures)('recordPushAdapter emits the exact $name body and header mirrors', async (fixture) => {
    const mutation = mutationFrom(fixture);
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => response(200, mutation.operation === 'delete' ? {} : { document: { id: 1 }, currentRevision: 'sha256:ack' }));
    await pushRecordMutation({ mutation, resolveEndpoint: () => ({ url: 'https://fixture.invalid', method: 'POST' }), fetcher });
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual(fixture.envelope);
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', ...fixture.headers });
  });

  it.each(responseFixtures)('parses the $name response envelope into durable push types', async (fixture) => {
    const operation: RecordMutation['operation'] = fixture.name === 'deleted' || fixture.name === 'delete-precondition'
      ? 'delete' : fixture.name === 'created' || fixture.name === 'replayed-create' ? 'create' : 'update';
    const mutation = mutationFrom({ ...validFixtures[0], envelope: { ...validFixtures[0].envelope, operation } } as WireFixture);
    const promise = pushRecordMutation({ mutation, resolveEndpoint: () => ({ url: 'https://fixture.invalid', method: 'POST' }), fetcher: async () => response(fixture.status, fixture.body) });
    if ('expectedError' in fixture) {
      await expect(promise).rejects.toMatchObject(fixture.expectedError!);
    } else {
      const result = await promise;
      expect(result).toMatchObject(fixture.expected);
      if (fixture.name === 'conflict') {
        expect(result.conflict).toEqual({
          current: fixture.body.current,
          currentRevision: fixture.body.currentRevision,
        });
      }
    }
  });

  it('pins the exact delete-success and stale-conflict wire shapes', () => {
    expect(responseFixtures.find(({ name }) => name === 'replayed-create')).toMatchObject({ status: 201, body: { document: { id: 41 } } });
    expect(responseFixtures.find(({ name }) => name === 'deleted')?.body).toEqual({});
    expect(Object.keys(responseFixtures.find(({ name }) => name === 'conflict')!.body)).toEqual([
      'code', 'message', 'current', 'currentRevision',
    ]);
  });

  it('parses the update-precondition 428 fixture as a retryable push error', async () => {
    const fixture = responseFixtures.find(({ name }) => name === 'update-precondition')!;
    const mutation = mutationFrom({
      ...validFixtures[0],
      envelope: { ...validFixtures[0].envelope, operation: 'update' },
    } as WireFixture);
    await expect(pushRecordMutation({
      mutation,
      resolveEndpoint: () => ({ url: 'https://fixture.invalid', method: 'POST' }),
      fetcher: async () => response(fixture.status, fixture.body),
    })).rejects.toMatchObject({ status: 428, permanent: false });
  });
});
