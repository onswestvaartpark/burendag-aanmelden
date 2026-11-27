// Praat met het koppelscript. API_URL komt uit config.js.
// GET ?actie=config | ?actie=huishouden&token=…; POST met het verzoek als JSON (ook uitnodigingLezen: het uitnodigingstoken gaat in de body, niet in een url).
// POST gaat als text/plain, zodat de browser geen extra CORS-vooraanvraag doet (Apps Script kan die niet beantwoorden).
// Elke functie geeft het antwoord van het script, of gooit een fout bij geen verbinding of een onleesbaar antwoord.

function apiAdres(params) {
  var basis = typeof API_URL === 'string' ? API_URL : '';
  return basis + (basis.indexOf('?') === -1 ? '?' : '&') + new URLSearchParams(params).toString();
}

async function apiLees(antwoord) {
  if (!antwoord.ok) throw new Error('Server gaf status ' + antwoord.status);
  return antwoord.json();
}

async function haalConfig() {
  return apiLees(await fetch(apiAdres({ actie: 'config' }), { redirect: 'follow' }));
}

async function haalHuishouden(token) {
  return apiLees(await fetch(apiAdres({ actie: 'huishouden', token: token }), { redirect: 'follow' }));
}

async function stuurVerzoek(verzoek) {
  return apiLees(await fetch(API_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(verzoek)
  }));
}

// Fase 2d: de gegevens bij een uitnodigingslink. Antwoord: { ok: true, adres, contact, bewoners, spullen } of { ok: false, code, melding }.
async function haalUitnodiging(token) {
  return stuurVerzoek({ actie: 'uitnodigingLezen', token: token });
}
