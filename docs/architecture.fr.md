# Architecture et développement

[English](architecture.md) · **Français**

Pour contribuer : l’organisation du code, les tests, les langues et le mode sombre.

## Architecture

- `src/lib/sequence/` : modèle de séquence et calcul de l'état à une étape donnée. Données pures, sans dépendance à tldraw.
- `src/lib/canvas/adapter.ts` : seul point de contact entre le moteur de présentation et tldraw (lecture/écriture de la séquence dans `document.meta`, caméra, géométrie).
- `src/components/usePresentation.ts` : applique l'état calculé (classes CSS sur les formes), pilote la caméra et le clavier.
- `src/components/PresShapeWrapper.tsx` : enveloppe chaque forme rendue ; le document n'est jamais modifié pendant la présentation.
- `src/lib/tree/` et `src/lib/canvas/tree.ts` : arbres (cartes mentales) sur des formes tldraw ordinaires, reliées par des flèches marquées `meta.branch`. Sans ce module, le document reste un schéma tldraw normal.
- `src/lib/share/` : liens partagés (compression dans le lien, contrôles avant publication publique) ; `src/lib/presentation/screen.ts` et `src/lib/remote/` : double affichage et télécommande.
- `src/lib/map/` : le format JSON des schémas (schéma Zod, contrôles, conversion de la séquence), sans tldraw ; `src/lib/canvas/mapExport.ts` et `mapImport.ts` : conversion depuis et vers le document tldraw.

La séquence est stockée dans le document tldraw : elle bénéficie de l'annuler/rétablir et de la persistance locale (IndexedDB).

## Tests

```bash
pnpm test         # tests unitaires (Vitest) : moteur de séquence, arbres, préréglages, partage
pnpm test:e2e     # tests de bout en bout (Playwright), en mode local, sur un serveur de dev lancé sur le port 3100
```

La première fois : `pnpm exec playwright install chromium`. Pour réutiliser un serveur de dev déjà lancé : `E2E_BASE_URL=http://localhost:3000 pnpm test:e2e`. Le test de la télécommande passe par le service public de PeerJS et n'est lancé qu'avec `E2E_PEERJS=1`. L'intégration continue (GitHub Actions) vérifie types, lint, tests unitaires et de bout en bout.

## Langues

L'interface existe en anglais et en français (sélecteur EN · FR sur l'accueil et la page de connexion) ; par défaut, elle suit la langue du navigateur, et le choix est mémorisé dans un cookie. L'interface de tldraw suit la même langue. Les textes sont dans `src/i18n/` : `en.ts` fait référence, et TypeScript signale toute clé manquante dans `fr.ts`. Ajouter une langue, c'est ajouter un fichier. Le contenu des schémas n'est jamais traduit ; seules les valeurs par défaut suivent la langue (titres, préréglages de départ, exemple : la liberté en français, le cycle de l'eau en anglais).

## Mode sombre

Dans l'éditeur, les panneaux de l'app (étapes, narration, barres d'outils) suivent le thème choisi dans les préférences de tldraw : clair, sombre ou celui du système. L'accueil, la connexion et les mentions légales suivent le thème du système. En mode sombre, la palette Tailwind est redéfinie dans `globals.css` (utilitaire `dark-palette` : gris inversés) : les couleurs de l'interface passent donc par ses variables (`bg-white`, `var(--color-stone-500)`…), jamais par des valeurs en dur.

## Contribuer

Les contributions sont bienvenues : voir [CONTRIBUTING.md](../CONTRIBUTING.md) (en anglais). Le projet suit le [Contributor Covenant](../CODE_OF_CONDUCT.md). Pour signaler une faille, voir [SECURITY.md](../SECURITY.md). Les changements sont listés dans [CHANGELOG.md](../CHANGELOG.md).
