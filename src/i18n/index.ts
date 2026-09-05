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
  // The menu button's accessible name. The same word in all three, which is
  // why it is the one string here nobody has to review.
  menu: 'Menu',

  // The landing page's two links. The button is a link because it goes
  // somewhere; `enterWorldAlt` is the way past the world for someone who came
  // to read, and it says "or" rather than offering an apology for the world.
  enterWorld: 'Enter the world',
  enterWorldAlt: 'Or read the work',

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
  // The same sentence for a thumb (Phase 6), and one control shorter. Boost is
  // the only one that needs no telling — it is the drag continued, and pushing
  // further has already made the ship faster before it makes it boost. Naming
  // it cost a third line of the hint in Dutch on a small phone, which is a
  // worse trade than leaving the one gesture that teaches itself unsaid.
  //
  // Nothing here names a control drawn on the screen either, because none of
  // them is: the stick is measured from wherever the finger went down, so there
  // is no ring to aim at and nothing to put a label on.
  worldControlsTouch: 'Drag to fly · two fingers to rise',
  // And the same two for the boat, which has no rise: it floats, so Space and
  // the second finger do nothing and are not named. Shorter on purpose.
  worldControlsBoat: 'WASD or arrows to sail · shift for full sail',
  worldControlsBoatTouch: 'Drag to sail',
  // And the surfer's, which floats like the boat and so has no rise either.
  // "Charge" rather than "boost" or "full sail": it is the word for taking a
  // wave hard, and it is what shift does to a craft this light — the third
  // craft exists because it leaves the water, and the hint says which key does.
  worldControlsSurfer: 'WASD or arrows to surf · shift to charge',
  worldControlsSurferTouch: 'Drag to surf',
  // A toggle button's label stays put and `aria-pressed` carries the state, so
  // this is one word rather than an on and an off in three languages.
  // The map's accessible name. It replaced the world's project list, so it
  // is a landmark for a screen reader rather than decoration.
  worldMap: 'Map of the world',
  sound: 'Sound',
  // The sea, and its two states. "Agitated" rather than "rough" or "stormy":
  // it is the sea's own word in a forecast, and it is what the water is — the
  // same chop with a swell running under it, not weather that arrived.
  sea: 'Sea',
  seaCalm: 'Calm',
  seaAgitated: 'Agitated',
  // The menu's other world setting. One word that has to cover a flying saucer
  // and a sailing boat, in three languages — "craft" does it in English and the
  // other two are Seb's to confirm.
  model: 'Craft',
  modelSaucer: 'Saucer',
  modelBoat: 'Boat',
  modelSurfer: 'Surfer',

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
  menu: 'Menu',

  enterWorld: 'Entrer dans le monde',
  enterWorldAlt: 'Ou lire les projets',

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
  worldControlsTouch: 'Glissez pour voler · deux doigts pour monter',
  worldControlsBoat: 'ZQSD ou flèches pour naviguer · maj pour toute la voile',
  worldControlsBoatTouch: 'Glissez pour naviguer',
  worldControlsSurfer: 'ZQSD ou flèches pour surfer · maj pour foncer',
  worldControlsSurferTouch: 'Glissez pour surfer',
  worldMap: 'Carte du monde',
  sound: 'Son',
  sea: 'Mer',
  seaCalm: 'Calme',
  seaAgitated: 'Agitée',
  model: 'Engin',
  modelSaucer: 'Soucoupe',
  modelBoat: 'Bateau',
  modelSurfer: 'Surfeur',

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
  menu: 'Menu',

  enterWorld: 'Betreed de wereld',
  enterWorldAlt: 'Of lees het werk',

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
  worldControlsTouch: 'Sleep om te vliegen · twee vingers om te stijgen',
  worldControlsBoat: 'WASD of pijltjes om te varen · shift voor volle zeilen',
  worldControlsBoatTouch: 'Sleep om te varen',
  worldControlsSurfer: 'WASD of pijltjes om te surfen · shift om te knallen',
  worldControlsSurferTouch: 'Sleep om te surfen',
  worldMap: 'Kaart van de wereld',
  sound: 'Geluid',
  sea: 'Zee',
  seaCalm: 'Kalm',
  seaAgitated: 'Bewogen',
  model: 'Vaartuig',
  modelSaucer: 'Schotel',
  modelBoat: 'Boot',
  modelSurfer: 'Surfer',

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
