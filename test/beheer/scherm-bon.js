// Scherm Bon indienen: een commissielid dat iets voor het feest heeft voorgeschoten maakt een foto van de bon, vult bedrag,
// waarvoor, categorie en winkel in en tikt op Indienen. Het is direct "Bon ontvangen ✓"; het achterwerk boekt de bon binnen een minuut.
// De foto wordt in de browser verkleind (doelMaat, gedeeld/beelden.js) en meteen verstuurd (beheerBestand), terwijl het formulier bruikbaar blijft.
// Vereist app.js (registreerScherm, el, euro, maakIcoon, beheerApp), api.js (beheerVerzoek, beheerOpslag) en gedeeld/beelden.js.

var BON_CATEGORIEEN = [
  { id: 'eten', tekst: 'Eten' }, { id: 'drinken', tekst: 'Drinken' }, { id: 'huur', tekst: 'Huur' },
  { id: 'materiaal', tekst: 'Materiaal' }, { id: 'activiteiten', tekst: 'Activiteiten' },
  { id: 'communicatie', tekst: 'Communicatie' }, { id: 'overig', tekst: 'Overig' }
];
var BON_MAX_ZIJDE = 1600;
var BON_MAX_BYTES = 10 * 1024 * 1024;
var BON_MIN_DATUM = '2020-01-01';
var BON_MAX_BEDRAG_CENTEN = 1000000;
var BON_FOTO_ONLEESBAAR = 'Deze foto kan de browser niet lezen. Maak een schermafbeelding of kies een andere foto.';
var BON_GEEN_VERBINDING = 'Geen verbinding. Probeer het zo nog eens.';

// Wat er in het formulier staat blijft bewaard zolang de pagina openstaat (ook als je even naar een ander scherm gaat of de lijst bijwerkt).
var bonStaat = null;
var bonVak = null;      // { foto, knop, fouten: { veld: element }, lijst, formulier, ontvangen } van het getekende scherm
var bonApp = null;      // de laatste staat van de schil (stuurOpdracht, momentopname)

function bonVandaag_() {
  var delen = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).forEach(function (d) { delen[d.type] = d.value; });
  return delen.year + '-' + delen.month + '-' + delen.day;
}

function bonMijnNaam_() {
  var s = typeof beheerApp !== 'undefined' ? beheerApp.sessie : null;
  if (!s) return '';
  if (s.naam) return String(s.naam);
  return s.email ? String(s.email).split('@')[0] : '';
}

// Bij uitloggen of een andere login: niets van het formulier of de vorige persoon houden.
function bonVergeet() { bonStaat = null; bonVak = null; bonApp = null; }

function bonNieuweStaat_() {
  return {
    datum: bonVandaag_(), bedrag: '', omschrijving: '', categorie: '', door: bonMijnNaam_(), winkel: '',
    foto: { status: 'geen', nr: 0 },   // status: geen | bezig | klaar | fout
    fouten: {}, wacht: false, bezig: false, ontvangen: false
  };
}

// '12,50', '12.50', '€ 12,50' of '12' -> centen, anders null.
function bonBedragCenten_(tekst) {
  var t = String(tekst || '').replace(/€/g, '').replace(/\s/g, '');
  if (!/^\d{1,6}([.,]\d{1,2})?$/.test(t)) return null;
  var delen = t.replace(',', '.').split('.');
  return Number(delen[0]) * 100 + (delen[1] ? Number((delen[1] + '0').slice(0, 2)) : 0);
}

function bonBedragTekst_(centen) {
  return Math.floor(centen / 100) + ',' + ('0' + (centen % 100)).slice(-2);
}

// De regels van het achterwerk, zodat de fout bij het veld staat en niet pas na het versturen. Geeft { veld: melding }.
function bonControleer_(s) {
  var f = {};
  var c = bonBedragCenten_(s.bedrag);
  if (/\.\d{3}/.test(String(s.bedrag))) f.bedrag = 'Schrijf het bedrag zonder punt, bijvoorbeeld 1234,50.';
  else if (c === null) f.bedrag = 'Vul een bedrag in, bijvoorbeeld 12,50.';
  else if (c <= 0) f.bedrag = 'Het bedrag moet meer dan nul zijn.';
  else if (c > BON_MAX_BEDRAG_CENTEN) f.bedrag = 'Een bon kan hooguit € 10.000 zijn.';
  var om = String(s.omschrijving || '').trim();
  if (!om) f.omschrijving = 'Vul in waarvoor de bon is.';
  else if (om.length > 200) f.omschrijving = 'Hou het onder de 200 tekens.';
  if (!s.categorie) f.categorie = 'Kies een categorie.';
  var door = String(s.door || '').trim();
  if (!door) f.door = 'Vul in wie het geld heeft voorgeschoten.';
  else if (door.length > 80) f.door = 'Hou het onder de 80 tekens.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.datum || '')) f.datum = 'Kies de datum van de bon.';
  else if (s.datum < BON_MIN_DATUM) f.datum = 'Die datum ligt te ver terug.';
  else if (s.datum > bonVandaag_()) f.datum = 'De datum mag niet in de toekomst liggen.';
  if (String(s.winkel || '').trim().length > 100) f.winkel = 'Hou het onder de 100 tekens.';
  return f;
}

// ---- foto ----

function bonLeesBestand_(bestand) {
  return new Promise(function (ok, fout) {
    var lezer = new FileReader();
    lezer.onload = function () { ok(String(lezer.result)); };
    lezer.onerror = function () { fout(new Error('lezen mislukt')); };
    lezer.readAsDataURL(bestand);
  });
}

function bonDecodeer_(bestand) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(bestand, { imageOrientation: 'from-image' }).catch(function () { return bonDecodeerViaImg_(bestand); });
  }
  return bonDecodeerViaImg_(bestand);
}

function bonDecodeerViaImg_(bestand) {
  return new Promise(function (ok, fout) {
    var url = URL.createObjectURL(bestand);
    var img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); ok(img); };
    img.onerror = function () { URL.revokeObjectURL(url); fout(new Error('onleesbaar')); };
    img.src = url;
  });
}

// Een afbeelding wordt verkleind en als jpeg bewaard; een pdf gaat ongewijzigd. Geeft { naam, type, base64, miniatuur }.
function bonMaakLading_(bestand) {
  var naam = bestand.name || 'bon';
  var isPdf = bestand.type === 'application/pdf' || (!bestand.type && /\.pdf$/i.test(naam));
  if (isPdf) {
    if (bestand.size > BON_MAX_BYTES) return Promise.reject(new Error('Deze pdf is groter dan 10 MB. Kies een kleinere.'));
    if (bestand.size === 0) return Promise.reject(new Error('Dit bestand is leeg. Kies een ander bestand.'));
    return bonLeesBestand_(bestand).then(function (url) { return { naam: naam, type: 'application/pdf', base64: url.slice(url.indexOf(',') + 1), miniatuur: '' }; });
  }
  if (!/^image\//.test(bestand.type || '')) return Promise.reject(new Error('Kies een foto of een pdf.'));
  return bonDecodeer_(bestand).then(function (beeld) {
    var b = beeld.width || beeld.naturalWidth, h = beeld.height || beeld.naturalHeight;
    var maat = doelMaat(b, h, BON_MAX_ZIJDE);
    var doek = document.createElement('canvas');
    doek.width = maat.breedte; doek.height = maat.hoogte;
    var tek = doek.getContext('2d');
    tek.fillStyle = '#FFFFFF'; tek.fillRect(0, 0, maat.breedte, maat.hoogte);
    tek.drawImage(beeld, 0, 0, maat.breedte, maat.hoogte);
    if (typeof beeld.close === 'function') beeld.close();
    var url = doek.toDataURL('image/jpeg', 0.8);
    if (url.indexOf('data:image/jpeg') !== 0) throw new Error('onleesbaar');
    var nieuweNaam = naam.replace(/\.[^.]*$/, '') + '.jpg';
    return { naam: nieuweNaam, type: 'image/jpeg', base64: url.slice(url.indexOf(',') + 1), miniatuur: url };
  }).catch(function () { throw new Error(BON_FOTO_ONLEESBAAR); });
}

function bonKiesFoto_(bestand) {
  if (!bestand) return;
  var s = bonStaat;
  var nr = s.foto.nr + 1;
  s.foto = { status: 'bezig', nr: nr, naam: bestand.name || 'bon', miniatuur: '', type: bestand.type };
  s.wacht = false;
  bonTekenFoto_(); bonTekenKnop_();
  bonMaakLading_(bestand).then(function (lading) {
    if (s.foto.nr !== nr) return;
    s.foto.lading = lading; s.foto.miniatuur = lading.miniatuur; s.foto.type = lading.type;
    bonTekenFoto_();
    bonStuurFoto_(nr);
  }, function (fout) {
    if (s.foto.nr !== nr) return;
    s.foto.status = 'fout'; s.foto.melding = fout.message; s.foto.lading = null;
    s.wacht = false;
    bonTekenFoto_(); bonTekenKnop_();
  });
}

function bonStuurFoto_(nr) {
  var s = bonStaat;
  var f = s.foto;
  f.status = 'bezig'; f.melding = '';
  bonTekenFoto_(); bonTekenKnop_();
  beheerVerzoek('beheerBestand', { naam: f.lading.naam, type: f.lading.type, base64: f.lading.base64 }).then(function (a) {
    if (s.foto.nr !== nr) return;
    if (a && a.ok === true && a.bestandId) { f.status = 'klaar'; f.bestandId = a.bestandId; }
    else { f.status = 'fout'; f.melding = (a && a.melding) || 'De foto is niet aangekomen.'; }
    bonNaFoto_();
  }, function () {
    if (s.foto.nr !== nr) return;
    f.status = 'fout'; f.melding = BON_GEEN_VERBINDING;
    bonNaFoto_();
  });
}

function bonNaFoto_() {
  var s = bonStaat;
  var dienIn = s.wacht && s.foto.status === 'klaar';
  if (s.foto.status === 'fout') s.wacht = false;
  bonTekenFoto_(); bonTekenKnop_();
  if (dienIn) bonIndienen_();
}

function bonVerwijderFoto_() {
  bonStaat.foto = { status: 'geen', nr: bonStaat.foto.nr + 1 };
  bonStaat.wacht = false;
  bonTekenFoto_(); bonTekenKnop_();
}

// ---- indienen ----

function bonIndienen_() {
  var s = bonStaat;
  if (s.bezig || s.ontvangen) return;
  s.fouten = bonControleer_(s);
  bonTekenFouten_();
  var eerste = Object.keys(s.fouten)[0];
  if (eerste) {
    s.wacht = false; bonTekenKnop_();
    var veld = bonVak && bonVak.velden[eerste];
    if (veld && veld.focus) veld.focus();
    return;
  }
  if (s.foto.status === 'fout') {   // een gekozen foto die niet is aangekomen: niet stilzwijgend zonder foto indienen
    s.wacht = false; bonTekenFoto_(); bonTekenKnop_();
    var keuze = bonVak && bonVak.foto && bonVak.foto.querySelector('button');
    if (keuze) keuze.focus();
    return;
  }
  if (s.foto.status === 'bezig') { s.wacht = true; bonTekenKnop_(); return; }
  s.wacht = false;
  var gegevens = {
    datum: s.datum, bedrag: bonBedragTekst_(bonBedragCenten_(s.bedrag)), omschrijving: s.omschrijving.trim(),
    categorie: s.categorie, voorgeschotenDoor: s.door.trim(), winkel: s.winkel.trim()
  };
  if (s.foto.status === 'klaar' && s.foto.bestandId) gegevens.bestandId = s.foto.bestandId;
  var uit = bonApp.stuurOpdracht('bonIndienen', gegevens);
  s.ontvangen = true; s.laatste = { bedrag: gegevens.bedrag, omschrijving: gegevens.omschrijving };
  if (bonVak) bonTekenGeheel_();
}

function bonNogEen_() {
  var oud = bonStaat;
  bonStaat = bonNieuweStaat_();
  bonStaat.door = oud.door; bonStaat.datum = oud.datum;
  bonStaat.foto.nr = oud.foto.nr + 1;   // een late foto van de vorige bon doet niet meer mee
  bonTekenGeheel_();
  var eerste = bonVak && bonVak.velden.bedrag;
  if (eerste) eerste.focus();
}

// ---- tekenen ----

function bonVeld_(naam, label, invoer, hulp) {
  var fout = el('p', { class: 'veld-melding melding-fout', id: 'bon-fout-' + naam, hidden: true });
  bonVak.fouten[naam] = fout;
  bonVak.velden[naam] = invoer;
  invoer.setAttribute('aria-describedby', 'bon-fout-' + naam);
  return el('label', { class: 'veld' }, label, hulp ? el('span', { class: 'bon-hulp' }, hulp) : null, invoer, fout);
}

function bonTekstVeld_(naam, sleutel, extra) {
  var attrs = Object.assign({ type: 'text', value: bonStaat[sleutel], autocomplete: 'off' }, extra || {});
  attrs.oninput = function (e) { bonStaat[sleutel] = e.target.value; if (bonStaat.fouten[naam]) { delete bonStaat.fouten[naam]; bonTekenFouten_(); } };
  return el('input', attrs);
}

function bonTekenFouten_() {
  if (!bonVak) return;
  Object.keys(bonVak.fouten).forEach(function (naam) {
    var m = bonStaat.fouten[naam], vak = bonVak.fouten[naam];
    vak.textContent = m || ''; vak.hidden = !m;
    var invoer = bonVak.velden[naam];
    if (invoer) { if (m) invoer.setAttribute('aria-invalid', 'true'); else invoer.removeAttribute('aria-invalid'); }
  });
}

function bonTekenFoto_() {
  if (!bonVak || !bonVak.foto) return;
  var f = bonStaat.foto;
  var kaart;
  if (f.status === 'geen') {
    kaart = el('div', { class: 'bon-foto-leeg' },
      el('div', { class: 'bon-foto-knoppen' },
        el('button', { type: 'button', class: 'bon-foto-knop', onclick: function () { bonVak.maken.click(); } }, maakIcoon('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 'pictogram groot'), 'Foto maken'),
        el('button', { type: 'button', class: 'knop', onclick: function () { bonVak.kiezen.click(); } }, 'Kies foto of pdf')),
      el('p', { class: 'melding-zacht veld-melding' }, 'Een foto van de bon is handig, maar hoeft niet.'));
  } else {
    var tekst, klasse = 'bon-foto-status';
    if (f.status === 'bezig') tekst = 'Foto wordt verstuurd…';
    else if (f.status === 'klaar') { tekst = 'Foto opgeslagen ✓'; klasse += ' bon-foto-ok'; }
    else { tekst = f.melding || 'De foto is niet aangekomen.'; klasse += ' bon-foto-fout'; }
    var kleine = f.miniatuur
      ? el('img', { class: 'bon-miniatuur', src: f.miniatuur, alt: 'De foto van de bon' })
      : el('span', { class: 'bon-miniatuur bon-miniatuur-leeg' }, maakIcoon('bon'));
    kaart = el('div', { class: 'bon-foto-gekozen' }, kleine,
      el('div', { class: 'bon-foto-tekst' },
        el('div', { class: klasse, role: f.status === 'fout' ? 'alert' : 'status' }, f.status === 'bezig' ? el('span', { class: 'laadpunt' }) : null, tekst),
        el('div', { class: 'knoppen' },
          f.status === 'fout' && f.lading ? el('button', { type: 'button', class: 'knop knop-klein', onclick: function () { bonStuurFoto_(f.nr); } }, 'Opnieuw proberen') : null,
          f.status === 'fout' ? el('button', { type: 'button', class: 'knop knop-klein', onclick: function () { bonVerwijderFoto_(); bonIndienen_(); } }, 'Zonder foto indienen') : null,
          el('button', { type: 'button', class: 'knop knop-klein', onclick: bonVerwijderFoto_ }, f.status === 'fout' ? 'Andere foto' : 'Foto weghalen'))));
  }
  bonVak.foto.replaceChildren(kaart);
}

function bonTekenKnop_() {
  if (!bonVak || !bonVak.knop) return;
  var s = bonStaat;
  var wacht = s.wacht && s.foto.status === 'bezig';
  bonVak.knop.textContent = wacht ? 'Nog even: de foto wordt verstuurd' : 'Indienen';
  bonVak.knop.disabled = wacht;
}

function bonFoutBlokjes_() {
  bonVak.fouten = {}; bonVak.velden = {};
}

function bonFormulier_() {
  var s = bonStaat;
  bonFoutBlokjes_();
  bonVak.maken = el('input', { type: 'file', id: 'bon-foto-maken', accept: 'image/*', capture: 'environment', hidden: true, onchange: function (e) { bonKiesFoto_(e.target.files[0]); e.target.value = ''; } });
  bonVak.kiezen = el('input', { type: 'file', id: 'bon-foto-kiezen', accept: 'image/*,application/pdf', hidden: true, onchange: function (e) { bonKiesFoto_(e.target.files[0]); e.target.value = ''; } });
  bonVak.foto = el('div', { class: 'bon-foto', 'aria-live': 'polite' });

  var bedrag = bonTekstVeld_('bedrag', 'bedrag', { id: 'bon-bedrag', inputmode: 'decimal', placeholder: '12,50', autocomplete: 'off', 'aria-label': 'Bedrag in euro' });
  var omschrijving = bonTekstVeld_('omschrijving', 'omschrijving', { id: 'bon-omschrijving', maxlength: 200, placeholder: 'Bijvoorbeeld: saus voor de barbecue' });
  var winkel = bonTekstVeld_('winkel', 'winkel', { id: 'bon-winkel', maxlength: 100 });
  var door = bonTekstVeld_('door', 'door', { id: 'bon-door', maxlength: 80 });
  var datum = el('input', { type: 'date', id: 'bon-datum', value: s.datum, min: BON_MIN_DATUM, max: bonVandaag_(),
    oninput: function (e) { s.datum = e.target.value; delete s.fouten.datum; bonTekenFouten_(); } });

  var knoppen = BON_CATEGORIEEN.map(function (c) {
    var k = el('button', { type: 'button', class: 'bon-cat', 'data-categorie': c.id, 'aria-pressed': s.categorie === c.id ? 'true' : 'false',
      onclick: function () {
        s.categorie = c.id; delete s.fouten.categorie;
        bonVak.categorieen.forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-categorie') === c.id ? 'true' : 'false'); });
        bonTekenFouten_();
      } }, c.tekst);
    return k;
  });
  bonVak.categorieen = knoppen;
  var catFout = el('p', { class: 'veld-melding melding-fout', id: 'bon-fout-categorie', hidden: true });
  bonVak.fouten.categorie = catFout;
  bonVak.velden.categorie = knoppen[0];

  bonVak.knop = el('button', { type: 'submit', class: 'knop knop-hoofd knop-breed bon-indienen', id: 'bon-indienen' }, 'Indienen');

  var formulier = el('form', { class: 'kaart bon-formulier', novalidate: true, onsubmit: function (e) { e.preventDefault(); bonIndienen_(); } },
    bonVak.foto, bonVak.maken, bonVak.kiezen,
    bonVeld_('bedrag', 'Bedrag (€)', bedrag),
    bonVeld_('omschrijving', 'Waarvoor?', omschrijving),
    el('div', { class: 'veld', role: 'group', 'aria-label': 'Categorie' }, 'Categorie', el('div', { class: 'bon-cats' }, knoppen), catFout),
    bonVeld_('winkel', 'Winkel', winkel, 'mag leeg'),
    bonVeld_('datum', 'Datum van de bon', datum),
    bonVeld_('door', 'Voorgeschoten door', door),
    bonVak.knop);
  bonTekenFoto_(); bonTekenKnop_(); bonTekenFouten_();
  return formulier;
}

function bonOntvangen_() {
  var l = bonStaat.laatste || {};
  return el('section', { class: 'kaart bon-ontvangen', role: 'status' },
    el('span', { class: 'bon-vink' }, maakIcoon('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'pictogram groot')),
    el('h2', null, 'Bon ontvangen ✓'),
    el('p', null, '€ ' + (l.bedrag || '') + (l.omschrijving ? ' voor ' + l.omschrijving : '') + '. Het systeem boekt hem binnen een minuut; de penningmeester betaalt hem daarna terug.'),
    el('button', { type: 'button', class: 'knop knop-hoofd knop-breed', id: 'bon-nog-een', onclick: bonNogEen_ }, 'Nog een bon'));
}

// De hele bovenkant opnieuw (formulier of bevestiging).
function bonTekenGeheel_() {
  if (!bonVak) return;
  bonVak.boven.replaceChildren(bonStaat.ontvangen ? bonOntvangen_() : bonFormulier_());
}

// ---- mijn bonnen ----

function bonStatus_(o) {
  switch (o.status) {
    case 'onderweg': return { tekst: 'onderweg', klasse: 'label label-geel' };
    case 'nieuw': return { tekst: 'wordt verwerkt', klasse: 'label label-geel' };
    case 'klaar': return { tekst: 'klaar', klasse: 'label' };
    case 'fout': return { tekst: 'niet gelukt', klasse: 'label label-fout' };
    default: return { tekst: String(o.status || ''), klasse: 'label' };
  }
}

function bonLijstItems_(m) {
  var lijst = ((m && m.mijnOpdrachten) || []).filter(function (o) { return o.type === 'bonIndienen'; });
  // nieuwste eerst: wat nog onderweg is (nog geen tijd van de server) bovenaan
  lijst = lijst.map(function (o, i) { return { o: o, i: i }; }).sort(function (a, b) {
    var x = a.o.ontvangenOp || '', y = b.o.ontvangenOp || '';
    if (x === y) return a.i - b.i;
    if (!x) return -1;
    if (!y) return 1;
    return x < y ? 1 : -1;
  }).map(function (p) { return p.o; });
  return lijst.slice(0, 10).map(function (o) {
    var g = o.gegevens || {};
    return { o: o, bedrag: g.bedrag || '', omschrijving: g.omschrijving || '' };
  });
}

function bonTekenLijst_(m) {
  if (!bonVak || !bonVak.lijst) return;
  var items = bonLijstItems_(m);
  var inhoud = items.length === 0
    ? el('p', { class: 'rij-sub', style: 'margin-top:0.75rem' }, 'Je hebt nog geen bon ingediend.')
    : el('ul', { class: 'kaart-lijst' }, items.map(function (it) {
        var st = bonStatus_(it.o);
        return el('li', null, el('div', { class: 'rij' },
          el('div', { class: 'rij-tekst' },
            el('div', { class: 'rij-titel' }, it.bedrag ? '€ ' + it.bedrag : 'Bon'),
            it.omschrijving ? el('div', { class: 'rij-sub' }, it.omschrijving) : null,
            it.o.status === 'fout' && it.o.melding ? el('div', { class: 'opdracht-melding' }, it.o.melding) : null),
          el('span', { class: st.klasse }, st.tekst)));
      }));
  bonVak.lijst.replaceChildren(el('h2', null, 'Mijn bonnen'), inhoud);
}

// ---- het scherm ----

function bonTeken_(container, staat) {
  bonApp = staat;
  if (!bonStaat) bonStaat = bonNieuweStaat_();
  bonVak = { boven: el('div', { class: 'bon-boven' }), lijst: el('section', { class: 'kaart', 'aria-label': 'Mijn bonnen' }), fouten: {}, velden: {} };
  container.replaceChildren(
    el('header', { class: 'paginakop' }, el('div', null, el('h1', null, 'Bon indienen'), el('p', null, 'Je krijgt het geld terug van de penningmeester.'))),
    bonVak.boven, bonVak.lijst);
  bonTekenGeheel_();
  bonTekenLijst_(staat.momentopname);
}

// Nieuwe gegevens: alleen de lijst, nooit het formulier (daar wordt misschien juist getypt).
function bonBijwerken_(container, staat) {
  bonApp = staat;
  if (!bonVak || !bonVak.lijst.isConnected) { bonTeken_(container, staat); return; }
  bonTekenLijst_(staat.momentopname);
}

registreerScherm({
  naam: 'bon',
  titel: 'Bon indienen',
  recht: 'bon_indienen',
  icoon: 'bon',
  teken: bonTeken_,
  bijwerken: bonBijwerken_
});
