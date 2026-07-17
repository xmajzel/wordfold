import personalVocabulary from '../../assets/seed/personal-vocabulary.json';

describe('personal vocabulary seed', () => {
  it('contains every corrected unique source word', () => {
    expect(personalVocabulary.words).toHaveLength(402);
    expect(new Set(personalVocabulary.words.map((word) => word.normalizedTerm)).size).toBe(402);

    const counts = personalVocabulary.words.reduce<Record<string, number>>((result, word) => {
      result[word.collectionId] = (result[word.collectionId] ?? 0) + 1;
      return result;
    }, {});
    expect(counts).toEqual({
      'ux-ui': 3,
      'project-management': 72,
      'headway-upper-intermediate': 327,
    });
  });

  it('has complete learning content for every word', () => {
    for (const word of personalVocabulary.words) {
      expect(word.term).toBeTruthy();
      expect(word.definition).toBeTruthy();
      expect(word.example).toBeTruthy();
      expect(word.partOfSpeech).toBeTruthy();
      expect(word.translation).toBeTruthy();
    }
  });

  it('keeps corrected spellings and the agreed collection ownership', () => {
    const byTerm = new Map(personalVocabulary.words.map((word) => [word.normalizedTerm, word]));
    expect(byTerm.get('ancillary')?.collectionId).toBe('ux-ui');
    expect(byTerm.get('iirc (if i remember correctly)')?.translation).toBe('ak si správne pamätám');
    expect(byTerm.has('steering committee')).toBe(true);
    expect(byTerm.has('due diligence')).toBe(true);
    expect(byTerm.has('steering comitee')).toBe(false);
    expect(byTerm.has('due dilligence')).toBe(false);
  });
});
