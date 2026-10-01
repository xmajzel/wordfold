import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { CreditShop } from './credit-shop';

let mockUser: { id: string } | null = { id: 'a' };
const mockBuy = jest.fn(); const mockBalance = jest.fn(); const mockConfirmation = jest.fn();
const mockPurchase = { status: 'ready', creditPackPriceLabel: '€1.99' as string | null, creditPackMessage: null,
  purchaseCreditPack: mockBuy, refreshCreditProduct: jest.fn() };
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('@/providers/purchase-provider', () => ({ usePurchase: () => mockPurchase }));
jest.mock('./client', () => ({ fetchAiBalance: (...args: unknown[]) => mockBalance(...args), fetchCreditPurchaseStatus: (...args: unknown[]) => mockConfirmation(...args) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => jest.requireActual('react').useEffect(callback, [callback]) }));
jest.mock('react-native-reanimated', () => ({ __esModule: true,
  default: { View: jest.requireActual('react-native').View, createAnimatedComponent: (component: unknown) => component }, ReduceMotion: { System: 'system' },
  useAnimatedStyle: (factory: () => object) => factory(), useSharedValue: (value: number) => ({ value, set: jest.fn() }),
  withSpring: (value: number) => value, withTiming: (value: number) => value, withRepeat: (value: number) => value,
  cancelAnimation: jest.fn(), interpolate: (_value: number, _input: number[], output: number[]) => output[0],
}));
const platform = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks(); mockUser = { id: 'a' }; mockPurchase.creditPackPriceLabel = '€1.99';
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  mockBalance.mockResolvedValue({ balance: 0 });
  mockBuy.mockResolvedValue({ ok: true, message: '100 AI credits have been added to your account.' });
});
afterAll(() => { Object.defineProperty(Platform, 'OS', { value: platform, configurable: true }); });
it('shows the store price and refreshes the balance after buying', async () => {
  const view = await render(<CreditShop/>);
  await waitFor(() => expect(view.getByText('0 credits remaining')).toBeTruthy());
  mockBalance.mockResolvedValue({ balance: 100 });
  await fireEvent.press(view.getByRole('button', { name: 'Buy 100 credits · €1.99' }));
  await waitFor(() => expect(view.getByText('100 credits remaining')).toBeTruthy());
  expect(mockBuy).toHaveBeenCalledTimes(1);
});
it('recovers delayed confirmation without starting another payment', async () => {
  mockBuy.mockResolvedValue({ ok: true, pending: true, transactionId: 'GPA.order', message: 'Payment completed. Confirmation pending.' });
  mockConfirmation.mockResolvedValue({ balance: 100, creditPurchaseStatus: 'credited' });
  const view = await render(<CreditShop/>);
  await waitFor(() => expect(view.getByText('0 credits remaining')).toBeTruthy());
  await fireEvent.press(view.getByRole('button', { name: 'Buy 100 credits · €1.99' }));
  await waitFor(() => expect(view.getByText('Payment completed. Confirmation pending.')).toBeTruthy());
  await fireEvent.press(view.getByRole('button', { name: 'Buy 100 credits · €1.99' }));
  expect(mockBuy).toHaveBeenCalledTimes(1);
  await fireEvent.press(view.getByRole('button', { name: 'Refresh balance' }));
  await waitFor(() => expect(view.getByText('100 credits remaining')).toBeTruthy());
  expect(mockConfirmation).toHaveBeenCalledWith('GPA.order');
});
it('requires sign-in and does not load or charge a guest wallet', async () => {
  mockUser = null; const view = await render(<CreditShop/>);
  expect(view.getByText('Sign in for AI credits')).toBeTruthy();
  expect(mockBuy).not.toHaveBeenCalled(); expect(mockBalance).not.toHaveBeenCalled();
});
it('recovers a completed pack when the SDK omits its original purchase JSON', async () => {
  mockBuy.mockResolvedValue({ ok: true, pending: true, previousPackCount: 0, message: 'Payment completed. Confirmation pending.' });
  const view = await render(<CreditShop/>);
  await waitFor(() => expect(view.getByText('0 credits remaining')).toBeTruthy());
  await fireEvent.press(view.getByRole('button', { name: 'Buy 100 credits · €1.99' }));
  await waitFor(() => expect(view.getByText('Payment completed. Confirmation pending.')).toBeTruthy());
  mockBalance.mockResolvedValue({ balance: 100, creditPackCount: 1 });
  await fireEvent.press(view.getByRole('button', { name: 'Refresh balance' }));
  await waitFor(() => expect(view.getByText('Your purchased credits have been added to your account.')).toBeTruthy());
  expect(mockBuy).toHaveBeenCalledTimes(1);
});
it('does not sell an unavailable product at an assumed price', async () => {
  mockPurchase.creditPackPriceLabel = null; const view = await render(<CreditShop/>);
  await waitFor(() => expect(view.getByText('0 credits remaining')).toBeTruthy());
  await fireEvent.press(view.getByRole('button', { name: 'Buy 100 credits with Google Play' }));
  expect(mockBuy).not.toHaveBeenCalled();
});
