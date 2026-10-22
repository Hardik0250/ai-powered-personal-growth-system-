export const gitaReflections = [
  {
    reference: '2.47',
    reflection: 'Give your full attention to the work in front of you; the result is not entirely yours to control.',
  },
  {
    reference: '2.48',
    reflection: 'Meet success and setback with steadiness, and keep doing what is right.',
  },
  {
    reference: '3.19',
    reflection: 'Do the work that needs doing with care, without being ruled by its reward.',
  },
  {
    reference: '6.5',
    reflection: 'Use your own choices and discipline to lift yourself forward.',
  },
  {
    reference: '6.26',
    reflection: 'When your attention wanders, gently bring it back to what matters.',
  },
  {
    reference: '12.13–14',
    reflection: 'Practice kindness, patience, and a steady mind toward others and yourself.',
  },
  {
    reference: '18.45',
    reflection: 'Steady effort in the work suited to you can become a path to growth.',
  },
];

export function getDailyGitaReflection(date = new Date()) {
  const dayOfYear = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(date.getFullYear(), 0, 0)) / 86400000,
  );
  return gitaReflections[(dayOfYear - 1) % gitaReflections.length];
}
