// Omzetten tussen formuliervelden en het verzoek aan het script. Alleen function/var op het hoogste niveau:
// dit bestand draait via een <script>-tag in de browser en via test/hulp/laad.js in Node.
// Vereist: gedeeld/adrescode.js (isElders).

// Geboortemaand of -jaar van een kind als geheel getal; leeg of onzin wordt NaN, zodat valideerVerzoek
// een fout geeft in plaats van het kind stilletjes als volwassene te tellen.
function verzoekGetal_(w) {
  var t = (w === undefined || w === null) ? '' : String(w).trim();
  return /^\d{1,4}$/.test(t) ? parseInt(t, 10) : NaN;
}

function verzoekTekst_(w) {
  return (w === undefined || w === null) ? '' : String(w);
}

// Het adres voor het verzoek; bij Elders (andere straat) gaat de getypte straat mee als straatElders.
function verzoekAdres_(v) {
  var adres = { straat: verzoekTekst_(v.straat), huisnummer: verzoekTekst_(v.huisnummer), toevoeging: '' };
  if (isElders(adres.straat)) adres.straatElders = verzoekTekst_(v.straatElders);
  return adres;
}

// velden = { straat, straatElders (alleen bij Elders), huisnummer, voornaam, achternaam, email, telefoon, rekeninghouder,
//   personen: [{ voornaam, kind, maand, jaar, dieet, toelichting, eetMee, ehbo }], hulp, spullen,
//   bewaren, activiteiten, website, token, tweedeHuishouden }
function verzoekUitFormulier(velden) {
  var v = velden || {};
  var personen = [];
  var lijst = v.personen || [];
  for (var i = 0; i < lijst.length; i++) {
    var p = lijst[i] || {};
    var persoon = { voornaam: verzoekTekst_(p.voornaam) };
    if (p.kind === true) {
      persoon.geboortemaand = verzoekGetal_(p.maand);
      persoon.geboortejaar = verzoekGetal_(p.jaar);
    }
    persoon.dieet = (p.dieet || []).slice();
    persoon.dieetToelichting = verzoekTekst_(p.toelichting);
    persoon.eetMee = p.eetMee !== false;
    persoon.ehbo = p.ehbo === true;
    personen.push(persoon);
  }
  var verzoek = {
    actie: v.token ? 'wijzigen' : 'aanmelden',
    adres: verzoekAdres_(v),
    contact: {
      voornaam: verzoekTekst_(v.voornaam), achternaam: verzoekTekst_(v.achternaam),
      email: verzoekTekst_(v.email), telefoon: verzoekTekst_(v.telefoon)
    },
    personen: personen,
    hulp: (v.hulp || []).slice(),
    spullen: (v.spullen || []).slice(),
    rekeninghouder: verzoekTekst_(v.rekeninghouder),
    toestemming: { bewaren: v.bewaren === true, dieet: v.bewaren === true, activiteiten: v.activiteiten === true },
    website: verzoekTekst_(v.website)
  };
  if (v.token) verzoek.token = v.token;
  else verzoek.tweedeHuishouden = v.tweedeHuishouden === true;
  return verzoek;
}

// Het omgekeerde: een aanmelding zoals GET ?actie=huishouden die teruggeeft, als formuliervelden.
// De rekeninghouder komt niet terug van de server en blijft dus leeg; bij wijzigen houdt het script dan de opgeslagen naam.
function veldenUitAanmelding(aanmelding, token) {
  var h = aanmelding.huishouden || {};
  var personen = (aanmelding.personen || []).map(function (p) {
    var kind = p.geboortejaar !== null && p.geboortejaar !== undefined && p.geboortejaar !== '';
    return {
      voornaam: verzoekTekst_(p.voornaam), kind: kind,
      maand: kind ? verzoekTekst_(p.geboortemaand) : '', jaar: kind ? verzoekTekst_(p.geboortejaar) : '',
      dieet: (p.dieet || []).slice(), toelichting: verzoekTekst_(p.dieetToelichting),
      eetMee: p.eetMee !== false, ehbo: p.ehbo === true
    };
  });
  return {
    straat: verzoekTekst_(h.straat), straatElders: verzoekTekst_(h.straatElders), huisnummer: verzoekTekst_(h.huisnummer) + verzoekTekst_(h.toevoeging),
    voornaam: verzoekTekst_(h.voornaam), achternaam: verzoekTekst_(h.achternaam),
    email: verzoekTekst_(h.email), telefoon: verzoekTekst_(h.telefoon), rekeninghouder: '',
    personen: personen,
    hulp: (aanmelding.hulp || []).slice(), spullen: (aanmelding.spullen || []).slice(),
    bewaren: h.toestemmingBewaren === true,
    activiteiten: h.toestemmingActiviteiten === true, website: '', token: token
  };
}

// De publieke config (GET ?actie=config) in de vorm die valideerVerzoek en berekenBedrag verwachten.
// De config bevat alleen straatnamen; de afkorting is in de browser niet nodig en krijgt een plaatshouder.
function instellingenUitConfig(config) {
  var e = config.evenement || {};
  return {
    evenement: { naam: e.naam, datum: e.datum, locatie: e.locatie, contactEmail: e.contactEmail, nietMeeEtenGratis: config.nietMeeEtenGratis === true },
    datums: config.datums || {},
    leeftijdsgroepen: config.leeftijdsgroepen || [],
    dieetkeuzes: config.dieetkeuzes || [],
    straten: (config.straten || []).map(function (naam) { return { naam: naam, afkorting: 'XXX' }; }),
    hulpblokken: config.hulpblokken || [],
    spullen: config.spullen || []
  };
}

// Spullen uit het formulier: rijen uit de Spullenlijst (lijst = [{ wat, aantal }]) tellen mee als er een aantal
// boven 0 staat; rijen "Iets anders" (anders = [{ wat, aantal }]) als er tekst of een aantal staat. Een rij met
// een aantal maar zonder tekst gaat ook mee, zodat valideerVerzoek om de tekst vraagt in plaats van hem stil te negeren.
function spullenUitInvoer(lijst, anders) {
  var uit = [];
  var i, aantal;
  for (i = 0; i < (lijst || []).length; i++) {
    aantal = verzoekTekst_(lijst[i].aantal).trim();
    if (aantal !== '' && aantal !== '0') uit.push({ wat: verzoekTekst_(lijst[i].wat), aantal: aantal, opmerking: '' });
  }
  for (i = 0; i < (anders || []).length; i++) {
    var wat = verzoekTekst_(anders[i].wat).trim();
    aantal = verzoekTekst_(anders[i].aantal).trim();
    if (wat !== '' || (aantal !== '' && aantal !== '0')) uit.push({ wat: wat, aantal: aantal, opmerking: '' });
  }
  return uit;
}

// Het omgekeerde bij wijzigen: opgeslagen spullen met een naam uit de Spullenlijst (namen) gaan naar die rij,
// al het andere (eigen tekst, of een naam die de commissie uit de lijst haalde) naar "Iets anders".
function verdeelSpullen(spullen, namen) {
  var uit = { lijst: [], anders: [] };
  for (var i = 0; i < (spullen || []).length; i++) {
    var s = { wat: verzoekTekst_(spullen[i].wat), aantal: verzoekTekst_(spullen[i].aantal) };
    if ((namen || []).indexOf(s.wat) !== -1) uit.lijst.push(s); else uit.anders.push(s);
  }
  return uit;
}

// Kop boven het bedrag op het formulier: één persoon betaalt 'Jouw bijdrage', meer personen 'Jullie bijdrage'.
function bijdrageKop(aantalPersonen) {
  return aantalPersonen >= 2 ? 'Jullie bijdrage' : 'Jouw bijdrage';
}

// Wat de klaarpagina over betalen zegt, met dezelfde betekenis als de betaalregel in de mail (sjabloon.js maakBetaalregel).
// antwoord = het ok-antwoord van het script. -> { soort, openstaand, link }; soort is
// 'betalen' (knop), 'volgt' (link volgt per mail), 'betaald', 'terug' (te veel betaald) of 'geen' (niets tonen).
// De afmeldmail heeft geen betaalregel, dus bij afmelden toont de pagina ook niets.
function betaalWeergave(antwoord, actie) {
  var a = antwoord || {};
  var openstaand = Number(a.openstaand) || 0;
  var link = typeof a.betaallink === 'string' && /^https?:\/\//i.test(a.betaallink) ? a.betaallink : null;
  var soort = 'geen';
  if (actie === 'afmelden') soort = 'geen';
  else if (a.betaalstatus === 'betaald') soort = 'betaald';
  else if (a.betaalstatus === 'terug te betalen') soort = 'terug';
  else if (openstaand > 0) soort = link ? 'betalen' : 'volgt';
  return { soort: soort, openstaand: openstaand, link: soort === 'betalen' ? link : null };
}

// Kop en eerste regel van de klaarpagina. betaal = uitkomst van betaalWeergave; standaardKop = de gewone kop van de actie.
// Alleen als er nog betaald moet worden met een veilige link (soort 'betalen') is betalen de laatste stap van het aanmelden:
// kop 'Bijna klaar!' en een regel met het openstaande bedrag, direct gevolgd door de betaalknop. Anders: gewone kop, geen regel.
// -> { kop, regel, laatsteStap }
function klaarBetaalstap(betaal, standaardKop) {
  var b = betaal || {};
  if (b.soort !== 'betalen') return { kop: standaardKop, regel: null, laatsteStap: false };
  var n = Number(b.openstaand) || 0;
  var bedrag = '\u20AC ' + (n % 1 ? n.toFixed(2).replace('.', ',') : String(n));
  return { kop: 'Bijna klaar!', regel: 'Rond je aanmelding af door nu ' + bedrag + ' te betalen.', laatsteStap: true };
}
