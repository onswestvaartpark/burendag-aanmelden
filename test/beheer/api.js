// Praat met het koppelscript en bewaart wat de pagina op het apparaat houdt. API_URL en BEHEER_OMGEVING komen uit config.js.
// POST gaat als text/plain, zodat de browser geen extra CORS-vooraanvraag doet (Apps Script kan die niet beantwoorden), net als site/api.js.
// Test en prod staan op dezelfde plek (zelfde adres), dus de sleutels in localStorage dragen de omgeving in hun naam.

var BEHEER_TIJDSLIMIET_MS = 45000;

function beheerSleutel(naam) {
  return 'beheer.' + (typeof BEHEER_OMGEVING === 'string' ? BEHEER_OMGEVING : 'prod') + '.' + naam;
}

// Opslag in de vorm die wachtrij.js verwacht: { lees(sleutel), schrijf(sleutel, waarde) }. Waarden zijn JSON.
var beheerOpslag = {
  lees: function (naam) {
    try {
      var tekst = localStorage.getItem(beheerSleutel(naam));
      return tekst === null ? null : JSON.parse(tekst);
    } catch (e) { return null; }
  },
  schrijf: function (naam, waarde) {
    try { localStorage.setItem(beheerSleutel(naam), JSON.stringify(waarde)); return true; } catch (e) { return false; }
  },
  wis: function (naam) {
    try { localStorage.removeItem(beheerSleutel(naam)); } catch (e) { /* opslag niet beschikbaar */ }
  }
};

// Eén verzoek aan het koppelscript, met de sessie uit de opslag. Geeft het antwoord ({ok, ...}) of gooit bij geen verbinding,
// een tijdsoverschrijding of een onleesbaar antwoord.
function beheerVerzoek(actie, gegevens) {
  var verzoek = Object.assign({}, gegevens || {}, { actie: actie });
  var sessie = beheerOpslag.lees('sessie');
  if (actie !== 'beheerInloggen' && sessie && sessie.sessie) verzoek.sessie = sessie.sessie;
  var stop = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = stop ? setTimeout(function () { stop.abort(); }, BEHEER_TIJDSLIMIET_MS) : null;
  return fetch(API_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(verzoek),
    signal: stop ? stop.signal : undefined
  }).then(function (antwoord) {
    if (!antwoord.ok) throw new Error('Server gaf status ' + antwoord.status);
    return antwoord.json();
  }).then(function (uit) {
    if (timer) clearTimeout(timer);
    return uit;
  }, function (fout) {
    if (timer) clearTimeout(timer);
    throw fout;
  });
}

// Een direct opgehaald resultaat dat alleen in het geheugen blijft (nooit in localStorage), zoals de lijst van deelnemers en het wijkregister.
// maakDirecteLading('beheerDeelnemers') geeft { data, bezig, fout, haal(), vergeet(), bijWijziging } terug:
// haal() vraagt het opnieuw op (een lopende vraag krijgt zo een nieuw nummer; een laat antwoord op een oudere vraag telt niet meer mee),
// vergeet() wist alles (uitloggen, een sessiefout of een ander account). bijWijziging() wordt aangeroepen als bezig, data of fout veranderen.
function maakDirecteLading(actie) {
  var l = { actie: actie, data: null, bezig: false, fout: '', nr: 0, bijWijziging: null };
  function meld() { if (typeof l.bijWijziging === 'function') l.bijWijziging(); }
  l.vergeet = function () { l.nr++; l.data = null; l.bezig = false; l.fout = ''; };
  l.haal = function () {
    var nr = ++l.nr;
    var token = typeof sessieToken_ === 'function' ? sessieToken_() : null;
    l.bezig = true; l.fout = '';
    meld();
    return beheerVerzoek(actie).then(function (a) {
      if (nr !== l.nr || (typeof sessieToken_ === 'function' && sessieToken_() !== token)) return;
      l.bezig = false;
      if (a && a.ok === true) {
        var kopie = Object.assign({}, a); delete kopie.ok;
        l.data = kopie;
      } else if (a && a.code === 'SESSIE') {
        l.vergeet();
        if (typeof naarInloggen_ === 'function') naarInloggen_(a.melding || 'Je bent uitgelogd. Log opnieuw in.');
        return;
      } else if (a && a.code === 'RECHT') {
        l.data = null; l.fout = 'Dit mag je niet zien.';
      } else {
        l.fout = 'Het ophalen lukt nu niet. Probeer het zo nog eens.';
      }
      meld();
    }, function () {
      if (nr !== l.nr) return;
      l.bezig = false; l.fout = 'Geen verbinding. Probeer het zo nog eens.';
      meld();
    });
  };
  return l;
}
