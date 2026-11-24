// Het formulier: opbouwen uit de config, personen toevoegen en verwijderen, uitlezen, vullen, fouten en bedrag tonen.
// Alle tekst uit config of server gaat via textContent / createTextNode, nooit als HTML.

const MAX_PERSONEN = 12;
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const CODE_EET_NIET_MEE = '-';
let volgnummer = 0;

function $(id) { return document.getElementById(id); }

// Maakt een element; kinderen mogen elementen of tekst zijn (tekst wordt een tekstknoop).
function el(tag, eigenschappen, kinderen) {
  const e = document.createElement(tag);
  Object.entries(eigenschappen || {}).forEach(([k, w]) => {
    if (w === null || w === undefined || w === false) return;
    if (k === 'tekst') e.textContent = w;
    else if (k in e && typeof w !== 'string') e[k] = w;
    else e.setAttribute(k, w === true ? '' : w);
  });
  (kinderen || []).forEach((kind) => e.appendChild(typeof kind === 'string' ? document.createTextNode(kind) : kind));
  return e;
}

function euro(bedrag) {
  const n = Number(bedrag) || 0;
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: n % 1 ? 2 : 0 }).format(n);
}

function datumTekst(jjjjmmdd, metDag) {
  const [j, m, d] = String(jjjjmmdd || '').split('-').map(Number);
  if (!j || !m || !d) return '';
  const datum = new Date(Date.UTC(j, m - 1, d, 12));
  return new Intl.DateTimeFormat('nl-NL', Object.assign({ day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
    metDag ? { weekday: 'long' } : {})).format(datum);
}

// Hoogste leeftijd die nog als kind (met geboortemaand) telt, voor het label "Kind (t/m 12 jaar)".
function kindTot(inst) {
  const kinderen = inst.leeftijdsgroepen.filter((g) => g.geboortemaandVragen && g.tm !== null);
  return kinderen.length ? Math.max(...kinderen.map((g) => g.tm)) : null;
}

// ---- opbouwen ----

function vinkje(id, naam, waarde, label, aangevinkt) {
  return el('div', { class: 'vinkje' }, [
    el('input', { type: 'checkbox', id, name: naam, value: waarde, checked: !!aangevinkt }),
    el('label', { for: id, tekst: label })
  ]);
}

function spullenRij(wat) {
  const id = 'spul-' + (++volgnummer);
  return el('div', { class: 'spul' }, [
    el('label', { for: id, tekst: wat }),
    el('input', { type: 'number', id, class: 'aantal', min: '0', max: '50', inputmode: 'numeric', placeholder: '0', 'data-wat': wat })
  ]);
}

// Bij "Elders (andere straat)" verschijnt het verplichte veld Straat naast het huisnummer.
function toonStraatElders() {
  const elders = isElders($('straat').value);
  $('veld-straat-elders').hidden = !elders;
  $('straatElders').required = elders;
}

// Rij met eigen tekst voor spullen die niet in de Spullenlijst staan (wordt { wat: <tekst>, aantal }).
function andersRij(wat, aantal) {
  const n = ++volgnummer;
  return el('div', { class: 'spul spul-anders' }, [
    el('label', { for: 'anders-' + n, tekst: 'Iets anders:' }),
    el('input', { type: 'text', id: 'anders-' + n, class: 'anders-wat', maxlength: '100', autocomplete: 'off', value: wat || '' }),
    el('input', { type: 'number', id: 'anders-aantal-' + n, class: 'anders-aantal', min: '0', max: '50', inputmode: 'numeric',
      placeholder: '0', 'aria-label': 'Aantal (iets anders)', value: aantal || '' })
  ]);
}

function bouwFormulier(config, inst) {
  const straat = $('straat');
  config.straten.forEach((naam) => straat.appendChild(el('option', { value: naam, tekst: naam })));
  // vaste keuze achteraan, niet uit het tabblad Straten (zie gedeeld/adrescode.js)
  straat.appendChild(el('option', { value: STRAAT_ELDERS, tekst: 'Elders (andere straat)' }));
  straat.addEventListener('change', toonStraatElders);

  const hulp = $('hulp');
  config.hulpblokken.forEach((b) => hulp.appendChild(vinkje('hulp-' + b.code, 'hulp', b.code, b.naam)));
  if (!config.hulpblokken.length) hulp.hidden = true;

  const spullen = $('spullen');
  config.spullen.forEach((wat) => spullen.appendChild(spullenRij(wat)));
  spullen.appendChild(andersRij('', ''));

  $('persoon-erbij').addEventListener('click', () => {
    const kaart = voegPersoonToe(inst, null);
    kaart.querySelector('input').focus();
  });
}

function voegPersoonToe(inst, persoon) {
  const p = persoon || {};
  const n = ++volgnummer;
  const id = (s) => 'p' + n + '-' + s;
  const tot = kindTot(inst);

  const naam = el('input', { type: 'text', id: id('voornaam'), class: 'p-voornaam', autocomplete: 'off', value: p.voornaam || '' });
  const volw = el('input', { type: 'radio', id: id('volw'), name: id('soort'), value: 'volwassene', checked: !p.kind });
  const kind = el('input', { type: 'radio', id: id('kind'), name: id('soort'), value: 'kind', checked: !!p.kind });

  const maand = el('select', { id: id('maand'), class: 'p-maand' }, [el('option', { value: '', tekst: 'Maand' })]
    .concat(MAANDEN.map((m, i) => el('option', { value: String(i + 1), tekst: m }))));
  maand.value = p.maand ? String(p.maand) : '';
  const jaar = el('input', { type: 'text', id: id('jaar'), class: 'p-jaar', inputmode: 'numeric', maxlength: '4',
    autocomplete: 'off', placeholder: 'bijv. 2019', value: p.jaar || '' });
  const uitlegId = id('uitleg');
  maand.setAttribute('aria-describedby', uitlegId);
  jaar.setAttribute('aria-describedby', uitlegId);
  const kindvelden = el('div', { class: 'kindvelden', 'data-rol': 'geboorte', hidden: !p.kind }, [
    el('div', { class: 'rij' }, [
      el('div', { class: 'veld' }, [el('label', { for: id('maand'), tekst: 'Geboortemaand' }), maand]),
      el('div', { class: 'veld veld-smal' }, [el('label', { for: id('jaar'), tekst: 'Geboortejaar' }), jaar])
    ]),
    el('p', { class: 'hint', id: uitlegId, tekst: 'De leeftijd op de dag van het feest' +
      (inst.evenement.datum ? ' (' + datumTekst(inst.evenement.datum) + ')' : '') + ' telt voor het tarief.' })
  ]);

  const dieet = el('fieldset', { class: 'keuzes keuzes-klein', 'data-rol': 'dieet' }, [el('legend', { tekst: 'Eten en dieetwensen' })]
    .concat(inst.dieetkeuzes.map((d) => vinkje(id('dieet-' + d.code), id('dieet'), d.code, d.naam, (p.dieet || []).indexOf(d.code) !== -1 || (d.code === CODE_EET_NIET_MEE && p.eetMee === false)))));

  const toelichting = el('input', { type: 'text', id: id('toelichting'), class: 'p-toelichting', autocomplete: 'off', value: p.toelichting || '' });
  const verwijder = el('button', { type: 'button', class: 'knop knop-tekst verwijder', tekst: 'Verwijderen' });

  const kaart = el('li', { class: 'persoon' }, [
    el('div', { class: 'persoon-kop' }, [el('h3', { class: 'persoon-titel' }), verwijder]),
    el('div', { class: 'veld', 'data-rol': 'voornaam' }, [el('label', { for: id('voornaam'), tekst: 'Voornaam' }), naam]),
    el('fieldset', { class: 'soort' }, [
      el('legend', { tekst: 'Leeftijd' }),
      el('div', { class: 'soort-keuze' }, [volw, el('label', { for: id('volw'), tekst: tot !== null ? 'Vanaf ' + (tot + 1) + ' jaar' : 'Volwassene' })]),
      el('div', { class: 'soort-keuze' }, [kind, el('label', { for: id('kind'), tekst: tot !== null ? 'Kind t/m ' + tot + ' jaar' : 'Kind' })])
    ]),
    kindvelden,
    dieet,
    el('div', { class: 'veld', 'data-rol': 'dieetToelichting' }, [
      el('label', { for: id('toelichting') }, ['Toelichting bij dieet of allergie ', el('span', { class: 'optioneel', tekst: '(mag leeg)' })]),
      toelichting
    ]),
    vinkje(id('ehbo'), id('ehbo'), 'ja', 'Is bevoegd hulpverlener (EHBO, BHV, arts of verpleegkundige) en staat stand-by', p.ehbo === true)
  ]);

  const wissel = () => { kindvelden.hidden = !kind.checked; };
  volw.addEventListener('change', wissel);
  kind.addEventListener('change', wissel);
  verwijder.addEventListener('click', () => {
    const lijst = $('personen');
    const kaarten = [...lijst.children];
    const plek = kaarten.indexOf(kaart);
    kaart.remove();
    hernummer();
    const volgende = lijst.children[Math.min(plek, lijst.children.length - 1)];
    (volgende ? volgende.querySelector('input') : $('persoon-erbij')).focus();
    lijst.dispatchEvent(new Event('input', { bubbles: true }));
  });

  $('personen').appendChild(kaart);
  hernummer();
  $('personen').dispatchEvent(new Event('input', { bubbles: true }));
  return kaart;
}

// Titels, verwijderknoppen en data-veld volgen de volgorde, zodat fouten van de server (personen[1].…) bij de juiste kaart landen.
function hernummer() {
  const kaarten = [...$('personen').children];
  kaarten.forEach((kaart, i) => {
    const naam = kaart.querySelector('.p-voornaam').value.trim();
    kaart.querySelector('.persoon-titel').textContent = 'Persoon ' + (i + 1);
    const knop = kaart.querySelector('.verwijder');
    knop.hidden = kaarten.length === 1;
    knop.setAttribute('aria-label', 'Verwijder persoon ' + (i + 1) + (naam ? ' (' + naam + ')' : ''));
    kaart.querySelectorAll('[data-rol]').forEach((e) => e.setAttribute('data-veld', 'personen[' + i + '].' + e.getAttribute('data-rol')));
  });
  $('persoon-erbij').hidden = kaarten.length >= MAX_PERSONEN;
}

// ---- uitlezen en vullen ----

function aangevinkt(container) {
  return [...container.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value);
}

function leesVelden(token, tweedeHuishouden) {
  const waarde = (id) => $(id).value;
  const personen = [...$('personen').children].map((kaart) => {
    const dieet = aangevinkt(kaart.querySelector('[data-rol=dieet]'));
    return {
      voornaam: kaart.querySelector('.p-voornaam').value,
      kind: kaart.querySelector('input[value=kind]').checked,
      maand: kaart.querySelector('.p-maand').value,
      jaar: kaart.querySelector('.p-jaar').value,
      dieet,
      toelichting: kaart.querySelector('.p-toelichting').value,
      eetMee: dieet.indexOf(CODE_EET_NIET_MEE) === -1,
      ehbo: kaart.querySelector('input[name$=ehbo]').checked
    };
  });
  const spullen = spullenUitInvoer(
    [...$('spullen').querySelectorAll('input.aantal')].map((i) => ({ wat: i.getAttribute('data-wat'), aantal: i.value })),
    [...$('spullen').querySelectorAll('.spul-anders')].map((r) => ({
      wat: r.querySelector('.anders-wat').value, aantal: r.querySelector('.anders-aantal').value
    })));
  return {
    straat: waarde('straat'), straatElders: waarde('straatElders'), huisnummer: waarde('huisnummer'),
    voornaam: waarde('voornaam'), achternaam: waarde('achternaam'), email: waarde('email'), telefoon: waarde('telefoon'),
    rekeninghouder: waarde('rekeninghouder'),
    personen,
    hulp: aangevinkt($('hulp')),
    spullen,
    bewaren: $('bewaren').checked, activiteiten: $('activiteiten').checked,
    website: waarde('website'),
    token: token || '',
    tweedeHuishouden: tweedeHuishouden === true
  };
}

function vulVelden(velden, inst) {
  ['huisnummer', 'voornaam', 'achternaam', 'email', 'telefoon', 'rekeninghouder'].forEach((k) => { $(k).value = velden[k] || ''; });
  const straat = $('straat');
  if (velden.straat && ![...straat.options].some((o) => o.value === velden.straat)) {
    straat.appendChild(el('option', { value: velden.straat, tekst: velden.straat }));
  }
  straat.value = velden.straat || '';
  $('straatElders').value = velden.straatElders || '';
  toonStraatElders();
  $('personen').textContent = '';
  (velden.personen.length ? velden.personen : [{}]).forEach((p) => voegPersoonToe(inst, p));
  $('hulp').querySelectorAll('input').forEach((i) => { i.checked = velden.hulp.indexOf(i.value) !== -1; });
  const spullen = $('spullen');
  const lijstInvoer = [...spullen.querySelectorAll('input.aantal')];
  const verdeeld = verdeelSpullen(velden.spullen, lijstInvoer.map((i) => i.getAttribute('data-wat')));
  verdeeld.lijst.forEach((s) => { lijstInvoer.find((i) => i.getAttribute('data-wat') === s.wat).value = s.aantal; });
  // eigen tekst (of een naam die niet meer in de lijst staat) in "Iets anders", met daaronder altijd een lege rij
  spullen.querySelectorAll('.spul-anders').forEach((r) => r.remove());
  verdeeld.anders.forEach((s) => spullen.appendChild(andersRij(s.wat, s.aantal)));
  spullen.appendChild(andersRij('', ''));
  $('bewaren').checked = velden.bewaren;
  $('activiteiten').checked = velden.activiteiten;
}

// ---- fouten ----

function wisFouten() {
  document.querySelectorAll('.fout').forEach((f) => {
    const id = f.id;
    document.querySelectorAll('[aria-describedby~="' + id + '"]').forEach((c) => {
      const rest = c.getAttribute('aria-describedby').split(' ').filter((x) => x !== id);
      if (rest.length) c.setAttribute('aria-describedby', rest.join(' ')); else c.removeAttribute('aria-describedby');
      c.removeAttribute('aria-invalid');
    });
    f.remove();
  });
  document.querySelectorAll('.heeft-fout').forEach((c) => c.classList.remove('heeft-fout'));
  const overzicht = $('foutoverzicht');
  overzicht.hidden = true;
  overzicht.textContent = '';
}

// De plek voor een veld als 'personen[1].geboorte'; anders het dichtstbijzijnde bovenliggende veld ('spullen[0].aantal' -> 'spullen').
function zoekVeld(veld) {
  const alle = [...document.querySelectorAll('[data-veld]')];
  let naam = veld;
  while (naam) {
    const gevonden = alle.find((e) => e.getAttribute('data-veld') === naam);
    if (gevonden) return gevonden;
    const knip = Math.max(naam.lastIndexOf('.'), naam.lastIndexOf('['));
    naam = knip > 0 ? naam.slice(0, knip) : '';
  }
  return null;
}

function controlesVan(plek) {
  if (plek.matches('fieldset, section')) return [plek];
  return [...plek.querySelectorAll('input, select, textarea')];
}

// Zet elke fout bij het veld (met aria-describedby) en toont een overzicht. Geeft het eerste foute element terug.
function toonFouten(fouten) {
  wisFouten();
  const overzicht = $('foutoverzicht');
  const lijst = el('ul');
  let eerste = null;
  fouten.forEach((fout, i) => {
    const plek = zoekVeld(fout.veld);
    const id = 'fout-' + i;
    lijst.appendChild(el('li', { tekst: fout.melding }));
    if (!plek) return;
    const p = el('p', { class: 'fout', id, tekst: fout.melding });
    const kop = plek.matches('section') ? plek.querySelector('h2') : null;
    if (kop) kop.after(p); else plek.appendChild(p);
    plek.classList.add('heeft-fout');
    controlesVan(plek).forEach((c) => {
      const bestaand = c.getAttribute('aria-describedby');
      c.setAttribute('aria-describedby', bestaand ? bestaand + ' ' + id : id);
      if (c.matches('input, select, textarea')) c.setAttribute('aria-invalid', 'true');
    });
    if (!eerste) eerste = controlesVan(plek)[0];
  });
  overzicht.appendChild(el('p', { tekst: fouten.length === 1 ? 'Er is nog 1 ding niet goed:' : 'Er zijn nog ' + fouten.length + ' dingen niet goed:' }));
  overzicht.appendChild(lijst);
  overzicht.hidden = false;
  return eerste;
}

// ---- bedrag ----

function toonBedrag(inst) {
  const personen = verzoekUitFormulier(leesVelden('', false)).personen;
  $('kop-bedrag').textContent = bijdrageKop(personen.length);
  const rekenbaar = personen.filter((p) => {
    try { bepaalGroep(p, inst); return true; } catch (e) { return false; }
  });
  const berekening = berekenBedrag(rekenbaar, inst);
  const ontbreekt = personen.length - rekenbaar.length;
  // Alleen bijwerken als er iets verandert, anders leest een schermlezer het bij elke toetsaanslag opnieuw voor.
  const sleutel = JSON.stringify([berekening.totaal, berekening.regels.map((r) => [r.groep, r.prijs]), ontbreekt]);
  const vak = $('bedrag');
  if (vak.getAttribute('data-sleutel') === sleutel) return;
  vak.setAttribute('data-sleutel', sleutel);
  $('bedrag-totaal').textContent = euro(berekening.totaal);
  const regels = $('bedrag-regels');
  regels.textContent = '';
  inst.leeftijdsgroepen.forEach((g) => {
    const vanGroep = berekening.regels.filter((r) => r.groep === g.naam);
    if (!vanGroep.length) return;
    const som = vanGroep.reduce((t, r) => t + r.prijs, 0);
    regels.appendChild(el('li', {}, [
      el('span', { tekst: vanGroep.length + ' × ' + g.naam }),
      el('span', { class: 'bedrag-regel-som', tekst: euro(som) })
    ]));
  });
  const let_ = $('bedrag-let');
  let_.hidden = ontbreekt === 0;
  let_.textContent = ontbreekt === 1 ? 'Nog 1 kind zonder geldige geboortemaand en -jaar; dat rekenen we mee zodra het is ingevuld.'
    : 'Nog ' + ontbreekt + ' kinderen zonder geldige geboortemaand en -jaar; die rekenen we mee zodra het is ingevuld.';
}
