import { getCardLayerStyle, restingCardMotion } from './card-stack-motion';

describe('card stack presentation', () => {
  it('pulls the previous card down over a stationary current card', () => {
    const rest = restingCardMotion(1, 300, 600);
    for (const distance of [1, 150, 350, 700]) {
      const motion = { ...rest, y: distance };
      const current = getCardLayerStyle(1, motion);
      const previous = getCardLayerStyle(0, motion);
      expect(current.transform).toEqual([{ translateX: 0 }, { translateY: 0 }, { rotate: '0deg' }]);
      expect(previous.transform[1]).toEqual({ translateY: distance - 700 });
      expect(previous.zIndex).toBeGreaterThan(current.zIndex);
      expect(previous.opacity).toBe(1);
    }
    expect(getCardLayerStyle(0, rest).opacity).toBe(0);
  });

  it('keeps the second-next card hidden throughout a forward exit', () => {
    const rest = restingCardMotion(0, 300, 600);
    for (const y of [0, -150, -350, -700]) {
      const motion = { ...rest, y };
      expect(getCardLayerStyle(1, motion)).toMatchObject({ opacity: 1, zIndex: 1 });
      expect(getCardLayerStyle(1, motion).transform[1]).toEqual({ translateY: 0 });
      expect(getCardLayerStyle(2, motion).opacity).toBe(0);
    }
    // Promotion resets all presentation fields together, covering the newly mounted next layer.
    const promoted = restingCardMotion(1, 300, 600);
    expect(getCardLayerStyle(1, promoted)).toMatchObject({ opacity: 1, zIndex: 2 });
    expect(getCardLayerStyle(1, promoted).transform[1]).toEqual({ translateY: 0 });
    expect(getCardLayerStyle(2, promoted).zIndex).toBeLessThan(getCardLayerStyle(1, promoted).zIndex);
  });

  it('hides the previous card again after cancelling a pull', () => {
    const restored = restingCardMotion(1, 300, 600);
    expect(getCardLayerStyle(0, restored).opacity).toBe(0);
    expect(getCardLayerStyle(1, restored)).toMatchObject({ opacity: 1, zIndex: 2 });
  });
});
