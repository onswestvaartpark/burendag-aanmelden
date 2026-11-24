// De wachtrij met uitgaande opdrachten van de beheerpagina. Puur: de opslag wordt meegegeven als
// { lees(sleutel), schrijf(sleutel, waarde) } (in de browser een laagje om localStorage, zie api.js).
// Sleutels: 'wachtrij' (opdrachten die nog verstuurd moeten worden) en 'mislukt' ({ opdracht, melding } die de server weigerde).
// Verder 'verstuurd': opdrachten die de server heeft aangenomen maar die nog niet in een momentopname staan ({ opdracht, op }).
// Die blijven zichtbaar als 'wordt verwerkt' tot een momentopname ze kent, of tot ze te oud zijn (VERSTUURD_BEWAAR_MS).
// Alleen function/var op het hoogste niveau, zodat de tests het bestand kunnen laden.

var VERSTUURD_BEWAAR_MS = 15 * 60 * 1000;

// 'O-' en 16 hexadecimale tekens. willekeur(aantal) geeft een lijst bytes; zonder: crypto.getRandomValues van de browser.
function nieuwOpdrachtId(willekeur) {
  var bytes = typeof willekeur === 'function' ? willekeur(8) : crypto.getRandomValues(new Uint8Array(8));
  var tekst = 'O-';
  for (var i = 0; i < 8; i++) tekst += ('0' + (bytes[i] & 255).toString(16)).slice(-2);
  return tekst;
}

function wachtrijLees(opslag) {
  var lijst = opslag.lees('wachtrij');
  return Array.isArray(lijst) ? lijst : [];
}

function mislukteLees(opslag) {
  var lijst = opslag.lees('mislukt');
  return Array.isArray(lijst) ? lijst : [];
}

function verstuurdLees(opslag) {
  var lijst = opslag.lees('verstuurd');
  return Array.isArray(lijst) ? lijst.filter(function (v) { return v && v.opdracht && v.opdracht.id; }) : [];
}

// Onthoudt een opdracht die de server aannam (nu = tijd in ms; zonder: Date.now()). Per id één keer.
function verstuurdVoegToe(opslag, opdracht, nu) {
  var lijst = verstuurdLees(opslag);
  for (var i = 0; i < lijst.length; i++) if (lijst[i].opdracht.id === opdracht.id) return lijst.length;
  lijst.push({ opdracht: opdracht, op: typeof nu === 'number' ? nu : Date.now() });
  opslag.schrijf('verstuurd', lijst);
  return lijst.length;
}

// Gooit weg wat een momentopname al kent (met elke status: dan neemt de kopie van de server het over) en wat te oud is.
// Geeft de opdrachten die overblijven (zonder tijd), in volgorde van versturen. Schrijft alleen als er iets verdwijnt.
function verstuurdOpruim(opslag, momentopname, nu) {
  var lijst = verstuurdLees(opslag);
  var tijd = typeof nu === 'number' ? nu : Date.now();
  var bekend = {};
  var eigen = momentopname && Array.isArray(momentopname.mijnOpdrachten) ? momentopname.mijnOpdrachten : [];
  for (var i = 0; i < eigen.length; i++) bekend[eigen[i].id] = true;
  var blijft = lijst.filter(function (v) { return !bekend[v.opdracht.id] && tijd - v.op < VERSTUURD_BEWAAR_MS; });
  if (blijft.length !== lijst.length) opslag.schrijf('verstuurd', blijft);
  return blijft.map(function (v) { return v.opdracht; });
}

// Moet de pagina nog opnieuw lezen? Ja zolang een eigen opdracht bij de server op 'nieuw' staat of er een verstuurde is die de server nog niet toont.
function wachtOpVerwerking(momentopname, verstuurd) {
  if (verstuurd && verstuurd.length > 0) return true;
  var eigen = momentopname && Array.isArray(momentopname.mijnOpdrachten) ? momentopname.mijnOpdrachten : [];
  for (var i = 0; i < eigen.length; i++) if (eigen[i].status === 'nieuw') return true;
  return false;
}

// Zet de opdracht achteraan; een opdracht met hetzelfde id staat er maar één keer in.
function wachtrijVoegToe(opslag, opdracht) {
  var lijst = wachtrijLees(opslag);
  for (var i = 0; i < lijst.length; i++) if (lijst[i].id === opdracht.id) return lijst.length;
  lijst.push(opdracht);
  opslag.schrijf('wachtrij', lijst);
  return lijst.length;
}

// Zet een geweigerde opdracht bij 'mislukt'; per opdracht-id staat er maar één melding (een dubbele verzending voegt niets toe).
function mislukteVoegToe(opslag, opdracht, melding) {
  var lijst = mislukteLees(opslag);
  for (var i = 0; i < lijst.length; i++) if (lijst[i].opdracht.id === opdracht.id) return lijst.length;
  lijst.push({ opdracht: opdracht, melding: melding || 'Dit lukte niet. Probeer het later opnieuw of vraag het de beheerder.' });
  opslag.schrijf('mislukt', lijst);
  return lijst.length;
}

// Haalt een gemelde mislukking weg (de gebruiker heeft hem gelezen). Zonder id: alles.
function mislukteWis(opslag, id) {
  opslag.schrijf('mislukt', id === undefined ? [] : mislukteLees(opslag).filter(function (m) { return m.opdracht.id !== id; }));
}

// Stuurt de opdrachten één voor één, in volgorde. stuur(opdracht) geeft het antwoord van het achterwerk of gooit bij een netwerkfout.
//  ok:true (ook dubbel:true)  -> uit de wachtrij
//  ONGELDIG of RECHT          -> uit de wachtrij, naar 'mislukt' met de melding
//  SESSIE                     -> blijft; stopt en geeft sessieVerlopen:true
//  FOUT of een netwerkfout    -> blijft; stopt (de volgende volgorde blijft dan kloppen) voor een latere poging
// Een aangenomen opdracht gaat eerst naar 'verstuurd' (zie boven) en pas dan uit de wachtrij: er is geen moment waarop hij nergens staat.
// nu (optioneel) is een functie die de tijd in ms geeft. Geeft { verstuurd, over } (verstuurd = aantal dat de server aannam), plus sessieVerlopen:true bij SESSIE.
function wachtrijVerstuur(opslag, stuur, nu) {
  var verstuurd = 0;
  function klaar(sessieVerlopen) {
    var uit = { verstuurd: verstuurd, over: wachtrijLees(opslag).length };
    if (sessieVerlopen) uit.sessieVerlopen = true;
    return uit;
  }
  function verwijder(opdracht) {
    opslag.schrijf('wachtrij', wachtrijLees(opslag).filter(function (o) { return o.id !== opdracht.id; }));
  }
  // Doet de eerste opdracht in de wachtrij en gaat door met de volgende (een gewone functie, geen async, zoals de rest van het project).
  function volgende() {
    var lijst = wachtrijLees(opslag);
    if (lijst.length === 0) return klaar(false);
    var opdracht = lijst[0];
    var belofte;
    try { belofte = Promise.resolve(stuur(opdracht)); } catch (fout) { return klaar(false); }
    return belofte.then(function (antwoord) {
      if (antwoord && antwoord.ok === true) {
        verstuurdVoegToe(opslag, opdracht, typeof nu === 'function' ? nu() : undefined);
        verwijder(opdracht);
        verstuurd++;
        return volgende();
      }
      if (antwoord && (antwoord.code === 'ONGELDIG' || antwoord.code === 'RECHT')) {
        verwijder(opdracht);
        mislukteVoegToe(opslag, opdracht, antwoord.melding);
        return volgende();
      }
      return klaar(!!antwoord && antwoord.code === 'SESSIE');
    }, function () { return klaar(false); });
  }
  return Promise.resolve().then(volgende);
}

// Een kopie van de momentopname waarin de eigen opdrachten die nog niet bij de server zijn (of nog niet in de lijst staan)
// als status 'onderweg' in mijnOpdrachten staan. Wat de server al kent, blijft zoals de server het meldt.
// wachtrij = opdrachten die nog verstuurd moeten worden; verstuurd = door de server aangenomen opdrachten die nog niet in de momentopname staan
// (zie verstuurdOpruim); beide tonen als 'wordt verwerkt', ook met de gegevens voor de voorlopige weergave.
function samenvoegMetMomentopname(momentopname, wachtrij, verstuurd) {
  if (!momentopname) return momentopname;
  var uit = JSON.parse(JSON.stringify(momentopname));
  var lijst = Array.isArray(uit.mijnOpdrachten) ? uit.mijnOpdrachten : [];
  var bekend = {};
  for (var i = 0; i < lijst.length; i++) bekend[lijst[i].id] = true;
  var nieuw = [];
  var eigen = (verstuurd || []).concat(wachtrij || []);
  for (var j = 0; j < eigen.length; j++) {
    var o = eigen[j];
    if (bekend[o.id]) continue;
    bekend[o.id] = true;
    nieuw.push({ id: o.id, type: o.type, status: 'onderweg', melding: '', ontvangenOp: '', gegevens: o.gegevens });
  }
  uit.mijnOpdrachten = nieuw.concat(lijst);
  return uit;
}

// ---- opdrachten met gegevens van buren (fase 2b): nooit naar localStorage ----

// Deze opdrachttypen bevatten namen, e-mailadressen of telefoonnummers van buren. Ze staan in de wachtrij, bij 'verstuurd' en bij 'mislukt'
// alleen in het geheugen van de pagina: sluit je de pagina voordat ze verstuurd zijn, dan gaan ze verloren (en dat is hier bedoeld).
var PRIVE_OPDRACHT_TYPEN = ['registerContactOpslaan', 'registerContactVerwijderen', 'registerAdresToevoegen', 'deelnemerContactOpslaan',
  'registerBewonerOpslaan', 'registerBewonerVerwijderen', 'registerSpullenOpslaan', 'registerSpullenVerwijderen', 'registerOpmerkingOpslaan', 'registerOpschonen'];

function isPriveOpdracht(opdracht) {
  return !!opdracht && PRIVE_OPDRACHT_TYPEN.indexOf(opdracht.type) !== -1;
}

// Een opslag in het geheugen in dezelfde vorm als de opslag in api.js: { lees(sleutel), schrijf(sleutel, waarde), wis(sleutel) }. Waarden zijn JSON.
function maakGeheugenOpslag() {
  var data = {};
  return {
    lees: function (naam) { return Object.prototype.hasOwnProperty.call(data, naam) ? JSON.parse(data[naam]) : null; },
    schrijf: function (naam, waarde) { data[naam] = JSON.stringify(waarde); return true; },
    wis: function (naam) { delete data[naam]; }
  };
}

// Een opslag die de lijsten 'wachtrij', 'verstuurd' en 'mislukt' splitst: opdrachten met gegevens van buren gaan naar het geheugen,
// de rest naar de vaste opslag (localStorage). Bij het lezen komen ze weer samen (eerst de vaste, dan die uit het geheugen). Andere sleutels gaan naar de vaste opslag.
function maakGesplitsteOpslag(vast, geheugen) {
  var lijsten = { wachtrij: true, verstuurd: true, mislukt: true };
  function opdrachtVan(naam, item) { return naam === 'wachtrij' ? item : (item && item.opdracht); }
  function lijst(opslag, naam) { var l = opslag.lees(naam); return Array.isArray(l) ? l : []; }
  return {
    lees: function (naam) {
      if (!lijsten[naam]) return vast.lees(naam);
      var a = vast.lees(naam);
      var b = lijst(geheugen, naam);
      return a === null && b.length === 0 ? null : lijst(vast, naam).concat(b);
    },
    schrijf: function (naam, waarde) {
      if (!lijsten[naam] || !Array.isArray(waarde)) return vast.schrijf(naam, waarde);
      geheugen.schrijf(naam, waarde.filter(function (i) { return isPriveOpdracht(opdrachtVan(naam, i)); }));
      return vast.schrijf(naam, waarde.filter(function (i) { return !isPriveOpdracht(opdrachtVan(naam, i)); }));
    },
    wis: function (naam) {
      if (lijsten[naam]) geheugen.wis(naam);
      if (typeof vast.wis === 'function') vast.wis(naam);
    }
  };
}
