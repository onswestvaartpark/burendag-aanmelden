// De huishoudkaart in het scherm Wijkregister (fase 2c): contacten, bewoners, spullen, opmerking, deelname en bewaartermijn van een adres. Een adres wordt in één keer
// gewijzigd: kies het adres, klik Wijzigen, pas alles in één formulier aan (contacten, bewoners, spullen en opmerking) en sla één keer op. Het opslaan is één opdracht
// (registerAdresOpslaan, zie bewerken.js), met 'oud' (het adres zoals de pagina het voor het laatst ophaalde) en 'nieuw'. Ook het formulier van een nieuw adres gebruikt dit formulier.
// Daarnaast het wissen van adressen waarvan de bewaartermijn voorbij is.
// Alles blijft in het geheugen van de pagina (namen, geboortejaren, dieetwensen): nooit op het apparaat bewaard.
// De pure functies bovenaan zijn getest met Node (test/huishoudkaart.test.js); de functies met el() staan eronder en gebruiken het scherm in scherm-wijkregister.js.
// Vereist: app.js (el), gedeeld/rechten.js (heeftRecht), bewerken.js, gedeeld/validatie.js, gedeeld/contactcontrole.js (controleerContactGegevens), gedeeld/adrescode.js (controleerHuisnummerEnToevoeging),
// gedeeld/huishoudkaart.js (huishoudControleerBewoner, huishoudControleerSpul, huishoudControleerOpmerking, huishoudLeeftijd, huishoudSoort, bewaartermijnVan),
// en scherm-wijkregister.js (wijkregisterStaat, wijkregisterStuur_, wijkregisterTekenLijst_, wijkregisterTekenAdres_, wijkregisterApp, wijkregisterNaam_, wijkregisterMailLink_, wijkregisterTelLink_, wijkregisterToestemming_).

var KAART_TYPEN = ['registerAdresOpslaan'];
var KAART_MAX_WISSEN = 100; // zoveel adrescodes past in één opdracht (zie bijwerken.js)
// Hoeveel rijen één adres hooguit heeft (zie bijwerken.js) en hoe groot de gegevens van een opdracht hooguit mogen zijn (zie opdrachten.js).
var KAART_MAX_CONTACTEN = 12;
var KAART_MAX_BEWONERS = 20;
var KAART_MAX_SPULLEN = 20;
var KAART_MAX_GEGEVENS = 20000;
var KAART_SOORTEN = { contacten: { een: 'contact', meer: 'contacten', max: KAART_MAX_CONTACTEN }, bewoners: { een: 'bewoner', meer: 'bewoners', max: KAART_MAX_BEWONERS },
  spullen: { een: 'spul', meer: 'spullen', max: KAART_MAX_SPULLEN } };

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
  // de commissie bewaart de gegevens tot 3 edities (jaren) achter elkaar zonder aanmelding voorbij zijn; tot dan blijven de buren de mails krijgen
  return { tekst: 'Bewaren tot eind ' + t.tot + ' (3 jaar zonder aanmelding)', verlopen: verlopen, onbekend: false };
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


// ---- het formulier: staat, rijen, controle ----

function kaartTekst_(w) {
  return w === undefined || w === null ? '' : String(w);
}

// Het adres zoals de server het gaf, in de vorm die de opdracht als 'oud' meestuurt: alleen wat de commissie ziet (geen toestemmingen of tokens).
function kaartOudVan(a) {
  return {
    contacten: (a.contacten || []).map(function (c) { return { voornaam: kaartTekst_(c.voornaam), achternaam: kaartTekst_(c.achternaam), email: kaartTekst_(c.email), telefoon: kaartTekst_(c.telefoon) }; }),
    bewoners: (a.personen || []).map(kaartBewonerOud),
    spullen: (a.spullen || []).map(kaartSpulOud),
    opmerking: kaartTekst_(a.opmerking)
  };
}

// De bewoner zoals het formulier hem vult uit wat de server gaf, en de 'oud' die de verwerker vergelijkt.
function kaartBewonerOud(p) {
  return { voornaam: p.voornaam, geboortemaand: p.geboortemaand === undefined ? null : p.geboortemaand, geboortejaar: p.geboortejaar === undefined ? null : p.geboortejaar,
    dieet: (p.dieet || []).slice(), dieetToelichting: p.dieetToelichting || '', ehbo: p.ehbo === true };
}

function kaartSpulOud(sp) {
  return { wat: sp.wat, aantal: sp.aantal === undefined ? null : sp.aantal, opmerking: sp.opmerking || '' };
}

function kaartNieuweRij(soort) {
  if (soort === 'contacten') return { voornaam: '', achternaam: '', email: '', telefoon: '' };
  if (soort === 'bewoners') return { voornaam: '', geboortemaand: '', geboortejaar: '', dieet: [], dieetToelichting: '', ehbo: false };
  return { wat: '', aantal: '', opmerking: '' };
}

// De staat van het formulier 'Wijzigen' voor dit adres: elke rij heeft van = zijn plek in oud (zo weet de server welk contact zijn token en toestemmingen houdt,
// en telt de pagina wat er verwijderd wordt). Alle waarden zijn tekst, zoals in de invoervelden.
function kaartFormulierUitAdres(a) {
  var oud = kaartOudVan(a);
  return {
    adrescode: a.adrescode, oud: oud,
    contacten: oud.contacten.map(function (c, i) { return Object.assign({ van: i }, c); }),
    bewoners: (a.personen || []).map(function (p, i) {
      return { van: i, voornaam: kaartTekst_(p.voornaam), geboortemaand: p.geboortemaand === null || p.geboortemaand === undefined ? '' : String(p.geboortemaand),
        geboortejaar: p.geboortejaar === null || p.geboortejaar === undefined ? '' : String(p.geboortejaar), dieet: (p.dieet || []).slice(), dieetToelichting: kaartTekst_(p.dieetToelichting), ehbo: p.ehbo === true };
    }),
    spullen: (a.spullen || []).map(function (sp, i) {
      return { van: i, wat: kaartTekst_(sp.wat), aantal: sp.aantal === null || sp.aantal === undefined ? '' : String(sp.aantal), opmerking: kaartTekst_(sp.opmerking) };
    }),
    opmerking: oud.opmerking, fouten: null
  };
}

// De staat van het formulier 'Adres toevoegen': leeg, met alvast een contact.
function kaartFormulierNieuw() {
  return { straat: '', huisnummer: '', toevoeging: '', oud: null, contacten: [kaartNieuweRij('contacten')], bewoners: [], spullen: [], opmerking: '', fouten: null };
}

// Een lege rij erbij; false als er al het maximum is.
function kaartRijToevoegen(f, soort) {
  if (f[soort].length >= KAART_SOORTEN[soort].max) return false;
  f[soort].push(kaartNieuweRij(soort));
  return true;
}

function kaartRijVerwijder(f, soort, i) {
  if (i < 0 || i >= f[soort].length) return false;
  f[soort].splice(i, 1);
  return true;
}

// Hoeveel contacten, bewoners en spullen verdwijnen: de rijen uit oud waar geen rij meer van is (van). Geeft { contacten, bewoners, spullen }.
function kaartVerwijderdAantallen(f) {
  var uit = {};
  Object.keys(KAART_SOORTEN).forEach(function (soort) {
    var over = f[soort].filter(function (r) { return r.van !== undefined && r.van !== null; }).length;
    uit[soort] = f.oud ? Math.max(0, f.oud[soort].length - over) : 0;
  });
  return uit;
}

// De regel boven Opslaan: 'Je verwijdert 1 contact, 2 bewoners en 1 spul'; leeg als er niets verwijderd wordt.
function kaartVerwijderdTekst(f) {
  var n = kaartVerwijderdAantallen(f);
  var delen = [];
  Object.keys(KAART_SOORTEN).forEach(function (soort) {
    if (n[soort] > 0) delen.push(n[soort] + ' ' + (n[soort] === 1 ? KAART_SOORTEN[soort].een : KAART_SOORTEN[soort].meer));
  });
  if (delen.length === 0) return '';
  return 'Je verwijdert ' + (delen.length === 1 ? delen[0] : delen.slice(0, -1).join(', ') + ' en ' + delen[delen.length - 1]);
}

// Fouten per veld van één rij. valideer(rij) geeft de meldingen; basis = een geldige rij. Elk veld wordt apart gecontroleerd (met de rest uit basis), zodat de melding bij dat veld kan staan;
// wat daarna nog overblijft (een melding die van meer velden afhangt) komt bij 'rij'.
function kaartVeldFouten(valideer, rij, velden, basis, paren) {
  var uit = { rij: [] };
  var gezien = [];
  velden.forEach(function (v) {
    var probeer = Object.assign({}, basis);
    probeer[v] = rij[v];
    ((paren || {})[v] || []).forEach(function (p) { probeer[p] = rij[p]; });
    uit[v] = valideer(probeer);
    uit[v].forEach(function (m) { gezien.push(m); });
  });
  valideer(rij).forEach(function (m) { if (gezien.indexOf(m) === -1 && uit.rij.indexOf(m) === -1) uit.rij.push(m); });
  return uit;
}

var KAART_VELDEN = {
  contacten: ['voornaam', 'achternaam', 'email', 'telefoon'],
  bewoners: ['voornaam', 'geboortemaand', 'geboortejaar', 'dieet', 'dieetToelichting', 'ehbo'],
  spullen: ['wat', 'aantal', 'opmerking']
};

function kaartTelFouten_(fouten) {
  var n = fouten.algemeen.length + fouten.opmerking.length + Object.keys(fouten.adres).reduce(function (t, k) { return t + fouten.adres[k].length; }, 0);
  ['contacten', 'bewoners', 'spullen'].forEach(function (soort) {
    fouten[soort].forEach(function (r) { Object.keys(r).forEach(function (k) { n += r[k].length; }); });
  });
  return n;
}

// Controleert het hele formulier met de gedeelde controles en bouwt de gegevens van de opdracht. dieetCodes = de codes van de server (mag ontbreken: dan alleen de vorm);
// een dieetcode die een bewoner al had (in oud) blijft toegestaan. Voor 'Wijzigen' (f.oud) is de opdracht registerAdresOpslaan met { adrescode, oud, nieuw };
// voor 'Adres toevoegen' (zonder oud) is het de inhoud van registerAdresToevoegen. extra = { straten, adressen } voor dat formulier (straat, huisnummer, toevoeging en dubbelen).
// Geeft { fouten: { algemeen, adres, contacten: [per rij], bewoners, spullen, opmerking }, aantal, gegevens }; gegevens is alleen bruikbaar als aantal 0 is.
function kaartControleer(f, dieetCodes, extra) {
  var fouten = { algemeen: [], adres: {}, contacten: [], bewoners: [], spullen: [], opmerking: [] };
  var oudDieet = [];
  if (f.oud) f.oud.bewoners.forEach(function (b) { (b.dieet || []).forEach(function (c) { if (oudDieet.indexOf(c) === -1) oudDieet.push(c); }); });
  var omgeving = dieetCodes ? { dieetCodes: dieetCodes, oudDieet: oudDieet } : { oudDieet: oudDieet };
  var nieuw = { contacten: [], bewoners: [], spullen: [], opmerking: '' };
  f.contacten.forEach(function (r) {
    var c = controleerContactGegevens(r);
    var rij = kaartVeldFouten(function (g) { return controleerContactGegevens(g).fouten; }, r, KAART_VELDEN.contacten, { voornaam: 'A', achternaam: '', email: '', telefoon: '' });
    fouten.contacten.push(rij);
    var schoon = c.schoon;
    if (r.van !== undefined && r.van !== null) schoon.van = r.van;
    nieuw.contacten.push(schoon);
  });
  f.bewoners.forEach(function (r) {
    var b = huishoudControleerBewoner(r, omgeving);
    fouten.bewoners.push(kaartVeldFouten(function (g) { return huishoudControleerBewoner(g, omgeving).fouten; }, r, KAART_VELDEN.bewoners,
      { voornaam: 'A', geboortemaand: '', geboortejaar: '', dieet: [], dieetToelichting: '', ehbo: false }, { geboortemaand: ['geboortejaar'] }));
    nieuw.bewoners.push(b.schoon);
  });
  f.spullen.forEach(function (r) {
    var sp = huishoudControleerSpul(r);
    fouten.spullen.push(kaartVeldFouten(function (g) { return huishoudControleerSpul(g).fouten; }, r, KAART_VELDEN.spullen, { wat: 'x', aantal: '', opmerking: '' }));
    nieuw.spullen.push(sp.schoon);
  });
  var o = huishoudControleerOpmerking(f.opmerking);
  fouten.opmerking = o.fouten;
  nieuw.opmerking = o.schoon;
  var gegevens;
  if (f.oud) {
    gegevens = { adrescode: f.adrescode, oud: f.oud, nieuw: nieuw };
  } else {
    var e = extra || {};
    var straten = e.straten || [];
    var nr = null;
    fouten.adres.straat = straten.indexOf(f.straat) === -1 ? ['Kies een straat uit de lijst.'] : [];
    fouten.adres.huisnummer = []; fouten.adres.toevoeging = [];
    try { nr = controleerHuisnummerEnToevoeging(f.huisnummer, f.toevoeging); } catch (err) {
      var m = String(err && err.message || err);
      // de melding over de toevoeging hoort bij dat veld, de rest bij het huisnummer
      (/toevoeging/i.test(m) ? fouten.adres.toevoeging : fouten.adres.huisnummer).push(m);
    }
    if (nr && fouten.adres.straat.length === 0) {
      var gezocht = (String(f.straat) + String(nr.huisnummer) + String(nr.toevoeging || '')).replace(/\s+/g, '').toLowerCase();
      var bestaand = (e.adressen || []).filter(function (a) { return String(a.adres || '').replace(/\s+/g, '').toLowerCase() === gezocht; })[0];
      if (bestaand) fouten.adres.huisnummer.push('Dit adres staat al in het wijkregister (' + bestaand.adres + '). Wijzig dat adres in plaats van het opnieuw toe te voegen.');
    }
    if (f.contacten.length === 0) fouten.algemeen.push('Vul minstens één contact in.');
    gegevens = { straat: f.straat, huisnummer: nr ? String(nr.huisnummer) : '', toevoeging: nr ? nr.toevoeging : '', contacten: nieuw.contacten, bewoners: nieuw.bewoners, spullen: nieuw.spullen, opmerking: nieuw.opmerking };
  }
  var aantal = kaartTelFouten_(fouten);
  if (aantal === 0 && JSON.stringify(gegevens).length > KAART_MAX_GEGEVENS) {
    fouten.algemeen.push('Dit adres heeft te veel gegevens om in één keer op te slaan. Maak de teksten korter of haal rijen weg.');
    aantal = 1;
  }
  return { fouten: fouten, aantal: aantal, gegevens: gegevens };
}

// Wat er van een adres te zien is: de gegevens van de server, of (zolang een opdracht voor dit adres wordt verwerkt) de nieuwe stand uit die opdracht.
// a = een adres uit beheerWijkregister, wachtGegevens = de gegevens van de laatste opdracht registerAdresOpslaan voor dit adres in het geheugen van de pagina, of null.
// Geeft { wacht, contacten: [{ voornaam, achternaam, email, telefoon, toestemming (tekst of null) }], bewoners, spullen, opmerking }.
function kaartWeergaveVan(a, wachtGegevens, toestemmingTekst) {
  var oudeContacten = a.contacten || [];
  if (!wachtGegevens || !wachtGegevens.nieuw) {
    return { wacht: false, contacten: oudeContacten.map(function (c) { return Object.assign({}, c, { toestemming: toestemmingTekst ? toestemmingTekst(c) : null }); }),
      bewoners: a.personen || [], spullen: a.spullen || [], opmerking: a.opmerking || '' };
  }
  var n = wachtGegevens.nieuw;
  return { wacht: true,
    contacten: (n.contacten || []).map(function (c) {
      var vroeger = c.van !== undefined && c.van !== null ? oudeContacten[c.van] : null;
      return { voornaam: c.voornaam, achternaam: c.achternaam, email: c.email, telefoon: c.telefoon, toestemming: vroeger && toestemmingTekst ? toestemmingTekst(vroeger) : null };
    }),
    bewoners: n.bewoners || [], spullen: n.spullen || [], opmerking: n.opmerking || '' };
}

// ---- weergave ----

function kaartData_() {
  return typeof wijkregisterLading !== 'undefined' && wijkregisterLading.data ? wijkregisterLading.data : {};
}

// Het formulier 'Wijzigen' openen voor dit adres (hooguit één tegelijk).
function kaartOpen_(a) {
  var s = wijkregisterStaat;
  var f = kaartFormulierUitAdres(a);
  f.focus = 'eerste';
  s.kaart = f;
  s.open[a.adrescode] = true;
  wijkregisterTekenLijst_();
}

function kaartSluit_() {
  wijkregisterStaat.kaart = null;
  wijkregisterTekenLijst_();
}

function kaartDieetCodes_() {
  var codes = (kaartData_().dieetkeuzes || []).map(function (k) { return k.code; });
  return codes.length > 0 ? codes : null;
}

function kaartOpslaan_() {
  var s = wijkregisterStaat;
  var f = s.kaart;
  if (!f || !wijkregisterMagBewerken_()) return;
  var u = kaartControleer(f, kaartDieetCodes_());
  if (u.aantal > 0) {
    f.fouten = u.fouten; f.aantalFouten = u.aantal;
    wijkregisterTekenLijst_();
    bewerkenFocusFouten(document.getElementById('wijk-f'));
    return;
  }
  s.kaart = null;
  wijkregisterStuur_('registerAdresOpslaan', u.gegevens);
  wijkregisterTekenLijst_();
}

// Het formulier voor adres-toevoegen sturen (scherm-wijkregister.js roept dit aan).
function kaartNieuwAdresOpslaan_() {
  var s = wijkregisterStaat;
  var f = s.adresFormulier;
  if (!f || !wijkregisterMagBewerken_()) return;
  var d = kaartData_();
  var u = kaartControleer(f, kaartDieetCodes_(), { straten: wijkregisterStraten_(), adressen: d.adressen });
  if (u.aantal > 0) {
    f.fouten = u.fouten; f.aantalFouten = u.aantal;
    wijkregisterTekenAdres_();
    bewerkenFocusFouten(document.getElementById('wijk-n'));
    return;
  }
  s.adresFormulier = null;
  wijkregisterStuur_('registerAdresToevoegen', u.gegevens);
  wijkregisterTekenAdres_();
}

// Een invoerveld van een rij: waarde uit de staat, bijhouden bij typen, de melding eronder en aria-invalid/describedby als er een fout is.
function kaartInvoer_(f, soort, i, veld, id, label, opties) {
  var rij = f[soort][i];
  var meldingen = f.fouten && f.fouten[soort] && f.fouten[soort][i] && f.fouten[soort][i][veld] ? f.fouten[soort][i][veld] : [];
  var invoer = el('input', Object.assign({ type: 'text', id: id, maxlength: String(CONTACT_MAX_TEKENS), autocomplete: 'off',
    oninput: function (e) { rij[veld] = e.target.value; } }, opties || {}));
  invoer.value = kaartTekst_(rij[veld]);
  return kaartVeldMetFout_(id, label, invoer, meldingen);
}

function kaartVeldMetFout_(id, label, invoer, meldingen) {
  if (meldingen.length > 0) { invoer.setAttribute('aria-invalid', 'true'); invoer.setAttribute('aria-describedby', id + '-fout'); }
  return el('div', { class: 'veld' }, el('label', { for: id }, label), invoer,
    meldingen.length > 0 ? el('span', { class: 'kaart-veldfout', id: id + '-fout' }, meldingen.join(' ')) : null);
}

function kaartRijFouten_(f, soort, i) {
  var m = f.fouten && f.fouten[soort] && f.fouten[soort][i] ? f.fouten[soort][i].rij : [];
  return m && m.length > 0 ? el('div', { class: 'kaart-veldfout', role: 'alert' }, m.join(' ')) : null;
}

// Een rij met kop (naam en ×) en velden. hertekenen = tekent het formulier opnieuw na een rij erbij of weg.
function kaartRij_(f, soort, i, titel, velden, hertekenen, voorvoegsel) {
  var kop = el('div', { class: 'kaart-rijkop' }, el('strong', null, titel),
    el('button', { type: 'button', class: 'knop knop-klein knop-gevaar kaart-weg', 'aria-label': titel + ' verwijderen', onclick: function () {
      kaartRijVerwijder(f, soort, i);
      f.focus = 'kaart-toevoegen-' + soort + '-' + voorvoegsel; // de knop '+ ...' van dezelfde sectie
      hertekenen();
    } }, '×'));
  return el('li', { class: 'kaart-rij' }, kop, el('div', { class: 'begr-velden' }, velden), kaartRijFouten_(f, soort, i));
}

function kaartContactRij_(f, i, voorvoegsel, hertekenen) {
  var id = function (v) { return voorvoegsel + '-c' + i + '-' + v; };
  var velden = [
    kaartInvoer_(f, 'contacten', i, 'voornaam', id('voornaam'), 'Voornaam', { required: 'required' }),
    kaartInvoer_(f, 'contacten', i, 'achternaam', id('achternaam'), 'Achternaam (mag leeg)'),
    kaartInvoer_(f, 'contacten', i, 'email', id('email'), 'E-mailadres (mag leeg)', { type: 'email', inputmode: 'email', autocapitalize: 'none' }),
    kaartInvoer_(f, 'contacten', i, 'telefoon', id('telefoon'), 'Telefoonnummer (mag leeg)', { type: 'tel', inputmode: 'tel' })
  ];
  return kaartRij_(f, 'contacten', i, 'Contact ' + (i + 1), velden, hertekenen, voorvoegsel);
}

function kaartBewonerRij_(f, i, voorvoegsel, hertekenen) {
  var id = function (v) { return voorvoegsel + '-b' + i + '-' + v; };
  var r = f.bewoners[i];
  var keuzes = kaartData_().dieetkeuzes || [];
  var fout = f.fouten && f.fouten.bewoners && f.fouten.bewoners[i] ? f.fouten.bewoners[i] : {};
  // codes die de bewoner heeft maar die niet (meer) in de keuzes staan, blijven als vinkje zichtbaar
  var extra = r.dieet.filter(function (c) { return !keuzes.some(function (k) { return k.code === c; }); }).map(function (c) { return { code: c, naam: c }; });
  var dieetVeld = el('fieldset', { class: 'chips', id: id('dieet') }, el('legend', null, 'Dieet (mag leeg)'),
    keuzes.length + extra.length === 0 ? el('span', { class: 'rij-sub' }, 'Er zijn geen dieetkeuzes ingesteld.') : keuzes.concat(extra).map(function (k, j) {
      var vink = el('input', { type: 'checkbox', id: id('dieet-' + j), checked: r.dieet.indexOf(k.code) !== -1, onchange: function (e) {
        var p = r.dieet.indexOf(k.code);
        if (e.target.checked && p === -1) r.dieet.push(k.code);
        if (!e.target.checked && p !== -1) r.dieet.splice(p, 1);
      } });
      return el('label', { class: 'chip' }, vink, k.naam || k.code);
    }),
    fout.dieet && fout.dieet.length > 0 ? el('span', { class: 'kaart-veldfout' }, fout.dieet.join(' ')) : null);
  var ehbo = el('input', { type: 'checkbox', id: id('ehbo'), checked: r.ehbo === true, onchange: function (e) { r.ehbo = e.target.checked; } });
  var velden = [
    kaartInvoer_(f, 'bewoners', i, 'voornaam', id('voornaam'), 'Voornaam', { required: 'required', maxlength: String(HUISHOUD_MAX_VOORNAAM) }),
    kaartInvoer_(f, 'bewoners', i, 'geboortemaand', id('maand'), 'Geboortemaand (1 tot en met 12, mag leeg)', { inputmode: 'numeric', maxlength: '2' }),
    kaartInvoer_(f, 'bewoners', i, 'geboortejaar', id('jaar'), 'Geboortejaar (vier cijfers, mag leeg)', { inputmode: 'numeric', maxlength: '4' }),
    dieetVeld,
    kaartInvoer_(f, 'bewoners', i, 'dieetToelichting', id('toelichting'), 'Toelichting bij het dieet (mag leeg)', { maxlength: String(HUISHOUD_MAX_TOELICHTING) }),
    el('div', { class: 'veld' }, el('label', { for: id('ehbo') }, ehbo, ' Heeft een EHBO-diploma'))
  ];
  return kaartRij_(f, 'bewoners', i, 'Bewoner ' + (i + 1), velden, hertekenen, voorvoegsel);
}

function kaartSpulRij_(f, i, voorvoegsel, hertekenen) {
  var id = function (v) { return voorvoegsel + '-s' + i + '-' + v; };
  var velden = [
    kaartInvoer_(f, 'spullen', i, 'wat', id('wat'), 'Wat leen je uit?', { required: 'required', maxlength: String(HUISHOUD_MAX_SPUL_WAT) }),
    kaartInvoer_(f, 'spullen', i, 'aantal', id('aantal'), 'Aantal (1 tot en met 999, mag leeg)', { inputmode: 'numeric', maxlength: '3' }),
    kaartInvoer_(f, 'spullen', i, 'opmerking', id('opmerking'), 'Opmerking (mag leeg)', { maxlength: String(HUISHOUD_MAX_SPUL_OPMERKING) })
  ];
  return kaartRij_(f, 'spullen', i, 'Spul ' + (i + 1), velden, hertekenen, voorvoegsel);
}

function kaartSectie_(f, soort, titel, rijTekenaar, voorvoegsel, hertekenen) {
  var rijen = f[soort].map(function (r, i) { return rijTekenaar(f, i, voorvoegsel, hertekenen); });
  var soortInfo = KAART_SOORTEN[soort];
  var vol = f[soort].length >= soortInfo.max;
  return el('fieldset', { class: 'kaart-sectie' }, el('legend', null, titel + ' (' + f[soort].length + ')'),
    rijen.length === 0 ? el('p', { class: 'rij-sub' }, 'Geen ' + soortInfo.meer + '.') : el('ul', { class: 'kaart-rijen' }, rijen),
    el('button', { type: 'button', class: 'knop knop-klein', id: 'kaart-toevoegen-' + soort + '-' + voorvoegsel, disabled: vol, onclick: function () {
      kaartRijToevoegen(f, soort);
      f.focus = voorvoegsel + '-' + (soort === 'contacten' ? 'c' : soort === 'bewoners' ? 'b' : 's') + (f[soort].length - 1) + '-' + (soort === 'spullen' ? 'wat' : 'voornaam');
      hertekenen();
    } }, '+ ' + soortInfo.een),
    vol ? el('span', { class: 'rij-sub' }, ' Meer dan ' + soortInfo.max + ' ' + soortInfo.meer + ' past niet in één keer.') : null);
}

// Het formulier voor een heel adres. opties = { id, voorvoegsel, titel, opslaanTekst, bijOpslaan, bijAnnuleren, hertekenen, kop (extra velden bovenaan, bij een nieuw adres) }.
function kaartAdresFormulier_(f, opties) {
  var velden = (opties.kop || []).concat([
    kaartSectie_(f, 'contacten', 'Contacten', kaartContactRij_, opties.voorvoegsel, opties.hertekenen),
    kaartSectie_(f, 'bewoners', 'Bewoners', kaartBewonerRij_, opties.voorvoegsel, opties.hertekenen),
    kaartSectie_(f, 'spullen', 'Spullen om te lenen', kaartSpulRij_, opties.voorvoegsel, opties.hertekenen)
  ]);
  var vak = el('textarea', { id: opties.voorvoegsel + '-opmerking', rows: '4', maxlength: String(HUISHOUD_MAX_ADRES_OPMERKING), oninput: function (e) { f.opmerking = e.target.value; } });
  vak.value = f.opmerking;
  var opmFout = f.fouten && f.fouten.opmerking ? f.fouten.opmerking : [];
  velden.push(kaartVeldMetFout_(opties.voorvoegsel + '-opmerking', 'Opmerking over dit adres (hooguit ' + HUISHOUD_MAX_ADRES_OPMERKING + ' tekens, mag leeg)', vak, opmFout));
  var weg = kaartVerwijderdTekst(f);
  if (weg !== '') velden.push(el('p', { class: 'strook strook-geel kaart-verwijderd', role: 'status' }, weg + '. Dit gebeurt pas als je op Opslaan klikt.'));
  var algemeen = f.fouten ? f.fouten.algemeen.slice() : [];
  if (f.fouten && f.aantalFouten > 0) algemeen.unshift('Controleer de gemarkeerde velden (' + f.aantalFouten + (f.aantalFouten === 1 ? ' fout' : ' fouten') + ').');
  var form = bewerkenFormulier({ id: opties.id, titel: opties.titel, velden: velden, fouten: algemeen, opslaanTekst: opties.opslaanTekst, bijOpslaan: opties.bijOpslaan, bijAnnuleren: opties.bijAnnuleren });
  if (f.focus) {
    var doel = f.focus;
    f.focus = null;
    setTimeout(function () {
      var v = doel === 'eerste' ? null : document.getElementById(doel);
      if (!v) v = form.querySelector('input, select, textarea');
      if (v) { v.focus(); if (form.scrollIntoView) form.scrollIntoView({ block: 'nearest' }); }
    }, 0);
  }
  return form;
}

// Het formulier 'Wijzigen' van een adres in de lijst.
function kaartWijzigFormulier_(f) {
  return kaartAdresFormulier_(f, { id: 'wijk-f', voorvoegsel: 'wijk-f', titel: 'Adres wijzigen', opslaanTekst: 'Opslaan', bijOpslaan: kaartOpslaan_, bijAnnuleren: kaartSluit_,
    hertekenen: wijkregisterTekenLijst_ });
}

// ---- alleen kijken ----

function kaartBewonerTekst_(p, data) {
  var l = kaartLeeftijd(p, kaartVandaag(data), data.leeftijdsgroepen);
  // is de leeftijd onbekend (geen geboortejaar), dan staat er alleen 'leeftijd onbekend': kind of volwassene weten we dan niet
  var sub = [l.leeftijd === null ? l.tekst : l.soort + ', ' + l.tekst];
  var dieet = (p.dieet || []).map(function (c) { return kaartDieetNaam(c, data.dieetkeuzes); });
  if (dieet.length > 0) sub.push('dieet: ' + dieet.join(', '));
  if (p.dieetToelichting) sub.push('toelichting: ' + p.dieetToelichting);
  if (p.ehbo) sub.push('EHBO');
  return [el('span', { class: 'rij-titel' }, p.voornaam || 'Zonder naam'), el('div', { class: 'rij-sub' }, sub.join(' · '))];
}

function kaartContactTekst_(c) {
  return [el('span', { class: 'rij-titel' }, wijkregisterNaam_(c) || 'Zonder naam'),
    c.email ? el('div', null, wijkregisterMailLink_(c.email)) : null,
    c.telefoon ? el('div', null, wijkregisterTelLink_(c.telefoon)) : null,
    c.toestemming ? el('div', { class: 'rij-sub' }, c.toestemming) : null];
}

function kaartSpulTekst_(sp) {
  var sub = [];
  if (sp.aantal !== null && sp.aantal !== undefined && sp.aantal !== '') sub.push('aantal: ' + sp.aantal);
  if (sp.opmerking) sub.push(sp.opmerking);
  return [el('span', { class: 'rij-titel' }, sp.wat || 'Zonder naam'), sub.length > 0 ? el('div', { class: 'rij-sub' }, sub.join(' · ')) : null];
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

// Het hele detail van een adres. In de leesstand: contacten, bewoners, spullen, opmerking en deelname, met één knop Wijzigen (alleen met mag, en niet zolang er een opdracht voor dit adres
// wordt verwerkt). In de wijzigstand staat het formulier op de plek van contacten, bewoners, spullen en opmerking.
function kaartDetail(a, mag) {
  var s = wijkregisterStaat;
  var data = kaartData_();
  var wacht = bewerkenWachtVoor(s.wacht, a.adrescode, KAART_TYPEN);
  var f = s.kaart;
  var delen = [];
  if (mag && f && f.adrescode === a.adrescode) {
    delen.push(kaartWijzigFormulier_(f));
    delen.push(kaartDeelnameBlok_(a));
    return el('div', { class: 'deeln-detail' }, delen);
  }
  var w = kaartWeergaveVan(a, wacht.length > 0 ? wacht[wacht.length - 1].gegevens : null, wijkregisterToestemming_);
  var blok = function (titel, rijen, leeg) {
    return el('div', { class: 'deeln-blok' }, el('strong', null, titel), rijen.length === 0 ? el('div', { class: 'rij-sub' }, leeg) : el('ul', { class: 'deeln-personen' }, rijen));
  };
  if (mag) {
    delen.push(el('div', { class: 'knoppen bewerken-knoppen' }, w.wacht ? bewerkenWachtLabel('wordt verwerkt') :
      el('button', { type: 'button', class: 'knop knop-klein', onclick: function () { kaartOpen_(a); } }, 'Wijzigen')));
  }
  delen.push(blok(w.contacten.length + (w.contacten.length === 1 ? ' contact' : ' contacten'), w.contacten.map(function (c) { return el('li', w.wacht ? { class: 'bewerken-wacht-rij' } : null, kaartContactTekst_(c)); }), 'Geen contact bewaard.'));
  delen.push(blok('Bewoners (' + w.bewoners.length + ')', w.bewoners.map(function (p) { return el('li', w.wacht ? { class: 'bewerken-wacht-rij' } : null, kaartBewonerTekst_(p, data)); }), 'Geen bewoners bewaard.'));
  delen.push(blok('Spullen om te lenen (' + w.spullen.length + ')', w.spullen.map(function (sp) { return el('li', w.wacht ? { class: 'bewerken-wacht-rij' } : null, kaartSpulTekst_(sp)); }), 'Geen spullen bewaard.'));
  delen.push(el('div', { class: 'deeln-blok' }, el('strong', null, 'Opmerking'),
    w.opmerking === '' ? el('div', { class: 'rij-sub' }, 'Geen opmerking.') : el('div', { style: 'white-space:pre-wrap' }, w.opmerking)));
  delen.push(kaartDeelnameBlok_(a));
  return el('div', { class: 'deeln-detail' }, delen);
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

