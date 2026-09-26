// Mots-clés refusés dans les partages publics (instance sans base de données).
// Liste volontairement courte : seulement des termes sans usage scolaire plausible, pour ne pas
// bloquer un cours de philosophie sur le corps, la violence ou la drogue. Complétable par la
// variable d'environnement SHARE_BLOCKLIST (termes séparés par des virgules).
// Les termes sont comparés sans accents ni majuscules, sur des mots entiers ; les expressions
// (plusieurs mots) sur la suite de mots.

export const BLOCKED_TERMS = [
  // Pornographie explicite
  'porn',
  'porno',
  'pornhub',
  'xvideos',
  'xhamster',
  'xnxx',
  'onlyfans',
  'hentai',
  'camgirl',
  'camgirls',
  'nudes',
  'escort girl',
  'sexcam',
  // Arnaques
  'seed phrase',
  'phrase de recuperation',
  'double your bitcoin',
  'crypto giveaway',
  'airdrop claim',
  'claim your reward',
  'verify your account',
  'verifiez votre compte',
  'free robux',
  'free vbucks',
  'casino bonus',
  'paris sportifs bonus',
  // Piratage
  'keygen',
  'warez',
  'cracked apk',
  // Haine
  'sieg heil',
  'heil hitler',
  'white power',
  'gas the jews',
  'mort aux juifs',
  'mort aux arabes',
  'sale negre',
  'sale bougnoule',
]

/** Raccourcisseurs d'URL : masquent la vraie destination. */
export const BLOCKED_HOSTS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'ow.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at', 'tiny.cc', 'rb.gy']
