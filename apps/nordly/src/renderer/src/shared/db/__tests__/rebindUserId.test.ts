import { beforeEach, describe, expect, it } from 'vitest';

import { dbGet, dbPut, resetNordlyDbForTests } from '@shared/db/nordlyDb';
import { rebindDbUserId } from '@shared/db/rebindUserId';

const FROM = '11111111-1111-4111-8111-111111111111';
const TO = '22222222-2222-4222-8222-222222222222';

describe('rebindDbUserId', () => {
  beforeEach(async () => {
    await resetNordlyDbForTests();
  });

  it('rewrites composite keys and userId across stores', async () => {
    await dbPut('notes', {
      key: `${FROM}::note-1`,
      userId: FROM,
      id: 'note-1',
      title: 'hello',
    });
    await dbPut('outbox', {
      key: `${FROM}::outbox::op-1`,
      userId: FROM,
      id: 'op-1',
      domain: 'notes',
      op: 'create',
      entityId: 'note-1',
      payload: {},
      createdAt: 1,
      attempts: 0,
    });
    await dbPut('meta', {
      key: `${FROM}::vault_salt_local`,
      userId: FROM,
      saltB64: 'abc',
    });

    await rebindDbUserId(FROM, TO);

    expect(await dbGet('notes', `${FROM}::note-1`)).toBeNull();
    expect(await dbGet<{ title: string; userId: string }>('notes', `${TO}::note-1`)).toEqual(
      expect.objectContaining({ title: 'hello', userId: TO }),
    );
    expect(await dbGet('outbox', `${FROM}::outbox::op-1`)).toBeNull();
    expect(
      await dbGet<{ entityId: string; userId: string }>('outbox', `${TO}::outbox::op-1`),
    ).toEqual(expect.objectContaining({ entityId: 'note-1', userId: TO }));
    expect(await dbGet<{ saltB64: string }>('meta', `${TO}::vault_salt_local`)).toEqual(
      expect.objectContaining({ saltB64: 'abc', userId: TO }),
    );
  });

  it('is a no-op when from and to match', async () => {
    await dbPut('notes', {
      key: `${FROM}::note-1`,
      userId: FROM,
      id: 'note-1',
      title: 'same',
    });
    await rebindDbUserId(FROM, FROM);
    expect(await dbGet<{ title: string }>('notes', `${FROM}::note-1`)).toEqual(
      expect.objectContaining({ title: 'same' }),
    );
  });

  it('merges into an existing target scope without dropping unrelated rows', async () => {
    await dbPut('notes', {
      key: `${FROM}::note-1`,
      userId: FROM,
      id: 'note-1',
      title: 'local',
      updatedAt: 10,
    });
    await dbPut('notes', {
      key: `${TO}::note-2`,
      userId: TO,
      id: 'note-2',
      title: 'cloud',
      updatedAt: 5,
    });

    await rebindDbUserId(FROM, TO);

    expect(await dbGet('notes', `${FROM}::note-1`)).toBeNull();
    expect(await dbGet<{ title: string }>('notes', `${TO}::note-1`)).toEqual(
      expect.objectContaining({ title: 'local' }),
    );
    expect(await dbGet<{ title: string }>('notes', `${TO}::note-2`)).toEqual(
      expect.objectContaining({ title: 'cloud' }),
    );
  });

  it('on key collision keeps the newer updatedAt (ties prefer local)', async () => {
    await dbPut('notes', {
      key: `${FROM}::note-1`,
      userId: FROM,
      id: 'note-1',
      title: 'local-newer',
      updatedAt: 200,
    });
    await dbPut('notes', {
      key: `${TO}::note-1`,
      userId: TO,
      id: 'note-1',
      title: 'cloud-older',
      updatedAt: 100,
    });
    await rebindDbUserId(FROM, TO);
    expect(await dbGet<{ title: string }>('notes', `${TO}::note-1`)).toEqual(
      expect.objectContaining({ title: 'local-newer' }),
    );

    await resetNordlyDbForTests();
    await dbPut('notes', {
      key: `${FROM}::note-1`,
      userId: FROM,
      id: 'note-1',
      title: 'local-older',
      updatedAt: 50,
    });
    await dbPut('notes', {
      key: `${TO}::note-1`,
      userId: TO,
      id: 'note-1',
      title: 'cloud-newer',
      updatedAt: 300,
    });
    await rebindDbUserId(FROM, TO);
    expect(await dbGet<{ title: string }>('notes', `${TO}::note-1`)).toEqual(
      expect.objectContaining({ title: 'cloud-newer' }),
    );
    expect(await dbGet('notes', `${FROM}::note-1`)).toBeNull();
  });
});
