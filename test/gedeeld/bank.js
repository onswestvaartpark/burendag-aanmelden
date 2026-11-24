// ING-export (CSV) lezen en filteren op de burendag. Gebruikt parseCsv uit csv.js. Alleen function/var op het hoogste niveau.

// Verplichte kolommen; Rekening, Code en Mutatiesoort zijn optioneel (zie BANK_OPTIONEEL).
var BANK_KOLOMMEN = {
  datum: 'Datum', naam: 'Naam / Omschrijving', tegenrekening: 'Tegenrekening',
  afBij: 'Af Bij', bedrag: 'Bedrag (EUR)', mededelingen: 'Mededelingen'
};
var BANK_OPTIONEEL = { rekening: 'Rekening', code: 'Code', mutatiesoort: 'Mutatiesoort' };

// FNV-1a 64 bit over de UTF-8-bytes van de tekst, met twee 32-bit helften. Geeft 16 kleine hexcijfers.
function bankFnv1a64_(tekst) {
  var hoog = 0xcbf29ce4;
  var laag = 0x84222325;
  var bytes = unescape(encodeURIComponent(tekst));
  for (var i = 0; i < bytes.length; i++) {
    laag = (laag ^ bytes.charCodeAt(i)) >>> 0;
    // vermenigvuldigen met de priemgetal 0x100000001b3 (hoog 0x100, laag 0x1b3) modulo 2^64
    var overdracht = Math.floor(laag * 0x1b3 / 4294967296);
    hoog = (Math.imul(hoog, 0x1b3) + Math.imul(laag, 0x100) + overdracht) >>> 0;
    laag = Math.imul(laag, 0x1b3) >>> 0;
  }
  return ('00000000' + hoog.toString(16)).slice(-8) + ('00000000' + laag.toString(16)).slice(-8);
}

function bankAfBij_(waarde) {
  var w = String(waarde).trim();
  var l = w.toLowerCase();
  return l === 'af' ? 'Af' : (l === 'bij' ? 'Bij' : w);
}

// Kenmerk van een bankregel: hash over datum|naam|tegenrekening|afBij|centen|mededelingen|volgnummer.
function bankKenmerk(velden, volgnummer) {
  return bankFnv1a64_([velden.datum, velden.naam, velden.tegenrekening, velden.afBij,
    String(velden.centen), velden.mededelingen, String(volgnummer)].join('|'));
}

// Tekst tussen "Omschrijving:" en het volgende label; labels mogen zonder spatie ervoor staan.
function haalOmschrijving(mededelingen) {
  var m = /Omschrijving:([\s\S]*?)(?:IBAN:|Kenmerk:|Valutadatum:|Machtiging|$)/.exec(mededelingen || '');
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

// "1.234,56" wordt 123456 (centen), zonder kommagetallen. Alleen de Nederlandse notatie: punten alleen als
// duizendtalscheiding in groepen van drie, een komma met hooguit twee decimalen. "36.00" of "12abc" geeft een fout.
var BANK_BEDRAG_PATROON_ = /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/;

function bankBedragNaarCenten_(tekst, regelnummer) {
  var s = String(tekst === undefined || tekst === null ? '' : tekst).trim();
  if (!BANK_BEDRAG_PATROON_.test(s)) throw new Error('Onleesbaar bedrag in regel ' + regelnummer);
  var delen = s.replace(/\./g, '').split(',');
  var euro = parseInt(delen[0], 10);
  var cent = parseInt(((delen[1] || '') + '00').slice(0, 2), 10);
  return euro * 100 + cent;
}

// "20270620" wordt "2027-06-20".
function bankDatumNaarIso_(tekst, regelnummer) {
  var m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(tekst).trim());
  if (!m) throw new Error('Onleesbare datum in regel ' + regelnummer);
  return m[1] + '-' + m[2] + '-' + m[3];
}

// Leest de export; geeft per regel datum, naam (getrimd), rekening, tegenrekening, code, afBij ('Af'|'Bij', genormaliseerd), centen, mutatiesoort,
// mededelingen, omschrijving en kenmerk. Het saldo wordt bewust niet overgenomen.
function parseIngCsv(tekst) {
  var eersteRegel = tekst.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
  var puntkomma = eersteRegel.split(';').length;
  var komma = eersteRegel.split(',').length;
  var rijen = parseCsv(tekst, puntkomma >= komma ? ';' : ',');
  if (rijen.length === 0) throw new Error('De bankexport is leeg: geen kolom gevonden');
  var kop = rijen[0].map(function (k) { return k.trim(); });
  var index = {};
  for (var sleutel in BANK_KOLOMMEN) {
    var i = kop.indexOf(BANK_KOLOMMEN[sleutel]);
    if (i < 0) throw new Error('De kolom "' + BANK_KOLOMMEN[sleutel] + '" ontbreekt in de bankexport');
    index[sleutel] = i;
  }
  for (var optie in BANK_OPTIONEEL) index[optie] = kop.indexOf(BANK_OPTIONEEL[optie]);
  var gezien = {};
  var regels = [];
  for (var r = 1; r < rijen.length; r++) {
    var rij = rijen[r];
    if (rij.length === 1 && rij[0].trim() === '') continue;
    if (rij.length < kop.length) throw new Error('Regel ' + (r + 1) + ' heeft te weinig kolommen');
    var regel = {
      datum: bankDatumNaarIso_(rij[index.datum], r + 1),
      naam: rij[index.naam].trim(),
      rekening: index.rekening < 0 ? '' : rij[index.rekening],
      tegenrekening: rij[index.tegenrekening],
      code: index.code < 0 ? '' : rij[index.code],
      afBij: bankAfBij_(rij[index.afBij]),
      centen: bankBedragNaarCenten_(rij[index.bedrag], r + 1),
      mutatiesoort: index.mutatiesoort < 0 ? '' : rij[index.mutatiesoort],
      mededelingen: rij[index.mededelingen]
    };
    regel.omschrijving = haalOmschrijving(regel.mededelingen);
    var identiteit = bankKenmerk(regel, 0);
    gezien[identiteit] = (gezien[identiteit] || 0) + 1;
    regel.kenmerk = bankKenmerk(regel, gezien[identiteit]);
    regels.push(regel);
  }
  return regels;
}

// Houdt de regels waarvan de omschrijving de zoektekst bevat (hoofdletterongevoelig, spaties genormaliseerd).
function filterBurendag(regels, zoektekst) {
  var norm = function (t) { return String(t).replace(/\s+/g, ' ').trim().toLowerCase(); };
  var zoek = norm(zoektekst);
  if (zoek === '') return []; // een lege instelling laat nooit alle regels door
  return regels.filter(function (regel) { return norm(regel.omschrijving).indexOf(zoek) >= 0; });
}
