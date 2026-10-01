import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { CreditSettings } from './credit-settings';

const mockBalance = jest.fn();
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ user: { id: 'a' } }) }));
jest.mock('./client', () => ({ fetchAiBalance: (...args: unknown[]) => mockBalance(...args) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => jest.requireActual('react').useEffect(callback, [callback]) }));
it('opens the Android credit shop from Settings and preserves the lifetime bonus description', async () => {
  const previousPlatform = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  try {
    mockBalance.mockResolvedValue({ balance: 75, paidGrant: true });
    const view = await render(<CreditSettings/>);
    await waitFor(() => expect(view.getByText('AI credits · 75 remaining')).toBeTruthy());
    expect(view.getByText('Includes 75 one-time credits with your lifetime purchase.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Buy AI credits' }));
    expect(router.push).toHaveBeenCalledWith('/ai-credits');
  } finally { Object.defineProperty(Platform, 'OS', { value: previousPlatform, configurable: true }); }
});
