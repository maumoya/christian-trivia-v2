// Interface words in English and Spanish. Story text lives in the chapter file, not here.
export const STRINGS = {
  en: {
    title: 'ARCA', subtitle: 'Creation', play: 'Play', continue: 'Continue', next: 'Next',
    listen: 'Hear it again', replayMoment: 'Watch again', voiceOff: 'voice off', voiceOn: 'voice on',
    yes: 'Yes!', tryAgain: 'Try again', hint: 'A clue',
    stopHere: 'Stop here', keepExploring: 'Keep exploring', stopAsk: 'Nice place to stop. What now?',
    stopped: 'Time to rest. Come back soon!', stoppedQuiet: 'It is quiet time now. See you tomorrow!',
    stoppedTime: 'That is enough play for today. See you tomorrow!', resume: 'Play more',
    cards: 'Cards', badges: 'Badges', path: 'Path', friends: 'Friends', close: 'Close',
    findThese: 'Find:', walkAway: 'Leave for now', found: 'Found!',
    newCard: 'New card', newBadge: 'New badge', newFriend: 'A friend joined you',
    gateClosed: 'The light opens this way when you finish here.',
    oneMore: 'One more thing before the end',
    endTitle: 'You walked through Creation!', stars: 'Stars', memory: 'Remember',
    tryToday: 'Try today', weDidIt: 'We did it (grown-up)', playAgain: 'Walk again',
    remember: 'Remember this?', twoPlayers: '2 players', onePlayer: '1 player',
    grownUps: 'Grown-ups', adultHold: 'Hold the button for 3 seconds, then type the answer.',
    hold: 'Hold', check: 'Check', wrongGate: 'Not quite. Try again.',
    settings: 'Settings', language: 'Language', minutes: 'Minutes per day', translation: 'Bible',
    saveCode: 'Progress code', loadCode: 'Load a code', codeBad: 'That code does not work.',
    codeLoaded: 'Progress loaded.', apply: 'Apply', empty: 'Nothing yet. Keep walking!',
    item: 'A hidden friend!', piece: 'A verse piece!', offline: 'Works without internet',
    readVerses: 'Read the Bible verses',
  },
  es: {
    title: 'ARCA', subtitle: 'La creación', play: 'Jugar', continue: 'Seguir', next: 'Siguiente',
    listen: 'Escuchar otra vez', replayMoment: 'Ver otra vez', voiceOff: 'voz apagada', voiceOn: 'voz encendida',
    yes: '¡Sí!', tryAgain: 'Intenta otra vez', hint: 'Una pista',
    stopHere: 'Parar aquí', keepExploring: 'Seguir explorando', stopAsk: 'Buen lugar para parar. ¿Y ahora?',
    stopped: 'Hora de descansar. ¡Vuelve pronto!', stoppedQuiet: 'Ahora es hora de calma. ¡Hasta mañana!',
    stoppedTime: 'Ya jugaste bastante hoy. ¡Hasta mañana!', resume: 'Jugar más',
    cards: 'Tarjetas', badges: 'Insignias', path: 'Camino', friends: 'Amigos', close: 'Cerrar',
    findThese: 'Busca:', walkAway: 'Dejar por ahora', found: '¡Encontrado!',
    newCard: 'Tarjeta nueva', newBadge: 'Insignia nueva', newFriend: 'Un amigo se unió',
    gateClosed: 'La luz abre este camino cuando termines aquí.',
    oneMore: 'Una cosa más antes del final',
    endTitle: '¡Recorriste la creación!', stars: 'Estrellas', memory: 'Recuerda',
    tryToday: 'Prueba hoy', weDidIt: 'Lo hicimos (adulto)', playAgain: 'Caminar otra vez',
    remember: '¿Te acuerdas?', twoPlayers: '2 jugadores', onePlayer: '1 jugador',
    grownUps: 'Adultos', adultHold: 'Mantén el botón 3 segundos y escribe la respuesta.',
    hold: 'Mantener', check: 'Revisar', wrongGate: 'Casi. Intenta otra vez.',
    settings: 'Ajustes', language: 'Idioma', minutes: 'Minutos por día', translation: 'Biblia',
    saveCode: 'Código de progreso', loadCode: 'Cargar un código', codeBad: 'Ese código no funciona.',
    codeLoaded: 'Progreso cargado.', apply: 'Aplicar', empty: 'Nada aún. ¡Sigue caminando!',
    item: '¡Un amigo escondido!', piece: '¡Un pedazo del versículo!', offline: 'Funciona sin internet',
    readVerses: 'Leer los versículos',
  },
};

let strict = false;
export const setStrict = (on) => { strict = Boolean(on); };

export function t(key, lang = 'en') {
  const v = STRINGS[lang]?.[key] ?? STRINGS.en[key];
  if (v === undefined) {
    if (strict) throw new Error(`missing string: ${key}`);
    return key;
  }
  return v;
}
