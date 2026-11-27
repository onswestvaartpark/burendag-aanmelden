// Het scherm Betalingen, pure kant (getest met Node, test/betalingen.test.js): de ING-export in de browser lezen en filteren, de regels voor de opdracht
// het bankbestand inlezen, filter en zoek in het overzicht per huishouden, en wat de pagina alvast laat zien van opdrachten die de server nog niet klaar heeft (betalingenMetWacht).
// Geen DOM hier. Alleen function/var op het hoogste niveau.
// Vereist: gedeeld/rechten.js (heeftRecht), gedeeld/csv.js en gedeeld/bank.js (parseIngCsv, filterBurendag).
// Alles wat uit het bestand komt blijft in het geheugen van de pagina; alleen de regels met de zoektekst gaan mee in een opdracht, en daarvan alleen de velden in betalingenVoorServer.

var BETALINGEN_PAGINA = 60;
var BETALINGEN_CHUNK_TEKENS = 15000; // hoeveel tekens (JSON) bankregels in één opdracht mogen; de server weigert vanaf 20000
var BETALINGEN_CHUNK_REGELS = 100;   // en hoeveel regels (de server weigert er meer dan 100)
var BETALINGEN_FILTERS = [
  { id: 'alles', tekst: 'Alles' },
  { id: 'open', tekst: 'Open' },
  { id: 'te weinig', tekst: 'Te weinig' },
  { id: 'betaald', tekst: 'Betaald' }
];
var BETALINGEN_STATUSTEKST = { betaald: 'Betaald', 'te weinig': 'Te weinig', 'te veel': 'Te veel', open: 'Open', vrijgesteld: 'Vrijgesteld' };
var BETALINGEN_TYPEN = {
  betalingKoppelen: 'Koppelen',
  betalingGeenBurendag: 'Markeren als geen burendag',
  betalingOngedaan: 'Ongedaan maken'
};
var BETALINGEN_MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

// ---- rechten ----

// Inlezen mag met bank_inlezen, en niet als de editie op slot staat.
function betalingenMagInlezen(rechten, opSlot) {
  return heeftRecht(rechten || [], 'bank_inlezen') && opSlot !== true;
}

// Koppelen, 'geen burendag' en ongedaan maken: betalingen_koppelen, en niet op slot. De regels zelf (met namen) zijn er alleen met persoonsgegevens_zien.
function betalingenMagKoppelen(rechten, opSlot) {
  return heeftRecht(rechten || [], 'betalingen_koppelen') && heeftRecht(rechten || [], 'persoonsgegevens_zien') && opSlot !== true;
}

// Mag de huishoudkaart van een huishouden geopend worden (het wijkregister met dit adres)? Alleen met persoonsgegevens_zien.
function betalingenMagKaart(rechten) {
  return heeftRecht(rechten || [], 'persoonsgegevens_zien');
}

// ---- het bankbestand lezen ----

// Alleen deze velden gaan naar de server: nooit het eigen rekeningnummer, de mededelingen (met IBAN's en kenmerken), de code, de mutatiesoort of het saldo.
// De tegenrekening gaat wel mee: de server maakt er een vingerafdruk van en bewaart het rekeningnummer nergens (net als bij Betalingen inlezen in de Sheet).
function betalingenVoorServer(r) {
  return { datum: r.datum, naam: r.naam, tegenrekening: r.tegenrekening, afBij: r.afBij, centen: r.centen, omschrijving: r.omschrijving, kenmerk: r.kenmerk };
}

// De uitkomst van de directe actie beheerBankInlezen voor stukken van een bestand samen: [{ nieuw, automatisch, twijfel, dubbel }] naar een som en een zin.
function betalingenInleesUitkomst(delen) {
  var som = { nieuw: 0, automatisch: 0, twijfel: 0, dubbel: 0 };
  (delen || []).forEach(function (d) { som.nieuw += d.nieuw; som.automatisch += d.automatisch; som.twijfel += d.twijfel; som.dubbel += d.dubbel; });
  som.tekst = som.nieuw + (som.nieuw === 1 ? ' nieuwe regel' : ' nieuwe regels') + ' ingelezen: ' + som.automatisch + ' automatisch gekoppeld, ' + som.twijfel + ' voor jou' +
    (som.dubbel > 0 ? ', ' + som.dubbel + (som.dubbel === 1 ? ' was al eerder ingelezen' : ' waren al eerder ingelezen') : '') + '.';
  return som;
}

// Een fout van parseIngCsv is al Nederlands; een technische fout (bijvoorbeeld een regel met te weinig kolommen) krijgt een gewone uitleg.
function betalingenLeesFoutTekst(e) {
  if (e instanceof TypeError) {
    return 'Dit bestand kan niet gelezen worden: een regel heeft minder kolommen dan de kopregel. Kies de CSV-export van ING zonder hem eerst te bewerken.';
  }
  return 'Dit bestand kan niet gelezen worden: ' + String(e && e.message || e) + '. Kies de CSV-export van ING (puntkomma-gescheiden).';
}

// Leest de tekst van een ING-export en houdt de regels met de zoektekst. Geeft { ok: true, totaal, gekozen: [regels voor de server], anders } of { ok: false, fout }.
function betalingenInleesBestand(tekst, zoektekst) {
  var regels;
  try {
    regels = parseIngCsv(String(tekst));
  } catch (e) {
    return { ok: false, fout: betalingenLeesFoutTekst(e) };
  }
  var gekozen = filterBurendag(regels, zoektekst).map(betalingenVoorServer);
  return { ok: true, totaal: regels.length, gekozen: gekozen, anders: regels.length - gekozen.length };
}

// '12 regels gevonden, 4 met burendag'
function betalingenTelTekst(totaal, gekozen) {
  return totaal + (totaal === 1 ? ' regel' : ' regels') + ' gevonden, ' + gekozen + ' met burendag';
}

// Knipt de regels in stukken die elk in één opdracht passen (de server weigert een opdracht boven 20000 tekens of 100 regels).
function betalingenChunks(regels, maxTekens, maxRegels) {
  var teken = typeof maxTekens === 'number' ? maxTekens : BETALINGEN_CHUNK_TEKENS;
  var aantal = typeof maxRegels === 'number' ? maxRegels : BETALINGEN_CHUNK_REGELS;
  var uit = [];
  var huidig = [];
  var lengte = 0;
  (regels || []).forEach(function (r) {
    var l = JSON.stringify(r).length + 1;
    if (huidig.length > 0 && (huidig.length >= aantal || lengte + l > teken)) { uit.push(huidig); huidig = []; lengte = 0; }
    huidig.push(r);
    lengte += l;
  });
  if (huidig.length > 0) uit.push(huidig);
  return uit;
}

// ---- weergave: datum, moment, import ----

// '2027-08-18' wordt '18 aug'.
function betalingenKorteDatum(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? Number(m[3]) + ' ' + BETALINGEN_MAANDEN[Number(m[2]) - 1] : '';
}

// Het moment van de laatste import voor de gebruiker: 'vandaag 09:31', 'gisteren 18:02' of '18 aug 09:31' (tijd in de tijdzone van de browser). nu = Date (mag ontbreken).
function betalingenMomentTekst(iso, nu) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var twee = function (n) { return ('0' + n).slice(-2); };
  var tijd = twee(d.getHours()) + ':' + twee(d.getMinutes());
  var vandaag = nu instanceof Date ? nu : new Date();
  var dag = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
  var verschil = Math.round((dag(vandaag) - dag(d)) / 86400000);
  if (verschil === 0) return 'vandaag ' + tijd;
  if (verschil === 1) return 'gisteren ' + tijd;
  return d.getDate() + ' ' + BETALINGEN_MAANDEN[d.getMonth()] + ' ' + tijd;
}

// De stukken van de samenvatting van de laatste import: ['4 nieuwe regels', '2 automatisch gekoppeld', '2 voor jou', '0 dubbel overgeslagen'] (dubbel alleen als het bekend is).
function betalingenImportDelen(imp) {
  if (!imp) return [];
  var delen = [imp.nieuw + (imp.nieuw === 1 ? ' nieuwe regel' : ' nieuwe regels'), imp.automatisch + ' automatisch gekoppeld', imp.voorJou + ' voor jou'];
  if (typeof imp.dubbel === 'number') delen.push(imp.dubbel + ' dubbel overgeslagen');
  return delen;
}

// ---- status, totalen, filter en zoek in het overzicht per huishouden ----

// Dezelfde regels als betalingBeheerStatus op de server (in hele centen).
function betalingenStatus(verwachtCenten, betaaldCenten) {
  var v = Math.round(Number(verwachtCenten)) || 0;
  var b = Math.round(Number(betaaldCenten)) || 0;
  if (b > v) return 'te veel';
  if (v <= 0) return 'vrijgesteld';
  if (b === v) return 'betaald';
  return b <= 0 ? 'open' : 'te weinig';
}

function betalingenTotalen(huishoudens) {
  var t = { verwachtCenten: 0, binnenCenten: 0, openCenten: 0, aantal: 0, perStatus: { betaald: 0, 'te weinig': 0, 'te veel': 0, open: 0, vrijgesteld: 0 } };
  (huishoudens || []).forEach(function (h) {
    t.verwachtCenten += h.verwachtCenten; t.binnenCenten += h.betaaldCenten; t.openCenten += h.openCenten;
    t.aantal++; t.perStatus[h.status]++;
  });
  return t;
}

// Alles; Open = nog niets betaald; Te weinig = een deel betaald; Betaald = betaald of te veel betaald (net als het filter Betaald bij Deelnemers).
function betalingenPastBijFilter(h, filter) {
  if (filter === 'open') return h.status === 'open';
  if (filter === 'te weinig') return h.status === 'te weinig';
  if (filter === 'betaald') return h.status === 'betaald' || h.status === 'te veel';
  return true;
}

function betalingenKleinLetters_(t) { return String(t === null || t === undefined ? '' : t).toLowerCase(); }

// Zoekt in adres en (als die er is) naam.
function betalingenPastBijZoek(h, zoek) {
  var z = betalingenKleinLetters_(zoek).trim();
  if (z === '') return true;
  return [h.adres, h.naam].some(function (t) { return betalingenKleinLetters_(t).indexOf(z) >= 0; });
}

// De huishoudens die bij het filter en de zoekopdracht horen, in de volgorde van de server (op adres).
function betalingenFilter(huishoudens, filter, zoek) {
  return (huishoudens || []).filter(function (h) { return betalingenPastBijFilter(h, filter) && betalingenPastBijZoek(h, zoek); });
}

// De keuzelijst van 'Ander huishouden…': de huishoudens die bij de zoektekst passen (op adres of naam), hooguit max (standaard 8).
function betalingenZoekHuishoudens(huishoudens, zoek, max) {
  return betalingenFilter(huishoudens, 'alles', zoek).slice(0, typeof max === 'number' ? max : 8);
}

// Wat er na het koppelen van deze regel met het huishouden gebeurt: { status, openCenten } (status volgens betalingenStatus); null als het huishouden niet bekend is.
function betalingenNaKoppelen(huishouden, regel) {
  if (!huishouden || !regel) return null;
  var verschil = regel.afBij === 'Af' ? -regel.bedragCenten : regel.bedragCenten;
  var betaald = huishouden.betaaldCenten + verschil;
  return { status: betalingenStatus(huishouden.verwachtCenten, betaald), openCenten: Math.max(huishouden.verwachtCenten - betaald, 0) };
}

// ---- wat de server nog niet klaar heeft: een voorlopige weergave ----

function betalingenGesigneerd_(regel) {
  return regel.afBij === 'Af' ? -regel.bedragCenten : regel.bedragCenten;
}

function betalingenNeemUit_(lijst, kenmerk) {
  for (var i = 0; i < lijst.length; i++) {
    if (lijst[i].kenmerk === kenmerk) return lijst.splice(i, 1)[0];
  }
  return null;
}

function betalingenVindHuis_(data, adrescode) {
  for (var i = 0; i < data.huishoudens.length; i++) if (data.huishoudens[i].adrescode === adrescode) return data.huishoudens[i];
  return null;
}

function betalingenPasHuisToe_(h, verschilCenten) {
  h.betaaldCenten += verschilCenten;
  h.openCenten = Math.max(h.verwachtCenten - h.betaaldCenten, 0);
  h.status = betalingenStatus(h.verwachtCenten, h.betaaldCenten);
}

function betalingenRegelKopie_(r) {
  return { kenmerk: r.kenmerk, datum: r.datum, naam: r.naam, omschrijving: r.omschrijving, afBij: r.afBij, bedragCenten: r.bedragCenten };
}

// Een kopie van de gegevens van de server waarin de opdrachten die nog niet klaar zijn (items = [{ id, type, gegevens }] in de volgorde van versturen) al verwerkt zijn:
// - betalingKoppelen: de regel gaat uit de open regels naar gekoppeld en het huishouden krijgt het bedrag erbij (of eraf, bij een afschrijving);
// - betalingGeenBurendag: de regel gaat naar geenBurendag;
// - betalingOngedaan: een gekoppelde regel (of een geen-burendag-regel) wordt weer open, zonder voorstellen; het huishouden verliest het bedrag.
// Regels die al niet meer waar ze volgens de opdracht zouden zijn (de server was al klaar), blijven ongemoeid: zo telt niets dubbel. Elke weergegeven regel die zo is aangepast heeft wacht: true.
// Zonder regels in de gegevens (geen persoonsgegevens_zien) verandert er niets.
function betalingenMetWacht(data, items) {
  if (!data || typeof data !== 'object') return data;
  var uit = JSON.parse(JSON.stringify(data));
  if (!Array.isArray(uit.openRegels) || !Array.isArray(uit.gekoppeld) || !Array.isArray(uit.geenBurendag) || !Array.isArray(uit.huishoudens)) return uit;
  var verschuiving = 0;
  (items || []).forEach(function (it) {
    var g = it.gegevens || {};
    if (it.type === 'betalingKoppelen') {
      var open = betalingenNeemUit_(uit.openRegels, g.kenmerk);
      if (open === null) return;
      verschuiving--;
      var h = betalingenVindHuis_(uit, g.adrescode);
      if (h !== null) betalingenPasHuisToe_(h, betalingenGesigneerd_(open));
      var nieuw = betalingenRegelKopie_(open);
      nieuw.adrescode = g.adrescode; nieuw.adres = h !== null ? h.adres : g.adrescode; nieuw.huishouden = h !== null && h.naam ? h.naam : ''; nieuw.soort = 'handmatig'; nieuw.wacht = true;
      uit.gekoppeld.push(nieuw);
    } else if (it.type === 'betalingGeenBurendag') {
      var weg = betalingenNeemUit_(uit.openRegels, g.kenmerk);
      if (weg === null) return;
      verschuiving--;
      var geen = betalingenRegelKopie_(weg);
      geen.wacht = true;
      uit.geenBurendag.unshift(geen);
    } else if (it.type === 'betalingOngedaan') {
      var terug = betalingenNeemUit_(uit.gekoppeld, g.kenmerk);
      if (terug !== null) {
        var huis = betalingenVindHuis_(uit, terug.adrescode);
        if (huis !== null) betalingenPasHuisToe_(huis, -betalingenGesigneerd_(terug));
      } else {
        terug = betalingenNeemUit_(uit.geenBurendag, g.kenmerk);
      }
      if (terug === null) return;
      verschuiving++;
      var weer = betalingenRegelKopie_(terug);
      weer.kandidaten = []; weer.wacht = true;
      uit.openRegels.push(weer);
    }
  });
  uit.openRegels.sort(function (a, b) { return a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.kenmerk < b.kenmerk ? -1 : a.kenmerk > b.kenmerk ? 1 : 0; });
  uit.aantalOpen = Math.max((uit.aantalOpen || 0) + verschuiving, 0);
  uit.totalen = betalingenTotalen(uit.huishoudens);
  return uit;
}

// De opdrachten van het geheugen van het scherm (bewerken.js, maakBewerkenWacht) als lijst in de volgorde van versturen: [{ id, type, gegevens, klaar }].
function betalingenWachtItems(wacht) {
  if (!wacht || !wacht.lijst) return [];
  return Object.keys(wacht.lijst).map(function (id) {
    var w = wacht.lijst[id];
    return { id: id, type: w.type, gegevens: w.gegevens, klaar: w.klaar === true };
  });
}

// Heeft deze regel een opdracht die nog loopt (dan geen tweede knop)?
function betalingenRegelWacht(wacht, kenmerk) {
  return betalingenWachtItems(wacht).some(function (w) { return w.gegevens && w.gegevens.kenmerk === kenmerk && !w.klaar; });
}
