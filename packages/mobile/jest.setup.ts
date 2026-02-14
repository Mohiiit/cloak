import '@testing-library/jest-native/extend-expect';

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, _ref: any) => React.createElement(View, props)),
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
