// Scherm Commissie: wie bij de commissie hoort, welke rol ieder lid heeft en wat elke rol mag.
// Alleen met het recht leden_beheren. Opslaan gaat DIRECT (niet via de wachtrij met opdrachten): beheerLedenOpslaan en beheerRollenOpslaan.
// De wijzigingen staan eerst in een concept (commissie.leden en commissie.rollen); dat blijft staan tot het is opgeslagen of weggegooid,
// ook als er op de achtergrond nieuwe gegevens binnenkomen. Tekst gaat nooit via innerHTML.
// Vereist app.js (registreerScherm, el, maakIcoon, beheerApp, naarInloggen_, bewerkbaar_), api.js (beheerVerzoek) en gedeeld/rechten.js.

var COMMISSIE_MAX_TEKST = 120;
var COMMISSIE_MELDING_FOUT = 'Opslaan lukt nu niet. Probeer het zo nog eens.';
var COMMISSIE_MELDING_ZELF = 'Je haalt je eigen beheerrechten weg. Daarna kun je dit scherm niet meer gebruiken.';
var COMMISSIE_MELDING_WEG = 'Je hebt wijzigingen die nog niet zijn opgeslagen. Toch weggaan? Je wijzigingen gaan dan verloren.';
var COMMISSIE_MELDING_LAATSTE = 'Dit is de enige actieve beheerder en die kan niet worden uitgezet. Maak eerst iemand anders beheerder.';

// Per recht een korte naam en een uitleg, in gewone woorden; per thema de rechten die erbij horen.
var COMMISSIE_RECHT_TEKSTEN = {
  overzicht_zien: ['Het overzicht bekijken', 'De kerncijfers en wat er te doen is.'],
  deelnemers_zien: ['Deelnemers bekijken', 'Zien welke huishoudens meedoen en met hoeveel personen.'],
  persoonsgegevens_zien: ['Namen en contactgegevens van buren zien', 'Namen, e-mailadressen en telefoonnummers.'],
  deelnemer_bewerken: ['Aanmeldingen aanpassen', 'De gegevens van een aanmelding wijzigen.'],
  betalingen_zien: ['Betalingen bekijken', 'Zien wie heeft betaald en wie nog niet.'],
  bank_inlezen: ['Bankafschrift inlezen', 'Een afschrift van de bank laden om betalingen te zien.'],
  betalingen_koppelen: ['Betalingen koppelen', 'Een betaling aan het juiste huishouden koppelen.'],
  herinneringen_versturen: ['Herinneringen versturen', 'Buren die nog niet betaalden een herinnering mailen.'],
  mails_versturen: ['Mails versturen', 'Mails naar deelnemers sturen, zoals de betaallink.'],
  kas_zien: ['De kas bekijken', 'Alle inkomsten en uitgaven zien.'],
  kas_bewerken: ['De kas bijhouden', 'Boekingen in de kas toevoegen of aanpassen.'],
  bon_indienen: ['Bonnen indienen', 'Een betaalde rekening met bon opsturen voor terugbetaling.'],
  kascontrole_doen: ['De kas controleren', 'De kascontrole doen en afronden.'],
  verslag_maken: ['Het financieel verslag maken', 'Het verslag over de kas opstellen.'],
  begroting_zien: ['De begroting bekijken', 'Zien wat per post is begroot en uitgegeven.'],
  begroting_bewerken: ['De begroting aanpassen', 'Posten en bedragen in de begroting wijzigen.'],
  geldbronnen_zien: ['Geldbronnen bekijken', 'Zien waar het geld vandaan komt, zoals sponsors en subsidies.'],
  geldbronnen_bewerken: ['Geldbronnen bijhouden', 'Sponsors, subsidies en giften toevoegen of wijzigen.'],
  opschonen: ['Oude gegevens opschonen', 'Persoonsgegevens wissen als ze niet meer nodig zijn.'],
  instellingen_beheren: ['Instellingen beheren', 'Het scherm Instellingen: datums, bedragen, lijsten en mailteksten wijzigen.'],
  leden_beheren: ['De commissie beheren', 'Leden toevoegen en rollen en rechten aanpassen (dit scherm).']
};
var COMMISSIE_THEMAS = [
  { naam: 'Overzicht', rechten: ['overzicht_zien'] },
  { naam: 'Deelnemers en betalingen', rechten: ['deelnemers_zien', 'persoonsgegevens_zien', 'deelnemer_bewerken', 'betalingen_zien', 'bank_inlezen', 'betalingen_koppelen', 'herinneringen_versturen', 'mails_versturen'] },
  { naam: 'Kas', rechten: ['kas_zien', 'kas_bewerken', 'bon_indienen', 'kascontrole_doen', 'verslag_maken'] },
  { naam: 'Geld voor 2027', rechten: ['begroting_zien', 'begroting_bewerken', 'geldbronnen_zien', 'geldbronnen_bewerken'] },
  { naam: 'Beheer', rechten: ['opschonen', 'instellingen_beheren', 'leden_beheren'] }
];

// De stand van het scherm; blijft bestaan als je naar een ander scherm gaat (het concept gaat niet verloren).
var commissie = {
  email: null,            // van wie dit concept is
  leden: null,            // concept: [{ sleutel, email, naam, rollen: [], actief, nieuw }]
  rollen: null,           // concept: [{ sleutel, naam, omschrijving, rechten: [], nieuw }]
  basisLeden: '', basisRollen: '',   // de opgeslagen stand waarmee het concept wordt vergeleken (zie commissieCanon*_)
  bezig: false, klaar: false, fout: '', toonFouten: false, nieuweInfo: false, keuze: false,
  wachtOp: 0,             // na opslaan: de lezing van vóór het opslaan; tot er een nieuwere is, tekenen we niet opnieuw uit oude gegevens
  rijMelding: {}, aangeraakt: {}, open: {}, nieuwRol: { naam: '', omschrijving: '', melding: '' },
  teller: 0, container: null, staat: null
};

// ---- gegevens: concept, vergelijken ----

function commissieSleutel_(voorvoegsel) { commissie.teller += 1; return voorvoegsel + commissie.teller; }
function commissieMail_(tekst) { return String(tekst === undefined || tekst === null ? '' : tekst).trim().toLowerCase(); }
function commissieHeeft_(object, naam) { return !!object && Object.prototype.hasOwnProperty.call(object, naam); }

function commissieRollenLijst_(rollenObject) {
  var namen = Object.keys(rollenObject || {});
  namen.sort(function (a, b) { return (a === 'Beheerder' ? 0 : 1) - (b === 'Beheerder' ? 0 : 1); }); // Beheerder bovenaan, de rest op volgorde van de lijst
  return namen.map(function (naam) {
    var r = rollenObject[naam] || {};
    return { sleutel: commissieSleutel_('r'), naam: naam, omschrijving: typeof r.omschrijving === 'string' ? r.omschrijving : '', rechten: Array.isArray(r.rechten) ? r.rechten.slice() : [], nieuw: false };
  });
}

function commissieLedenLijst_(ledenLijst) {
  return (Array.isArray(ledenLijst) ? ledenLijst : []).map(function (l) {
    return { sleutel: commissieSleutel_('l'), email: String(l.email || ''), naam: String(l.naam || ''), rollen: Array.isArray(l.rollen) ? l.rollen.slice() : [], actief: l.actief === true, nieuw: false };
  });
}

// Vaste tekst van de leden, zodat "is er iets veranderd?" een vergelijking van twee teksten is (rollen in de volgorde van de lijst).
function commissieCanonLeden_(leden, rolNamen) {
  return JSON.stringify((leden || []).map(function (l) {
    var rollen = (l.rollen || []).map(function (r) { return String(r).trim(); }).filter(function (r) { return r !== ''; });
    rollen.sort(function (a, b) {
      var ia = rolNamen.indexOf(a), ib = rolNamen.indexOf(b);
      if (ia < 0 && ib < 0) return a < b ? -1 : (a > b ? 1 : 0);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
    return [commissieMail_(l.email), String(l.naam || '').trim(), rollen, l.actief === true];
  }));
}

function commissieCanonRollen_(rollen) {
  return JSON.stringify((rollen || []).map(function (r) {
    var rechten = (r.rechten || []).slice().sort(function (a, b) { return RECHTEN.indexOf(a) - RECHTEN.indexOf(b); });
    return [String(r.naam).trim(), String(r.omschrijving || '').trim(), rechten];
  }));
}

function commissieRolNamen_(rollen) { return rollen.map(function (r) { return r.naam; }); }

// De stand uit de momentopname, als vaste teksten (voor vergelijken).
function commissieOpgeslagen_(m) {
  var rollen = commissieRollenLijst_(m && m.rollen);
  return { leden: commissieCanonLeden_(m && Array.isArray(m.leden) ? m.leden : [], commissieRolNamen_(rollen)), rollen: commissieCanonRollen_(rollen) };
}

function commissieVuilLeden_() { return !!commissie.leden && commissieCanonLeden_(commissie.leden, commissieRolNamen_(commissie.rollen)) !== commissie.basisLeden; }
function commissieVuilRollen_() { return !!commissie.rollen && commissieCanonRollen_(commissie.rollen) !== commissie.basisRollen; }
function commissieVuil_() { return !!commissie.leden && (commissieVuilLeden_() || commissieVuilRollen_()); }

// Begin opnieuw met wat er nu is opgeslagen.
function commissieStart_(staat) {
  var m = staat.momentopname || {};
  commissie.email = commissieMail_(staat.email);
  commissie.rollen = commissieRollenLijst_(m.rollen);
  commissie.leden = commissieLedenLijst_(m.leden);
  var stand = commissieOpgeslagen_(m);
  commissie.basisLeden = stand.leden; commissie.basisRollen = stand.rollen;
  commissie.klaar = false; commissie.fout = ''; commissie.toonFouten = false; commissie.nieuweInfo = false; commissie.keuze = false; commissie.wachtOp = 0;
  commissie.rijMelding = {}; commissie.aangeraakt = {};
  commissie.nieuwRol = { naam: '', omschrijving: '', melding: '' };
}

// Het concept laten vallen (na bevestigen bij weggaan of bij een andere gebruiker).
function commissieVergeet_() {
  commissie.leden = null; commissie.rollen = null; commissie.email = null; commissie.basisLeden = ''; commissie.basisRollen = '';
  commissie.klaar = false; commissie.fout = ''; commissie.nieuweInfo = false; commissie.keuze = false; commissie.wachtOp = 0; commissie.bezig = false;
}

// Het concept als verzoek: leden en rollen zoals het achterwerk ze verwacht.
function commissieLedenVerzoek_(leden, rolNamen) {
  var canon = JSON.parse(commissieCanonLeden_(leden, rolNamen));
  return canon.map(function (c) { return { email: c[0], naam: c[1], rollen: c[2], actief: c[3] }; });
}

function commissieRollenVerzoek_(rollen) {
  var uit = {};
  JSON.parse(commissieCanonRollen_(rollen)).forEach(function (c) { uit[c[0]] = { rechten: c[2], omschrijving: c[1] }; });
  return uit;
}

// ---- controle (zelfde regels als het achterwerk, met de meldingen bij het juiste lid of de juiste rol) ----

function commissieBeheerders_(leden) {
  return leden.filter(function (l) { return l.actief && l.rollen.indexOf('Beheerder') >= 0; }).length;
}

// { perLid: {sleutel: [meldingen]}, perRol: {sleutel: [...]}, leden: [meldingen over de lijst], rollen: [...], zacht: {sleutel: melding}, aantal }
function commissieControleer_() {
  var uit = { perLid: {}, perRol: {}, leden: [], rollen: [], zacht: {}, aantal: 0 };
  var rolNamen = commissieRolNamen_(commissie.rollen);
  var gezien = {};
  commissie.leden.forEach(function (l) {
    var meldingen = [];
    var mail = commissieMail_(l.email);
    if (mail === '') meldingen.push('Vul een e-mailadres in.');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) meldingen.push('Dit is geen geldig e-mailadres.');
    else if (gezien[mail]) meldingen.push('Dit e-mailadres staat er al in.');
    if (mail !== '') gezien[mail] = true;
    if (String(l.email).length > COMMISSIE_MAX_TEKST || String(l.naam).length > COMMISSIE_MAX_TEKST) meldingen.push('Dit is te lang (hoogstens ' + COMMISSIE_MAX_TEKST + ' tekens).');
    if (meldingen.length) { uit.perLid[l.sleutel] = meldingen; uit.aantal += meldingen.length; }
    if (l.actief && l.rollen.length === 0) uit.zacht[l.sleutel] = 'Dit lid heeft nog geen rol en kan dus nergens bij.';
  });
  var rollenObject = commissieRollenVerzoek_(commissie.rollen);
  var ledenVerzoek = commissieLedenVerzoek_(commissie.leden, rolNamen);
  // wat de gedeelde controle nog meer vindt, en niet al bij een lid staat (e-mail), komt bij de lijst
  controleerLeden(ledenVerzoek, rollenObject).forEach(function (t) {
    if (/is geen geldig e-mailadres\.$/.test(t) || /staat er dubbel in\.$/.test(t)) return;
    uit.leden.push(t); uit.aantal += 1;
  });
  controleerRollen(rollenObject, ledenVerzoek).forEach(function (t) { uit.rollen.push(t); uit.aantal += 1; });
  commissie.rollen.forEach(function (r) {
    if (String(r.naam).length > COMMISSIE_MAX_TEKST || String(r.omschrijving).length > COMMISSIE_MAX_TEKST) {
      uit.perRol[r.sleutel] = ['Dit is te lang (hoogstens ' + COMMISSIE_MAX_TEKST + ' tekens).']; uit.aantal += 1;
    }
  });
  return uit;
}

// Mag deze rol weg? Alleen als niemand hem (in het concept) heeft. Geeft een melding terug, of '' als het mag.
function commissieWegMelding_(rol) {
  if (rol.naam === 'Beheerder') return 'De rol Beheerder blijft altijd bestaan.';
  var gebruikt = commissie.leden.filter(function (l) { return l.rollen.indexOf(rol.naam) >= 0; }).length;
  if (gebruikt > 0) return meervoud_(gebruikt, 'lid heeft', 'leden hebben') + ' deze rol nog. Haal de rol eerst bij ' + (gebruikt === 1 ? 'dat lid' : 'die leden') + ' weg.';
  var zonder = commissie.rollen.filter(function (r) { return r !== rol; });
  var meldingen = controleerRollen(commissieRollenVerzoek_(zonder), commissieLedenVerzoek_(commissie.leden, commissieRolNamen_(zonder))).filter(function (t) { return t.indexOf(rol.naam) >= 0 || t.indexOf('Beheerder') >= 0; });
  return meldingen.length ? meldingen[0] : '';
}

// ---- opslaan ----

function commissieEigenRechten_(rollen, leden, email) {
  var rollenObject = commissieRollenVerzoek_(rollen);
  var ik = commissieLedenVerzoek_(leden, commissieRolNamen_(rollen)).filter(function (l) { return l.email === email; })[0];
  return ik ? rechtenVoor(ik, rollenObject) : [];
}

function commissieZelfSlot_() {
  var staat = commissie.staat;
  if (!staat || !heeftRecht(staat.rechten || [], 'leden_beheren')) return false;
  return !heeftRecht(commissieEigenRechten_(commissie.rollen, commissie.leden, commissieMail_(staat.email)), 'leden_beheren');
}

function commissieStatus_() {
  commissie.klaar = false;
  commissie.fout = '';
}

// De stappen in een volgorde die het achterwerk accepteert: het achterwerk controleert leden tegen de opgeslagen rollen en rollen
// tegen de opgeslagen leden. Nieuwe of aangepaste rollen eerst; weggehaalde rollen pas nadat de leden ze kwijt zijn.
function commissieStappen_(verzoekRollen, verzoekLeden) {
  var stappen = [];
  var oud = (commissie.staat && commissie.staat.momentopname && commissie.staat.momentopname.rollen) || {};
  var weg = Object.keys(oud).filter(function (naam) { return !commissieHeeft_(verzoekRollen, naam); });
  var rollenWijzigd = commissieVuilRollen_(), ledenWijzigd = commissieVuilLeden_();
  if (rollenWijzigd) {
    // eerst de rollen met de weg te halen rollen er nog bij; die gaan er na de leden uit
    var eerst = Object.assign({}, verzoekRollen);
    weg.forEach(function (naam) { eerst[naam] = { rechten: (oud[naam] && oud[naam].rechten) || [], omschrijving: (oud[naam] && oud[naam].omschrijving) || '' }; });
    stappen.push({ actie: 'beheerRollenOpslaan', gegevens: { rollen: eerst }, klaar: weg.length ? null : 'rollen' });
  }
  if (ledenWijzigd) stappen.push({ actie: 'beheerLedenOpslaan', gegevens: { leden: verzoekLeden }, klaar: 'leden' });
  if (rollenWijzigd && weg.length) stappen.push({ actie: 'beheerRollenOpslaan', gegevens: { rollen: verzoekRollen }, klaar: 'rollen' });
  return stappen;
}

function commissieOpslaan_(overschrijf) {
  if (commissie.bezig || !commissieVuil_()) return;
  commissie.toonFouten = true;
  var controle = commissieControleer_();
  if (controle.aantal > 0) {
    commissie.fout = '';
    commissieVerfris_();
    var eerste = commissie.container && commissie.container.querySelector('.melding-fout');
    if (eerste && eerste.scrollIntoView) eerste.scrollIntoView({ block: 'center' });
    return;
  }
  if (commissie.nieuweInfo && overschrijf !== true) {
    // iemand anders heeft intussen iets gewijzigd: nooit stil overschrijven
    commissie.keuze = true; commissie.fout = '';
    commissieVerfris_();
    var keuze = commissie.container && commissie.container.querySelector('[data-keuze]');
    if (keuze && keuze.scrollIntoView) keuze.scrollIntoView({ block: 'center' });
    return;
  }
  commissie.keuze = false;
  if (commissieZelfSlot_() && !window.confirm(COMMISSIE_MELDING_ZELF)) return;
  var rolNamen = commissieRolNamen_(commissie.rollen);
  var verzoekRollen = commissieRollenVerzoek_(commissie.rollen);
  var verzoekLeden = commissieLedenVerzoek_(commissie.leden, rolNamen);
  var verstuurdLeden = commissieCanonLeden_(commissie.leden, rolNamen), verstuurdRollen = commissieCanonRollen_(commissie.rollen);
  var stappen = commissieStappen_(verzoekRollen, verzoekLeden);
  var staat = commissie.staat;
  var vorigeLezing = beheerApp.bijgewerktOp;
  var email = commissie.email;
  commissie.bezig = true; commissieStatus_();
  commissieVerfris_();

  function mislukt(melding, i) {
    commissie.bezig = false;
    var namen = { beheerRollenOpslaan: 'rollen', beheerLedenOpslaan: 'leden' };
    var klaar = [], nog = [];
    stappen.forEach(function (st, j) { var n = namen[st.actie]; var lijst = j < i ? klaar : nog; if (lijst.indexOf(n) < 0) lijst.push(n); });
    if (klaar.length > 0) {
      var deels = klaar.filter(function (n) { return nog.indexOf(n) >= 0; });
      var echt = klaar.filter(function (n) { return deels.indexOf(n) < 0; });
      var tekst = [];
      if (echt.length) tekst.push('De ' + echt.join(' en de ') + ' zijn' + ' opgeslagen');
      var rest = nog.filter(function (n) { return deels.indexOf(n) < 0; });
      if (rest.length) tekst.push('de ' + rest.join(' en de ') + ' nog niet');
      if (deels.length) tekst.push('de ' + deels.join(' en de ') + ' zijn maar gedeeltelijk opgeslagen');
      melding = tekst.join(', ').replace(/^./, function (c) { return c.toUpperCase(); }) + ': ' + melding;
    }
    commissie.fout = melding;
    commissieVerfris_();
  }
  function stap(i) {
    if (i >= stappen.length) {
      commissie.bezig = false; commissie.klaar = true; commissie.fout = '';
      commissie.nieuweInfo = false;
      commissie.wachtOp = vorigeLezing;
      commissieVerfris_();
      // de rechten in het menu kunnen veranderd zijn (ook die van jezelf): meteen opnieuw lezen
      var lees = staat && typeof staat.herlees === 'function' ? staat.herlees() : null;
      if (lees && typeof lees.then === 'function') lees.then(function () { commissie.wachtOp = 0; }, function () { commissie.wachtOp = 0; });
      return;
    }
    beheerVerzoek(stappen[i].actie, stappen[i].gegevens).then(function (a) {
      if (commissie.email !== email) return; // intussen een andere gebruiker: niets meer doen
      if (a && a.ok === true) {
        if (stappen[i].klaar === 'leden') commissie.basisLeden = verstuurdLeden;
        if (stappen[i].klaar === 'rollen') commissie.basisRollen = verstuurdRollen;
        if (i === stappen.length - 1) { commissie.basisLeden = verstuurdLeden; commissie.basisRollen = verstuurdRollen; }
        stap(i + 1);
      } else if (a && a.code === 'SESSIE') {
        commissie.bezig = false;
        naarInloggen_(a.melding || 'Je bent uitgelogd. Log opnieuw in; je wijzigingen blijven bewaard.');
      } else if (a && a.code === 'RECHT') {
        mislukt('Je mag de commissie niet beheren.', i);
      } else {
        mislukt(a && a.melding ? a.melding : COMMISSIE_MELDING_FOUT, i);
      }
    }, function () {
      if (commissie.email !== email) return;
      mislukt(COMMISSIE_MELDING_FOUT, i);
    });
  }
  stap(0);
}

// Alles weggooien wat nog niet is opgeslagen.
function commissieTerug_() {
  if (commissie.bezig || !commissie.staat) return;
  commissieStart_(commissie.staat);
  commissieHertekenBehoudFocus_();
}

// ---- wijzigingen door de gebruiker ----

function commissieNaWijziging_() {
  commissieStatus_();
  commissie.rijMelding = {};
  commissieVerfris_();
}

function commissieZoekLid_(sleutel) { return commissie.leden.filter(function (l) { return l.sleutel === sleutel; })[0]; }
function commissieZoekRol_(sleutel) { return commissie.rollen.filter(function (r) { return r.sleutel === sleutel; })[0]; }

function commissieLidToevoegen_() {
  var nieuw = { sleutel: commissieSleutel_('l'), email: '', naam: '', rollen: [], actief: true, nieuw: true };
  // een nieuw lid krijgt de rol Lid als die er is: de veiligste standaard
  if (commissie.rollen.some(function (r) { return r.naam === 'Lid'; })) nieuw.rollen = ['Lid'];
  commissie.leden.push(nieuw);
  commissieStatus_(); commissie.rijMelding = {};
  commissieHertekenBehoudFocus_('mail-' + nieuw.sleutel);
  var rij = commissie.container && commissie.container.querySelector('[data-lid="' + nieuw.sleutel + '"]');
  if (rij && rij.scrollIntoView) rij.scrollIntoView({ block: 'center' });
}

function commissieLidWeghalen_(sleutel) {
  commissie.leden = commissie.leden.filter(function (l) { return l.sleutel !== sleutel; });
  commissieStatus_(); commissie.rijMelding = {};
  commissieHertekenBehoudFocus_();
}

function commissieRolWissel_(lid, rolNaam, aan, vinkje) {
  commissie.rijMelding = {};
  if (!aan && rolNaam === 'Beheerder' && lid.actief && commissieBeheerders_(commissie.leden) <= 1) {
    vinkje.checked = true;
    commissie.rijMelding[lid.sleutel] = COMMISSIE_MELDING_LAATSTE;
    commissieStatus_(); commissieVerfris_();
    return;
  }
  var i = lid.rollen.indexOf(rolNaam);
  if (aan && i < 0) lid.rollen.push(rolNaam);
  if (!aan && i >= 0) lid.rollen.splice(i, 1);
  commissieNaWijziging_();
}

function commissieActiefWissel_(lid, aan, vinkje) {
  commissie.rijMelding = {};
  if (!aan && lid.actief && lid.rollen.indexOf('Beheerder') >= 0 && commissieBeheerders_(commissie.leden) <= 1) {
    vinkje.checked = true;
    commissie.rijMelding[lid.sleutel] = COMMISSIE_MELDING_LAATSTE;
    commissieStatus_(); commissieVerfris_();
    return;
  }
  lid.actief = aan;
  commissieNaWijziging_();
}

function commissieRechtWissel_(rol, recht, aan) {
  var i = rol.rechten.indexOf(recht);
  if (aan && i < 0) rol.rechten.push(recht);
  if (!aan && i >= 0) rol.rechten.splice(i, 1);
  commissieNaWijziging_();
}

function commissieRolToevoegen_() {
  var nr = commissie.nieuwRol;
  var naam = String(nr.naam).trim();
  var melding = '';
  if (naam === '') melding = 'Geef de rol een naam.';
  else if (naam.length > 40) melding = 'Kies een kortere naam (hoogstens 40 tekens).';
  else if (naam === '__proto__' || commissie.rollen.some(function (r) { return r.naam.toLowerCase() === naam.toLowerCase(); })) melding = 'Er is al een rol met deze naam.';
  else if (String(nr.omschrijving).length > COMMISSIE_MAX_TEKST) melding = 'Maak de uitleg korter (hoogstens ' + COMMISSIE_MAX_TEKST + ' tekens).';
  if (melding) { nr.melding = melding; commissieHertekenBehoudFocus_('nieuwe-rol-naam'); return; }
  var rol = { sleutel: commissieSleutel_('r'), naam: naam, omschrijving: String(nr.omschrijving).trim(), rechten: [], nieuw: true };
  commissie.rollen.push(rol);
  commissie.open[rol.sleutel] = true;
  commissie.nieuwRol = { naam: '', omschrijving: '', melding: '' };
  commissieStatus_(); commissie.rijMelding = {};
  commissieHertekenBehoudFocus_('nieuwe-rol-naam');
  var kaart = commissie.container && commissie.container.querySelector('[data-rol="' + rol.sleutel + '"]');
  if (kaart && kaart.scrollIntoView) kaart.scrollIntoView({ block: 'center' });
}

function commissieRolWeghalen_(rol) {
  if (commissieWegMelding_(rol) !== '') return;
  if (!window.confirm('De rol ' + rol.naam + ' verwijderen?')) return;
  commissie.rollen = commissie.rollen.filter(function (r) { return r !== rol; });
  commissieStatus_(); commissie.rijMelding = {};
  commissieHertekenBehoudFocus_();
}

// ---- tekenen ----

function commissieInitiaal_(lid) {
  var tekst = String(lid.naam || '').trim() || String(lid.email || '').trim();
  return tekst.charAt(0) || '?';
}

function commissieVeld_(label, invoer, meldingSleutel) {
  return el('label', { class: 'veld commissie-veld' }, label, invoer, el('span', { class: 'veld-melding', 'data-melding': meldingSleutel, role: 'alert' }));
}

function commissieLidRij_(lid, staat) {
  var rolNamen = commissieRolNamen_(commissie.rollen);
  var jij = commissieMail_(lid.email) === commissieMail_(staat.email) && lid.email !== '';
  var naamInvoer = el('input', { type: 'text', autocomplete: 'off', maxlength: 120, 'data-fokus': 'naam-' + lid.sleutel, placeholder: 'Bijvoorbeeld Anna de Vries' });
  naamInvoer.value = lid.naam;
  naamInvoer.addEventListener('input', function () { lid.naam = naamInvoer.value; commissieNaWijziging_(); });
  var mailBlok;
  if (lid.nieuw) {
    var mailInvoer = el('input', { type: 'email', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', maxlength: 120, 'data-fokus': 'mail-' + lid.sleutel, placeholder: 'naam@voorbeeld.nl' });
    mailInvoer.value = lid.email;
    mailInvoer.addEventListener('input', function () { lid.email = mailInvoer.value; commissieNaWijziging_(); });
    mailInvoer.addEventListener('blur', function () { commissie.aangeraakt[lid.sleutel] = true; commissieVerfris_(); });
    mailBlok = commissieVeld_('E-mailadres (het Google-account waarmee diegene inlogt)', mailInvoer, 'mail-' + lid.sleutel);
  } else {
    mailBlok = el('div', { class: 'lid-mail' }, lid.email);
  }
  var chips = [];
  commissie.rollen.forEach(function (r) { chips.push(commissieChip_(lid, r.naam)); });
  lid.rollen.forEach(function (naam) {
    if (rolNamen.indexOf(naam) < 0) chips.push(commissieChip_(lid, naam, true));
  });
  var actiefVinkje = el('input', { type: 'checkbox', role: 'switch', 'aria-label': 'Actief', 'data-fokus': 'actief-' + lid.sleutel });
  actiefVinkje.checked = lid.actief;
  actiefVinkje.addEventListener('change', function () { commissieActiefWissel_(lid, actiefVinkje.checked, actiefVinkje); });
  return el('li', { class: 'lid', 'data-lid': lid.sleutel },
    el('span', { class: 'avatar-lid', 'aria-hidden': 'true', 'data-avatar': lid.sleutel }, commissieInitiaal_(lid)),
    el('div', { class: 'lid-kern' },
      el('div', { class: 'lid-kop' },
        lid.nieuw ? el('span', { class: 'label label-geel' }, 'Nieuw') : null,
        jij ? el('span', { class: 'label' }, 'Jij') : null,
        el('span', { class: 'label label-grijs', 'data-niet-actief': lid.sleutel, hidden: lid.actief }, 'Niet actief')),
      commissieVeld_('Naam', naamInvoer, 'naam-' + lid.sleutel),
      mailBlok,
      el('fieldset', { class: 'chips', 'aria-label': 'Rollen van ' + (lid.naam || lid.email || 'dit lid') }, el('legend', null, 'Rollen'), chips),
      el('p', { class: 'veld-melding melding-zacht', 'data-zacht': lid.sleutel }),
      el('p', { class: 'veld-melding', 'data-melding': 'rij-' + lid.sleutel, role: 'alert' })),
    el('div', { class: 'lid-zijde' },
      el('label', { class: 'schakel' }, actiefVinkje, el('span', { class: 'schakel-knop', 'aria-hidden': 'true' }), el('span', { class: 'schakel-tekst', 'data-actief-tekst': lid.sleutel }, lid.actief ? 'Actief' : 'Niet actief')),
      lid.nieuw ? el('button', { type: 'button', class: 'knop knop-klein', onclick: function () { commissieLidWeghalen_(lid.sleutel); } }, 'Weghalen') : null));
}

function commissieChip_(lid, rolNaam, onbekend) {
  var vinkje = el('input', { type: 'checkbox', 'data-fokus': 'chip-' + lid.sleutel + '-' + rolNaam });
  vinkje.checked = lid.rollen.indexOf(rolNaam) >= 0;
  vinkje.addEventListener('change', function () { commissieRolWissel_(lid, rolNaam, vinkje.checked, vinkje); });
  return el('label', { class: 'chip' + (onbekend ? ' chip-onbekend' : '') }, vinkje, el('span', null, rolNaam + (onbekend ? ' (bestaat niet meer)' : '')));
}

function commissieRechtenGroepen_() {
  var bekend = {};
  var groepen = COMMISSIE_THEMAS.map(function (t) { t.rechten.forEach(function (r) { bekend[r] = true; }); return t; });
  var rest = RECHTEN.filter(function (r) { return !bekend[r]; });
  if (rest.length) groepen = groepen.concat([{ naam: 'Overig', rechten: rest }]);
  return groepen;
}

function commissieRolKaart_(rol) {
  var vast = rol.naam === 'Beheerder';
  var rechtenTekst = el('span', { class: 'rol-aantal', 'data-rol-aantal': rol.sleutel });
  var omschrijvingInvoer = null;
  if (!vast) {
    omschrijvingInvoer = el('input', { type: 'text', maxlength: 120, 'data-fokus': 'omschrijving-' + rol.sleutel, placeholder: 'Bijvoorbeeld: kijkt mee en dient bonnen in' });
    omschrijvingInvoer.value = rol.omschrijving;
    omschrijvingInvoer.addEventListener('input', function () { rol.omschrijving = omschrijvingInvoer.value; commissieNaWijziging_(); });
  }
  var groepen = commissieRechtenGroepen_().map(function (groep) {
    return el('fieldset', { class: 'rechtgroep' }, el('legend', null, groep.naam),
      groep.rechten.map(function (recht) {
        var tekst = COMMISSIE_RECHT_TEKSTEN[recht] || [recht, ''];
        var vinkje = el('input', { type: 'checkbox', 'data-recht': recht, 'data-fokus': 'recht-' + rol.sleutel + '-' + recht });
        vinkje.checked = vast || rol.rechten.indexOf(recht) >= 0;
        if (vast) vinkje.disabled = true;
        else vinkje.addEventListener('change', function () { commissieRechtWissel_(rol, recht, vinkje.checked); });
        return el('label', { class: 'recht' }, vinkje, el('span', { class: 'recht-tekst' }, el('span', { class: 'recht-naam' }, tekst[0]), tekst[1] ? el('span', { class: 'recht-uitleg' }, tekst[1]) : null));
      }));
  });
  var weg = commissieWegMelding_(rol);
  var wegKnop = null;
  if (!vast) {
    wegKnop = el('button', { type: 'button', class: 'knop knop-klein knop-gevaar', 'data-weg': rol.sleutel, onclick: function () { commissieRolWeghalen_(rol); } }, 'Rol verwijderen');
    if (weg !== '') wegKnop.disabled = true;
  }
  var details = el('details', { class: 'rol', 'data-rol': rol.sleutel },
    el('summary', null,
      el('span', { class: 'rol-kop' },
        el('span', { class: 'rol-naam' }, rol.naam),
        vast ? el('span', { class: 'label' }, 'Vast') : null,
        rol.nieuw ? el('span', { class: 'label label-geel' }, 'Nieuw') : null),
      el('span', { class: 'rol-uitleg', 'data-rol-uitleg': rol.sleutel }, rol.omschrijving || 'Nog geen uitleg.'),
      rechtenTekst),
    el('div', { class: 'rol-inhoud' },
      vast ? el('p', { class: 'rol-vast' }, 'De beheerder mag alles en dat kan niet worden aangepast. Zo kan de commissie nooit buitengesloten raken.')
           : commissieVeld_('Uitleg bij deze rol', omschrijvingInvoer, 'omschrijving-' + rol.sleutel),
      el('p', { class: 'veld-melding', 'data-melding': 'rol-' + rol.sleutel, role: 'alert' }),
      groepen,
      wegKnop ? el('div', { class: 'rol-weg' }, wegKnop, el('span', { class: 'rij-sub', 'data-weg-uitleg': rol.sleutel }, weg)) : null));
  if (commissie.open[rol.sleutel]) details.open = true;
  details.addEventListener('toggle', function () { commissie.open[rol.sleutel] = details.open; });
  return details;
}

function commissieNieuweRol_() {
  var nr = commissie.nieuwRol;
  var naam = el('input', { type: 'text', maxlength: 60, 'data-fokus': 'nieuwe-rol-naam', placeholder: 'Bijvoorbeeld Fotograaf' });
  naam.value = nr.naam;
  naam.addEventListener('input', function () { nr.naam = naam.value; if (nr.melding) { nr.melding = ''; commissieVerfris_(); } });
  var uitleg = el('input', { type: 'text', maxlength: 120, 'data-fokus': 'nieuwe-rol-uitleg', placeholder: 'Wat doet deze rol?' });
  uitleg.value = nr.omschrijving;
  uitleg.addEventListener('input', function () { nr.omschrijving = uitleg.value; });
  var formulier = el('form', { class: 'nieuwe-rol', novalidate: true, onsubmit: function (e) { e.preventDefault(); commissieRolToevoegen_(); } },
    el('h3', null, 'Nieuwe rol'),
    commissieVeld_('Naam van de rol', naam, 'nieuwe-rol'),
    commissieVeld_('Uitleg (waarvoor dient de rol?)', uitleg, 'nieuwe-rol-uitleg'),
    el('div', { class: 'knoppen' }, el('button', { type: 'submit', class: 'knop' }, '+ Rol toevoegen')),
    el('p', { class: 'rij-sub' }, 'Na het toevoegen vink je bij de rol aan wat de rol mag. Vergeet daarna niet op te slaan.'));
  return formulier;
}

function commissieTeken_(container, staat) {
  commissie.container = container;
  commissie.staat = staat;
  var kop = el('header', { class: 'paginakop' },
    el('div', null, el('h1', null, 'Commissie'), el('p', null, 'Wie mag wat. Iedereen logt in met het eigen Google-account; niemand deelt een wachtwoord.')),
    el('div', { class: 'knoppen' }, el('button', { type: 'button', class: 'knop knop-hoofd', 'data-fokus': 'lid-toevoegen', onclick: commissieLidToevoegen_ }, '+ Lid toevoegen')));
  var nieuweInfo = el('div', { class: 'strook strook-geel', role: 'status', 'data-nieuwe-info': '', hidden: !commissie.nieuweInfo },
    el('span', { class: 'strook-tekst' }, 'Er is nieuwe informatie; je wijzigingen zijn nog niet opgeslagen.'),
    el('button', { type: 'button', class: 'knop', onclick: commissieTerug_ }, 'Mijn wijzigingen weggooien'));
  var keuze = el('div', { class: 'strook strook-fout', role: 'alert', 'data-keuze': '', hidden: !(commissie.keuze && commissie.nieuweInfo) },
    el('span', { class: 'strook-tekst' }, 'Iemand anders heeft de commissie intussen gewijzigd. Jouw wijzigingen gaan over die van hen heen.'),
    el('div', { class: 'knoppen' },
      el('button', { type: 'button', class: 'knop', onclick: function () { commissieOpslaan_(true); } }, 'Toch opslaan'),
      el('button', { type: 'button', class: 'knop knop-hoofd', onclick: commissieTerug_ }, 'Eerst nieuwe stand bekijken')));
  var ledenKaart = el('section', { class: 'kaart commissie-kaart', 'aria-labelledby': 'commissie-leden-kop' },
    el('h2', { id: 'commissie-leden-kop', 'data-leden-kop': '' }, 'Leden'),
    el('p', { class: 'rij-sub' }, 'Een lid dat niet actief is, kan niet meer inloggen. Iemand die nooit meer meedoet, zet je dus gewoon uit.'),
    el('p', { class: 'veld-melding', 'data-melding': 'leden', role: 'alert' }),
    commissie.leden.length
      ? el('ul', { class: 'leden' }, commissie.leden.map(function (l) { return commissieLidRij_(l, staat); }))
      : el('p', { class: 'rij-sub' }, 'Er zijn nog geen leden.'),
    el('div', { class: 'knoppen' }, el('button', { type: 'button', class: 'knop', onclick: commissieLidToevoegen_ }, '+ Lid toevoegen')));
  var rollenKaart = el('section', { class: 'kaart commissie-kaart', 'aria-labelledby': 'commissie-rollen-kop' },
    el('h2', { id: 'commissie-rollen-kop' }, 'Rollen'),
    el('p', { class: 'rij-sub' }, 'Een rol bepaalt wat iemand mag. Heeft een lid meer rollen, dan mag het lid alles wat een van die rollen toestaat. Tik op een rol om te zien en aan te passen wat de rol mag.'),
    el('p', { class: 'veld-melding', 'data-melding': 'rollen', role: 'alert' }),
    el('div', { class: 'rollen' }, commissie.rollen.map(commissieRolKaart_)),
    commissieNieuweRol_());
  var balk = el('div', { class: 'opslaanbalk', 'data-balk': '' },
    el('p', { class: 'opslaan-status', 'data-status': '', role: 'status', 'aria-live': 'polite' }),
    el('div', { class: 'knoppen' },
      el('button', { type: 'button', class: 'knop', 'data-terug': '', onclick: commissieTerug_ }, 'Ongedaan maken'),
      el('button', { type: 'button', class: 'knop knop-hoofd', 'data-opslaan': '', onclick: function () { commissieOpslaan_(); } }, 'Opslaan')));
  container.replaceChildren(kop, nieuweInfo, keuze, ledenKaart, rollenKaart, balk);
  container.classList.add('commissie-scherm');
  commissieVerfris_();
}

// Tekent alles opnieuw (bij toevoegen of weghalen) en zet de focus terug waar hij stond (of op het gevraagde veld).
function commissieHertekenBehoudFocus_(focusOp) {
  if (!commissie.container || !commissie.staat) return;
  var actief = document.activeElement;
  var sleutel = focusOp || (actief && actief.getAttribute ? actief.getAttribute('data-fokus') : null);
  commissieTeken_(commissie.container, commissie.staat);
  if (sleutel) {
    var veld = commissie.container.querySelector('[data-fokus="' + CSS.escape(String(sleutel)) + '"]');
    if (veld && veld.focus) veld.focus();
  }
}

function commissieZet_(plek, tekst, fout) {
  if (!plek) return;
  plek.textContent = tekst || '';
  plek.hidden = !tekst;
  plek.classList.toggle('melding-fout', !!fout && !!tekst);
}

// Werkt de meldingen, tellers en de opslaanbalk bij zonder iets opnieuw te tekenen (typen blijft dus ongestoord).
function commissieVerfris_() {
  var c = commissie.container;
  if (!c || !commissie.leden) return;
  function vind(selector) { return c.querySelector(selector); }
  var controle = commissieControleer_();
  var tonen = commissie.toonFouten;
  commissie.leden.forEach(function (l) {
    var s = l.sleutel;
    var perLid = controle.perLid[s] || [];
    var mailPlek = vind('[data-melding="mail-' + s + '"]');   // alleen bij een nieuw lid; bij de anderen staat het adres vast
    var rijPlek = vind('[data-melding="rij-' + s + '"]');
    var rijTekst = commissie.rijMelding[s] || '';
    if (mailPlek) commissieZet_(mailPlek, tonen || commissie.aangeraakt[s] ? perLid.join(' ') : '', true);
    else if (!rijTekst) rijTekst = perLid.join(' ');
    commissieZet_(rijPlek, rijTekst, true);
    commissieZet_(vind('[data-melding="naam-' + s + '"]'), '', true);
    commissieZet_(vind('[data-zacht="' + s + '"]'), controle.zacht[s] || '', false);
    var niet = vind('[data-niet-actief="' + s + '"]');
    if (niet) niet.hidden = l.actief;
    var tekstPlek = vind('[data-actief-tekst="' + s + '"]');
    if (tekstPlek) tekstPlek.textContent = l.actief ? 'Actief' : 'Niet actief';
    var rij = vind('[data-lid="' + s + '"]');
    if (rij) rij.classList.toggle('lid-uit', !l.actief);
    var avatar = vind('[data-avatar="' + s + '"]');
    if (avatar) avatar.textContent = commissieInitiaal_(l);
  });
  var kop = vind('[data-leden-kop]');
  if (kop) kop.textContent = 'Leden (' + commissie.leden.length + ')';
  commissieZet_(vind('[data-melding="leden"]'), controle.leden.join(' '), true);
  commissieZet_(vind('[data-melding="rollen"]'), controle.rollen.join(' '), true);
  commissie.rollen.forEach(function (r) {
    var gebruikt = commissie.leden.filter(function (l) { return l.rollen.indexOf(r.naam) >= 0; }).length;
    var aantal = vind('[data-rol-aantal="' + r.sleutel + '"]');
    if (aantal) aantal.textContent = (r.naam === 'Beheerder' ? RECHTEN.length : r.rechten.filter(function (x) { return RECHTEN.indexOf(x) >= 0; }).length) + ' van ' + RECHTEN.length + ' rechten · ' + meervoud_(gebruikt, 'lid', 'leden');
    var uitleg = vind('[data-rol-uitleg="' + r.sleutel + '"]');
    if (uitleg) uitleg.textContent = r.omschrijving.trim() || 'Nog geen uitleg.';
    var rolMelding = vind('[data-melding="rol-' + r.sleutel + '"]');
    commissieZet_(rolMelding, (controle.perRol[r.sleutel] || []).join(' '), true);
    var weg = commissieWegMelding_(r);
    var wegKnop = vind('[data-weg="' + r.sleutel + '"]');
    if (wegKnop) wegKnop.disabled = weg !== '';
    var wegUitleg = vind('[data-weg-uitleg="' + r.sleutel + '"]');
    if (wegUitleg) wegUitleg.textContent = weg;
  });
  var nr = commissie.nieuwRol;
  var nrPlek = vind('[data-melding="nieuwe-rol"]');
  commissieZet_(nrPlek, nr.melding, true);
  var keuzeStrook = vind('[data-keuze]');
  if (keuzeStrook) keuzeStrook.hidden = !(commissie.keuze && commissie.nieuweInfo && commissieVuil_());
  var info = vind('[data-nieuwe-info]');
  if (info) info.hidden = !(commissie.nieuweInfo && commissieVuil_());
  // opslaanbalk
  var vuil = commissieVuil_();
  var status = vind('[data-status]');
  var opslaan = vind('[data-opslaan]'), terug = vind('[data-terug]'), balk = vind('[data-balk]');
  if (status) {
    status.replaceChildren();
    status.className = 'opslaan-status';
    if (commissie.bezig) status.appendChild(document.createTextNode('Opslaan…'));
    else if (commissie.fout) { status.className = 'opslaan-status opslaan-fout'; status.appendChild(document.createTextNode(commissie.fout)); }
    else if (vuil) status.appendChild(document.createTextNode(tonen && controle.aantal > 0 ? 'Er klopt nog iets niet. Kijk bij de rode meldingen.' : 'Je hebt wijzigingen die nog niet zijn opgeslagen.'));
    else if (commissie.klaar) { status.className = 'opslaan-status opslaan-klaar'; status.appendChild(maakIcoon('<path d="M5 12.5l4.5 4.5L19 7.5"/>')); status.appendChild(document.createTextNode('Opgeslagen')); }
    else status.appendChild(document.createTextNode('Alles is opgeslagen.'));
  }
  if (opslaan) { opslaan.disabled = commissie.bezig || !vuil; opslaan.textContent = commissie.bezig ? 'Opslaan…' : 'Opslaan'; }
  if (terug) terug.hidden = !vuil || commissie.bezig;
  if (balk) balk.classList.toggle('opslaanbalk-vuil', vuil || !!commissie.fout);
}

// ---- bij het scherm horen: tekenen, bijwerken, weggaan ----

function commissieIsVerse_(staat) { return commissie.leden && commissie.email === commissieMail_(staat.email); }

function commissieMomentopnameKlaar_(staat) { return !!staat.momentopname && Array.isArray(staat.momentopname.leden) && !!staat.momentopname.rollen; }

function commissieTekenScherm_(container, staat) {
  commissie.staat = staat;
  if (!commissieMomentopnameKlaar_(staat)) {
    container.replaceChildren(el('section', { class: 'kaart leeg' }, maakIcoon('wifi', 'pictogram groot'), el('h2', null, 'De commissie is nog niet opgehaald'), el('p', null, 'Probeer het zo nog eens.'),
      el('button', { type: 'button', class: 'knop knop-hoofd', onclick: function () { if (staat.herlees) staat.herlees(); } }, 'Opnieuw proberen')));
    return;
  }
  // een eigen concept (dat nog niet is opgeslagen) blijft staan; anders beginnen we bij wat er nu is
  var behouden = commissieIsVerse_(staat) && (commissieVuil_() || commissie.bezig || commissie.wachtOp);
  if (!behouden) commissieStart_(staat);
  commissieTeken_(container, staat);
}

function commissieBijwerken_(container, staat) {
  commissie.staat = staat;
  if (!commissieMomentopnameKlaar_(staat) || !commissieIsVerse_(staat) || !container.querySelector('[data-balk]')) {
    commissieTekenScherm_(container, staat);
    return;
  }
  commissie.container = container;
  if (commissie.wachtOp && beheerApp.bijgewerktOp !== commissie.wachtOp) commissie.wachtOp = 0;
  var stand = commissieOpgeslagen_(staat.momentopname);
  var verschil = stand.leden !== commissie.basisLeden || stand.rollen !== commissie.basisRollen;
  if (commissie.wachtOp || commissie.bezig) { commissieVerfris_(); return; } // we wachten op de lezing na het opslaan
  if (!verschil) { commissie.nieuweInfo = false; commissieVerfris_(); return; }
  if (commissieVuil_()) { commissie.nieuweInfo = true; commissieVerfris_(); return; } // nooit een concept overschrijven
  var actief = document.activeElement;
  if (actief && container.contains(actief) && bewerkbaar_(actief)) { commissieVerfris_(); return; } // iemand is aan het typen; de volgende keer
  commissieStart_(staat);
  commissieTeken_(container, staat);
}

registreerScherm({
  naam: 'commissie',
  titel: 'Commissie',
  recht: 'leden_beheren',
  icoon: 'commissie',
  teken: commissieTekenScherm_,
  bijwerken: commissieBijwerken_
});

// Weggaan met wijzigingen die niet zijn opgeslagen: eerst vragen. Menu-klikken vangen we vooraf af; de terugknop en een nieuw
// adres daarna (dan staat het concept nog in het geheugen en komt het terug als je "Annuleren" kiest).
function commissieWeggaanVragen_() {
  if (!commissieVuil_() || beheerApp.huidig !== 'commissie') return true;
  if (!window.confirm(COMMISSIE_MELDING_WEG)) return false;
  commissieVergeet_();
  return true;
}

document.addEventListener('click', function (e) {
  var knoop = e.target && e.target.closest ? e.target.closest('a.menu-punt, .zijmenu button, .bovenbalk button') : null;
  if (!knoop) return;
  var href = knoop.getAttribute('href');
  if (knoop.getAttribute('aria-label') === 'Vernieuwen' || (knoop.textContent || '').trim() === 'Vernieuwen') return; // gaat nergens heen
  if (href === '#commissie') return;
  if (!commissieWeggaanVragen_()) { e.preventDefault(); e.stopPropagation(); }
}, true);

window.addEventListener('hashchange', function () {
  if (!commissieVuil_() || hashDelen_().naam === 'commissie') return;
  if (window.confirm(COMMISSIE_MELDING_WEG)) { commissieVergeet_(); return; }
  location.hash = '#commissie';
});

window.addEventListener('beforeunload', function (e) {
  if (commissieVuil_()) { e.preventDefault(); e.returnValue = ''; }
});
