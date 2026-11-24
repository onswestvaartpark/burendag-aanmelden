// Maten van afbeeldingen. Alleen function/var op het hoogste niveau (draait in de browser en in Node).

// De maat waarop een foto wordt verkleind: de langste zijde wordt hooguit `max`, de verhouding blijft,
// een kleinere afbeelding blijft ongewijzigd (nooit vergroten) en de uitkomst is in hele pixels (minstens 1).
function doelMaat(breedte, hoogte, max) {
  var b = Number(breedte), h = Number(hoogte), m = Number(max);
  if (!(b > 0) || !(h > 0) || !(m > 0)) return { breedte: Math.max(1, Math.round(b) || 1), hoogte: Math.max(1, Math.round(h) || 1) };
  var langste = Math.max(b, h);
  if (langste <= m) return { breedte: Math.round(b), hoogte: Math.round(h) };
  var factor = m / langste;
  return { breedte: Math.max(1, Math.round(b * factor)), hoogte: Math.max(1, Math.round(h * factor)) };
}
