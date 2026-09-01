import type { Locale } from './locales'

export * from './locales'

/**
 * UI strings, one typed object per locale. English defines the shape; `fr` and
 * `nl` are annotated with it, so a missing or stray key is a type error rather
 * than a blank on the page. Roughly thirty strings — see CLAUDE.md for why this
 * is not a library.
 */
const en = {
  name: 'Seb Pinchetti',
  role: 'Software developer',
  bio: 'Software developer. ',

  skipToContent: 'Skip to the case studies',
  navHome: 'Home',
  navWork: 'Work',
  languages: 'Language',

  homeWorkHeading: 'Selected work',
  workTitle: 'Work',
  workIntro: 'Three case studies. Each one says what I chose, what I rejected, and what it cost.',
  workDescription: 'Case studies: a VS Code extension that reads data schemas without running your code, a trilingual site for an artist, and a Scrabble analysis board.',

  readCaseStudy: 'Read the case study',
  backToWork: 'All work',
  labelYear: 'Year',
  labelStack: 'Stack',
  linkSite: 'Visit the site',
  linkRepo: 'View the source',
  noLink: 'Not deployed — the write-up is the artefact.',

  // The world's only string. `useInput` reads physical key codes, so the keys
  // named here are the ones under the same fingers on any layout — which is why
  // the French line says ZQSD and means the same three keys.
  worldControls: 'WASD or arrows to fly · space to rise · shift to boost',

  notFoundTitle: 'Nothing here',
  notFoundBody: 'That page does not exist, or it moved. The work is all one click away.',

  footerNote: 'Built as a static site. No backend, no database, no tracking.',
  emailLabel: 'Email',
} as const

export type Strings = { -readonly [K in keyof typeof en]: string }

const fr: Strings = {
  name: 'Seb Pinchetti',
  role: 'Développeur web & SaaS',
  bio: "Développeur d'applications web et SaaS à Bruxelles. J'aime les problèmes dont la bonne réponse existe et que personne n'a pris la peine de chercher.",

  skipToContent: 'Aller aux études de cas',
  navHome: 'Accueil',
  navWork: 'Projets',
  languages: 'Langue',

  homeWorkHeading: 'Projets choisis',
  workTitle: 'Projets',
  workIntro: "Trois études de cas. Chacune dit ce que j'ai choisi, ce que j'ai écarté, et ce que ça a coûté.",
  workDescription: "Études de cas : une extension VS Code qui lit les schémas de données sans exécuter votre code, un site trilingue pour une artiste, et un analyseur de parties de Scrabble.",

  readCaseStudy: "Lire l'étude de cas",
  backToWork: 'Tous les projets',
  labelYear: 'Année',
  labelStack: 'Stack',
  linkSite: 'Voir le site',
  linkRepo: 'Voir le code',
  noLink: "Pas déployé — c'est le texte qui fait foi.",

  worldControls: 'ZQSD ou flèches pour voler · espace pour monter · maj pour accélérer',

  notFoundTitle: 'Rien ici',
  notFoundBody: "Cette page n'existe pas, ou elle a bougé. Les projets sont à un clic.",

  footerNote: 'Site statique. Pas de backend, pas de base de données, pas de traceurs.',
  emailLabel: 'E-mail',
}

const nl: Strings = {
  name: 'Seb Pinchetti',
  role: 'Web- & SaaS-ontwikkelaar',
  bio: 'Web- en SaaS-ontwikkelaar in Brussel. Ik hou van problemen waarvan het juiste antwoord te vinden is en waar niemand de moeite heeft genomen om te kijken.',

  skipToContent: 'Ga naar de casestudy’s',
  navHome: 'Home',
  navWork: 'Werk',
  languages: 'Taal',

  homeWorkHeading: 'Geselecteerd werk',
  workTitle: 'Werk',
  workIntro: 'Drie casestudy’s. Elke zegt wat ik koos, wat ik verwierp, en wat het kostte.',
  workDescription: 'Casestudy’s: een VS Code-extensie die dataschema’s leest zonder je code uit te voeren, een drietalige site voor een kunstenares, en een Scrabble-analysebord.',

  readCaseStudy: 'Lees de casestudy',
  backToWork: 'Al het werk',
  labelYear: 'Jaar',
  labelStack: 'Stack',
  linkSite: 'Bekijk de site',
  linkRepo: 'Bekijk de broncode',
  noLink: 'Niet uitgebracht — de tekst is het werkstuk.',

  worldControls: 'WASD of pijltjes om te vliegen · spatie om te stijgen · shift voor snelheid',

  notFoundTitle: 'Hier is niets',
  notFoundBody: 'Die pagina bestaat niet, of is verhuisd. Het werk is één klik weg.',

  footerNote: 'Statische site. Geen backend, geen database, geen trackers.',
  emailLabel: 'E-mail',
}

export const STRINGS: Record<Locale, Strings> = { en, fr, nl }

export const CONTACT = {
  email: 'pinchetti.dev@gmail.com',
  github: 'https://github.com/Shambels',
} as const

export const SITE_URL = 'https://pinchs.be'
