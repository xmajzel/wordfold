import { darkStateColors, palette } from './tokens';

function channels(hex: string) {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}

function blend(foreground: string, background: string, opacity: number) {
  return channels(foreground).map((channel, index) => (
    Math.round(channel * opacity + channels(background)[index] * (1 - opacity))
  ));
}

function luminance(rgb: number[]) {
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(foreground: string, background: number[]) {
  const values = [luminance(channels(foreground)), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('dark theme legibility', () => {
  it('uses opaque content surfaces', () => {
    expect(palette.dark.surface).toMatch(/^#[0-9A-F]{6}$/i);
    expect(palette.dark.cardSurface).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('keeps the enabled secondary button outline visible on its dark fill', () => {
    const border = palette.dark.secondaryBorder;
    const blendedBorder = blend(border, palette.dark.surface, Number.parseInt(border.slice(7), 16) / 255);
    const values = [luminance(blendedBorder), luminance(channels(palette.dark.surface))].sort((a, b) => b - a);
    expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(3);
  });

  it('keeps filled control text above 4.5:1 across gradients', () => {
    const filledColors = [palette.dark.primary, palette.dark.success, ...palette.dark.dangerGradient];
    for (const color of filledColors) {
      expect(contrast(palette.dark.onPrimary, channels(color))).toBeGreaterThanOrEqual(4.5);
    }
    for (let stop = 0; stop < palette.dark.primaryGradient.length - 1; stop += 1) {
      for (let step = 0; step <= 20; step += 1) {
        const background = blend(palette.dark.primaryGradient[stop + 1], palette.dark.primaryGradient[stop], step / 20);
        expect(contrast(palette.dark.onPrimary, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps status badge text above 4.5:1 over its tinted fill', () => {
    for (const color of Object.values(darkStateColors)) {
      const background = blend(color, palette.dark.cardSurface, 0x18 / 255);
      expect(contrast(color, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
