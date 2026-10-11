export function dueHalloweenScare(seconds: number): 'clown' | 'monster' | null {
  if (seconds > 0 && seconds % 150 === 0) return 'monster';
  if (seconds > 0 && seconds % 60 === 0) return 'clown';
  return null;
}

export function canTriggerHalloweenScare(type: 'clown' | 'monster', now: number, lastScare: number, hidden = false) {
  return !hidden && (type === 'monster' || now - lastScare >= 5000);
}
