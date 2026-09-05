const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map((element) => [element.id, element]));
const decisionButtons = [...document.querySelectorAll('[data-decision]')];

let session;
let visibleIndexes = [];
let position = 0;
let draft;
let dirty = false;
let saveInProgress = false;
let transitionInProgress = false;
let draftVersion = 0;
let finalizationInProgress = false;

function markDirty() {
  draftVersion += 1;
  dirty = true;
  setStatus('Unsaved changes', 'dirty');
}

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
  }).then(async (response) => {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? `Request failed with ${response.status}.`);
    return payload;
  });
}

function currentIndex() {
  return visibleIndexes[position];
}

function currentSubject() {
  return session.subjects[currentIndex()];
}

function savedDecision() {
  return session.decisions[currentIndex()];
}

function setStatus(message, type = '') {
  elements['save-status'].textContent = message;
  elements['save-status'].className = type;
}

function decisionCounts() {
  return session.decisions.reduce((counts, decision) => {
    counts[decision.decision] += 1;
    return counts;
  }, { approved: 0, 'changes-requested': 0, pending: 0, rejected: 0 });
}

function renderProgress() {
  const counts = decisionCounts();
  const decided = session.decisions.length - counts.pending;
  elements['progress-count'].textContent = `${decided} / ${session.decisions.length} decided`;
  elements['pending-count'].textContent = String(counts.pending);
  elements['approved-count'].textContent = String(counts.approved);
  elements['changes-count'].textContent = String(counts['changes-requested']);
  elements['rejected-count'].textContent = String(counts.rejected);
  elements['progress-fill'].style.width = `${(decided / session.decisions.length) * 100}%`;
  elements['finalize-card'].hidden = counts.pending !== 0 || Boolean(session.reviewedAt);
}

function searchText(subject) {
  return [subject.term, subject.definition, subject.example, subject.translation, subject.displayPartOfSpeech, subject.pcicClassification.label]
    .filter(Boolean).join(' ').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
}

function applyFilters(preferredIndex = currentIndex()) {
  const query = elements.search.value.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
  const status = elements['status-filter'].value;
  const category = elements['category-filter'].value;
  visibleIndexes = session.subjects.map((_, index) => index).filter((index) => {
    const subject = session.subjects[index];
    const decision = session.decisions[index];
    return (!query || searchText(subject).includes(query))
      && (status === 'all' || decision.decision === status)
      && (category === 'all' || String(subject.pcicClassification.id) === category);
  });
  const nextPosition = visibleIndexes.indexOf(preferredIndex);
  position = nextPosition >= 0 ? nextPosition : 0;
  renderSubject();
}

function freshDraft() {
  const decision = savedDecision();
  draft = {
    ...decision,
    selectedSenseId: decision.selectedSenseId ?? null,
    originalEditorialExceptionApproved: decision.originalEditorialExceptionApproved ?? false,
  };
}

function renderSenseOptions(subject) {
  const spanish = session.reviewKind === 'spanish';
  elements['sense-panel'].hidden = !spanish;
  if (!spanish) return;
  const evidence = subject.lexicalEvidence;
  const senses = evidence?.type === 'omw' ? [evidence] : (evidence?.candidateSenses ?? []);
  elements['sense-options'].replaceChildren();
  for (const sense of senses) {
    const label = document.createElement('label');
    label.className = 'sense-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'selected-sense';
    radio.value = sense.senseId;
    radio.checked = draft.selectedSenseId === sense.senseId;
    radio.addEventListener('change', () => {
      draft.selectedSenseId = sense.senseId;
      draft.originalEditorialExceptionApproved = false;
      elements['exception-approved'].checked = false;
      markDirty();
    });
    const copy = document.createElement('span');
    const reference = sense.semanticReference;
    const addText = (tag, text, language) => {
      const element = document.createElement(tag);
      element.textContent = text;
      if (language) element.lang = language;
      copy.append(element);
    };
    if (reference) {
      if (reference.spanish.definition || reference.spanish.examples.length > 0) {
        addText('small', 'Spanish · Open Multilingual Wordnet 2.0');
        if (reference.spanish.definition) addText('strong', reference.spanish.definition, 'es');
        for (const example of reference.spanish.examples) addText('span', example, 'es');
      }
      addText('small', 'English · Princeton WordNet 3.0 via OMW 2.0');
      addText('strong', reference.english.definition, 'en');
      addText('span', `Members: ${reference.english.members.join(', ')}`, 'en');
      for (const example of reference.english.examples) addText('span', example, 'en');
    }
    const small = document.createElement('small');
    small.className = 'sense-identity';
    small.textContent = `Synset ${sense.synsetId}${reference ? ` · ILI ${reference.iliId}` : ''} · sense ${sense.senseId}`;
    copy.append(small);
    label.append(radio, copy);
    elements['sense-options'].append(label);
  }
  const hasException = senses.length === 0;
  elements['exception-row'].hidden = !hasException;
  elements['exception-rationale'].hidden = !hasException;
  elements['exception-rationale'].textContent = evidence?.exceptionRationale ? `Documented rationale: ${evidence.exceptionRationale}` : '';
  elements['exception-approved'].checked = draft.originalEditorialExceptionApproved;
}

function renderSubject() {
  if (visibleIndexes.length === 0) {
    elements['review-card'].hidden = true;
    dirty = false;
    setStatus('No subjects match these filters.');
    return;
  }
  elements['review-card'].hidden = false;
  freshDraft();
  const subject = currentSubject();
  elements.category.textContent = subject.pcicClassification.label;
  elements.position.textContent = `${position + 1} of ${visibleIndexes.length} shown · catalog ${currentIndex() + 1} of ${session.subjects.length}`;
  elements['part-of-speech'].textContent = subject.displayPartOfSpeech;
  elements.term.textContent = subject.term;
  elements.definition.textContent = subject.definition;
  elements.example.textContent = subject.example;
  elements['gender-row'].hidden = !subject.gender;
  elements.gender.textContent = subject.gender ?? '';
  elements['forms-row'].hidden = !subject.alternativeForms?.length;
  elements.forms.textContent = (subject.alternativeForms ?? []).map(({ form, type }) => `${form} (${type})`).join(', ');
  elements['translation-row'].hidden = session.reviewKind !== 'slovak';
  elements.translation.textContent = subject.translation ?? '';
  elements['rationale-row'].hidden = session.reviewKind !== 'spanish';
  elements.rationale.textContent = subject.levelRationale ?? '';
  renderSenseOptions(subject);
  elements.notes.value = draft.notes;
  elements['notes-count'].textContent = `${draft.notes.length} / 2000`;
  for (const button of decisionButtons) button.setAttribute('aria-pressed', String(button.dataset.decision === draft.decision));
  elements['notes-requirement'].textContent = draft.decision === 'changes-requested' || draft.decision === 'rejected' ? 'required' : 'optional for approval';
  elements.previous.disabled = position === 0;
  elements.next.disabled = position >= visibleIndexes.length - 1;
  dirty = false;
  setStatus(session.reviewedAt ? `Finalized ${new Date(session.reviewedAt).toLocaleString()}` : 'Ready');
}

function chooseDecision(value) {
  if (!draft || finalizationInProgress) return;
  draft.decision = value;
  for (const button of decisionButtons) button.setAttribute('aria-pressed', String(button.dataset.decision === value));
  elements['notes-requirement'].textContent = value === 'changes-requested' || value === 'rejected' ? 'required' : 'optional for approval';
  markDirty();
}

async function saveDecision({ render = true } = {}) {
  const subject = currentSubject();
  if (!subject || saveInProgress || finalizationInProgress) return false;
  const savedIndex = currentIndex();
  const savedDraftVersion = draftVersion;
  saveInProgress = true;
  setStatus('Saving…', 'saving');
  elements.save.disabled = true;
  try {
    session = await api('/api/decision', {
      method: 'PUT',
      body: JSON.stringify({
        entryId: subject.entryId,
        catalogSenseId: subject.catalogSenseId,
        decision: draft.decision,
        notes: draft.notes,
        ...(session.reviewKind === 'spanish' ? {
          selectedSenseId: draft.selectedSenseId,
          originalEditorialExceptionApproved: draft.originalEditorialExceptionApproved,
        } : {}),
        expectedRevision: session.revision,
      }),
    });
    renderProgress();
    if (draftVersion !== savedDraftVersion) {
      setStatus('Earlier changes saved. Newer edits are still unsaved.', 'dirty');
      return false;
    }
    dirty = false;
    if (render) applyFilters(savedIndex);
    setStatus('Saved', 'saved');
    return true;
  } catch (error) {
    setStatus(error.message, 'error');
    return false;
  } finally {
    saveInProgress = false;
    elements.save.disabled = false;
  }
}

async function saveDirtyDraft() {
  if (saveInProgress || finalizationInProgress) return false;
  return !dirty || saveDecision({ render: false });
}

async function navigate(offset) {
  if (finalizationInProgress) return;
  const targetPosition = Math.max(0, Math.min(visibleIndexes.length - 1, position + offset));
  const targetIndex = visibleIndexes[targetPosition];
  if (targetIndex == null || !(await saveDirtyDraft())) return;
  applyFilters(targetIndex);
  elements['review-card'].focus();
}

async function changeFilter(element, previousValue, setAppliedValue) {
  const requestedValue = element.value;
  if (transitionInProgress || saveInProgress || finalizationInProgress) {
    element.value = previousValue;
    return previousValue;
  }
  if (dirty) {
    element.value = previousValue;
    transitionInProgress = true;
    const saved = await saveDirtyDraft();
    transitionInProgress = false;
    if (!saved) return previousValue;
    element.value = requestedValue;
  }
  setAppliedValue(requestedValue);
  applyFilters();
  return requestedValue;
}

async function finalizeReview() {
  if (finalizationInProgress || saveInProgress) return;
  if (!(await saveDirtyDraft()) || finalizationInProgress) return;
  const attestation = elements.attestation.value.trim();
  if (!elements['attestation-confirmed'].checked || !attestation) {
    setStatus('Enter your attestation and truthfully confirm it before finalizing.', 'error');
    return;
  }
  if (session.decisions.some((decision) => decision.decision === 'pending')) {
    setStatus('Make a decision for every subject before finalizing.', 'error');
    return;
  }
  finalizationInProgress = true;
  const controls = [...document.querySelectorAll('input, textarea, select, button')].map((element) => [element, element.disabled]);
  for (const [element] of controls) element.disabled = true;
  setStatus('Finalizing…', 'saving');
  try {
    session = await api('/api/finalize', {
      method: 'POST',
      body: JSON.stringify({ attestation, expectedRevision: session.revision }),
    });
    renderProgress();
    renderSubject();
    setStatus(`Finalized ${new Date(session.reviewedAt).toLocaleString()}`, 'saved');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    for (const [element, disabled] of controls) element.disabled = disabled;
    finalizationInProgress = false;
  }
}

async function initialize() {
  try {
    session = await api('/api/session');
    elements.workspace.hidden = false;
    elements['review-kind'].textContent = `${session.reviewKind} content review · ${session.level}`;
    elements.reviewer.textContent = session.reviewerId;
    elements.qualification.textContent = session.qualification;
    elements['source-license'].hidden = session.reviewKind !== 'spanish' || !session.semanticSource;
    elements['source-attribution'].textContent = [session.lexicalSource, session.semanticSource]
      .filter(Boolean).map((source) => `${source.attribution} (${source.license})`).join('\n\n');
    elements['source-license-text'].textContent = session.semanticSource?.licenseText ?? '';
    const categories = [...new Map(session.subjects.map((subject) => [String(subject.pcicClassification.id), subject.pcicClassification.label]))];
    for (const [id, label] of categories) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = `${id}. ${label}`;
      elements['category-filter'].append(option);
    }
    renderProgress();
    applyFilters();
  } catch (error) {
    elements['fatal-error'].hidden = false;
    elements['fatal-error'].textContent = error.message;
  }
}

decisionButtons.forEach((button) => button.addEventListener('click', () => chooseDecision(button.dataset.decision)));
elements.notes.addEventListener('input', () => {
  draft.notes = elements.notes.value;
  elements['notes-count'].textContent = `${draft.notes.length} / 2000`;
  markDirty();
});
elements['exception-approved'].addEventListener('change', () => {
  draft.originalEditorialExceptionApproved = elements['exception-approved'].checked;
  draft.selectedSenseId = null;
  markDirty();
});
let appliedSearch = '';
let appliedStatus = 'all';
let appliedCategory = 'all';
elements.search.addEventListener('input', async () => {
  appliedSearch = await changeFilter(elements.search, appliedSearch, (value) => { appliedSearch = value; });
});
elements['status-filter'].addEventListener('change', async () => {
  appliedStatus = await changeFilter(elements['status-filter'], appliedStatus, (value) => { appliedStatus = value; });
});
elements['category-filter'].addEventListener('change', async () => {
  appliedCategory = await changeFilter(elements['category-filter'], appliedCategory, (value) => { appliedCategory = value; });
});
elements.previous.addEventListener('click', () => navigate(-1));
elements.next.addEventListener('click', () => navigate(1));
elements.save.addEventListener('click', () => saveDecision());
elements.finalize.addEventListener('click', finalizeReview);
elements['next-pending'].addEventListener('click', async () => {
  if (!(await saveDirtyDraft())) return;
  elements['status-filter'].value = 'pending';
  appliedStatus = 'pending';
  applyFilters();
});
document.addEventListener('keydown', (event) => {
  if (finalizationInProgress) return;
  if (event.target.matches('input, textarea, select')) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') saveDecision();
    return;
  }
  if (event.key === '1' || event.key === '2' || event.key === '3') {
    chooseDecision({ 1: 'approved', 2: 'changes-requested', 3: 'rejected' }[event.key]);
  } else if (event.key === 'ArrowLeft') navigate(-1);
  else if (event.key === 'ArrowRight') navigate(1);
  else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') saveDecision();
});
window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

initialize();
