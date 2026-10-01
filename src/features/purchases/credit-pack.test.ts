import { creditStoreTransactionId } from './credit-pack';
it('uses the Google Play order ID rather than RevenueCat transaction identifiers', () => {
  expect(creditStoreTransactionId({ originalJson: '{"orderId":"GPA.order-1"}' })).toBe('GPA.order-1');
});
it.each([null, 'broken', '{}', '{"orderId":42}', '{"orderId":""}', '{"orderId":"  "}'])('handles unavailable purchase JSON %s', (originalJson) => {
  expect(creditStoreTransactionId({ originalJson })).toBeNull();
});
