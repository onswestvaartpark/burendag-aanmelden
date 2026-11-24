// Scherm Wijkregister: de adressen van het wijkregister met contacten, personen en de jaren waarin ze meededen. Alleen lezen.
// De gegevens komen direct van het achterwerk (beheerWijkregister, recht persoonsgegevens_zien; elke keer wordt dat gelogd), staan
// alleen in het geheugen en worden niet bewaard op het apparaat.
// Vereist app.js (registreerScherm, el, meervoud_) en api.js (maakDirecteLading).

var WIJKREGISTER_PAGINA = 60;

var wijkregisterLading = maakDirecteLading('beheerWijkregister');
var wijkregisterStaat = { email: '', zoek: '', toon: WIJKREGISTER_PAGINA, open: {} };
var wijkregisterVak = null; // { wortel, status, lijst, meer }

// Uitgelogd, sessiefout of een ander account: alles uit het geheugen.
function wijkregisterVergeet() {
  wijkregisterLading.vergeet();
  wijkregisterStaat = { email: wijkregisterStaat.email, zoek: '', toon: WIJKREGISTER_PAGINA, open: {} };
  wijkregisterVak = null;
}

function wijkregisterKlein_(t) { return String(t === null || t === undefined ? '' : t).toLowerCase(); }

function wijkregisterNaam_(c) { return (String(c.voornaam || '') + ' ' + String(c.achternaam || '')).trim(); }

// Zoekt in straat en huisnummer (het adres), naam en e-mail van de contacten.
function wijkregisterPastBijZoek_(a, zoek) {
  if (zoek === '') return true;
  var teksten = [a.adres];
  (a.contacten || []).forEach(function (c) { teksten.push(wijkregisterNaam_(c), c.email); });
  return teksten.some(function (t) { return wijkregisterKlein_(t).indexOf(zoek) >= 0; });
}

// Jaren waarin het adres meedeed (aangemeld), nieuwste eerst zoals de server ze geeft.
function wijkregisterMeedeed_(a) {
  var jaren = (a.historie || []).filter(function (h) { return h.aangemeld === true; }).map(function (h) { return String(h.jaar); });
  return jaren.length > 0 ? 'Deed mee: ' + jaren.join(', ') : 'Nog niet meegedaan';
}

function wijkregisterMailLink_(email) {
  var e = String(email || '').trim();
  return e === '' ? null : el('a', { href: 'mailto:' + e }, e);
}

function wijkregisterTelLink_(telefoon) {
  var t = String(telefoon || '').trim();
  var nummer = t.replace(/[^\d+]/g, '');
  return t === '' ? null : (nummer === '' ? el('span', null, t) : el('a', { href: 'tel:' + nummer }, t));
}

function wijkregisterToestemming_(c) {
  var delen = [];
  delen.push(c.toestemmingBewaren ? 'bewaren: ja' : 'bewaren: nee');
  delen.push(c.toestemmingDieet ? 'dieet: ja' : 'dieet: nee');
  delen.push(c.toestemmingActiviteiten ? 'activiteiten: ja' : 'activiteiten: nee');
  return 'Toestemming ' + delen.join(', ');
}

function wijkregisterDetail_(a) {
  var delen = [];
  var contacten = a.contacten || [];
  delen.push(el('div', { class: 'deeln-blok' }, el('strong', null, meervoud_(contacten.length, 'contact', 'contacten')),
    contacten.length === 0 ? el('div', { class: 'rij-sub' }, 'Geen contact bewaard.') :
      el('ul', { class: 'deeln-personen' }, contacten.map(function (c) {
        return el('li', null, el('span', { class: 'rij-titel' }, wijkregisterNaam_(c) || 'Zonder naam'),
          c.email ? el('div', null, wijkregisterMailLink_(c.email)) : null,
          c.telefoon ? el('div', null, wijkregisterTelLink_(c.telefoon)) : null,
          el('div', { class: 'rij-sub' }, wijkregisterToestemming_(c)));
      }))));
  var personen = a.personen || [];
  delen.push(el('div', { class: 'deeln-blok' }, el('strong', null, meervoud_(personen.length, 'persoon', 'personen')),
    personen.length === 0 ? el('div', { class: 'rij-sub' }, 'Geen personen bewaard.') :
      el('ul', { class: 'deeln-personen' }, personen.map(function (p) {
        var sub = [];
        if (p.geboortejaar !== null && p.geboortejaar !== undefined && p.geboortejaar !== '') sub.push('geboren ' + p.geboortejaar);
        if (Array.isArray(p.dieet) && p.dieet.length > 0) sub.push('dieet: ' + p.dieet.join(', '));
        if (p.ehbo) sub.push('EHBO');
        return el('li', null, el('span', { class: 'rij-titel' }, p.voornaam || 'Zonder naam'), sub.length > 0 ? el('div', { class: 'rij-sub' }, sub.join(' · ')) : null);
      }))));
  var historie = a.historie || [];
  delen.push(el('div', { class: 'deeln-blok' }, el('strong', null, 'Historie'),
    historie.length === 0 ? el('div', { class: 'rij-sub' }, 'Nog geen jaren.') :
      el('ul', { class: 'deeln-personen' }, historie.map(function (h) {
        return el('li', null, el('span', { class: 'rij-titel' }, String(h.jaar)),
          el('span', { class: 'rij-sub' }, ' ' + (h.aangemeld ? 'aangemeld' : 'niet aangemeld') + (h.betaald ? ', betaald' : '')));
      }))));
  return el('div', { class: 'deeln-detail' }, delen);
}

function wijkregisterRij_(a) {
  var open = wijkregisterStaat.open[a.adrescode] === true;
  var namen = (a.contacten || []).map(wijkregisterNaam_).filter(function (n) { return n !== ''; }).join(', ');
  var detailId = 'wijk-detail-' + String(a.adrescode).replace(/[^A-Za-z0-9_-]/g, '');
  var kop = el('button', {
    type: 'button', class: 'deeln-kop', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': detailId,
    onclick: function () {
      wijkregisterStaat.open[a.adrescode] = !(wijkregisterStaat.open[a.adrescode] === true);
      wijkregisterTekenLijst_();
    }
  },
    el('span', { class: 'rij-tekst' },
      el('span', { class: 'rij-titel' }, a.adres || a.adrescode),
      namen ? el('span', { class: 'rij-sub deeln-naam' }, namen) : null,
      el('span', { class: 'rij-sub deeln-naam' }, wijkregisterMeedeed_(a))));
  var detail = el('div', { id: detailId, class: 'deeln-uit' }, open ? wijkregisterDetail_(a) : null);
  if (!open) detail.hidden = true;
  return el('li', { class: 'deeln-rij' }, kop, detail);
}

function wijkregisterTekenStatus_() {
  var l = wijkregisterLading;
  if (l.bezig) {
    wijkregisterVak.status.replaceChildren(el('p', { class: 'laden', role: 'status' }, el('span', { class: 'laadpunt' }), 'Bezig met ophalen…'));
  } else if (l.fout) {
    wijkregisterVak.status.replaceChildren(el('div', { class: 'strook strook-fout', role: 'alert' },
      el('span', { class: 'strook-tekst' }, l.fout),
      el('button', { type: 'button', class: 'knop', onclick: function () { l.haal(); } }, 'Opnieuw proberen')));
  } else {
    wijkregisterVak.status.replaceChildren();
  }
}

function wijkregisterTekenLijst_() {
  if (!wijkregisterVak) return;
  var d = wijkregisterLading.data;
  if (!d || !Array.isArray(d.adressen)) { wijkregisterVak.lijst.replaceChildren(); wijkregisterVak.meer.replaceChildren(); return; }
  var zoek = wijkregisterKlein_(wijkregisterStaat.zoek).trim();
  var rijen = d.adressen.filter(function (a) { return wijkregisterPastBijZoek_(a, zoek); }); // de server sorteert op straat en huisnummer
  var zichtbaar = rijen.slice(0, wijkregisterStaat.toon);
  if (rijen.length === 0) {
    wijkregisterVak.lijst.replaceChildren(el('p', { class: 'rij-sub', style: 'margin-top:0.75rem' }, d.adressen.length === 0 ? 'Het wijkregister is nog leeg.' : 'Niets gevonden.'));
  } else {
    wijkregisterVak.lijst.replaceChildren(el('ul', { class: 'kaart-lijst' }, zichtbaar.map(wijkregisterRij_)));
  }
  wijkregisterVak.meer.replaceChildren(rijen.length > zichtbaar.length
    ? el('button', { type: 'button', class: 'knop', onclick: function () { wijkregisterStaat.toon += WIJKREGISTER_PAGINA; wijkregisterTekenLijst_(); } },
        'Toon meer (' + (rijen.length - zichtbaar.length) + ' te gaan)')
    : '');
}

function wijkregisterAlles_() {
  if (!wijkregisterVak) return;
  wijkregisterTekenStatus_();
  wijkregisterTekenLijst_();
}

// Vraagt de gegevens opnieuw op (openen van het scherm en Vernieuwen).
function wijkregisterVernieuw() {
  if (!wijkregisterVak) return;
  wijkregisterLading.haal();
}

function wijkregisterTeken_(container, staat) {
  var email = staat.email || '';
  if (wijkregisterStaat.email !== email) { wijkregisterVergeet(); wijkregisterStaat.email = email; }
  var zoekveld = el('input', {
    type: 'search', id: 'wijk-zoek', class: 'deeln-zoek', autocomplete: 'off', value: wijkregisterStaat.zoek,
    placeholder: 'Zoek op straat, huisnummer, naam of e-mail',
    oninput: function (e) { wijkregisterStaat.zoek = e.target.value; wijkregisterStaat.toon = WIJKREGISTER_PAGINA; wijkregisterTekenLijst_(); }
  });
  wijkregisterVak = { wortel: container, status: el('div', { class: 'deeln-status' }), lijst: el('div', { class: 'deeln-lijst' }), meer: el('div', { class: 'kasboek-meer' }) };
  wijkregisterLading.bijWijziging = wijkregisterAlles_;
  container.replaceChildren(
    el('header', { class: 'paginakop' }, el('div', null, el('h1', null, 'Wijkregister'), el('p', null, 'De buren die we mogen bewaren, met de jaren dat ze meededen. Alleen kijken.'))),
    el('p', { class: 'strook deeln-privacy' }, 'Gegevens van buren: niet delen buiten de commissie.'),
    el('section', { class: 'kaart', 'aria-label': 'Adressen' },
      el('label', { class: 'veld', for: 'wijk-zoek' }, 'Zoeken', zoekveld),
      wijkregisterVak.status, wijkregisterVak.lijst, wijkregisterVak.meer));
  wijkregisterAlles_();
  wijkregisterLading.haal(); // het scherm is geopend: altijd vers ophalen
}

function wijkregisterBijwerken_(container, staat) {
  if (!wijkregisterVak || wijkregisterVak.wortel !== container || !container.contains(wijkregisterVak.lijst)) { wijkregisterTeken_(container, staat); return; }
  if (wijkregisterStaat.email !== (staat.email || '')) wijkregisterTeken_(container, staat);
}

registreerScherm({
  naam: 'wijkregister',
  titel: 'Wijkregister',
  recht: 'persoonsgegevens_zien',
  icoon: 'wijkregister',
  teken: wijkregisterTeken_,
  bijwerken: wijkregisterBijwerken_,
  vernieuw: wijkregisterVernieuw
});
