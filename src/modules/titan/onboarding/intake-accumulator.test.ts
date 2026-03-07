import { describe, it, expect } from 'vitest';
import { 
  appendFromUserMessage, 
  createAccumulatorFromProfile, 
  getMissingSectionsFromAccumulator 
} from './intake-accumulator';

describe('Titan IntakeAccumulator Logic', () => {
  it('extracts complex nutrition and activity data from a single message', () => {
    const base = createAccumulatorFromProfile(null);
    const message = "I eat 2500 calories with 200g protein and work out 4 times a week. I am quite active.";
    
    const next = appendFromUserMessage(base, message);
    
    expect(next.nutrition.calories).toBe(2500);
    expect(next.nutrition.proteinGrams).toBe(200);
    expect(next.activity.workoutsPerWeek).toBe(4);
    expect(next.activity.activityLevel).toBe('active');
  });

  it('identifies missing sections correctly', () => {
    const acc = createAccumulatorFromProfile(null);
    expect(getMissingSectionsFromAccumulator(acc)).toEqual(['nutrition', 'activity', 'history']);
    
    const withNutrition = appendFromUserMessage(acc, "I take creatine and eat 3 meals a day");
    expect(getMissingSectionsFromAccumulator(withNutrition)).toEqual(['activity', 'history']);
  });

  it('appends unique items to lists (supplements/injuries) without duplicates', () => {
    let acc = createAccumulatorFromProfile(null);
    acc = appendFromUserMessage(acc, "I take Vitamin D");
    acc = appendFromUserMessage(acc, "I take Vitamin D and Magnesium");
    
    expect(acc.nutrition.supplements).toContain('vitamin d');
    expect(acc.nutrition.supplements).toContain('magnesium');
    expect(acc.nutrition.supplements).toHaveLength(2);
  });
});
