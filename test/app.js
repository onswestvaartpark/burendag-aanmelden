// De aanmeldpagina: config laden, eventueel het eigen huishouden (?t=token) of de gegevens bij een uitnodigingslink (?uitnodiging=token), versturen en de antwoorden tonen.
// Vereist: config.js, gedeeld/*.js, verzoek.js, api.js, formulier.js.

// Het uitnodigingstoken (fase 2d) staat alleen in een lokale variabele van laadUitnodiging: nooit in de adresbalk (na het antwoord), in browseropslag of in een verzoek.
// uitnodiging = het uitnodigingstoken uit de link (fase 2d); alleen in het geheugen, nooit in de adresbalk, in browseropslag of in een verzoek.
const staat = { config: null, inst: null, token: '', tweedeHuishouden: false, bezig: false };

function contactAdres() {
  return (staat.config && staat.config.evenement && staat.config.evenement.contactEmail) || CONTACT_STANDAARD;
}

function mailLink(adres) {
  return el('a', { href: 'mailto:' + adres, tekst: adres });
}

// Toont een melding bovenaan: titel, alinea's (tekst of elementen) en optioneel het mailadres van de commissie.
function toonMelding(titel, alineas, metContact, soort) {
  const m = $('melding');
  m.textContent = '';
  m.className = 'melding' + (soort ? ' melding-' + soort : '');
  m.appendChild(el('h2', { tekst: titel }));
  alineas.forEach((a) => m.appendChild(typeof a === 'string' ? el('p', { tekst: a }) : a));
  if (metContact) m.appendChild(el('p', {}, ['Mail de commissie: ', mailLink(contactAdres())]));
  m.hidden = false;
  m.focus();
}

function verbergMelding() { $('melding').hidden = true; }

function zetBezig(bezig) {
  staat.bezig = bezig;
  ['versturen', 'afmelden', 'link-opnieuw', 'tweede-huishouden'].forEach((id) => { $(id).disabled = bezig; });
  $('versturen').textContent = bezig ? 'Bezig met versturen…' : (staat.token ? 'Wijziging opslaan' : 'Aanmelden');
  $('formulier').setAttribute('aria-busy', bezig ? 'true' : 'false');
}

function geenVerbinding() {
  toonMelding('Dat lukte niet', [
    'We konden de aanmelding niet bereiken. Controleer je internetverbinding en probeer het nog eens. Je invoer staat er nog.'
  ], true, 'fout');
}

// Meldingen bij een foutcode van het script.
const CODE_TEKSTEN = {
  NOG_NIET_OPEN: ['Aanmelden kan nog niet', 'De aanmelding is nog niet geopend.'],
  GESLOTEN: ['Aanmelden is gesloten', 'De aanmelding is gesloten: aanmelden, wijzigen en afmelden kan niet meer via de site. Wil je toch iets doorgeven? Neem contact op met de commissie.'],
  NA_OPGAVE: ['Wijzigen kan niet meer via de site', 'De aantallen zijn al doorgegeven aan de cateraar. Wil je nog iets veranderen of afmelden? Mail de commissie.'],
  TE_VEEL: ['Te veel aanmeldingen op dit adres', 'Op dit adres staan al het maximale aantal huishoudens. Klopt dat niet? Mail de commissie.'],
  ONBEKEND_TOKEN: ['Deze link kennen we niet', 'De link is onbekend of verlopen. Je kunt hieronder gewoon opnieuw aanmelden.'],
  GEWEIGERD: ['Dat lukte niet', 'Je aanmelding is niet verwerkt. Probeer het opnieuw of mail de commissie.'],
  FOUT: ['Er ging iets mis', 'Er ging aan onze kant iets mis. Je invoer staat er nog; probeer het later opnieuw of mail de commissie.']
};

function toonCode(antwoord) {
  if (antwoord.contact && staat.config) staat.config.evenement.contactEmail = antwoord.contact;
  if (antwoord.code === 'BESTAAT_AL') { toonBestaatAl(); return; }
  const [titel, tekst] = CODE_TEKSTEN[antwoord.code] || CODE_TEKSTEN.FOUT;
  toonMelding(titel, [tekst], true, 'fout');
}

// ---- opstarten ----

// Haalt de parameter uitnodiging uit de adresbalk, zodat het token niet in de geschiedenis, een bladwijzer of een gedeelde link blijft staan.
function verwijderUitnodigingUitAdres() {
  history.replaceState(null, '', adresZonderUitnodiging(location.pathname, location.search, location.hash));
}

// Fase 2d: de uitnodigingslink. Vraagt de gegevens op en vult het formulier (zonder het vinkje 'bewaren': dat zet de buur zelf opnieuw).
// Geeft true als de pagina klaar is (formulier of melding getoond); false als de gewone start verder moet (de aanmeldperiode is niet open).
async function laadUitnodiging(uitnodiging) {
  let antwoord;
  try {
    antwoord = await haalUitnodiging(uitnodiging);
  } catch (e) {
    antwoord = null;
  }
  const code = antwoord && antwoord.code;
  const definitief = !!antwoord && (antwoord.ok === true || ['UITNODIGING_ONGELDIG', 'UITNODIGING_AL_AANGEMELD', 'NOG_NIET_OPEN', 'GESLOTEN'].indexOf(code) !== -1);
  if (!definitief) {
    // geen verbinding of een fout van de server: het token blijft in de adresbalk, zodat opnieuw laden het nog eens probeert
    toonMelding('Gegevens niet opgehaald', ['We konden je gegevens nu niet ophalen. Laad de pagina over een minuut opnieuw.'], false);
    toonLeegFormulier(false);
    return true;
  }
  verwijderUitnodigingUitAdres();
  if (antwoord.ok === true) {
    vulVelden(veldenUitUitnodiging(antwoord), staat.inst);
    $('formulier').hidden = false;
    toonBedrag(staat.inst);
    toonMelding('Je gegevens staan klaar', ['We hebben je gegevens van vorig jaar alvast ingevuld. Kijk ze even na.'], false, 'goed');
    return true;
  }
  if (code === 'UITNODIGING_AL_AANGEMELD') {
    toonMelding('Dit adres is al aangemeld', [typeof antwoord.melding === 'string' ? antwoord.melding : 'Dit adres is al aangemeld. Gebruik de wijziglink uit je bevestigingsmail.'], true);
    return true;
  }
  if (code === 'NOG_NIET_OPEN' || code === 'GESLOTEN') { toonCode(antwoord); return true; }
  const melding = typeof antwoord.melding === 'string' ? antwoord.melding
    : 'Deze uitnodigingslink is niet (meer) geldig. Je kunt je gewoon aanmelden via het formulier.';
  toonMelding('Uitnodigingslink', [melding], false);
  toonLeegFormulier(false);
  return true;
}

async function start() {
  const params = new URLSearchParams(location.search);
  const token = params.get('t') || '';
  const uitnodiging = params.get('uitnodiging') || '';
  let config;
  try {
    if (typeof API_URL !== 'string' || !API_URL) throw new Error('API_URL ontbreekt in config.js');
    config = await haalConfig();
  } catch (e) {
    $('laden').hidden = true;
    toonMelding('De aanmelding kon niet laden', ['Controleer je internetverbinding en laad de pagina opnieuw.'], true, 'fout');
    return;
  }
  $('laden').hidden = true;
  if (!config || !config.evenement) { toonCode(Object.assign({ code: 'FOUT' }, config || {})); return; }

  staat.config = config;
  staat.inst = instellingenUitConfig(config);
  toonEvenement(config);
  bouwFormulier(config, staat.inst);
  koppelKnoppen();

  if (token && uitnodiging) verwijderUitnodigingUitAdres(); // een eigen wijziglink gaat voor; het uitnodigingstoken hoeft niet in de adresbalk te blijven
  if (token) {
    let antwoord;
    try {
      antwoord = await haalHuishouden(token);
    } catch (e) {
      toonMelding('Je aanmelding kon niet laden', ['Controleer je internetverbinding en open de link opnieuw.'], true, 'fout');
      return;
    }
    if (antwoord.ok) { toonWijzigen(token, antwoord.aanmelding); return; }
    if (antwoord.code !== 'ONBEKEND_TOKEN') { toonCode(antwoord); return; }
    history.replaceState(null, '', location.pathname);
    if (config.status === 'open') {
      toonCode(antwoord);
      toonLeegFormulier(false);
      return;
    }
  }

  if (uitnodiging) {
    // een eigen wijziglink (?t=) gaat voor; buiten de aanmeldperiode is er niets in te vullen
    if (token || config.status !== 'open') verwijderUitnodigingUitAdres();
    else if (await laadUitnodiging(uitnodiging)) return;
  }

  if (config.status === 'nog_niet_open') {
    toonMelding('Aanmelden kan nog niet', [
      'De aanmelding gaat open op ' + datumTekst(config.datums.open, true) + '. Kom dan terug op deze pagina.'
    ], true);
    return;
  }
  if (config.status === 'gesloten') {
    toonMelding('Aanmelden is gesloten', ['De aanmelding voor dit jaar is gesloten. Wil je toch nog mee of iets doorgeven?'], true);
    return;
  }
  toonLeegFormulier(true);
}

function toonEvenement(config) {
  const e = config.evenement;
  if (e.naam) { $('titel').textContent = e.naam; document.title = 'Aanmelden – ' + e.naam; }
  // kopregel boven de titel (instelling evenement.kop); leeg = niet tonen
  const kop = typeof e.kop === 'string' ? e.kop.trim() : '';
  $('kop-boven').textContent = kop;
  $('kop-boven').hidden = kop === '';
  const delen = [datumTekst(e.datum, true), e.locatie].filter(Boolean);
  $('wanneer').textContent = delen.join(' · ');
  if (config.datums && config.datums.sluit) {
    $('intro').textContent = 'Meld je huishouden aan vóór ' + datumTekst(config.datums.sluit) + '. Het invullen duurt een paar minuten.';
  }
  const voet = $('contact-voet');
  voet.textContent = contactAdres();
  voet.href = 'mailto:' + contactAdres();
}

function toonLeegFormulier(verbergMeldingen) {
  if (verbergMeldingen) verbergMelding();
  voegPersoonToe(staat.inst, null);
  $('formulier').hidden = false;
  toonBedrag(staat.inst);
}

function toonWijzigen(token, aanmelding) {
  staat.token = token;
  const velden = veldenUitAanmelding(aanmelding, token);
  vulVelden(velden, staat.inst);
  $('straat').disabled = true;
  $('huisnummer').readOnly = true;
  $('straatElders').readOnly = true;
  $('hint-adres-vast').hidden = false;
  $('hint-rekeninghouder-houden').hidden = false;
  $('rekeninghouder').setAttribute('aria-describedby', 'hint-rekeninghouder hint-rekeninghouder-houden');
  $('versturen').textContent = 'Wijziging opslaan';
  $('afmelden').hidden = false;
  const afgemeld = aanmelding.huishouden && aanmelding.huishouden.status === 'afgemeld';
  $('intro').textContent = afgemeld
    ? 'Jullie zijn afgemeld. Toch mee? Pas hieronder aan wie er komen en sla de wijziging op.'
    : 'Hier pas je jullie aanmelding aan. Vergeet niet op "Wijziging opslaan" te drukken.';
  $('afmelden').hidden = afgemeld;
  $('formulier').hidden = false;
  toonBedrag(staat.inst);
}

function koppelKnoppen() {
  const formulier = $('formulier');
  formulier.addEventListener('input', () => toonBedrag(staat.inst));
  formulier.addEventListener('change', () => toonBedrag(staat.inst));
  formulier.addEventListener('submit', (e) => { e.preventDefault(); verstuur(false); });
  $('afmelden').addEventListener('click', afmelden);
  $('link-opnieuw').addEventListener('click', linkOpnieuw);
  $('tweede-huishouden').addEventListener('click', () => verstuur(true));
  $('terug-naar-formulier').addEventListener('click', () => {
    $('bestaat-al').hidden = true;
    $('formulier').hidden = false;
    $('straat').focus();
  });
  $('kopieer').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('wijziglink').href);
      $('gekopieerd').textContent = 'Gekopieerd.';
    } catch (e) {
      $('gekopieerd').textContent = 'Kopiëren lukte niet; houd de link ingedrukt om hem te kopiëren.';
    }
  });
}

// ---- versturen ----

// Vervangt de algemene geboortemelding bij een kind door een duidelijkere.
function verduidelijk(fouten, velden) {
  return fouten.map((f) => {
    const m = /^personen\[(\d+)\]\.geboorte$/.exec(f.veld);
    if (m && velden.personen[Number(m[1])] && velden.personen[Number(m[1])].kind) {
      return { veld: f.veld, melding: 'Vul de geboortemaand en het geboortejaar van het kind in (niet na de dag van het feest).' };
    }
    return f;
  });
}

function toonVeldfouten(fouten, velden) {
  const eerste = toonFouten(verduidelijk(fouten, velden));
  if (eerste) eerste.focus(); else $('foutoverzicht').focus();
}

async function verstuur(tweedeHuishouden) {
  if (staat.bezig) return;
  verbergMelding();
  const velden = leesVelden(staat.token, tweedeHuishouden);
  const verzoek = verzoekUitFormulier(velden);
  const controle = valideerVerzoek(verzoek, staat.inst);
  if (!controle.ok && controle.fouten) {
    $('bestaat-al').hidden = true;
    $('formulier').hidden = false;
    toonVeldfouten(controle.fouten, velden);
    return;
  }
  wisFouten();
  zetBezig(true);
  let antwoord;
  try {
    antwoord = await stuurVerzoek(verzoek);
  } catch (e) {
    zetBezig(false);
    $('bestaat-al').hidden = true;
    $('formulier').hidden = false;
    geenVerbinding();
    return;
  }
  zetBezig(false);
  staat.tweedeHuishouden = tweedeHuishouden;
  if (antwoord.ok) { toonKlaar(antwoord, staat.token ? 'wijzigen' : 'aanmelden', velden); return; }
  if (antwoord.fouten) {
    $('bestaat-al').hidden = true;
    $('formulier').hidden = false;
    toonVeldfouten(antwoord.fouten, velden);
    return;
  }
  if (antwoord.code === 'BESTAAT_AL' && tweedeHuishouden) {
    // Regel 10: hetzelfde e-mailadres staat al actief op dit adres.
    $('bestaat-al').hidden = true;
    $('formulier').hidden = false;
    toonMelding('Dit e-mailadres is hier al aangemeld', [
      'Op dit adres is al een huishouden aangemeld met dit e-mailadres. Zijn jullie echt een tweede huishouden? ' +
      'Vul dan je eigen e-mailadres in en verstuur opnieuw. Wil je de bestaande aanmelding aanpassen, vraag dan de wijziglink opnieuw aan.'
    ], false, 'fout');
    $('email').focus();
    return;
  }
  toonCode(antwoord);
}

function toonBestaatAl() {
  $('formulier').hidden = true;
  verbergMelding();
  const blok = $('bestaat-al');
  blok.hidden = false;
  blok.focus();
}

async function linkOpnieuw() {
  if (staat.bezig) return;
  const velden = leesVelden('', false);
  zetBezig(true);
  let antwoord;
  try {
    antwoord = await stuurVerzoek({ actie: 'linkOpnieuw', adres: { straat: velden.straat, straatElders: velden.straatElders, huisnummer: velden.huisnummer, toevoeging: '' }, website: velden.website });
  } catch (e) {
    zetBezig(false);
    geenVerbinding();
    return;
  }
  zetBezig(false);
  if (!antwoord.ok) {
    if (antwoord.fouten) { $('bestaat-al').hidden = true; $('formulier').hidden = false; toonVeldfouten(antwoord.fouten, velden); return; }
    toonCode(antwoord);
    return;
  }
  $('bestaat-al').hidden = true;
  toonMelding('Kijk in je mail', [
    'We hebben de persoonlijke wijziglink opnieuw gemaild naar het e-mailadres van de aanmelding op dit adres. ' +
    'Niets ontvangen? Kijk ook in je map met ongewenste mail.'
  ], true, 'goed');
}

async function afmelden() {
  if (staat.bezig || !staat.token) return;
  if (!window.confirm('Weet je zeker dat je jullie hele huishouden wilt afmelden?')) return;
  zetBezig(true);
  let antwoord;
  try {
    antwoord = await stuurVerzoek({ actie: 'afmelden', token: staat.token });
  } catch (e) {
    zetBezig(false);
    geenVerbinding();
    return;
  }
  zetBezig(false);
  if (antwoord.ok) { toonKlaar(antwoord, 'afmelden', null); return; }
  toonCode(antwoord);
}

// ---- klaar ----

function veiligeLink(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}

function toonKlaar(antwoord, actie, velden) {
  $('formulier').hidden = true;
  $('bestaat-al').hidden = true;
  verbergMelding();
  const teksten = {
    aanmelden: ['Gelukt, jullie zijn aangemeld!', 'Je krijgt zo een bevestiging per mail' + (velden && velden.email ? ' op ' + velden.email.trim() : '') + '.'],
    wijzigen: ['Je wijziging is opgeslagen', 'Je krijgt een bevestiging per mail met het nieuwe overzicht.'],
    afmelden: ['Jullie zijn afgemeld', 'Jammer dat jullie er niet bij zijn. Je krijgt een bevestiging per mail. Al betaald? De commissie neemt contact met je op.']
  };
  // Zelfde betekenis als de betaalregel in de mail (zie betaalWeergave in verzoek.js).
  const betaal = betaalWeergave(antwoord, actie);
  const stap = klaarBetaalstap(betaal, teksten[actie][0]);
  $('kop-klaar').textContent = stap.kop;
  $('klaar-tekst').textContent = teksten[actie][1];
  $('afrondblok').hidden = !stap.laatsteStap;
  $('afrond-regel').textContent = stap.regel || '';
  $('klaar').classList.toggle('klaar-afronden', stap.laatsteStap);
  const betaalteksten = {
    betalen: 'Nog te betalen: ' + euro(betaal.openstaand),
    volgt: 'Nog te betalen: ' + euro(betaal.openstaand),
    betaald: 'Je bijdrage is al betaald.',
    terug: 'Je hebt te veel betaald, dit krijg je terug.'
  };
  // Bij 'betalen' staan regel en knop bovenaan (afrondblok); het gewone betaalblok is er dan niet.
  $('betaalblok').hidden = betaal.soort === 'geen' || betaal.soort === 'betalen';
  $('klaar-bedrag').textContent = betaalteksten[betaal.soort] || '';
  if (betaal.soort === 'betalen') $('betaalknop').href = betaal.link;
  $('betaal-volgt').hidden = betaal.soort !== 'volgt';

  const wijzig = veiligeLink(antwoord.wijziglink);
  $('wijziglink-blok').hidden = !wijzig || actie === 'afmelden';
  if (wijzig) {
    $('wijziglink').href = wijzig;
    $('wijziglink').textContent = wijzig;
  }
  const klaar = $('klaar');
  klaar.hidden = false;
  klaar.focus();
  window.scrollTo(0, 0);
}

// Vangnet: een onverwachte fout (bijvoorbeeld een script dat niet laadde) mag nooit een lege pagina geven.
// Werkt ook als formulier.js (met $ en el) zelf niet laadde: dan zonder hulpfuncties.
function toonStartfout() {
  document.getElementById('laden').hidden = true;
  document.getElementById('formulier').hidden = true;
  try {
    toonMelding('Er ging iets mis', ['De aanmelding kon niet goed laden. Laad de pagina opnieuw.'], true, 'fout');
  } catch (e) {
    const m = document.getElementById('melding');
    m.textContent = 'Er ging iets mis bij het laden van de aanmelding. Laad de pagina opnieuw of mail de commissie: ' + contactAdres();
    m.className = 'melding melding-fout';
    m.hidden = false;
  }
}
start().catch(toonStartfout);
