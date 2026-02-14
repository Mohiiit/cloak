import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { useThemedModal } from '../src/components/ThemedModal';
import { testIDs } from '../src/testing/testIDs';

jest.mock('../src/lib/haptics', () => ({
  triggerSuccess: jest.fn(),
  triggerError: jest.fn(),
}));

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const modal = useThemedModal();

  return (
    <>
      <TouchableOpacity testID="open-confirm" onPress={() => modal.showConfirm('Confirm', 'Proceed?', onConfirm)}>
        <Text>Open</Text>
      </TouchableOpacity>
      {modal.ModalComponent}
    </>
  );
}

describe('ThemedModal confirm flow', () => {
  it('calls confirm callback when confirm button is pressed', async () => {
    const onConfirm = jest.fn();
    const { getByTestId, findByTestId } = render(<Harness onConfirm={onConfirm} />);

    fireEvent.press(getByTestId('open-confirm'));

    const confirmButton = await findByTestId(testIDs.themedModal.confirm);
    fireEvent.press(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not call confirm callback when cancel is pressed', async () => {
    const onConfirm = jest.fn();
    const { getByTestId, findByTestId } = render(<Harness onConfirm={onConfirm} />);

    fireEvent.press(getByTestId('open-confirm'));

    const cancelButton = await findByTestId(testIDs.themedModal.cancel);
    fireEvent.press(cancelButton);

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
