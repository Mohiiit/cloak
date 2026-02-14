import {
  getNetworkMode,
  getRuntimeMode,
  isE2E,
  isLiveMode,
  isMockMode,
  setNetworkModeForTesting,
  setRuntimeModeForTesting,
} from '../src/testing/runtimeConfig';

describe('runtimeConfig', () => {
  afterEach(() => {
    setRuntimeModeForTesting(null);
    setNetworkModeForTesting(null);
  });

  it('returns e2e helpers for mock mode', () => {
    setRuntimeModeForTesting('e2e-mock');
    setNetworkModeForTesting('mock');

    expect(getRuntimeMode()).toBe('e2e-mock');
    expect(getNetworkMode()).toBe('mock');
    expect(isE2E()).toBe(true);
    expect(isMockMode()).toBe(true);
    expect(isLiveMode()).toBe(false);
  });

  it('returns prod helpers for live mode', () => {
    setRuntimeModeForTesting('prod');
    setNetworkModeForTesting('live');

    expect(getRuntimeMode()).toBe('prod');
    expect(getNetworkMode()).toBe('live');
    expect(isE2E()).toBe(false);
    expect(isMockMode()).toBe(false);
    expect(isLiveMode()).toBe(true);
  });
});
