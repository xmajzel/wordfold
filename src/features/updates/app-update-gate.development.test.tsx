import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AppUpdateGate } from './app-update-gate';
import { fetchReleasePolicy } from './release-policy-client';

jest.mock('expo-application', () => ({ nativeBuildVersion: '5', applicationId: 'com.jozefmajzel.wordfold.debug' }));
jest.mock('expo-updates', () => {
  throw new Error("Cannot find native module 'ExpoUpdates'");
});
jest.mock('./release-policy-client', () => ({ fetchReleasePolicy: jest.fn() }));
jest.mock('@/components/primary-button', () => ({ PrimaryButton: () => null }));

it('renders the app in development without loading the missing native updates module', async () => {
  const view = await render(<AppUpdateGate><Text>Learn</Text></AppUpdateGate>);

  expect(view.getByText('Learn')).toBeTruthy();
  expect(fetchReleasePolicy).not.toHaveBeenCalled();
});
