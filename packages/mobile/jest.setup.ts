import '@testing-library/jest-native/extend-expect';

jest.mock(
  'react-native-reanimated',
  () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Reanimated = require('react-native-reanimated/mock');
      // The mock for `call` invokes the callback immediately which can break tests.
      Reanimated.default.call = () => {};
      return Reanimated;
    } catch {
      const noop = () => undefined;
      return {
        __esModule: true,
        default: { call: noop },
        Easing: {},
        useSharedValue: (value: any) => ({ value }),
        useAnimatedStyle: (fn: any) => fn(),
        withTiming: (value: any) => value,
        withSpring: (value: any) => value,
        runOnJS: (fn: any) => fn,
        runOnUI: (fn: any) => fn,
      };
    }
  },
  { virtual: true },
);

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, _ref: any) => React.createElement(View, props)),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
    SafeAreaConsumer: ({ children }: any) =>
      children({ top: 0, bottom: 0, left: 0, right: 0 }),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 320, height: 640 }),
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native-haptic-feedback', () => ({
  trigger: jest.fn(),
}));

jest.mock('react-native-biometrics', () => {
  return jest.fn().mockImplementation(() => ({
    isSensorAvailable: jest.fn(async () => ({ available: true })),
    simplePrompt: jest.fn(async () => ({ success: true })),
  }));
});

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
  getString: jest.fn(async () => ''),
}));

jest.mock('react-native-get-random-values', () => ({}));

const globalObj = globalThis as typeof globalThis & {
  crypto?: { getRandomValues?: (arr: Uint8Array) => Uint8Array };
};

globalObj.crypto = globalObj.crypto || {};
if (!globalObj.crypto.getRandomValues) {
  globalObj.crypto.getRandomValues = (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i += 1) arr[i] = i % 251;
    return arr;
  };
}
