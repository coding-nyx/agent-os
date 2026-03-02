
// Artistic "Soft Vector" Assets
// Style: Modern Editorial / Headspace-esque
// No strokes, shapes defined by fill and shadow.

export const PALETTES = {
  skin: {
    light: ['#F3DACC', '#E0B8A6'], // Base, Shadow
    medium: ['#EDB98A', '#D08B5B'],
    dark: ['#8D5524', '#693B17'],
  },
  hair: {
    dark: ['#2D3748', '#1A202C'],
    brown: ['#4A3B2A', '#3E2723'],
    blonde: ['#D4A373', '#FAEDCD'],
    red: ['#A52A2A', '#800000'],
  },
  clothing: {
    nurturer: ['#F7FAFC', '#E2E8F0'], // Soft White/Grey (Clinical/Clean)
    analyst: ['#2C5282', '#2A4365'], // Deep Blue (Professional)
    pragmatist: ['#38A169', '#2F855A'], // Green (Grounded)
    challenger: ['#E53E3E', '#C53030'], // Red/Bold (Energetic)
  }
};

export const PATHS = {
  // --- Face Shapes (Jawlines & Necks) ---
  face: {
    female: "M 40 60 Q 40 130 70 150 Q 100 165 130 150 Q 160 130 160 60 Q 160 20 100 20 Q 40 20 40 60 Z", // Soft Oval
    male: "M 35 50 Q 35 120 55 140 Q 100 160 145 140 Q 165 120 165 50 Q 165 15 100 15 Q 35 15 35 50 Z", // Stronger Jaw
    neutral: "M 38 55 Q 38 125 62 145 Q 100 162 138 145 Q 162 125 162 55 Q 162 18 100 18 Q 38 18 38 55 Z", // Balanced
  },
  neck: {
     female: "M 75 140 L 75 180 Q 100 185 125 180 L 125 140 Z",
     male: "M 70 135 L 70 180 Q 100 185 130 180 L 130 135 Z",
  },

  // --- Hair (Front & Back layers) ---
  hair: {
    female: {
      front: "M 35 60 Q 60 20 100 20 Q 140 20 165 60 Q 160 100 155 40 Q 130 10 100 10 Q 70 10 45 40 Q 40 100 35 60 Z",
      back: "M 20 60 Q 10 160 40 190 L 160 190 Q 190 160 180 60 Q 180 0 100 0 Q 20 0 20 60 Z"
    },
    male: {
      front: "M 30 55 Q 30 10 100 5 Q 170 10 170 55 Q 170 30 150 20 Q 100 10 50 20 Q 30 30 30 55 Z",
      back: "" // Short hair usually doesn't show behind neck much
    },
    neutral: {
       front: "M 32 55 Q 30 15 100 10 Q 170 15 168 55 L 160 45 Q 130 15 100 15 Q 70 15 40 45 Z",
       back: "M 35 60 Q 30 100 40 120 L 160 120 Q 170 100 165 60 Q 165 20 100 20 Q 35 20 35 60 Z"
    }
  },

  // --- Features ---
  eyes: {
    left: "M 60 75 Q 70 68 80 75 Q 70 82 60 75 Z", // Almond shape
    right: "M 120 75 Q 130 68 140 75 Q 130 82 120 75 Z",
    blinkLeft: "M 60 75 Q 70 78 80 75", // Curved line down
    blinkRight: "M 120 75 Q 130 78 140 75",
    pupil: { cx: 70, cy: 75, r: 3 }
  },
  
  brows: {
    neutral: { left: "M 58 65 Q 70 62 82 65", right: "M 118 65 Q 130 62 142 65" },
    raised: { left: "M 58 62 Q 70 55 82 62", right: "M 118 62 Q 130 55 142 62" },
    furrowed: { left: "M 58 65 Q 70 68 82 70", right: "M 118 70 Q 130 68 142 65" }
  },

  nose: "M 95 85 Q 90 100 100 105 Q 105 100 105 95", // Shadow shape implies nose

  mouth: {
    neutral: "M 85 125 Q 100 128 115 125", // Soft curve
    smile: "M 82 122 Q 100 135 118 122", // U shape
    speaking: {
      A: "M 90 122 Q 100 135 110 122", // Open O
      O: "M 92 120 Q 100 130 108 120 Q 100 110 92 120", // Circle
      M: "M 85 125 Q 100 125 115 125" // Flat/Closed
    }
  },

  // --- Clothing (Shoulders/Torso) ---
  clothing: {
    blazer: "M 20 180 Q 10 190 0 200 L 200 200 Q 190 190 180 180 L 150 160 Q 100 180 50 160 Z",
    sweater: "M 25 170 Q 15 180 5 200 L 195 200 Q 185 180 175 170 L 140 160 Q 100 190 60 160 Z",
    neckLine: "M 75 180 Q 100 210 125 180" // Inner shirt line
  },

  glasses: {
      frames: "M 55 75 A 12 12 0 1 1 79 75 L 121 75 A 12 12 0 1 1 145 75", // Simple connected circles
      lensLeft: { cx: 67, cy: 75, r: 10 },
      lensRight: { cx: 133, cy: 75, r: 10 }
  }
};
