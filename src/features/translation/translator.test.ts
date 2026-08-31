import {
  isOnDeviceTranslationPairSupported,
  translateEnglishToSlovak,
  translateOnDevice,
  translateSpanishToSlovak,
  TranslationCancelledError,
} from './translator';

const mockTranslate = jest.fn<Promise<string>, [string, string, string]>();

jest.mock('../../../modules/wordfold-translate', () => ({
  __esModule: true,
  default: { translate: (...args: [string, string, string]) => mockTranslate(...args) },
}));

describe('on-device translator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTranslate.mockResolvedValue('preklad');
  });

  it('preserves English to Slovak translation behavior', async () => {
    await expect(translateEnglishToSlovak('  scope  ')).resolves.toBe('preklad');
    expect(mockTranslate).toHaveBeenCalledWith('scope', 'en', 'sk');
  });

  it('translates Spanish with Unicode and diacritics to Slovak', async () => {
    mockTranslate.mockResolvedValue('srdce');
    await expect(translateSpanishToSlovak('corazón')).resolves.toBe('srdce');
    expect(mockTranslate).toHaveBeenCalledWith('corazón', 'es', 'sk');
  });

  it('rejects unsupported pairs before calling the native module', async () => {
    expect(isOnDeviceTranslationPairSupported('es', 'sk')).toBe(true);
    expect(isOnDeviceTranslationPairSupported('sk', 'es')).toBe(false);
    await expect(translateOnDevice('ahoj', {
      sourceLanguageCode: 'sk',
      targetLanguageCode: 'sk',
    })).rejects.toThrow('does not support sk → sk');
    expect(mockTranslate).not.toHaveBeenCalled();
  });

  it('turns model download failures into actionable Wi-Fi guidance', async () => {
    mockTranslate.mockRejectedValue(Object.assign(new Error('network'), { code: 'E_MODEL_DOWNLOAD' }));
    await expect(translateSpanishToSlovak('hola')).rejects.toThrow('Connect to Wi-Fi');
  });

  it('cancels without returning a late translation', async () => {
    const controller = new AbortController();
    mockTranslate.mockImplementation(() => new Promise(() => undefined));
    const result = translateSpanishToSlovak('hola', { signal: controller.signal });

    controller.abort();

    await expect(result).rejects.toBeInstanceOf(TranslationCancelledError);
  });
});
