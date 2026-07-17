export const palette = {
  light: {
    canvas: '#F6F5FF',
    surface: '#FFFFFF',
    raised: '#F8F7FFDB',
    glass: '#FFFFFF9E',
    primary: '#6657D9',
    primarySoft: '#E9E5FF',
    text: '#1E1A35',
    muted: '#716C86',
    accent: '#E16F9E',
    border: '#E6E2F2',
    danger: '#D34F68',
    success: '#168A78',
    shadow: '#443C7A',
    aurora: ['#F7F5FF', '#F1EEFF', '#FDF2F7'] as const,
    primaryGradient: ['#7868EE', '#9C62DE', '#E06FA6'] as const,
    accentGradient: ['#F4A67A', '#E16F9E'] as const,
  },
  dark: {
    canvas: '#121020',
    surface: '#25213BC7',
    raised: '#302A47D6',
    glass: '#302B478F',
    primary: '#B9B1FF',
    primarySoft: '#3D3569',
    text: '#F8F5FF',
    muted: '#B8B1CA',
    accent: '#FF9CC3',
    border: '#FFFFFF24',
    danger: '#FF879C',
    success: '#62D6C2',
    shadow: '#05030F',
    aurora: ['#121020', '#1D1733', '#281629'] as const,
    primaryGradient: ['#7D6EF0', '#AA69E2', '#E276AA'] as const,
    accentGradient: ['#E69A72', '#D7679B'] as const,
  },
} as const;

export const stateColors = {
  new: '#685CE3',
  cannot_remember: '#D34F68',
  understood: '#C96A24',
  learned: '#168A78',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radii = { control: 14, card: 20, sheet: 28, pill: 999 } as const;
export const typeScale = { caption: 12, bodySmall: 14, body: 16, headingSmall: 20, heading: 28, display: 40 } as const;
