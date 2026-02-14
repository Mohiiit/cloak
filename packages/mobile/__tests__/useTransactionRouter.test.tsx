import { act, renderHook } from '@testing-library/react-native';
import { useTransactionRouter } from '../src/hooks/useTransactionRouter';

const mockUseWallet = jest.fn();
const mockUseWardContext = jest.fn();
const mockUseDualSigExecutor = jest.fn();

jest.mock('../src/lib/WalletContext', () => ({
  useWallet: () => mockUseWallet(),
}));

jest.mock('../src/lib/wardContext', () => ({
  useWardContext: () => mockUseWardContext(),
}));

jest.mock('../src/hooks/useDualSigExecutor', () => ({
  useDualSigExecutor: () => mockUseDualSigExecutor(),
}));

describe('useTransactionRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes ward transactions through ward pipeline first', async () => {
    const wardResult = { approved: true, txHash: '0xward' };

    mockUseWallet.mockReturnValue({
      prepareTransfer: jest.fn(async () => ({ calls: [{ id: 'c1' }] })),
      prepareFund: jest.fn(),
      prepareWithdraw: jest.fn(),
      prepareRollover: jest.fn(),
      fund: jest.fn(),
      transfer: jest.fn(),
      withdraw: jest.fn(),
      rollover: jest.fn(),
    });

    const initiateWardTransaction = jest.fn(async () => wardResult);
    mockUseWardContext.mockReturnValue({
      isWard: true,
      initiateWardTransaction,
    });

    mockUseDualSigExecutor.mockReturnValue({
      executeDualSig: jest.fn(),
      is2FAEnabled: true,
    });

    const { result } = renderHook(() => useTransactionRouter());

    let tx: { txHash: string } | undefined;
    await act(async () => {
      tx = await result.current.execute({
        action: 'transfer',
        token: 'STRK',
        amount: '5',
        recipient: 'tongo123',
      });
    });

    expect(initiateWardTransaction).toHaveBeenCalledTimes(1);
    expect(tx).toEqual({ txHash: '0xward' });
  });

  it('routes non-ward 2FA transactions through dual sig', async () => {
    const executeDualSig = jest.fn(async () => ({ txHash: '0x2fa' }));

    mockUseWallet.mockReturnValue({
      prepareTransfer: jest.fn(),
      prepareFund: jest.fn(async () => ({ calls: [{ id: 'f1' }] })),
      prepareWithdraw: jest.fn(),
      prepareRollover: jest.fn(),
      fund: jest.fn(),
      transfer: jest.fn(),
      withdraw: jest.fn(),
      rollover: jest.fn(),
    });

    mockUseWardContext.mockReturnValue({
      isWard: false,
      initiateWardTransaction: jest.fn(),
    });

    mockUseDualSigExecutor.mockReturnValue({
      executeDualSig,
      is2FAEnabled: true,
    });

    const { result } = renderHook(() => useTransactionRouter());

    let tx: { txHash: string } | undefined;
    await act(async () => {
      tx = await result.current.execute({
        action: 'fund',
        token: 'STRK',
        amount: '2',
      });
    });

    expect(executeDualSig).toHaveBeenCalledTimes(1);
    expect(tx).toEqual({ txHash: '0x2fa' });
  });

  it('routes plain transactions directly when not ward and 2FA disabled', async () => {
    const fund = jest.fn(async () => ({ txHash: '0xdirect' }));

    mockUseWallet.mockReturnValue({
      prepareTransfer: jest.fn(),
      prepareFund: jest.fn(),
      prepareWithdraw: jest.fn(),
      prepareRollover: jest.fn(),
      fund,
      transfer: jest.fn(),
      withdraw: jest.fn(),
      rollover: jest.fn(),
    });

    mockUseWardContext.mockReturnValue({
      isWard: false,
      initiateWardTransaction: jest.fn(),
    });

    mockUseDualSigExecutor.mockReturnValue({
      executeDualSig: jest.fn(),
      is2FAEnabled: false,
    });

    const { result } = renderHook(() => useTransactionRouter());

    let tx: { txHash: string } | undefined;
    await act(async () => {
      tx = await result.current.execute({
        action: 'fund',
        token: 'STRK',
        amount: '1',
      });
    });

    expect(fund).toHaveBeenCalledWith('1');
    expect(tx).toEqual({ txHash: '0xdirect' });
  });
});
