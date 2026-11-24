// Validatie van het verzoek van de site. Alleen function/var op het hoogste niveau.
// Geeft { ok: true, schoon } | { ok: false, fouten: [{ veld, melding }] } | { ok: false, code: 'GEWEIGERD' }.

var VALIDATIE_ACTIES = ['aanmelden', 'wijzigen', 'afmelden', 'linkOpnieuw'];

function valTekst_(w) {
  return (w === undefined || w === null) ? '' : String(w).trim();
}

function valIsObject_(w) {
  return w !== null && typeof w === 'object' && !Array.isArray(w);
}

function valHeeft_(w) {
  return w !== undefined && w !== null && w !== '';
}

function valFout_(fouten, veld, melding) {
  fouten.push({ veld: veld, melding: melding });
}

// Tekstveld: getrimd; verplicht of optioneel; maximale lengte.
function valTekstveld_(fouten, veld, waarde, verplicht, max, naam) {
  var t = valTekst_(waarde);
  if (verplicht && t === '') valFout_(fouten, veld, 'Vul ' + naam + ' in.');
  else if (t.length > max) valFout_(fouten, veld, naam.charAt(0).toUpperCase() + naam.slice(1) + ' mag maximaal ' + max + ' tekens bevatten.');
  return t;
}

function valBoolean_(w, standaard) {
  return typeof w === 'boolean' ? w : standaard;
}

function valStraat_(straat, straten) {
  var sleutel = valTekst_(straat).replace(/\s+/g, '').toLowerCase();
  if (sleutel === '') return null;
  for (var i = 0; i < straten.length; i++) {
    if (String(straten[i].naam).replace(/\s+/g, '').toLowerCase() === sleutel) return straten[i].naam;
  }
  return null;
}

// Bij Elders (andere straat): de getypte straat is verplicht, maximaal 100 tekens en mag geen straat uit de lijst zijn.
function valStraatElders_(fouten, waarde, straten) {
  var t = valTekstveld_(fouten, 'adres.straatElders', waarde, true, 100, 'de straat');
  if (t !== '' && t.length <= 100 && valStraat_(t, straten) !== null) {
    valFout_(fouten, 'adres.straatElders', 'Deze straat staat in de lijst. Kies hem daar in plaats van Elders.');
  }
  return t;
}

// Valideert straat en huisnummer (met eventuele aparte toevoeging). Geeft het schone adres terug.
// Bij Elders komt de getypte straat erbij als straatElders; bij een straat uit de lijst wordt straatElders genegeerd.
function valAdres_(fouten, adres, instellingen) {
  var a = valIsObject_(adres) ? adres : {};
  var elders = isElders(a.straat);
  var straat = elders ? STRAAT_ELDERS : valStraat_(a.straat, instellingen.straten);
  if (straat === null) valFout_(fouten, 'adres.straat', 'Kies een straat uit de lijst.');
  var straatElders = elders ? valStraatElders_(fouten, a.straatElders, instellingen.straten) : null;
  var nr = null;
  try {
    nr = normaliseerHuisnummer(a.huisnummer);
  } catch (e) {
    valFout_(fouten, 'adres.huisnummer', 'Vul een geldig huisnummer in, bijvoorbeeld 27 of 27a.');
    return null;
  }
  var apart = valTekst_(a.toevoeging);
  var toevoeging = nr.toevoeging;
  if (apart !== '') {
    if (toevoeging !== '' || !/^[A-Za-z]{1,2}$/.test(apart)) {
      valFout_(fouten, 'adres.huisnummer', 'Vul een geldig huisnummer in, bijvoorbeeld 27 of 27a.');
      return null;
    }
    toevoeging = apart.toUpperCase();
  }
  if (straat === null) return null;
  try {
    maakAdrescode(straat, nr.huisnummer, toevoeging, instellingen.straten);
  } catch (e2) {
    valFout_(fouten, 'adres.huisnummer', 'Vul een geldig huisnummer in, bijvoorbeeld 27 of 27a.');
    return null;
  }
  var schoon = { straat: straat, huisnummer: nr.huisnummer, toevoeging: toevoeging };
  if (elders) schoon.straatElders = straatElders;
  return schoon;
}

// Een geldig e-mailadres (getrimd en met kleine letters aangeleverd) van hooguit 100 tekens.
function valIsEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 100;
}

// Een plausibel telefoonnummer: alleen cijfers, spaties en + ( ) - . /, met 6 tot 15 cijfers.
function valIsTelefoon_(telefoon) {
  if (!/^[+()\d\s.\/-]+$/.test(telefoon)) return false;
  var cijfers = telefoon.replace(/\D/g, '').length;
  return cijfers >= 6 && cijfers <= 15;
}

function valContact_(fouten, contact) {
  var c = valIsObject_(contact) ? contact : {};
  var schoon = {
    voornaam: valTekstveld_(fouten, 'contact.voornaam', c.voornaam, true, 100, 'een voornaam'),
    achternaam: valTekstveld_(fouten, 'contact.achternaam', c.achternaam, false, 100, 'de achternaam'),
    email: '',
    telefoon: valTekstveld_(fouten, 'contact.telefoon', c.telefoon, false, 100, 'het telefoonnummer')
  };
  var email = valTekst_(c.email).toLowerCase();
  if (!valIsEmail_(email)) {
    valFout_(fouten, 'contact.email', 'Vul een geldig e-mailadres in.');
  } else {
    schoon.email = email;
  }
  return schoon;
}

// Geboortejaar of -maand als geheel getal; null = niet ingevuld; NaN = ongeldig.
function valGetal_(w) {
  if (!valHeeft_(w)) return null;
  var t = String(w).trim();
  if (!/^\d{1,4}$/.test(t)) return NaN;
  return parseInt(t, 10);
}

function valPersoon_(fouten, persoon, i, instellingen) {
  var p = valIsObject_(persoon) ? persoon : {};
  var pre = 'personen[' + i + '].';
  var schoon = { voornaam: valTekstveld_(fouten, pre + 'voornaam', p.voornaam, true, 100, 'een voornaam') };

  var jaar = valGetal_(p.geboortejaar);
  var maand = valGetal_(p.geboortemaand);
  var geboorteFout = (jaar !== null && isNaN(jaar)) || (maand !== null && isNaN(maand)) || ((jaar === null) !== (maand === null));
  if (!geboorteFout) {
    var test = {};
    if (jaar !== null) { test.geboortejaar = jaar; test.geboortemaand = maand; }
    try {
      bepaalGroep(test, instellingen);
    } catch (e) {
      geboorteFout = true;
    }
  }
  if (geboorteFout) {
    valFout_(fouten, pre + 'geboorte', 'Vul een geldige geboortemaand en -jaar in (beide, of beide leeg).');
  } else if (jaar !== null) {
    schoon.geboortejaar = jaar;
    schoon.geboortemaand = maand;
  }

  var dieet = [];
  if (p.dieet !== undefined && p.dieet !== null && !Array.isArray(p.dieet)) {
    valFout_(fouten, pre + 'dieet', 'Ongeldige dieetkeuze.');
  } else if (p.dieet && p.dieet.length > instellingen.dieetkeuzes.length) {
    valFout_(fouten, pre + 'dieet', 'Te veel dieetkeuzes.');
  } else {
    var lijst = p.dieet || [];
    for (var d = 0; d < lijst.length; d++) {
      var code = valTekst_(lijst[d]);
      var bekend = false;
      for (var k = 0; k < instellingen.dieetkeuzes.length; k++) {
        if (instellingen.dieetkeuzes[k].code === code) { bekend = true; break; }
      }
      if (!bekend) { valFout_(fouten, pre + 'dieet', 'Onbekende dieetkeuze: ' + code); break; }
      if (dieet.indexOf(code) < 0) dieet.push(code);
    }
  }
  schoon.dieet = dieet;
  schoon.dieetToelichting = valTekstveld_(fouten, pre + 'dieetToelichting', p.dieetToelichting, false, 300, 'de toelichting');
  schoon.eetMee = valBoolean_(p.eetMee, true);
  schoon.ehbo = valBoolean_(p.ehbo, false);
  return schoon;
}

function valPersonen_(fouten, personen, instellingen) {
  if (!Array.isArray(personen) || personen.length < 1 || personen.length > 12) {
    valFout_(fouten, 'personen', 'Meld 1 tot en met 12 personen aan.');
    return [];
  }
  var uit = [];
  for (var i = 0; i < personen.length; i++) uit.push(valPersoon_(fouten, personen[i], i, instellingen));
  return uit;
}

function valHulp_(fouten, hulp, instellingen) {
  var uit = [];
  if (hulp === undefined || hulp === null) return uit;
  if (!Array.isArray(hulp)) { valFout_(fouten, 'hulp', 'Ongeldige keuze bij hulp.'); return uit; }
  if (hulp.length > instellingen.hulpblokken.length) { valFout_(fouten, 'hulp', 'Te veel keuzes bij hulp.'); return uit; }
  for (var i = 0; i < hulp.length; i++) {
    var code = valTekst_(hulp[i]);
    var bekend = false;
    for (var k = 0; k < instellingen.hulpblokken.length; k++) {
      if (instellingen.hulpblokken[k].code === code) { bekend = true; break; }
    }
    if (!bekend) { valFout_(fouten, 'hulp', 'Onbekende keuze bij hulp: ' + code); return uit; }
    if (uit.indexOf(code) < 0) uit.push(code);
  }
  return uit;
}

function valSpullen_(fouten, spullen) {
  var uit = [];
  if (spullen === undefined || spullen === null) return uit;
  if (!Array.isArray(spullen) || spullen.length > 20) {
    valFout_(fouten, 'spullen', 'Je kunt maximaal 20 spullen opgeven.');
    return uit;
  }
  for (var i = 0; i < spullen.length; i++) {
    var s = valIsObject_(spullen[i]) ? spullen[i] : {};
    var pre = 'spullen[' + i + '].';
    var aantal = valHeeft_(s.aantal) ? String(s.aantal).trim() : '1';
    var n = /^\d{1,3}$/.test(aantal) ? parseInt(aantal, 10) : 0;
    if (n < 1 || n > 50) valFout_(fouten, pre + 'aantal', 'Het aantal moet tussen 1 en 50 liggen.');
    uit.push({
      wat: valTekstveld_(fouten, pre + 'wat', s.wat, true, 100, 'wat je meeneemt'),
      aantal: n,
      opmerking: valTekstveld_(fouten, pre + 'opmerking', s.opmerking, false, 300, 'de opmerking')
    });
  }
  return uit;
}

function valideerVerzoek(verzoek, instellingen) {
  if (!valIsObject_(verzoek)) {
    return { ok: false, fouten: [{ veld: 'verzoek', melding: 'Ongeldig verzoek.' }] };
  }
  if (valHeeft_(verzoek.website)) return { ok: false, code: 'GEWEIGERD' };

  var fouten = [];
  var actie = valHeeft_(verzoek.actie) ? verzoek.actie : 'aanmelden';
  if (VALIDATIE_ACTIES.indexOf(actie) === -1) {
    return { ok: false, fouten: [{ veld: 'actie', melding: 'Onbekende actie.' }] };
  }

  var token = '';
  if (actie === 'wijzigen' || actie === 'afmelden') {
    token = typeof verzoek.token === 'string' ? verzoek.token : '';
    if (!/^[0-9a-f]{64}$/.test(token)) valFout_(fouten, 'token', 'Ongeldige of ontbrekende link.');
  }

  var schoon;
  if (actie === 'afmelden') {
    schoon = { actie: actie, token: token };
  } else if (actie === 'linkOpnieuw') {
    schoon = { actie: actie, adres: valAdres_(fouten, verzoek.adres, instellingen) };
  } else {
    schoon = { actie: actie };
    if (actie === 'wijzigen') schoon.token = token;
    if (actie === 'aanmelden') schoon.tweedeHuishouden = valBoolean_(verzoek.tweedeHuishouden, false);
    schoon.adres = valAdres_(fouten, verzoek.adres, instellingen);
    schoon.contact = valContact_(fouten, verzoek.contact);
    schoon.personen = valPersonen_(fouten, verzoek.personen, instellingen);
    schoon.hulp = valHulp_(fouten, verzoek.hulp, instellingen);
    schoon.spullen = valSpullen_(fouten, verzoek.spullen);
    schoon.rekeninghouder = valTekstveld_(fouten, 'rekeninghouder', verzoek.rekeninghouder, false, 100, 'de naam van de rekeninghouder');
    var t = valIsObject_(verzoek.toestemming) ? verzoek.toestemming : {};
    schoon.toestemming = {
      bewaren: valBoolean_(t.bewaren, false),
      dieet: valBoolean_(t.dieet, false),
      activiteiten: valBoolean_(t.activiteiten, false)
    };
  }

  if (fouten.length > 0) return { ok: false, fouten: fouten };
  return { ok: true, schoon: schoon };
}
