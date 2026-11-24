// Scherm Overzicht: waar de editie staat, de kerncijfers, wat er te doen is, wat er laatst gebeurde en de eigen opdrachten.
// Iedereen ziet de kop en "Mijn opdrachten"; de rest alleen met het recht overzicht_zien.
// Vereist app.js (registreerScherm, el, euro, maakIcoon, toegestaneSchermen_, beheerApp, heeftRecht).

var OVERZICHT_TIJDZONE = 'Europe/Amsterdam';
var OVERZICHT_MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
var OVERZICHT_MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

var OVERZICHT_ACTIES = {
  'aanmelden': 'Aanmelding',
  'aanmelding': 'Aanmelding',
  'betaallinkmails': 'Betaallinks gemaild',
  'bon indienen': 'Bon ingediend',
  'kascontrole': 'Kascontrole',
  'herinneringen': 'Herinneringen verstuurd',
  'herinnering': 'Herinnering verstuurd',
  'mail': 'Mail verstuurd',
  'linkOpnieuw': 'Betaallink opnieuw gestuurd',
  'financieel verslag': 'Financieel verslag',
  'betaling toegewezen': 'Betaling toegewezen',
  'betaalstand bijwerken': 'Betaalstand bijgewerkt',
  'bestand opslaan': 'Bestand opgeslagen',
  'register': 'Wijkregister bijgewerkt',
  'beheerWijkregister': 'Wijkregister bekeken',
  'instellingen': 'Instellingen aangepast',
  'fout': 'Er ging iets mis',
  'koppeling ongedaan': 'Koppeling ongedaan gemaakt',
  'gegevens opschonen': 'Gegevens opgeschoond',
  'betaallinks voorbereiden': 'Betaallinks voorbereid',
  'bank inlezen': 'Bankafschrift ingelezen',
  'beheerInloggen': 'Ingelogd op de beheerpagina',
  'beheerLedenOpslaan': 'Commissieleden aangepast',
  'beheerRollenOpslaan': 'Rollen aangepast'
};

var OVERZICHT_OPDRACHT_TYPEN = {
  bonIndienen: 'Bon',
  begrotingPostOpslaan: 'Begrotingspost',
  begrotingPostVerwijderen: 'Begrotingspost verwijderd',
  geldbronOpslaan: 'Geldbron',
  geldbronVerwijderen: 'Geldbron verwijderd'
};

// Per soort te doen: pictogram (svg-binnenwerk) en knoptekst; andere soorten krijgen de standaard.
var OVERZICHT_TE_DOEN = {
  toeTeWijzen: { icoon: '<path d="M3 10h18L12 4z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>', knop: 'Toewijzen' },
  terugbetalen: { icoon: 'kas', knop: 'Bekijken' },
  geldbronTermijn: { icoon: 'geldbronnen', knop: 'Naar geldbronnen' },
  geldbronVerantwoording: { icoon: 'geldbronnen', knop: 'Naar geldbronnen' },
  kascontrole: { icoon: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>', knop: 'Naar kascontrole' }
};
var OVERZICHT_TE_DOEN_STANDAARD = { icoon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', knop: 'Openen' };

var OVERZICHT_VINKJE = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';

// ---- datums en tijden (Europe/Amsterdam) ----

function overzichtDelen_(ms) {
  var delen = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: OVERZICHT_TIJDZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).forEach(function (d) { delen[d.type] = d.value; });
  return { jaar: Number(delen.year), maand: Number(delen.month), dag: Number(delen.day), uur: delen.hour, minuut: delen.minute };
}

// 'jjjj-mm-dd' van vandaag in Nederland.
function overzichtVandaag_() {
  var d = overzichtDelen_(Date.now());
  return d.jaar + '-' + ('0' + d.maand).slice(-2) + '-' + ('0' + d.dag).slice(-2);
}

function overzichtDagnummer_(datum) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(datum || ''));
  return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000) : null;
}

// '7 sep' (lang: '7 september'); met jaartal als het niet dit jaar is.
function overzichtDatumTekst_(datum, lang) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(datum || ''));
  if (!m) return '';
  var maand = Number(m[2]) - 1;
  var tekst = Number(m[3]) + ' ' + (lang ? OVERZICHT_MAANDEN : OVERZICHT_MAANDEN_KORT)[maand];
  return Number(m[1]) === overzichtDelen_(Date.now()).jaar ? tekst : tekst + ' ' + m[1];
}

function overzichtDagen_(n) { return n === 1 ? '1 dag' : n + ' dagen'; }

// Een moment als 'Vandaag 09:31', 'Gisteren', '17 aug'.
function overzichtMomentTekst_(moment) {
  var ms = Date.parse(moment);
  if (!isFinite(ms)) return '';
  var d = overzichtDelen_(ms);
  var datum = d.jaar + '-' + ('0' + d.maand).slice(-2) + '-' + ('0' + d.dag).slice(-2);
  var verschil = overzichtDagnummer_(overzichtVandaag_()) - overzichtDagnummer_(datum);
  if (verschil === 0) return 'Vandaag ' + d.uur + ':' + d.minuut;
  if (verschil === 1) return 'Gisteren';
  return overzichtDatumTekst_(datum, false);
}

function overzichtActieTekst_(actie) {
  var s = String(actie === null || actie === undefined ? '' : actie).trim();
  if (Object.prototype.hasOwnProperty.call(OVERZICHT_ACTIES, s)) return OVERZICHT_ACTIES[s];
  if (Object.prototype.hasOwnProperty.call(OVERZICHT_ACTIES, s.toLowerCase())) return OVERZICHT_ACTIES[s.toLowerCase()];
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- kop en tijdlijn ----

function overzichtVoornaam_() {
  var naam = beheerApp.sessie && beheerApp.sessie.naam ? String(beheerApp.sessie.naam).trim() : '';
  return naam.split(/\s+/)[0] || '';
}

function overzichtGroet_() {
  var uur = Number(overzichtDelen_(Date.now()).uur);
  var groet = uur < 6 ? 'Goedenacht' : uur < 12 ? 'Goedemorgen' : uur < 18 ? 'Goedemiddag' : 'Goedenavond';
  var naam = overzichtVoornaam_();
  return naam ? groet + ', ' + naam : groet;
}

// Eén zin over waar de editie nu staat.
function overzichtStand_(editie, vandaag) {
  var nu = overzichtDagnummer_(vandaag);
  var d = editie.datums || {};
  var open = overzichtDagnummer_(d.open), sluit = overzichtDagnummer_(d.sluit), dag = overzichtDagnummer_(editie.datum);
  if (editie.opSlot) return (editie.naam ? editie.naam + ' is' : 'De editie is') + ' afgesloten.';
  if (dag !== null && nu > dag) return 'Burendag was op ' + overzichtDatumTekst_(editie.datum, true) + '.';
  if (dag !== null && nu === dag) return 'Het is vandaag Burendag!';
  if (open !== null && nu < open) return 'Aanmelden opent over ' + overzichtDagen_(open - nu) + ', op ' + overzichtDatumTekst_(d.open, true) + '.';
  if (sluit !== null && nu <= sluit) {
    return nu === sluit ? 'Aanmelden is open en sluit vandaag.'
      : 'Aanmelden is open en sluit over ' + overzichtDagen_(sluit - nu) + ', op ' + overzichtDatumTekst_(d.sluit, true) + '.';
  }
  if (dag !== null) return 'Aanmelden is gesloten. Burendag is over ' + overzichtDagen_(dag - nu) + ', op ' + overzichtDatumTekst_(editie.datum, true) + '.';
  return '';
}

function overzichtStappen_(editie) {
  var d = editie.datums || {};
  return [
    { naam: 'Aanmelden open', datum: d.open },
    { naam: 'Aanmelden sluit', datum: d.sluit },
    { naam: 'Opgave cateraar', datum: d.opgaveCateraar },
    { naam: 'Uiterste betaling', datum: d.uiterste },
    { naam: 'Burendag', datum: editie.datum }
  ].filter(function (s) { return overzichtDagnummer_(s.datum) !== null; });
}

function overzichtTijdlijn_(editie, vandaag) {
  var nu = overzichtDagnummer_(vandaag);
  var stappen = overzichtStappen_(editie);
  if (stappen.length === 0) return null;
  var huidig = -1;
  for (var i = 0; i < stappen.length; i++) { if (overzichtDagnummer_(stappen[i].datum) >= nu) { huidig = i; break; } }
  var dag = overzichtDagnummer_(editie.datum);
  var lijst = el('ol', { class: 'tijdlijn' }, stappen.map(function (s, i) {
    var staat = huidig < 0 || i < huidig ? 'af' : i === huidig ? 'nu' : 'later';
    var verschil = overzichtDagnummer_(s.datum) - nu;
    return el('li', { class: 'tijdstap tijdstap-' + staat, 'aria-current': staat === 'nu' ? 'step' : null },
      el('span', { class: 'tijdpunt', 'aria-hidden': 'true' }, staat === 'af' ? maakIcoon(OVERZICHT_VINKJE) : null),
      el('span', { class: 'tijdnaam' }, s.naam),
      el('span', { class: 'tijddatum' }, overzichtDatumTekst_(s.datum, false)),
      staat === 'nu' ? el('span', { class: 'tijdnog' }, verschil === 0 ? 'vandaag' : 'over ' + overzichtDagen_(verschil)) : null,
      el('span', { class: 'verborgen' }, staat === 'af' ? ' (voorbij)' : staat === 'nu' ? ' (de volgende stap)' : ''));
  }));
  var kop = el('div', { class: 'tijdkop' },
    dag !== null && dag >= nu ? el('span', { class: 'tijdteller' }, dag === nu ? 'Burendag is vandaag' : 'Nog ' + overzichtDagen_(dag - nu) + ' tot Burendag') : null);
  return el('section', { class: 'kaart tijdkaart', 'aria-label': 'Planning' }, (kop.childNodes.length ? kop : null), lijst);
}

// ---- kerncijfers ----

function overzichtTegel_(label, waarde, sub, balk) {
  return el('div', { class: 'kaart tegel' },
    el('span', { class: 'tegel-label' }, label),
    el('span', { class: 'tegel-waarde' }, waarde),
    balk === undefined || balk === null ? null : el('div', { class: 'balk', role: 'img', 'aria-label': balk + ' procent' }, el('span', { style: 'width:' + balk + '%' })),
    sub ? el('span', { class: 'tegel-sub' }, sub) : null);
}

function overzichtGetal_(w) { return typeof w === 'number' && isFinite(w) ? w : null; }

function overzichtKerncijfers_(o) {
  var aanm = overzichtGetal_(o.aanmeldingen) || 0;
  var teBetalen = overzichtGetal_(o.huishoudensTeBetalen);
  var betaald = overzichtGetal_(o.huishoudensBetaald);
  var open = overzichtGetal_(o.huishoudensOpen);
  var ontvangen = overzichtGetal_(o.betaald);
  var tegels = [overzichtTegel_('Aanmeldingen', String(aanm), 'huishoudens · ' + (overzichtGetal_(o.personen) || 0) + ' personen')];
  if (teBetalen !== null && betaald !== null) {
    var perc = teBetalen > 0 ? Math.max(0, Math.min(100, Math.round(betaald / teBetalen * 100))) : 0;
    tegels.push(overzichtTegel_('Betaald', betaald + ' van ' + teBetalen, perc + '%' + (ontvangen !== null ? ' · ' + euro(ontvangen) + ' binnen' : ' binnen'), perc));
  } else if (ontvangen !== null) {
    tegels.push(overzichtTegel_('Ontvangen', euro(ontvangen), null));
  }
  tegels.push(overzichtTegel_('Nog te ontvangen', euro(o.openstaand), open ? meervoud_(open, 'huishouden', 'huishoudens') : null));
  // blinde kascontrole: null betekent 'nog niet te zien', nooit € 0,00
  tegels.push(o.verwachtBanksaldo === null || o.verwachtBanksaldo === undefined
    ? overzichtTegel_('Verwacht banksaldo', 'Zichtbaar na de kascontrole', 'zodat je het saldo zelf natelt')
    : overzichtTegel_('Verwacht banksaldo', euro(o.verwachtBanksaldo), 'volgens de laatst ingelezen bankafschriften'));
  return el('section', { class: 'tegels', 'aria-label': 'Kerncijfers' }, tegels);
}

// ---- te doen en laatst gebeurd ----

function overzichtMagNaar_(scherm) {
  return !!scherm && toegestaneSchermen_().some(function (s) { return s.naam === scherm; });
}

function overzichtTeDoen_(lijst) {
  var items = Array.isArray(lijst) ? lijst : [];
  var inhoud = items.length === 0
    ? el('div', { class: 'leeg-klein' }, maakIcoon(OVERZICHT_VINKJE, 'pictogram groot'), el('strong', null, 'Niets te doen'), el('span', null, 'Alles is bijgewerkt. Mooi zo!'))
    : el('ul', { class: 'kaart-lijst' }, items.map(function (t) {
        var soort = OVERZICHT_TE_DOEN[t.soort] || OVERZICHT_TE_DOEN_STANDAARD;
        return el('li', null, el('div', { class: 'rij' },
          el('span', { class: 'rij-icoon' }, maakIcoon(soort.icoon)),
          el('div', { class: 'rij-tekst' }, el('div', { class: 'rij-titel' }, t.tekst || '')),
          overzichtMagNaar_(t.scherm) ? el('a', { class: 'knop', href: '#' + t.scherm }, soort.knop) : null));
      }));
  return el('section', { class: 'kaart overzicht-links' }, el('h2', null, 'Te doen'), inhoud);
}

function overzichtLaatstGebeurd_(lijst) {
  var items = Array.isArray(lijst) ? lijst : [];
  var inhoud = items.length === 0
    ? el('p', { class: 'rij-sub', style: 'margin-top:0.75rem' }, 'Er is nog niets gebeurd.')
    : el('ul', { class: 'kaart-lijst' }, items.map(function (g) {
        var resultaat = String(g.resultaat === null || g.resultaat === undefined ? '' : g.resultaat).trim();
        var tekst = overzichtActieTekst_(g.actie) + (resultaat && resultaat.toLowerCase() !== 'ok' ? ': ' + resultaat : '');
        return el('li', { class: 'gebeurd' }, el('span', { class: 'gebeurd-tijd' }, overzichtMomentTekst_(g.moment)), el('span', { class: 'gebeurd-tekst' }, tekst));
      }));
  return el('section', { class: 'kaart overzicht-rechts' }, el('h2', null, 'Laatst gebeurd'), inhoud);
}

// ---- mijn opdrachten ----

function overzichtStatus_(o) {
  switch (o.status) {
    case 'onderweg': return { tekst: 'onderweg', klasse: 'label label-geel' };
    case 'nieuw': return { tekst: 'wordt verwerkt', klasse: 'label label-geel' };
    case 'klaar': return { tekst: 'klaar', klasse: 'label' };
    case 'fout': return { tekst: 'niet gelukt', klasse: 'label label-fout' };
    default: return { tekst: String(o.status || ''), klasse: 'label' };
  }
}

function overzichtOpdrachten_(lijst) {
  var items = (Array.isArray(lijst) ? lijst : []).slice(0, 5);
  var inhoud = items.length === 0
    ? el('p', { class: 'rij-sub', style: 'margin-top:0.75rem' }, 'Je hebt nog niets ingediend.')
    : el('ul', { class: 'kaart-lijst' }, items.map(function (o) {
        var st = overzichtStatus_(o);
        var type = Object.prototype.hasOwnProperty.call(OVERZICHT_OPDRACHT_TYPEN, o.type) ? OVERZICHT_OPDRACHT_TYPEN[o.type] : (o.type || 'Opdracht');
        var wanneer = o.ontvangenOp ? overzichtMomentTekst_(o.ontvangenOp) : '';
        return el('li', null, el('div', { class: 'rij' },
          el('div', { class: 'rij-tekst' },
            el('div', { class: 'rij-titel' }, type),
            wanneer ? el('div', { class: 'rij-sub' }, wanneer) : null,
            o.status === 'fout' && o.melding ? el('div', { class: 'opdracht-melding' }, o.melding) : null),
          el('span', { class: st.klasse }, st.tekst)));
      }));
  return el('section', { class: 'kaart', 'aria-label': 'Mijn opdrachten' }, el('h2', null, 'Mijn opdrachten'), inhoud);
}

// ---- het scherm ----

function overzichtKop_(editie) {
  var vandaag = overzichtVandaag_();
  var acties = [];
  if (overzichtMagNaar_('bon')) acties.push(el('a', { class: 'knop', href: '#bon' }, 'Bon indienen'));
  if (overzichtMagNaar_('betalingen')) acties.push(el('a', { class: 'knop knop-hoofd', href: '#betalingen' }, 'Bankafschrift inlezen'));
  var stand = overzichtStand_(editie, vandaag);
  return el('header', { class: 'paginakop' },
    el('div', null, el('h1', null, overzichtGroet_()), stand ? el('p', null, stand) : null,
      editie.opSlot ? el('span', { class: 'label label-geel', style: 'margin-top:0.5rem' }, 'Afgesloten') : null),
    acties.length ? el('div', { class: 'knoppen' }, acties) : null);
}

function overzichtTeken_(container, staat) {
  var m = staat.momentopname || {};
  var editie = m.editie || { datums: {} };
  var heeftOverzicht = heeftRecht(staat.rechten || [], 'overzicht_zien') && !!m.overzicht;
  var delen = [overzichtKop_(editie)];
  if (heeftOverzicht) {
    var tijdlijn = overzichtTijdlijn_(editie, overzichtVandaag_());
    if (tijdlijn) delen.push(tijdlijn);
    delen.push(overzichtKerncijfers_(m.overzicht));
    delen.push(el('div', { class: 'overzicht-kolommen' }, overzichtTeDoen_(m.overzicht.teDoen), overzichtLaatstGebeurd_(m.overzicht.laatstGebeurd)));
  }
  delen.push(overzichtOpdrachten_(m.mijnOpdrachten));
  container.replaceChildren.apply(container, delen);
}

registreerScherm({
  naam: 'overzicht',
  titel: 'Overzicht',
  recht: null,
  icoon: 'huis',
  teken: overzichtTeken_,
  // Het scherm heeft geen invulvelden: bijwerken tekent gewoon opnieuw.
  bijwerken: overzichtTeken_
});
