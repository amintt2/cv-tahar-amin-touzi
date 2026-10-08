# Tahar Amin Touzi — portfolio & CV

Site personnel de **Tahar Amin Touzi**, développeur full-stack, iOS et IA, et son CV en PDF.
En ligne sur **https://tahar.french-web.com**.

- Site statique : HTML, CSS et JavaScript sans framework ni étape de build.
- Même identité visuelle que le CV : grotesk Geist très serré, labels Geist Mono en capitales
  numérotés (`01 — Projets phares`), grille à filets fins, bandeau « nuit » `#0d0f12` à lignes
  topographiques avec un tracé orange `#ff5a1f` en pointillés, logo 2×2 carrés dont un orange.
- Thèmes clair (blanc franc) et sombre (préférence système, bouton pour forcer). Le hero, les plaques
  des captures, le contact et le pied de page restent sombres dans les deux thèmes (classe `.on-night`).
- Animations (tracé du hero, apparitions, bandeau) désactivées si `prefers-reduced-motion` est actif.
- Polices auto-hébergées (Geist, Geist Mono, licence SIL OFL) : aucune requête vers un tiers.

## Arborescence

```
index.html                  la page (tout le contenu est ici)
Tahar-Amin-Touzi-CV.pdf     le CV téléchargé depuis le site (copie de cv/…pdf)
assets/css/style.css        styles ; les couleurs sont des tokens en tête de fichier (clair, sombre, .on-night)
assets/js/main.js           thème, apparitions, filtres de l'index, aperçu au survol, copie de l'e-mail
assets/topo.svg             lignes de niveau (fond du hero, des plaques, de la méthode et du contact)
assets/fonts/               polices woff2 (site + CV)
assets/shots/               captures WebP des projets (1600 px max), thumbs/ en 800 px
assets/og.png               image Open Graph 1200×630
assets/favicon.svg          favicon (logo 2×2) (+ apple-touch-icon.png)
cv/topo.svg                 lignes de niveau du bandeau du CV (format A4)
cv/cv.html, cv/cv.css       source du CV (A4, une page)
cv/Tahar-Amin-Touzi-CV.pdf  CV généré
```

## Mettre à jour un projet

1. Dans `index.html`, un projet phare est un `<article class="case">` : un en-tête
   `.case-head` (numéro, titre, méta en mono, badges), la capture posée sur une plaque sombre
   `<div class="plate" data-cap="Fig. 07 — domaine">` (cadre `.browser`, `.phone`…), puis le
   pitch, les points et une fiche `<dl class="spec">` (lignes « Stack » et « Liens »).
   Les cartes compactes sont des `<article class="mini">` dans la grille `.minis` (visuel sombre
   `.mini-visual.on-night`, puis méta, titre, badges, pitch, points, puces, liens).
   Les numéros (`01`, `02`…) se suivent : fiches d'abord, puis cartes compactes.
2. L'index filtrable est la liste `<ol class="index-list">` : une `<li class="row">` par projet.
   `data-cat` accepte plusieurs catégories séparées par des espaces
   (`saas`, `mobile`, `ia`, `client`, `3d`) ; `data-preview` (facultatif) pointe vers une vignette
   affichée au survol. Les compteurs des filtres se calculent tout seuls.
3. Badges disponibles : `badge-live` (en ligne), `badge-store` (App Store), `badge-client`,
   `badge-oss` (open source), `badge-wip` (en cours / prototype), `badge-muted`.
4. Nouvelle capture : image en WebP, 1600 px de large maximum, moins de ~250 Ko, dans
   `assets/shots/` (et une version 800 px dans `assets/shots/thumbs/` si elle sert au bandeau ou
   à l'aperçu). Toujours renseigner `width`, `height`, `alt` et `loading="lazy"` sous la ligne de flottaison.

5. Le bandeau de chiffres (`.figures`) affiche 4 chiffres, chacun avec sa source en mono
   (`.fig-src`) ; `data-count` anime le compteur.

Règle : n'écrire que des faits vérifiables (chiffres issus des dépôts, liens en ligne).

## Mettre à jour le CV

1. Modifier `cv/cv.html` (contenu) et `cv/cv.css` (mise en page A4).
2. Servir le dossier : `python3 -m http.server 4817`, puis générer le PDF avec Playwright :

   ```js
   // node render-cv.mjs  (Playwright installé ailleurs : npm i playwright)
   import { chromium } from 'playwright';
   const b = await chromium.launch(); const p = await b.newPage();
   await p.goto('http://127.0.0.1:4817/cv/cv.html', { waitUntil: 'networkidle' });
   await p.evaluate(() => document.fonts.ready);
   await p.pdf({ path: 'cv/Tahar-Amin-Touzi-CV.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
   await b.close();
   ```

   On peut aussi ouvrir `cv/cv.html` dans Chrome → Imprimer → « Enregistrer au format PDF »
   (marges : aucune, graphiques d'arrière-plan : activés).
3. Copier le PDF à la racine : `cp cv/Tahar-Amin-Touzi-CV.pdf Tahar-Amin-Touzi-CV.pdf`.
4. Vérifier qu'il tient sur une page.

## Déploiement

Coolify, build pack **Static** : le dépôt est servi tel quel depuis sa racine (`index.html`),
domaine `https://tahar.french-web.com`. Aucun build, aucune variable d'environnement.
Chaque push sur `main` redéploie le site.

En local : `python3 -m http.server 4817` puis http://127.0.0.1:4817.
