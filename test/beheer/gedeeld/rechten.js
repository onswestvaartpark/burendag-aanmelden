// Rechten en rollen van de beheerpagina. Alleen function/var op het hoogste niveau
// (het bestand draait ook in de browser en in Apps Script). Interne hulpfuncties eindigen op _.

var RECHTEN = ['overzicht_zien', 'deelnemers_zien', 'persoonsgegevens_zien', 'deelnemer_bewerken', 'betalingen_zien', 'bank_inlezen', 'betalingen_koppelen', 'herinneringen_versturen', 'bon_indienen', 'kas_zien', 'kas_bewerken', 'kascontrole_doen', 'begroting_zien', 'begroting_bewerken', 'geldbronnen_zien', 'geldbronnen_bewerken', 'verslag_maken', 'opschonen', 'mails_versturen', 'instellingen_beheren', 'leden_beheren'];

var STANDAARD_ROLLEN = {
  'Beheerder': {
    rechten: RECHTEN.slice(),
    omschrijving: 'Mag alles, ook de leden en de instellingen beheren.'
  },
  'Penningmeester': {
    rechten: RECHTEN.filter(function (r) { return r !== 'instellingen_beheren' && r !== 'leden_beheren' && r !== 'opschonen'; }),
    omschrijving: 'Beheert het geld en de deelnemers, maar niet de leden en instellingen.'
  },
  'Kascontroleur': {
    rechten: ['overzicht_zien', 'kas_zien', 'kascontrole_doen', 'begroting_zien', 'geldbronnen_zien', 'verslag_maken', 'bon_indienen'],
    omschrijving: 'Kijkt mee in de kas en controleert die.'
  },
  'Lid': {
    rechten: ['overzicht_zien', 'deelnemers_zien', 'bon_indienen', 'kas_zien', 'begroting_zien', 'geldbronnen_zien', 'geldbronnen_bewerken'],
    omschrijving: 'Commissielid: kijkt mee en dient bonnen in.'
  },
  'Alleen lezen': {
    rechten: ['overzicht_zien', 'kas_zien', 'begroting_zien', 'geldbronnen_zien'],
    omschrijving: 'Kijkt alleen mee.'
  }
};

function rechtenHeeftRol_(rollen, naam) {
  return !!rollen && Object.prototype.hasOwnProperty.call(rollen, naam) && !!rollen[naam];
}

function rechtenMail_(email) {
  return String(email === undefined || email === null ? '' : email).trim().toLowerCase();
}

// Vereniging van de rechten van de rollen van dit lid; gesorteerd, zonder dubbelen.
function rechtenVoor(lid, rollen) {
  if (!lid || !lid.actief || !Array.isArray(lid.rollen)) return [];
  var gevonden = {};
  for (var i = 0; i < lid.rollen.length; i++) {
    if (!rechtenHeeftRol_(rollen, lid.rollen[i])) continue;
    var lijst = rollen[lid.rollen[i]].rechten || [];
    for (var j = 0; j < lijst.length; j++) {
      if (RECHTEN.indexOf(lijst[j]) >= 0) gevonden[lijst[j]] = true;
    }
  }
  return Object.keys(gevonden).sort();
}

function heeftRecht(rechten, recht) {
  return Array.isArray(rechten) && rechten.indexOf(recht) >= 0;
}

// Nederlandse meldingen over de ledenlijst; leeg = goed.
function controleerLeden(leden, rollen) {
  var meldingen = [];
  var gezien = {};
  var beheerders = 0;
  for (var i = 0; i < (leden || []).length; i++) {
    var l = leden[i];
    var email = rechtenMail_(l.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      meldingen.push('"' + String(l.email === undefined || l.email === null ? '' : l.email).trim() + '" is geen geldig e-mailadres.');
    } else if (gezien[email]) {
      var melding = 'Het e-mailadres ' + email + ' staat er dubbel in.';
      if (meldingen.indexOf(melding) < 0) meldingen.push(melding);
    }
    gezien[email] = true;
    var rolnamen = Array.isArray(l.rollen) ? l.rollen : [];
    for (var j = 0; j < rolnamen.length; j++) {
      if (!rechtenHeeftRol_(rollen, rolnamen[j])) {
        meldingen.push('Bij ' + email + ' staat een onbekende rol: ' + rolnamen[j] + '.');
      }
    }
    if (l.actief && rolnamen.indexOf('Beheerder') >= 0) beheerders++;
  }
  if (beheerders === 0) meldingen.push('Er moet minstens één actieve beheerder zijn.');
  return meldingen;
}

// Nederlandse meldingen over de rollen; leeg = goed.
function controleerRollen(rollen, leden) {
  var meldingen = [];
  rollen = rollen || {};
  var namen = Object.keys(rollen);
  for (var i = 0; i < namen.length; i++) {
    var lijst = rollen[namen[i]] && Array.isArray(rollen[namen[i]].rechten) ? rollen[namen[i]].rechten : [];
    for (var j = 0; j < lijst.length; j++) {
      if (RECHTEN.indexOf(lijst[j]) < 0) meldingen.push('De rol ' + namen[i] + ' heeft een onbekend recht: ' + lijst[j] + '.');
    }
  }
  if (!rechtenHeeftRol_(rollen, 'Beheerder')) {
    meldingen.push('De rol Beheerder ontbreekt.');
  } else {
    var beh = rollen.Beheerder.rechten || [];
    for (var k = 0; k < RECHTEN.length; k++) {
      if (beh.indexOf(RECHTEN[k]) < 0) { meldingen.push('De rol Beheerder moet alle rechten houden.'); break; }
    }
  }
  // Een rolnaam staat als tekst in een lijst met komma's in de Sheet: alleen letters, cijfers, spaties en streepjes.
  namen = Object.keys(rollen || {});
  for (var q = 0; q < namen.length; q++) {
    if (!/^[A-Za-z0-9\u00C0-\u024F][A-Za-z0-9\u00C0-\u024F \-]{0,39}$/.test(namen[q]) || namen[q] === 'constructor') {
      meldingen.push('De naam van de rol "' + namen[q] + '" mag alleen letters, cijfers, spaties en streepjes bevatten (hooguit 40 tekens).');
    }
  }
  var gemeld = {};
  for (var m = 0; m < (leden || []).length; m++) {
    var r = Array.isArray(leden[m].rollen) ? leden[m].rollen : [];
    for (var n = 0; n < r.length; n++) {
      if (!rechtenHeeftRol_(rollen, r[n]) && !gemeld[r[n]]) {
        gemeld[r[n]] = true;
        meldingen.push('De rol ' + r[n] + ' wordt nog gebruikt door een lid en kan niet ontbreken.');
      }
    }
  }
  return meldingen;
}
