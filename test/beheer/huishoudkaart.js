// De huishoudkaart in het scherm Wijkregister (fase 2c): bewoners, spullen, opmerking, deelname en bewaartermijn van een adres, met formulieren om
// bewoners en spullen toe te voegen, te wijzigen en te verwijderen en de opmerking te bewerken, en het wissen van adressen waarvan de bewaartermijn voorbij is.
// Alles blijft in het geheugen van de pagina (namen, geboortejaren, dieetwensen): nooit op het apparaat bewaard. Elke wijziging is een opdracht (zie bewerken.js).
// De pure functies bovenaan zijn getest met Node (test/huishoudkaart.test.js); de functies met el() staan eronder en gebruiken het scherm in scherm-wijkregister.js.
// Vereist: app.js (el), gedeeld/rechten.js (heeftRecht), bewerken.js, gedeeld/validatie.js en gedeeld/huishoudkaart.js (huishoudControleerBewoner, huishoudControleerSpul,
// huishoudControleerOpmerking, huishoudLeeftijd, huishoudSoort, bewaartermijnVan), en scherm-wijkregister.js (wijkregisterStaat, wijkregisterStuur_, wijkregisterTekenLijst_, wijkregisterApp).

var KAART_BEWONER_TYPEN = ['registerBewonerOpslaan', 'registerBewonerVerwijderen'];
var KAART_SPUL_TYPEN = ['registerSpullenOpslaan', 'registerSpullenVerwijderen'];
var KAART_OPMERKING_TYPEN = ['registerOpmerkingOpslaan'];
var KAART_MAX_WISSEN = 100; // zoveel adrescodes past in één opdracht (zie bijwerken.js)

// ---- puur ----

// De kalenderdatum van vandaag ('JJJJ-MM-DD'): die van de server als de pagina hem kreeg, anders van dit apparaat.
function kaartVandaag(data) {
  if (data && typeof data.vandaag === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.vandaag)) return data.vandaag;
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Leeftijd en soort van een bewoner, voor de weergave. groepen = de leeftijdsgroepen van de server (mag ontbreken: dan 18 jaar en ouder is volwassen).
// Geeft { leeftijd: getal of null, soort: 'kind' | 'volwassene', tekst }.
function kaartLeeftijd(p, vandaag, groepen) {
  var l = huishoudLeeftijd(p.geboortejaar, p.geboortemaand, vandaag);
  var soort = huishoudSoort(l.leeftijd, groepen);
  var tekst = l.leeftijd === null ? 'leeftijd onbekend' : (l.ongeveer ? 'ongeveer ' : '') + l.leeftijd + ' jaar';
  return { leeftijd: l.leeftijd, soort: soort, tekst: tekst };
}

// De naam van een dieetcode volgens de keuzes van de server; een onbekende code blijft zoals hij is.
function kaartDieetNaam(code, dieetkeuzes) {
  var gevonden = (dieetkeuzes || []).filter(function (k) { return k.code === code; })[0];
  return gevonden && gevonden.naam ? gevonden.naam : String(code);
}

// De bewaartermijn van een adres in woorden en of hij voorbij is. a = een adres uit beheerWijkregister (bewaartermijn, verlopen).
function kaartBewaartermijn(a) {
  var t = a && a.bewaartermijn ? a.bewaartermijn : bewaartermijnVan(a && a.toegevoegdOp, a && a.historie);
  if (!t || typeof t.tot !== 'number') return { tekst: 'Bewaartermijn onbekend', verlopen: false, onbekend: true };
  var verlopen = !!(a && a.verlopen === true);
  return { tekst: 'Bewaren tot eind ' + t.tot, verlopen: verlopen, onbekend: false };
}

// De status van deze editie in woorden, uit ditJaar ({ status, betaalstatus, openstaand in centen }) of null.
function kaartDitJaarTekst(ditJaar) {
  if (!ditJaar) return 'Niet aangemeld voor deze editie';
  if (ditJaar.status === 'afgemeld') return 'Afgemeld voor deze editie';
  var delen = ['Aangemeld voor deze editie'];
  if (ditJaar.betaalstatus === 'betaald') delen.push('betaald');
  else if (typeof ditJaar.openstaand === 'number' && ditJaar.openstaand > 0) delen.push('nog € ' + (ditJaar.openstaand / 100).toFixed(2).replace('.', ',') + ' openstaand');
  else if (ditJaar.betaalstatus) delen.push(ditJaar.betaalstatus);
  return delen.join(', ');
}

// De adrescodes waarvan de bewaartermijn voorbij is, zoals de server ze meldt (de server rekent bij het wissen zelf opnieuw).
function kaartVerlopenCodes(adressen) {
  return (adressen || []).filter(function (a) { return a.verlopen === true; }).map(function (a) { return a.adrescode; });
}

// Mag de gebruiker verlopen gegevens wissen? Beide rechten nodig: opschonen en persoonsgegevens_zien.
function kaartMagWissen(rechten) {
  return heeftRecht(rechten || [], 'opschonen') && heeftRecht(rechten || [], 'persoonsgegevens_zien');
}

// De vraag om bevestiging voor het wissen: het aantal en wat er gebeurt. Geeft ook aan hoeveel er in deze ronde meegaan (hooguit KAART_MAX_WISSEN).
function kaartWisVraag(aantal) {
  var nu = Math.min(aantal, KAART_MAX_WISSEN);
  return 'Weet je zeker dat je de gegevens van ' + nu + (nu === 1 ? ' adres' : ' adressen') + ' wilt wissen? Alle contacten, bewoners, spullen, de historie en de betalersgegevens van ' +
    (nu === 1 ? 'dit adres gaan' : 'deze adressen gaan') + ' uit het wijkregister, omdat de bewaartermijn voorbij is. Dit kan niet ongedaan worden gemaakt.' +
    (aantal > nu ? ' Er zijn er ' + (aantal - nu) + ' meer; die volgen bij een volgende keer.' : '');
}

// Het formulier voor een bewoner naar de gegevens van de opdracht. f = de staat van het formulier. Geeft { fouten, gegevens }.
// dieetCodes = de codes van de server (mag ontbreken: dan alleen de vorm). Bij wijzigen gaan index en oud mee (oud = de bewoner zoals de commissie hem zag);
// een dieetcode die de bewoner al had blijft toegestaan, ook als ze intussen uit de keuzes is gehaald.
function kaartBewonerGegevens(f, dieetCodes) {
  var c = huishoudControleerBewoner({ voornaam: f.voornaam, geboortemaand: f.geboortemaand, geboortejaar: f.geboortejaar, dieet: f.dieet, dieetToelichting: f.dieetToelichting, ehbo: f.ehbo },
    dieetCodes || f.modus === 'wijzig' ? { dieetCodes: dieetCodes, oudDieet: f.modus === 'wijzig' && f.oud ? f.oud.dieet : undefined } : undefined);
  var gegevens = { adrescode: f.adrescode, voornaam: c.schoon.voornaam, geboortemaand: c.schoon.geboortemaand, geboortejaar: c.schoon.geboortejaar, dieet: c.schoon.dieet,
    dieetToelichting: c.schoon.dieetToelichting, ehbo: c.schoon.ehbo };
  if (f.modus === 'wijzig') { gegevens.index = f.index; gegevens.oud = f.oud; }
  return { fouten: c.fouten, gegevens: gegevens };
}

function kaartSpulGegevens(f) {
  var c = huishoudControleerSpul({ wat: f.wat, aantal: f.aantal, opmerking: f.opmerking });
  var gegevens = { adrescode: f.adrescode, wat: c.schoon.wat, aantal: c.schoon.aantal, opmerking: c.schoon.opmerking };
  if (f.modus === 'wijzig') { gegevens.index = f.index; gegevens.oud = f.oud; }
  return { fouten: c.fouten, gegevens: gegevens };
}

function kaartOpmerkingGegevens(f) {
  var c = huishoudControleerOpmerking(f.opmerking);
  return { fouten: c.fouten, gegevens: { adrescode: f.adrescode, opmerking: c.schoon, oud: f.oud } };
}

// De bewoner zoals het formulier hem vult uit wat de server gaf, en de 'oud' die de verwerker vergelijkt.
function kaartBewonerOud(p) {
  return { voornaam: p.voornaam, geboortemaand: p.geboortemaand === undefined ? null : p.geboortemaand, geboortejaar: p.geboortejaar === undefined ? null : p.geboortejaar,
    dieet: (p.dieet || []).slice(), dieetToelichting: p.dieetToelichting || '', ehbo: p.ehbo === true };
}

function kaartSpulOud(sp) {
  return { wat: sp.wat, aantal: sp.aantal === undefined ? null : sp.aantal, opmerking: sp.opmerking || '' };
}

// ---- weergave ----

function kaartData_() {
  return typeof wijkregisterLading !== 'undefined' && wijkregisterLading.data ? wijkregisterLading.data : {};
}

function kaartOpen_(f) {
  var s = wijkregisterStaat;
  f.fouten = [];
  f.focus = true;
  s.kaart = f;
  s.kaartBevestig = null;
  s.formulier = null;
  s.bevestig = null;
  s.open[f.adrescode] = true;
  wijkregisterTekenLijst_();
}

function kaartSluit_() {
  wijkregisterStaat.kaart = null;
  wijkregisterTekenLijst_();
}

function kaartStuur_(type, gegevens) {
  wijkregisterStaat.kaart = null;
  wijkregisterStuur_(type, gegevens);
  wijkregisterTekenLijst_();
}

function kaartFouten_(f, fouten, formulierId) {
  f.fouten = fouten;
  wijkregisterTekenLijst_();
  bewerkenFocusFouten(document.getElementById(formulierId));
}

function kaartBewonerOpslaan_() {
  var f = wijkregisterStaat.kaart;
  if (!f || f.soort !== 'bewoner' || !wijkregisterMagBewerken_()) return;
  var codes = (kaartData_().dieetkeuzes || []).map(function (k) { return k.code; });
  var u = kaartBewonerGegevens(f, codes.length > 0 ? codes : null);
  if (u.fouten.length > 0) { kaartFouten_(f, u.fouten, 'wijk-kaartformulier'); return; }
  kaartStuur_('registerBewonerOpslaan', u.gegevens);
}

function kaartSpulOpslaan_() {
  var f = wijkregisterStaat.kaart;
  if (!f || f.soort !== 'spul' || !wijkregisterMagBewerken_()) return;
  var u = kaartSpulGegevens(f);
  if (u.fouten.length > 0) { kaartFouten_(f, u.fouten, 'wijk-kaartformulier'); return; }
  kaartStuur_('registerSpullenOpslaan', u.gegevens);
}

function kaartOpmerkingOpslaan_() {
  var f = wijkregisterStaat.kaart;
  if (!f || f.soort !== 'opmerking' || !wijkregisterMagBewerken_()) return;
  var u = kaartOpmerkingGegevens(f);
  if (u.fouten.length > 0) { kaartFouten_(f, u.fouten, 'wijk-kaartformulier'); return; }
  kaartStuur_('registerOpmerkingOpslaan', u.gegevens);
}

function kaartVraagVerwijder_(soort, adrescode, index) {
  var s = wijkregisterStaat;
  s.kaart = null;
  s.kaartBevestig = { soort: soort, adrescode: adrescode, index: index };
  wijkregisterTekenLijst_();
}

function kaartBewonerVerwijder_(a, p, i) {
  if (!wijkregisterMagBewerken_()) return;
  wijkregisterStaat.kaartBevestig = null;
  wijkregisterStuur_('registerBewonerVerwijderen', { adrescode: a.adrescode, index: i, oud: kaartBewonerOud(p) });
  wijkregisterTekenLijst_();
}

function kaartSpulVerwijder_(a, sp, i) {
  if (!wijkregisterMagBewerken_()) return;
  wijkregisterStaat.kaartBevestig = null;
  wijkregisterStuur_('registerSpullenVerwijderen', { adrescode: a.adrescode, index: i, oud: kaartSpulOud(sp) });
  wijkregisterTekenLijst_();
}

function kaartBevestigStrook_(tekst, bijJa) {
  return el('div', { class: 'strook strook-geel bewerken-bevestig', role: 'alertdialog', 'aria-label': 'Verwijderen bevestigen' },
    el('span', { class: 'strook-tekst' }, tekst),
    el('button', { type: 'button', class: 'knop knop-gevaar bewerken-bevestig-ja', onclick: bijJa }, 'Ja, verwijderen'),
    el('button', { type: 'button', class: 'knop', onclick: function () { wijkregisterStaat.kaartBevestig = null; wijkregisterTekenLijst_(); } }, 'Nee, laat staan'));
}

function kaartFormulierKlaar_(form, f) {
  if (f.focus) { f.focus = false; setTimeout(function () { bewerkenFocus(form); }, 0); }
  return form;
}

function kaartBewonerFormulier_(f) {
  var data = kaartData_();
  var keuzes = data.dieetkeuzes || [];
  var dieetVeld = el('fieldset', { class: 'chips', id: 'wijk-k-dieet' }, el('legend', null, 'Dieet (mag leeg)'),
    keuzes.length === 0 ? el('span', { class: 'rij-sub' }, 'Er zijn geen dieetkeuzes ingesteld.') : keuzes.map(function (k) {
      var vink = el('input', { type: 'checkbox', checked: f.dieet.indexOf(k.code) !== -1, onchange: function (e) {
        var i = f.dieet.indexOf(k.code);
        if (e.target.checked && i === -1) f.dieet.push(k.code);
        if (!e.target.checked && i !== -1) f.dieet.splice(i, 1);
      } });
      return el('label', { class: 'chip' }, vink, k.naam || k.code);
    }));
  var ehbo = el('input', { type: 'checkbox', id: 'wijk-k-ehbo', checked: f.ehbo === true, onchange: function (e) { f.ehbo = e.target.checked; } });
  var velden = [
    bewerkenVeld_('wijk-k-voornaam', 'Voornaam', bewerkenTekstvak_(f, 'voornaam', 'wijk-k-voornaam', { required: 'required', maxlength: String(HUISHOUD_MAX_VOORNAAM) })),
    bewerkenVeld_('wijk-k-maand', 'Geboortemaand (1 tot en met 12, mag leeg)', bewerkenTekstvak_(f, 'geboortemaand', 'wijk-k-maand', { inputmode: 'numeric', maxlength: '2' })),
    bewerkenVeld_('wijk-k-jaar', 'Geboortejaar (vier cijfers, mag leeg)', bewerkenTekstvak_(f, 'geboortejaar', 'wijk-k-jaar', { inputmode: 'numeric', maxlength: '4' })),
    dieetVeld,
    bewerkenVeld_('wijk-k-toelichting', 'Toelichting bij het dieet (mag leeg)', bewerkenTekstvak_(f, 'dieetToelichting', 'wijk-k-toelichting', { maxlength: String(HUISHOUD_MAX_TOELICHTING) })),
    el('div', { class: 'veld' }, el('label', { for: 'wijk-k-ehbo' }, ehbo, ' Heeft een EHBO-diploma'))
  ];
  return kaartFormulierKlaar_(bewerkenFormulier({ id: 'wijk-kaartformulier', titel: f.modus === 'wijzig' ? 'Bewoner wijzigen' : 'Bewoner toevoegen', velden: velden,
    fouten: f.fouten || [], opslaanTekst: 'Opslaan', bijOpslaan: kaartBewonerOpslaan_, bijAnnuleren: kaartSluit_ }), f);
}

function kaartSpulFormulier_(f) {
  var velden = [
    bewerkenVeld_('wijk-k-wat', 'Wat leen je uit?', bewerkenTekstvak_(f, 'wat', 'wijk-k-wat', { required: 'required', maxlength: String(HUISHOUD_MAX_SPUL_WAT) })),
    bewerkenVeld_('wijk-k-aantal', 'Aantal (1 tot en met 999, mag leeg)', bewerkenTekstvak_(f, 'aantal', 'wijk-k-aantal', { inputmode: 'numeric', maxlength: '3' })),
    bewerkenVeld_('wijk-k-opmerking', 'Opmerking (mag leeg)', bewerkenTekstvak_(f, 'opmerking', 'wijk-k-opmerking', { maxlength: String(HUISHOUD_MAX_SPUL_OPMERKING) }))
  ];
  return kaartFormulierKlaar_(bewerkenFormulier({ id: 'wijk-kaartformulier', titel: f.modus === 'wijzig' ? 'Spul wijzigen' : 'Spul toevoegen', velden: velden,
    fouten: f.fouten || [], opslaanTekst: 'Opslaan', bijOpslaan: kaartSpulOpslaan_, bijAnnuleren: kaartSluit_ }), f);
}

function kaartOpmerkingFormulier_(f) {
  var vak = el('textarea', { id: 'wijk-k-adresopmerking', rows: '4', maxlength: String(HUISHOUD_MAX_ADRES_OPMERKING), oninput: function (e) { f.opmerking = e.target.value; } });
  vak.value = f.opmerking;
  var velden = [bewerkenVeld_('wijk-k-adresopmerking', 'Opmerking over dit adres (hooguit ' + HUISHOUD_MAX_ADRES_OPMERKING + ' tekens)', vak)];
  var form = bewerkenFormulier({ id: 'wijk-kaartformulier', titel: 'Opmerking bewerken', velden: velden, fouten: f.fouten || [], opslaanTekst: 'Opslaan',
    bijOpslaan: kaartOpmerkingOpslaan_, bijAnnuleren: kaartSluit_ });
  if (f.focus) { f.focus = false; setTimeout(function () { var v = form.querySelector('textarea'); if (v) { v.focus(); if (form.scrollIntoView) form.scrollIntoView({ block: 'nearest' }); } }, 0); }
  return form;
}

function kaartBewonerTekst_(p, data, wacht) {
  var l = kaartLeeftijd(p, kaartVandaag(data), data.leeftijdsgroepen);
  // is de leeftijd onbekend (geen geboortejaar), dan staat er alleen 'leeftijd onbekend': kind of volwassene weten we dan niet
  var sub = [l.leeftijd === null ? l.tekst : l.soort + ', ' + l.tekst];
  var dieet = (p.dieet || []).map(function (c) { return kaartDieetNaam(c, data.dieetkeuzes); });
  if (dieet.length > 0) sub.push('dieet: ' + dieet.join(', '));
  if (p.dieetToelichting) sub.push('toelichting: ' + p.dieetToelichting);
  if (p.ehbo) sub.push('EHBO');
  return [el('span', { class: 'rij-titel' }, p.voornaam || 'Zonder naam'), wacht ? ' ' : null, wacht ? bewerkenWachtLabel(wacht) : null,
    el('div', { class: 'rij-sub' }, sub.join(' · '))];
}

function kaartBewonersBlok_(a, mag) {
  var s = wijkregisterStaat;
  var data = kaartData_();
  var personen = a.personen || [];
  var wacht = bewerkenWachtVoor(s.wacht, a.adrescode, KAART_BEWONER_TYPEN);
  var f = s.kaart;
  var rijen = personen.map(function (p, i) {
    if (mag && f && f.soort === 'bewoner' && f.modus === 'wijzig' && f.adrescode === a.adrescode && f.index === i) return el('li', null, kaartBewonerFormulier_(f));
    var eigen = wacht.filter(function (w) { return w.gegevens.index === i; });
    if (eigen.length > 0) {
      var laatste = eigen[eigen.length - 1];
      if (laatste.type === 'registerBewonerVerwijderen') return el('li', { class: 'bewerken-wacht-rij' }, kaartBewonerTekst_(p, data, 'wordt verwijderd'));
      var nieuw = Object.assign({}, p, { voornaam: laatste.gegevens.voornaam, geboortemaand: laatste.gegevens.geboortemaand, geboortejaar: laatste.gegevens.geboortejaar,
        dieet: laatste.gegevens.dieet, dieetToelichting: laatste.gegevens.dieetToelichting, ehbo: laatste.gegevens.ehbo });
      return el('li', { class: 'bewerken-wacht-rij' }, kaartBewonerTekst_(nieuw, data, 'wordt verwerkt'));
    }
    var delen = kaartBewonerTekst_(p, data, null);
    // zolang er voor dit adres bewoners worden verwerkt kloppen de plekken niet meer: geen knoppen
    if (wacht.length > 0 || !mag) return el('li', null, delen);
    if (s.kaartBevestig && s.kaartBevestig.soort === 'bewoner' && s.kaartBevestig.adrescode === a.adrescode && s.kaartBevestig.index === i) {
      delen.push(kaartBevestigStrook_('Weet je zeker dat je ' + (p.voornaam || 'deze bewoner') + ' uit het wijkregister wilt verwijderen? Dit kan niet ongedaan worden gemaakt.',
        function () { kaartBewonerVerwijder_(a, p, i); }));
    } else {
      delen.push(el('div', { class: 'knoppen bewerken-knoppen' },
        el('button', { type: 'button', class: 'knop knop-klein', onclick: function () {
          kaartOpen_({ soort: 'bewoner', modus: 'wijzig', adrescode: a.adrescode, index: i, oud: kaartBewonerOud(p), voornaam: p.voornaam,
            geboortemaand: p.geboortemaand === null || p.geboortemaand === undefined ? '' : String(p.geboortemaand),
            geboortejaar: p.geboortejaar === null || p.geboortejaar === undefined ? '' : String(p.geboortejaar),
            dieet: (p.dieet || []).slice(), dieetToelichting: p.dieetToelichting || '', ehbo: p.ehbo === true });
        } }, 'Wijzigen'),
        el('button', { type: 'button', class: 'knop knop-klein knop-gevaar', onclick: function () { kaartVraagVerwijder_('bewoner', a.adrescode, i); } }, 'Verwijderen')));
    }
    return el('li', null, delen);
  });
  wacht.filter(function (w) { return w.type === 'registerBewonerOpslaan' && w.gegevens.index === undefined; }).forEach(function (w) {
    rijen.push(el('li', { class: 'bewerken-wacht-rij' }, kaartBewonerTekst_(w.gegevens, data, 'wordt toegevoegd')));
  });
  var nieuwFormulier = mag && f && f.soort === 'bewoner' && f.modus === 'nieuw' && f.adrescode === a.adrescode;
  if (nieuwFormulier) rijen.push(el('li', null, kaartBewonerFormulier_(f)));
  var aantalNu = personen.length;
  return el('div', { class: 'deeln-blok' }, el('strong', null, 'Bewoners (' + aantalNu + ')'),
    rijen.length === 0 ? el('div', { class: 'rij-sub' }, 'Geen bewoners bewaard.') : el('ul', { class: 'deeln-personen' }, rijen),
    mag && !nieuwFormulier && wacht.length === 0 ? el('div', { class: 'knoppen bewerken-knoppen' },
      el('button', { type: 'button', class: 'knop knop-klein', onclick: function () {
        kaartOpen_({ soort: 'bewoner', modus: 'nieuw', adrescode: a.adrescode, voornaam: '', geboortemaand: '', geboortejaar: '', dieet: [], dieetToelichting: '', ehbo: false });
      } }, 'Bewoner toevoegen')) : null);
}

function kaartSpulTekst_(sp, wacht) {
  var sub = [];
  if (sp.aantal !== null && sp.aantal !== undefined && sp.aantal !== '') sub.push('aantal: ' + sp.aantal);
  if (sp.opmerking) sub.push(sp.opmerking);
  return [el('span', { class: 'rij-titel' }, sp.wat || 'Zonder naam'), wacht ? ' ' : null, wacht ? bewerkenWachtLabel(wacht) : null,
    sub.length > 0 ? el('div', { class: 'rij-sub' }, sub.join(' · ')) : null];
}

function kaartSpullenBlok_(a, mag) {
  var s = wijkregisterStaat;
  var spullen = a.spullen || [];
  var wacht = bewerkenWachtVoor(s.wacht, a.adrescode, KAART_SPUL_TYPEN);
  var f = s.kaart;
  var rijen = spullen.map(function (sp, i) {
    if (mag && f && f.soort === 'spul' && f.modus === 'wijzig' && f.adrescode === a.adrescode && f.index === i) return el('li', null, kaartSpulFormulier_(f));
    var eigen = wacht.filter(function (w) { return w.gegevens.index === i; });
    if (eigen.length > 0) {
      var laatste = eigen[eigen.length - 1];
      if (laatste.type === 'registerSpullenVerwijderen') return el('li', { class: 'bewerken-wacht-rij' }, kaartSpulTekst_(sp, 'wordt verwijderd'));
      return el('li', { class: 'bewerken-wacht-rij' }, kaartSpulTekst_({ wat: laatste.gegevens.wat, aantal: laatste.gegevens.aantal, opmerking: laatste.gegevens.opmerking }, 'wordt verwerkt'));
    }
    var delen = kaartSpulTekst_(sp, null);
    if (wacht.length > 0 || !mag) return el('li', null, delen);
    if (s.kaartBevestig && s.kaartBevestig.soort === 'spul' && s.kaartBevestig.adrescode === a.adrescode && s.kaartBevestig.index === i) {
      delen.push(kaartBevestigStrook_('Weet je zeker dat je "' + (sp.wat || 'dit spul') + '" uit het wijkregister wilt verwijderen? Dit kan niet ongedaan worden gemaakt.',
        function () { kaartSpulVerwijder_(a, sp, i); }));
    } else {
      delen.push(el('div', { class: 'knoppen bewerken-knoppen' },
        el('button', { type: 'button', class: 'knop knop-klein', onclick: function () {
          kaartOpen_({ soort: 'spul', modus: 'wijzig', adrescode: a.adrescode, index: i, oud: kaartSpulOud(sp), wat: sp.wat,
            aantal: sp.aantal === null || sp.aantal === undefined ? '' : String(sp.aantal), opmerking: sp.opmerking || '' });
        } }, 'Wijzigen'),
        el('button', { type: 'button', class: 'knop knop-klein knop-gevaar', onclick: function () { kaartVraagVerwijder_('spul', a.adrescode, i); } }, 'Verwijderen')));
    }
    return el('li', null, delen);
  });
  wacht.filter(function (w) { return w.type === 'registerSpullenOpslaan' && w.gegevens.index === undefined; }).forEach(function (w) {
    rijen.push(el('li', { class: 'bewerken-wacht-rij' }, kaartSpulTekst_(w.gegevens, 'wordt toegevoegd')));
  });
  var nieuwFormulier = mag && f && f.soort === 'spul' && f.modus === 'nieuw' && f.adrescode === a.adrescode;
  if (nieuwFormulier) rijen.push(el('li', null, kaartSpulFormulier_(f)));
  return el('div', { class: 'deeln-blok' }, el('strong', null, 'Spullen om te lenen (' + spullen.length + ')'),
    rijen.length === 0 ? el('div', { class: 'rij-sub' }, 'Geen spullen bewaard.') : el('ul', { class: 'deeln-personen' }, rijen),
    mag && !nieuwFormulier && wacht.length === 0 ? el('div', { class: 'knoppen bewerken-knoppen' },
      el('button', { type: 'button', class: 'knop knop-klein', onclick: function () {
        kaartOpen_({ soort: 'spul', modus: 'nieuw', adrescode: a.adrescode, wat: '', aantal: '', opmerking: '' });
      } }, 'Spul toevoegen')) : null);
}

function kaartOpmerkingBlok_(a, mag) {
  var s = wijkregisterStaat;
  var f = s.kaart;
  var wacht = bewerkenWachtVoor(s.wacht, a.adrescode, KAART_OPMERKING_TYPEN);
  if (mag && f && f.soort === 'opmerking' && f.adrescode === a.adrescode) return el('div', { class: 'deeln-blok' }, el('strong', null, 'Opmerking'), kaartOpmerkingFormulier_(f));
  var tekst = wacht.length > 0 ? wacht[wacht.length - 1].gegevens.opmerking : (a.opmerking || '');
  return el('div', { class: 'deeln-blok' }, el('strong', null, 'Opmerking'), wacht.length > 0 ? bewerkenWachtLabel('wordt verwerkt') : null,
    tekst === '' ? el('div', { class: 'rij-sub' }, 'Geen opmerking.') : el('div', { style: 'white-space:pre-wrap' }, tekst),
    mag && wacht.length === 0 ? el('div', { class: 'knoppen bewerken-knoppen' },
      el('button', { type: 'button', class: 'knop knop-klein', onclick: function () {
        kaartOpen_({ soort: 'opmerking', adrescode: a.adrescode, opmerking: a.opmerking || '', oud: a.opmerking || '' });
      } }, tekst === '' ? 'Opmerking toevoegen' : 'Opmerking wijzigen')) : null);
}

function kaartDeelnameBlok_(a) {
  var historie = a.historie || [];
  var t = kaartBewaartermijn(a);
  return el('div', { class: 'deeln-blok' }, el('strong', null, 'Deelname'),
    el('div', null, kaartDitJaarTekst(a.ditJaar)),
    historie.length === 0 ? el('div', { class: 'rij-sub' }, 'Nog geen jaren in de historie.') :
      el('ul', { class: 'deeln-personen' }, historie.map(function (h) {
        return el('li', null, el('span', { class: 'rij-titel' }, String(h.jaar)),
          el('span', { class: 'rij-sub' }, ' ' + (h.aangemeld ? 'aangemeld' : 'niet aangemeld') + (h.betaald ? ', betaald' : '')));
      })),
    el('div', { class: 'rij-sub' }, t.tekst), t.verlopen ? bewerkenWachtLabel('bewaartermijn verlopen') : null);
}

// ---- verlopen gegevens wissen ----

// De chip 'Bewaartermijn verlopen' en, met de rechten, de knop 'Verlopen gegevens wissen' met de vraag om bevestiging in de pagina.
function kaartVerlopenBalk() {
  var s = wijkregisterStaat;
  var d = kaartData_();
  var codes = kaartVerlopenCodes(d.adressen);
  var rechten = wijkregisterApp ? wijkregisterApp.rechten : [];
  var delen = [el('button', { type: 'button', class: 'kas-chip', 'aria-pressed': s.filterVerlopen ? 'true' : 'false', onclick: function () {
    s.filterVerlopen = !s.filterVerlopen;
    s.toon = WIJKREGISTER_PAGINA;
    wijkregisterTekenLijst_();
    wijkregisterTekenVerlopen_();
  } }, 'Bewaartermijn verlopen (' + codes.length + ')')];
  var wis = Object.keys(s.wacht.lijst).some(function (id) { return s.wacht.lijst[id].type === 'registerOpschonen'; });
  if (kaartMagWissen(rechten) && codes.length > 0) {
    if (wis) delen.push(el('span', { class: 'rij-sub' }, ' '), bewerkenWachtLabel('wissen wordt verwerkt'));
    else if (s.wisBevestig) {
      delen.push(el('div', { class: 'strook strook-geel bewerken-bevestig', role: 'alertdialog', 'aria-label': 'Wissen bevestigen' },
        el('span', { class: 'strook-tekst' }, kaartWisVraag(codes.length)),
        el('button', { type: 'button', class: 'knop knop-gevaar bewerken-bevestig-ja', onclick: function () {
          s.wisBevestig = false;
          wijkregisterStuur_('registerOpschonen', { codes: codes.slice(0, KAART_MAX_WISSEN) });
          wijkregisterTekenLijst_();
          wijkregisterTekenVerlopen_();
        } }, 'Ja, wissen'),
        el('button', { type: 'button', class: 'knop', onclick: function () { s.wisBevestig = false; wijkregisterTekenVerlopen_(); } }, 'Nee, laat staan')));
    } else {
      delen.push(el('button', { type: 'button', class: 'knop knop-klein knop-gevaar', onclick: function () { s.wisBevestig = true; wijkregisterTekenVerlopen_(); } },
        'Verlopen gegevens wissen'));
    }
  }
  return delen;
}

// Het hele detail van een adres: bewoners, contacten (zoals in 2b), spullen, opmerking en deelname. De contacten tekent scherm-wijkregister.js zelf.
function kaartBlokken(a, mag) {
  return { bewoners: kaartBewonersBlok_(a, mag), spullen: kaartSpullenBlok_(a, mag), opmerking: kaartOpmerkingBlok_(a, mag), deelname: kaartDeelnameBlok_(a) };
}
