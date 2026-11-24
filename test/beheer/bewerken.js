// Gemeenschappelijke onderdelen van de schermen Deelnemers en Wijkregister voor het bijwerken van buurgegevens (fase 2b):
// wie mag bewerken, het geheugen van opdrachten die nog worden verwerkt, en het formulier voor een contact.
// Alles wat hier staat blijft in het geheugen van de pagina: nooit op het apparaat bewaard (er zitten namen, e-mailadressen en telefoonnummers in).
// Vereist: app.js (el), gedeeld/rechten.js (heeftRecht), gedeeld/validatie.js en gedeeld/contactcontrole.js (controleerContactGegevens).
// De pure functies bovenaan zijn getest met Node (test/bewerken.test.js); de functies met el() staan eronder.

var BEWERKEN_TYPEN = {
  registerContactOpslaan: 'Contact gewijzigd',
  registerContactVerwijderen: 'Contact verwijderd',
  registerAdresToevoegen: 'Adres toegevoegd',
  deelnemerContactOpslaan: 'Deelnemer gewijzigd',
  registerBewonerOpslaan: 'Bewoner opgeslagen',
  registerBewonerVerwijderen: 'Bewoner verwijderd',
  registerSpullenOpslaan: 'Spul opgeslagen',
  registerSpullenVerwijderen: 'Spul verwijderd',
  registerOpmerkingOpslaan: 'Opmerking opgeslagen',
  registerOpschonen: 'Verlopen gegevens wissen'
};

// Bewerken mag alleen met beide rechten: deelnemer_bewerken én persoonsgegevens_zien.
function bewerkenMag(rechten) {
  return heeftRecht(rechten || [], 'deelnemer_bewerken') && heeftRecht(rechten || [], 'persoonsgegevens_zien');
}

// Het geheugen van een scherm voor opdrachten die het zelf heeft gestuurd: lijst = { id: { type, gegevens } } (de gegevens voor de
// voorlopige weergave als 'wordt verwerkt'), fouten = [{ id, type, melding }] voor wat niet lukte (blijft staan tot de gebruiker sluit),
// infos = [{ id, type, melding }] voor een opdracht die klaar is en iets te melden had (bijvoorbeeld hoeveel adressen er echt gewist zijn; ook tot Sluiten).
function maakBewerkenWacht() {
  return { lijst: {}, fouten: [], infos: [] };
}

// Een opdracht die na zo lang nog niet klaar of mislukt is gemeld, wordt niet langer als 'wordt verwerkt' getoond (de pagina leest dan opnieuw).
// Iets boven VERSTUURD_BEWAAR_MS in wachtrij.js, waarna de pagina de opdracht zelf ook vergeet.
var BEWERKEN_WACHT_MAX_MS = 20 * 60 * 1000;

function bewerkenWachtVoegToe(wacht, id, type, gegevens, nu) {
  wacht.lijst[id] = { type: type, gegevens: gegevens, klaar: false, op: typeof nu === 'number' ? nu : Date.now() };
}

// Kijkt per eigen opdracht wat de server zegt (mijnOpdrachten van de momentopname) en past het geheugen aan:
// - klaar: blijft in het geheugen met klaar = true tot het scherm zijn gegevens opnieuw heeft opgehaald (bewerkenWachtOpruim); heeft de server een melding bij
//   'klaar' gezet, dan komt die ook in wacht.infos;
// - fout: gaat naar wacht.fouten met de melding van de server;
// - door de server geweigerd (id staat in mislukteIds; de schil toont die melding zelf): weg.
// - te oud (BEWERKEN_WACHT_MAX_MS, nu = tijd in ms) en nog niet klaar: weg, en verlopen telt mee zodat het scherm opnieuw leest.
// Geeft { klaar, fout, weg, verlopen } = aantallen die er nu bij kwamen. Wat nog onderweg is of bij de server op 'nieuw' staat, blijft ongemoeid.
function bewerkenWachtVerwerk(wacht, momentopname, mislukteIds, nu) {
  var tijd = typeof nu === 'number' ? nu : Date.now();
  var eigen = {};
  ((momentopname && momentopname.mijnOpdrachten) || []).forEach(function (o) { eigen[o.id] = o; });
  var uit = { klaar: 0, fout: 0, weg: 0, verlopen: 0 };
  Object.keys(wacht.lijst).forEach(function (id) {
    var item = wacht.lijst[id];
    if ((mislukteIds || []).indexOf(id) !== -1) { delete wacht.lijst[id]; uit.weg++; return; }
    var o = eigen[id];
    if (!o && !item.klaar && typeof item.op === 'number' && tijd - item.op > BEWERKEN_WACHT_MAX_MS) { delete wacht.lijst[id]; uit.verlopen++; return; }
    if (!o || item.klaar) return;
    if (o.status === 'klaar') {
      item.klaar = true; uit.klaar++;
      if (typeof o.melding === 'string' && o.melding !== '') wacht.infos.push({ id: id, type: item.type, melding: o.melding });
    }
    else if (o.status === 'fout') {
      delete wacht.lijst[id];
      wacht.fouten.push({ id: id, type: item.type, melding: String(o.melding || '') });
      uit.fout++;
    }
  });
  return uit;
}

// De gegevens zijn opnieuw opgehaald: wat klaar was, hoeft niet meer als 'wordt verwerkt' te worden getoond.
function bewerkenWachtOpruim(wacht) {
  Object.keys(wacht.lijst).forEach(function (id) { if (wacht.lijst[id].klaar) delete wacht.lijst[id]; });
}

function bewerkenWachtAantal(wacht) {
  return Object.keys(wacht.lijst).length;
}

// Een korte vingerafdruk van wat het geheugen toont, zodat een scherm alleen opnieuw tekent als er iets verandert.
function bewerkenWachtHandtekening(wacht) {
  return Object.keys(wacht.lijst).sort().map(function (id) { return id + (wacht.lijst[id].klaar ? '!' : ''); }).join(',') + '|' + wacht.fouten.length + (wacht.infos && wacht.infos.length > 0 ? '|i' + wacht.infos.length : '');
}

// De opdrachten in het geheugen van dit type voor dit adres, in volgorde van versturen (de sleutels zijn kenmerken met willekeurige volgorde, dus op toevoegvolgorde: Object.keys houdt die aan).
function bewerkenWachtVoor(wacht, adrescode, typen) {
  return Object.keys(wacht.lijst).map(function (id) { return { id: id, type: wacht.lijst[id].type, gegevens: wacht.lijst[id].gegevens }; }).filter(function (w) {
    return typen.indexOf(w.type) !== -1 && w.gegevens && w.gegevens.adrescode === adrescode;
  });
}

// Verkort de naam van een contact voor in een bevestiging.
function bewerkenNaam(c) {
  var n = (String(c.voornaam || '') + ' ' + String(c.achternaam || '')).trim();
  return n === '' ? 'dit contact' : n;
}

// ---- formulier (el) ----

function bewerkenVeld_(id, label, invoer, hulp) {
  return el('div', { class: 'veld' }, el('label', { for: id }, label), invoer, hulp ? el('span', { class: 'begr-hulp', id: id + '-hulp' }, hulp) : null);
}

function bewerkenTekstvak_(f, naam, id, opties) {
  var invoer = el('input', Object.assign({
    type: 'text', id: id, maxlength: String(CONTACT_MAX_TEKENS), autocomplete: 'off',
    oninput: function (e) { f[naam] = e.target.value; }
  }, opties || {}));
  invoer.value = f[naam] === undefined || f[naam] === null ? '' : f[naam];
  return invoer;
}

// De vier velden van een contact (voornaam, achternaam, e-mail, telefoon) die de waarden in f bijhouden. voorvoegsel maakt de id's uniek.
function bewerkenContactVelden(f, voorvoegsel) {
  return [
    bewerkenVeld_(voorvoegsel + '-voornaam', 'Voornaam', bewerkenTekstvak_(f, 'voornaam', voorvoegsel + '-voornaam', { required: 'required', autocomplete: 'off' })),
    bewerkenVeld_(voorvoegsel + '-achternaam', 'Achternaam (mag leeg)', bewerkenTekstvak_(f, 'achternaam', voorvoegsel + '-achternaam')),
    bewerkenVeld_(voorvoegsel + '-email', 'E-mailadres (mag leeg)', bewerkenTekstvak_(f, 'email', voorvoegsel + '-email', { type: 'email', inputmode: 'email', autocapitalize: 'none' })),
    bewerkenVeld_(voorvoegsel + '-telefoon', 'Telefoon (mag leeg)', bewerkenTekstvak_(f, 'telefoon', voorvoegsel + '-telefoon', { type: 'tel', inputmode: 'tel' }))
  ];
}

// Het formulier zelf: opties = { id, titel, velden: [knopen], fouten: [teksten], opslaanTekst, bijOpslaan(), bijAnnuleren() }.
function bewerkenFormulier(opties) {
  var fouten = opties.fouten || [];
  return el('form', { class: 'begr-formulier bewerken-formulier', id: opties.id, novalidate: 'novalidate', 'aria-label': opties.titel,
    onsubmit: function (e) { e.preventDefault(); opties.bijOpslaan(); } },
    el('h3', { class: 'bewerken-titel' }, opties.titel),
    el('div', { class: 'begr-fouten bewerken-fouten' + (fouten.length ? '' : ' begr-fouten-leeg'), role: 'alert', tabindex: '-1' },
      fouten.length ? el('ul', null, fouten.map(function (t) { return el('li', null, t); })) : null),
    el('div', { class: 'begr-velden' }, opties.velden),
    el('div', { class: 'knoppen' },
      el('button', { type: 'submit', class: 'knop knop-hoofd' }, opties.opslaanTekst || 'Opslaan'),
      el('button', { type: 'button', class: 'knop', onclick: opties.bijAnnuleren }, 'Annuleren')));
}

// Zet de focus op het eerste veld van een formulier (en brengt het in beeld).
function bewerkenFocus(formulier) {
  var veld = formulier && formulier.querySelector('input, select');
  if (veld) { veld.focus(); if (formulier.scrollIntoView) formulier.scrollIntoView({ block: 'nearest' }); }
}

// Zet de focus op het foutenvak (na een mislukte controle), zodat een schermlezer de meldingen voorleest.
function bewerkenFocusFouten(formulier) {
  var vak = formulier && formulier.querySelector('.bewerken-fouten');
  if (vak) vak.focus();
}

// Strook met wat niet lukte: elke melding met Sluiten. sluit(index) haalt hem weg.
function bewerkenFoutStroken(wacht, sluit) {
  return wacht.fouten.map(function (f, i) {
    var wat = Object.prototype.hasOwnProperty.call(BEWERKEN_TYPEN, f.type) ? BEWERKEN_TYPEN[f.type] : 'De wijziging';
    return el('div', { class: 'strook strook-fout', role: 'alert' },
      el('span', { class: 'strook-tekst' }, wat + ' is niet gelukt' + (f.melding ? ': ' + f.melding : '.')),
      el('button', { type: 'button', class: 'knop', onclick: function () { sluit(i); } }, 'Sluiten'));
  });
}

// Strook met wat de server bij een gelukte opdracht meldde (zoals 'N adressen gewist'), met Sluiten. sluit(index) haalt hem weg.
function bewerkenInfoStroken(wacht, sluit) {
  return (wacht.infos || []).map(function (f, i) {
    return el('div', { class: 'strook strook-ok', role: 'status' },
      el('span', { class: 'strook-tekst' }, f.melding),
      el('button', { type: 'button', class: 'knop', onclick: function () { sluit(i); } }, 'Sluiten'));
  });
}

// Het label 'wordt verwerkt' bij iets dat wacht op de server.
function bewerkenWachtLabel(tekst) {
  return el('span', { class: 'label label-geel bewerken-wacht' }, tekst || 'wordt verwerkt');
}

// De schilfuncties die de schermen nodig hebben, met een val voor als ze (nog) niet bestaan.
function bewerkenMislukteIds() {
  return typeof mislukteLees === 'function' && typeof beheerOpslag !== 'undefined' ? mislukteLees(beheerOpslag).map(function (m) { return m.opdracht.id; }) : [];
}
