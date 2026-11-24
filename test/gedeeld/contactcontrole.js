// Controle van de contactgegevens die de commissie op de beheerpagina corrigeert of toevoegt (naam, e-mail, telefoon).
// Puur; dezelfde functie draait op de pagina (voor het versturen) en op de server (voor het opslaan en in de verwerker).
// Vereist gedeeld/validatie.js (valTekstveld_, valIsEmail_, valIsTelefoon_). Alleen function/var op het hoogste niveau.

var CONTACT_MAX_TEKENS = 120;

// c = { voornaam, achternaam, email, telefoon } (alles tekst). Geeft { fouten: [Nederlandse meldingen], schoon: { voornaam, achternaam, email, telefoon } }.
// De voornaam is verplicht; e-mail en telefoon mogen leeg zijn. Het e-mailadres wordt in kleine letters bewaard.
function controleerContactGegevens(c) {
  var invoer = c !== null && typeof c === 'object' && !Array.isArray(c) ? c : {};
  var fouten = [];
  var schoon = {
    voornaam: valTekstveld_(fouten, 'voornaam', invoer.voornaam, true, CONTACT_MAX_TEKENS, 'een voornaam'),
    achternaam: valTekstveld_(fouten, 'achternaam', invoer.achternaam, false, CONTACT_MAX_TEKENS, 'de achternaam'),
    email: valTekstveld_(fouten, 'email', invoer.email, false, CONTACT_MAX_TEKENS, 'het e-mailadres').toLowerCase(),
    telefoon: valTekstveld_(fouten, 'telefoon', invoer.telefoon, false, CONTACT_MAX_TEKENS, 'het telefoonnummer')
  };
  if (schoon.email !== '' && schoon.email.length <= CONTACT_MAX_TEKENS && !valIsEmail_(schoon.email)) fouten.push({ veld: 'email', melding: 'Vul een geldig e-mailadres in, of laat het leeg.' });
  if (schoon.telefoon !== '' && schoon.telefoon.length <= CONTACT_MAX_TEKENS && !valIsTelefoon_(schoon.telefoon)) fouten.push({ veld: 'telefoon', melding: 'Vul een geldig telefoonnummer in (alleen cijfers, spaties en + - ( ) ), of laat het leeg.' });
  return { fouten: fouten.map(function (f) { return f.melding; }), schoon: schoon };
}
