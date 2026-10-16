/**
 * DrawRush Original Word Database
 * Family-safe, original word list organized by category.
 * Do NOT copy from any commercial word game.
 */

export interface WordCategory {
  id: string;
  name: string;
  words: string[];
}

export const WORD_CATEGORIES: WordCategory[] = [
  {
    id: "animals",
    name: "Animals",
    words: [
      "cat", "dog", "elephant", "giraffe", "penguin", "dolphin", "octopus",
      "butterfly", "crocodile", "kangaroo", "flamingo", "hedgehog", "parrot",
      "cheetah", "gorilla", "seahorse", "jellyfish", "armadillo", "platypus",
      "chameleon", "peacock", "porcupine", "narwhal", "axolotl", "capybara",
      "meerkat", "quokka", "fennec fox", "snow leopard", "red panda",
    ],
  },
  {
    id: "food",
    name: "Food & Drinks",
    words: [
      "pizza", "sushi", "hamburger", "taco", "sandwich", "pancake", "noodles",
      "watermelon", "pineapple", "avocado", "strawberry", "pretzel", "waffle",
      "smoothie", "doughnut", "popcorn", "cotton candy", "lemonade", "cupcake",
      "macaroni", "broccoli", "blueberry", "mango", "hot chocolate", "milkshake",
      "grilled cheese", "corn on the cob", "birthday cake",
    ],
  },
  {
    id: "nature",
    name: "Nature",
    words: [
      "rainbow", "volcano", "waterfall", "glacier", "coral reef", "tornado",
      "snowflake", "lightning", "aurora borealis", "desert", "mangrove",
      "cave", "canyon", "lagoon", "geyser", "tundra", "meadow", "estuary",
      "stalactite", "driftwood", "whirlpool", "dune", "bamboo forest",
    ],
  },
  {
    id: "objects",
    name: "Objects",
    words: [
      "umbrella", "telescope", "backpack", "compass", "magnifying glass",
      "lantern", "hammock", "hourglass", "thermometer", "microscope",
      "kite", "compass", "binoculars", "periscope", "parachute",
      "yo-yo", "boomerang", "kaleidoscope", "snowglobe", "pinwheel",
      "abacus", "sundial", "doorbell", "trampoline", "windmill",
    ],
  },
  {
    id: "sports",
    name: "Sports & Activities",
    words: [
      "skateboard", "surfing", "archery", "gymnastics", "diving", "fencing",
      "rowing", "polo", "curling", "bobsled", "pole vault", "javelin",
      "discus", "synchronized swimming", "rock climbing", "paragliding",
      "kayaking", "sumo wrestling", "breakdancing", "table tennis",
    ],
  },
  {
    id: "travel",
    name: "Travel & Places",
    words: [
      "lighthouse", "castle", "pyramid", "gondola", "igloo", "skyscraper",
      "hot air balloon", "submarine", "space station", "treehouse",
      "floating market", "windmill", "pagoda", "monastery", "amphitheater",
      "aqueduct", "fjord", "harbor", "bazaar", "caravan",
    ],
  },
  {
    id: "fantasy",
    name: "Fantasy & Magic",
    words: [
      "dragon", "unicorn", "mermaid", "phoenix", "wizard", "fairy",
      "griffin", "centaur", "pegasus", "troll", "goblin", "sphinx",
      "kraken", "giant", "elf", "dwarf", "cyclops", "hydra",
      "beholder", "banshee", "werewolf", "vampire bat",
    ],
  },
  {
    id: "tech",
    name: "Technology",
    words: [
      "robot", "rocket", "satellite", "hologram", "drone", "3D printer",
      "virtual reality", "solar panel", "wind turbine", "electric car",
      "smart watch", "tablet", "headphones", "joystick", "webcam",
    ],
  },
  {
    id: "art",
    name: "Art & Music",
    words: [
      "violin", "trumpet", "drum kit", "guitar", "piano", "harp",
      "xylophone", "ukulele", "accordion", "cello", "tuba", "flute",
      "palette", "easel", "sculpture", "mosaic", "mural", "origami",
      "pottery", "calligraphy",
    ],
  },
  {
    id: "emotions",
    name: "Emotions & Actions",
    words: [
      "yawning", "laughing", "crying", "sleeping", "running", "dancing",
      "thinking", "surprised", "confused", "excited", "bored", "dreaming",
      "sneezing", "waving", "jumping", "meditating", "shivering",
    ],
  },
];

/** All words across categories (deduplicated) */
export const ALL_WORDS: string[] = Array.from(
  new Set(WORD_CATEGORIES.flatMap((c) => c.words))
);

/** Set of blocked/unsafe words (family-safe filtering for custom words and chat). */
const BLOCKED_WORDS = new Set<string>([
  "kill", "hate", "die", "murder", "suicide", "terrorist", "nazi",
  "fuck", "shit", "bitch", "cunt", "asshole", "bastard", "dick", "pussy",
  "whore", "slut", "cock", "fag", "faggot", "nigger", "nigga", "retard",
  "rape", "pedophile", "porn", "penis", "vagina", "dildo"
]);

export function isWordSafe(word: string): boolean {
  const normalized = word.toLowerCase().trim();
  if (BLOCKED_WORDS.has(normalized)) return false;
  const tokens = normalized.split(/[\s_\-]+/);
  for (const token of tokens) {
    if (BLOCKED_WORDS.has(token)) return false;
  }
  return true;
}

/**
 * Get N random words from the available pool.
 * Respects configured categories and custom words.
 * Never returns duplicates within the same call.
 */
export function pickWords(
  count: number,
  options: {
    categories?: string[];
    customWords?: string[];
    exclusiveCustomWords?: boolean;
    usedWords?: Set<string>;
  } = {}
): string[] {
  const { categories, customWords = [], exclusiveCustomWords = false, usedWords = new Set() } = options;

  let pool: string[];

  if (exclusiveCustomWords && customWords.length > 0) {
    pool = customWords.filter(isWordSafe);
  } else {
    // Build pool from selected categories (or all)
    if (categories && categories.length > 0) {
      const catSet = new Set(categories);
      pool = WORD_CATEGORIES.filter((c) => catSet.has(c.id)).flatMap((c) => c.words);
    } else {
      pool = [...ALL_WORDS];
    }
    // Mix in custom words
    if (customWords.length > 0) {
      pool = [...pool, ...customWords.filter(isWordSafe)];
    }
    // Deduplicate
    pool = Array.from(new Set(pool));
  }

  // Exclude already-used words this game
  pool = pool.filter((w) => !usedWords.has(w.toLowerCase()));

  // Shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, count);
}

/** Validate custom words provided by the host. */
export function validateCustomWords(words: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (words.length > 200) errors.push("Too many custom words (max 200).");
  for (const w of words) {
    if (w.trim().length === 0) errors.push(`Empty word found.`);
    if (w.trim().length > 30) errors.push(`Word too long: "${w}"`);
    if (!isWordSafe(w)) errors.push(`Unsafe word: "${w}"`);
  }
  return { valid: errors.length === 0, errors };
}
