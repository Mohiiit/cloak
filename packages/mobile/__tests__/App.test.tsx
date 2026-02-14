import { testIDs } from '../src/testing/testIDs';

function collectTestIds(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>).flatMap((child) =>
    collectTestIds(child)
  );
}

describe('testID registry contract', () => {
  it('has unique canonical ids and expected naming pattern', () => {
    const canonicalGroups = [
      testIDs.onboarding,
      testIDs.deploy,
      testIDs.home,
      testIDs.send,
      testIDs.wallet,
      testIDs.settings,
      testIDs.ward,
      testIDs.approval,
      testIDs.toast,
      testIDs.nav,
      testIDs.markers,
      testIDs.activity,
    ];

    const allIds = canonicalGroups.flatMap((group) => collectTestIds(group));
    const uniqueIds = new Set(allIds);

    expect(allIds.length).toBeGreaterThan(20);
    expect(uniqueIds.size).toBe(allIds.length);

    for (const id of allIds) {
      expect(id).toMatch(/^[a-z0-9]+(?:\.[a-z0-9]+)*$/);
    }
  });

  it('keeps required async marker ids stable', () => {
    expect(testIDs.markers.wardCreationStep).toBe('ward.creation.step');
    expect(testIDs.markers.wardCreationStatus).toBe('ward.creation.status');
    expect(testIDs.markers.deployStatus).toBe('deploy.status');
    expect(testIDs.markers.approvalQueueCount).toBe('approval.queue.count');
    expect(testIDs.markers.transactionRouterPath).toBe('transaction.router.path');
    expect(testIDs.markers.toastLastType).toBe('toast.last.type');
  });
});
