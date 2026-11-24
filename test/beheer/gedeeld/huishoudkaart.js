// De huishoudkaart van het wijkregister (fase 2c): controle van de gegevens van een bewoner, een spul en de opmerking van een adres,
// leeftijd van een bewoner, en de bewaartermijn van een adres. Puur; dezelfde functies draaien op de pagina (voor het versturen), op de server
// (bij het aannemen van de opdracht en in de verwerker) en bij het opschonen.
// Vereist gedeeld/validatie.js (valTekst_, valFout_). Alleen function/var op het hoogste niveau (draait in Apps Script, browser en Node).
//
// Bewaartermijn (besluit van de commissie): we bewaren gegevens hooguit 3 jaar na de laatste toestemming. De toestemming wordt gegeven bij de
// aanmelding en met elke nieuwe aanmelding vernieuwd. bewarenTot = (laatste jaar met deelname, anders het jaar waarin het adres is toegevoegd) + 3,
// en geldt tot en met het einde van dat jaar. Is het jaar van toevoegen onbekend (lege toegevoegd_op), dan is de termijn onbekend en verloopt er niets.

var HUISHOUD_MAX_VOORNAAM = 120;
var HUISHOUD_MAX_TOELICHTING = 200;
var HUISHOUD_MAX_SPUL_WAT = 120;
var HUISHOUD_MAX_SPUL_OPMERKING = 200;
var HUISHOUD_MAX_ADRES_OPMERKING = 500;
var HUISHOUD_MAX_DIEET = 20;
var HUISHOUD_BEWAARJAREN = 3;
var HUISHOUD_VOLWASSEN_VANAF = 18;

function huishoudIsObject_(w) {
  return w !== null && typeof w === 'object' && !Array.isArray(w);
}

function huishoudLeeg_(w) {
  return w === undefined || w === null || (typeof w === 'string' && w.trim() === '');
}

// Een heel getal uit een getal of een tekst met alleen cijfers; null als het geen heel getal is.
function huishoudGetal_(w) {
  if (typeof w === 'number') return isFinite(w) && Math.floor(w) === w ? w : null;
  if (typeof w === 'string' && /^\d{1,4}$/.test(w.trim())) return parseInt(w.trim(), 10);
  return null;
}

function huishoudHuidigJaar_(omgeving) {
  var j = omgeving && typeof omgeving.jaar === 'number' && isFinite(omgeving.jaar) ? omgeving.jaar : new Date().getFullYear();
  return j;
}

function huishoudTekst_(fouten, w, max, naam, verplicht) {
  if (w !== undefined && w !== null && typeof w !== 'string') { fouten.push('Vul ' + naam + ' als tekst in.'); return ''; }
  var t = valTekst_(w);
  if (verplicht && t === '') fouten.push('Vul ' + naam + ' in.');
  else if (t.length > max) fouten.push(naam.charAt(0).toUpperCase() + naam.slice(1) + ' mag maximaal ' + max + ' tekens bevatten.');
  return t;
}

// De dieetwensen als lijst codes: een tekst (één code, of leeg) of een lijst codes. omgeving.dieetCodes = de codes uit Dieetkeuzes;
// zonder die lijst (de pagina kent ze niet altijd) wordt de lijst niet gecontroleerd. omgeving.oudDieet = de codes die de bewoner al had (uit oud):
// die blijven toegestaan, ook als ze intussen uit Dieetkeuzes zijn gehaald. Een code mag geen komma bevatten (de cel is een lijst met komma's).
// Geeft de unieke codes in volgorde.
function huishoudDieet_(fouten, w, omgeving) {
  var lijst = [];
  if (huishoudLeeg_(w)) return lijst;
  if (typeof w === 'string') lijst = [w.trim()];
  else if (Array.isArray(w)) lijst = w.map(function (c) { return typeof c === 'string' ? c.trim() : null; });
  else { fouten.push('Kies een dieetwens uit de lijst, of laat het leeg.'); return []; }
  var codes = omgeving && Array.isArray(omgeving.dieetCodes) ? omgeving.dieetCodes : null;
  var oud = omgeving && Array.isArray(omgeving.oudDieet) ? omgeving.oudDieet : [];
  var uit = [];
  var fout = lijst.length > HUISHOUD_MAX_DIEET;
  lijst.forEach(function (c) {
    if (c === null || c === '' || c.indexOf(',') !== -1 || (codes !== null && codes.indexOf(c) === -1 && oud.indexOf(c) === -1)) fout = true;
    else if (uit.indexOf(c) === -1) uit.push(c);
  });
  if (fout) { fouten.push('Kies een dieetwens uit de lijst, of laat het leeg.'); return []; }
  return uit;
}

// g = { voornaam, geboortemaand, geboortejaar, dieet, dieetToelichting, ehbo }. Geeft { fouten: [Nederlandse meldingen], schoon }.
// schoon.dieet is altijd een lijst codes, geboortemaand en geboortejaar zijn een getal of null, ehbo is true of false.
function huishoudControleerBewoner(g, omgeving) {
  var i = huishoudIsObject_(g) ? g : {};
  var fouten = [];
  var schoon = { voornaam: huishoudTekst_(fouten, i.voornaam, HUISHOUD_MAX_VOORNAAM, 'een voornaam', true) };
  var maand = null, jaar = null;
  if (!huishoudLeeg_(i.geboortemaand)) {
    maand = huishoudGetal_(i.geboortemaand);
    if (maand === null || maand < 1 || maand > 12) { fouten.push('Vul de geboortemaand in als een getal van 1 tot en met 12, of laat het leeg.'); maand = null; }
  }
  if (!huishoudLeeg_(i.geboortejaar)) {
    jaar = huishoudGetal_(i.geboortejaar);
    var nu = huishoudHuidigJaar_(omgeving);
    if (jaar === null || !/^\d{4}$/.test(String(jaar)) || jaar < 1900 || jaar > nu) { fouten.push('Vul het geboortejaar in met vier cijfers, van 1900 tot en met ' + nu + ', of laat het leeg.'); jaar = null; }
  }
  if (maand !== null && jaar === null && fouten.length === 0) fouten.push('Vul bij een geboortemaand ook het geboortejaar in.');
  schoon.geboortemaand = maand;
  schoon.geboortejaar = jaar;
  schoon.dieet = huishoudDieet_(fouten, i.dieet, omgeving);
  schoon.dieetToelichting = huishoudTekst_(fouten, i.dieetToelichting, HUISHOUD_MAX_TOELICHTING, 'de toelichting bij het dieet', false);
  if (i.ehbo !== undefined && i.ehbo !== null && typeof i.ehbo !== 'boolean') fouten.push('EHBO moet ja of nee zijn.');
  schoon.ehbo = i.ehbo === true;
  return { fouten: fouten, schoon: schoon };
}

// g = { wat, aantal, opmerking }. aantal is een heel getal van 1 tot en met 999, of leeg (dan null).
function huishoudControleerSpul(g) {
  var i = huishoudIsObject_(g) ? g : {};
  var fouten = [];
  var schoon = { wat: huishoudTekst_(fouten, i.wat, HUISHOUD_MAX_SPUL_WAT, 'wat je uitleent', true), aantal: null };
  if (!huishoudLeeg_(i.aantal)) {
    var n = typeof i.aantal === 'number' ? (isFinite(i.aantal) && Math.floor(i.aantal) === i.aantal ? i.aantal : null)
      : (typeof i.aantal === 'string' && /^\d{1,3}$/.test(i.aantal.trim()) ? parseInt(i.aantal.trim(), 10) : null);
    if (n === null || n < 1 || n > 999) fouten.push('Vul het aantal in als een heel getal van 1 tot en met 999, of laat het leeg.');
    else schoon.aantal = n;
  }
  schoon.opmerking = huishoudTekst_(fouten, i.opmerking, HUISHOUD_MAX_SPUL_OPMERKING, 'de opmerking', false);
  return { fouten: fouten, schoon: schoon };
}

// De opmerking bij een adres: vrije tekst, hooguit 500 tekens, mag leeg. Geeft { fouten, schoon: tekst }.
function huishoudControleerOpmerking(w) {
  var fouten = [];
  var t = huishoudTekst_(fouten, w, HUISHOUD_MAX_ADRES_OPMERKING, 'de opmerking', false);
  return { fouten: fouten, schoon: t };
}

// Leeftijd in hele jaren op peildatum ('JJJJ-MM-DD') uit geboortejaar en eventueel geboortemaand.
// Geeft { leeftijd: getal of null, ongeveer: true als de maand ontbreekt }. Zonder geboortejaar is de leeftijd onbekend (null).
// Met maand rekent het zoals leeftijdOpPeildatum (valt de geboortemaand in of na de maand van de peildatum, dan nog niet jarig).
function huishoudLeeftijd(geboortejaar, geboortemaand, peildatum) {
  var jaar = huishoudGetal_(geboortejaar);
  var delen = String(peildatum).split('-');
  var peilJaar = Number(delen[0]), peilMaand = Number(delen[1]);
  if (jaar === null || !isFinite(peilJaar)) return { leeftijd: null, ongeveer: false };
  var maand = huishoudGetal_(geboortemaand);
  if (maand === null || maand < 1 || maand > 12 || !isFinite(peilMaand)) return { leeftijd: Math.max(0, peilJaar - jaar), ongeveer: true };
  var l = peilJaar - jaar;
  if (maand >= peilMaand) l -= 1;
  return { leeftijd: Math.max(0, l), ongeveer: false };
}

// 'kind' of 'volwassene'. groepen = de leeftijdsgroepen uit de instellingen ({ naam, van, tm }); de groep zonder bovengrens (tm null) is de
// volwassenengroep, zoals bij de aanmelding. Zonder groepen (of zonder zo'n groep): 18 jaar en ouder. Onbekende leeftijd: volwassene
// (ook zoals bij de aanmelding, waar de groep zonder bovengrens geldt als er geen geboortedatum is).
function huishoudSoort(leeftijd, groepen) {
  if (leeftijd === null || leeftijd === undefined) return 'volwassene';
  var grens = HUISHOUD_VOLWASSEN_VANAF;
  (groepen || []).forEach(function (g) {
    if (g && (g.tm === null || g.tm === undefined) && typeof g.van === 'number' && isFinite(g.van)) grens = g.van;
  });
  return leeftijd >= grens ? 'volwassene' : 'kind';
}

// Het kalenderjaar in Nederland van een Date.
function bewaartermijnJaarAmsterdam_(d) {
  if (isNaN(d.getTime())) return null;
  return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Amsterdam', year: 'numeric' }).format(d), 10);
}

// Het jaar uit een ISO-datum of -tijdstip (tekst of Date), als kalenderjaar in Nederland; null als het niet te lezen is of leeg is.
// Een datum zonder tijd ('JJJJ-MM-DD', zoals toegevoegd_op) is al een Nederlandse kalenderdatum; een tijdstip ('...T10:00:00.000Z', zoals aangemeld_op) wordt omgerekend.
function bewaartermijnJaarVan(toegevoegdOp) {
  if (toegevoegdOp instanceof Date) return bewaartermijnJaarAmsterdam_(toegevoegdOp);
  var t = String(toegevoegdOp === undefined || toegevoegdOp === null ? '' : toegevoegdOp).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return parseInt(t.slice(0, 4), 10);
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {
    var d = new Date(t);
    if (!isNaN(d.getTime())) return bewaartermijnJaarAmsterdam_(d);
  }
  var m = /^(\d{4})-\d{2}-\d{2}/.exec(t);
  return m ? parseInt(m[1], 10) : null;
}

// Telt een huishouden uit de administratie als aangemeld in deze editie? Alleen als de status niet 'afgemeld' is én het jaar van aangemeld_op het jaar van de
// editie is: rijen in Huishoudens kunnen een editie overleven. Is editieJaar niet bekend, dan nee.
function huishoudActiefDitJaar(status, aangemeldOp, editieJaar) {
  return typeof editieJaar === 'number' && String(status === undefined || status === null ? '' : status).trim() !== 'afgemeld' && bewaartermijnJaarVan(aangemeldOp) === editieJaar;
}

// De bewaartermijn van één adres. toegevoegdOp = de ISO-datum uit Adressen (of leeg), historie = de Historie-rijen van dit adres
// ({ jaar, aangemeld }). Geeft { tot: jaar of null, bron: 'deelname' | 'toegevoegd' | 'onbekend' }.
function bewaartermijnVan(toegevoegdOp, historie) {
  var laatste = null;
  (historie || []).forEach(function (h) {
    if (!h || h.aangemeld !== true) return;
    var j = Number(h.jaar);
    if (isFinite(j) && String(h.jaar).trim() !== '' && (laatste === null || j > laatste)) laatste = j;
  });
  if (laatste !== null) return { tot: laatste + HUISHOUD_BEWAARJAREN, bron: 'deelname' };
  var toegevoegd = bewaartermijnJaarVan(toegevoegdOp);
  if (toegevoegd !== null) return { tot: toegevoegd + HUISHOUD_BEWAARJAREN, bron: 'toegevoegd' };
  return { tot: null, bron: 'onbekend' };
}

// Is de termijn voorbij? De termijn loopt tot en met het einde van het jaar bewarenTot; een onbekende termijn verloopt nooit.
function bewaartermijnIsVerlopen(termijn, vandaagJaar) {
  return !!termijn && typeof termijn.tot === 'number' && termijn.tot < vandaagJaar;
}

// adressen = [{ adrescode, toegevoegdOp }], historie = [{ adrescode, jaar, aangemeld }] (alle adressen samen).
// Geeft de adrescodes (in volgorde van adressen, zonder dubbelen) waarvan bewarenTot voor vandaagJaar ligt.
function registerVerlopen(adressen, historie, vandaagJaar) {
  var perCode = {};
  (historie || []).forEach(function (h) {
    if (!h) return;
    var code = String(h.adrescode === undefined || h.adrescode === null ? '' : h.adrescode).trim();
    if (code === '') return;
    if (!Object.prototype.hasOwnProperty.call(perCode, code)) perCode[code] = [];
    perCode[code].push(h);
  });
  var uit = [];
  var gezien = {};
  (adressen || []).forEach(function (a) {
    if (!a) return;
    var code = String(a.adrescode === undefined || a.adrescode === null ? '' : a.adrescode).trim();
    if (code === '' || Object.prototype.hasOwnProperty.call(gezien, code)) return;
    gezien[code] = true;
    var rijen = Object.prototype.hasOwnProperty.call(perCode, code) ? perCode[code] : [];
    if (bewaartermijnIsVerlopen(bewaartermijnVan(a.toegevoegdOp, rijen), vandaagJaar)) uit.push(code);
  });
  return uit;
}

// ---- De rij zoals de commissie hem zag (oud) en zoals hij nu in het register staat: dezelfde vaste vorm, om te vergelijken ----

function huishoudSnapTekst_(w) {
  var t = w === undefined || w === null ? '' : String(w).trim();
  return t.length > 1000 ? null : t;
}

function huishoudSnapGetal_(w) {
  if (w === undefined || w === null || (typeof w === 'string' && w.trim() === '')) return null;
  var n = Number(w);
  return isFinite(n) ? n : NaN;
}

// Een bewoner in vaste vorm { voornaam, geboortemaand, geboortejaar, dieet (lijst, gesorteerd), dieetToelichting, ehbo }, of null als de invoer
// geen bewoner is. Mild: wat in het register staat hoeft de regels van nu niet te halen (een dieetcode kan intussen uit de lijst zijn).
function huishoudSnapBewoner(x) {
  if (!huishoudIsObject_(x)) return null;
  var voornaam = huishoudSnapTekst_(x.voornaam), toelichting = huishoudSnapTekst_(x.dieetToelichting);
  var maand = huishoudSnapGetal_(x.geboortemaand), jaar = huishoudSnapGetal_(x.geboortejaar);
  var dieet = x.dieet;
  if (typeof dieet === 'string') dieet = dieet.split(',');
  if (dieet === undefined || dieet === null) dieet = [];
  if (voornaam === null || toelichting === null || (maand !== null && isNaN(maand)) || (jaar !== null && isNaN(jaar)) || !Array.isArray(dieet) || dieet.length > 100) return null;
  var codes = [];
  for (var i = 0; i < dieet.length; i++) {
    var c = huishoudSnapTekst_(dieet[i]);
    if (c === null) return null;
    if (c !== '' && codes.indexOf(c) === -1) codes.push(c);
  }
  codes.sort();
  return { voornaam: voornaam, geboortemaand: maand, geboortejaar: jaar, dieet: codes, dieetToelichting: toelichting, ehbo: x.ehbo === true };
}

// Een spul in vaste vorm { wat, aantal (getal of null), opmerking }, of null.
function huishoudSnapSpul(x) {
  if (!huishoudIsObject_(x)) return null;
  var wat = huishoudSnapTekst_(x.wat), opmerking = huishoudSnapTekst_(x.opmerking), aantal = huishoudSnapGetal_(x.aantal);
  if (wat === null || opmerking === null || (aantal !== null && isNaN(aantal))) return null;
  return { wat: wat, aantal: aantal, opmerking: opmerking };
}

// Zijn twee snapshots (uit huishoudSnapBewoner of huishoudSnapSpul) gelijk?
function huishoudSnapGelijk(a, b) {
  return a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
}
