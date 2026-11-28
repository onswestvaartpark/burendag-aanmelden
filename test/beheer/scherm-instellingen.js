// Scherm Instellingen: alles wat de commissie eerst in de tabbladen van de Sheet aanpaste, op de beheerpagina (fase 4a).
// Alleen met het recht instellingen_beheren. Links een lijst met onderdelen (op de telefoon een keuzelijst), rechts het open onderdeel.
// De inhoud komt direct uit het koppelscript (beheerInstellingen) en staat alleen in het geheugen. De wijzigingen staan eerst in een concept; Opslaan stuurt per gewijzigd
// onderdeel een opdracht (instellingenOpslaan) via de wachtrij. De controle is dezelfde als op de server (gedeeld/instellingenvelden.js).
// Tekst gaat nooit via innerHTML.
// Vereist app.js (registreerScherm, el, maakIcoon, meervoud_, beheerApp, naarInloggen_, bewerkbaar_, tekenStroken_), api.js (maakDirecteLading), wachtrij.js (mislukteLees, mislukteWis),
// gedeeld/instellingenvelden.js, gedeeld/sjabloon.js en instellingenhulp.js.

var instellingenLading = maakDirecteLading('beheerInstellingen');

// De stand van het scherm; blijft bestaan als je naar een ander scherm gaat (het concept gaat niet verloren, tot je bevestigt dat het weg mag).
var instApp = {
  email: null, basis: null, concept: null, plaats: {}, hash: {}, hashVers: {},
  open: 'editie', mailKies: null, mailVeld: 'tekst', techOpen: false, slotVraag: null,
  wacht: {}, voorBasis: {}, serverFouten: {}, aangeraakt: {}, toonFouten: false, klaar: false, melding: '',
  container: null, staat: null, voorbeeldVak: null
};

function instellingenSchermVergeet() {
  instellingenLading.vergeet();
  instApp.email = null; instApp.basis = null; instApp.concept = null; instApp.plaats = {}; instApp.hash = {}; instApp.hashVers = {};
  instApp.wacht = {}; instApp.voorBasis = {}; instApp.serverFouten = {}; instApp.aangeraakt = {}; instApp.toonFouten = false; instApp.klaar = false; instApp.melding = '';
  instApp.slotVraag = null; instApp.container = null; instApp.staat = null;
  instApp.open = 'editie'; instApp.mailKies = null; instApp.mailVeld = 'tekst'; instApp.techOpen = false;
}

function instKopie_(x) { return JSON.parse(JSON.stringify(x)); }
function instTitel_(sectie) { return INSTV_SECTIES.filter(function (s) { return s.naam === sectie; })[0].titel; }
function instVuil_() { return instApp.concept && instApp.basis ? instSchermVuil(instApp.basis, instApp.concept).filter(function (n) { return n !== 'slot'; }) : []; }
function instWijzigingen_() {
  var n = 0;
  instVuil_().forEach(function (s) { n += instSchermAantalWijzigingen(instApp.basis[s], instApp.concept[s]); });
  return n;
}
function instOpSlot_() { return !!instApp.basis && instApp.basis.slot.opSlot !== false; }
function instWacht_() { return Object.keys(instApp.wacht); }

// ---- laden en begin ----

function instBegin_(data) {
  instApp.basis = instKopie_(data.secties);
  instApp.concept = instKopie_(data.secties);
  instApp.plaats = data.plaatshouders || {};
  instApp.hash = {};
  INSTV_SECTIES.forEach(function (s) { instApp.hash[s.naam] = instvBasis(s.naam, data.secties[s.naam]); });
}

// Nieuwe gegevens van de server: onderdelen zonder wijzigingen worden direct vervangen; een gewijzigd onderdeel houdt zijn concept.
function instNaLading_() {
  var data = instellingenLading.data;
  if (data && data.secties) {
    if (!instApp.basis) instBegin_(data);
    else {
      instApp.plaats = data.plaatshouders || {};
      INSTV_SECTIES.forEach(function (s) {
        var n = s.naam;
        if (instApp.wacht[n] || !data.secties[n]) return;
        var vuil = JSON.stringify(instApp.basis[n]) !== JSON.stringify(instApp.concept[n]);
        instApp.basis[n] = instKopie_(data.secties[n]);
        // de vingerafdruk waarop een wijziging is gebaseerd blijft staan zolang er een concept is: zo merkt de server dat iemand anders intussen iets veranderde
        if (!vuil) { instApp.concept[n] = instKopie_(data.secties[n]); instApp.hash[n] = instvBasis(n, data.secties[n]); }
        // na een eigen opslag is de Sheet door ons veranderd: de vingerafdruk daarvan is de nieuwe basis, ook als je intussen weer verder bent gaan typen
        else if (instApp.hashVers[n]) instApp.hash[n] = instvBasis(n, data.secties[n]);
        delete instApp.hashVers[n];
      });
    }
  }
  var c = instApp.container;
  if (!c) return;
  var actief = document.activeElement;
  if (data && instApp.basis && c.querySelector('[data-balk]') && actief && c.contains(actief) && bewerkbaar_(actief)) { instVerfris_(); return; } // iemand typt
  instTeken_(c);
}

// ---- uitkomsten van opgeslagen onderdelen ----

function instVerwerkUitkomsten_(staat) {
  if (instWacht_().length === 0) return;
  var mijn = staat && staat.momentopname && staat.momentopname.mijnOpdrachten;
  var mislukt = typeof mislukteLees === 'function' && typeof beheerOpslag !== 'undefined' ? mislukteLees(beheerOpslag) : [];
  var uit = instSchermUitkomsten(instApp.wacht, mijn, mislukt);
  var verversen = false, verandering = false;
  Object.keys(uit).forEach(function (sectie) {
    var u = uit[sectie];
    if (u.status === 'wacht') return;
    var id = instApp.wacht[sectie];
    delete instApp.wacht[sectie];
    verandering = true;
    if (u.status === 'klaar') {
      delete instApp.voorBasis[sectie];
      instApp.klaar = true; verversen = true; instApp.hashVers[sectie] = true;
    } else {
      // niet gelukt: de oude stand terug als opgeslagen stand; het concept blijft staan, zodat niets verloren gaat
      instApp.basis[sectie] = instApp.voorBasis[sectie] || instApp.basis[sectie];
      delete instApp.voorBasis[sectie];
      if (sectie === 'slot') instApp.concept.slot = instKopie_(instApp.basis.slot);
      instApp.serverFouten[sectie] = u.melding || 'Opslaan lukte niet. Probeer het zo nog eens.';
      instApp.open = sectie === 'slot' ? 'slot' : (instApp.serverFouten[instApp.open] ? instApp.open : sectie);
      if (typeof mislukteWis === 'function') { mislukteWis(beheerOpslag, id); if (typeof tekenStroken_ === 'function') tekenStroken_(); }
    }
  });
  if (verversen && instWacht_().length === 0) instellingenLading.haal(true);
  if (verandering) instTeken_(instApp.container);
}

// ---- opslaan, annuleren ----

function instStuur_(secties) {
  secties.forEach(function (sectie) {
    var inhoud = instKopie_(instApp.concept[sectie]);
    var r = instApp.staat.stuurOpdracht('instellingenOpslaan', { sectie: sectie, inhoud: inhoud, basis: instApp.hash[sectie] || '' });
    instApp.wacht[sectie] = r.id;
    instApp.voorBasis[sectie] = instApp.basis[sectie];
    instApp.basis[sectie] = instKopie_(inhoud); // in afwachting van de server telt dit als opgeslagen
    delete instApp.serverFouten[sectie];
  });
  instApp.klaar = false; instApp.melding = '';
}

function instOpslaan_() {
  if (!instApp.concept || !instApp.staat) return;
  var vuil = instVuil_();
  if (vuil.length === 0) return;
  // een onderdeel dat nog wordt verwerkt kan pas weer worden opgeslagen als het klaar is (de nieuwe opdracht bouwt op de uitkomst van de vorige)
  var wachtend = vuil.filter(function (n) { return instApp.wacht[n]; });
  if (wachtend.length > 0) {
    vuil = vuil.filter(function (n) { return !instApp.wacht[n]; });
    if (vuil.length === 0) { instApp.melding = wachtend.map(instTitel_).join(', ') + ' wordt nog verwerkt. Daarna kun je opnieuw opslaan.'; instVerfris_(); return; }
  }
  if (instOpSlot_()) { instApp.melding = 'De editie staat op slot. Haal eerst het slot eraf bij "Editie op slot".'; instVerfris_(); return; }
  instApp.toonFouten = true;
  var eerste = null;
  vuil.forEach(function (n) { if (eerste === null && instvControleer(n, instApp.concept[n]).length > 0) eerste = n; });
  if (eerste !== null) {
    instApp.melding = '';
    if (instvControleer(instApp.open, instApp.concept[instApp.open] || {}).length === 0 || vuil.indexOf(instApp.open) < 0) instApp.open = eerste;
    instTeken_(instApp.container);
    var plek = instApp.container.querySelector('.melding-fout:not([hidden])');
    if (plek && plek.scrollIntoView) plek.scrollIntoView({ block: 'center' });
    return;
  }
  instStuur_(vuil);
  if (wachtend.length > 0) instApp.melding = wachtend.map(instTitel_).join(', ') + ' wordt nog verwerkt: de nieuwste wijziging daarin is nog niet opgeslagen.';
  instTeken_(instApp.container);
}

function instAnnuleren_() {
  if (!instApp.basis) return;
  // het concept terug op de stand van de server; de vingerafdruk gaat mee, anders klopt hij niet met de stand waarop je daarna verder bouwt
  INSTV_SECTIES.forEach(function (s) {
    if (instApp.wacht[s.naam]) return;
    instApp.concept[s.naam] = instKopie_(instApp.basis[s.naam]);
    instApp.hash[s.naam] = instvBasis(s.naam, instApp.basis[s.naam]);
  });
  instApp.aangeraakt = {}; instApp.toonFouten = false; instApp.melding = ''; instApp.serverFouten = {}; instApp.slotVraag = null; instApp.klaar = false;
  instTeken_(instApp.container);
}

// ---- velden ----

function instPadId_(sectie, pad) { return sectie + ':' + pad; }

// Een invoerveld met label, gekoppeld aan obj[sleutel] van het concept. o = { soort: tekst|euro|geheel|geheelOfLeeg|datum|mail, hint, max, meer (tekstvak), breed, voorvoegsel }
function instVeld_(sectie, pad, label, obj, sleutel, o) {
  o = o || {};
  var soort = o.soort || 'tekst';
  var id = instPadId_(sectie, pad);
  var attrs = {
    type: soort === 'datum' ? 'date' : soort === 'mail' ? 'email' : 'text', autocomplete: 'off', 'data-fokus': id, 'data-veld': id,
    maxlength: o.max || null, inputmode: soort === 'euro' ? 'decimal' : (soort === 'geheel' || soort === 'geheelOfLeeg' ? 'numeric' : null),
    autocapitalize: soort === 'mail' ? 'none' : null, spellcheck: soort === 'mail' || soort === 'datum' ? 'false' : null, 'aria-describedby': 'inst-m-' + id.replace(/[^A-Za-z0-9_-]/g, '_')
  };
  var invoer = o.meer ? el('textarea', { rows: o.rijen || 4, 'data-fokus': id, 'data-veld': id, maxlength: o.max || null, 'aria-describedby': attrs['aria-describedby'] }) : el('input', attrs);
  invoer.value = instSchermTekst(obj[sleutel], soort);
  function wijzig() {
    obj[sleutel] = instSchermGetal(invoer.value, soort);
    instApp.aangeraakt[id] = true;
    if (sectie === 'editie' && ['datum', 'open', 'sluit', 'opgaveCateraar', 'uiterste'].indexOf(pad) >= 0) {
      ['datum', 'open', 'sluit', 'opgaveCateraar', 'uiterste'].forEach(function (p) { instApp.aangeraakt[instPadId_('editie', p)] = true; });
    }
    instApp.klaar = false;
    instVerfris_();
  }
  invoer.addEventListener('input', wijzig);
  if (soort === 'datum') invoer.addEventListener('change', wijzig);
  invoer.addEventListener('blur', function () { instApp.aangeraakt[id] = true; instVerfris_(); });
  if (o.volg) invoer.addEventListener('focus', function () { o.volg(invoer); });
  return el('label', { class: 'veld inst-veld' + (o.breed ? ' inst-veld-breed' : '') }, label, invoer,
    o.hint ? el('span', { class: 'veld-hint' }, o.hint) : null,
    el('span', { class: 'veld-melding melding-fout', 'data-pad': id, id: attrs['aria-describedby'], role: 'alert', hidden: true }));
}

function instKeuze_(sectie, pad, label, obj, sleutel, keuzes) {
  var id = instPadId_(sectie, pad);
  var kies = el('select', { 'data-fokus': id, 'data-veld': id }, keuzes.map(function (k) { return el('option', { value: k[0] }, k[1]); }));
  kies.value = obj[sleutel];
  kies.addEventListener('change', function () { obj[sleutel] = kies.value; instApp.aangeraakt[id] = true; instApp.klaar = false; instVerfris_(); });
  return el('label', { class: 'veld inst-veld' }, label, kies, el('span', { class: 'veld-melding melding-fout', 'data-pad': id, role: 'alert', hidden: true }));
}

// Een aan/uit-schakelaar (toetsenbord: spatie) met een label en eventuele uitleg.
function instSchakel_(sectie, pad, label, obj, sleutel, uitleg) {
  var id = instPadId_(sectie, pad);
  var vinkje = el('input', { type: 'checkbox', role: 'switch', 'data-fokus': id, 'data-veld': id });
  vinkje.checked = obj[sleutel] === true;
  vinkje.addEventListener('change', function () { obj[sleutel] = vinkje.checked; instApp.klaar = false; instVerfris_(); });
  return el('div', { class: 'inst-schakel' },
    el('label', { class: 'schakel' }, vinkje, el('span', { class: 'schakel-knop', 'aria-hidden': 'true' }), el('span', { class: 'schakel-tekst' }, label)),
    uitleg ? el('p', { class: 'rij-sub' }, uitleg) : null);
}

// Een lijst met rijen die je kunt toevoegen, weghalen en omhoog of omlaag zetten.
// pad: naam van de lijst in de inhoud; nieuw(): een nieuwe rij; bouw(rij, n): de velden van een rij; o = { toevoegen: tekst, leeg: tekst, rijNaam(rij, n), eerste: sleutel van het eerste veld }
function instLijst_(sectie, lijst, pad, nieuw, bouw, o) {
  var items = lijst.map(function (rij, n) {
    var naam = o.rijNaam(rij, n);
    function knop(tekst, label, richting, stap) {
      var b = el('button', { type: 'button', class: 'knop knop-klein inst-knop', 'aria-label': label + ' (' + naam + ')', 'data-fokus': 'knop.' + sectie + '.' + pad + '.' + n + '.' + richting,
        onclick: function () {
          var naar = instSchermVerplaats(lijst, n, stap);
          if (naar < 0) return;
          instApp.klaar = false;
          instHertekenMetFocus_('knop.' + sectie + '.' + pad + '.' + naar + '.' + richting);
        } }, tekst);
      if (n + stap < 0 || n + stap >= lijst.length) b.disabled = true;
      return b;
    }
    return el('li', { class: 'inst-rij', 'data-rij': pad + '.' + n },
      el('div', { class: 'inst-rij-velden' }, bouw(rij, n)),
      el('div', { class: 'inst-rij-knoppen' },
        knop('↑', 'Omhoog', 'omhoog', -1), knop('↓', 'Omlaag', 'omlaag', 1),
        el('button', { type: 'button', class: 'knop knop-klein knop-gevaar inst-knop', 'aria-label': 'Verwijderen (' + naam + ')',
          onclick: function () { lijst.splice(n, 1); instApp.klaar = false; instHertekenMetFocus_('toevoegen.' + sectie + '.' + pad); } }, 'Weghalen')));
  });
  return el('div', { class: 'inst-lijst' },
    lijst.length ? el('ol', { class: 'inst-rijen' }, items) : el('p', { class: 'rij-sub' }, o.leeg),
    el('p', { class: 'veld-melding melding-fout', 'data-pad': instPadId_(sectie, pad), role: 'alert', hidden: true }),
    el('div', { class: 'knoppen' }, el('button', { type: 'button', class: 'knop', 'data-fokus': 'toevoegen.' + sectie + '.' + pad,
      onclick: function () {
        lijst.push(nieuw()); instApp.klaar = false;
        instHertekenMetFocus_(instPadId_(sectie, pad + '.' + (lijst.length - 1) + (o.eerste ? '.' + o.eerste : '')));
      } }, o.toevoegen)));
}

function instKaart_(titel, uitleg, kinderen) {
  return el('section', { class: 'kaart inst-kaart' }, el('div', null, el('h2', null, titel), uitleg ? el('p', { class: 'inst-uitleg' }, uitleg) : null), kinderen);
}

// ---- de onderdelen ----

function instEditie_() {
  var c = instApp.concept.editie;
  var tijdlijn = [['open', 'Aanmelden open', 'Uitnodigingen kunnen vanaf deze dag'], ['sluit', 'Aanmelden sluit', 'Daarna alleen nog via de commissie'],
    ['opgaveCateraar', 'Opgave aan de cateraar', 'Aantallen en dieetwensen'], ['uiterste', 'Uiterste betaling', 'Herinneringen stoppen hierna']];
  return [
    instKaart_('Editie en datums', 'Dit staat bovenaan de aanmeldpagina en in elke mail.', [
      el('div', { class: 'inst-rij-velden' },
        instVeld_('editie', 'naam', 'Naam van het feest', c, 'naam', { max: 120 }),
        instVeld_('editie', 'kop', 'Kop op de aanmeldpagina', c, 'kop', { max: 200 })),
      el('div', { class: 'inst-rij-velden' },
        instVeld_('editie', 'datum', 'Datum van het feest', c, 'datum', { soort: 'datum' }),
        instVeld_('editie', 'locatie', 'Locatie', c, 'locatie', { max: 120 }),
        instVeld_('editie', 'contactEmail', 'Mailadres van de commissie', c, 'contactEmail', { soort: 'mail', max: 120 }),
        instVeld_('editie', 'type', 'Soort feest', c, 'type', { max: 30 }))]),
    instKaart_('Tijdlijn', 'Het systeem controleert dat de datums in de goede volgorde staan.', [
      el('ol', { class: 'inst-tijdlijn' }, tijdlijn.map(function (t, n) {
        return el('li', null, el('span', { class: 'inst-nr', 'aria-hidden': 'true' }, String(n + 1)),
          instVeld_('editie', t[0], t[1], c, t[0], { soort: 'datum', hint: t[2] }));
      }))])
  ];
}

function instBedragen_() {
  var c = instApp.concept.bedragen;
  var groepen = instLijst_('bedragen', c.groepen, 'groepen',
    function () { return { naam: '', van: 0, tm: null, prijs: 0, eetMee: true, cateraar: 'volwassen', geboortemaandVragen: false }; },
    function (g, n) {
      var p = 'groepen.' + n + '.';
      return [
        instVeld_('bedragen', p + 'naam', 'Naam', g, 'naam', { max: 60 }),
        instVeld_('bedragen', p + 'van', 'Van (jaar)', g, 'van', { soort: 'geheel' }),
        instVeld_('bedragen', p + 'tm', 'Tot en met (jaar)', g, 'tm', { soort: 'geheelOfLeeg', hint: 'Leeg voor de oudste groep' }),
        instVeld_('bedragen', p + 'prijs', 'Prijs in euro\'s', g, 'prijs', { soort: 'euro' }),
        instKeuze_('bedragen', p + 'cateraar', 'Maaltijd bij de cateraar', g, 'cateraar', [['geen', 'Geen'], ['kind', 'Kind'], ['volwassen', 'Volwassene']]),
        instSchakel_('bedragen', p + 'eetMee', 'Eet mee', g, 'eetMee'),
        instSchakel_('bedragen', p + 'geboortemaandVragen', 'Vraag de geboortemaand', g, 'geboortemaandVragen')
      ];
    },
    { toevoegen: '+ Leeftijdsgroep toevoegen', leeg: 'Er zijn nog geen leeftijdsgroepen.', eerste: 'naam', rijNaam: function (g, n) { return g.naam || 'leeftijdsgroep ' + (n + 1); } });
  return [
    instKaart_('Prijs per leeftijdsgroep', 'De groepen sluiten op elkaar aan, vanaf 0 jaar; de oudste groep heeft geen bovengrens.', groepen),
    instKaart_('Korting', null, [instSchakel_('bedragen', 'nietMeeEtenGratis', 'Wie niet mee-eet, betaalt niets', c, 'nietMeeEtenGratis',
      'Aan: een persoon die niet mee-eet telt voor 0 euro. Uit: die persoon betaalt de prijs van de leeftijdsgroep.')]),
    instKaart_('Betalen en herinneren', 'Hiermee herkent het systeem betalingen op de bank en bepaalt het wanneer er een herinnering gaat.', [
      el('div', { class: 'inst-rij-velden' },
        instVeld_('bedragen', 'zoektekst', 'Zoektekst op de bank', c, 'zoektekst', { max: 60, hint: 'Staat in de omschrijving van een betaling, bijvoorbeeld Burendag 2027' }),
        instVeld_('bedragen', 'herinnerNaDagen', 'Herinner na (dagen)', c, 'herinnerNaDagen', { soort: 'geheel' }),
        instVeld_('bedragen', 'maxHerinneringen', 'Hoeveel herinneringen', c, 'maxHerinneringen', { soort: 'geheel' }))]),
    instKaart_('Kas', null, [instVeld_('bedragen', 'beginsaldo', 'Beginsaldo in euro\'s', c, 'beginsaldo', { soort: 'euro', hint: 'Wat er aan het begin van deze editie in de kas zat' })])
  ];
}

function instBetaallinks_() {
  var c = instApp.concept.betaallinks;
  return [instKaart_('Betaallinks', 'Per bedrag een link om te betalen. Een rij zonder link mag; die telt dan nog niet mee. Een link moet met https:// beginnen.',
    instLijst_('betaallinks', c.links, 'links', function () { return { bedrag: 0, url: '', geldigTot: '' }; },
      function (b, n) {
        var p = 'links.' + n + '.';
        return [instVeld_('betaallinks', p + 'bedrag', 'Bedrag in euro\'s', b, 'bedrag', { soort: 'euro' }),
          instVeld_('betaallinks', p + 'url', 'Link', b, 'url', { soort: 'tekst', max: 500, breed: true }),
          instVeld_('betaallinks', p + 'geldigTot', 'Geldig tot (mag leeg)', b, 'geldigTot', { soort: 'datum' })];
      },
      { toevoegen: '+ Betaallink toevoegen', leeg: 'Er zijn nog geen betaallinks.', eerste: 'bedrag',
        rijNaam: function (b, n) { return b.bedrag !== '' && b.bedrag !== null ? 'betaallink ' + instSchermTekst(b.bedrag, 'euro') : 'betaallink ' + (n + 1); } }))];
}

function instGeldigeKleur_(k) { return /^#[0-9a-fA-F]{6}$/.test(String(k)); }

function instStraten_() {
  var c = instApp.concept.straten;
  return [instKaart_('Straten', 'De straten die bij de wijk horen. De afkorting (drie letters) is het begin van de adrescode.',
    instLijst_('straten', c.straten, 'straten', function () { return { naam: '', afkorting: '', kleur: '' }; },
      function (s, n) {
        var p = 'straten.' + n + '.';
        var stip = el('span', { class: 'inst-kleur', 'aria-hidden': 'true' });
        if (instGeldigeKleur_(s.kleur)) stip.setAttribute('style', 'background:' + s.kleur);
        return [instVeld_('straten', p + 'naam', 'Straatnaam', s, 'naam', { max: 60 }),
          instVeld_('straten', p + 'afkorting', 'Afkorting (3 letters)', s, 'afkorting', { max: 3 }),
          instVeld_('straten', p + 'kleur', 'Kleur (zoals #e07a5f)', s, 'kleur', { max: 7, hint: instGeldigeKleur_(s.kleur) ? null : 'Mag leeg' }), stip];
      },
      { toevoegen: '+ Straat toevoegen', leeg: 'Er zijn nog geen straten.', eerste: 'naam', rijNaam: function (s, n) { return s.naam || 'straat ' + (n + 1); } }))];
}

function instHulp_() {
  var c = instApp.concept.hulp;
  return [
    instKaart_('Hulpblokken', 'Waarbij buren kunnen aangeven dat ze willen helpen. De code staat in het wijkregister; verander die niet als er al buren op staan.',
      instLijst_('hulp', c.blokken, 'blokken', function () { return { code: '', naam: '' }; },
        function (h, n) { return [instVeld_('hulp', 'blokken.' + n + '.code', 'Code', h, 'code', { max: 30 }), instVeld_('hulp', 'blokken.' + n + '.naam', 'Naam', h, 'naam', { max: 60 })]; },
        { toevoegen: '+ Hulpblok toevoegen', leeg: 'Er zijn nog geen hulpblokken.', eerste: 'code', rijNaam: function (h, n) { return h.naam || 'hulpblok ' + (n + 1); } })),
    instKaart_('Spullen om te lenen', 'Wat buren kunnen aanbieden.',
      instLijst_('hulp', c.spullen, 'spullen', function () { return ''; },
        function (s, n) { return [instVeld_('hulp', 'spullen.' + n, 'Naam', c.spullen, n, { max: 60 })]; },
        { toevoegen: '+ Spullen toevoegen', leeg: 'Er zijn nog geen spullen.', eerste: '', rijNaam: function (s, n) { return s || 'spullen ' + (n + 1); } }))
  ];
}

function instDieet_() {
  var c = instApp.concept.dieet;
  return [instKaart_('Dieetkeuzes', 'Wat buren bij het aanmelden kunnen aanvinken. "Op de lijst voor de cateraar" bepaalt of de keuze op de opgave aan de cateraar komt.',
    instLijst_('dieet', c.keuzes, 'keuzes', function () { return { code: '', naam: '', opLijstCateraar: true }; },
      function (k, n) {
        var p = 'keuzes.' + n + '.';
        return [instVeld_('dieet', p + 'code', 'Code', k, 'code', { max: 30 }), instVeld_('dieet', p + 'naam', 'Naam', k, 'naam', { max: 60 }),
          instSchakel_('dieet', p + 'opLijstCateraar', 'Op de lijst voor de cateraar', k, 'opLijstCateraar')];
      },
      { toevoegen: '+ Dieetkeuze toevoegen', leeg: 'Er zijn nog geen dieetkeuzes.', eerste: 'code', rijNaam: function (k, n) { return k.naam || 'dieetkeuze ' + (n + 1); } }))];
}

// ---- mailteksten ----

function instMailVoegIn_(plaatshouder) {
  var vak = instApp.voorbeeldVak;
  if (!vak) return;
  var veld = instApp.mailVeld === 'onderwerp' ? vak.onderwerp : vak.tekst;
  var r = instSchermInvoegen(veld.value, veld.selectionStart, veld.selectionEnd, plaatshouder);
  veld.value = r.tekst;
  veld.dispatchEvent(new Event('input', { bubbles: true }));
  veld.focus();
  if (veld.setSelectionRange) veld.setSelectionRange(r.cursor, r.cursor);
}

function instMail_() {
  var c = instApp.concept.mail;
  if (!instApp.mailKies || !c.teksten.some(function (t) { return t.sleutel === instApp.mailKies; })) instApp.mailKies = c.teksten.length ? c.teksten[0].sleutel : null;
  var idx = -1;
  c.teksten.forEach(function (t, n) { if (t.sleutel === instApp.mailKies) idx = n; });
  var lijst = el('ul', { class: 'inst-mails', 'aria-label': 'Mails' }, c.teksten.map(function (t) {
    var naam = (INSTV_MAILNAMEN[t.sleutel] || [t.sleutel])[0];
    return el('li', null, el('button', { type: 'button', class: 'inst-mailknop', 'aria-current': t.sleutel === instApp.mailKies ? 'true' : null, 'data-fokus': 'mail.' + t.sleutel,
      onclick: function () { instApp.mailKies = t.sleutel; instHertekenMetFocus_('mail.' + t.sleutel); } }, naam));
  }));
  if (idx < 0) return [instKaart_('Mailteksten', null, [el('p', { class: 'rij-sub' }, 'Er zijn geen mailteksten.')])];
  var t = c.teksten[idx];
  var info = INSTV_MAILNAMEN[t.sleutel] || [t.sleutel, ''];
  var vak = { onderwerp: null, tekst: null, uitvoer: el('div', { class: 'inst-voorbeeld', 'data-voorbeeld': '' }) };
  var onderwerpLabel = instVeld_('mail', 'teksten.' + idx + '.onderwerp', 'Onderwerp', t, 'onderwerp', { max: 200, volg: function () { instApp.mailVeld = 'onderwerp'; } });
  var tekstLabel = instVeld_('mail', 'teksten.' + idx + '.tekst', 'Tekst van de mail', t, 'tekst', { meer: true, rijen: 14, max: 5000, volg: function () { instApp.mailVeld = 'tekst'; } });
  vak.onderwerp = onderwerpLabel.querySelector('input');
  vak.tekst = tekstLabel.querySelector('textarea');
  vak.onderwerp.setAttribute('data-mailveld', 'onderwerp'); vak.tekst.setAttribute('data-mailveld', 'tekst');
  instApp.voorbeeldVak = vak;
  var chips = (instApp.plaats[t.sleutel] || INSTV_PLAATSHOUDERS_PER_MAIL[t.sleutel] || instvPlaatshouders(t.sleutel)).map(function (p) {
    return el('button', { type: 'button', class: 'chip inst-chip', title: INSTV_PLAATSHOUDERS[p] || p, 'aria-label': 'Voeg {{' + p + '}} in: ' + (INSTV_PLAATSHOUDERS[p] || p),
      onclick: function () { instMailVoegIn_(p); } }, '{{' + p + '}}');
  });
  return [
    instKaart_('Mailteksten', 'Kies een mail. Een plaatshouder zoals {{voornaam}} wordt bij het versturen ingevuld.', [
      lijst,
      el('div', { class: 'inst-mail' },
        el('div', null, el('h3', null, info[0]), info[1] ? el('p', { class: 'rij-sub' }, info[1]) : null),
        onderwerpLabel, tekstLabel,
        el('div', { class: 'inst-chips', role: 'group', 'aria-label': 'Plaatshouders om in te voegen' },
          el('span', { class: 'inst-chips-kop' }, 'Voeg in op de plek van de cursor:'), chips),
        el('div', { class: 'inst-voorbeeldkader' }, el('h3', null, 'Zo ziet het eruit met voorbeeldgegevens'), vak.uitvoer))])
  ];
}

function instMailVoorbeeld_() {
  var vak = instApp.voorbeeldVak;
  if (!vak || !vak.uitvoer || !vak.onderwerp || !vak.onderwerp.isConnected) return;
  var v = instSchermVoorbeeld(vak.onderwerp.value, vak.tekst.value);
  if (v.fout) vak.uitvoer.replaceChildren(el('p', { class: 'melding-fout' }, v.fout));
  else vak.uitvoer.replaceChildren(el('p', { class: 'inst-voorbeeld-onderwerp' }, el('strong', null, 'Onderwerp: '), v.onderwerp), el('p', { class: 'inst-voorbeeld-tekst' }, v.tekst));
}

// ---- editie op slot, technisch, nieuwe editie ----

function instSlotBevestigd_(nieuw) {
  var andere = instVuil_();
  if (andere.length > 0) {
    instApp.melding = 'Sla eerst je andere wijzigingen op of maak ze ongedaan, en wijzig dan het slot.';
    instApp.slotVraag = null; instTeken_(instApp.container); return;
  }
  instApp.slotVraag = null;
  instApp.concept.slot.opSlot = nieuw;
  instStuur_(['slot']);
  instTeken_(instApp.container);
}

function instSlot_() {
  var nu = instApp.concept.slot.opSlot !== false;
  var vinkje = el('input', { type: 'checkbox', role: 'switch', 'data-fokus': 'slot.schakel' });
  vinkje.checked = nu;
  vinkje.disabled = instWacht_().indexOf('slot') >= 0;
  vinkje.addEventListener('change', function () {
    vinkje.checked = nu; // pas na de bevestiging verandert er iets
    instApp.slotVraag = !nu;
    instHertekenMetFocus_('slot.ja');
  });
  var vraag = null;
  if (instApp.slotVraag !== null) {
    var zetOp = instApp.slotVraag === true;
    vraag = el('div', { class: 'strook ' + (zetOp ? 'strook-geel' : 'strook-fout'), role: 'alertdialog', 'aria-label': 'Bevestigen' },
      el('span', { class: 'strook-tekst' }, zetOp
        ? 'De editie op slot zetten? Daarna kun je niets meer boeken, geen bonnen indienen en de begroting niet meer wijzigen, en deze instellingen zijn dicht. Je kunt het slot hier altijd weer eraf halen.'
        : 'Het slot eraf halen? Dan kan er weer worden geboekt en gewijzigd, ook als de kascontrole al akkoord was.'),
      el('div', { class: 'knoppen' },
        el('button', { type: 'button', class: 'knop knop-hoofd', 'data-fokus': 'slot.ja', onclick: function () { instSlotBevestigd_(zetOp); } }, zetOp ? 'Ja, zet de editie op slot' : 'Ja, haal het slot eraf'),
        el('button', { type: 'button', class: 'knop', onclick: function () { instApp.slotVraag = null; instHertekenMetFocus_('slot.schakel'); } }, 'Nee, laat het zoals het is')));
  }
  return [el('section', { class: 'kaart inst-kaart inst-slot' },
    el('div', null, el('h2', null, 'Editie op slot'),
      el('p', { class: 'inst-uitleg' }, 'De editie gaat vanzelf op slot na een goedgekeurde kascontrole. Daarna verandert er niets meer aan kas, bonnen en begroting, en zijn de andere instellingen dicht. Hier kun je het slot er zo nodig weer afhalen.')),
    el('label', { class: 'schakel' }, vinkje, el('span', { class: 'schakel-knop', 'aria-hidden': 'true' }), el('span', { class: 'schakel-tekst' }, nu ? 'Op slot' : 'Niet op slot')),
    vraag)];
}

function instTechnisch_() {
  var c = instApp.concept.technisch;
  var details = el('details', { class: 'inst-details' },
    el('summary', null, 'Technische instellingen tonen'),
    el('div', { class: 'inst-details-inhoud' },
      el('p', { class: 'inst-uitleg' }, 'Alleen aanpassen als je weet wat je doet. Vraag anders de beheerder.'),
      instSchakel_('technisch', 'testModus', 'Testmodus', c, 'testModus', 'Aan: elke mail gaat naar het mailadres van de commissie met [TEST] in het onderwerp, in plaats van naar de buren.'),
      el('div', { class: 'inst-rij-velden' },
        instVeld_('technisch', 'bonnen', 'Map voor bonnen (Drive-nummer)', c, 'bonnen', { max: 100 }),
        instVeld_('technisch', 'verslagen', 'Map voor verslagen (Drive-nummer)', c, 'verslagen', { max: 100 }))));
  if (instApp.techOpen) details.open = true;
  details.addEventListener('toggle', function () { instApp.techOpen = details.open; });
  return [el('section', { class: 'kaart inst-kaart' }, el('div', null, el('h2', null, 'Technisch')), details)];
}

function instNieuweEditie_() {
  return [el('section', { class: 'kaart inst-kaart inst-uit' }, el('h2', null, 'Nieuwe editie'), el('p', { class: 'inst-uitleg' }, 'Volgend jaar klaarzetten. Komt binnenkort.'))];
}

var INSTELLINGEN_ONDERDELEN = { editie: instEditie_, bedragen: instBedragen_, betaallinks: instBetaallinks_, straten: instStraten_, hulp: instHulp_, dieet: instDieet_,
  mail: instMail_, slot: instSlot_, technisch: instTechnisch_ };

// ---- tekenen ----

function instHertekenMetFocus_(focusOp) {
  if (!instApp.container) return;
  var actief = document.activeElement;
  var sleutel = focusOp || (actief && actief.getAttribute ? actief.getAttribute('data-fokus') : null);
  instTeken_(instApp.container);
  if (sleutel) {
    var veld = instApp.container.querySelector('[data-fokus="' + CSS.escape(String(sleutel)) + '"]');
    if (veld && veld.focus) { veld.focus(); if (veld.scrollIntoView && focusOp) veld.scrollIntoView({ block: 'nearest' }); }
  }
}

function instKiesOnderdeel_(naam) {
  if (naam === instApp.open) return;
  instApp.open = naam; instApp.slotVraag = null;
  instHertekenMetFocus_(null);
  var kop = instApp.container && instApp.container.querySelector('.inst-paneel');
  if (kop && kop.scrollIntoView && window.innerWidth < 900) kop.scrollIntoView({ block: 'start' });
}

function instNavigatie_() {
  var vuil = instSchermVuil(instApp.basis, instApp.concept);
  var items = INSTV_SECTIES.map(function (s) {
    var gewijzigd = vuil.indexOf(s.naam) >= 0;
    return el('li', null, el('button', { type: 'button', class: 'inst-navpunt', 'aria-current': s.naam === instApp.open ? 'page' : null, 'data-nav': s.naam,
      onclick: function () { instKiesOnderdeel_(s.naam); } },
      el('span', { class: 'inst-nav-naam' }, s.titel, el('span', { class: 'label label-geel inst-gewijzigd', 'data-gewijzigd': s.naam, hidden: !gewijzigd }, 'Gewijzigd')),
      el('span', { class: 'inst-nav-sub' }, s.uitleg)));
  });
  items.push(el('li', null, el('span', { class: 'inst-navpunt inst-navpunt-uit', 'aria-disabled': 'true' },
    el('span', { class: 'inst-nav-naam' }, 'Nieuwe editie', el('span', { class: 'label label-grijs' }, 'Komt binnenkort')),
    el('span', { class: 'inst-nav-sub' }, 'Volgend jaar klaarzetten'))));
  var kies = el('select', { 'data-fokus': 'nav.select', onchange: function () { instKiesOnderdeel_(kies.value); } },
    INSTV_SECTIES.map(function (s) { return el('option', { value: s.naam }, s.titel); }).concat([el('option', { value: '', disabled: true }, 'Nieuwe editie (komt binnenkort)')]));
  kies.value = instApp.open;
  return el('aside', { class: 'kaart inst-nav' },
    el('label', { class: 'veld inst-kies' }, 'Onderdeel', kies),
    el('ul', { class: 'inst-navlijst' }, items));
}

function instBalk_() {
  return el('div', { class: 'opslaanbalk', 'data-balk': '' },
    el('p', { class: 'opslaan-status', 'data-status': '', role: 'status', 'aria-live': 'polite' }),
    el('div', { class: 'knoppen' },
      el('button', { type: 'button', class: 'knop', 'data-terug': '', onclick: instAnnuleren_ }, 'Annuleren'),
      el('button', { type: 'button', class: 'knop knop-hoofd', 'data-opslaan': '', onclick: instOpslaan_ }, 'Opslaan')));
}

function instTeken_(container) {
  if (!container) return;
  instApp.container = container;
  var testomgeving = typeof BEHEER_OMGEVING === 'string' && BEHEER_OMGEVING === 'test';
  var kop = el('header', { class: 'paginakop' },
    el('div', null, el('h1', null, 'Instellingen'), el('p', null, 'Alles wat eerst in de Sheet stond. Wijzigingen gelden direct voor de aanmeldpagina en de mails.')),
    testomgeving ? el('span', { class: 'label label-geel inst-test' }, 'Testomgeving') : null);
  if (!instApp.basis) {
    var tekst = instellingenLading.fout ? null : 'De instellingen worden opgehaald…';
    container.replaceChildren(kop, instellingenLading.fout
      ? el('section', { class: 'kaart leeg' }, maakIcoon('wifi', 'pictogram groot'), el('h2', null, 'De instellingen zijn nog niet opgehaald'), el('p', null, instellingenLading.fout),
          el('button', { type: 'button', class: 'knop knop-hoofd', onclick: function () { instellingenLading.haal(true); } }, 'Opnieuw proberen'))
      : el('p', { class: 'laden', role: 'status' }, el('span', { class: 'laadpunt' }), tekst));
    return;
  }
  instApp.voorbeeldVak = null;
  var op = INSTELLINGEN_ONDERDELEN[instApp.open] || instEditie_;
  var slot = instOpSlot_() && instApp.open !== 'slot';
  var inhoud = op();
  var fout = instApp.serverFouten[instApp.open];
  var paneel = el('div', { class: 'inst-paneel', 'data-sectie': instApp.open },
    slot ? el('div', { class: 'strook strook-geel', role: 'status' }, el('span', { class: 'strook-tekst' }, 'De editie staat op slot: hier kan niets meer worden gewijzigd. Haal eerst het slot eraf bij "Editie op slot".')) : null,
    fout ? el('div', { class: 'strook strook-fout', role: 'alert', 'data-sectie-fout': '' }, el('span', { class: 'strook-tekst' }, 'Niet opgeslagen: ' + fout)) : null,
    el('fieldset', { class: 'inst-velden', disabled: slot }, inhoud));
  container.replaceChildren(kop, el('div', { class: 'inst-indeling' }, instNavigatie_(), paneel), instBalk_());
  container.classList.add('inst-scherm');
  instVerfris_();
}

// Werkt de meldingen, tellers, het voorbeeld en de opslaanbalk bij zonder iets opnieuw te tekenen (typen blijft dus ongestoord).
function instVerfris_() {
  var c = instApp.container;
  if (!c || !instApp.basis) return;
  var huidig = instApp.concept[instApp.open];
  var perPad = {};
  if (huidig) perPad = instSchermMeldingenPerPad(instvControleer(instApp.open, huidig));
  Array.prototype.forEach.call(c.querySelectorAll('[data-pad]'), function (plek) {
    var id = plek.getAttribute('data-pad');
    var pad = id.slice(id.indexOf(':') + 1);
    var meldingen = perPad[pad] || [];
    var tonen = meldingen.length > 0 && (instApp.toonFouten || instApp.aangeraakt[id] === true);
    plek.textContent = tonen ? meldingen.join(' ') : '';
    plek.hidden = !tonen;
    var invoer = c.querySelector('[data-veld="' + CSS.escape(id) + '"]');
    if (invoer) { if (tonen) invoer.setAttribute('aria-invalid', 'true'); else invoer.removeAttribute('aria-invalid'); }
  });
  var vuil = instSchermVuil(instApp.basis, instApp.concept);
  Array.prototype.forEach.call(c.querySelectorAll('[data-gewijzigd]'), function (m) { m.hidden = vuil.indexOf(m.getAttribute('data-gewijzigd')) < 0; });
  instMailVoorbeeld_();
  var n = instWijzigingen_();
  var wacht = instWacht_();
  var status = c.querySelector('[data-status]'), opslaan = c.querySelector('[data-opslaan]'), terug = c.querySelector('[data-terug]'), balk = c.querySelector('[data-balk]');
  if (status) {
    status.replaceChildren();
    status.className = 'opslaan-status';
    var sectieFouten = Object.keys(instApp.serverFouten);
    if (instApp.melding) { status.className = 'opslaan-status opslaan-fout'; status.appendChild(document.createTextNode(instApp.melding)); }
    else if (n > 0) {
      var aantalFout = 0;
      vuil.forEach(function (s) { if (s !== 'slot' && instApp.toonFouten) aantalFout += instvControleer(s, instApp.concept[s]).length; });
      status.appendChild(document.createTextNode(aantalFout > 0 ? 'Er klopt nog iets niet. Kijk bij de rode meldingen. · ' + meervoud_(n, 'wijziging', 'wijzigingen') + ' niet opgeslagen'
        : meervoud_(n, 'wijziging', 'wijzigingen') + ' niet opgeslagen'));
    } else if (wacht.length > 0) status.appendChild(document.createTextNode('Opgeslagen, wordt verwerkt: ' + wacht.map(instTitel_).join(', ') + '. Dat duurt hooguit een minuut.'));
    else if (sectieFouten.length > 0) { status.className = 'opslaan-status opslaan-fout'; status.appendChild(document.createTextNode('Niet opgeslagen: ' + sectieFouten.map(instTitel_).join(', ') + '.')); }
    else if (instApp.klaar) { status.className = 'opslaan-status opslaan-klaar'; status.appendChild(maakIcoon('<path d="M5 12.5l4.5 4.5L19 7.5"/>')); status.appendChild(document.createTextNode('Opgeslagen')); }
    else status.appendChild(document.createTextNode('Alles is opgeslagen.'));
  }
  if (opslaan) opslaan.disabled = n === 0 || instOpSlot_();
  if (terug) terug.hidden = n === 0;
  if (balk) balk.classList.toggle('opslaanbalk-vuil', n > 0 || !!instApp.melding);
}

// ---- bij het scherm horen ----

function instTekenScherm_(container, staat) {
  var email = String(staat.email || '').toLowerCase();
  if (instApp.email !== email) { instellingenSchermVergeet(); instApp.email = email; }
  instApp.staat = staat;
  instellingenLading.bijWijziging = instNaLading_;
  if (!instellingenLading.data && !instellingenLading.bezig && !instellingenLading.fout) instellingenLading.haal(true);
  instVerwerkUitkomsten_(staat);
  instTeken_(container);
}

function instBijwerken_(container, staat) {
  instApp.staat = staat;
  instApp.container = container;
  if (!container.querySelector('[data-balk]') && instApp.basis) { instTeken_(container); return; }
  instVerwerkUitkomsten_(staat);
  if (instApp.basis) instVerfris_();
}

function instVernieuw_() {
  if (!instApp.container) return;
  instellingenLading.haal(true);
}

registreerScherm({
  naam: 'instellingen',
  titel: 'Instellingen',
  recht: 'instellingen_beheren',
  icoon: 'instellingen',
  teken: instTekenScherm_,
  bijwerken: instBijwerken_,
  vernieuw: instVernieuw_
});

// Weggaan met wijzigingen die niet zijn opgeslagen: eerst vragen (zoals bij de Commissie).
function instWeggaanVragen_() {
  if (instVuil_().length === 0 || beheerApp.huidig !== 'instellingen') return true;
  if (!window.confirm(INSTELLINGEN_SCHERM_KEUZE)) return false;
  instAnnuleren_();
  return true;
}

document.addEventListener('click', function (e) {
  var knoop = e.target && e.target.closest ? e.target.closest('a.menu-punt, .zijmenu button, .bovenbalk button, a.subtab') : null;
  if (!knoop) return;
  var href = knoop.getAttribute('href');
  if (knoop.getAttribute('aria-label') === 'Vernieuwen' || (knoop.textContent || '').trim() === 'Vernieuwen') return;
  if (href === '#instellingen') return;
  if (!instWeggaanVragen_()) { e.preventDefault(); e.stopPropagation(); }
}, true);

window.addEventListener('hashchange', function () {
  if (instVuil_().length === 0 || hashDelen_().naam === 'instellingen') return;
  if (window.confirm(INSTELLINGEN_SCHERM_KEUZE)) { instAnnuleren_(); return; }
  location.hash = '#instellingen';
});

window.addEventListener('beforeunload', function (e) {
  if (instVuil_().length > 0) { e.preventDefault(); e.returnValue = ''; }
});
