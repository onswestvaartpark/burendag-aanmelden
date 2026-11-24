// Scherm Wijkregister: de adressen van het wijkregister met contacten, personen en de jaren waarin ze meededen.
// De gegevens komen direct van het achterwerk (beheerWijkregister, recht persoonsgegevens_zien; elke keer wordt dat gelogd), staan
// alleen in het geheugen en worden niet bewaard op het apparaat.
// Met ook het recht deelnemer_bewerken kan de commissie contacten corrigeren, toevoegen en verwijderen en een adres toevoegen (fase 2b).
// Elke wijziging is een opdracht (stuurOpdracht) en staat tot de server klaar is als 'wordt verwerkt' in het geheugen van dit scherm.
// Vereist app.js (registreerScherm, el, meervoud_), api.js (maakDirecteLading) en bewerken.js.

var WIJKREGISTER_PAGINA = 60;

var wijkregisterLading = maakDirecteLading('beheerWijkregister');
// formulier = het open contactformulier, bevestig = het contact waarvan het verwijderen wordt bevestigd, adresFormulier = het formulier 'Adres toevoegen',
// wacht = opdrachten die dit scherm stuurde en die de server nog niet klaar heeft (alleen in het geheugen)
function wijkregisterNieuweStaat_(email) {
  return { email: email, zoek: '', toon: WIJKREGISTER_PAGINA, open: {}, formulier: null, bevestig: null, adresFormulier: null, wacht: maakBewerkenWacht(), handtekening: '' };
}
var wijkregisterStaat = wijkregisterNieuweStaat_('');
var wijkregisterVak = null; // { wortel, status, melding, adres, lijst, meer }
var wijkregisterApp = null; // de laatste staat van de schil (momentopname, rechten, stuurOpdracht)

// Uitgelogd, sessiefout of een ander account: alles uit het geheugen.
function wijkregisterVergeet() {
  wijkregisterLading.vergeet();
  wijkregisterStaat = wijkregisterNieuweStaat_(wijkregisterStaat.email);
  wijkregisterVak = null;
  wijkregisterApp = null;
}

function wijkregisterMagBewerken_() {
  return !!wijkregisterApp && bewerkenMag(wijkregisterApp.rechten);
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
  if (c.toestemmingLeeg === true) return 'Toestemming niet vastgelegd';
  var delen = [];
  delen.push(c.toestemmingBewaren ? 'bewaren: ja' : 'bewaren: nee');
  delen.push(c.toestemmingDieet ? 'dieet: ja' : 'dieet: nee');
  delen.push(c.toestemmingActiviteiten ? 'activiteiten: ja' : 'activiteiten: nee');
  return 'Toestemming ' + delen.join(', ');
}

var WIJKREGISTER_CONTACT_TYPEN = ['registerContactOpslaan', 'registerContactVerwijderen'];

function wijkregisterContactTekst_(c, wacht) {
  return [el('span', { class: 'rij-titel' }, wijkregisterNaam_(c) || 'Zonder naam'), wacht ? ' ' : null, wacht ? bewerkenWachtLabel(wacht) : null,
    c.email ? el('div', null, wijkregisterMailLink_(c.email)) : null,
    c.telefoon ? el('div', null, wijkregisterTelLink_(c.telefoon)) : null,
    el('div', { class: 'rij-sub' }, wijkregisterToestemming_(c))];
}

// Een contact in de lijst: gewoon, met een formulier, met de vraag om bevestiging, of als 'wordt verwerkt'.
function wijkregisterContactRij_(a, c, i, mag) {
  var s = wijkregisterStaat;
  var f = s.formulier;
  if (mag && f && f.soort === 'wijzig' && f.adrescode === a.adrescode && f.index === i) return el('li', null, wijkregisterContactFormulier_(f));
  var wacht = bewerkenWachtVoor(s.wacht, a.adrescode, WIJKREGISTER_CONTACT_TYPEN).filter(function (w) { return w.gegevens.index === i; });
  if (wacht.length > 0) {
    var laatste = wacht[wacht.length - 1];
    if (laatste.type === 'registerContactVerwijderen') return el('li', { class: 'bewerken-wacht-rij' }, wijkregisterContactTekst_(c, 'wordt verwijderd'));
    var nieuw = Object.assign({}, c, { voornaam: laatste.gegevens.voornaam, achternaam: laatste.gegevens.achternaam, email: laatste.gegevens.email, telefoon: laatste.gegevens.telefoon });
    return el('li', { class: 'bewerken-wacht-rij' }, wijkregisterContactTekst_(nieuw, 'wordt verwerkt'));
  }
  var delen = wijkregisterContactTekst_(c, null);
  // zolang er voor dit adres iets wordt verwerkt kloppen de plekken van de contacten niet meer: geen knoppen
  var bezig = bewerkenWachtVoor(s.wacht, a.adrescode, WIJKREGISTER_CONTACT_TYPEN).length > 0;
  if (bezig) return el('li', null, delen);
  if (mag && s.bevestig && s.bevestig.adrescode === a.adrescode && s.bevestig.index === i) {
    delen.push(el('div', { class: 'strook strook-geel bewerken-bevestig', role: 'alertdialog', 'aria-label': 'Verwijderen bevestigen' },
      el('span', { class: 'strook-tekst' }, 'Weet je zeker dat je ' + bewerkenNaam(c) + ' uit het wijkregister wilt verwijderen? Dit kan niet ongedaan worden gemaakt.'),
      el('button', { type: 'button', class: 'knop knop-gevaar bewerken-bevestig-ja', onclick: function () { wijkregisterVerwijder_(a, c, i); } }, 'Ja, verwijderen'),
      el('button', { type: 'button', class: 'knop', onclick: function () { s.bevestig = null; wijkregisterTekenLijst_(); } }, 'Nee, laat staan')));
  } else if (mag) {
    delen.push(el('div', { class: 'knoppen bewerken-knoppen' },
      el('button', { type: 'button', class: 'knop knop-klein', onclick: function () { wijkregisterOpenContact_({ soort: 'wijzig', adrescode: a.adrescode, index: i, oud: { voornaam: c.voornaam, email: c.email }, voornaam: c.voornaam, achternaam: c.achternaam, email: c.email, telefoon: c.telefoon }); } }, 'Wijzigen'),
      el('button', { type: 'button', class: 'knop knop-klein knop-gevaar', onclick: function () { s.formulier = null; s.bevestig = { adrescode: a.adrescode, index: i }; wijkregisterTekenLijst_(); } }, 'Verwijderen')));
  }
  return el('li', null, delen);
}

function wijkregisterDetail_(a) {
  var s = wijkregisterStaat;
  var mag = wijkregisterMagBewerken_();
  var delen = [];
  var contacten = a.contacten || [];
  var f = s.formulier;
  var nieuwe = bewerkenWachtVoor(s.wacht, a.adrescode, ['registerContactOpslaan']).filter(function (w) { return w.gegevens.index === undefined; });
  var lijst = contacten.map(function (c, i) { return wijkregisterContactRij_(a, c, i, mag); });
  nieuwe.forEach(function (w) {
    lijst.push(el('li', { class: 'bewerken-wacht-rij' }, wijkregisterContactTekst_(w.gegevens, 'wordt toegevoegd')));
  });
  var nieuwFormulier = mag && f && f.soort === 'nieuw' && f.adrescode === a.adrescode;
  if (nieuwFormulier) lijst.push(el('li', null, wijkregisterContactFormulier_(f)));
  delen.push(el('div', { class: 'deeln-blok' }, el('strong', null, meervoud_(contacten.length, 'contact', 'contacten')),
    lijst.length === 0 ? el('div', { class: 'rij-sub' }, 'Geen contact bewaard.') : el('ul', { class: 'deeln-personen' }, lijst),
    mag && !nieuwFormulier && nieuwe.length === 0 && bewerkenWachtVoor(s.wacht, a.adrescode, WIJKREGISTER_CONTACT_TYPEN).length === 0 ? el('div', { class: 'knoppen bewerken-knoppen' },
      el('button', { type: 'button', class: 'knop knop-klein', onclick: function () { wijkregisterOpenContact_({ soort: 'nieuw', adrescode: a.adrescode, voornaam: '', achternaam: '', email: '', telefoon: '' }); } }, 'Contact toevoegen')) : null));
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

// ---- bewerken ----

function wijkregisterOpenContact_(f) {
  f.fouten = [];
  f.focus = true;
  wijkregisterStaat.formulier = f;
  wijkregisterStaat.bevestig = null;
  wijkregisterStaat.open[f.adrescode] = true;
  wijkregisterTekenLijst_();
}

function wijkregisterSluitContact_() {
  wijkregisterStaat.formulier = null;
  wijkregisterTekenLijst_();
}

function wijkregisterContactFormulier_(f) {
  var titel = f.soort === 'wijzig' ? 'Contact wijzigen' : 'Contact toevoegen';
  var form = bewerkenFormulier({
    id: 'wijk-contactformulier', titel: titel, velden: bewerkenContactVelden(f, 'wijk-c'), fouten: f.fouten || [],
    opslaanTekst: 'Opslaan', bijOpslaan: wijkregisterContactOpslaan_, bijAnnuleren: wijkregisterSluitContact_
  });
  if (f.focus) { f.focus = false; setTimeout(function () { bewerkenFocus(form); }, 0); }
  return form;
}

// Stuurt de opdracht en onthoudt hem in het geheugen van dit scherm, zodat de wijziging meteen als 'wordt verwerkt' te zien is.
function wijkregisterStuur_(type, gegevens) {
  var uit = wijkregisterApp.stuurOpdracht(type, gegevens);
  bewerkenWachtVoegToe(wijkregisterStaat.wacht, uit.id, type, gegevens);
}

function wijkregisterContactOpslaan_() {
  var s = wijkregisterStaat;
  var f = s.formulier;
  if (!f || !wijkregisterMagBewerken_()) return;
  var c = controleerContactGegevens(f);
  if (c.fouten.length > 0) {
    f.fouten = c.fouten;
    wijkregisterTekenLijst_();
    bewerkenFocusFouten(document.getElementById('wijk-contactformulier'));
    return;
  }
  var gegevens = { adrescode: f.adrescode, voornaam: c.schoon.voornaam, achternaam: c.schoon.achternaam, email: c.schoon.email, telefoon: c.schoon.telefoon };
  if (f.soort === 'wijzig') { gegevens.index = f.index; gegevens.oud = f.oud; }
  s.formulier = null;
  wijkregisterStuur_('registerContactOpslaan', gegevens);
  wijkregisterTekenLijst_();
}

function wijkregisterVerwijder_(a, c, i) {
  if (!wijkregisterMagBewerken_()) return;
  wijkregisterStaat.bevestig = null;
  wijkregisterStuur_('registerContactVerwijderen', { adrescode: a.adrescode, index: i, oud: { voornaam: c.voornaam, email: c.email } });
  wijkregisterTekenLijst_();
}

function wijkregisterNieuwAdres_() {
  return { straat: '', huisnummer: '', toevoeging: '', voornaam: '', achternaam: '', email: '', telefoon: '', fouten: [], focus: true };
}

function wijkregisterStraten_() {
  var m = wijkregisterApp && wijkregisterApp.momentopname;
  return m && Array.isArray(m.straten) ? m.straten : [];
}

// Het formulier '+ Adres toevoegen' bovenaan: straat (uit de lijst van de straten), huisnummer, toevoeging en het eerste contact.
function wijkregisterTekenAdres_() {
  if (!wijkregisterVak) return;
  var s = wijkregisterStaat;
  var vak = wijkregisterVak.adres;
  if (!wijkregisterMagBewerken_()) { s.adresFormulier = null; vak.replaceChildren(); return; }
  var f = s.adresFormulier;
  var knop = el('button', { type: 'button', class: 'knop wijk-adres-knop', 'aria-expanded': f ? 'true' : 'false', 'aria-controls': 'wijk-adresformulier',
    onclick: function () { s.adresFormulier = f ? null : wijkregisterNieuwAdres_(); wijkregisterTekenAdres_(); } }, '+ Adres toevoegen');
  var nieuwe = Object.keys(s.wacht.lijst).map(function (id) { return s.wacht.lijst[id]; }).filter(function (w) { return w.type === 'registerAdresToevoegen'; });
  var wachtend = nieuwe.length === 0 ? null : el('ul', { class: 'deeln-personen' }, nieuwe.map(function (w) {
    var g = w.gegevens;
    return el('li', { class: 'bewerken-wacht-rij' }, el('span', { class: 'rij-titel' }, g.straat + ' ' + g.huisnummer + (g.toevoeging || '')), ' ', bewerkenWachtLabel('wordt toegevoegd'),
      el('div', { class: 'rij-sub' }, (g.contact.voornaam + ' ' + (g.contact.achternaam || '')).trim()));
  }));
  var inhoud = [knop, wachtend];
  if (f) inhoud.push(wijkregisterAdresFormulier_(f));
  vak.replaceChildren(el('section', { class: 'kaart', 'aria-label': 'Adres toevoegen' }, inhoud));
}

function wijkregisterAdresFormulier_(f) {
  var straten = wijkregisterStraten_();
  var keuze = el('select', { id: 'wijk-a-straat', onchange: function (e) { f.straat = e.target.value; } },
    el('option', { value: '' }, 'Kies een straat'),
    straten.map(function (naam) { return el('option', { value: naam }, naam); }));
  keuze.value = f.straat;
  var velden = [
    bewerkenVeld_('wijk-a-straat', 'Straat', keuze),
    bewerkenVeld_('wijk-a-huisnummer', 'Huisnummer', bewerkenTekstvak_(f, 'huisnummer', 'wijk-a-huisnummer', { inputmode: 'numeric', maxlength: '5' })),
    bewerkenVeld_('wijk-a-toevoeging', 'Toevoeging (mag leeg)', bewerkenTekstvak_(f, 'toevoeging', 'wijk-a-toevoeging', { maxlength: '2' }), 'Alleen letters, bijvoorbeeld a of b (hooguit twee).')
  ].concat(bewerkenContactVelden(f, 'wijk-a'));
  var form = bewerkenFormulier({
    id: 'wijk-adresformulier', titel: 'Adres toevoegen, met het eerste contact', velden: velden, fouten: f.fouten || [],
    opslaanTekst: 'Adres toevoegen', bijOpslaan: wijkregisterAdresOpslaan_, bijAnnuleren: function () { wijkregisterStaat.adresFormulier = null; wijkregisterTekenAdres_(); }
  });
  if (f.focus) { f.focus = false; setTimeout(function () { bewerkenFocus(form); }, 0); }
  return form;
}

function wijkregisterAdresOpslaan_() {
  var s = wijkregisterStaat;
  var f = s.adresFormulier;
  if (!f || !wijkregisterMagBewerken_()) return;
  var fouten = [];
  if (wijkregisterStraten_().indexOf(f.straat) === -1) fouten.push('Kies een straat uit de lijst.');
  var nr = null;
  try { nr = controleerHuisnummerEnToevoeging(f.huisnummer, f.toevoeging); } catch (e) { fouten.push(String(e && e.message || e)); }
  if (nr) {
    var gezocht = (String(f.straat) + String(nr.huisnummer) + String(nr.toevoeging || '')).replace(/\s+/g, '').toLowerCase();
    var data = wijkregisterLading.data;
    var bestaand = data && Array.isArray(data.adressen) ? data.adressen.filter(function (a) {
      return String(a.adres || '').replace(/\s+/g, '').toLowerCase() === gezocht;
    })[0] : null;
    if (bestaand) fouten.push('Dit adres staat al in het wijkregister (' + bestaand.adres + '). Voeg daar een contact toe.');
  }
  var c = controleerContactGegevens(f);
  fouten = fouten.concat(c.fouten);
  if (fouten.length > 0) {
    f.fouten = fouten;
    wijkregisterTekenAdres_();
    bewerkenFocusFouten(document.getElementById('wijk-adresformulier'));
    return;
  }
  s.adresFormulier = null;
  wijkregisterStuur_('registerAdresToevoegen', { straat: f.straat, huisnummer: String(nr.huisnummer), toevoeging: nr.toevoeging, contact: c.schoon });
  wijkregisterTekenAdres_();
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

// Stroken met wat niet lukte (de melding van de server), met Sluiten.
function wijkregisterTekenMelding_() {
  if (!wijkregisterVak) return;
  var s = wijkregisterStaat;
  wijkregisterVak.melding.replaceChildren(bewerkenFoutStroken(s.wacht, function (i) { s.wacht.fouten.splice(i, 1); wijkregisterTekenMelding_(); }));
}

function wijkregisterAlles_() {
  if (!wijkregisterVak) return;
  var l = wijkregisterLading;
  // de gegevens zijn opnieuw opgehaald: wat klaar was hoeft niet meer als 'wordt verwerkt' te staan
  if (!l.bezig && !l.fout && l.data) bewerkenWachtOpruim(wijkregisterStaat.wacht);
  wijkregisterTekenStatus_();
  wijkregisterTekenMelding_();
  wijkregisterTekenAdres_();
  wijkregisterTekenLijst_();
}

// Vraagt de gegevens opnieuw op (openen van het scherm en Vernieuwen).
function wijkregisterVernieuw() {
  if (!wijkregisterVak) return;
  wijkregisterLading.haal();
}

// Een nieuwe stand van de schil: is een opdracht van dit scherm klaar, dan de gegevens opnieuw ophalen; is hij niet gelukt, dan de melding tonen.
function wijkregisterVolg_(staat) {
  wijkregisterApp = staat;
  var s = wijkregisterStaat;
  var uit = bewerkenWachtVerwerk(s.wacht, staat.momentopname, bewerkenMislukteIds());
  var handtekening = bewerkenWachtHandtekening(s.wacht);
  var gewijzigd = uit.klaar + uit.fout + uit.weg + uit.verlopen > 0 || handtekening !== s.handtekening;
  s.handtekening = handtekening;
  if (uit.klaar + uit.verlopen > 0 && wijkregisterVak) wijkregisterLading.haal();
  return gewijzigd;
}

function wijkregisterTeken_(container, staat) {
  var email = staat.email || '';
  if (wijkregisterStaat.email !== email) { wijkregisterVergeet(); wijkregisterStaat.email = email; }
  wijkregisterApp = staat;
  var zoekveld = el('input', {
    type: 'search', id: 'wijk-zoek', class: 'deeln-zoek', autocomplete: 'off', value: wijkregisterStaat.zoek,
    placeholder: 'Zoek op straat, huisnummer, naam of e-mail',
    oninput: function (e) { wijkregisterStaat.zoek = e.target.value; wijkregisterStaat.toon = WIJKREGISTER_PAGINA; wijkregisterTekenLijst_(); }
  });
  wijkregisterVak = { wortel: container, melding: el('div', { class: 'stroken bewerken-meldingen' }), adres: el('div', { class: 'wijk-adres' }),
    status: el('div', { class: 'deeln-status' }), lijst: el('div', { class: 'deeln-lijst' }), meer: el('div', { class: 'kasboek-meer' }) };
  wijkregisterLading.bijWijziging = wijkregisterAlles_;
  var magBewerken = wijkregisterMagBewerken_();
  container.replaceChildren(
    el('header', { class: 'paginakop' }, el('div', null, el('h1', null, 'Wijkregister'),
      el('p', null, 'De buren die we mogen bewaren, met de jaren dat ze meededen.' + (magBewerken ? ' Je kunt contacten corrigeren, toevoegen en verwijderen.' : ' Alleen kijken.')))),
    el('p', { class: 'strook deeln-privacy' }, 'Gegevens van buren: niet delen buiten de commissie.'),
    wijkregisterVak.melding,
    wijkregisterVak.adres,
    el('section', { class: 'kaart', 'aria-label': 'Adressen' },
      el('label', { class: 'veld', for: 'wijk-zoek' }, 'Zoeken', zoekveld),
      wijkregisterVak.status, wijkregisterVak.lijst, wijkregisterVak.meer));
  wijkregisterVolg_(staat);
  wijkregisterAlles_();
  wijkregisterLading.haal(); // het scherm is geopend: altijd vers ophalen
}

function wijkregisterBijwerken_(container, staat) {
  if (!wijkregisterVak || wijkregisterVak.wortel !== container || !container.contains(wijkregisterVak.lijst)) { wijkregisterTeken_(container, staat); return; }
  if (wijkregisterStaat.email !== (staat.email || '')) { wijkregisterTeken_(container, staat); return; }
  var rechtenVoor = wijkregisterMagBewerken_();
  if (wijkregisterVolg_(staat) || rechtenVoor !== wijkregisterMagBewerken_()) wijkregisterAlles_();
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
