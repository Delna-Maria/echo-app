// ===== EDIT YOUR ROUTES HERE =====
// This plays the role of the "Map Service" (pre-mapped routes).
// Each destination is a list of spoken steps. Replace with your real college corridors.
export const ROUTES: Record<string, string[]> = {
  'Library': [
    'Walk straight along the corridor for 15 steps.',
    'Turn left at the notice board.',
    'Walk 10 steps. The staircase is on your right. Keep to the left wall.',
    'The library door is straight ahead.',
  ],
  'Computer Lab': [
    'Walk straight for 20 steps.',
    'Turn right at the water cooler.',
    'Walk 8 steps. The lab door is on your left.',
  ],
  'Main Exit': [
    'Turn around and walk straight for 25 steps.',
    'Turn left at the end of the corridor.',
    'The exit door is straight ahead.',
  ],
};
