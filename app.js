(function(){
  const textInput = document.getElementById('textInput');
  const readingView = document.getElementById('readingView');
  const btnGirl = document.getElementById('btnGirl');
  const btnBoy = document.getElementById('btnBoy');
  const btnPlay = document.getElementById('btnPlay');
  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');
  const btnRestart = document.getElementById('btnRestart');
  const btnEdit = document.getElementById('btnEdit');
  const btnClear = document.getElementById('btnClear');
  const btnFontSize = document.getElementById('btnFontSize');
  const btnFont = document.getElementById('btnFont');
  const rateSlider = document.getElementById('rateSlider');
  const rateLabel = document.getElementById('rateLabel');
  const speedPresets = document.querySelectorAll('.speed-presets button');
  const status = document.getElementById('status');


  let voices = [];
  let genderPref = localStorage.getItem('vh_gender') || 'girl';
  let readSize = parseInt(localStorage.getItem('vh_readSize') || '26', 10);
  let kidFont = localStorage.getItem('vh_kidFont') !== 'off';

  document.documentElement.style.setProperty('--read-size', readSize + 'px');
  document.body.classList.toggle('font-normal', !kidFont);
  btnFont.textContent = '🔤 Kindvriendelijk lettertype: ' + (kidFont ? 'aan' : 'uit');

  const FEMALE_HINTS = ['vrouw','female','fenna','claire','lotte','sophie','samantha','victoria','karen','xenia','anna','ellen','laura','amelie','zosia','marie','lucia','nora','ioana','joana','daria','tina','sara','laila','moira','tessa','monica','paulina','milena'];
  const MALE_HINTS = ['man','male','xander','frank','bart','ruben','daniel','arthur','fred','tom','alex','diego','luca','felix','thomas','jacques','ralph','albert','rishi','junior'];
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
    if (v.lang && v.lang.toLowerCase().startsWith('nl')) s += 10;
    if (v.localService) s += 2;
    return s;
  }

  function loadVoices(){
    voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    autoAssignGenderVoices();
    applyGenderSelection();
  }

  let girlVoice = null, boyVoice = null;

  function getDutchVoicePool(){
    // Alleen Nederlandse stemmen; als een apparaat er geen enkele heeft, vallen we terug op alles zodat de app blijft werken.
    const dutch = voices.filter(v => v.lang.toLowerCase().startsWith('nl'));
    return dutch.length ? dutch : voices;
  }

  function autoAssignGenderVoices(){
    const pool = getDutchVoicePool();

    const girls = pool.filter(v => guessGender(v) === 'girl').sort((a,b)=>scoreVoice(b)-scoreVoice(a));
    const boys = pool.filter(v => guessGender(v) === 'boy').sort((a,b)=>scoreVoice(b)-scoreVoice(a));

    girlVoice = girls[0] || null;
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
  }

  function getSelectedVoice(){
    return (genderPref === 'girl' ? girlVoice : boyVoice) || voices[0];
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

  // ---- Text tools ----
  btnClear.addEventListener('click', () => {
    speechSynthesis.cancel();
    isPlaying = false;
    isPaused = false;
    exitReadingMode();
    readingView.innerHTML = '';
    sentenceEls = [];
    currentIndex = -1;
    textInput.value = '';
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

  function splitSentences(text){
    const trimmed = text.trim();
    if (!trimmed) return [];
    const matches = trimmed.match(/[^.!?\n]+[.!?]*(\n+|$)/g) || [trimmed];
    return matches.map(s => s.trim()).filter(Boolean);
  }

  function buildReadingView(){
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

  function enterReadingMode(){
    textInput.classList.add('hidden');
    readingView.classList.add('active');
    btnEdit.style.display = 'inline-block';
  }
  function exitReadingMode(){
    textInput.classList.remove('hidden');
    readingView.classList.remove('active');
    btnEdit.style.display = 'none';
  }

  function speakSentence(i){
    if (i >= sentenceEls.length) {
      finishPlayback();
      return;
    }
    currentIndex = i;
    clearHighlights();
    const s = sentenceEls[i];
    s.el.classList.add('current');
    s.el.scrollIntoView({ block: 'center', behavior: 'smooth' });

    const utter = new SpeechSynthesisUtterance(s.text);
    const voice = getSelectedVoice();
    if (voice) utter.voice = voice;
    utter.rate = parseFloat(rateSlider.value);
    utter.pitch = GENDER_PITCH[genderPref] || 1.0;
    utter.lang = (voice && voice.lang) || 'nl-NL';

    utter.onboundary = (e) => {
      if (e.name !== 'word' && e.charIndex === undefined) return;
      const word = s.words.find(w => e.charIndex >= w.start && e.charIndex < w.end) ||
                   s.words.find(w => e.charIndex <= w.start);
      s.words.forEach(w => w.el.classList.remove('current'));
      if (word) word.el.classList.add('current');
    };

    utter.onend = () => {
      if (!isPlaying) return;
      setTimeout(() => { if (isPlaying) speakSentence(i + 1); }, 260);
    };
    utter.onerror = () => {
      if (isPlaying) setTimeout(() => speakSentence(i + 1), 100);
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
    speakSentence(fromIndex || 0);
  }

  function finishPlayback(){
    isPlaying = false;
    isPaused = false;
    clearHighlights();
    btnPlay.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;
    setStatus('Klaar! ✅');
  }

  function stopPlayback(){
    isPlaying = false;
    isPaused = false;
    speechSynthesis.cancel();
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
    btnPlay.disabled = false;
    btnPause.disabled = true;
    setStatus('Gepauzeerd.');
  });

  btnStop.addEventListener('click', stopPlayback);

  btnRestart.addEventListener('click', () => {
    speechSynthesis.cancel();
    isPaused = false;
    startPlayback(0);
  });

  btnEdit.addEventListener('click', () => {
    speechSynthesis.cancel();
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
  });

  // ---- Photo / scan (OCR) ----
  const cameraInput = document.getElementById('cameraInput');
  const fileInput = document.getElementById('fileInput');
  const scanPreview = document.getElementById('scanPreview');
  const scanImg = document.getElementById('scanImg');
  const btnRemoveScan = document.getElementById('btnRemoveScan');
  const ocrProgressWrap = document.getElementById('ocrProgressWrap');
  const ocrBarFill = document.getElementById('ocrBarFill');
  const ocrStatus = document.getElementById('ocrStatus');

  let ocrBusy = false;
  let scanImgUrl = null;

  const OCR_STATUS_LABELS = {
    'loading tesseract core': 'Tekstherkenning laden...',
    'initializing tesseract': 'Even opstarten...',
    'loading language traineddata': 'Nederlands woordenboek laden...',
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
  }

  function showPreview(file){
    if (scanImgUrl) URL.revokeObjectURL(scanImgUrl);
    scanImgUrl = URL.createObjectURL(file);
    scanImg.src = scanImgUrl;
    scanPreview.style.display = 'flex';
  }

  function clearScan(){
    if (scanImgUrl) { URL.revokeObjectURL(scanImgUrl); scanImgUrl = null; }
    scanImg.src = '';
    scanPreview.style.display = 'none';
    cameraInput.value = '';
    fileInput.value = '';
    setOcrStatus('', null);
  }

  function resizeImageIfNeeded(file){
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const maxDim = 1800;
        const { width, height } = img;
        if (Math.max(width, height) <= maxDim) {
          URL.revokeObjectURL(url);
          resolve(file);
          return;
        }
        const scale = maxDim / Math.max(width, height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          resolve(blob || file);
        }, 'image/jpeg', 0.92);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  async function runOCR(file){
    if (ocrBusy) return;
    if (typeof Tesseract === 'undefined') {
      setOcrStatus('Tekstherkenning kon niet laden. Controleer je internetverbinding en probeer opnieuw.', null, true);
      return;
    }
    ocrBusy = true;
    setScanControlsDisabled(true);
    showPreview(file);
    setOcrStatus('Voorbereiden...', 0);
    try {
      const processed = await resizeImageIfNeeded(file);
      const result = await Tesseract.recognize(processed, 'nld', {
        logger: (m) => {
          const label = OCR_STATUS_LABELS[m.status] || 'Bezig...';
          setOcrStatus(label, typeof m.progress === 'number' ? m.progress : 0);
        }
      });
      const text = (result.data.text || '').trim();
      if (!text) {
        setOcrStatus('Geen tekst gevonden. Probeer een duidelijkere of scherpere foto.', null, true);
      } else {
        speechSynthesis.cancel();
        isPlaying = false; isPaused = false;
        exitReadingMode();
        btnPlay.disabled = false; btnPause.disabled = true; btnStop.disabled = true; btnRestart.disabled = true;
        textInput.value = text;
        sentenceEls = []; currentIndex = -1;
        setOcrStatus('Tekst gevonden! Controleer de tekst hierboven en klik daarna op ▶️ Afspelen.', null);
        textInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    } catch (err) {
      setOcrStatus('Kon de tekst niet herkennen. Controleer je internetverbinding en probeer opnieuw.', null, true);
    } finally {
      ocrBusy = false;
      setScanControlsDisabled(false);
    }
  }

  cameraInput.addEventListener('change', () => {
    const file = cameraInput.files && cameraInput.files[0];
    if (file) runOCR(file);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) runOCR(file);
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
    localStorage.setItem('vh_savedTexts', JSON.stringify(items));
  }

  function openSavedText(id){
    const item = loadSavedTexts().find(i => i.id === id);
    if (!item) return;
    speechSynthesis.cancel();
    isPlaying = false;
    isPaused = false;
    exitReadingMode();
    readingView.innerHTML = '';
    sentenceEls = [];
    currentIndex = -1;
    textInput.value = item.text;
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
    persistSavedTexts(items);
    saveNameInput.value = '';
    renderSavedList();
  });

  renderSavedList();
})();
