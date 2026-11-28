// Instellingen per sectie voor de beheerpagina (fase 4a). Puur; draait in de browser, in Apps Script en in Node.
// Alleen function/var op het hoogste niveau. Namen beginnen met instv / INSTV_.
// Een sectie is een stuk van de instellingen dat de commissie in een keer opslaat. De inhoud van een sectie ("inhoud") is een gewoon JSON-object:
//   editie:     { naam, kop, datum, locatie, contactEmail, type, open, sluit, opgaveCateraar, uiterste }
//   bedragen:   { groepen: [{ naam, van, tm, prijs, eetMee, cateraar, geboortemaandVragen }], nietMeeEtenGratis, zoektekst, herinnerNaDagen, maxHerinneringen, beginsaldo }
//   betaallinks:{ links: [{ bedrag, url, geldigTot }] }
//   straten:    { straten: [{ naam, afkorting, kleur }] }
//   dieet:      { keuzes: [{ code, naam, opLijstCateraar }] }
//   hulp:       { blokken: [{ code, naam }], spullen: [naam] }
//   mail:       { teksten: [{ sleutel, onderwerp, tekst }] }
//   slot:       { opSlot }
//   technisch:  { testModus, bonnen, verslagen }
// Bedragen zijn in euro's (getal, of tekst zoals '12,50' zolang er getypt wordt); instvPas zet ze om. beginsaldo staat in euro's, de Sheet ook.
// instvControleer geeft meldingen met het veld (pad) waar ze bij horen; de pagina en het achterwerk gebruiken dezelfde controle.

var INSTV_SECTIES = [
  { naam: 'editie', titel: 'Editie en datums', uitleg: 'Naam, datum, aanmelden open en dicht' },
  { naam: 'bedragen', titel: 'Bedragen', uitleg: 'Prijs per leeftijdsgroep, korting, betalen' },
  { naam: 'betaallinks', titel: 'Betaallinks', uitleg: 'Bedrag en link om te betalen' },
  { naam: 'straten', titel: 'Straten', uitleg: 'Welke straten bij de wijk horen' },
  { naam: 'hulp', titel: 'Hulp en spullen', uitleg: 'Hulpblokken en spullen om te lenen' },
  { naam: 'dieet', titel: 'Dieetkeuzes', uitleg: 'Wat buren kunnen aanvinken' },
  { naam: 'mail', titel: 'Mailteksten', uitleg: 'Bevestiging, herinnering, uitnodiging' },
  { naam: 'slot', titel: 'Editie op slot', uitleg: 'Na de kascontrole' },
  { naam: 'technisch', titel: 'Technisch', uitleg: 'Testmodus en mappen' }
];

// Welke tabbladen een sectie raakt (en alleen die worden geschreven).
var INSTV_TABBLADEN = {
  editie: ['Instellingen'], bedragen: ['Instellingen', 'Leeftijdsgroepen'], betaallinks: ['Betaallinks'], straten: ['Straten'],
  hulp: ['Hulpblokken', 'Spullenlijst'], dieet: ['Dieetkeuzes'], mail: ['Mailteksten'], slot: ['Instellingen'], technisch: ['Instellingen']
};

// De sleutels in het tabblad Instellingen die een sectie beheert.
var INSTV_SLEUTELS = {
  editie: ['evenement.naam', 'evenement.kop', 'evenement.datum', 'evenement.locatie', 'evenement.contact_email', 'evenement.type',
    'datums.open', 'datums.sluit', 'datums.opgave_cateraar', 'datums.uiterste'],
  bedragen: ['evenement.niet_mee_eten_gratis', 'betalen.zoektekst', 'betalen.herinner_na_dagen', 'betalen.max_herinneringen', 'kas.beginsaldo'],
  slot: ['editie.op_slot'],
  technisch: ['evenement.test_modus', 'mappen.bonnen', 'mappen.verslagen']
};

var INSTV_CATERAAR = ['geen', 'kind', 'volwassen'];

// Plaatshouders die een mail kent (zie maakMail in sjabloon.js), met uitleg voor de chips.
var INSTV_PLAATSHOUDERS = {
  voornaam: 'Voornaam van de aanmelder',
  evenement: 'Naam van het feest',
  datum: 'Datum van het feest',
  overzicht: 'Wie er meedoen, bijvoorbeeld "2 × Kind 5-12"',
  bedrag: 'Totaalbedrag',
  betaalregel: 'Zin over betalen, met de betaallink',
  wijziglink: 'Persoonlijke link om de aanmelding te wijzigen',
  uitnodigingslink: 'Persoonlijke link naar het vooraf ingevulde formulier',
  contact: 'Mailadres van de commissie',
  opent: 'Datum waarop aanmelden opent',
  sluit: 'Datum waarop aanmelden sluit'
};

var INSTV_PLAATSHOUDERS_PER_MAIL = {
  bevestiging: ['voornaam', 'evenement', 'datum', 'overzicht', 'bedrag', 'betaalregel', 'wijziglink', 'contact'],
  wijziging: ['voornaam', 'evenement', 'datum', 'overzicht', 'bedrag', 'betaalregel', 'wijziglink', 'contact'],
  afmelding: ['voornaam', 'evenement', 'datum', 'overzicht', 'bedrag', 'contact'],
  link_opnieuw: ['voornaam', 'evenement', 'datum', 'wijziglink', 'contact'],
  herinnering: ['voornaam', 'evenement', 'datum', 'overzicht', 'bedrag', 'betaalregel', 'wijziglink', 'contact'],
  uitnodiging: ['voornaam', 'evenement', 'datum', 'opent', 'sluit', 'uitnodigingslink', 'contact'],
  betaallink: ['voornaam', 'evenement', 'datum', 'overzicht', 'bedrag', 'betaalregel', 'wijziglink', 'contact']
};

// Namen en uitleg van de mails, in gewone woorden.
var INSTV_MAILNAMEN = {
  bevestiging: ['Bevestiging', 'Direct na een aanmelding.'],
  wijziging: ['Wijziging', 'Na het wijzigen van een aanmelding.'],
  afmelding: ['Afmelding', 'Na een afmelding.'],
  link_opnieuw: ['Link opnieuw', 'Als iemand zijn persoonlijke link kwijt is.'],
  herinnering: ['Herinnering', 'Voor wie nog niet betaalde.'],
  uitnodiging: ['Uitnodiging', 'Aan buren die eerder meededen.'],
  betaallink: ['Betaallink', 'Met de link om te betalen.']
};

// De plaatshouders die in deze mail beschikbaar zijn (de chips). Onbekende mails krijgen de algemene.
function instvPlaatshouders(sleutel) {
  return Object.prototype.hasOwnProperty.call(INSTV_PLAATSHOUDERS_PER_MAIL, sleutel)
    ? INSTV_PLAATSHOUDERS_PER_MAIL[sleutel].slice()
    : ['voornaam', 'evenement', 'datum', 'contact'];
}

// Voorbeeldwaarden voor de voorbeeldweergave van een mailtekst (platte tekst).
function instvVoorbeeldWaarden() {
  return {
    voornaam: 'Sanne', evenement: 'Burendag Westvaartpark', datum: 'zaterdag 18 september 2027', overzicht: '2 × Jongere en volwassene, 1 × Kind 5-12',
    bedrag: '€ 44,00', betaalregel: 'Betaal je bijdrage via deze betaallink.', wijziglink: 'https://voorbeeld.test/aanmelden?token=voorbeeld',
    uitnodigingslink: 'https://voorbeeld.test/aanmelden?uitnodiging=voorbeeld', contact: 'commissie@voorbeeld.test',
    opent: 'dinsdag 15 juni 2027', sluit: 'dinsdag 7 september 2027'
  };
}

// ---- kleine hulpfuncties ----

function instvTekst_(w) { return w === undefined || w === null ? '' : String(w).trim(); }
function instvLeeg_(w) { return w === undefined || w === null || (typeof w === 'string' && w.trim() === ''); }

// Bedrag in euro's: een getal of tekst als '12,50' / '12.5' / '1.234,50'. Geeft een getal (hooguit twee decimalen, niet negatief) of null.
function instvEuro(w) {
  if (typeof w === 'number') {
    if (!isFinite(w) || w < 0) return null;
    return Math.abs(w * 100 - Math.round(w * 100)) < 1e-6 ? Math.round(w * 100) / 100 : null;
  }
  if (typeof w !== 'string') return null;
  var t = w.trim().replace(/^€\s*/, '').replace(/\s+/g, '');
  if (t === '') return null;
  if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

// Een geheel getal (getal of tekst met cijfers) of null.
function instvGeheel(w) {
  if (typeof w === 'number') return isFinite(w) && Math.floor(w) === w ? w : null;
  if (typeof w !== 'string' || !/^\s*\d+\s*$/.test(w)) return null;
  return Number(w.trim());
}

function instvIsDatum(w) {
  if (typeof w !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(w)) return false;
  var d = new Date(w + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === w;
}

function instvIsMail(w) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(w); }

// Is dit een https-link? Een host zonder spaties is genoeg; we openen hem niet.
function instvIsHttps(w) { return /^https:\/\/[^\s\/?#]+\.[^\s\/?#]+(?:[\/?#]\S*)?$/i.test(w); }

function instvKopie_(x) { return JSON.parse(JSON.stringify(x)); }

function instvDubbel_(namen) {
  var gezien = {}; var dubbel = [];
  namen.forEach(function (n) {
    var k = String(n).toLowerCase();
    if (k !== '' && gezien[k] && dubbel.indexOf(n) < 0) dubbel.push(n);
    gezien[k] = true;
  });
  return dubbel;
}

// ---- lezen en toepassen ----

// De inhoud van een sectie uit een (geparste) instellingen. Geeft een nieuw object.
function instvLees(sectie, inst) {
  var e = inst.evenement, d = inst.datums;
  if (sectie === 'editie') {
    return { naam: e.naam, kop: e.kop, datum: e.datum, locatie: e.locatie, contactEmail: e.contactEmail, type: e.type,
      open: d.open, sluit: d.sluit, opgaveCateraar: d.opgaveCateraar, uiterste: d.uiterste };
  }
  if (sectie === 'bedragen') {
    return {
      groepen: inst.leeftijdsgroepen.map(function (g) {
        return { naam: g.naam, van: g.van, tm: g.tm, prijs: g.prijs, eetMee: g.eetMee, cateraar: g.cateraar, geboortemaandVragen: g.geboortemaandVragen };
      }),
      nietMeeEtenGratis: e.nietMeeEtenGratis, zoektekst: inst.betalen.zoektekst, herinnerNaDagen: inst.betalen.herinnerNaDagen,
      maxHerinneringen: inst.betalen.maxHerinneringen,
      beginsaldo: typeof inst.kas.beginsaldoCenten === 'number' ? inst.kas.beginsaldoCenten / 100 : inst.kas.beginsaldoCenten
    };
  }
  if (sectie === 'betaallinks') return { links: inst.betaallinks.map(function (b) { return { bedrag: b.bedrag, url: b.url, geldigTot: b.geldigTot }; }) };
  if (sectie === 'straten') return { straten: inst.straten.map(function (s) { return { naam: s.naam, afkorting: s.afkorting, kleur: s.kleur }; }) };
  if (sectie === 'dieet') return { keuzes: inst.dieetkeuzes.map(function (k) { return { code: k.code, naam: k.naam, opLijstCateraar: k.opLijstCateraar }; }) };
  if (sectie === 'hulp') return { blokken: inst.hulpblokken.map(function (h) { return { code: h.code, naam: h.naam }; }), spullen: inst.spullen.slice() };
  if (sectie === 'mail') {
    return { teksten: Object.keys(inst.mailteksten).map(function (k) { return { sleutel: k, onderwerp: inst.mailteksten[k].onderwerp, tekst: inst.mailteksten[k].tekst }; }) };
  }
  if (sectie === 'slot') return { opSlot: inst.editie.opSlot !== false }; // alles behalve een duidelijk 'nee' telt als op slot
  if (sectie === 'technisch') return { testModus: e.testModus, bonnen: inst.mappen.bonnen, verslagen: inst.mappen.verslagen };
  return null;
}

// Alle secties in een keer: { editie: {...}, bedragen: {...}, ... }.
function instvLeesAlles(inst) {
  var uit = {};
  INSTV_SECTIES.forEach(function (s) { uit[s.naam] = instvLees(s.naam, inst); });
  return uit;
}

function instvGetalOfRuw_(w) { var g = instvGeheel(w); return g === null ? w : g; }

// Zet de inhoud van een sectie in een kopie van de instellingen. Controleer eerst met instvControleer; ongeldige waarden blijven hier
// ongewijzigd staan (zoals parseInstellingen doet), zodat valideerInstellingen ze ook meldt.
function instvPas(sectie, inhoud, inst) {
  var uit = instvKopie_(inst);
  var i = inhoud;
  if (sectie === 'editie') {
    uit.evenement.naam = instvTekst_(i.naam); uit.evenement.kop = instvTekst_(i.kop); uit.evenement.datum = instvTekst_(i.datum);
    uit.evenement.locatie = instvTekst_(i.locatie); uit.evenement.contactEmail = instvTekst_(i.contactEmail); uit.evenement.type = instvTekst_(i.type);
    uit.datums.open = instvTekst_(i.open); uit.datums.sluit = instvTekst_(i.sluit);
    uit.datums.opgaveCateraar = instvTekst_(i.opgaveCateraar); uit.datums.uiterste = instvTekst_(i.uiterste);
  } else if (sectie === 'bedragen') {
    uit.leeftijdsgroepen = i.groepen.map(function (g) {
      var prijs = instvEuro(g.prijs);
      return { naam: instvTekst_(g.naam), van: instvGetalOfRuw_(g.van), tm: instvLeeg_(g.tm) ? null : instvGetalOfRuw_(g.tm), prijs: prijs === null ? g.prijs : prijs,
        eetMee: g.eetMee === true, cateraar: instvTekst_(g.cateraar), geboortemaandVragen: g.geboortemaandVragen === true };
    });
    uit.evenement.nietMeeEtenGratis = i.nietMeeEtenGratis === true;
    uit.betalen.zoektekst = instvTekst_(i.zoektekst);
    uit.betalen.herinnerNaDagen = instvGetalOfRuw_(i.herinnerNaDagen);
    uit.betalen.maxHerinneringen = instvGetalOfRuw_(i.maxHerinneringen);
    var saldo = instvEuro(i.beginsaldo);
    uit.kas.beginsaldoCenten = saldo === null ? i.beginsaldo : Math.round(saldo * 100);
  } else if (sectie === 'betaallinks') {
    uit.betaallinks = i.links.map(function (b) {
      var bedrag = instvEuro(b.bedrag);
      return { bedrag: bedrag === null ? b.bedrag : bedrag, url: instvTekst_(b.url), geldigTot: instvTekst_(b.geldigTot) };
    });
  } else if (sectie === 'straten') {
    uit.straten = i.straten.map(function (s) { return { naam: instvTekst_(s.naam), afkorting: instvTekst_(s.afkorting), kleur: instvTekst_(s.kleur) }; });
  } else if (sectie === 'dieet') {
    uit.dieetkeuzes = i.keuzes.map(function (k) { return { code: instvTekst_(k.code), naam: instvTekst_(k.naam), opLijstCateraar: k.opLijstCateraar === true }; });
  } else if (sectie === 'hulp') {
    uit.hulpblokken = i.blokken.map(function (h) { return { code: instvTekst_(h.code), naam: instvTekst_(h.naam) }; });
    uit.spullen = i.spullen.map(instvTekst_);
  } else if (sectie === 'mail') {
    i.teksten.forEach(function (t) {
      // regeleinden in de tekst zijn bedoeld: niet trimmen
      uit.mailteksten[t.sleutel] = { onderwerp: String(t.onderwerp === undefined || t.onderwerp === null ? '' : t.onderwerp), tekst: String(t.tekst === undefined || t.tekst === null ? '' : t.tekst) };
    });
  } else if (sectie === 'slot') {
    uit.editie.opSlot = i.opSlot === true;
  } else if (sectie === 'technisch') {
    uit.evenement.testModus = i.testModus === true; uit.mappen.bonnen = instvTekst_(i.bonnen); uit.mappen.verslagen = instvTekst_(i.verslagen);
  }
  return uit;
}

// ---- controle ----

function instvM_(uit, pad, melding) { uit.push({ pad: pad, melding: melding }); }

function instvControleerEditie_(i, uit) {
  var naam = instvTekst_(i.naam);
  if (naam === '') instvM_(uit, 'naam', 'Vul de naam van het feest in.');
  else if (naam.length > 120) instvM_(uit, 'naam', 'Dit is te lang (hoogstens 120 tekens).');
  if (instvTekst_(i.kop).length > 200) instvM_(uit, 'kop', 'Dit is te lang (hoogstens 200 tekens).');
  if (instvTekst_(i.locatie).length > 120) instvM_(uit, 'locatie', 'Dit is te lang (hoogstens 120 tekens).');
  if (instvTekst_(i.type).length > 30) instvM_(uit, 'type', 'Dit is te lang (hoogstens 30 tekens).');
  var mail = instvTekst_(i.contactEmail);
  if (mail === '') instvM_(uit, 'contactEmail', 'Vul het mailadres van de commissie in.');
  else if (!instvIsMail(mail)) instvM_(uit, 'contactEmail', 'Dit is geen geldig mailadres.');
  var velden = [['datum', 'de datum van het feest'], ['open', 'de datum waarop aanmelden opent'], ['sluit', 'de datum waarop aanmelden sluit'],
    ['opgaveCateraar', 'de datum van de opgave aan de cateraar'], ['uiterste', 'de uiterste betaaldatum']];
  var geldig = true;
  velden.forEach(function (v) {
    if (!instvIsDatum(instvTekst_(i[v[0]]))) { instvM_(uit, v[0], 'Vul ' + v[1] + ' in.'); geldig = false; }
  });
  if (!geldig) return;
  var d = { open: instvTekst_(i.open), sluit: instvTekst_(i.sluit), cat: instvTekst_(i.opgaveCateraar), uiterste: instvTekst_(i.uiterste), feest: instvTekst_(i.datum) };
  if (!(d.open < d.sluit)) instvM_(uit, 'sluit', 'Aanmelden moet na de opening sluiten.');
  if (!(d.sluit <= d.cat)) instvM_(uit, 'opgaveCateraar', 'De opgave aan de cateraar kan niet voor het sluiten van het aanmelden zijn.');
  if (!(d.cat <= d.uiterste)) instvM_(uit, 'uiterste', 'De uiterste betaaldatum kan niet voor de opgave aan de cateraar zijn.');
  if (!(d.uiterste <= d.feest)) instvM_(uit, 'datum', 'Het feest moet op of na de uiterste betaaldatum zijn.');
}

function instvControleerGroepen_(groepen, uit) {
  if (groepen.length === 0) { instvM_(uit, 'groepen', 'Er moet minstens een leeftijdsgroep zijn.'); return; }
  var ok = true;
  groepen.forEach(function (g, n) {
    var p = 'groepen.' + n + '.';
    var naam = instvTekst_(g.naam);
    if (naam === '') { instvM_(uit, p + 'naam', 'Vul een naam in.'); ok = false; }
    else if (naam.length > 60) { instvM_(uit, p + 'naam', 'Dit is te lang (hoogstens 60 tekens).'); ok = false; }
    if (instvGeheel(g.van) === null) { instvM_(uit, p + 'van', 'Vul een hele leeftijd in.'); ok = false; }
    if (!instvLeeg_(g.tm) && instvGeheel(g.tm) === null) { instvM_(uit, p + 'tm', 'Vul een hele leeftijd in, of laat leeg voor "en ouder".'); ok = false; }
    else if (!instvLeeg_(g.tm) && instvGeheel(g.van) !== null && instvGeheel(g.tm) < instvGeheel(g.van)) { instvM_(uit, p + 'tm', 'De bovengrens kan niet lager zijn dan de ondergrens.'); ok = false; }
    if (instvEuro(g.prijs) === null) { instvM_(uit, p + 'prijs', 'Vul een bedrag in euro\'s in, bijvoorbeeld 8,50.'); ok = false; }
    if (INSTV_CATERAAR.indexOf(g.cateraar) < 0) { instvM_(uit, p + 'cateraar', 'Kies geen, kind of volwassen.'); ok = false; }
  });
  instvDubbel_(groepen.map(function (g) { return instvTekst_(g.naam); })).forEach(function (naam) {
    groepen.forEach(function (g, n) { if (instvTekst_(g.naam).toLowerCase() === naam.toLowerCase()) instvM_(uit, 'groepen.' + n + '.naam', 'Deze naam staat er al.'); });
    ok = false;
  });
  if (!ok) return;
  var rijen = groepen.map(function (g, n) { return { n: n, naam: instvTekst_(g.naam), van: instvGeheel(g.van), tm: instvLeeg_(g.tm) ? null : instvGeheel(g.tm) }; });
  rijen.sort(function (a, b) { return a.van - b.van; });
  if (rijen[0].van !== 0) instvM_(uit, 'groepen.' + rijen[0].n + '.van', 'De eerste leeftijdsgroep moet bij 0 beginnen.');
  for (var k = 0; k < rijen.length - 1; k++) {
    if (rijen[k].tm === null) instvM_(uit, 'groepen.' + rijen[k].n + '.tm', 'Alleen de oudste groep mag zonder bovengrens zijn.');
    else if (rijen[k + 1].van <= rijen[k].tm) instvM_(uit, 'groepen.' + rijen[k + 1].n + '.van', 'Deze groep overlapt met ' + rijen[k].naam + '.');
    else if (rijen[k + 1].van > rijen[k].tm + 1) instvM_(uit, 'groepen.' + rijen[k + 1].n + '.van', 'Tussen ' + rijen[k].naam + ' en ' + rijen[k + 1].naam + ' zit een gat in de leeftijden.');
  }
  var laatste = rijen[rijen.length - 1];
  if (laatste.tm !== null) instvM_(uit, 'groepen.' + laatste.n + '.tm', 'De oudste groep moet zonder bovengrens zijn, zodat iedereen erin past.');
}

function instvControleerBedragen_(i, uit) {
  instvControleerGroepen_(Array.isArray(i.groepen) ? i.groepen : [], uit);
  if (instvTekst_(i.zoektekst) === '') instvM_(uit, 'zoektekst', 'Vul de zoektekst in; daarmee herkennen we betalingen op de bank.');
  else if (instvTekst_(i.zoektekst).length > 60) instvM_(uit, 'zoektekst', 'Dit is te lang (hoogstens 60 tekens).');
  var h = instvGeheel(i.herinnerNaDagen);
  if (h === null || h < 1 || h > 365) instvM_(uit, 'herinnerNaDagen', 'Vul een aantal dagen in van 1 tot 365.');
  var m = instvGeheel(i.maxHerinneringen);
  if (m === null || m > 20) instvM_(uit, 'maxHerinneringen', 'Vul een aantal in van 0 tot 20.');
  if (instvEuro(i.beginsaldo) === null) instvM_(uit, 'beginsaldo', 'Vul een bedrag in euro\'s in (0 of meer), bijvoorbeeld 125,50.');
}

function instvControleerLinks_(links, uit) {
  var gezien = {};
  links.forEach(function (b, n) {
    var p = 'links.' + n + '.';
    var bedrag = instvEuro(b.bedrag);
    if (bedrag === null) instvM_(uit, p + 'bedrag', 'Vul een bedrag in euro\'s in, bijvoorbeeld 18 of 8,50.');
    var url = instvTekst_(b.url);
    // een rij zonder link mag: de link volgt later
    if (url !== '' && !instvIsHttps(url)) instvM_(uit, p + 'url', 'Een betaallink moet met https:// beginnen.');
    var tot = instvTekst_(b.geldigTot);
    if (tot !== '' && !instvIsDatum(tot)) instvM_(uit, p + 'geldigTot', 'Vul een datum in, of laat leeg.');
    if (bedrag !== null) {
      var sleutel = bedrag + '|' + tot;
      if (gezien[sleutel]) instvM_(uit, p + 'bedrag', 'Dit bedrag staat er al met dezelfde datum.');
      gezien[sleutel] = true;
    }
  });
}

function instvControleerStraten_(straten, uit) {
  if (straten.length === 0) instvM_(uit, 'straten', 'Er moet minstens een straat zijn.');
  straten.forEach(function (s, n) {
    var p = 'straten.' + n + '.';
    var naam = instvTekst_(s.naam), afk = instvTekst_(s.afkorting), kleur = instvTekst_(s.kleur);
    if (naam === '') instvM_(uit, p + 'naam', 'Vul een straatnaam in.');
    else if (naam.length > 60) instvM_(uit, p + 'naam', 'Dit is te lang (hoogstens 60 tekens).');
    else if (naam.replace(/\s+/g, '').toLowerCase() === 'elders') instvM_(uit, p + 'naam', 'Elders is gereserveerd voor de vaste keuze "Elders (andere straat)".');
    if (!/^[A-Za-z]{3}$/.test(afk)) instvM_(uit, p + 'afkorting', 'Een afkorting bestaat uit precies drie letters.');
    else if (afk.toUpperCase() === 'ELD') instvM_(uit, p + 'afkorting', 'ELD is gereserveerd voor "Elders (andere straat)". Kies een andere afkorting.');
    if (kleur !== '' && !/^#[0-9a-fA-F]{6}$/.test(kleur)) instvM_(uit, p + 'kleur', 'Een kleur is een code zoals #e07a5f.');
  });
  [['naam', 'Deze straatnaam staat er al.'], ['afkorting', 'Deze afkorting staat er al.']].forEach(function (v) {
    instvDubbel_(straten.map(function (s) { return instvTekst_(s[v[0]]); })).forEach(function (w) {
      straten.forEach(function (s, n) { if (instvTekst_(s[v[0]]).toLowerCase() === w.toLowerCase()) instvM_(uit, 'straten.' + n + '.' + v[0], v[1]); });
    });
  });
}

function instvControleerCodes_(rijen, lijstNaam, uit) {
  rijen.forEach(function (r, n) {
    var p = lijstNaam + '.' + n + '.';
    var code = instvTekst_(r.code), naam = instvTekst_(r.naam);
    if (code === '') instvM_(uit, p + 'code', 'Vul een code in.');
    else if (!/^[A-Za-z0-9_\-]{1,30}$/.test(code)) instvM_(uit, p + 'code', 'Een code bestaat uit letters, cijfers, - en _ (hoogstens 30).');
    if (naam === '') instvM_(uit, p + 'naam', 'Vul een naam in.');
    else if (naam.length > 60) instvM_(uit, p + 'naam', 'Dit is te lang (hoogstens 60 tekens).');
  });
  instvDubbel_(rijen.map(function (r) { return instvTekst_(r.code); })).forEach(function (w) {
    rijen.forEach(function (r, n) { if (instvTekst_(r.code).toLowerCase() === w.toLowerCase()) instvM_(uit, lijstNaam + '.' + n + '.code', 'Deze code staat er al.'); });
  });
}

function instvControleerHulp_(i, uit) {
  instvControleerCodes_(i.blokken, 'blokken', uit);
  i.spullen.forEach(function (s, n) {
    var t = instvTekst_(s);
    if (t === '') instvM_(uit, 'spullen.' + n, 'Vul een naam in.');
    else if (t.length > 60) instvM_(uit, 'spullen.' + n, 'Dit is te lang (hoogstens 60 tekens).');
  });
  instvDubbel_(i.spullen.map(instvTekst_)).forEach(function (w) {
    i.spullen.forEach(function (s, n) { if (instvTekst_(s).toLowerCase() === w.toLowerCase()) instvM_(uit, 'spullen.' + n, 'Dit staat er al.'); });
  });
}

// Plaatshouders die in een tekst staan, in volgorde van voorkomen. onjuist: {{ of }} die niet bij een plaatshouder hoort.
function instvPlaatshoudersIn(tekst) {
  var gevonden = [];
  var rest = String(tekst).replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, function (_, naam) { if (gevonden.indexOf(naam) < 0) gevonden.push(naam); return ''; });
  return { namen: gevonden, onjuist: /\{\{|\}\}/.test(rest) };
}

function instvControleerMail_(teksten, uit) {
  teksten.forEach(function (t, n) {
    var p = 'teksten.' + n + '.';
    var onderwerp = String(t.onderwerp === undefined || t.onderwerp === null ? '' : t.onderwerp);
    var tekst = String(t.tekst === undefined || t.tekst === null ? '' : t.tekst);
    if (onderwerp.trim() === '') instvM_(uit, p + 'onderwerp', 'Vul een onderwerp in.');
    else if (/[\r\n]/.test(onderwerp)) instvM_(uit, p + 'onderwerp', 'Het onderwerp is een regel.');
    else if (onderwerp.length > 200) instvM_(uit, p + 'onderwerp', 'Dit is te lang (hoogstens 200 tekens).');
    if (tekst.trim() === '') instvM_(uit, p + 'tekst', 'Vul de tekst van de mail in.');
    else if (tekst.length > 5000) instvM_(uit, p + 'tekst', 'Dit is te lang (hoogstens 5000 tekens).');
    [['onderwerp', onderwerp], ['tekst', tekst]].forEach(function (v) {
      var gevonden = instvPlaatshoudersIn(v[1]);
      if (gevonden.onjuist) instvM_(uit, p + v[0], 'Een plaatshouder is niet goed geschreven. Gebruik {{naam}}, met twee accolades aan elke kant.');
      gevonden.namen.forEach(function (naam) {
        if (!Object.prototype.hasOwnProperty.call(INSTV_PLAATSHOUDERS, naam)) instvM_(uit, p + v[0], 'Onbekende plaatshouder {{' + naam + '}}. Kies er een uit de lijst.');
      });
    });
  });
}

// Meldingen [{ pad, melding }] over de inhoud van een sectie; leeg als alles klopt. Controleert ook de vorm.
function instvControleer(sectie, inhoud) {
  // Nooit een fout naar buiten: de inhoud komt van buiten (de opdracht) en kan van alles bevatten.
  try { return instvControleer_(sectie, inhoud); } catch (e) { return [{ pad: '', melding: 'De gegevens van deze sectie kloppen niet.' }]; }
}

function instvIsRij_(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

function instvControleer_(sectie, inhoud) {
  var uit = [];
  if (inhoud === null || typeof inhoud !== 'object' || Array.isArray(inhoud)) return [{ pad: '', melding: 'De gegevens van deze sectie ontbreken.' }];
  var lijsten = { bedragen: 'groepen', betaallinks: 'links', straten: 'straten', dieet: 'keuzes', mail: 'teksten' };
  if (Object.prototype.hasOwnProperty.call(lijsten, sectie) && !Array.isArray(inhoud[lijsten[sectie]])) return [{ pad: '', melding: 'De gegevens van deze sectie kloppen niet.' }];
  if (sectie === 'hulp' && (!Array.isArray(inhoud.blokken) || !Array.isArray(inhoud.spullen))) return [{ pad: '', melding: 'De gegevens van deze sectie kloppen niet.' }];
  // elke rij in een lijst is een gewone rij met velden (bij spullen: een tekst); anders weigeren we de hele sectie
  var rijLijst = Object.prototype.hasOwnProperty.call(lijsten, sectie) ? inhoud[lijsten[sectie]] : (sectie === 'hulp' ? inhoud.blokken : []);
  if (!rijLijst.every(instvIsRij_)) return [{ pad: '', melding: 'De gegevens van deze sectie kloppen niet: een rij in de lijst is geen rij.' }];
  if (sectie === 'hulp' && !inhoud.spullen.every(function (x) { return typeof x === 'string'; })) return [{ pad: '', melding: 'De gegevens van deze sectie kloppen niet: een spullen-regel is geen tekst.' }];
  if (sectie === 'editie') instvControleerEditie_(inhoud, uit);
  else if (sectie === 'bedragen') instvControleerBedragen_(inhoud, uit);
  else if (sectie === 'betaallinks') instvControleerLinks_(inhoud.links, uit);
  else if (sectie === 'straten') instvControleerStraten_(inhoud.straten, uit);
  else if (sectie === 'dieet') instvControleerCodes_(inhoud.keuzes, 'keuzes', uit);
  else if (sectie === 'hulp') instvControleerHulp_(inhoud, uit);
  else if (sectie === 'mail') instvControleerMail_(inhoud.teksten, uit);
  else if (sectie === 'slot') { if (typeof inhoud.opSlot !== 'boolean') instvM_(uit, 'opSlot', 'Kies op slot of niet.'); }
  else if (sectie === 'technisch') {
    ['bonnen', 'verslagen'].forEach(function (v) {
      var t = instvTekst_(inhoud[v]);
      if (t !== '' && !/^[A-Za-z0-9_\-]{10,100}$/.test(t)) instvM_(uit, v, 'Dit is een mapnummer uit Google Drive: letters, cijfers, - en _ (10 tot 100 tekens), of leeg.');
    });
  } else return [{ pad: '', melding: 'Deze sectie is niet bekend.' }];
  return uit;
}

// De regels voor opslaan als de editie op slot staat: alleen de sectie slot mag (om het slot eraf te halen). '' = mag.
// Faalt dicht: alleen een duidelijk false (niet op slot) laat opslaan toe; elke andere waarde telt als op slot.
function instvSlotMelding(sectie, opSlot) {
  if (opSlot === false || sectie === 'slot') return '';
  return 'De editie staat op slot: er verandert niets meer. Haal eerst het slot eraf bij "Editie op slot" als je toch iets moet aanpassen.';
}

// Een Nederlandse zin van alle meldingen, voor het antwoord van de server en de melding bij een opdracht.
function instvMeldingTekst(meldingen) {
  return meldingen.map(function (m) { return m.melding; }).join(' ');
}

// Een korte vingerafdruk van de inhoud van een sectie zoals instvLees die geeft. De pagina stuurt die mee als `basis` (de stand waarop de wijziging is gebaseerd);
// de server rekent hem opnieuw uit op de Sheet van nu. Is de Sheet intussen anders, dan is de sectie door iemand anders gewijzigd.
function instvBasis(sectie, inhoud) {
  var t = String(sectie) + '|' + JSON.stringify(inhoud);
  var a = 5381, b = 52711;
  for (var i = 0; i < t.length; i++) {
    var c = t.charCodeAt(i);
    a = (((a << 5) + a) ^ c) | 0;
    b = (((b << 7) - b) ^ (c + i)) | 0;
  }
  return String(sectie) + ':' + t.length + ':' + (a >>> 0).toString(16) + (b >>> 0).toString(16);
}
