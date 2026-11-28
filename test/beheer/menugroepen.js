// De indeling van het menu in groepen. Pure functies, geen DOM (getest met Node). Alleen function/var op het hoogste niveau.
// Telefoon: onderaan een balk met alleen pictogrammen, een per groep (Home, Mensen, Financieel, Instellingen); een groep met meer dan een scherm
// krijgt bovenaan het scherm een rij tabs. Bon indienen staat niet in de balk maar als ronde +-knop rechtsonder (zie menuBonKnopZichtbaar).
// Computer: het zijmenu toont alle schermen, met de groepsnamen als kleine koppen. De hashes (#kas, #wijkregister, ...) veranderen niet.

// kop: het zijmenu zet de naam als kop boven de schermen van de groep. Home en Bon staan zonder kop. balk: false = niet in de balk onderaan (wel in het zijmenu).
var MENU_GROEPEN = [
  { naam: 'home', titel: 'Home', icoon: 'huis', kop: false, schermen: ['overzicht'] },
  { naam: 'mensen', titel: 'Mensen', icoon: 'deelnemers', kop: true, schermen: ['deelnemers', 'wijkregister'] },
  { naam: 'financieel', titel: 'Financieel', icoon: 'kas', kop: true, schermen: ['betalingen', 'kas', 'begroting', 'geldbronnen'] },
  { naam: 'bon', titel: 'Bon indienen', icoon: 'bon', kop: false, balk: false, schermen: ['bon'] },
  { naam: 'instellingen', titel: 'Instellingen', icoon: 'instellingen', kop: true, schermen: ['instellingen', 'commissie'] }
];

// De naam van een scherm in het menu en in de tabs (anders de titel van het scherm zelf).
var MENU_LABELS = { overzicht: 'Home', bon: 'Bon indienen', geldbronnen: 'Bronnen', instellingen: 'Instellingen', commissie: 'Commissieleden' };

function menuLabel(scherm) {
  return MENU_LABELS[scherm.naam] || scherm.titel || scherm.naam;
}

// toegestaan = de schermen die deze persoon mag zien ({ naam, titel, ... }). Geeft de groepen met minstens een zichtbaar scherm, in de vaste volgorde:
// [{ naam, titel, icoon, kop, balk, schermen: [scherm], doel: naam van het scherm waar het pictogram heen gaat, tabs: true als er meer dan een scherm is }].
// Een scherm dat in geen enkele groep staat krijgt een eigen groep achteraan (zo valt er nooit een scherm uit het menu).
function menuGroepenVoor(toegestaan) {
  var perNaam = {};
  toegestaan.forEach(function (s) { perNaam[s.naam] = s; });
  var gebruikt = {};
  var uit = [];
  MENU_GROEPEN.forEach(function (g) {
    var zichtbaar = g.schermen.filter(function (n) { return perNaam[n] !== undefined; }).map(function (n) { gebruikt[n] = true; return perNaam[n]; });
    if (zichtbaar.length === 0) return;
    uit.push({ naam: g.naam, titel: g.titel, icoon: g.icoon, kop: g.kop, balk: g.balk !== false, schermen: zichtbaar, doel: zichtbaar[0].naam, tabs: zichtbaar.length > 1 });
  });
  toegestaan.forEach(function (s) {
    if (gebruikt[s.naam]) return;
    uit.push({ naam: s.naam, titel: menuLabel(s), icoon: s.icoon || s.naam, kop: false, balk: true, schermen: [s], doel: s.naam, tabs: false });
  });
  return uit;
}

// De groep waar een scherm bij hoort, of null.
function menuGroepVan(groepen, schermNaam) {
  for (var i = 0; i < groepen.length; i++) {
    for (var j = 0; j < groepen[i].schermen.length; j++) if (groepen[i].schermen[j].naam === schermNaam) return groepen[i];
  }
  return null;
}

// De groepen die in de balk onderaan komen.
function menuBalkGroepen(groepen) {
  return groepen.filter(function (g) { return g.balk !== false; });
}

// Moet de ronde +-knop voor 'Bon indienen' er zijn? Alleen voor wie het scherm Bon mag zien (bon_indienen), niet op het scherm Bon zelf
// en niet zolang er een formulier of opslaanbalk open staat (dan zou hij Opslaan of Annuleren kunnen afdekken).
function menuBonKnopZichtbaar(toegestaanNamen, huidig, bewerkOpen) {
  return toegestaanNamen.indexOf('bon') !== -1 && huidig !== 'bon' && bewerkOpen !== true;
}

// De getallen op de pictogrammen, uit de momentopname die er al is: { home, financieel }, elk een getal groter dan 0 of null (niets tonen).
// De lijst teDoen komt van de server en is al gefilterd op wat deze persoon mag zien. Zonder die lijst (geen recht op het overzicht, of nog geen gegevens)
// is Home onbekend en telt Financieel alleen de bonnen die terug te betalen zijn, en alleen voor wie kas_bewerken heeft. Onbekend is nooit 0 of een getal.
function menuTelling(momentopname, rechten) {
  var uit = { home: null, financieel: null };
  var m = momentopname && typeof momentopname === 'object' ? momentopname : null;
  if (m === null) return uit;
  var lijst = m.overzicht && Array.isArray(m.overzicht.teDoen) ? m.overzicht.teDoen : null;
  var getal = function (n) { return typeof n === 'number' && isFinite(n) && n > 0 ? Math.floor(n) : 0; };
  if (lijst !== null) {
    if (lijst.length > 0) uit.home = lijst.length;
    var geld = 0;
    lijst.forEach(function (t) { if (t && (t.soort === 'terugbetalen' || t.soort === 'toeTeWijzen')) geld += getal(t.aantal); });
    if (geld > 0) uit.financieel = geld;
  } else if (m.kas && Array.isArray(m.kas.kasboek) && Array.isArray(rechten) && rechten.indexOf('kas_bewerken') !== -1) {
    var bonnen = m.kas.kasboek.filter(function (r) { return r && r.bron === 'bon' && r.status === 'terug te betalen'; }).length;
    if (bonnen > 0) uit.financieel = bonnen;
  }
  return uit;
}

// Het getal op een menupunt van een scherm (zijmenu en tabs): nu alleen Betalingen, het aantal bankregels dat op een handmatige koppeling wacht (de punten
// 'toeTeWijzen' uit de lijst teDoen van de momentopname), en alleen voor wie betalingen_koppelen heeft. { betalingen: getal groter dan 0 of null }.
function menuSchermTelling(momentopname, rechten) {
  var uit = { betalingen: null };
  var m = momentopname && typeof momentopname === 'object' ? momentopname : null;
  if (m === null || !Array.isArray(rechten) || rechten.indexOf('betalingen_koppelen') === -1) return uit;
  var lijst = m.overzicht && Array.isArray(m.overzicht.teDoen) ? m.overzicht.teDoen : [];
  var n = 0;
  lijst.forEach(function (t) { if (t && t.soort === 'toeTeWijzen' && typeof t.aantal === 'number' && isFinite(t.aantal) && t.aantal > 0) n += Math.floor(t.aantal); });
  if (n > 0) uit.betalingen = n;
  return uit;
}

// De naam van een pictogram met zijn getal: 'Financieel, 2 te doen'. Zonder getal alleen de naam.
function menuBadgeNaam(titel, aantal) {
  return typeof aantal === 'number' && aantal > 0 ? titel + ', ' + aantal + ' te doen' : titel;
}
