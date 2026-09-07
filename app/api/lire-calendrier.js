// Lit un calendrier iCal Airbnb (côté serveur, pour éviter les soucis de CORS)
// et renvoie soit la date de départ en cours (si un séjour est actif aujourd'hui
// ou s'est terminé aujourd'hui), soit la date de la prochaine arrivée.

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ erreur: 'Lien de calendrier manquant' });
  }

  let icalUrl;
  try {
    icalUrl = new URL(url);
  } catch {
    return res.status(200).json({ erreur: 'Lien de calendrier invalide' });
  }

  try {
    const response = await fetch(icalUrl.toString(), {
      headers: { 'User-Agent': 'Checkbnb/1.0' },
    });
    if (!response.ok) {
      return res.status(200).json({ erreur: 'Impossible de lire ce calendrier' });
    }
    const text = await response.text();
    const evenements = parseIcal(text);

    const today = todayISO();

    // Séjour actif : arrivée déjà passée (ou aujourd'hui), départ pas encore passé (ou aujourd'hui)
    const actifs = evenements
      .filter(e => e.debut <= today && e.fin >= today)
      .sort((a, b) => a.fin.localeCompare(b.fin));

    if (actifs.length > 0) {
      return res.status(200).json({ dateDepart: actifs[0].fin });
    }

    // Sinon, prochaine arrivée à venir
    const prochains = evenements
      .filter(e => e.debut > today)
      .sort((a, b) => a.debut.localeCompare(b.debut));

    if (prochains.length > 0) {
      return res.status(200).json({ dateProchaineArrivee: prochains[0].debut });
    }

    return res.status(200).json({});
  } catch (err) {
    console.error('Erreur lecture calendrier iCal:', err);
    return res.status(200).json({ erreur: 'Impossible de lire ce calendrier' });
  }
}

// Parseur iCal minimal : extrait les VEVENT avec leurs DTSTART/DTEND
// (les exports Airbnb sont des dates simples type DTSTART;VALUE=DATE:20260910)
function parseIcal(text) {
  const lignesBrutes = text.split(/\r\n|\n|\r/);

  // Dépliage : une ligne qui commence par un espace est la continuation de la précédente
  const lignes = [];
  for (const ligne of lignesBrutes) {
    if (/^[ \t]/.test(ligne) && lignes.length > 0) {
      lignes[lignes.length - 1] += ligne.slice(1);
    } else {
      lignes.push(ligne);
    }
  }

  const evenements = [];
  let courant = null;

  for (const ligne of lignes) {
    if (ligne.startsWith('BEGIN:VEVENT')) {
      courant = {};
    } else if (ligne.startsWith('END:VEVENT')) {
      if (courant?.debut && courant?.fin) evenements.push(courant);
      courant = null;
    } else if (courant) {
      if (ligne.startsWith('DTSTART')) {
        const d = extraireDate(ligne);
        if (d) courant.debut = d;
      } else if (ligne.startsWith('DTEND')) {
        const d = extraireDate(ligne);
        if (d) courant.fin = d;
      }
    }
  }

  return evenements;
}

function extraireDate(ligne) {
  // Ex: "DTSTART;VALUE=DATE:20260910" ou "DTSTART:20260910T140000Z"
  const valeur = ligne.split(':').pop().trim();
  const match = valeur.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  const [, annee, mois, jour] = match;
  return `${annee}-${mois}-${jour}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
