// Het scherm Instellingen, pure kant (geen DOM; getest met Node). Alleen function/var op het hoogste niveau.
// Vereist (in de browser): gedeeld/instellingenvelden.js en gedeeld/sjabloon.js (vulIntern); de secties en hun controle staan in instellingenvelden.js.

var INSTELLINGEN_SCHERM_KEUZE = 'Je hebt wijzigingen die nog niet zijn opgeslagen. Toch weggaan? Je wijzigingen gaan dan verloren.';

// Alle bladeren van een inhoud als { pad: waarde }, zodat twee inhouden vergeleken en geteld kunnen worden.
function instSchermPlat(x, voorvoegsel, uit) {
  uit = uit || {};
  if (x !== null && typeof x === 'object') {
    var sleutels = Object.keys(x);
    if (sleutels.length === 0) uit[voorvoegsel + '[]'] = 'leeg';
    sleutels.forEach(function (k) { instSchermPlat(x[k], voorvoegsel + '.' + k, uit); });
  } else {
    uit[voorvoegsel] = x;
  }
  return uit;
}

// Aantal wijzigingen tussen de opgeslagen en de bewerkte inhoud van een sectie: veranderde velden, plus toegevoegde en weggehaalde rijen.
// Een lijst die van volgorde verandert telt per rij die van plek is gewisseld.
function instSchermAantalWijzigingen(basis, concept) {
  var a = instSchermPlat(basis, ''), b = instSchermPlat(concept, '');
  var verschil = {};
  Object.keys(a).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(b, k) || b[k] !== a[k]) verschil[k] = true; });
  Object.keys(b).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(a, k)) verschil[k] = true; });
  // alle velden van een rij die erbij of eraf is, tellen als een wijziging
  var rijen = {};
  Object.keys(verschil).forEach(function (k) {
    var m = /^(\.[A-Za-z]+\.\d+)(\.|$)/.exec(k);
    rijen[m ? m[1] : k] = true;
  });
  return Object.keys(rijen).length;
}

// Welke secties zijn gewijzigd? basis en concept zijn { sectie: inhoud }. Geeft de namen in vaste volgorde.
function instSchermVuil(basis, concept) {
  return INSTV_SECTIES.map(function (s) { return s.naam; }).filter(function (n) {
    return !!basis && !!concept && !!basis[n] && !!concept[n] && JSON.stringify(basis[n]) !== JSON.stringify(concept[n]);
  });
}

// De meldingen van instvControleer als { pad: [meldingen] }.
function instSchermMeldingenPerPad(meldingen) {
  var uit = {};
  meldingen.forEach(function (m) { (uit[m.pad] = uit[m.pad] || []).push(m.melding); });
  return uit;
}

// Verplaatst rij van plek i naar plek i + stap in dezelfde lijst; geeft de nieuwe plek of -1 als het niet kan.
function instSchermVerplaats(lijst, i, stap) {
  var naar = i + stap;
  if (i < 0 || i >= lijst.length || naar < 0 || naar >= lijst.length) return -1;
  var rij = lijst.splice(i, 1)[0];
  lijst.splice(naar, 0, rij);
  return naar;
}

// Zet een plaatshouder op de plek van de cursor (of vervangt de selectie). Geeft { tekst, cursor }.
function instSchermInvoegen(tekst, start, eind, plaatshouder) {
  var t = String(tekst);
  var van = typeof start === 'number' && start >= 0 && start <= t.length ? start : t.length;
  var tot = typeof eind === 'number' && eind >= van && eind <= t.length ? eind : van;
  var inzet = '{{' + plaatshouder + '}}';
  return { tekst: t.slice(0, van) + inzet + t.slice(tot), cursor: van + inzet.length };
}

// Voorbeeldweergave van een mail in platte tekst, met de voorbeeldwaarden van instvVoorbeeldWaarden. Geeft { onderwerp, tekst } of { fout } bij een onbekende plaatshouder.
function instSchermVoorbeeld(onderwerp, tekst) {
  var w = instvVoorbeeldWaarden();
  var alle = Object.keys(w);
  try {
    return { onderwerp: vulIntern(onderwerp, w, alle), tekst: vulIntern(tekst, w, alle) };
  } catch (e) {
    return { fout: String(e && e.message || e).replace(/^Onbekende plaatshouder: (.*)$/, 'Onbekende plaatshouder {{$1}}.') };
  }
}

// Een getypte waarde naar wat in de inhoud komt: een getal als het er een is, anders de tekst zelf (de controle meldt het dan).
function instSchermGetal(tekst, soort) {
  var t = String(tekst);
  if (soort === 'euro') { var e = instvEuro(t); return e === null ? t : e; }
  if (soort === 'geheel') { var g = instvGeheel(t); return g === null ? t : g; }
  if (soort === 'geheelOfLeeg') { if (t.trim() === '') return null; var h = instvGeheel(t); return h === null ? t : h; }
  return t;
}

// Een waarde uit de inhoud als tekst voor een invoerveld: bedragen met een komma.
function instSchermTekst(waarde, soort) {
  if (waarde === null || waarde === undefined) return '';
  if (soort === 'euro' && typeof waarde === 'number') return waarde.toFixed(waarde === Math.round(waarde) ? 0 : 2).replace('.', ',');
  return String(waarde);
}

// Status van de verstuurde opdrachten per sectie, uit mijnOpdrachten van de momentopname en de mislukte lijst van de wachtrij.
// wachtend = { sectie: opdrachtId }, mijn = lijst { id, status, melding }, mislukt = lijst { opdracht: { id }, melding }.
// Geeft { sectie: { status: 'wacht' | 'klaar' | 'fout', melding } } voor de secties die een uitkomst hebben of nog wachten.
function instSchermUitkomsten(wachtend, mijn, mislukt) {
  var uit = {};
  Object.keys(wachtend).forEach(function (sectie) {
    var id = wachtend[sectie];
    var m = (mislukt || []).filter(function (x) { return x && x.opdracht && x.opdracht.id === id; })[0];
    if (m) { uit[sectie] = { status: 'fout', melding: m.melding || '' }; return; }
    var o = (mijn || []).filter(function (x) { return x && x.id === id; })[0];
    if (o && o.status === 'klaar') uit[sectie] = { status: 'klaar', melding: '' };
    else if (o && o.status === 'fout') uit[sectie] = { status: 'fout', melding: o.melding || '' };
    else uit[sectie] = { status: 'wacht', melding: '' };
  });
  return uit;
}
