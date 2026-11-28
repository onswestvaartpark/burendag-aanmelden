// Mailteksten invullen. Alleen function/var op het hoogste niveau (draait in Apps Script en Node).

var DAGEN_NL = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
var MAANDEN_NL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

// 44 -> '€ 44,00'; 2572 -> '€ 2.572,00'
function formatteerBedrag(bedrag) {
  var tekst = Number(bedrag).toFixed(2);
  var delen = tekst.split('.');
  var hele = delen[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return '€ ' + hele + ',' + delen[1];
}

// '2027-09-25' -> 'zaterdag 25 september 2027'
function formatteerDatum(datum) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(datum));
  if (!m) throw new Error('Ongeldige datum: ' + datum);
  var jaar = Number(m[1]), maand = Number(m[2]), dag = Number(m[3]);
  var weekdag = new Date(Date.UTC(jaar, maand - 1, dag)).getUTCDay();
  return DAGEN_NL[weekdag] + ' ' + dag + ' ' + MAANDEN_NL[maand - 1] + ' ' + jaar;
}

function escapeHtml(tekst) {
  return String(tekst)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Vervangt {{sleutel}} in tekst. Zowel de vaste tekst als de waarden worden HTML-veilig gemaakt,
// behalve de waarden van de sleutels in ruweSleutels (die al veilige HTML bevatten).
// Een onbekende plaatshouder is een fout.
function vulSjabloon(tekst, waarden, ruweSleutels) {
  return vulIntern(escapeHtml(tekst), waarden, ruweSleutels || []);
}

function vulIntern(tekst, waarden, ruw) {
  return String(tekst).replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, function (_, sleutel) {
    if (!Object.prototype.hasOwnProperty.call(waarden, sleutel)) {
      throw new Error('Onbekende plaatshouder: ' + sleutel);
    }
    var waarde = waarden[sleutel] === null || waarden[sleutel] === undefined ? '' : waarden[sleutel];
    return ruw.indexOf(sleutel) >= 0 ? String(waarde) : escapeHtml(waarde);
  });
}

// '2 × Jongere en volwassene, 1 × Kind 5-12' (volgorde van berekening.aantallen, nul wordt overgeslagen)
function maakOverzicht(berekening) {
  var delen = [];
  for (var groep in berekening.aantallen) {
    if (!Object.prototype.hasOwnProperty.call(berekening.aantallen, groep)) continue;
    var aantal = berekening.aantallen[groep];
    if (aantal > 0) delen.push(aantal + ' × ' + groep);
  }
  return delen.join(', ');
}

// Betaalregel uit bedrag, al betaald en (optioneel) de betaallink voor het openstaande bedrag.
function maakBetaalregel(bedrag, betaallink, betaald) {
  var cent = Math.round(Number(bedrag) * 100);
  var ontvangen = Math.round(Number(betaald || 0) * 100);
  if (cent === 0 && ontvangen === 0) return '';
  if (ontvangen > cent) return 'Je hebt ' + formatteerBedrag((ontvangen - cent) / 100) + ' te veel betaald, dit krijg je terug.';
  if (ontvangen === cent) return 'Je bijdrage is al betaald.';
  var link = betaallink ? '<a href="' + escapeHtml(betaallink) + '">deze betaallink</a>' : '';
  if (ontvangen === 0) return link ? 'Betaal je bijdrage via ' + link + '.' : 'De betaallink volgt in een aparte mail.';
  var begin = 'Je betaalde al ' + formatteerBedrag(ontvangen / 100) + '. ';
  var verschil = formatteerBedrag((cent - ontvangen) / 100);
  return begin + (link ? 'Betaal het verschil van ' + verschil + ' via ' + link + '.' : 'De betaallink voor het verschil van ' + verschil + ' volgt in een aparte mail.');
}

// -> { aan, onderwerp, html }. links: { betaallink, wijziglink, uitnodigingslink }. Geen namen van huisgenoten, geen dieet.
// Plaatshouders: voornaam, evenement, datum, overzicht, bedrag, contact (commissieadres), betaalregel, wijziglink,
// en (fase 2d) opent en sluit (de datums waarop de aanmelding open gaat en sluit) en uitnodigingslink (de persoonlijke link naar het vooraf ingevulde formulier).
// De mail 'uitnodiging' heeft geen berekening (null) en geen bedrag nodig; overzicht is dan leeg.
function maakMail(sleutel, aanmelding, berekening, instellingen, links) {
  var mailtekst = instellingen.mailteksten && instellingen.mailteksten[sleutel];
  if (!mailtekst) throw new Error('Onbekende mail: ' + sleutel);
  var gekozen = links || {};
  var huishouden = aanmelding.huishouden;
  var bedrag = berekening ? berekening.totaal : 0;
  var wijziglink = gekozen.wijziglink || '';
  var uitnodigingslink = gekozen.uitnodigingslink || '';
  if (sleutel === 'uitnodiging' && !uitnodigingslink) throw new Error('uitnodigingslink ontbreekt voor mail: ' + sleutel);
  if (!berekening && sleutel !== 'uitnodiging') throw new Error('berekening ontbreekt voor mail: ' + sleutel);
  var datums = instellingen.datums || {};
  if (!wijziglink && (sleutel === 'bevestiging' || sleutel === 'wijziging' || sleutel === 'link_opnieuw' || sleutel === 'betaallink')) {
    throw new Error('wijziglink ontbreekt voor mail: ' + sleutel);
  }
  var basis = {
    voornaam: huishouden.voornaam,
    evenement: instellingen.evenement.naam,
    datum: formatteerDatum(instellingen.evenement.datum),
    overzicht: berekening ? maakOverzicht(berekening) : '',
    bedrag: formatteerBedrag(bedrag),
    contact: instellingen.evenement.contactEmail,
    opent: datums.open ? formatteerDatum(datums.open) : '',
    sluit: datums.sluit ? formatteerDatum(datums.sluit) : ''
  };
  var html = {};
  var platte = {};
  for (var k in basis) { html[k] = basis[k]; platte[k] = String(basis[k]).replace(/[\r\n]+/g, ' '); }
  html.betaalregel = maakBetaalregel(bedrag, gekozen.betaallink, huishouden.betaald);
  html.wijziglink = '<a href="' + escapeHtml(wijziglink) + '">' + escapeHtml(wijziglink) + '</a>';
  html.uitnodigingslink = '<a href="' + escapeHtml(uitnodigingslink) + '">' + escapeHtml(uitnodigingslink) + '</a>';
  html.contact = '<a href="mailto:' + escapeHtml(basis.contact) + '">' + escapeHtml(basis.contact) + '</a>';
  platte.betaalregel = '';
  platte.wijziglink = wijziglink.replace(/[\r\n]+/g, ' ');
  platte.uitnodigingslink = uitnodigingslink.replace(/[\r\n]+/g, ' ');
  var alleSleutels = Object.keys(platte);
  return {
    aan: huishouden.email,
    onderwerp: vulIntern(mailtekst.onderwerp, platte, alleSleutels),
    html: vulSjabloon(mailtekst.tekst, html, ['betaalregel', 'wijziglink', 'uitnodigingslink', 'contact']).replace(/\r?\n/g, '<br>')
  };
}
