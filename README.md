# Schémas animés (phase 0)

Présentation progressive de schémas sur un canevas tldraw : chaque étape fait apparaître, atténue, cache ou surligne des objets, déplace la caméra et affiche un texte de narration.

```bash
pnpm install
pnpm dev
```

## Architecture

- `src/lib/sequence/` : modèle de séquence et calcul de l'état à une étape donnée. Données pures, sans dépendance à tldraw.
- `src/lib/canvas/adapter.ts` : seul point de contact entre le moteur de présentation et tldraw (lecture/écriture de la séquence dans `document.meta`, caméra, géométrie).
- `src/components/usePresentation.ts` : applique l'état calculé (classes CSS sur les formes), pilote la caméra et le clavier.
- `src/components/PresShapeWrapper.tsx` : enveloppe chaque forme rendue ; le document n'est jamais modifié pendant la présentation.

La séquence est stockée dans le document tldraw : elle bénéficie de l'annuler/rétablir et de la persistance locale (IndexedDB).

## Raccourcis en présentation

`→` / `Espace` / `PageDown` suivant · `←` / `PageUp` précédent · `Début` / `Fin` · `O` vue d'ensemble · `C` recentrer · `K` laser · `N` narration · `F` plein écran · `Échap` quitter (le premier Échap désactive le laser)

Le cadenas de la barre de présentation déverrouille le document : l'interface tldraw réapparaît et seules `PageUp` / `PageDown` naviguent entre les étapes.
