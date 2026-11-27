// Telefoonnummers: herstellen en opmaken voor weergave. Pure functies; geen Google-diensten, geen DOM.
// Alleen function/var op het hoogste niveau (deze file wordt in Apps Script, op de pagina en in Node geladen).
//
// Waarom herstellen: staat een nummer in een Sheet-cel als getal, dan is de voorloopnul weg (0612345678 wordt 612345678).
// Een nummer van precies 9 cijfers zonder voorloopnul (getal of tekst) is in Nederland altijd zo ontstaan: telefoonHerstel zet de 0 terug.

// Netnummers van drie cijfers (010, 020, 030, 040, 050, 070 en de andere grote netten); alle andere netnummers (0172, 0251, ...) hebben vier cijfers.
// Bewust eenvoudig gehouden: de lijst staat hier, op een plek, en wie hem aanpast past alleen de opmaak aan.
var TELEFOON_NETNUMMERS_3 = ['010', '013', '014', '015', '020', '023', '024', '026', '030', '033', '035', '036', '038',
  '040', '043', '045', '046', '050', '053', '055', '058', '070', '071', '072', '073', '074', '075', '076', '077', '078', '079',
  '084', '085', '087', '088'];

// De cel of invoer als tekst, met een ontbrekende voorloopnul teruggezet. Alles wat geen nummer van 9 cijfers is, blijft zoals het is (alleen getrimd).
function telefoonHerstel(waarde) {
  if (waarde === undefined || waarde === null) return '';
  var t = String(waarde).trim();
  if (/^[1-9]\d{8}$/.test(t)) return '0' + t;
  return t;
}

// Alleen de cijfers van een nummer, met +31 vervangen door 0 (ook +31 (0) 6...); voor de href van een tel:-link en om nummers te vergelijken.
// Geeft '' als de tekst geen nummer lijkt (letters of andere tekens).
function telefoonCijfers(waarde) {
  var t = telefoonHerstel(waarde);
  if (t === '' || !/^[+()\d\s.\/-]+$/.test(t)) return '';
  var landcode = /^\s*(\+|00)\s*31\s*(?:\(\s*0\s*\))?/.exec(t);
  if (landcode) return '0' + t.slice(landcode[0].length).replace(/\D/g, '');
  return t.replace(/\D/g, '');
}

// Sleutel om twee nummers te vergelijken: de cijfers (612345678, 0612345678, 06-12345678 en +31 6 12345678 zijn gelijk), anders de getrimde tekst.
function telefoonSleutel(waarde) {
  var c = telefoonCijfers(waarde);
  return c !== '' ? c : telefoonHerstel(waarde);
}

// Het nummer voor weergave: mobiel 06-12345678; vast met netnummer en abonneenummer, 010-1234567 of 0172-426336 (drie of vier cijfers netnummer, zie TELEFOON_NETNUMMERS_3).
// Alles wat geen Nederlands nummer van 10 cijfers is (ook buitenlandse nummers), blijft zoals het was (getrimd).
function telefoonOpmaak(waarde) {
  var oorspronkelijk = telefoonHerstel(waarde);
  var c = telefoonCijfers(waarde);
  if (!/^0[1-9]\d{8}$/.test(c)) return oorspronkelijk;
  if (/^(\+|00)/.test(oorspronkelijk) && !/^(\+|00)\s*31/.test(oorspronkelijk)) return oorspronkelijk;
  if (c.slice(0, 2) === '06') return '06-' + c.slice(2);
  var lengte = TELEFOON_NETNUMMERS_3.indexOf(c.slice(0, 3)) !== -1 ? 3 : 4;
  return c.slice(0, lengte) + '-' + c.slice(lengte);
}
