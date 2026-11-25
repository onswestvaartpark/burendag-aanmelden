// Scherm Wijkregister: de adressen van het wijkregister met contacten, personen en de jaren waarin ze meededen.
// De gegevens komen direct van het achterwerk (beheerWijkregister, recht persoonsgegevens_zien; elke keer wordt dat gelogd), staan
// alleen in het geheugen en worden niet bewaard op het apparaat.
// Met ook het recht deelnemer_bewerken kan de commissie een adres in één keer wijzigen (knop Wijzigen: contacten, bewoners, spullen en opmerking in één formulier) en een adres toevoegen.
// Elke wijziging is één opdracht (stuurOpdracht) en staat tot de server klaar is als 'wordt verwerkt' in het geheugen van dit scherm.
// Fase 2d: bovenaan het blok 'Uitnodigingen' (alleen met de rechten mails_versturen en persoonsgegevens_zien): hoeveel mails er nu gaan en de knop om ze te versturen (opdracht uitnodigingenVersturen).
// Vereist app.js (registreerScherm, el), api.js (maakDirecteLading), bewerken.js, uitnodigen.js en huishoudkaart.js (het detail van een adres en het formulier).

var WIJKREGISTER_PAGINA = 60;

var wijkregisterLading = maakDirecteLading('beheerWijkregister');
// de aantallen voor het blok Uitnodigingen (alleen aantallen, direct van de server, alleen in het geheugen)
var wijkregisterUitnodigenLading = maakDirecteLading('beheerUitnodigingen');
// kaart = het open formulier 'Wijzigen' van een adres, adresFormulier = het formulier 'Adres toevoegen', wisBevestig = de vraag voor het wissen van verlopen gegevens,
// filterVerlopen = alleen adressen met een verlopen bewaartermijn (huishoudkaart.js), wacht = opdrachten die dit scherm stuurde en die de server nog niet klaar heeft (alleen in het geheugen)
function wijkregisterNieuweStaat_(email) {
  return { email: email, zoek: '', toon: WIJKREGISTER_PAGINA, open: {}, kaart: null, adresFormulier: null, wacht: maakBewerkenWacht(), handtekening: '',
    wisBevestig: false, filterVerlopen: false, uitnodigenBevestig: '' };
}
var wijkregisterStaat = wijkregisterNieuweStaat_('');
var wijkregisterVak = null; // { wortel, status, melding, adres, verlopen, lijst, meer }
var wijkregisterApp = null; // de laatste staat van de schil (momentopname, rechten, stuurOpdracht)

// Uitgelogd, sessiefout of een ander account: alles uit het geheugen.
function wijkregisterVergeet() {
  wijkregisterLading.vergeet();
  wijkregisterUitnodigenLading.vergeet();
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
  var t = telefoonOpmaak(telefoon);
  var nummer = telefoonCijfers(telefoon);
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

function wijkregisterDetail_(a) {
  return kaartDetail(a, wijkregisterMagBewerken_());
}

// ---- bewerken ----

// Stuurt de opdracht en onthoudt hem in het geheugen van dit scherm, zodat de wijziging meteen als 'wordt verwerkt' te zien is.
function wijkregisterStuur_(type, gegevens) {
  var uit = wijkregisterApp.stuurOpdracht(type, gegevens);
  bewerkenWachtVoegToe(wijkregisterStaat.wacht, uit.id, type, gegevens);
}

function wijkregisterStraten_() {
  var m = wijkregisterApp && wijkregisterApp.momentopname;
  return m && Array.isArray(m.straten) ? m.straten : [];
}

// Het formulier '+ Adres toevoegen' bovenaan: dezelfde invoer als Wijzigen (contacten, bewoners, spullen, opmerking), met straat (uit de lijst van de straten), huisnummer en toevoeging erbij.
function wijkregisterTekenAdres_() {
  if (!wijkregisterVak) return;
  var s = wijkregisterStaat;
  var vak = wijkregisterVak.adres;
  if (!wijkregisterMagBewerken_()) { s.adresFormulier = null; vak.replaceChildren(); return; }
  var f = s.adresFormulier;
  var knop = el('button', { type: 'button', class: 'knop wijk-adres-knop', 'aria-expanded': f ? 'true' : 'false', 'aria-controls': 'wijk-n',
    onclick: function () { if (f) { s.adresFormulier = null; } else { s.adresFormulier = kaartFormulierNieuw(); s.adresFormulier.focus = 'eerste'; } wijkregisterTekenAdres_(); } }, '+ Adres toevoegen');
  var nieuwe = Object.keys(s.wacht.lijst).map(function (id) { return s.wacht.lijst[id]; }).filter(function (w) { return w.type === 'registerAdresToevoegen'; });
  var wachtend = nieuwe.length === 0 ? null : el('ul', { class: 'deeln-personen' }, nieuwe.map(function (w) {
    var g = w.gegevens;
    var namen = (g.contacten || (g.contact ? [g.contact] : [])).map(wijkregisterNaam_).filter(function (n) { return n !== ''; }).join(', ');
    return el('li', { class: 'bewerken-wacht-rij' }, el('span', { class: 'rij-titel' }, g.straat + ' ' + g.huisnummer + (g.toevoeging || '')), ' ', bewerkenWachtLabel('wordt toegevoegd'),
      el('div', { class: 'rij-sub' }, namen));
  }));
  var inhoud = [knop, wachtend];
  if (f) inhoud.push(wijkregisterAdresFormulier_(f));
  vak.replaceChildren(el('section', { class: 'kaart wijk-kaart wijk-adres-kaart', 'aria-label': 'Adres toevoegen' }, inhoud));
}

function wijkregisterAdresFormulier_(f) {
  var straten = wijkregisterStraten_();
  var keuze = el('select', { id: 'wijk-n-straat', onchange: function (e) { f.straat = e.target.value; } },
    el('option', { value: '' }, 'Kies een straat'),
    straten.map(function (naam) { return el('option', { value: naam }, naam); }));
  keuze.value = f.straat;
  var fout = function (veld) { return f.fouten && f.fouten.adres && f.fouten.adres[veld] ? f.fouten.adres[veld] : []; };
  var tekstvak = function (veld, id, opties) { var v = bewerkenTekstvak_(f, veld, id, opties); return v; };
  var kop = [
    kaartVeldMetFout_('wijk-n-straat', 'Straat', keuze, fout('straat')),
    kaartVeldMetFout_('wijk-n-huisnummer', 'Huisnummer', tekstvak('huisnummer', 'wijk-n-huisnummer', { inputmode: 'numeric', maxlength: '5' }), fout('huisnummer')),
    kaartVeldMetFout_('wijk-n-toevoeging', 'Toevoeging (mag leeg, alleen letters, bijvoorbeeld a of b)', tekstvak('toevoeging', 'wijk-n-toevoeging', { maxlength: '2' }), fout('toevoeging'))
  ];
  return kaartAdresFormulier_(f, { id: 'wijk-n', voorvoegsel: 'wijk-n', titel: 'Adres toevoegen', opslaanTekst: 'Adres toevoegen', bijOpslaan: kaartNieuwAdresOpslaan_,
    bijAnnuleren: function () { wijkregisterStaat.adresFormulier = null; wijkregisterTekenAdres_(); }, hertekenen: wijkregisterTekenAdres_, kop: kop });
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
      el('span', { class: 'rij-sub deeln-naam' }, wijkregisterMeedeed_(a)),
      a.verlopen === true ? el('span', { class: 'rij-sub deeln-naam' }, bewerkenWachtLabel('bewaartermijn verlopen')) : null));
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
  var rijen = d.adressen.filter(function (a) { return wijkregisterPastBijZoek_(a, zoek) && (!wijkregisterStaat.filterVerlopen || a.verlopen === true); }); // de server sorteert op straat en huisnummer
  var zichtbaar = rijen.slice(0, wijkregisterStaat.toon);
  if (rijen.length === 0) {
    wijkregisterVak.lijst.replaceChildren(el('p', { class: 'rij-sub', style: 'margin-top:0.75rem' }, d.adressen.length === 0 ? 'Het wijkregister is nog leeg.' : (wijkregisterStaat.filterVerlopen && zoek === '' ? 'Geen adressen met een verlopen bewaartermijn.' : 'Niets gevonden.')));
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
  var stroken = bewerkenFoutStroken(s.wacht, function (i) { s.wacht.fouten.splice(i, 1); wijkregisterTekenMelding_(); })
    .concat(bewerkenInfoStroken(s.wacht, function (i) { s.wacht.infos.splice(i, 1); wijkregisterTekenMelding_(); }));
  wijkregisterVak.melding.replaceChildren.apply(wijkregisterVak.melding, stroken);
}

// De chip 'Bewaartermijn verlopen' met, voor wie dat mag, de knop 'Verlopen gegevens wissen' (huishoudkaart.js).
function wijkregisterTekenVerlopen_() {
  if (!wijkregisterVak) return;
  var d = wijkregisterLading.data;
  if (!d || !Array.isArray(d.adressen)) { wijkregisterVak.verlopen.replaceChildren(); return; }
  wijkregisterVak.verlopen.replaceChildren.apply(wijkregisterVak.verlopen, kaartVerlopenBalk());
}

// Het blok 'Uitnodigingen': aantallen, de knop 'Uitnodigingen versturen' en de vraag om bevestiging in de pagina.
function wijkregisterTekenUitnodigen_() {
  if (!wijkregisterVak) return;
  var vak = wijkregisterVak.uitnodigen;
  var s = wijkregisterStaat;
  if (!wijkregisterApp || !uitnodigenMag(wijkregisterApp.rechten)) { s.uitnodigenBevestig = ''; vak.replaceChildren(); return; }
  var l = wijkregisterUitnodigenLading;
  var d = l.data;
  var onderweg = Object.keys(s.wacht.lijst).some(function (id) { return s.wacht.lijst[id].type === 'uitnodigingenVersturen' && s.wacht.lijst[id].klaar !== true; });
  var inhoud = [
    el('h2', null, 'Uitnodigingen'),
    el('p', { class: 'rij-sub' }, 'Mail elk adres in het register een persoonlijke link naar het aanmeldformulier, met de gegevens van vorig jaar al ingevuld. De buur kijkt ze na en meldt zich aan; dat vernieuwt ook de toestemming.')
  ];
  if (l.bezig && !d) {
    inhoud.push(el('p', { class: 'laden', role: 'status' }, el('span', { class: 'laadpunt' }), 'Bezig met tellen…'));
  } else if (l.fout && !d) {
    inhoud.push(el('div', { class: 'strook strook-fout', role: 'alert' }, el('span', { class: 'strook-tekst' }, l.fout),
      el('button', { type: 'button', class: 'knop', onclick: function () { l.haal(); } }, 'Opnieuw proberen')));
  } else if (d && d.nu && d.rest) {
    uitnodigenRegels(d).forEach(function (t) { inhoud.push(el('p', null, t)); });
    if (onderweg) {
      inhoud.push(el('p', null, bewerkenWachtLabel('wordt verwerkt')));
    } else if (uitnodigenKanVersturen(d)) {
      var kies = function (soort, vraag, tekst, opnieuw) {
        if (s.uitnodigenBevestig === soort) {
          inhoud.push(el('div', { class: 'strook strook-geel bewerken-bevestig', role: 'alertdialog', 'aria-label': 'Versturen bevestigen' },
            el('span', { class: 'strook-tekst' }, vraag),
            el('button', { type: 'button', class: 'knop knop-hoofd bewerken-bevestig-ja', onclick: function () {
              s.uitnodigenBevestig = '';
              wijkregisterStuur_('uitnodigingenVersturen', { opnieuw: opnieuw });
              wijkregisterTekenUitnodigen_();
            } }, 'Ja, versturen'),
            el('button', { type: 'button', class: 'knop', onclick: function () { s.uitnodigenBevestig = ''; wijkregisterTekenUitnodigen_(); } }, 'Nee')));
        } else if (s.uitnodigenBevestig === '') {
          inhoud.push(el('button', { type: 'button', class: opnieuw ? 'knop' : 'knop knop-hoofd', onclick: function () { s.uitnodigenBevestig = soort; wijkregisterTekenUitnodigen_(); } }, tekst));
        }
      };
      if (d.nu.adressen > 0) kies('nieuw', uitnodigenVraag(d.nu), 'Uitnodigingen versturen', false);
      if (d.opnieuw && d.opnieuw.nu && d.opnieuw.nu.adressen > 0) kies('opnieuw', uitnodigenOpnieuwVraag(d.opnieuw.nu), 'Iedereen opnieuw uitnodigen', true);
    }
  }
  vak.replaceChildren(el('section', { class: 'kaart wijk-kaart wijk-uitnodigen', 'aria-label': 'Uitnodigingen' }, inhoud));
}

function wijkregisterAlles_() {
  if (!wijkregisterVak) return;
  var l = wijkregisterLading;
  // de gegevens zijn opnieuw opgehaald: wat klaar was hoeft niet meer als 'wordt verwerkt' te staan
  if (!l.bezig && !l.fout && l.data) bewerkenWachtOpruim(wijkregisterStaat.wacht);
  wijkregisterTekenStatus_();
  wijkregisterTekenMelding_();
  wijkregisterTekenAdres_();
  wijkregisterTekenUitnodigen_();
  wijkregisterTekenVerlopen_();
  wijkregisterTekenLijst_();
}

// Vraagt de gegevens opnieuw op (openen van het scherm en Vernieuwen).
function wijkregisterVernieuw() {
  if (!wijkregisterVak) return;
  wijkregisterLading.haal();
  wijkregisterHaalUitnodigen_();
}

// De aantallen voor het blok Uitnodigingen, alleen voor wie het blok mag zien.
function wijkregisterHaalUitnodigen_() {
  if (wijkregisterApp && uitnodigenMag(wijkregisterApp.rechten)) wijkregisterUitnodigenLading.haal();
}

// Een nieuwe stand van de schil: is een opdracht van dit scherm klaar, dan de gegevens opnieuw ophalen; is hij niet gelukt, dan de melding tonen.
function wijkregisterVolg_(staat) {
  wijkregisterApp = staat;
  var s = wijkregisterStaat;
  var uit = bewerkenWachtVerwerk(s.wacht, staat.momentopname, bewerkenMislukteIds());
  var handtekening = bewerkenWachtHandtekening(s.wacht);
  var gewijzigd = uit.klaar + uit.fout + uit.weg + uit.verlopen > 0 || handtekening !== s.handtekening;
  s.handtekening = handtekening;
  if (uit.klaar + uit.verlopen > 0 && wijkregisterVak) { wijkregisterLading.haal(); wijkregisterHaalUitnodigen_(); }
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
    status: el('div', { class: 'deeln-status' }), uitnodigen: el('div', { class: 'wijk-uitnodigen-vak' }), verlopen: el('div', { class: 'kas-chips' }), lijst: el('div', { class: 'deeln-lijst' }), meer: el('div', { class: 'kasboek-meer' }) };
  wijkregisterLading.bijWijziging = wijkregisterAlles_;
  wijkregisterUitnodigenLading.bijWijziging = wijkregisterTekenUitnodigen_;
  var magBewerken = wijkregisterMagBewerken_();
  container.replaceChildren(
    el('header', { class: 'paginakop' }, el('div', null, el('h1', null, 'Wijkregister'),
      el('p', null, 'De buren die we mogen bewaren: wie er woont, spullen om te lenen en de jaren dat ze meededen.' + (magBewerken ? ' Kies een adres en klik op Wijzigen om contacten, bewoners, spullen en de opmerking in één keer aan te passen.' : ' Alleen kijken.')))),
    el('p', { class: 'strook deeln-privacy' }, 'Gegevens van buren: niet delen buiten de commissie.'),
    wijkregisterVak.melding,
    wijkregisterVak.uitnodigen,
    wijkregisterVak.adres,
    el('section', { class: 'kaart wijk-kaart', 'aria-label': 'Adressen' },
      el('label', { class: 'veld', for: 'wijk-zoek' }, 'Zoeken', zoekveld),
      wijkregisterVak.verlopen, wijkregisterVak.status, wijkregisterVak.lijst, wijkregisterVak.meer));
  wijkregisterVolg_(staat);
  wijkregisterAlles_();
  wijkregisterLading.haal(); // het scherm is geopend: altijd vers ophalen
  wijkregisterHaalUitnodigen_();
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
