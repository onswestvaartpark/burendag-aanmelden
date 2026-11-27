// Scherm Betalingen (fase 3): bankregels inlezen, de regels die op een koppeling wachten, wat automatisch is gekoppeld (met Ongedaan maken) en per huishouden wat er betaald is.
// De gegevens komen direct van het achterwerk (beheerBetalingen), staan alleen in het geheugen en worden niet bewaard op het apparaat.
// Namen en omschrijvingen van bankregels zitten er alleen in met het recht persoonsgegevens_zien; zonder dat recht toont het scherm alleen de totalen per huishouden.
// Koppelen, geen burendag en ongedaan maken zijn opdrachten (stuurOpdracht) en staan tot de server klaar is als 'wordt verwerkt' in het scherm (betalingenMetWacht in betalingen.js).
// Het bankbestand wordt in de browser gelezen; alleen de regels met de zoektekst gaan weg, en alleen de velden uit betalingenVoorServer. Het inlezen zelf is geen opdracht maar een direct verzoek (beheerBankInlezen): het IBAN komt nooit in een Sheet.
// Vereist app.js (registreerScherm, el, euro, meervoud_, heeftRecht), api.js (maakDirecteLading), bewerken.js (maakBewerkenWacht, ...) en betalingen.js (de pure kant).

var betalingenLading = maakDirecteLading('beheerBetalingen');
// inlezen = het gekozen bestand { status: 'leest' | 'klaar' | 'fout', naam, totaal, gekozen, anders, fout }, anders = per kenmerk de open keuze 'Ander huishouden…' { zoek },
// wacht = opdrachten die dit scherm stuurde en die de server nog niet klaar heeft, melding = een korte bevestiging van wat er verstuurd is
function betalingenNieuweStaat_(email) {
  return { email: email, filter: 'alles', zoek: '', toon: BETALINGEN_PAGINA, anders: {}, inlezen: null, wacht: maakBewerkenWacht(), handtekening: '', melding: '', leesNr: 0 };
}
var betalingenStaat = betalingenNieuweStaat_('');
var betalingenVak = null; // { wortel, melding, slot, inlezen, status, open, gekoppeld, geen, totalen, chips, lijst, meer }
var betalingenApp = null; // de laatste staat van de schil (rechten, stuurOpdracht, parameters)

// Uitgelogd, sessiefout of een ander account: alles uit het geheugen (ook een gekozen bestand).
function betalingenSchermVergeet() {
  betalingenLading.vergeet();
  betalingenStaat = betalingenNieuweStaat_(betalingenStaat.email);
  betalingenVak = null;
  betalingenApp = null;
}

// Een bestand dat naast de dropzone wordt losgelaten, zou de browser openen en de pagina verlaten: vang dat één keer op het hele venster af (de zone zelf handelt het bestand af).
var betalingenVensterKlaar = false;
function betalingenVensterDrop_() {
  if (betalingenVensterKlaar || typeof window === 'undefined' || !window.addEventListener) return;
  betalingenVensterKlaar = true;
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });
}

function betalingenRechten_() { return betalingenApp ? betalingenApp.rechten || [] : []; }

// De gegevens zoals ze er nu uit horen te zien: wat de server heeft, met de opdrachten die nog lopen er al in verwerkt.
function betalingenData_() {
  return betalingenMetWacht(betalingenLading.data, betalingenWachtItems(betalingenStaat.wacht));
}

function betalingenOpSlot_() {
  var d = betalingenLading.data;
  return !!d && d.opSlot === true;
}

function betalingenBedrag_(r) {
  return (r.afBij === 'Af' ? '− ' : '') + euro(r.bedragCenten);
}

// Het label met de status van een huishouden.
function betalingenStatusLabel_(h) {
  var tekst = Object.prototype.hasOwnProperty.call(BETALINGEN_STATUSTEKST, h.status) ? BETALINGEN_STATUSTEKST[h.status] : h.status;
  if (h.status === 'betaald') return el('span', { class: 'label' }, tekst);
  if (h.status === 'vrijgesteld') return el('span', { class: 'label label-grijs' }, tekst);
  return el('span', { class: 'label label-geel' }, tekst);
}

// ---- inlezen ----

function betalingenLeesBestand_(bestand, codering, klaar, fout) {
  var lezer = new FileReader();
  lezer.onload = function () { klaar(String(lezer.result)); };
  lezer.onerror = function () { fout(); };
  lezer.readAsText(bestand, codering);
}

// Leest het gekozen bestand in de browser; er gaat niets naar de server tot de gebruiker bevestigt.
function betalingenKiesBestand_(bestand) {
  var s = betalingenStaat;
  var d = betalingenLading.data;
  if (!bestand) return;
  if (s.inlezen && s.inlezen.status === 'bezig') return; // een lopende inlezing niet halverwege afbreken
  var nr = ++s.leesNr;
  s.melding = '';
  if (bestand.size > 5 * 1024 * 1024) {
    s.inlezen = { status: 'fout', naam: bestand.name, fout: 'Dit bestand is te groot voor een bankafschrift. Kies de CSV-export van ING.' };
    betalingenTekenInlezen_();
    return;
  }
  s.inlezen = { status: 'leest', naam: bestand.name };
  betalingenTekenInlezen_();
  var zoektekst = d && typeof d.zoektekst === 'string' ? d.zoektekst : '';
  function verwerk(tekst) {
    if (nr !== s.leesNr) return;
    var r = betalingenInleesBestand(tekst, zoektekst);
    s.inlezen = r.ok ? { status: 'klaar', naam: bestand.name, totaal: r.totaal, gekozen: r.gekozen, anders: r.anders } : { status: 'fout', naam: bestand.name, fout: r.fout };
    betalingenTekenInlezen_();
  }
  function mislukt() {
    if (nr !== s.leesNr) return;
    s.inlezen = { status: 'fout', naam: bestand.name, fout: 'Het bestand kon niet worden geopend.' };
    betalingenTekenInlezen_();
  }
  betalingenLeesBestand_(bestand, 'UTF-8', function (tekst) {
    // onleesbare tekens: het bestand is waarschijnlijk in Windows-codering opgeslagen
    if (tekst.indexOf('�') !== -1) betalingenLeesBestand_(bestand, 'windows-1252', verwerk, mislukt);
    else verwerk(tekst);
  }, mislukt);
}

// Stuurt de gekozen regels rechtstreeks naar de server (beheerBankInlezen), stuk voor stuk, en toont daarna de uitkomst. Dit gaat bewust niet via de wachtrij:
// de regels bevatten het IBAN van de betaler en blijven alleen in het geheugen van deze pagina; de server slaat het rekeningnummer nergens op, alleen een onherleidbare vingerafdruk.
// Hetzelfde stuk nog eens sturen (na een fout) boekt niets dubbel.
function betalingenBevestigInlezen_() {
  var s = betalingenStaat;
  var i = s.inlezen;
  if (!i || i.status !== 'klaar' || i.gekozen.length === 0 || !betalingenMagInlezen(betalingenRechten_(), betalingenOpSlot_())) return;
  var stukken = betalingenChunks(i.gekozen);
  var uitkomsten = [];
  var nr = ++s.leesNr;
  s.inlezen = { status: 'bezig', naam: i.naam, totaal: i.totaal };
  s.melding = '';
  betalingenTekenInlezen_();
  function volgende(k) {
    if (nr !== s.leesNr) return;
    if (k >= stukken.length) {
      var som = betalingenInleesUitkomst(uitkomsten);
      s.inlezen = null;
      s.melding = som.tekst;
      betalingenLading.haal(true);
      betalingenAlles_();
      return;
    }
    beheerVerzoek('beheerBankInlezen', { regels: stukken[k] }).then(function (a) {
      if (nr !== s.leesNr) return;
      if (a && a.ok === true) { uitkomsten.push(a); volgende(k + 1); return; }
      if (a && a.code === 'SESSIE') { betalingenSchermVergeet(); if (typeof naarInloggen_ === 'function') naarInloggen_(a.melding || 'Je bent uitgelogd. Log opnieuw in.'); return; }
      mislukt(k, a && typeof a.melding === 'string' ? a.melding : a && a.code === 'RECHT' ? 'Dit mag je niet doen.' : 'Het inlezen lukt nu niet. Probeer het zo nog eens.');
    }, function () {
      if (nr !== s.leesNr) return;
      mislukt(k, 'Geen verbinding. Probeer het zo nog eens.');
    });
  }
  // bij een fout blijft het bestand in het geheugen: Opnieuw proberen stuurt alles nog eens (wat al is ingelezen, boekt niets dubbel)
  function mislukt(k, melding) {
    var gedaan = betalingenInleesUitkomst(uitkomsten);
    s.inlezen = { status: 'klaar', naam: i.naam, totaal: i.totaal, gekozen: i.gekozen, anders: i.anders, fout: melding + (uitkomsten.length > 0 ? ' Een deel is al ingelezen (' + gedaan.tekst + ') en wordt bij een nieuwe poging niet dubbel geboekt.' : '') };
    betalingenLading.haal(true);
    betalingenTekenInlezen_();
  }
  volgende(0);
}

function betalingenTekenInlezen_() {
  if (!betalingenVak) return;
  var s = betalingenStaat;
  var d = betalingenLading.data;
  var vak = betalingenVak.inlezen;
  if (!d || !betalingenMagInlezen(betalingenRechten_(), betalingenOpSlot_())) { vak.replaceChildren(); return; }
  var invoer = el('input', { type: 'file', id: 'bet-bestand', class: 'bet-bestand', accept: '.csv,text/csv', tabindex: '-1', 'aria-hidden': 'true',
    onchange: function (e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; betalingenKiesBestand_(f); } });
  var kies = el('button', { type: 'button', class: 'knop knop-hoofd', onclick: function () { invoer.click(); } }, 'Bestand kiezen');
  var zone = el('div', { class: 'bet-drop', id: 'bet-drop' },
    el('p', { class: 'bet-drop-tekst' }, 'Sleep de CSV-export van ING hierheen, of kies het bestand. Het wordt op je computer gelezen; alleen de regels met ',
      el('strong', null, d.zoektekst || 'de zoektekst'), ' in de omschrijving gaan naar de commissie-Sheet.'),
    kies, invoer);
  zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('bet-drop-actief'); });
  zone.addEventListener('dragleave', function () { zone.classList.remove('bet-drop-actief'); });
  zone.addEventListener('drop', function (e) {
    e.preventDefault(); zone.classList.remove('bet-drop-actief');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    betalingenKiesBestand_(f);
  });
  var delen = [zone];
  var i = s.inlezen;
  if (s.melding) delen.push(el('p', { class: 'strook strook-ok', role: 'status' }, s.melding));
  if (i && i.status === 'bezig') {
    delen.push(el('p', { class: 'laden', role: 'status' }, el('span', { class: 'laadpunt' }), 'Bezig met inlezen…'));
  } else if (i && i.status === 'leest') {
    delen.push(el('p', { class: 'laden', role: 'status' }, el('span', { class: 'laadpunt' }), 'Bestand lezen…'));
  } else if (i && i.status === 'fout') {
    delen.push(el('p', { class: 'strook strook-fout', role: 'alert' }, i.fout));
  } else if (i && i.status === 'klaar') {
    if (i.fout) delen.push(el('p', { class: 'strook strook-fout', role: 'alert' }, i.fout));
    delen.push(el('p', { class: 'bet-telling', role: 'status' }, betalingenTelTekst(i.totaal, i.gekozen.length)),
      el('p', { class: 'rij-sub' }, i.anders === 0 ? 'Alle regels hebben de zoektekst.' : meervoud_(i.anders, 'andere regel blijft', 'andere regels blijven') + ' op je computer.'),
      el('div', { class: 'knoppen' },
        el('button', { type: 'button', class: 'knop knop-hoofd', disabled: i.gekozen.length === 0, onclick: betalingenBevestigInlezen_ },
          i.gekozen.length === 0 ? 'Niets om in te lezen' : (i.fout ? 'Opnieuw proberen (' : 'Inlezen (') + meervoud_(i.gekozen.length, 'regel', 'regels') + ')'),
        el('button', { type: 'button', class: 'knop', onclick: function () { s.inlezen = null; s.leesNr++; betalingenTekenInlezen_(); } }, 'Annuleren')));
  }
  vak.replaceChildren(el('section', { class: 'kaart bet-inlezen', 'aria-label': 'Bankafschrift inlezen' }, el('h2', null, 'Bankafschrift inlezen'), delen));
}

// ---- de laatste import ----

function betalingenImportBlok_(d) {
  if (!d.laatsteImport) return null;
  var imp = d.laatsteImport;
  var moment = betalingenMomentTekst(imp.moment);
  return el('p', { class: 'rij-sub bet-laatste' }, 'Laatste import' + (moment ? ' ' + moment : '') + ': ' + betalingenImportDelen(imp).join(', ') + '.');
}

// ---- open regels ----

function betalingenStuur_(type, gegevens) {
  var s = betalingenStaat;
  var uit = betalingenApp.stuurOpdracht(type, gegevens);
  bewerkenWachtVoegToe(s.wacht, uit.id, type, gegevens);
  betalingenAlles_();
}

function betalingenKoppel_(regel, huishouden) {
  delete betalingenStaat.anders[regel.kenmerk];
  betalingenStuur_('betalingKoppelen', { kenmerk: regel.kenmerk, adrescode: huishouden.adrescode });
}

// 'Ander huishouden…': een zoekveld met de huishoudens die erbij passen; een keuze koppelt meteen.
function betalingenAnderBlok_(regel, d) {
  var s = betalingenStaat;
  var staat = s.anders[regel.kenmerk];
  var uitslag = el('ul', { class: 'bet-keuzes', id: 'bet-keuzes-' + regel.kenmerk });
  function vul() {
    var gevonden = betalingenZoekHuishoudens(d.huishoudens, staat.zoek, 8);
    if (gevonden.length === 0) { uitslag.replaceChildren(el('li', { class: 'rij-sub' }, 'Geen huishouden gevonden.')); return; }
    uitslag.replaceChildren.apply(uitslag, gevonden.map(function (h) {
      var na = betalingenNaKoppelen(h, regel);
      return el('li', null, el('button', { type: 'button', class: 'bet-keuze', onclick: function () { betalingenKoppel_(regel, h); } },
        el('span', { class: 'rij-titel' }, h.adres + (h.naam ? ' · ' + h.naam : '')),
        el('span', { class: 'rij-sub' }, 'Nu ' + (BETALINGEN_STATUSTEKST[h.status] || h.status).toLowerCase() + (na ? ', daarna ' + (BETALINGEN_STATUSTEKST[na.status] || na.status).toLowerCase() : ''))));
    }));
  }
  var veld = el('input', { type: 'search', class: 'bet-zoek-ander', 'data-bet-zoek': regel.kenmerk, autocomplete: 'off', placeholder: 'Zoek op adres of naam', 'aria-label': 'Zoek een huishouden',
    value: staat.zoek, oninput: function (e) { staat.zoek = e.target.value; vul(); } });
  vul();
  return el('div', { class: 'bet-ander' }, veld, uitslag,
    el('button', { type: 'button', class: 'knop knop-klein', onclick: function () { delete s.anders[regel.kenmerk]; betalingenTekenOpen_(); } }, 'Sluiten'));
}

function betalingenOpenRegel_(regel, d, magKoppelen) {
  var s = betalingenStaat;
  var wacht = regel.wacht === true || betalingenRegelWacht(s.wacht, regel.kenmerk);
  var kop = el('div', { class: 'bet-regelkop' },
    el('span', { class: 'bet-datum' }, betalingenKorteDatum(regel.datum)),
    el('span', { class: 'rij-titel bet-naam' }, regel.naam || 'Onbekende naam'),
    el('span', { class: 'bet-bedrag' }, betalingenBedrag_(regel)));
  var tekst = el('div', { class: 'rij-sub bet-omschrijving' }, regel.omschrijving || '');
  var delen = [kop, tekst];
  if (wacht) {
    delen.push(el('div', null, bewerkenWachtLabel('wordt verwerkt')));
  } else if (magKoppelen) {
    var kandidaten = (regel.kandidaten || []).slice(0, 3);
    if (kandidaten.length === 0) delen.push(el('p', { class: 'rij-sub' }, 'Geen voorstel: kies zelf het huishouden.'));
    kandidaten.forEach(function (k) {
      var h = d.huishoudens.filter(function (x) { return x.adrescode === k.adrescode; })[0] || k;
      var na = betalingenNaKoppelen(h, regel);
      delen.push(el('div', { class: 'bet-voorstel' },
        el('button', { type: 'button', class: 'knop knop-hoofd bet-koppel', onclick: function () { betalingenKoppel_(regel, k); } }, 'Koppelen aan ' + (k.adres || k.adrescode)),
        el('span', { class: 'rij-sub' }, (k.redenTekst ? k.redenTekst + '. ' : '') + (na ? 'Daarna: ' + (BETALINGEN_STATUSTEKST[na.status] || na.status).toLowerCase() + '.' : ''))));
    });
    var knoppen = [];
    if (s.anders[regel.kenmerk]) {
      delen.push(betalingenAnderBlok_(regel, d));
    } else {
      knoppen.push(el('button', { type: 'button', class: 'knop', onclick: function () { s.anders[regel.kenmerk] = { zoek: '' }; betalingenTekenOpen_(); setTimeout(function () { var v = document.querySelector('[data-bet-zoek="' + regel.kenmerk + '"]'); if (v) v.focus(); }, 0); } }, 'Ander huishouden…'));
    }
    knoppen.push(el('button', { type: 'button', class: 'knop', onclick: function () { delete s.anders[regel.kenmerk]; betalingenStuur_('betalingGeenBurendag', { kenmerk: regel.kenmerk }); } }, 'Geen burendag'));
    delen.push(el('div', { class: 'knoppen bet-knoppen' }, knoppen));
  }
  return el('li', { class: 'bet-regel' + (wacht ? ' kasrij-wacht' : '') }, delen);
}

function betalingenTekenOpen_() {
  if (!betalingenVak) return;
  var d = betalingenData_();
  var vak = betalingenVak.open;
  if (!d || !Array.isArray(d.openRegels)) {
    var rechten = betalingenRechten_();
    var wacht = !!d && d.aantalOpen > 0 && heeftRecht(rechten, 'betalingen_koppelen') && !heeftRecht(rechten, 'persoonsgegevens_zien');
    vak.replaceChildren(wacht ? el('p', { class: 'strook strook-geel', role: 'status' }, 'Om te koppelen heb je ook het recht \'persoonsgegevens zien\' nodig.') : '');
    return;
  }
  var focus = document.activeElement && document.activeElement.getAttribute ? document.activeElement.getAttribute('data-bet-zoek') : null;
  var van = focus && document.activeElement.selectionStart;
  var magKoppelen = betalingenMagKoppelen(betalingenRechten_(), d.opSlot === true);
  var inhoud = [el('h2', null, 'Voor jou: ' + meervoud_(d.openRegels.length, 'regel', 'regels') + ' om te koppelen')];
  var imp = betalingenImportBlok_(d);
  if (imp) inhoud.push(imp);
  if (d.openRegels.length === 0) inhoud.push(el('p', { class: 'rij-sub' }, 'Alles is gekoppeld. Er wacht niets op jou.'));
  else inhoud.push(el('ul', { class: 'kaart-lijst bet-lijst' }, d.openRegels.map(function (r) { return betalingenOpenRegel_(r, d, magKoppelen); })));
  vak.replaceChildren(el('section', { class: 'kaart', 'aria-label': 'Regels om te koppelen' }, inhoud));
  if (focus) {
    var v = document.querySelector('[data-bet-zoek="' + focus + '"]');
    if (v) { v.focus(); if (typeof van === 'number' && v.setSelectionRange) { try { v.setSelectionRange(van, van); } catch (e) { /* geen selectie mogelijk */ } } }
  }
}

// ---- gekoppeld en geen burendag ----

function betalingenGekoppeldRegel_(r, magKoppelen) {
  var wacht = r.wacht === true || betalingenRegelWacht(betalingenStaat.wacht, r.kenmerk);
  var soort = r.soort === 'automatisch' ? 'automatisch' : 'handmatig';
  return el('li', { class: 'bet-regel' + (wacht ? ' kasrij-wacht' : '') },
    el('div', { class: 'bet-regelkop' },
      el('span', { class: 'bet-datum' }, betalingenKorteDatum(r.datum)),
      el('span', { class: 'rij-titel bet-naam' }, (r.adres || r.adrescode) + (r.huishouden ? ' · ' + r.huishouden : '')),
      el('span', { class: 'bet-bedrag' }, betalingenBedrag_(r))),
    el('div', { class: 'rij-sub bet-omschrijving' }, [r.naam, r.omschrijving].filter(function (t) { return t; }).join(' · ') + ' (' + soort + ' gekoppeld)'),
    wacht ? el('div', null, bewerkenWachtLabel('wordt verwerkt'))
      : magKoppelen ? el('div', { class: 'knoppen bet-knoppen' }, el('button', { type: 'button', class: 'knop', onclick: function () { betalingenStuur_('betalingOngedaan', { kenmerk: r.kenmerk }); } }, 'Ongedaan maken')) : null);
}

function betalingenGeenRegel_(r, magKoppelen) {
  var wacht = r.wacht === true || betalingenRegelWacht(betalingenStaat.wacht, r.kenmerk);
  return el('li', { class: 'bet-regel' + (wacht ? ' kasrij-wacht' : '') },
    el('div', { class: 'bet-regelkop' },
      el('span', { class: 'bet-datum' }, betalingenKorteDatum(r.datum)),
      el('span', { class: 'rij-titel bet-naam' }, r.naam || 'Onbekende naam'),
      el('span', { class: 'bet-bedrag' }, betalingenBedrag_(r))),
    el('div', { class: 'rij-sub bet-omschrijving' }, r.omschrijving || ''),
    wacht ? el('div', null, bewerkenWachtLabel('wordt verwerkt'))
      : magKoppelen ? el('div', { class: 'knoppen bet-knoppen' }, el('button', { type: 'button', class: 'knop', onclick: function () { betalingenStuur_('betalingOngedaan', { kenmerk: r.kenmerk }); } }, 'Ongedaan maken')) : null);
}

function betalingenTekenLijsten_() {
  if (!betalingenVak) return;
  var d = betalingenData_();
  var magKoppelen = !!d && betalingenMagKoppelen(betalingenRechten_(), d.opSlot === true);
  var g = betalingenVak.gekoppeld, n = betalingenVak.geen;
  if (!d || !Array.isArray(d.gekoppeld) || d.gekoppeld.length === 0) g.replaceChildren();
  else g.replaceChildren(el('section', { class: 'kaart', 'aria-label': 'Gekoppeld bij de laatste import' }, el('h2', null, 'Gekoppeld bij de laatste import'),
    el('p', { class: 'rij-sub' }, 'Klopt er een koppeling niet? Maak hem ongedaan, dan komt de regel weer bij de regels om te koppelen.'),
    el('ul', { class: 'kaart-lijst bet-lijst' }, d.gekoppeld.map(function (r) { return betalingenGekoppeldRegel_(r, magKoppelen); }))));
  if (!d || !Array.isArray(d.geenBurendag) || d.geenBurendag.length === 0) n.replaceChildren();
  else n.replaceChildren(el('section', { class: 'kaart', 'aria-label': 'Gemarkeerd als geen burendag' }, el('h2', null, 'Geen burendag'),
    el('ul', { class: 'kaart-lijst bet-lijst' }, d.geenBurendag.map(function (r) { return betalingenGeenRegel_(r, magKoppelen); }))));
}

// ---- overzicht per huishouden ----

function betalingenTegel_(label, waarde, sub) {
  return el('div', { class: 'kaart tegel' }, el('span', { class: 'tegel-label' }, label), el('span', { class: 'tegel-waarde' }, waarde), el('span', { class: 'tegel-sub' }, sub));
}

function betalingenTekenTotalen_() {
  if (!betalingenVak) return;
  var d = betalingenData_();
  if (!d || !d.totalen) { betalingenVak.totalen.replaceChildren(); return; }
  var t = d.totalen;
  betalingenVak.totalen.replaceChildren(
    betalingenTegel_('Verwacht', euro(t.verwachtCenten), meervoud_(t.aantal, 'huishouden', 'huishoudens')),
    betalingenTegel_('Binnen', euro(t.binnenCenten), t.perStatus.betaald + t.perStatus['te veel'] + ' betaald'),
    betalingenTegel_('Nog open', euro(t.openCenten), t.perStatus.open + t.perStatus['te weinig'] + ' nog niet (helemaal) betaald'));
}

function betalingenOpenKaart_(h) {
  if (!betalingenMagKaart(betalingenRechten_())) return;
  location.hash = '#wijkregister?adres=' + encodeURIComponent(h.adrescode) + '&zoek=' + encodeURIComponent(h.adres || h.adrescode);
}

function betalingenHuisRij_(h, metNaam, magKaart) {
  var rij = el('tr', { class: 'bet-huis' + (magKaart ? ' bet-klik' : '') });
  var adres = magKaart
    ? el('a', { href: '#wijkregister?adres=' + encodeURIComponent(h.adrescode) + '&zoek=' + encodeURIComponent(h.adres || h.adrescode), class: 'bet-kaartlink', 'aria-label': 'Huishoudkaart van ' + (h.adres || h.adrescode),
        onclick: function (e) { e.preventDefault(); e.stopPropagation(); betalingenOpenKaart_(h); } }, h.adres || h.adrescode)
    : el('span', null, h.adres || h.adrescode);
  rij.appendChild(el('td', { 'data-label': 'Adres', class: 'bet-adres' }, adres));
  if (metNaam) rij.appendChild(el('td', { 'data-label': 'Naam' }, h.naam || ''));
  rij.appendChild(el('td', { 'data-label': 'Verwacht', class: 'bet-getal' }, euro(h.verwachtCenten)));
  rij.appendChild(el('td', { 'data-label': 'Betaald', class: 'bet-getal' }, euro(h.betaaldCenten)));
  rij.appendChild(el('td', { 'data-label': 'Open', class: 'bet-getal' }, euro(h.openCenten)));
  rij.appendChild(el('td', { 'data-label': 'Status' }, betalingenStatusLabel_(h)));
  if (magKaart) rij.addEventListener('click', function () { betalingenOpenKaart_(h); });
  return rij;
}

function betalingenTekenLijst_() {
  if (!betalingenVak) return;
  var d = betalingenData_();
  var s = betalingenStaat;
  if (!d || !Array.isArray(d.huishoudens)) { betalingenVak.lijst.replaceChildren(); betalingenVak.meer.replaceChildren(); return; }
  var rijen = betalingenFilter(d.huishoudens, s.filter, s.zoek);
  var zichtbaar = rijen.slice(0, s.toon);
  var metNaam = d.huishoudens.some(function (h) { return typeof h.naam === 'string' && h.naam !== ''; });
  var magKaart = betalingenMagKaart(betalingenRechten_());
  if (rijen.length === 0) {
    betalingenVak.lijst.replaceChildren(el('p', { class: 'rij-sub', style: 'margin-top:0.75rem' }, d.huishoudens.length === 0 ? 'Er zijn nog geen aanmeldingen.' : 'Niets gevonden.'));
  } else {
    var kop = el('tr', null, el('th', { scope: 'col' }, 'Adres'), metNaam ? el('th', { scope: 'col' }, 'Naam') : null, el('th', { scope: 'col', class: 'bet-getal' }, 'Verwacht'),
      el('th', { scope: 'col', class: 'bet-getal' }, 'Betaald'), el('th', { scope: 'col', class: 'bet-getal' }, 'Open'), el('th', { scope: 'col' }, 'Status'));
    betalingenVak.lijst.replaceChildren(el('div', { class: 'bet-tabelvak' },
      el('table', { class: 'bet-tabel' }, el('thead', null, kop), el('tbody', null, zichtbaar.map(function (h) { return betalingenHuisRij_(h, metNaam, magKaart); })))));
  }
  betalingenVak.meer.replaceChildren(rijen.length > zichtbaar.length
    ? el('button', { type: 'button', class: 'knop', onclick: function () { s.toon += BETALINGEN_PAGINA; betalingenTekenLijst_(); } }, 'Toon meer (' + (rijen.length - zichtbaar.length) + ' te gaan)')
    : '');
}

function betalingenTekenChips_() {
  var chips = BETALINGEN_FILTERS.map(function (f) {
    return el('button', {
      type: 'button', class: 'kas-chip', 'data-filter': f.id, 'aria-pressed': betalingenStaat.filter === f.id ? 'true' : 'false',
      onclick: function () {
        betalingenStaat.filter = f.id; betalingenStaat.toon = BETALINGEN_PAGINA;
        Array.prototype.forEach.call(betalingenVak.chips.children, function (k) { k.setAttribute('aria-pressed', k.getAttribute('data-filter') === f.id ? 'true' : 'false'); });
        betalingenTekenLijst_();
      }
    }, f.tekst);
  });
  betalingenVak.chips.replaceChildren.apply(betalingenVak.chips, chips);
}

// ---- stroken ----

function betalingenTekenMelding_() {
  if (!betalingenVak) return;
  var s = betalingenStaat;
  var stroken = s.wacht.fouten.map(function (f, i) {
    var wat = Object.prototype.hasOwnProperty.call(BETALINGEN_TYPEN, f.type) ? BETALINGEN_TYPEN[f.type] : 'De wijziging';
    return el('div', { class: 'strook strook-fout', role: 'alert' },
      el('span', { class: 'strook-tekst' }, wat + ' is niet gelukt' + (f.melding ? ': ' + f.melding : '.')),
      el('button', { type: 'button', class: 'knop', onclick: function () { s.wacht.fouten.splice(i, 1); betalingenTekenMelding_(); } }, 'Sluiten'));
  });
  var infos = bewerkenInfoStroken(s.wacht, function (i) { s.wacht.infos.splice(i, 1); betalingenTekenMelding_(); });
  betalingenVak.melding.replaceChildren.apply(betalingenVak.melding, stroken.concat(infos));
}

function betalingenTekenSlot_() {
  if (!betalingenVak) return;
  betalingenVak.slot.replaceChildren(betalingenOpSlot_()
    ? el('p', { class: 'strook deeln-privacy', role: 'status' }, 'De editie staat op slot. Er kan niets meer worden ingelezen of gekoppeld; kijken kan nog wel.')
    : '');
}

function betalingenTekenStatus_() {
  var l = betalingenLading;
  if (l.bezig && !l.data) {
    betalingenVak.status.replaceChildren(el('p', { class: 'laden', role: 'status' }, el('span', { class: 'laadpunt' }), 'Bezig met ophalen…'));
  } else if (l.fout) {
    betalingenVak.status.replaceChildren(el('div', { class: 'strook strook-fout', role: 'alert' },
      el('span', { class: 'strook-tekst' }, l.fout), el('button', { type: 'button', class: 'knop', onclick: function () { l.haal(true); } }, 'Opnieuw proberen')));
  } else {
    betalingenVak.status.replaceChildren();
  }
}

function betalingenAlles_() {
  if (!betalingenVak) return;
  var l = betalingenLading;
  // de gegevens zijn opnieuw opgehaald: wat klaar was hoeft niet meer als 'wordt verwerkt' te staan
  if (!l.bezig && !l.fout && l.data) bewerkenWachtOpruim(betalingenStaat.wacht);
  betalingenTekenMelding_();
  betalingenTekenSlot_();
  betalingenTekenStatus_();
  betalingenTekenInlezen_();
  betalingenTekenOpen_();
  betalingenTekenLijsten_();
  betalingenTekenTotalen_();
  betalingenTekenLijst_();
}

// Een nieuwe stand van de schil: is een opdracht van dit scherm klaar, dan de gegevens vers ophalen; is hij niet gelukt, dan de melding tonen. Geeft terug of er iets te tekenen is.
function betalingenVolg_(staat) {
  betalingenApp = staat;
  var s = betalingenStaat;
  var uit = bewerkenWachtVerwerk(s.wacht, staat.momentopname, bewerkenMislukteIds());
  var handtekening = bewerkenWachtHandtekening(s.wacht);
  var gewijzigd = uit.klaar + uit.fout + uit.weg + uit.verlopen > 0 || handtekening !== s.handtekening;
  s.handtekening = handtekening;
  if (uit.klaar + uit.verlopen > 0 && betalingenVak) betalingenLading.haal(true);
  return gewijzigd;
}

// ---- scherm ----

function betalingenVernieuw() {
  if (!betalingenVak) return;
  betalingenLading.haal(true);
}

function betalingenTeken_(container, staat) {
  var email = staat.email || '';
  if (betalingenStaat.email !== email) { betalingenSchermVergeet(); betalingenStaat.email = email; }
  betalingenApp = staat;
  betalingenVensterDrop_();
  var zoekveld = el('input', {
    type: 'search', id: 'bet-zoek', class: 'deeln-zoek', autocomplete: 'off', value: betalingenStaat.zoek,
    placeholder: 'Zoek op adres' + (heeftRecht(staat.rechten || [], 'persoonsgegevens_zien') ? ' of naam' : ''),
    oninput: function (e) { betalingenStaat.zoek = e.target.value; betalingenStaat.toon = BETALINGEN_PAGINA; betalingenTekenLijst_(); }
  });
  betalingenVak = {
    wortel: container,
    melding: el('div', { class: 'stroken bewerken-meldingen' }),
    slot: el('div'),
    inlezen: el('div'),
    status: el('div', { class: 'deeln-status' }),
    open: el('div'),
    gekoppeld: el('div'),
    geen: el('div'),
    totalen: el('section', { class: 'tegels', 'aria-label': 'Totalen' }),
    chips: el('div', { class: 'kas-chips', role: 'group', 'aria-label': 'Filter op betaling' }),
    lijst: el('div', { class: 'deeln-lijst' }),
    meer: el('div', { class: 'kasboek-meer' })
  };
  betalingenLading.bijWijziging = betalingenAlles_;
  container.replaceChildren(
    el('header', { class: 'paginakop' }, el('div', null, el('h1', null, 'Betalingen'),
      el('p', null, 'Wie de bijdrage heeft betaald, en de bankregels die nog bij een huishouden moeten.'))),
    betalingenVak.melding,
    betalingenVak.slot,
    betalingenVak.status,
    betalingenVak.inlezen,
    betalingenVak.open,
    betalingenVak.gekoppeld,
    betalingenVak.geen,
    betalingenVak.totalen,
    el('section', { class: 'kaart', 'aria-label': 'Huishoudens' },
      el('h2', null, 'Per huishouden'),
      el('label', { class: 'veld', for: 'bet-zoek' }, 'Zoeken', zoekveld),
      betalingenVak.chips, betalingenVak.lijst, betalingenVak.meer));
  betalingenTekenChips_();
  betalingenVolg_(staat);
  betalingenAlles_();
  betalingenLading.haal(); // het scherm is geopend: altijd ophalen (de server mag het uit zijn korte cache halen)
}

// Nieuwe momentopname: het scherm blijft zoals het is. Is het scherm weg, dan opnieuw tekenen.
function betalingenBijwerken_(container, staat) {
  if (!betalingenVak || betalingenVak.wortel !== container || !container.contains(betalingenVak.lijst)) { betalingenTeken_(container, staat); return; }
  if (betalingenStaat.email !== (staat.email || '')) { betalingenTeken_(container, staat); return; }
  var rechtenVoor = betalingenRechten_().join(',');
  if (betalingenVolg_(staat) || rechtenVoor !== betalingenRechten_().join(',')) betalingenAlles_();
}

registreerScherm({
  naam: 'betalingen',
  titel: 'Betalingen',
  recht: 'betalingen_zien',
  icoon: 'betalingen',
  teken: betalingenTeken_,
  bijwerken: betalingenBijwerken_,
  vernieuw: betalingenVernieuw
});
