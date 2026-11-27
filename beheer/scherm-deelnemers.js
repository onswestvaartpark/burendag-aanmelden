// Scherm Deelnemers: totalen, zoeken, filter en de lijst van huishoudens met uitklapbaar detail.
// De gegevens komen direct van het achterwerk (beheerDeelnemers), staan alleen in het geheugen en worden niet bewaard op het apparaat.
// Namen, contactgegevens en personen zitten er alleen in met het recht persoonsgegevens_zien: het scherm toont wat er is.
// Met ook het recht deelnemer_bewerken kan de commissie het contact van een huishouden wijzigen (fase 2b, opdracht deelnemerContactOpslaan);
// de wijziging staat tot de server klaar is als 'wordt verwerkt' in het geheugen van dit scherm.
// Vereist app.js (registreerScherm, el, euro, meervoud_, heeftRecht), api.js (maakDirecteLading) en bewerken.js.

var DEELNEMERS_PAGINA = 60;
var DEELNEMERS_FILTERS = [
  { id: 'alles', tekst: 'Alles' },
  { id: 'open', tekst: 'Nog te betalen' },
  { id: 'betaald', tekst: 'Betaald' }
];

var deelnemersLading = maakDirecteLading('beheerDeelnemers');
// formulier = het open formulier 'Contact wijzigen', wacht = opdrachten die dit scherm stuurde en die de server nog niet klaar heeft
function deelnemersNieuweStaat_(email) {
  return { email: email, zoek: '', filter: 'alles', toon: DEELNEMERS_PAGINA, open: {}, formulier: null, wacht: maakBewerkenWacht(), handtekening: '' };
}
var deelnemersStaat = deelnemersNieuweStaat_('');
var deelnemersVak = null; // { wortel, totalen, melding, status, chips, lijst, meer }
var deelnemersApp = null; // de laatste staat van de schil (rechten, stuurOpdracht)

// Uitgelogd, sessiefout of een ander account: alles uit het geheugen.
function deelnemersVergeet() {
  deelnemersLading.vergeet();
  deelnemersStaat = deelnemersNieuweStaat_(deelnemersStaat.email);
  deelnemersVak = null;
  deelnemersApp = null;
}

function deelnemersMagBewerken_() {
  return !!deelnemersApp && bewerkenMag(deelnemersApp.rechten);
}

function deelnemersAdresVergelijk_(a, b) {
  return String(a.adres || '').localeCompare(String(b.adres || ''), 'nl', { numeric: true, sensitivity: 'base' });
}

function deelnemersKleinLetters_(t) { return String(t === null || t === undefined ? '' : t).toLowerCase(); }

function deelnemersActief_(h) { return h.status !== 'afgemeld'; }

function deelnemersPastBijFilter_(h, filter) {
  if (filter === 'open') return deelnemersActief_(h) && h.openstaand > 0;
  if (filter === 'betaald') return deelnemersActief_(h) && h.bedrag > 0 && h.openstaand === 0;
  return true;
}

// Zoekt in adres en, als die er zijn, naam en email.
function deelnemersPastBijZoek_(h, zoek) {
  if (zoek === '') return true;
  return [h.adres, h.naam, h.email].some(function (t) { return deelnemersKleinLetters_(t).indexOf(zoek) >= 0; });
}

// Het label met de betaalstatus en, bij een openstaand bedrag, het bedrag.
function deelnemersBetaalLabel_(h) {
  if (!deelnemersActief_(h)) return { tekst: 'Afgemeld', klasse: 'label label-grijs' };
  if (h.openstaand > 0) return { tekst: 'Nog ' + euro(h.openstaand), klasse: 'label label-geel' };
  if (h.betaalstatus === 'terug te betalen') return { tekst: 'Te veel betaald', klasse: 'label label-geel' };
  if (h.bedrag === 0) return { tekst: 'Vrijgesteld', klasse: 'label label-grijs' };
  return { tekst: 'Betaald', klasse: 'label' };
}

function deelnemersMailLink_(email) {
  var e = String(email || '').trim();
  return e === '' ? null : el('a', { href: 'mailto:' + e }, e);
}

function deelnemersTelLink_(telefoon) {
  var t = telefoonOpmaak(telefoon);
  var nummer = telefoonCijfers(telefoon);
  return t === '' ? null : (nummer === '' ? el('span', null, t) : el('a', { href: 'tel:' + nummer }, t));
}

function deelnemersDatum_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? Number(m[3]) + '-' + Number(m[2]) + '-' + m[1] : '';
}

function deelnemersPersoonTekst_(p) {
  var delen = [];
  if (p.leeftijdsgroep) delen.push(p.leeftijdsgroep);
  delen.push(p.eetMee ? 'eet mee' : 'eet niet mee');
  if (Array.isArray(p.dieet) && p.dieet.length > 0) delen.push('dieet: ' + p.dieet.join(', '));
  if (p.dieetToelichting) delen.push(p.dieetToelichting);
  if (p.ehbo) delen.push('EHBO');
  return delen.join(' · ');
}

// Het blok Contact: de gegevens (of de nieuwe, als 'wordt verwerkt'), met 'Contact wijzigen' of het formulier.
function deelnemersContactBlok_(h) {
  var s = deelnemersStaat;
  var mag = deelnemersMagBewerken_();
  var f = s.formulier;
  if (mag && f && f.adrescode === h.adrescode) return el('div', { class: 'deeln-blok' }, el('strong', null, 'Contact'), deelnemersContactFormulier_(f));
  var wacht = bewerkenWachtVoor(s.wacht, h.adrescode, ['deelnemerContactOpslaan']);
  var tonen = h;
  if (wacht.length > 0) {
    var g = wacht[wacht.length - 1].gegevens;
    tonen = { naam: (g.voornaam + ' ' + (g.achternaam || '')).trim(), email: g.email, telefoon: g.telefoon };
  }
  var contact = [];
  if (tonen.naam) contact.push(el('div', null, tonen.naam));
  if (tonen.email) contact.push(el('div', null, deelnemersMailLink_(tonen.email)));
  if (tonen.telefoon) contact.push(el('div', null, deelnemersTelLink_(tonen.telefoon)));
  if (wacht.length > 0) contact.push(el('div', null, bewerkenWachtLabel('wordt verwerkt')));
  else if (mag) {
    contact.push(el('div', { class: 'knoppen bewerken-knoppen' }, el('button', { type: 'button', class: 'knop knop-klein', onclick: function () {
      s.formulier = { adrescode: h.adrescode, oud: { email: h.email || '' }, voornaam: h.voornaam || '', achternaam: h.achternaam || '', email: h.email || '', telefoon: telefoonOpmaak(h.telefoon), fouten: [], focus: true };
      deelnemersTekenLijst_();
    } }, 'Contact wijzigen')));
  }
  return contact.length > 0 ? el('div', { class: 'deeln-blok' }, el('strong', null, 'Contact'), contact) : null;
}

function deelnemersContactFormulier_(f) {
  var form = bewerkenFormulier({
    id: 'deeln-contactformulier', titel: 'Contact wijzigen', velden: bewerkenContactVelden(f, 'deeln-c'), fouten: f.fouten || [],
    opslaanTekst: 'Opslaan', bijOpslaan: deelnemersContactOpslaan_, bijAnnuleren: function () { deelnemersStaat.formulier = null; deelnemersTekenLijst_(); }
  });
  if (f.focus) { f.focus = false; setTimeout(function () { bewerkenFocus(form); }, 0); }
  return form;
}

function deelnemersContactOpslaan_() {
  var s = deelnemersStaat;
  var f = s.formulier;
  if (!f || !deelnemersMagBewerken_()) return;
  var c = controleerContactGegevens(f);
  if (c.fouten.length > 0) {
    f.fouten = c.fouten;
    deelnemersTekenLijst_();
    bewerkenFocusFouten(document.getElementById('deeln-contactformulier'));
    return;
  }
  var gegevens = { adrescode: f.adrescode, voornaam: c.schoon.voornaam, achternaam: c.schoon.achternaam, email: c.schoon.email, telefoon: c.schoon.telefoon, oud: f.oud };
  s.formulier = null;
  var uit = deelnemersApp.stuurOpdracht('deelnemerContactOpslaan', gegevens);
  bewerkenWachtVoegToe(s.wacht, uit.id, 'deelnemerContactOpslaan', gegevens);
  deelnemersTekenLijst_();
}

function deelnemersDetail_(h) {
  var delen = [];
  var contactBlok = deelnemersContactBlok_(h);
  if (contactBlok) delen.push(contactBlok);
  var geld = 'Bedrag ' + euro(h.bedrag) + ', betaald ' + euro(h.betaald) + (h.openstaand > 0 ? ', nog ' + euro(h.openstaand) : '') + '.';
  var datum = deelnemersDatum_(h.aangemeldOp);
  delen.push(el('div', { class: 'deeln-blok' }, el('strong', null, 'Betaling'), el('div', null, geld), datum ? el('div', { class: 'rij-sub' }, 'Aangemeld op ' + datum) : null));
  if (Array.isArray(h.personen)) {
    delen.push(el('div', { class: 'deeln-blok' }, el('strong', null, meervoud_(h.personen.length, 'persoon', 'personen')),
      h.personen.length === 0 ? el('div', { class: 'rij-sub' }, 'Geen personen.') :
        el('ul', { class: 'deeln-personen' }, h.personen.map(function (p) {
          return el('li', null, el('span', { class: 'rij-titel' }, p.voornaam || 'Zonder naam'), el('div', { class: 'rij-sub' }, deelnemersPersoonTekst_(p)));
        }))));
  } else {
    var groepen = Object.keys(h.perLeeftijdsgroep || {}).map(function (g) { return (g || 'Onbekend') + ' ' + h.perLeeftijdsgroep[g]; });
    if (groepen.length > 0) delen.push(el('div', { class: 'deeln-blok' }, el('strong', null, 'Personen'), el('div', null, groepen.join(' · '))));
  }
  return el('div', { class: 'deeln-detail' }, delen);
}

function deelnemersRij_(h) {
  var open = deelnemersStaat.open[h.adrescode] === true;
  var label = deelnemersBetaalLabel_(h);
  var detailId = 'deeln-detail-' + String(h.adrescode).replace(/[^A-Za-z0-9_-]/g, '');
  var kop = el('button', {
    type: 'button', class: 'deeln-kop', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': detailId,
    onclick: function () {
      deelnemersStaat.open[h.adrescode] = !(deelnemersStaat.open[h.adrescode] === true);
      deelnemersTekenLijst_();
    }
  },
    el('span', { class: 'rij-tekst' },
      el('span', { class: 'rij-titel' }, h.adres || h.adrescode),
      h.naam ? el('span', { class: 'rij-sub deeln-naam' }, h.naam) : null),
    el('span', { class: 'rij-sub deeln-aantal' }, meervoud_(h.aantalPersonen, 'persoon', 'personen')),
    el('span', { class: label.klasse }, label.tekst));
  var detail = el('div', { id: detailId, class: 'deeln-uit' }, open ? deelnemersDetail_(h) : null);
  if (!open) detail.hidden = true;
  return el('li', { class: 'deeln-rij' }, kop, detail);
}

// ---- onderdelen ----

function deelnemersTegel_(label, waarde, sub) {
  return el('div', { class: 'kaart tegel' },
    el('span', { class: 'tegel-label' }, label),
    el('span', { class: 'tegel-waarde' }, waarde),
    el('span', { class: 'tegel-sub' }, sub));
}

function deelnemersTekenTotalen_() {
  var d = deelnemersLading.data;
  if (!d || !d.totalen) { deelnemersVak.totalen.replaceChildren(); return; }
  var t = d.totalen;
  var groepen = (t.perLeeftijdsgroep || []).filter(function (g) { return g.aantal > 0; }).map(function (g) { return (g.naam || 'Onbekend') + ' ' + g.aantal; }).join(' · ');
  deelnemersVak.totalen.replaceChildren(
    deelnemersTegel_('Huishoudens', String(t.huishoudens), t.betaald + ' betaald, ' + t.openstaand + ' nog te betalen'),
    deelnemersTegel_('Personen', String(t.personen), groepen || 'Geen personen'),
    deelnemersTegel_('Eten mee', String(t.eetMee), 'Personen die mee-eten'),
    deelnemersTegel_('Nog te ontvangen', euro(t.openstaandCenten), meervoud_(t.openstaand, 'huishouden', 'huishoudens')));
}

// Toont 'Bezig met ophalen…' of de foutmelding met 'Opnieuw proberen'.
function deelnemersTekenStatus_() {
  var l = deelnemersLading;
  if (l.bezig) {
    deelnemersVak.status.replaceChildren(el('p', { class: 'laden', role: 'status' }, el('span', { class: 'laadpunt' }), 'Bezig met ophalen…'));
  } else if (l.fout) {
    deelnemersVak.status.replaceChildren(el('div', { class: 'strook strook-fout', role: 'alert' },
      el('span', { class: 'strook-tekst' }, l.fout),
      el('button', { type: 'button', class: 'knop', onclick: function () { l.haal(); } }, 'Opnieuw proberen')));
  } else {
    deelnemersVak.status.replaceChildren();
  }
}

function deelnemersTekenLijst_() {
  var d = deelnemersLading.data;
  if (!deelnemersVak) return;
  if (!d || !Array.isArray(d.huishoudens)) { deelnemersVak.lijst.replaceChildren(); deelnemersVak.meer.replaceChildren(); return; }
  var zoek = deelnemersKleinLetters_(deelnemersStaat.zoek).trim();
  var rijen = d.huishoudens.filter(function (h) {
    return deelnemersPastBijFilter_(h, deelnemersStaat.filter) && deelnemersPastBijZoek_(h, zoek);
  }).sort(deelnemersAdresVergelijk_);
  var zichtbaar = rijen.slice(0, deelnemersStaat.toon);
  if (rijen.length === 0) {
    deelnemersVak.lijst.replaceChildren(el('p', { class: 'rij-sub', style: 'margin-top:0.75rem' },
      d.huishoudens.length === 0 ? 'Er zijn nog geen aanmeldingen.' : 'Niets gevonden.'));
  } else {
    deelnemersVak.lijst.replaceChildren(el('ul', { class: 'kaart-lijst' }, zichtbaar.map(deelnemersRij_)));
  }
  deelnemersVak.meer.replaceChildren(rijen.length > zichtbaar.length
    ? el('button', { type: 'button', class: 'knop', onclick: function () { deelnemersStaat.toon += DEELNEMERS_PAGINA; deelnemersTekenLijst_(); } },
        'Toon meer (' + (rijen.length - zichtbaar.length) + ' te gaan)')
    : '');
}

function deelnemersTekenChips_() {
  var chips = DEELNEMERS_FILTERS.map(function (f) {
    return el('button', {
      type: 'button', class: 'kas-chip', 'data-filter': f.id, 'aria-pressed': deelnemersStaat.filter === f.id ? 'true' : 'false',
      onclick: function () {
        deelnemersStaat.filter = f.id; deelnemersStaat.toon = DEELNEMERS_PAGINA;
        Array.prototype.forEach.call(deelnemersVak.chips.children, function (k) { k.setAttribute('aria-pressed', k.getAttribute('data-filter') === f.id ? 'true' : 'false'); });
        deelnemersTekenLijst_();
      }
    }, f.tekst);
  });
  deelnemersVak.chips.replaceChildren.apply(deelnemersVak.chips, chips);
}

// Stroken met wat niet lukte (de melding van de server), met Sluiten.
function deelnemersTekenMelding_() {
  if (!deelnemersVak) return;
  var s = deelnemersStaat;
  deelnemersVak.melding.replaceChildren.apply(deelnemersVak.melding, bewerkenFoutStroken(s.wacht, function (i) { s.wacht.fouten.splice(i, 1); deelnemersTekenMelding_(); }));
}

function deelnemersAlles_() {
  if (!deelnemersVak) return;
  var l = deelnemersLading;
  // de gegevens zijn opnieuw opgehaald: wat klaar was hoeft niet meer als 'wordt verwerkt' te staan
  if (!l.bezig && !l.fout && l.data) bewerkenWachtOpruim(deelnemersStaat.wacht);
  deelnemersTekenTotalen_();
  deelnemersTekenMelding_();
  deelnemersTekenStatus_();
  deelnemersTekenLijst_();
}

// Een nieuwe stand van de schil: is een opdracht van dit scherm klaar, dan de gegevens opnieuw ophalen; is hij niet gelukt, dan de melding tonen.
// Geeft terug of er iets is veranderd dat getekend moet worden.
function deelnemersVolg_(staat) {
  deelnemersApp = staat;
  var s = deelnemersStaat;
  var uit = bewerkenWachtVerwerk(s.wacht, staat.momentopname, bewerkenMislukteIds());
  var handtekening = bewerkenWachtHandtekening(s.wacht);
  var gewijzigd = uit.klaar + uit.fout + uit.weg + uit.verlopen > 0 || handtekening !== s.handtekening;
  s.handtekening = handtekening;
  if (uit.klaar + uit.verlopen > 0 && deelnemersVak) deelnemersLading.haal();
  return gewijzigd;
}

// ---- scherm ----

// Vraagt de gegevens opnieuw op (openen van het scherm en Vernieuwen).
function deelnemersVernieuw() {
  if (!deelnemersVak) return;
  deelnemersLading.haal();
}

function deelnemersTeken_(container, staat) {
  var email = staat.email || '';
  if (deelnemersStaat.email !== email) { deelnemersVergeet(); deelnemersStaat.email = email; }
  deelnemersApp = staat;
  var zoekveld = el('input', {
    type: 'search', id: 'deeln-zoek', class: 'deeln-zoek', autocomplete: 'off', value: deelnemersStaat.zoek,
    placeholder: 'Zoek op adres' + (heeftRecht(staat.rechten || [], 'persoonsgegevens_zien') ? ', naam of e-mail' : ''),
    oninput: function (e) { deelnemersStaat.zoek = e.target.value; deelnemersStaat.toon = DEELNEMERS_PAGINA; deelnemersTekenLijst_(); }
  });
  deelnemersVak = {
    wortel: container,
    totalen: el('section', { class: 'tegels', 'aria-label': 'Totalen' }),
    melding: el('div', { class: 'stroken bewerken-meldingen' }),
    status: el('div', { class: 'deeln-status' }),
    chips: el('div', { class: 'kas-chips', role: 'group', 'aria-label': 'Filter op betaling' }),
    lijst: el('div', { class: 'deeln-lijst' }),
    meer: el('div', { class: 'kasboek-meer' })
  };
  deelnemersLading.bijWijziging = deelnemersAlles_;
  container.replaceChildren(
    el('header', { class: 'paginakop' }, el('div', null, el('h1', null, 'Deelnemers'), el('p', null, 'Wie er zijn aangemeld en wie nog moet betalen.' +
      (deelnemersMagBewerken_() ? ' Het contact van een huishouden kun je hier corrigeren; bedragen en betalingen blijven zoals ze zijn.' : ' Alleen kijken, hier past niets aan.')))),
    deelnemersVak.melding,
    deelnemersVak.totalen,
    el('section', { class: 'kaart', 'aria-label': 'Huishoudens' },
      el('label', { class: 'veld', for: 'deeln-zoek' }, 'Zoeken', zoekveld),
      deelnemersVak.chips, deelnemersVak.status, deelnemersVak.lijst, deelnemersVak.meer));
  deelnemersTekenChips_();
  deelnemersVolg_(staat);
  deelnemersAlles_();
  deelnemersLading.haal(); // het scherm is geopend: altijd vers ophalen
}

// Nieuwe momentopname: het scherm blijft zoals het is (de gegevens zijn niet van de momentopname). Is het scherm weg, dan opnieuw tekenen.
function deelnemersBijwerken_(container, staat) {
  if (!deelnemersVak || deelnemersVak.wortel !== container || !container.contains(deelnemersVak.lijst)) { deelnemersTeken_(container, staat); return; }
  if (deelnemersStaat.email !== (staat.email || '')) { deelnemersTeken_(container, staat); return; }
  var mocht = deelnemersMagBewerken_();
  if (deelnemersVolg_(staat) || mocht !== deelnemersMagBewerken_()) deelnemersAlles_();
}

registreerScherm({
  naam: 'deelnemers',
  titel: 'Deelnemers',
  recht: 'deelnemers_zien',
  icoon: 'deelnemers',
  teken: deelnemersTeken_,
  bijwerken: deelnemersBijwerken_,
  vernieuw: deelnemersVernieuw
});
