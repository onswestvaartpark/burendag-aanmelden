// Scherm Deelnemers: totalen, zoeken, filter en de lijst van huishoudens met uitklapbaar detail. Alleen lezen.
// De gegevens komen direct van het achterwerk (beheerDeelnemers), staan alleen in het geheugen en worden niet bewaard op het apparaat.
// Namen, contactgegevens en personen zitten er alleen in met het recht persoonsgegevens_zien: het scherm toont wat er is.
// Vereist app.js (registreerScherm, el, euro, meervoud_, heeftRecht) en api.js (maakDirecteLading).

var DEELNEMERS_PAGINA = 60;
var DEELNEMERS_FILTERS = [
  { id: 'alles', tekst: 'Alles' },
  { id: 'open', tekst: 'Nog te betalen' },
  { id: 'betaald', tekst: 'Betaald' }
];

var deelnemersLading = maakDirecteLading('beheerDeelnemers');
var deelnemersStaat = { email: '', zoek: '', filter: 'alles', toon: DEELNEMERS_PAGINA, open: {} };
var deelnemersVak = null; // { wortel, totalen, status, lijst, meer }

// Uitgelogd, sessiefout of een ander account: alles uit het geheugen.
function deelnemersVergeet() {
  deelnemersLading.vergeet();
  deelnemersStaat = { email: deelnemersStaat.email, zoek: '', filter: 'alles', toon: DEELNEMERS_PAGINA, open: {} };
  deelnemersVak = null;
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
  var t = String(telefoon || '').trim();
  var nummer = t.replace(/[^\d+]/g, '');
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

function deelnemersDetail_(h) {
  var delen = [];
  var contact = [];
  if (h.naam) contact.push(el('div', null, h.naam));
  if (h.email) contact.push(el('div', null, deelnemersMailLink_(h.email)));
  if (h.telefoon) contact.push(el('div', null, deelnemersTelLink_(h.telefoon)));
  if (contact.length > 0) delen.push(el('div', { class: 'deeln-blok' }, el('strong', null, 'Contact'), contact));
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

function deelnemersAlles_() {
  if (!deelnemersVak) return;
  deelnemersTekenTotalen_();
  deelnemersTekenStatus_();
  deelnemersTekenLijst_();
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
  var zoekveld = el('input', {
    type: 'search', id: 'deeln-zoek', class: 'deeln-zoek', autocomplete: 'off', value: deelnemersStaat.zoek,
    placeholder: 'Zoek op adres' + (heeftRecht(staat.rechten || [], 'persoonsgegevens_zien') ? ', naam of e-mail' : ''),
    oninput: function (e) { deelnemersStaat.zoek = e.target.value; deelnemersStaat.toon = DEELNEMERS_PAGINA; deelnemersTekenLijst_(); }
  });
  deelnemersVak = {
    wortel: container,
    totalen: el('section', { class: 'tegels', 'aria-label': 'Totalen' }),
    status: el('div', { class: 'deeln-status' }),
    chips: el('div', { class: 'kas-chips', role: 'group', 'aria-label': 'Filter op betaling' }),
    lijst: el('div', { class: 'deeln-lijst' }),
    meer: el('div', { class: 'kasboek-meer' })
  };
  deelnemersLading.bijWijziging = deelnemersAlles_;
  container.replaceChildren(
    el('header', { class: 'paginakop' }, el('div', null, el('h1', null, 'Deelnemers'), el('p', null, 'Wie er zijn aangemeld en wie nog moet betalen. Alleen kijken, hier past niets aan.'))),
    deelnemersVak.totalen,
    el('section', { class: 'kaart', 'aria-label': 'Huishoudens' },
      el('label', { class: 'veld', for: 'deeln-zoek' }, 'Zoeken', zoekveld),
      deelnemersVak.chips, deelnemersVak.status, deelnemersVak.lijst, deelnemersVak.meer));
  deelnemersTekenChips_();
  deelnemersAlles_();
  deelnemersLading.haal(); // het scherm is geopend: altijd vers ophalen
}

// Nieuwe momentopname: het scherm blijft zoals het is (de gegevens zijn niet van de momentopname). Is het scherm weg, dan opnieuw tekenen.
function deelnemersBijwerken_(container, staat) {
  if (!deelnemersVak || deelnemersVak.wortel !== container || !container.contains(deelnemersVak.lijst)) { deelnemersTeken_(container, staat); return; }
  if (deelnemersStaat.email !== (staat.email || '')) deelnemersTeken_(container, staat);
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
