const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { detectLang, splitSentences, isNatural, joinOcrLines, ocrToText } = require('../text-utils.js');

test('splitst meerdere zinnen op één regel', () => {
  assert.deepEqual(splitSentences('Hallo. Dag allemaal! Tot ziens?'), ['Hallo.', 'Dag allemaal!', 'Tot ziens?']);
});

test('splitst ook op nieuwe regels en slaat lege regels over', () => {
  assert.deepEqual(splitSentences('Een.\n\nTwee zonder punt\nDrie.'), ['Een.', 'Twee zonder punt', 'Drie.']);
});

test('lege tekst geeft geen zinnen', () => {
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences('  \n '), []);
  assert.deepEqual(splitSentences(undefined), []);
});

test('tekst zonder leesteken blijft één zin', () => {
  assert.deepEqual(splitSentences('Gewoon een stukje tekst'), ['Gewoon een stukje tekst']);
});

test('breekt niet af bij Nederlandse afkortingen', () => {
  assert.deepEqual(splitSentences('Dhr. Jansen woont hier. Mevr. De Vries ook.'), ['Dhr. Jansen woont hier.', 'Mevr. De Vries ook.']);
  assert.deepEqual(splitSentences('Er zijn dieren, o.a. katten en honden. Leuk!'), ['Er zijn dieren, o.a. katten en honden.', 'Leuk!']);
  assert.deepEqual(splitSentences('Bijv. een hond, enz. Daarna gaan we.'), ['Bijv. een hond, enz.', 'Daarna gaan we.']);
});

test('breekt niet af bij initialen en Engelse titels', () => {
  assert.deepEqual(splitSentences('J. K. Rowling schreef het. Mr. Smith las het.'), ['J. K. Rowling schreef het.', 'Mr. Smith las het.']);
});

test('breekt niet af bij decimalen en bij een kleine letter erna', () => {
  assert.deepEqual(splitSentences('Het kost 3.50 euro. Ja.'), ['Het kost 3.50 euro.', 'Ja.']);
  assert.deepEqual(splitSentences('Wacht... even maar. Klaar.'), ['Wacht... even maar.', 'Klaar.']);
});

test('aanhalingstekens blijven bij de zin', () => {
  assert.deepEqual(splitSentences('Hij zei: "Kom maar." Ze kwam.'), ['Hij zei: "Kom maar."', 'Ze kwam.']);
});

test('! en ? splitsen altijd', () => {
  assert.deepEqual(splitSentences('Wat? hij ging weg! ok.'), ['Wat?', 'hij ging weg!', 'ok.']);
});

test('detectLang herkent Nederlands en Engels', () => {
  assert.equal(detectLang('Het was een mooie dag en ik ging naar de winkel.'), 'nl');
  assert.equal(detectLang('The cat was on the mat and it said hello to the dog.'), 'en');
});

test('detectLang valt terug op Nederlands bij weinig informatie', () => {
  assert.equal(detectLang(''), 'nl');
  assert.equal(detectLang('Hello'), 'nl');
});

test('isNatural herkent natuurlijke stemmen aan de naam', () => {
  assert.equal(isNatural({ name: 'Microsoft Libby Online (Natural)' }), true);
  assert.equal(isNatural({ name: 'Daniel (Enhanced)' }), true);
  assert.equal(isNatural({ name: 'Google UK English Female' }), true);
  assert.equal(isNatural({ name: 'eSpeak English' }), false);
  assert.equal(isNatural(null), false);
});

test('versienummer in app.js en sw.js is gelijk', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const a = app.match(/APP_VERSION = '([^']+)'/);
  const s = sw.match(/VERSION = 'voorleeshulp-v([^']+)'/);
  assert.ok(a && s, 'versie niet gevonden');
  assert.equal(s[1], a[1]);
});

test('sw.js cachet text-utils.js en index.html laadt het vóór app.js', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(sw, /'text-utils\.js'/);
  assert.ok(html.indexOf('text-utils.js') > -1 && html.indexOf('text-utils.js') < html.indexOf('src="app.js"'));
});

const w = (text, confidence = 95) => ({ text, confidence });
const line = (s, confidence = 95) => ({ confidence, words: s.split(' ').map(t => w(t)) });

test('joinOcrLines plakt regels van een alinea aan elkaar', () => {
  assert.equal(joinOcrLines(['Er was eens een klein', 'konijntje dat Timo heette.']),
    'Er was eens een klein konijntje dat Timo heette.');
});

test('joinOcrLines herstelt afgebroken woorden', () => {
  assert.equal(joinOcrLines(['Er was eens een klein konijn-', 'tje dat Timo heette.']),
    'Er was eens een klein konijntje dat Timo heette.');
  // Koppelteken voor een hoofdletter blijft staan.
  assert.equal(joinOcrLines(['Het was in Noord-', 'Holland heel mooi weer.']),
    'Het was in Noord-Holland heel mooi weer.');
});

test('joinOcrLines houdt een titel op een eigen regel', () => {
  assert.equal(joinOcrLines(['Hoofdstuk 1', 'Timo woonde in een knus holletje onder de boom.']),
    'Hoofdstuk 1\nTimo woonde in een knus holletje onder de boom.');
});

test('ocrToText maakt één regel per alinea en laat ruis weg', () => {
  const data = { paragraphs: [
    { lines: [line('Er was eens een klein'), line('konijntje.')] },
    { lines: [{ confidence: 30, words: [w('@#', 30)] }] },
    { lines: [line('Hij at graag'), line('verse klaver.')] }
  ] };
  assert.equal(ocrToText(data), 'Er was eens een klein konijntje.\nHij at graag verse klaver.');
  assert.deepEqual(splitSentences(ocrToText(data)), ['Er was eens een klein konijntje.', 'Hij at graag verse klaver.']);
});

test('ocrToText werkt ook zonder alinea-informatie', () => {
  assert.equal(ocrToText({ lines: [line('Een'), line('zin.')] }), 'Een zin.');
  assert.equal(ocrToText({}), '');
});
