// Fase 2d: het blok 'Uitnodigingen' in het scherm Wijkregister. De pure functies hier zijn getest met Node (test/uitnodiging.test.js); het tekenen
// staat in scherm-wijkregister.js. De aantallen komen direct van het achterwerk (beheerUitnodigingen) en staan alleen in het geheugen van de pagina:
// er staan geen namen, e-mailadressen of tokens in. Vereist: gedeeld/rechten.js (heeftRecht).

// Het blok is er alleen voor wie mails mag versturen én persoonsgegevens mag zien (de verwerker op de server controleert dat nog eens).
function uitnodigenMag(rechten) {
  return heeftRecht(rechten || [], 'mails_versturen') && heeftRecht(rechten || [], 'persoonsgegevens_zien');
}

// '2027-06-15' -> '15-06-2027'; iets anders blijft zoals het is.
function uitnodigenDatum(d) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
  return m ? m[3] + '-' + m[2] + '-' + m[1] : String(d || '');
}

function uitnodigenMeervoud_(n, een, meer) {
  return n + ' ' + (n === 1 ? een : meer);
}

// De vraag in de pagina voordat er iets wordt verstuurd. nu = { adressen, mails }.
function uitnodigenVraag(nu) {
  return nu.mails + ' mails naar ' + nu.adressen + ' adressen versturen?';
}

// De vraag voor 'Iedereen opnieuw uitnodigen'. nu = { adressen, mails } van d.opnieuw.nu: ook wie al een uitnodiging kreeg, met dezelfde link.
function uitnodigenOpnieuwVraag(nu) {
  return 'Iedereen opnieuw uitnodigen: ' + nu.mails + ' mails naar ' + nu.adressen + ' adressen versturen, ook naar wie al een uitnodiging kreeg?';
}

// Mag er nu verstuurd worden? Alleen als er iemand is (nieuw, of opnieuw voor iedereen) en de aanmelding niet gesloten is (of de editie op slot staat).
function uitnodigenKanVersturen(d) {
  if (!d || !d.nu || d.status === 'gesloten' || d.status === 'op_slot') return false;
  return d.nu.adressen > 0 || !!(d.opnieuw && d.opnieuw.nu && d.opnieuw.nu.adressen > 0);
}

// De regels onder de kop, uit het antwoord van beheerUitnodigingen (d).
function uitnodigenRegels(d) {
  var regels = [];
  if (d.nu.adressen > 0) {
    regels.push('Nu te versturen: ' + uitnodigenMeervoud_(d.nu.mails, 'mail', 'mails') + ' naar ' + uitnodigenMeervoud_(d.nu.adressen, 'adres', 'adressen') + '.');
  } else {
    regels.push('Er is niemand om uit te nodigen: iedereen is al uitgenodigd of aangemeld, de bewaartermijn is verlopen of er is geen e-mailadres.');
  }
  if (d.rest.adressen > 0) {
    regels.push('Per keer gaan er hooguit ' + d.max + ' adressen mee. Daarna blijven er nog ' + uitnodigenMeervoud_(d.rest.adressen, 'adres', 'adressen') + ' (' +
      uitnodigenMeervoud_(d.rest.mails, 'mail', 'mails') + ') te versturen: verstuur daarna nog een keer.');
  }
  if (d.alUitgenodigd > 0) regels.push('Al uitgenodigd voor deze editie: ' + uitnodigenMeervoud_(d.alUitgenodigd, 'adres', 'adressen') + '.');
  if (d.status === 'nog_niet_open') regels.push('De aanmelding gaat pas open op ' + uitnodigenDatum(d.opent) + ': de link werkt vanaf die dag.');
  if (d.status === 'gesloten' || d.status === 'op_slot') regels.push('De aanmelding is gesloten of de editie staat op slot: uitnodigen kan niet meer.');
  return regels;
}
