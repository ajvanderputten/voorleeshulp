(function(){
  // Verhoog dit nummer bij elke wijziging, samen met VERSION in sw.js.
  const APP_VERSION = '1.6.0';
  document.getElementById('appVersion').textContent = APP_VERSION;
  const textInput = document.getElementById('textInput');
  const readingView = document.getElementById('readingView');
  const btnGirl = document.getElementById('btnGirl');
  const btnBoy = document.getElementById('btnBoy');
  const btnPlay = document.getElementById('btnPlay');
  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');
  const btnRestart = document.getElementById('btnRestart');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnEdit = document.getElementById('btnEdit');
  const btnClear = document.getElementById('btnClear');
  const btnFontSize = document.getElementById('btnFontSize');
  const btnFont = document.getElementById('btnFont');
  const rateSlider = document.getElementById('rateSlider');
  const rateLabel = document.getElementById('rateLabel');
  const speedPresets = document.querySelectorAll('.speed-presets button');
  const status = document.getElementById('status');
  const voiceSelect = document.getElementById('voiceSelect');
  const btnVoiceTest = document.getElementById('btnVoiceTest');
  const voiceHint = document.getElementById('voiceHint');
  const voiceLabelEl = document.querySelector('label[for="voiceSelect"]');


  let voices = [];
  let genderPref = localStorage.getItem('vh_gender') || 'girl';
  let readSize = parseInt(localStorage.getItem('vh_readSize') || '26', 10);
  let kidFont = localStorage.getItem('vh_kidFont') !== 'off';

  document.documentElement.style.setProperty('--read-size', readSize + 'px');
  document.body.classList.toggle('font-normal', !kidFont);
  btnFont.textContent = '🔤 Kindvriendelijk lettertype: ' + (kidFont ? 'aan' : 'uit');

  const FEMALE_HINTS = ['vrouw','female','fenna','claire','lotte','sophie','samantha','victoria','karen','xenia','anna','ellen','laura','amelie','zosia','marie','lucia','nora','ioana','joana','daria','tina','sara','laila','moira','tessa','monica','paulina','milena','serena','kate','susan','zira','hazel','catherine','fiona','jenny','aria','emma','olivia','libby','sonia','ava'];
  const MALE_HINTS = ['man','male','xander','frank','bart','ruben','daniel','arthur','fred','tom','alex','diego','luca','felix','thomas','jacques','ralph','albert','rishi','junior','oliver','george','david','mark','james','aaron','gordon','guy','ryan','thomas','eric','brian','davis'];
  // Auto-detected voices can't always be told apart by gender; pitch keeps the two knoppen audibly different even on devices with just one Dutch stem.
  const GENDER_PITCH = { girl: 1.15, boy: 0.85 };

  function guessGender(voice){
    const n = voice.name.toLowerCase();
    if (FEMALE_HINTS.some(h => n.includes(h))) return 'girl';
    if (MALE_HINTS.some(h => n.includes(h))) return 'boy';
    return null;
  }

  function scoreVoice(v){
    let s = 0;
    if (v.lang && v.lang.toLowerCase().startsWith(currentLang)) s += 10;
    if (v.localService) s += 2;
    return s;
  }

  function loadVoices(){
    voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    autoAssignGenderVoices();
    applyGenderSelection();
    renderVoiceSelect();
  }

  let girlVoice = null, boyVoice = null;

  // Taal van de tekst: Nederlands of Engels, geraden aan veelvoorkomende woorden.
  const { splitSentences, detectLang, isNatural, ocrToText } = window.TextUtils;
  let currentLang = 'nl';

  const langSelect = document.getElementById('langSelect');
  const showAllVoices = document.getElementById('showAllVoices');
  let langPref = 'auto';
  let showAll = false;
  try { langPref = localStorage.getItem('vh_lang') || 'auto'; showAll = localStorage.getItem('vh_showAll') === '1'; } catch (e) {}
  langSelect.value = langPref;
  showAllVoices.checked = showAll;

  function refreshLang(){
    const lang = langPref === 'auto' ? detectLang(textInput.value) : langPref;
    if (lang === currentLang) return;
    currentLang = lang;
    if (voices.length) { autoAssignGenderVoices(); applyGenderSelection(); }
  }
  const FALLBACK_LANG = { nl: 'nl-NL', en: 'en-GB' };

  function voiceLang(v){
    return (v.lang || '').toLowerCase().replace('_', '-');
  }

  function britishNatural(){
    return voices.filter(v => voiceLang(v).startsWith('en-gb') && isNatural(v));
  }

  function langVoices(){
    const all = voices.filter(v => voiceLang(v).startsWith(currentLang));
    if (currentLang !== 'en') return all;
    // Engels: alleen Britse stemmen, bij voorkeur alleen de natuurlijke.
    const gb = all.filter(v => voiceLang(v).startsWith('en-gb'));
    if (!gb.length) return all;
    const nat = gb.filter(isNatural);
    return nat.length ? nat : gb;
  }

  function getDutchVoicePool(){
    // Voorkeur voor Nederlands uit Nederland (nl-NL), zodat er geen Vlaamse stem (nl-BE) gekozen wordt.
    // Alleen als er geen nl-NL stem is, vallen we terug op andere Nederlandse stemmen, en daarna op alles zodat de app blijft werken.
    const dutch = langVoices();
    const nlNL = dutch.filter(v => !voiceLang(v).startsWith('nl-be'));
    if (nlNL.length) return nlNL;
    return dutch.length ? dutch : voices;
  }

  function autoAssignGenderVoices(){
    const pool = getDutchVoicePool();
    const dutchAll = langVoices();
    const isBE = (v) => voiceLang(v).startsWith('nl-be');
    // Nederlands uit Nederland gaat voor, daarna de beste kwaliteit.
    const rank = (a, b) => (isBE(a) - isBE(b)) || (scoreVoice(b) - scoreVoice(a));

    // Meisje: een vrouwenstem uit Nederland, anders een Vlaamse vrouwenstem (liever dan een mannenstem).
    const femaleCandidates = (dutchAll.length ? dutchAll : voices).filter(v => guessGender(v) === 'girl').sort(rank);
    const boys = pool.filter(v => guessGender(v) === 'boy').sort(rank);

    girlVoice = femaleCandidates[0] || null;
    boyVoice = boys[0] || null;

    if (!girlVoice) girlVoice = pool.find(v => v !== boyVoice) || pool[0] || voices[0];
    if (!boyVoice) boyVoice = pool.find(v => v !== girlVoice) || pool[0] || voices[0];

    if (girlVoice === boyVoice) {
      const alt = pool.find(v => v !== girlVoice) || voices.find(v => v !== girlVoice);
      if (alt) boyVoice = alt;
    }
  }

  function applyGenderSelection(){
    btnGirl.classList.toggle('active', genderPref === 'girl');
    btnBoy.classList.toggle('active', genderPref === 'boy');
    renderVoiceSelect();
  }

  // Zelf gekozen stem, per knop (vrouw/man) onthouden.
  function chosenVoiceKey(){ return (currentLang === 'nl' ? 'vh_voice_' : 'vh_voice_' + currentLang + '_') + genderPref; }
  function getChosenVoice(){
    let uri = '';
    try { uri = localStorage.getItem(chosenVoiceKey()) || ''; } catch (e) {}
    if (!uri) return null;
    return voices.find(v => v.voiceURI === uri) || null;
  }

  function getSelectedVoice(){
    return getChosenVoice() || (genderPref === 'girl' ? girlVoice : boyVoice) || voices[0];
  }

  function voiceLabel(v){
    const lang = voiceLang(v);
    const region = lang.startsWith('nl-be') ? 'Vlaams' : lang.startsWith('nl') ? 'Nederland'
      : lang.startsWith('en-gb') ? 'Brits' : lang.startsWith('en-us') ? 'Amerikaans' : lang.startsWith('en-au') ? 'Australisch'
      : lang.startsWith('en-ie') ? 'Iers' : lang.startsWith('en-in') ? 'Indiaas' : (v.lang || '');
    return v.name + ' (' + region + ')';
  }

  function renderVoiceSelect(){
    if (!voiceSelect || !voices.length) return;
    const dutch = langVoices();
    const list = (showAll || !dutch.length ? voices : dutch).slice().sort((a, b) =>
      (showAll ? voiceLang(a).localeCompare(voiceLang(b)) : 0) ||
      (voiceLang(a).startsWith('nl-be') - voiceLang(b).startsWith('nl-be')) || a.name.localeCompare(b.name));
    voiceSelect.innerHTML = '';
    const auto = document.createElement('option');
    auto.value = '';
    const autoVoice = genderPref === 'girl' ? girlVoice : boyVoice;
    auto.textContent = 'Automatisch' + (autoVoice ? ' – ' + autoVoice.name : '');
    voiceSelect.appendChild(auto);
    list.forEach(v => {
      const o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = voiceLabel(v);
      voiceSelect.appendChild(o);
    });
    const chosen = getChosenVoice();
    voiceSelect.value = chosen ? chosen.voiceURI : '';
    voiceLabelEl.textContent = 'Kies een stem' + (currentLang === 'en' ? ' (Engels)' : '');
    const langName = currentLang === 'en' ? 'Engelse' : 'Nederlandse';
    voiceHint.textContent = dutch.length
      ? (currentLang === 'en' && !britishNatural().length
          ? 'Er is geen natuurlijke Britse stem gevonden; hier staan de beste Britse stemmen die er zijn. Op een iPhone/iPad kun je een betere stem downloaden via Instellingen → Toegankelijkheid → Gesproken content → Stemmen → Engels → Engels (VK).'
          : '')
      : 'Er is geen ' + langName + ' stem gevonden. Op een iPhone/iPad: Instellingen → Toegankelijkheid → Gesproken content → Stemmen → ' + (currentLang === 'en' ? 'Engels' : 'Nederlands') + '.';
  }

  langSelect.addEventListener('change', () => {
    langPref = langSelect.value;
    try { localStorage.setItem('vh_lang', langPref); } catch (e) {}
    refreshLang();
    if (voices.length) renderVoiceSelect();
  });
  showAllVoices.addEventListener('change', () => {
    showAll = showAllVoices.checked;
    try { localStorage.setItem('vh_showAll', showAll ? '1' : '0'); } catch (e) {}
    renderVoiceSelect();
  });

  voiceSelect.addEventListener('change', () => {
    try {
      if (voiceSelect.value) localStorage.setItem(chosenVoiceKey(), voiceSelect.value);
      else localStorage.removeItem(chosenVoiceKey());
    } catch (e) {}
    playVoiceSample();
  });
  btnVoiceTest.addEventListener('click', playVoiceSample);

  function playVoiceSample(){
    if (!('speechSynthesis' in window)) return;
    if (isPlaying || isPaused) stopPlayback();
    cancelSpeech();
    const voice = getSelectedVoice();
    const name = voice ? voice.name : (currentLang === 'en' ? 'your voice' : 'je stem');
    const utter = new SpeechSynthesisUtterance(currentLang === 'en'
      ? 'Hello, I am ' + name + '. This is how I sound when I read aloud.'
      : 'Hallo, ik ben ' + name + '. Zo klink ik als ik voorlees.');
    if (voice) utter.voice = voice;
    utter.rate = parseFloat(rateSlider.value);
    utter.pitch = voicePitch();
    utter.volume = parseFloat(getOpt('volume'));
    utter.lang = (voice && voice.lang) || FALLBACK_LANG[currentLang];
    speechSynthesis.speak(utter);
  }

  btnGirl.addEventListener('click', () => {
    genderPref = 'girl';
    localStorage.setItem('vh_gender','girl');
    applyGenderSelection();
  });
  btnBoy.addEventListener('click', () => {
    genderPref = 'boy';
    localStorage.setItem('vh_gender','boy');
    applyGenderSelection();
  });

  speechSynthesis.addEventListener('voiceschanged', loadVoices);
  loadVoices();

  // ---- Speed ----
  function rateText(r){
    if (r <= 0.7) return 'Heel rustig';
    if (r <= 0.9) return 'Rustig';
    if (r <= 1.05) return 'Normaal';
    return 'Vlot';
  }
  function setRate(r){
    rateSlider.value = r;
    rateLabel.textContent = rateText(parseFloat(r));
    speedPresets.forEach(b => b.classList.toggle('active', Math.abs(parseFloat(b.dataset.rate) - parseFloat(r)) < 0.001));
    localStorage.setItem('vh_rate', r);
  }
  const savedRate = localStorage.getItem('vh_rate');
  setRate(savedRate ? parseFloat(savedRate) : 0.8);

  rateSlider.addEventListener('input', () => setRate(parseFloat(rateSlider.value)));
  speedPresets.forEach(btn => {
    btn.addEventListener('click', () => setRate(parseFloat(btn.dataset.rate)));
  });

  // ---- Meer opties ----
  const pitchSlider = document.getElementById('pitchSlider');
  const pitchLabel = document.getElementById('pitchLabel');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeLabel = document.getElementById('volumeLabel');
  const pauseSelect = document.getElementById('pauseSelect');
  const spacingSelect = document.getElementById('spacingSelect');
  const themeSelect = document.getElementById('themeSelect');
  const wordHighlight = document.getElementById('wordHighlight');
  const letterSelect = document.getElementById('letterSelect');
  const focusMode = document.getElementById('focusMode');
  const loopMode = document.getElementById('loopMode');
  const OPT_DEFAULTS = { pitch: '1', volume: '1', pause: '260', spacing: '1.9', theme: 'green', words: '1', letter: '0', focus: '0', loop: '0' };

  function getOpt(k){
    try { return localStorage.getItem('vh_opt_' + k) || OPT_DEFAULTS[k]; } catch (e) { return OPT_DEFAULTS[k]; }
  }
  function setOpt(k, v){
    try { localStorage.setItem('vh_opt_' + k, v); } catch (e) {}
  }
  function pitchMultiplier(){ return parseFloat(getOpt('pitch')) || 1; }
  function voicePitch(){
    const base = getChosenVoice() ? 1.0 : (GENDER_PITCH[genderPref] || 1.0);
    return Math.min(2, Math.max(0.1, base * pitchMultiplier()));
  }
  function applyOptions(){
    const pitch = parseFloat(getOpt('pitch'));
    pitchSlider.value = pitch;
    pitchLabel.textContent = pitch < 0.9 ? 'Lager' : pitch > 1.1 ? 'Hoger' : 'Normaal';
    const vol = parseFloat(getOpt('volume'));
    volumeSlider.value = vol;
    volumeLabel.textContent = Math.round(vol * 100) + '%';
    pauseSelect.value = getOpt('pause');
    spacingSelect.value = getOpt('spacing');
    themeSelect.value = getOpt('theme');
    wordHighlight.checked = getOpt('words') === '1';
    letterSelect.value = getOpt('letter');
    focusMode.checked = getOpt('focus') === '1';
    loopMode.checked = getOpt('loop') === '1';
    const root = document.documentElement;
    root.style.setProperty('--read-line', getOpt('spacing'));
    root.style.setProperty('--read-letter', getOpt('letter'));
    if (focusMode.checked) root.setAttribute('data-focus', ''); else root.removeAttribute('data-focus');
    root.setAttribute('data-read-theme', getOpt('theme'));
    if (wordHighlight.checked) root.removeAttribute('data-no-word-highlight');
    else root.setAttribute('data-no-word-highlight', '');
  }
  [['pitch', pitchSlider, 'input'], ['volume', volumeSlider, 'input'], ['pause', pauseSelect, 'change'],
   ['spacing', spacingSelect, 'change'], ['theme', themeSelect, 'change'], ['letter', letterSelect, 'change']].forEach(([k, el, ev]) => {
    el.addEventListener(ev, () => { setOpt(k, el.value); applyOptions(); });
  });
  focusMode.addEventListener('change', () => { setOpt('focus', focusMode.checked ? '1' : '0'); applyOptions(); });
  loopMode.addEventListener('change', () => { setOpt('loop', loopMode.checked ? '1' : '0'); });
  wordHighlight.addEventListener('change', () => { setOpt('words', wordHighlight.checked ? '1' : '0'); applyOptions(); });
  document.getElementById('btnResetOptions').addEventListener('click', () => {
    Object.keys(OPT_DEFAULTS).forEach(k => setOpt(k, OPT_DEFAULTS[k]));
    applyOptions();
  });
  applyOptions();

  // ---- Text tools ----
  btnClear.addEventListener('click', () => {
    releaseWakeLock();
    cancelSpeech();
    isPlaying = false;
    isPaused = false;
    exitReadingMode();
    readingView.innerHTML = '';
    sentenceEls = [];
    currentIndex = -1;
    textInput.value = '';
    refreshLang();
    textInput.focus();
    btnPlay.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;
    btnRestart.disabled = true;
    setStatus('');
  });
  btnFontSize.addEventListener('click', () => {
    readSize = readSize >= 34 ? 22 : readSize + 4;
    document.documentElement.style.setProperty('--read-size', readSize + 'px');
    localStorage.setItem('vh_readSize', readSize);
  });
  btnFont.addEventListener('click', () => {
    kidFont = !kidFont;
    document.body.classList.toggle('font-normal', !kidFont);
    btnFont.textContent = '🔤 Kindvriendelijk lettertype: ' + (kidFont ? 'aan' : 'uit');
    localStorage.setItem('vh_kidFont', kidFont ? 'on' : 'off');
  });

  // ---- Reading engine ----
  let sentenceEls = []; // { el, words: [{el, start, end}], text }
  let queue = [];
  let currentIndex = -1;
  let isPaused = false;
  let isPlaying = false;
  // Elke keer dat het voorlezen wordt onderbroken, verandert het token. Zo
  // negeren de callbacks van een afgebroken zin (die in sommige browsers toch
  // nog 'end' of 'error' melden) en gaat het niet dubbel of te ver door.
  let playToken = 0;
  function cancelSpeech(){
    playToken++;
    speechSynthesis.cancel();
  }

  function buildReadingView(){
    refreshLang();
    const sentences = splitSentences(textInput.value);
    readingView.innerHTML = '';
    sentenceEls = [];
    sentences.forEach(sentText => {
      const sEl = document.createElement('span');
      sEl.className = 'sentence';
      const words = sentText.split(/(\s+)/);
      const wordData = [];
      let offset = 0;
      words.forEach(chunk => {
        if (chunk.trim() === '') {
          sEl.appendChild(document.createTextNode(chunk));
        } else {
          const wEl = document.createElement('span');
          wEl.className = 'word';
          wEl.textContent = chunk;
          sEl.appendChild(wEl);
          wordData.push({ el: wEl, start: offset, end: offset + chunk.length });
        }
        offset += chunk.length;
      });
      sEl.appendChild(document.createTextNode(' '));
      readingView.appendChild(sEl);
      sentenceEls.push({ el: sEl, words: wordData, text: sentText });
    });
    return sentences;
  }

  function clearHighlights(){
    sentenceEls.forEach(s => {
      s.el.classList.remove('current');
      s.words.forEach(w => w.el.classList.remove('current'));
    });
  }

  function setStatus(msg){ status.textContent = msg; }

  // ---- Scherm aan houden tijdens het voorlezen ----
  let wakeLock = null;
  async function acquireWakeLock(){
    if (!('wakeLock' in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { wakeLock = null; }
  }
  function releaseWakeLock(){
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  // Het slot vervalt als het tabblad verborgen wordt; vraag het opnieuw aan zodra de pagina weer zichtbaar is.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isPlaying) acquireWakeLock();
  });

  function enterReadingMode(){
    textInput.classList.add('hidden');
    readingView.classList.add('active');
    btnEdit.style.display = 'inline-block';
  }
  function exitReadingMode(){
    textInput.classList.remove('hidden');
    readingView.classList.remove('active', 'playing');
    btnEdit.style.display = 'none';
  }

  function speakSentence(i){
    if (i >= sentenceEls.length) {
      if (getOpt('loop') === '1' && isPlaying && sentenceEls.length) {
        setTimeout(() => { if (isPlaying) speakSentence(0); }, Math.max(parseInt(getOpt('pause'), 10), 800));
        return;
      }
      finishPlayback();
      return;
    }
    currentIndex = i;
    readingView.classList.add('playing');
    clearHighlights();
    const s = sentenceEls[i];
    s.el.classList.add('current');
    s.el.scrollIntoView({ block: 'center', behavior: 'smooth' });

    const token = playToken;
    const utter = new SpeechSynthesisUtterance(s.text);
    const voice = getSelectedVoice();
    if (voice) utter.voice = voice;
    utter.rate = parseFloat(rateSlider.value);
    utter.pitch = voicePitch();
    utter.volume = parseFloat(getOpt('volume'));
    utter.lang = (voice && voice.lang) || FALLBACK_LANG[currentLang];

    utter.onboundary = (e) => {
      if (token !== playToken) return;
      if (e.name !== 'word' && e.charIndex === undefined) return;
      const word = s.words.find(w => e.charIndex >= w.start && e.charIndex < w.end) ||
                   s.words.find(w => e.charIndex <= w.start);
      s.words.forEach(w => w.el.classList.remove('current'));
      if (word) word.el.classList.add('current');
    };

    utter.onend = () => {
      if (!isPlaying || token !== playToken) return;
      setTimeout(() => { if (isPlaying && token === playToken) speakSentence(i + 1); }, parseInt(getOpt('pause'), 10));
    };
    utter.onerror = (e) => {
      if (e && (e.error === 'canceled' || e.error === 'interrupted')) return;
      if (isPlaying && token === playToken) setTimeout(() => { if (isPlaying && token === playToken) speakSentence(i + 1); }, 100);
    };

    speechSynthesis.speak(utter);
  }

  function startPlayback(fromIndex){
    if (!('speechSynthesis' in window)) {
      setStatus('Sorry, deze browser ondersteunt geen voorlezen.');
      return;
    }
    if (!sentenceEls.length || fromIndex === 0) {
      const sentences = buildReadingView();
      if (!sentences.length) {
        setStatus('Typ of plak eerst een tekstje om voor te lezen.');
        return;
      }
    }
    enterReadingMode();
    isPlaying = true;
    isPaused = false;
    btnPlay.disabled = true;
    btnPause.disabled = false;
    btnStop.disabled = false;
    btnRestart.disabled = false;
    setStatus('Bezig met voorlezen...');
    acquireWakeLock();
    speakSentence(fromIndex || 0);
  }

  function finishPlayback(){
    readingView.classList.remove('playing');
    releaseWakeLock();
    isPlaying = false;
    isPaused = false;
    clearHighlights();
    btnPlay.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;
    setStatus('Klaar! ✅');
  }

  function stopPlayback(){
    readingView.classList.remove('playing');
    releaseWakeLock();
    isPlaying = false;
    isPaused = false;
    cancelSpeech();
    clearHighlights();
    currentIndex = -1;
    btnPlay.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;
    setStatus('Gestopt.');
  }

  btnPlay.addEventListener('click', () => {
    if (isPaused) {
      isPaused = false;
      isPlaying = true;
      speechSynthesis.resume();
      acquireWakeLock();
      btnPlay.disabled = true;
      btnPause.disabled = false;
      setStatus('Bezig met voorlezen...');
    } else {
      startPlayback(0);
    }
  });

  btnPause.addEventListener('click', () => {
    if (!isPlaying) return;
    isPaused = true;
    isPlaying = false;
    speechSynthesis.pause();
    releaseWakeLock();
    btnPlay.disabled = false;
    btnPause.disabled = true;
    setStatus('Gepauzeerd.');
  });

  btnStop.addEventListener('click', stopPlayback);

  btnRestart.addEventListener('click', () => {
    cancelSpeech();
    isPaused = false;
    startPlayback(0);
  });

  function jumpTo(idx){
    cancelSpeech();
    isPaused = false;
    startPlayback(sentenceEls.length ? idx : 0);
  }

  // Vorige/volgende zin.
  function jumpBy(delta){
    if (!textInput.value.trim()) { setStatus('Typ of plak eerst een tekstje om voor te lezen.'); return; }
    if (!sentenceEls.length) { jumpTo(0); return; }
    const base = currentIndex < 0 ? (delta > 0 ? -1 : 1) : currentIndex;
    const idx = Math.max(0, Math.min(sentenceEls.length - 1, base + delta));
    jumpTo(idx);
  }
  btnPrev.addEventListener('click', () => jumpBy(-1));
  btnNext.addEventListener('click', () => jumpBy(1));

  // Tik op een zin om vanaf daar verder te lezen.
  readingView.addEventListener('click', (e) => {
    const sEl = e.target.closest('.sentence');
    if (!sEl) return;
    const idx = sentenceEls.findIndex(s => s.el === sEl);
    if (idx < 0) return;
    jumpTo(idx);
  });

  btnEdit.addEventListener('click', () => {
    releaseWakeLock();
    cancelSpeech();
    isPlaying = false;
    isPaused = false;
    exitReadingMode();
    btnPlay.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;
    btnRestart.disabled = true;
    setStatus('');
  });

  textInput.addEventListener('input', () => {
    sentenceEls = [];
    currentIndex = -1;
    refreshLang();
  });

  // ---- Photo / scan (OCR) ----
  const cameraInput = document.getElementById('cameraInput');
  const fileInput = document.getElementById('fileInput');
  const scanPreview = document.getElementById('scanPreview');
  const scanImg = document.getElementById('scanImg');
  const btnRemoveScan = document.getElementById('btnRemoveScan');
  const btnReadCrop = document.getElementById('btnReadCrop');
  const btnFullImage = document.getElementById('btnFullImage');
  const cropStage = document.getElementById('cropStage');
  const cropBox = document.getElementById('cropBox');
  const ocrProgressWrap = document.getElementById('ocrProgressWrap');
  const ocrBarFill = document.getElementById('ocrBarFill');
  const ocrStatus = document.getElementById('ocrStatus');

  let ocrBusy = false;
  let scanImgUrl = null;
  let pendingFile = null;
  // Uitsnede als fractie (0-1) van de foto.
  let crop = { x: 0, y: 0, w: 1, h: 1 };

  const OCR_STATUS_LABELS = {
    'loading tesseract core': 'Tekstherkenning laden...',
    'initializing tesseract': 'Even opstarten...',
    'loading language traineddata': 'Woordenboek laden...',
    'initializing api': 'Bijna klaar om te lezen...',
    'recognizing text': 'Tekst herkennen...'
  };

  function setOcrStatus(msg, progress, isError){
    ocrStatus.textContent = msg || '';
    ocrStatus.style.color = isError ? '#d0554b' : '';
    if (progress === undefined || progress === null) {
      ocrProgressWrap.style.display = 'none';
    } else {
      ocrProgressWrap.style.display = 'block';
      ocrBarFill.style.width = Math.round(progress * 100) + '%';
    }
  }

  function setScanControlsDisabled(disabled){
    cameraInput.disabled = disabled;
    fileInput.disabled = disabled;
    btnRemoveScan.disabled = disabled;
    btnReadCrop.disabled = disabled;
    btnFullImage.disabled = disabled;
  }

  const MIN_CROP = 0.08;

  function renderCrop(){
    cropBox.style.left = (crop.x * 100) + '%';
    cropBox.style.top = (crop.y * 100) + '%';
    cropBox.style.width = (crop.w * 100) + '%';
    cropBox.style.height = (crop.h * 100) + '%';
  }

  function resetCrop(full){
    const m = full ? 0 : 0.04;
    crop = { x: m, y: m, w: 1 - 2 * m, h: 1 - 2 * m };
    renderCrop();
  }

  function showPreview(file){
    if (scanImgUrl) URL.revokeObjectURL(scanImgUrl);
    scanImgUrl = URL.createObjectURL(file);
    scanImg.src = scanImgUrl;
    scanPreview.style.display = 'block';
    resetCrop(false);
  }

  function clearScan(){
    if (scanImgUrl) { URL.revokeObjectURL(scanImgUrl); scanImgUrl = null; }
    pendingFile = null;
    scanImg.src = '';
    scanPreview.style.display = 'none';
    cameraInput.value = '';
    fileInput.value = '';
    setOcrStatus('', null);
  }

  // Kader verslepen (verplaatsen) of aan de hoeken/randen vergroten en verkleinen.
  let drag = null;
  cropBox.addEventListener('pointerdown', (e) => {
    if (ocrBusy) return;
    const handle = e.target.closest('.crop-handle');
    drag = {
      mode: handle ? handle.dataset.h : 'move',
      startX: e.clientX, startY: e.clientY,
      rect: cropStage.getBoundingClientRect(),
      start: { ...crop }
    };
    cropBox.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cropBox.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / drag.rect.width;
    const dy = (e.clientY - drag.startY) / drag.rect.height;
    const c = drag.start;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (drag.mode === 'move') {
      crop = { x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h), w: c.w, h: c.h };
    } else {
      let left = c.x, right = c.x + c.w, top = c.y, bottom = c.y + c.h;
      if (drag.mode.includes('w')) left = clamp(left + dx, 0, right - MIN_CROP);
      if (drag.mode.includes('e')) right = clamp(right + dx, left + MIN_CROP, 1);
      if (drag.mode.includes('n')) top = clamp(top + dy, 0, bottom - MIN_CROP);
      if (drag.mode.includes('s')) bottom = clamp(bottom + dy, top + MIN_CROP, 1);
      crop = { x: left, y: top, w: right - left, h: bottom - top };
    }
    renderCrop();
  });
  const endDrag = () => { drag = null; };
  cropBox.addEventListener('pointerup', endDrag);
  cropBox.addEventListener('pointercancel', endDrag);

  btnFullImage.addEventListener('click', () => resetCrop(true));
  btnReadCrop.addEventListener('click', () => { if (pendingFile) runOCR(pendingFile); });

  function startCrop(file){
    if (ocrBusy) return;
    pendingFile = file;
    showPreview(file);
    setOcrStatus('Kies alleen het stuk met tekst en tik op “Tekst lezen”.', null);
    scanPreview.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Verbetert de foto voor tekstherkenning: schaalt naar een goede grootte,
  // maakt grijs, haalt schaduw en ongelijk licht weg (de achtergrond wordt
  // overal even licht) en rekt daarna het contrast op. Dat geeft minder ruis
  // en dus minder fouten en losse leestekens.
  function preprocessImage(file, area){
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        try {
          const a = area || { x: 0, y: 0, w: 1, h: 1 };
          const sx = Math.round(a.x * img.width), sy = Math.round(a.y * img.height);
          const sw = Math.max(1, Math.round(a.w * img.width)), sh = Math.max(1, Math.round(a.h * img.height));
          const longest = Math.max(sw, sh);
          const target = Math.min(2400, Math.max(1600, longest));
          const scale = target / longest;
          const canvas = document.createElement('canvas');
          const W = canvas.width = Math.round(sw * scale);
          const H = canvas.height = Math.round(sh * scale);
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
          const data = ctx.getImageData(0, 0, W, H);
          const px = data.data;
          const n = W * H;
          const gray = new Uint8ClampedArray(n);
          let sum = 0;
          for (let i = 0, j = 0; j < n; i += 4, j++) {
            gray[j] = 0.299 * px[i] + 0.587 * px[i+1] + 0.114 * px[i+2];
            sum += gray[j];
          }
          // Lichte tekst op een donkere achtergrond eerst omdraaien.
          if (sum / n < 110) for (let j = 0; j < n; j++) gray[j] = 255 - gray[j];

          normalizeBackground(gray, W, H);

          const hist = new Array(256).fill(0);
          for (let j = 0; j < n; j++) hist[gray[j]]++;
          let low = 0, high = 255, acc = 0;
          for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { low = v; break; } }
          acc = 0;
          for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.01) { high = v; break; } }
          const range = Math.max(1, high - low);
          for (let i = 0, j = 0; j < n; i += 4, j++) {
            const v = Math.max(0, Math.min(255, Math.round((gray[j] - low) * 255 / range)));
            px[i] = px[i+1] = px[i+2] = v;
            px[i+3] = 255;
          }
          ctx.putImageData(data, 0, 0);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            resolve(blob || file);
          }, 'image/png');
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(file);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  // Schat de achtergrond (het papier) op een verkleinde kopie: het lichtste
  // punt in de buurt (de donkere letters vallen zo weg), daarna uitgesmeerd.
  // Elke pixel wordt gedeeld door die achtergrond, zodat papier in de schaduw
  // net zo wit wordt als papier in het licht.
  function normalizeBackground(gray, W, H){
    const f = 8;
    const w = Math.max(1, Math.ceil(W / f)), h = Math.max(1, Math.ceil(H / f));
    const small = new Float32Array(w * h);
    for (let y = 0; y < H; y++) {
      const row = (y / f | 0) * w;
      for (let x = 0; x < W; x++) {
        const k = row + (x / f | 0);
        const g = gray[y * W + x];
        if (g > small[k]) small[k] = g;
      }
    }
    const pass = (src, r, useMax) => {
      const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let v = 0, c = 0;
        for (let d = -r; d <= r; d++) {
          const xx = Math.min(w - 1, Math.max(0, x + d));
          const s = src[y * w + xx];
          if (useMax) { if (s > v) v = s; } else { v += s; c++; }
        }
        tmp[y * w + x] = useMax ? v : v / c;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let v = 0, c = 0;
        for (let d = -r; d <= r; d++) {
          const yy = Math.min(h - 1, Math.max(0, y + d));
          const s = tmp[yy * w + x];
          if (useMax) { if (s > v) v = s; } else { v += s; c++; }
        }
        out[y * w + x] = useMax ? v : v / c;
      }
      return out;
    };
    const bg = pass(pass(small, 2, true), 3, false);
    for (let y = 0; y < H; y++) {
      const fy = Math.min(h - 1, y / f);
      const y0 = fy | 0, y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < W; x++) {
        const fx = Math.min(w - 1, x / f);
        const x0 = fx | 0, x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
        const b = (bg[y0 * w + x0] * (1 - tx) + bg[y0 * w + x1] * tx) * (1 - ty)
                + (bg[y1 * w + x0] * (1 - tx) + bg[y1 * w + x1] * tx) * ty;
        const j = y * W + x;
        gray[j] = b > 8 ? gray[j] * 255 / b : gray[j];
      }
    }
  }

  // De tekstherkenning wordt één keer opgestart en daarna hergebruikt,
  // zodat een tweede foto veel sneller gelezen wordt.
  let ocrWorker = null, ocrWorkerLang = '', ocrLogger = null;
  async function getOcrWorker(lang){
    if (ocrWorker && ocrWorkerLang === lang) return ocrWorker;
    if (ocrWorker) { try { await ocrWorker.terminate(); } catch (e) {} ocrWorker = null; }
    ocrWorker = await Tesseract.createWorker(lang, 1, { logger: (m) => { if (ocrLogger) ocrLogger(m); } });
    ocrWorkerLang = lang;
    return ocrWorker;
  }

  async function runOCR(file){
    if (ocrBusy) return;
    if (typeof Tesseract === 'undefined') {
      setOcrStatus('Tekstherkenning kon niet laden. Controleer je internetverbinding en probeer opnieuw.', null, true);
      return;
    }
    ocrBusy = true;
    setScanControlsDisabled(true);
    setOcrStatus('Voorbereiden...', 0);
    try {
      const processed = await preprocessImage(file, { ...crop });
      ocrLogger = (m) => {
        const label = OCR_STATUS_LABELS[m.status] || 'Bezig...';
        setOcrStatus(label, typeof m.progress === 'number' ? m.progress : 0);
      };
      const worker = await getOcrWorker(langPref === 'en' ? 'eng' : langPref === 'nl' ? 'nld' : 'nld+eng');
      const result = await worker.recognize(processed);
      const text = ocrToText(result.data);
      if (!text) {
        setOcrStatus('Geen tekst gevonden. Maak het kader om de tekst heen wat groter, of probeer een scherpere foto.', null, true);
      } else {
        releaseWakeLock();
        cancelSpeech();
        isPlaying = false; isPaused = false;
        exitReadingMode();
        btnPlay.disabled = false; btnPause.disabled = true; btnStop.disabled = true; btnRestart.disabled = true;
        textInput.value = text;
        refreshLang();
        sentenceEls = []; currentIndex = -1;
        setOcrStatus('Tekst gevonden! Controleer de tekst hierboven en klik daarna op ▶️ Afspelen.', null);
        textInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    } catch (err) {
      if (ocrWorker) { try { ocrWorker.terminate(); } catch (e) {} ocrWorker = null; }
      setOcrStatus('Kon de tekst niet herkennen. Controleer je internetverbinding en probeer opnieuw.', null, true);
    } finally {
      ocrLogger = null;
      ocrBusy = false;
      setScanControlsDisabled(false);
    }
  }

  cameraInput.addEventListener('change', () => {
    const file = cameraInput.files && cameraInput.files[0];
    if (file) startCrop(file);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) startCrop(file);
  });
  btnRemoveScan.addEventListener('click', clearScan);

  // ---- Bewaarde teksten (max 20, lokaal op dit apparaat) ----
  const MAX_SAVED = 20;
  const saveNameInput = document.getElementById('saveNameInput');
  const btnSaveText = document.getElementById('btnSaveText');
  const savedList = document.getElementById('savedList');
  const savedStatus = document.getElementById('savedStatus');

  function loadSavedTexts(){
    try {
      return JSON.parse(localStorage.getItem('vh_savedTexts') || '[]');
    } catch (e) {
      return [];
    }
  }

  function persistSavedTexts(items){
    try {
      localStorage.setItem('vh_savedTexts', JSON.stringify(items));
      return true;
    } catch (e) {
      savedStatus.textContent = 'Bewaren is niet gelukt (opslag vol of uitgeschakeld).';
      return false;
    }
  }

  function openSavedText(id){
    const item = loadSavedTexts().find(i => i.id === id);
    if (!item) return;
    releaseWakeLock();
    cancelSpeech();
    isPlaying = false;
    isPaused = false;
    exitReadingMode();
    readingView.innerHTML = '';
    sentenceEls = [];
    currentIndex = -1;
    textInput.value = item.text;
    refreshLang();
    btnPlay.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;
    btnRestart.disabled = true;
    setStatus('');
    textInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function deleteSavedText(id){
    persistSavedTexts(loadSavedTexts().filter(i => i.id !== id));
    renderSavedList();
  }

  function renderSavedList(){
    const items = loadSavedTexts();
    savedList.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'saved-empty';
      li.textContent = 'Nog geen teksten bewaard.';
      savedList.appendChild(li);
    } else {
      items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'saved-item';

        const nameBtn = document.createElement('button');
        nameBtn.type = 'button';
        nameBtn.className = 'name';
        nameBtn.textContent = item.name;
        nameBtn.title = 'Klik om te openen';
        nameBtn.addEventListener('click', () => openSavedText(item.id));

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'del';
        delBtn.textContent = '✖';
        delBtn.title = 'Verwijderen';
        delBtn.addEventListener('click', () => deleteSavedText(item.id));

        li.appendChild(nameBtn);
        li.appendChild(delBtn);
        savedList.appendChild(li);
      });
    }
    savedStatus.textContent = items.length + ' / ' + MAX_SAVED + ' bewaard';
  }

  btnSaveText.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (!text) {
      savedStatus.textContent = 'Er is nog geen tekst om te bewaren.';
      return;
    }
    const items = loadSavedTexts();
    if (items.length >= MAX_SAVED) {
      savedStatus.textContent = 'Je hebt al ' + MAX_SAVED + ' teksten bewaard. Verwijder er eerst een.';
      return;
    }
    const name = saveNameInput.value.trim() || (text.slice(0, 28) + (text.length > 28 ? '…' : ''));
    const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    items.push({ id, name, text });
    if (!persistSavedTexts(items)) return;
    saveNameInput.value = '';
    renderSavedList();
    savedStatus.textContent += ' – bewaard ✅';
  });

  renderSavedList();

  // ---- Installeerbaar + offline (service worker) ----
  // ---- Op beginscherm zetten ----
  (function(){
    const card = document.getElementById('installCard');
    const iosBox = document.getElementById('installIos');
    const otherBox = document.getElementById('installOther');
    const btnInstall = document.getElementById('btnInstall');
    const btnShow = document.getElementById('btnShowInstall');
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (standalone) return;
    // iPadOS meldt zich als Mac, maar heeft een aanraakscherm.
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let deferred = null;
    let dismissed = false;
    try { dismissed = localStorage.getItem('vh_install_dismissed') === '1'; } catch (e) {}

    function show(){
      iosBox.hidden = !isIos;
      otherBox.hidden = isIos || !deferred;
      if (!isIos && !deferred) return;
      card.hidden = false;
      btnShow.hidden = true;
    }
    function hide(){
      card.hidden = true;
      btnShow.hidden = !(isIos || deferred);
    }
    document.getElementById('installClose').addEventListener('click', () => {
      try { localStorage.setItem('vh_install_dismissed', '1'); } catch (e) {}
      hide();
    });
    btnShow.addEventListener('click', show);
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      dismissed ? hide() : show();
    });
    btnInstall.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) {}
      deferred = null;
      hide();
    });
    window.addEventListener('appinstalled', () => { deferred = null; card.hidden = true; btnShow.hidden = true; });
    if (isIos) dismissed ? hide() : show();
  })();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
