(() => {
  'use strict';

  const elements = {
    setupCard: document.querySelector('#setup-card'),
    setupForm: document.querySelector('#setup-form'),
    reviewerId: document.querySelector('#reviewer-id'),
    locale: document.querySelector('#locale-select'),
    startButton: document.querySelector('#start-button'),
    workspace: document.querySelector('#review-workspace'),
    activeReviewer: document.querySelector('#active-reviewer'),
    activeLocale: document.querySelector('#active-locale'),
    exportLink: document.querySelector('#export-link'),
    changeSession: document.querySelector('#change-session'),
    category: document.querySelector('#sample-category'),
    position: document.querySelector('#sample-position'),
    text: document.querySelector('#sample-text'),
    context: document.querySelector('#sample-context'),
    audio: document.querySelector('#audio-player'),
    play: document.querySelector('#play-button'),
    saveStatus: document.querySelector('#save-status'),
    ratingButtons: [...document.querySelectorAll('[data-rating]')],
    note: document.querySelector('#rating-note'),
    noteCount: document.querySelector('#note-count'),
    previous: document.querySelector('#previous-button'),
    next: document.querySelector('#next-button'),
    progressCompleted: document.querySelector('#progress-completed'),
    progressTotal: document.querySelector('#progress-total'),
    progressPercent: document.querySelector('#progress-percent'),
    progressTrack: document.querySelector('.progress-track'),
    progressFill: document.querySelector('#progress-fill'),
    progressCopy: document.querySelector('#progress-copy'),
    completion: document.querySelector('#completion-callout'),
    reviewCard: document.querySelector('#review-card'),
    fatalError: document.querySelector('#fatal-error'),
  };

  const state = {
    manifest: null,
    reviewerId: '',
    locale: '',
    samples: [],
    ratings: new Map(),
    index: 0,
    saving: false,
  };

  function showFatal(error) {
    elements.fatalError.textContent = error instanceof Error ? error.message : String(error);
    elements.fatalError.hidden = false;
  }

  async function request(path, options) {
    const response = await fetch(path, options);
    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error(payload?.error ?? payload ?? `Request failed with HTTP ${response.status}.`);
    return payload;
  }

  function setSaveStatus(text, stateName = '') {
    elements.saveStatus.textContent = text;
    elements.saveStatus.className = `save-status ${stateName}`.trim();
  }

  function prettyCategory(category) {
    return category.replaceAll('_', ' ');
  }

  function currentSample() {
    return state.samples[state.index];
  }

  function updateProgress() {
    const completed = state.samples.filter((sample) => state.ratings.has(sample.blindId)).length;
    const total = state.samples.length;
    const percent = total ? Math.round(completed / total * 100) : 0;
    elements.progressCompleted.textContent = String(completed);
    elements.progressTotal.textContent = String(total);
    elements.progressPercent.textContent = `${percent}%`;
    elements.progressTrack.setAttribute('aria-valuenow', String(percent));
    elements.progressFill.style.width = `${percent}%`;
    elements.progressCopy.textContent = completed === total
      ? 'Every sample has a rating. You can still revisit and revise any decision.'
      : `${total - completed} sample${total - completed === 1 ? '' : 's'} remaining for this reviewer.`;
    elements.completion.hidden = completed !== total || total === 0;
  }

  function render() {
    const sample = currentSample();
    if (!sample) return;
    const rating = state.ratings.get(sample.blindId);
    elements.category.textContent = prettyCategory(sample.category);
    elements.position.textContent = `Sample ${state.index + 1} of ${state.samples.length}`;
    elements.text.textContent = sample.text;
    elements.context.textContent = sample.context;
    elements.audio.src = `/audio/${sample.blindId}.mp3`;
    elements.audio.load();
    elements.note.value = rating?.note ?? '';
    elements.noteCount.textContent = `${elements.note.value.length} / 500`;
    for (const button of elements.ratingButtons) {
      const selected = (button.dataset.rating === 'acceptable' && rating?.acceptable && !rating?.wrongLocale)
        || (button.dataset.rating === 'unacceptable' && rating && !rating.acceptable && !rating.wrongLocale)
        || (button.dataset.rating === 'wrong-locale' && rating?.wrongLocale);
      button.setAttribute('aria-pressed', String(Boolean(selected)));
    }
    elements.previous.disabled = state.index === 0;
    elements.next.disabled = state.index === state.samples.length - 1;
    setSaveStatus(rating ? 'Saved' : 'Not rated', rating ? 'saved' : '');
    updateProgress();
  }

  async function playAudio() {
    try {
      elements.audio.currentTime = 0;
      await elements.audio.play();
    } catch (error) {
      setSaveStatus('Could not play audio', 'error');
    }
  }

  function nextUnratedIndex() {
    for (let offset = 1; offset <= state.samples.length; offset += 1) {
      const candidate = (state.index + offset) % state.samples.length;
      if (!state.ratings.has(state.samples[candidate].blindId)) return candidate;
    }
    return Math.min(state.index + 1, state.samples.length - 1);
  }

  async function saveRating(acceptable, wrongLocale, note = elements.note.value, advance = true) {
    if (state.saving) return;
    const sample = currentSample();
    state.saving = true;
    setSaveStatus('Saving…', 'saving');
    const rating = { reviewerId: state.reviewerId, acceptable, wrongLocale, note };
    try {
      const saved = await request(`/api/ratings/${sample.blindId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rating),
      });
      state.ratings.set(sample.blindId, saved);
      setSaveStatus('Saved', 'saved');
      updateProgress();
      render();
      const nextIndex = nextUnratedIndex();
      if (advance && nextIndex !== state.index) {
        window.setTimeout(() => {
          state.index = nextIndex;
          render();
          elements.reviewCard.focus({ preventScroll: true });
        }, 180);
      }
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Save failed', 'error');
    } finally {
      state.saving = false;
    }
  }

  function navigate(offset) {
    const nextIndex = Math.max(0, Math.min(state.samples.length - 1, state.index + offset));
    if (nextIndex === state.index) return;
    state.index = nextIndex;
    render();
    elements.reviewCard.focus({ preventScroll: true });
  }

  async function startSession() {
    const reviewerId = elements.reviewerId.value.trim();
    if (!elements.setupForm.reportValidity()) return;
    state.reviewerId = reviewerId;
    state.locale = elements.locale.value;
    state.samples = state.manifest.samples.filter((sample) => sample.locale === state.locale);
    const payload = await request(`/api/ratings?reviewerId=${encodeURIComponent(reviewerId)}`);
    state.ratings = new Map(payload.ratings.map((rating) => [rating.blindId, rating]));
    state.index = Math.max(0, state.samples.findIndex((sample) => !state.ratings.has(sample.blindId)));
    localStorage.setItem('wordfold.pronunciationReviewerId', reviewerId);
    localStorage.setItem('wordfold.pronunciationLocale', state.locale);
    elements.activeReviewer.textContent = reviewerId;
    elements.activeLocale.textContent = state.locale;
    elements.exportLink.href = `/api/export?reviewerId=${encodeURIComponent(reviewerId)}`;
    elements.setupCard.hidden = true;
    elements.workspace.hidden = false;
    render();
    elements.reviewCard.focus();
  }

  elements.setupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    startSession().catch(showFatal);
  });
  elements.play.addEventListener('click', playAudio);
  elements.previous.addEventListener('click', () => navigate(-1));
  elements.next.addEventListener('click', () => navigate(1));
  elements.changeSession.addEventListener('click', () => {
    elements.workspace.hidden = true;
    elements.setupCard.hidden = false;
    elements.reviewerId.focus();
  });
  elements.note.addEventListener('input', () => {
    elements.noteCount.textContent = `${elements.note.value.length} / 500`;
  });
  elements.note.addEventListener('blur', () => {
    const rating = currentSample() && state.ratings.get(currentSample().blindId);
    if (rating && (rating.note ?? '') !== elements.note.value.trim()) {
      saveRating(rating.acceptable, rating.wrongLocale, elements.note.value, false).catch(showFatal);
    }
  });
  for (const button of elements.ratingButtons) {
    button.addEventListener('click', () => {
      const type = button.dataset.rating;
      saveRating(type === 'acceptable', type === 'wrong-locale').catch(showFatal);
    });
  }
  document.addEventListener('keydown', (event) => {
    if (elements.workspace.hidden || event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target?.tagName?.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      playAudio();
    } else if (event.key === '1') saveRating(true, false).catch(showFatal);
    else if (event.key === '2') saveRating(false, false).catch(showFatal);
    else if (event.key === '3') saveRating(false, true).catch(showFatal);
    else if (event.key === 'ArrowLeft') navigate(-1);
    else if (event.key === 'ArrowRight') navigate(1);
  });

  request('/api/manifest').then((manifest) => {
    state.manifest = manifest;
    const locales = [...new Set(manifest.samples.map((sample) => sample.locale))].sort();
    const savedLocale = localStorage.getItem('wordfold.pronunciationLocale');
    elements.locale.replaceChildren(...locales.map((locale) => {
      const option = document.createElement('option');
      option.value = locale;
      option.textContent = locale;
      return option;
    }));
    if (savedLocale && locales.includes(savedLocale)) elements.locale.value = savedLocale;
    elements.reviewerId.value = localStorage.getItem('wordfold.pronunciationReviewerId') ?? '';
    elements.locale.disabled = false;
    elements.startButton.disabled = false;
  }).catch(showFatal);
})();
