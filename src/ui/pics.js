// Picture keys from the chapter file, drawn with the device's own emoji font (offline, no assets).
export const PICS = {
  light: '✨', house: '🏠', fish: '🐟', mountain: '⛰️', sky: '🌤️', tree: '🌳', stars: '⭐',
  bird: '🐦', plants: '🌱', candle: '🕯️', moon: '🌙', fire: '🔥', cow: '🐄', people: '👨‍👩‍👧',
  small: '🐜', wrong: '👎', good: '👍', water: '💧', city: '🏙️', sea: '🌊', rest: '😴',
  away: '🚶', work: '🔨',
  lamb: '🐑', lizard: '🦎', bear: '🐻',
  'st-lion': '🦁', 'st-sheep': '🐏', 'st-camel': '🐫', 'st-eagle': '🦅', 'st-dove': '🕊️',
  'st-fish': '🐠', 'st-horse': '🐴', 'st-goat': '🐐', 'st-owl': '🦉', 'st-frog': '🐸',
  'st-deer': '🦌', 'st-rabbit': '🐇',
  piece: '📜', card: '🃏', 'b-blessing': '🙌', 'b-journey-creation': '🌍',
};

export const pic = (key) => PICS[key] || '❔';
