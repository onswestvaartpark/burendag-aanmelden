// De schil van de beheerpagina: inloggen, lokale kopie van de gegevens, wachtrij met opdrachten, menu naar rechten en router.
// De schermen (overzicht, commissie, kas, begroting, geldbronnen, bon) staan in eigen bestanden en melden zich aan met registreerScherm:
//   registreerScherm({ naam: 'overzicht', titel: 'Overzicht', recht: 'overzicht_zien', icoon: 'huis' | '<svg-pad>',
//                      teken(container, staat) { ... }, bijwerken(container, staat) { ... } /* optioneel */ })
// teken bouwt het scherm; komen er nieuwe gegevens binnen, dan wordt bijwerken aangeroepen (of anders teken opnieuw).
// staat = { momentopname, rechten, ik, email, parameters, offline, stuurOpdracht(type, gegevens), herlees() }.
// Hulpmiddelen voor de schermen: el(), euro(), maakIcoon(), ICONEN. Tekst gaat nooit via innerHTML.
// Vereist (in deze volgorde geladen): config.js, gedeeld/rechten.js, wachtrij.js, api.js, menugroepen.js (de groepen van het menu).

var LEES_INTERVAL_MS = 30000;       // wacht de pagina op het verwerken van een opdracht, dan zo vaak opnieuw lezen
var LEES_MAX_MS = 600000;           // ... en daar na zo lang mee stoppen (10 minuten)
var NOG_EEN_POGING_MS = 30000;      // blijft er iets in de wachtrij staan, dan na zo lang opnieuw proberen
var VERVERS_NA_MS = 60000;          // terugkomen op de pagina na zo lang: opnieuw lezen
var SCHERM_VOLGORDE = ['overzicht', 'deelnemers', 'wijkregister', 'kas', 'begroting', 'geldbronnen', 'bon', 'commissie'];

// Pictogrammen: de binnenkant van een svg van 24 bij 24, lijntekening (zoals in de ontwerpen).
var ICONEN = {
  huis: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  kas: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/>',
  begroting: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  geldbronnen: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M15 11.5c3.4.2 6 1.4 6 3V18c0 1.7-2.7 3-6 3-2.3 0-4.3-.6-5.3-1.6"/>',
  bon: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  deelnemers: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.4c1.9.8 3 2.9 3 5.6"/>',
  wijkregister: '<path d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z"/><path d="M18 8h2v12h-2M8 9h6M8 13h6"/>',
  commissie: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
  uitloggen: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M16 8l4 4-4 4M20 12H9"/>',
  vernieuwen: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  instellingen: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  leeg: '<circle cx="12" cy="12" r="9"/><path d="M8 14.5c1 1.2 2.4 1.8 4 1.8s3-.6 4-1.8M9 9.5h.01M15 9.5h.01"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5h.01"/>'
};

var SCHERMEN = [];
var beheerApp = {
  sessie: null, momentopname: null, bijgewerktOp: 0, offline: false, leesFout: false,
  tekstInloggen: '', bericht: '', tijdLezen: null, tijdOpnieuw: null, leesLopend: null, pollTot: 0, bezig: false, syncNr: 0, uitgesteld: false, vlucht: null, schilGebouwd: false, huidig: null
};

// ---- kleine hulpmiddelen ----

// el('div', { class: 'kaart', onclick: f }, 'tekst', kind) -> element. Teksten worden tekstknopen; null en false worden overgeslagen.
function el(tag, attrs) {
  var knoop = document.createElement(tag);
  var eigen = attrs || {};
  Object.keys(eigen).forEach(function (naam) {
    var w = eigen[naam];
    if (w === null || w === undefined || w === false) return;
    if (naam === 'class') knoop.className = w;
    else if (naam.indexOf('on') === 0 && typeof w === 'function') knoop.addEventListener(naam.slice(2), w);
    else knoop.setAttribute(naam, w === true ? '' : String(w));
  });
  voegKinderenToe_(knoop, Array.prototype.slice.call(arguments, 2));
  return knoop;
}

function voegKinderenToe_(knoop, kinderen) {
  kinderen.forEach(function (k) {
    if (k === null || k === undefined || k === false) return;
    if (Array.isArray(k)) voegKinderenToe_(knoop, k);
    else knoop.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
  });
}

// Een pictogram: naam uit ICONEN, of zelf svg-binnenwerk. De tekst komt uit de code, nooit van gebruikers.
function maakIcoon(naamOfPad, klasse) {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', klasse || 'pictogram');
  svg.innerHTML = Object.prototype.hasOwnProperty.call(ICONEN, naamOfPad) ? ICONEN[naamOfPad] : (naamOfPad || ICONEN.leeg);
  return svg;
}

// Bedrag in hele centen als '€ 1.234,50' (een min ervoor bij een negatief bedrag).
function euro(centen) {
  var n = Number(centen);
  if (!isFinite(n)) return '–';
  var c = Math.round(Math.abs(n));
  var hele = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 && c > 0 ? '-' : '') + '€ ' + hele + ',' + ('0' + (c % 100)).slice(-2);
}

function tijdTekst_(ms) {
  var d = new Date(ms);
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}

function meervoud_(n, een, meer) { return n + ' ' + (n === 1 ? een : meer); }

// ---- deelnemers en wijkregister (direct opgehaald, alleen in het geheugen) ----

// Wist wat de schermen Deelnemers en Wijkregister in het geheugen hebben (uitloggen, een sessiefout of een ander account).
function vergeetDirecteLadingen_() {
  if (typeof deelnemersVergeet === 'function') deelnemersVergeet();
  if (typeof wijkregisterVergeet === 'function') wijkregisterVergeet();
}

// Vernieuwen: naast de momentopname haalt ook het getoonde scherm zijn eigen gegevens opnieuw op, als het die heeft (scherm.vernieuw).
function vernieuwKlik_() {
  synchroniseer_(true);
  var open = SCHERMEN.filter(function (s) { return s.naam === beheerApp.huidig; })[0];
  if (open && typeof open.vernieuw === 'function') open.vernieuw();
}

// ---- schermen en rechten ----

function registreerScherm(scherm) {
  if (!scherm || typeof scherm.naam !== 'string' || typeof scherm.teken !== 'function') return;
  SCHERMEN = SCHERMEN.filter(function (s) { return s.naam !== scherm.naam; });
  SCHERMEN.push(scherm);
  if (beheerApp.schilGebouwd) { tekenMenu_(); kiesScherm_(true); }
}

function rechtenNu_() {
  var m = beheerApp.momentopname;
  if (m && m.ik && Array.isArray(m.ik.rechten)) return m.ik.rechten;
  return beheerApp.sessie && Array.isArray(beheerApp.sessie.rechten) ? beheerApp.sessie.rechten : [];
}

// De schermen die deze persoon mag zien, in de vaste volgorde van het menu.
function toegestaneSchermen_() {
  var rechten = rechtenNu_();
  var lijst = SCHERMEN.filter(function (s) { return !s.recht || heeftRecht(rechten, s.recht); });
  function plek(s) { var i = SCHERM_VOLGORDE.indexOf(s.naam); return i < 0 ? 99 : i; }
  return lijst.sort(function (a, b) { return plek(a) - plek(b); });
}

// ---- staat voor de schermen ----

function hashDelen_() {
  var h = String(location.hash || '').replace(/^#/, '');
  var i = h.indexOf('?');
  return { naam: i < 0 ? h : h.slice(0, i), parameters: new URLSearchParams(i < 0 ? '' : h.slice(i + 1)) };
}

// Mag je een scherm met direct opgehaalde gegevens niet meer zien (nieuwe rechten), dan gaan die gegevens uit het geheugen.
function vergeetDirecteLadingenZonderRecht_() {
  var rechten = rechtenNu_();
  if (!heeftRecht(rechten, 'deelnemers_zien') && typeof deelnemersVergeet === 'function') deelnemersVergeet();
  if (!heeftRecht(rechten, 'persoonsgegevens_zien') && typeof wijkregisterVergeet === 'function') wijkregisterVergeet();
}

function bouwStaat_() {
  var verstuurd = verstuurdOpruim(beheerOpslag, beheerApp.momentopname, Date.now());
  var m = samenvoegMetMomentopname(beheerApp.momentopname, wachtrijLees(beheerOpslag), verstuurd);
  return {
    momentopname: m,
    rechten: rechtenNu_(),
    ik: m && m.ik ? m.ik : null,
    email: beheerApp.sessie ? beheerApp.sessie.email : '',
    parameters: hashDelen_().parameters,
    offline: beheerApp.offline,
    stuurOpdracht: stuurOpdracht,
    herlees: leesNu_
  };
}

// ---- opslaan en laden ----

function laadBewaard_() {
  beheerApp.sessie = beheerOpslag.lees('sessie');
  var m = beheerOpslag.lees('momentopname');
  beheerApp.momentopname = m && m.gegevens ? m.gegevens : null;
  beheerApp.bijgewerktOp = m && m.op ? m.op : 0;
}

function bewaarMomentopname_(gegevens) {
  beheerApp.momentopname = gegevens;
  vergeetDirecteLadingenZonderRecht_();
  beheerApp.bijgewerktOp = Date.now();
  beheerOpslag.schrijf('momentopname', { op: beheerApp.bijgewerktOp, gegevens: gegevens });
  verstuurdOpruim(beheerOpslag, gegevens, Date.now()); // wat de server nu kent, hoeft niet meer apart te worden getoond
}

// Na een geslaagde login (de inlogknop van het inlogscherm roept dit aan met het antwoord van beheerInloggen).
function inloggenGelukt(antwoord) {
  var vorige = beheerOpslag.lees('email');
  beheerApp.bericht = '';
  if (vorige !== antwoord.email) {
    // een ander lid op dit apparaat: niets van de vorige houden
    var weg = vorige ? wachtrijLees(beheerOpslag).length : 0;
    beheerOpslag.wis('momentopname'); beheerOpslag.wis('wachtrij'); beheerOpslag.wis('verstuurd'); beheerOpslag.wis('mislukt');
    beheerApp.momentopname = null;
    if (typeof bonVergeet === 'function') bonVergeet();
  if (typeof kasVergeet === 'function') kasVergeet();
    vergeetDirecteLadingen_();
    if (weg > 0) beheerApp.bericht = 'Er ' + (weg === 1 ? 'stond' : 'stonden') + ' nog ' + meervoud_(weg, 'handeling', 'handelingen') + ' van een ander account op dit apparaat. Die ' + (weg === 1 ? 'is' : 'zijn') + ' niet verstuurd en verwijderd.';
  }
  beheerApp.bezig = false;
  beheerApp.sessie = { sessie: antwoord.sessie, email: antwoord.email, naam: antwoord.naam || '', rechten: antwoord.rechten || [] };
  beheerOpslag.schrijf('sessie', beheerApp.sessie);
  beheerOpslag.schrijf('email', antwoord.email);
  beheerApp.tekstInloggen = '';
  beheerApp.offline = false; beheerApp.leesFout = false;
  if (!location.hash) location.hash = '#overzicht'; // ontbreekt dat scherm of mag het niet, dan neemt de router het eerste toegestane
  toonApp_();
  synchroniseer_();
}

// De sessie is verlopen of ontbreekt: terug naar het inlogscherm. De wachtrij en de verstuurde opdrachten blijven staan,
// de bewaarde momentopname gaat weg (die kan gegevens bevatten van iemand die er niet meer bij hoort).
function naarInloggen_(melding) {
  beheerOpslag.wis('sessie');
  beheerOpslag.wis('momentopname');
  beheerApp.sessie = null;
  beheerApp.momentopname = null;
  beheerApp.bijgewerktOp = 0;
  beheerApp.pollTot = 0;
  if (typeof kasVergeet === 'function') kasVergeet(); // een open bonfoto hoort niet boven het inlogscherm te blijven staan
  vergeetDirecteLadingen_(); // deelnemers en wijkregister staan alleen in het geheugen en gaan weg bij een sessiefout
  beheerApp.tekstInloggen = melding || '';
  beheerApp.bezig = false;
  clearTimeout(beheerApp.tijdLezen); clearTimeout(beheerApp.tijdOpnieuw);
  inloggenUitgelogd();
  toonApp_();
}

function uitloggen_() {
  var open = wachtrijLees(beheerOpslag).length;
  if (open > 0 && !window.confirm('Er ' + (open === 1 ? 'staat' : 'staan') + ' nog ' + meervoud_(open, 'handeling', 'handelingen') + ' klaar om te versturen. Als je nu uitlogt, ' + (open === 1 ? 'gaat die' : 'gaan die') + ' verloren. Toch uitloggen?')) return;
  ['sessie', 'momentopname', 'wachtrij', 'verstuurd', 'mislukt', 'email'].forEach(function (n) { beheerOpslag.wis(n); });
  beheerApp.momentopname = null;
  if (typeof bonVergeet === 'function') bonVergeet();
  if (typeof kasVergeet === 'function') kasVergeet();
  vergeetDirecteLadingen_();
  beheerApp.sessie = null;
  beheerApp.bijgewerktOp = 0;
  beheerApp.pollTot = 0;
  beheerApp.tekstInloggen = '';
  beheerApp.bericht = '';
  beheerApp.bezig = false;
  clearTimeout(beheerApp.tijdLezen); clearTimeout(beheerApp.tijdOpnieuw);
  inloggenUitgelogd();
  history.replaceState(null, '', location.pathname + location.search);
  toonApp_();
}

// ---- synchroniseren met het achterwerk ----

// Het sessiebewijs van nu; een antwoord telt alleen mee als dit nog hetzelfde is als bij het versturen van het verzoek.
function sessieToken_() { return beheerApp.sessie && beheerApp.sessie.sessie ? beheerApp.sessie.sessie : null; }

// Verstuurt de wachtrij, één verzending tegelijk: een tweede aanroep tijdens een lopende verzending (met dezelfde sessie)
// geeft dezelfde belofte terug. Hoort de lopende bij een andere sessie, dan start de nieuwe pas als die klaar is.
function stuurWachtrij_() {
  var token = sessieToken_();
  var vorige = beheerApp.vlucht;
  if (vorige && vorige.token === token) return vorige.belofte;
  function start() {
    return wachtrijVerstuur(beheerOpslag, function (opdracht) {
      return beheerVerzoek('beheerOpdracht', { opdracht: opdracht }).then(function (a) {
        // een laat antwoord na uitloggen of een andere login: weggooien (telt als geen verbinding; de opdracht blijft of is al gewist)
        if (sessieToken_() !== token) throw new Error('verouderd antwoord');
        return a;
      });
    }).then(function (r) {
      if (sessieToken_() !== token) return r;
      if (r.sessieVerlopen) naarInloggen_('Je bent uitgelogd. Log opnieuw in; wat je nog wilde versturen blijft bewaard.');
      else if (r.over > 0) plan_('opnieuw', NOG_EEN_POGING_MS); // geen verbinding of het achterwerk is druk: straks nog eens
      return r;
    });
  }
  var belofte = (vorige ? vorige.belofte.then(start, start) : start()).then(function (r) {
    if (beheerApp.vlucht && beheerApp.vlucht.belofte === belofte) beheerApp.vlucht = null;
    return r;
  }, function (fout) {
    if (beheerApp.vlucht && beheerApp.vlucht.belofte === belofte) beheerApp.vlucht = null;
    throw fout;
  });
  beheerApp.vlucht = { token: token, belofte: belofte };
  return belofte;
}

// vers = true: de Vernieuwen-knop; het koppelscript vergeet dan zijn bewaarde gegevens en leest alles opnieuw uit de Sheet.
// Eén lezing tegelijk (met dezelfde sessie): een tweede aanroep krijgt de lopende lezing terug. Een Vernieuwen-lezing wacht op de lopende.
function leesNu_(vers) {
  if (!beheerApp.sessie) return Promise.resolve();
  var token = sessieToken_();
  var lopend = beheerApp.leesLopend;
  if (lopend && lopend.token === token && vers !== true) return lopend.belofte;
  var belofte = (lopend ? lopend.belofte.then(lees, lees) : lees()).then(function (r) {
    if (beheerApp.leesLopend && beheerApp.leesLopend.belofte === belofte) beheerApp.leesLopend = null;
    return r;
  });
  beheerApp.leesLopend = { token: token, belofte: belofte };
  return belofte;

  function lees() {
    if (sessieToken_() !== token) return Promise.resolve();
    return beheerVerzoek('beheerLezen', vers === true ? { vers: true } : undefined).then(function (a) {
      if (sessieToken_() !== token) return; // laat antwoord: uitgelogd of een andere login, niets meer mee doen
      if (a && a.ok === true) {
        var gegevens = a.gegevens || (function () { var kopie = Object.assign({}, a); delete kopie.ok; return kopie; })();
        bewaarMomentopname_(gegevens);
        beheerApp.offline = false; beheerApp.leesFout = false;
      } else if (a && a.code === 'SESSIE') {
        naarInloggen_(a.melding || 'Je bent uitgelogd. Log opnieuw in.');
        return;
      } else {
        beheerApp.leesFout = true;
      }
      planVolgendeLezing_();
      vernieuwWeergave_();
    }, function () {
      if (sessieToken_() !== token) return;
      beheerApp.offline = true;
      vernieuwWeergave_();
    });
  }
}

// Wacht er nog een opdracht op verwerking (de server heeft hem nog niet of op 'nieuw'), dan elke 30 seconden opnieuw lezen:
// hooguit 10 minuten lang en niet terwijl de pagina verborgen is (bij terugkomen leest de pagina weer en gaat dit verder).
function planVolgendeLezing_() {
  if (!beheerApp.sessie) return;
  var verstuurd = verstuurdOpruim(beheerOpslag, beheerApp.momentopname, Date.now());
  if (!wachtOpVerwerking(beheerApp.momentopname, verstuurd)) { beheerApp.pollTot = 0; return; }
  var nu = Date.now();
  if (beheerApp.pollTot === 0) beheerApp.pollTot = nu + LEES_MAX_MS;
  if (nu + LEES_INTERVAL_MS > beheerApp.pollTot || document.visibilityState === 'hidden') return;
  plan_('lezen', LEES_INTERVAL_MS);
}

// Plant een synchronisatie over een tijd; een eerder geplande van dezelfde soort vervalt.
function plan_(soort, ms) {
  var sleutel = soort === 'opnieuw' ? 'tijdOpnieuw' : 'tijdLezen';
  clearTimeout(beheerApp[sleutel]);
  beheerApp[sleutel] = setTimeout(function () {
    if (beheerApp.bezig) { plan_(soort, 5000); return; } // er loopt al een ronde; zo raakt een geplande lezing niet kwijt
    synchroniseer_();
  }, ms);
}

function synchroniseer_(vers) {
  if (!beheerApp.sessie || beheerApp.bezig) return Promise.resolve();
  beheerApp.bezig = true;
  var nr = ++beheerApp.syncNr;
  function klaar() { if (nr === beheerApp.syncNr) beheerApp.bezig = false; vernieuwWeergave_(); }
  vernieuwWeergave_();
  return stuurWachtrij_().then(function () { return beheerApp.sessie ? leesNu_(vers === true) : undefined; }).then(klaar, klaar);
}

// Voor de schermen: zet een opdracht in de wachtrij, probeert hem meteen te versturen en leest daarna meteen opnieuw, zodat hij als
// 'wordt verwerkt' (status nieuw) uit de server terugkomt; daarna leest planVolgendeLezing_ tot het achterwerk klaar is.
// Geeft { id } terug zodra hij veilig in de wachtrij staat.
function stuurOpdracht(type, gegevens) {
  var opdracht = { id: nieuwOpdrachtId(), type: type, gegevens: gegevens || {} };
  wachtrijVoegToe(beheerOpslag, opdracht);
  vernieuwWeergave_();
  stuurWachtrij_().then(function (r) {
    vernieuwWeergave_();
    if (!beheerApp.sessie) return;
    if (r && r.verstuurd > 0) {
      beheerApp.pollTot = Date.now() + LEES_MAX_MS;
      leesNu_();
    }
  }, function () { vernieuwWeergave_(); });
  return { id: opdracht.id };
}

// ---- weergave ----

function app_() { return document.getElementById('app'); }

// Toont het inlogscherm of de schil, naar gelang er een sessie is.
function toonApp_() {
  beheerApp.schilGebouwd = false;
  if (!beheerApp.sessie) { tekenInlogScherm_(); return; }
  bouwSchil_();
  beheerApp.schilGebouwd = true;
  kiesScherm_(true);
}

// ---- inlogscherm ----
// De kaart zelf (Google-knop, meldingen) staat in inloggen.js (tekenInlogInhoud); die roept inloggenGelukt(antwoord) aan.

function merkLogo_(maat) {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(maat || 36)); svg.setAttribute('height', String(maat || 36)); svg.setAttribute('viewBox', '0 0 36 36'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<circle cx="18" cy="18" r="8" fill="#FFF200"/><g stroke="#FFF200" stroke-width="2.5" stroke-linecap="round"><path d="M18 3v4M18 29v4M3 18h4M29 18h4M7.4 7.4l2.8 2.8M25.8 25.8l2.8 2.8M7.4 28.6l2.8-2.8M25.8 10.2l2.8-2.8"/></g>';
  return svg;
}

function merk_() {
  var jaar = beheerApp.momentopname && beheerApp.momentopname.editie && beheerApp.momentopname.editie.datum ? String(beheerApp.momentopname.editie.datum).slice(0, 4) : '';
  return el('div', { class: 'merk' }, merkLogo_(),
    el('span', { class: 'merk-tekst' }, el('span', { class: 'merk-naam' }, 'Burendag'), el('span', { class: 'merk-sub' }, 'Westvaartpark' + (jaar ? ' · ' + jaar : ''))));
}

function tekenInlogScherm_() {
  var vak = el('div', { class: 'inlog-inhoud' });
  app_().replaceChildren(
    el('div', { class: 'inlog' },
      el('main', { class: 'inlog-midden' },
        el('div', { class: 'inlog-kaart' },
          el('div', { class: 'inlog-logo' }, merkLogo_(44)),
          el('h1', null, 'Burendag beheer'),
          vak)),
      el('p', { class: 'inlog-voet' }, 'Burendag Westvaartpark')));
  tekenInlogInhoud(vak, beheerApp.tekstInloggen);
}

// ---- schil met menu ----

function bouwSchil_() {
  var naam = beheerApp.sessie.naam || beheerApp.sessie.email || '';
  function gebruikerBlok() {
    return el('div', { class: 'gebruiker' },
      el('span', { class: 'avatar', 'aria-hidden': 'true' }, (naam.charAt(0) || '?')),
      el('div', { class: 'gebruiker-tekst' },
        el('span', { class: 'gebruiker-naam' }, naam),
        el('span', { class: 'gebruiker-sub' }, beheerApp.sessie.email || '')));
  }
  var vernieuw = el('button', { type: 'button', class: 'menu-punt', onclick: vernieuwKlik_ }, maakIcoon('vernieuwen'), el('span', null, 'Vernieuwen'));
  var uit = el('button', { type: 'button', class: 'menu-punt', onclick: uitloggen_ }, maakIcoon('uitloggen'), el('span', null, 'Uitloggen'));
  app_().replaceChildren(
    el('div', { class: 'schil' },
      el('nav', { class: 'zijmenu', 'aria-label': 'Hoofdmenu' },
        merk_(),
        el('div', { class: 'menu-lijst', id: 'menu-zij' }),
        el('div', { class: 'gebruiker-blok' }, gebruikerBlok(), el('div', { class: 'menu-lijst' }, vernieuw, uit),
          el('span', { class: 'bijgewerkt', role: 'status', 'aria-live': 'off' }))),
      el('div', { class: 'schil-rechts' },
        el('header', { class: 'bovenbalk' }, merk_(),
          el('span', { class: 'bijgewerkt bijgewerkt-boven', 'aria-hidden': 'true' }),
          el('div', { style: 'display:flex;gap:2px' },
            el('button', { type: 'button', class: 'icoonknop', 'aria-label': 'Vernieuwen', onclick: vernieuwKlik_ }, maakIcoon('vernieuwen')),
            el('button', { type: 'button', class: 'icoonknop', 'aria-label': 'Uitloggen', onclick: uitloggen_ }, maakIcoon('uitloggen')))),
        el('main', { class: 'hoofd', id: 'hoofd' },
          el('div', { class: 'hoofd-binnen' },
            el('div', { id: 'subtabs-vak' }),
            el('div', { class: 'stroken', id: 'stroken', role: 'status', 'aria-live': 'polite' }),
            el('div', { id: 'scherm' })))),
      el('nav', { class: 'onderbalk', id: 'menu-onder', 'aria-label': 'Hoofdmenu' }),
      el('a', { class: 'bon-knop', id: 'bon-knop', href: '#bon', 'aria-label': 'Bon indienen', title: 'Bon indienen', hidden: true }, maakIcoon('plus'))));
  tekenMenu_();
  if (window.MutationObserver) new MutationObserver(bonKnopSync_).observe(document.getElementById('scherm'), { childList: true, subtree: true });
  tekenStroken_();
}

// Een punt van het zijmenu (computer): pictogram en naam van een scherm.
function menuPunt_(scherm, huidig) {
  return el('a', { class: 'menu-punt', href: '#' + scherm.naam, 'aria-current': scherm.naam === huidig ? 'page' : null },
    maakIcoon(scherm.icoon || scherm.naam), el('span', null, menuLabel(scherm)));
}

// Een punt van de balk onderaan (telefoon): alleen het pictogram van de groep; naam in aria-label en title.
// telling = het getal op dit pictogram (of null); het getal staat in de aria-label, het bolletje zelf is voor schermlezers verborgen.
function menuGroepPunt_(groep, huidig, telling) {
  var actief = groep.schermen.some(function (s) { return s.naam === huidig; });
  var doel = actief ? huidig : groep.doel;
  var naam = menuBadgeNaam(groep.titel, telling);
  return el('a', { class: 'menu-punt', href: '#' + doel, 'aria-current': actief ? 'page' : null, 'aria-label': naam, title: naam },
    maakIcoon(groep.icoon), telling ? el('span', { class: 'menu-badge', 'aria-hidden': 'true' }, telling > 99 ? '99+' : String(telling)) : null);
}

// De ronde +-knop rechtsonder voor 'Bon indienen' (komt in plaats van een plek in de balk).
function bonKnopSync_() {
  var knop = document.getElementById('bon-knop');
  if (!knop) return;
  var vak = document.getElementById('scherm');
  var open = !!(vak && vak.querySelector('.bewerken-formulier, .opslaanbalk, '));
  var namen = toegestaneSchermen_().map(function (s) { return s.naam; });
  knop.hidden = !menuBonKnopZichtbaar(namen, beheerApp.huidig, open);
}

// De tabs bovenaan het scherm (telefoon) als de groep van het huidige scherm er meer dan een heeft; anders niets.
function menuTabs_(groepen, huidig) {
  var groep = menuGroepVan(groepen, huidig);
  if (!groep || !groep.tabs) return null;
  return el('nav', { class: 'subtabs', 'aria-label': groep.titel },
    groep.schermen.map(function (s) {
      return el('a', { class: 'subtab', href: '#' + s.naam, 'aria-current': s.naam === huidig ? 'page' : null }, menuLabel(s));
    }));
}

function tekenMenu_() {
  var zij = document.getElementById('menu-zij'), onder = document.getElementById('menu-onder'), tabs = document.getElementById('subtabs-vak');
  if (!zij || !onder) return;
  var lijst = toegestaneSchermen_();
  var groepen = menuGroepenVoor(lijst);
  var zijDelen = [];
  groepen.forEach(function (g) {
    if (g.kop) zijDelen.push(el('div', { class: 'menu-kop' }, g.titel));
    g.schermen.forEach(function (s) { zijDelen.push(menuPunt_(s, beheerApp.huidig)); });
  });
  zij.replaceChildren.apply(zij, zijDelen);
  var telling = menuTelling(beheerApp.momentopname, rechtenNu_());
  onder.replaceChildren.apply(onder, menuBalkGroepen(groepen).map(function (g) { return menuGroepPunt_(g, beheerApp.huidig, telling[g.naam] || null); }));
  onder.hidden = lijst.length === 0;
  if (tabs) tabs.replaceChildren.apply(tabs, [menuTabs_(groepen, beheerApp.huidig)].filter(function (k) { return k !== null; }));
  bonKnopSync_();
}

// De router: #naam; een onbekend of verboden scherm wordt het eerste toegestane scherm.
function kiesScherm_(volledig) {
  var lijst = toegestaneSchermen_();
  var gevraagd = hashDelen_().naam;
  var gekozen = lijst.filter(function (s) { return s.naam === gevraagd; })[0] || lijst[0] || null;
  if (gekozen && gevraagd !== gekozen.naam) {
    history.replaceState(null, '', '#' + gekozen.naam);
  }
  var wissel = (gekozen ? gekozen.naam : null) !== beheerApp.huidig;
  beheerApp.huidig = gekozen ? gekozen.naam : null;
  tekenMenu_();
  tekenScherm_(gekozen, volledig || wissel);
}

function tekenScherm_(scherm, volledig) {
  var vak = document.getElementById('scherm');
  if (!vak) return;
  if (!scherm) { vak.replaceChildren(leegScherm_()); return; }
  if (beheerApp.momentopname === null) {
    // de eerste keer, zonder bewaarde gegevens: wachten op de eerste lezing
    vak.replaceChildren(beheerApp.offline || beheerApp.leesFout
      ? el('section', { class: 'kaart leeg' }, maakIcoon('wifi', 'pictogram groot'), el('h2', null, 'De gegevens zijn er nog niet'),
          el('p', null, 'Er is nog geen verbinding gelukt. Probeer het zo nog eens.'),
          el('button', { type: 'button', class: 'knop knop-hoofd', onclick: function () { synchroniseer_(); } }, 'Opnieuw proberen'))
      : el('p', { class: 'laden', role: 'status' }, el('span', { class: 'laadpunt' }), 'De gegevens worden opgehaald…'));
    return;
  }
  try {
    if (!volledig && typeof scherm.bijwerken === 'function') scherm.bijwerken(vak, bouwStaat_());
    else if (!volledig && invoerActief_(vak)) { beheerApp.uitgesteld = true; zorgVoorHerteken_(vak); return; } // iemand typt: later tekenen, zodra de focus het veld verlaat
    else { beheerApp.uitgesteld = false; vak.replaceChildren(); scherm.teken(vak, bouwStaat_()); }
  } catch (fout) {
    if (window.console) console.error(fout);
    vak.replaceChildren(el('section', { class: 'kaart leeg' }, el('h2', null, 'Dit scherm kon niet worden getoond'), el('p', null, 'Ververs de pagina. Blijft het misgaan, laat het de beheerder weten.')));
  }
}

// Staat de focus in een invulveld van dit scherm (input behalve knoppen, dus ook vinkjes, keuzerondjes en bestandskeuze; textarea,
// select, contenteditable)? Dan tekenen we niet vanzelf opnieuw; een knop telt niet mee, anders bleef de nieuwe stand na een klik onzichtbaar.
function bewerkbaar_(knoop) {
  if (!knoop || knoop.nodeType !== 1) return false;
  var tag = knoop.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') return ['button', 'submit', 'reset', 'image'].indexOf((knoop.getAttribute('type') || 'text').toLowerCase()) < 0;
  return knoop.isContentEditable === true;
}

function invoerActief_(vak) {
  var actief = document.activeElement;
  return !!actief && actief !== vak && vak.contains(actief) && bewerkbaar_(actief);
}

// Er is een herteken overgeslagen: doe het één keer zodra de focus het scherm of het veld verlaat (en niet in een ander veld terechtkomt).
function zorgVoorHerteken_(vak) {
  if (vak.__hertekenLuistert) return;
  vak.__hertekenLuistert = true;
  vak.addEventListener('focusout', function () {
    setTimeout(function () {
      if (!beheerApp.uitgesteld || invoerActief_(vak)) return;
      beheerApp.uitgesteld = false;
      if (beheerApp.schilGebouwd) kiesScherm_(false);
    }, 0);
  });
}

function leegScherm_() {
  var zijn = SCHERMEN.length > 0;
  return el('section', { class: 'kaart leeg' }, maakIcoon('leeg', 'pictogram groot'),
    el('h2', null, zijn ? 'Hier is voor jou nog niets te doen' : 'Hier komt je beheerpagina'),
    el('p', null, zijn
      ? 'Je rol geeft nog geen toegang tot een scherm. Vraag de beheerder om je rol aan te passen.'
      : 'De schermen worden een voor een klaargezet. Kom straks nog eens terug.'));
}

// Stille regel 'Bijgewerkt om hh:mm' (of 'Bezig met bijwerken…' zolang er gelezen wordt); de bewaarde gegevens blijven intussen gewoon staan.
function tekenBijgewerkt_() {
  var tekst = beheerApp.bezig ? 'Bezig met bijwerken…' : beheerApp.bijgewerktOp ? 'Bijgewerkt om ' + tijdTekst_(beheerApp.bijgewerktOp) : '';
  Array.prototype.forEach.call(document.querySelectorAll('.bijgewerkt'), function (k) { k.textContent = tekst; });
}

// Meldingen boven het scherm: geen verbinding, wat nog onderweg is en wat niet gelukt is.
function tekenStroken_() {
  tekenBijgewerkt_();
  var vak = document.getElementById('stroken');
  if (!vak) return;
  var stroken = [];
  var open = wachtrijLees(beheerOpslag).length;
  var verwerkt = ((beheerApp.momentopname && beheerApp.momentopname.mijnOpdrachten) || []).filter(function (o) { return o.status === 'nieuw'; }).length;
  if (beheerApp.offline) {
    stroken.push(el('div', { class: 'strook strook-geel' }, maakIcoon('wifi'),
      el('span', { class: 'strook-tekst' }, 'Geen verbinding.' + (beheerApp.bijgewerktOp ? ' Je ziet de gegevens van ' + tijdTekst_(beheerApp.bijgewerktOp) + '.' : '') + ' Wat je invoert, wordt later verstuurd.'),
      el('button', { type: 'button', class: 'knop', onclick: function () { synchroniseer_(); } }, 'Opnieuw proberen')));
  } else if (beheerApp.leesFout) {
    stroken.push(el('div', { class: 'strook strook-geel' },
      el('span', { class: 'strook-tekst' }, 'De nieuwste gegevens konden nu niet worden opgehaald.' + (beheerApp.bijgewerktOp ? ' Je ziet die van ' + tijdTekst_(beheerApp.bijgewerktOp) + '.' : '')),
      el('button', { type: 'button', class: 'knop', onclick: function () { synchroniseer_(); } }, 'Opnieuw proberen')));
  }
  if (beheerApp.bericht) {
    stroken.push(el('div', { class: 'strook strook-geel', role: 'alert' },
      el('span', { class: 'strook-tekst' }, beheerApp.bericht),
      el('button', { type: 'button', class: 'knop', onclick: function () { beheerApp.bericht = ''; tekenStroken_(); } }, 'Sluiten')));
  }
  if (open > 0) {
    stroken.push(el('div', { class: 'strook' }, el('span', { class: 'strook-tekst' }, meervoud_(open, 'handeling wacht', 'handelingen wachten') + ' om te worden verstuurd. Dat gaat vanzelf zodra het kan.')));
  } else if (verwerkt > 0) {
    stroken.push(el('div', { class: 'strook' }, el('span', { class: 'strook-tekst' }, meervoud_(verwerkt, 'handeling wordt', 'handelingen worden') + ' verwerkt. Dat duurt hooguit een minuut.')));
  }
  mislukteLees(beheerOpslag).forEach(function (m) {
    stroken.push(el('div', { class: 'strook strook-fout', role: 'alert' },
      el('span', { class: 'strook-tekst' }, 'Dit is niet gelukt: ' + m.melding),
      el('button', { type: 'button', class: 'knop', onclick: function () { mislukteWis(beheerOpslag, m.opdracht.id); vernieuwWeergave_(); } }, 'Sluiten')));
  });
  vak.replaceChildren.apply(vak, stroken);
}

// Nieuwe gegevens of een nieuwe stand van de wachtrij: strook en scherm bijwerken.
function vernieuwWeergave_() {
  if (!beheerApp.schilGebouwd) return;
  tekenStroken_();
  kiesScherm_(false);
}

// ---- starten ----

function startBeheer_() {
  laadBewaard_();
  window.addEventListener('hashchange', function () { if (beheerApp.schilGebouwd) kiesScherm_(true); });
  window.addEventListener('online', function () { synchroniseer_(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') clearTimeout(beheerApp.tijdLezen); // verborgen pagina: niet blijven lezen
    if (document.visibilityState !== 'visible' || !beheerApp.sessie) return;
    if (Date.now() - beheerApp.bijgewerktOp > VERVERS_NA_MS) synchroniseer_();
    else planVolgendeLezing_(); // wacht er nog een opdracht op verwerking, dan gaat het lezen verder
  });
  toonApp_();
  if (beheerApp.sessie) synchroniseer_();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startBeheer_);
else startBeheer_();
