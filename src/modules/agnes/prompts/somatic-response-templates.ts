/**
 * Somatic Response Templates for Agnes
 *
 * These templates provide structured response patterns for common physical sensations
 * reported by clients. Each template follows the clinical sequence:
 * 1. Normalize (validate sensation as meaningful)
 * 2. Metaphor (accessible language linking stress to body)
 * 3. Reframe (interpret as communication, not pathology)
 * 4. Explore (open-ended question about underlying need)
 *
 * Usage: These are guidelines for the therapist persona, not rigid scripts.
 * Adapt language to match the client's communication style and context.
 */

export interface SomaticTemplate {
  sensation: string;
  normalize: string;
  metaphor: string;
  reframe: string;
  exploration: string;
  fullResponse: (context?: { clientName?: string; theme?: string }) => string;
}

export const SOMATIC_RESPONSE_TEMPLATES: Record<string, SomaticTemplate> = {
  /**
   * Chest Pressure + Urge to Punch
   * Common in high stress, anger/frustration, suppressed aggression
   * CLINICAL SEQUENCE: Validate → Regulate → Explore
   */
  chestPressure: {
    sensation: 'chest pressure with urge to punch',
    normalize: 'That chest pressure and urge to punch—your anger makes complete sense. Your body is trying to push back and release the pressure that\'s built up.',
    metaphor: 'It\'s like your nervous system is activated and looking for discharge, the way pressure builds in a system until it has to release.',
    reframe: 'This isn\'t something to be ashamed of. Your system is communicating that it needs to move and discharge that activation.',
    exploration: 'Before we explore what\'s underneath, let\'s help your body release this safely. What would help right now—movement, intense breathing, or something else? Once your nervous system settles, we can look at what\'s driving this.',
    fullResponse: () => `
That chest pressure and urge to punch—your anger makes complete sense. Your body is trying to push back and release the pressure that's built up.

Let's help your system discharge that safely first. What would help right now—movement, intense breathing, grounding? Once your nervous system settles, we can explore what's underneath this.
    `.trim()
  },

  /**
   * Muscle Tension / Tightness
   * Common in sustained stress, anxiety, emotional suppression
   */
  muscleTension: {
    sensation: 'muscle tension or tightness',
    normalize: 'Your body is holding that tension as protection. That\'s a completely understandable response to what you\'re carrying.',
    metaphor: 'When we\'re under pressure, muscles contract as if bracing for impact.',
    reframe: 'This tension is telling me your system is working hard to keep things together.',
    exploration: 'Where does your body want to go with this? What would relief look like — would it be release, movement, rest, or something else?',
    fullResponse: () => `
Your body is holding that tension as protection. That's a completely understandable response.

When we're under pressure, muscles contract as if bracing for impact. This tells me your system is working hard to keep things together. Where does your body want to go with this? What would relief look like — would it be release, movement, rest, or something else?
    `.trim()
  },

  /**
   * Throat Tightness / Difficulty Speaking
   * Common in suppressed emotions, fear of judgment, grief
   */
  throatTightness: {
    sensation: 'throat tightness or difficulty speaking',
    normalize: 'That tightness in your throat is often the body\'s way of protecting itself when emotions feel too big or unsafe to express.',
    metaphor: 'It\'s like your throat is a gatekeeper, deciding what\'s safe to let out.',
    reframe: 'This tightness is your system saying something wants to come out but it\'s not sure it\'s safe.',
    exploration: 'What do you think is trying to come out? And what would need to happen for it to feel safe to let it?',
    fullResponse: () => `
That tightness in your throat is often the body's way of protecting itself when emotions feel too big or unsafe to express.

It's like your throat is a gatekeeper, deciding what's safe to let out. This tells me something wants to come out but it's not sure it's safe. What do you think is trying to come out? And what would need to happen for it to feel safe to let it?
    `.trim()
  },

  /**
   * Stomach / Gut Tension
   * Common in anxiety, intuitive sensing of threat, shame
   */
  gutTension: {
    sensation: 'stomach tightness or gut tension',
    normalize: 'Your gut is incredibly intelligent. When it tightens, it\'s often picking up on something your conscious mind hasn\'t quite articulated yet.',
    metaphor: 'The gut responds to threat or uncertainty long before the thinking brain catches up.',
    reframe: 'This tension is your system\'s way of saying "Something isn\'t right, pay attention."',
    exploration: 'Before we explore what your gut is picking up on, let\'s let your nervous system settle a little. Try a few slower, deeper breaths — or simply notice the weight of your body. Once you feel that tightening ease even a fraction, we can look at what it\'s trying to signal.',
    fullResponse: () => `
Your gut is incredibly intelligent. When it tightens, it's often picking up on something your conscious mind hasn't quite articulated yet.

The gut responds to threat or uncertainty long before the thinking brain catches up. Before we explore what your gut is picking up on, let's help your nervous system settle a little. Try a few slower, deeper breaths — or simply notice the weight of your body in the seat. Once you feel that tightening ease even a fraction, we can look at what it's trying to signal.
    `.trim()
  },

  /**
   * Heaviness / Fatigue
   * Common in depression, depletion, suppressed grief, dissociation
   */
  heaviness: {
    sensation: 'heaviness or fatigue throughout the body',
    normalize: 'That heaviness often carries something — grief, exhaustion, or the weight of carrying things alone.',
    metaphor: 'It\'s like your body is saying "I\'m tired of holding this."',
    reframe: 'This isn\'t laziness or weakness. It\'s your system communicating that something needs to shift.',
    exploration: 'What is the weight that your body is carrying? What would it mean to set it down, even for a moment?',
    fullResponse: () => `
That heaviness often carries something — grief, exhaustion, or the weight of carrying things alone. It's like your body is saying "I'm tired of holding this."

This isn't laziness or weakness. It's your system communicating that something needs to shift. What is the weight that your body is carrying? What would it mean to set it down, even for a moment?
    `.trim()
  },

  /**
   * Tremor / Shakiness
   * Common in anxiety, activation, grief, dissociation
   * SAFETY NOTE: Gate tremor allowance behind grounding-first; check-in before any encouragement to allow tremor.
   */
  tremor: {
    sensation: 'tremor or shakiness',
    normalize: 'Tremor is often the body\'s way of releasing activation or emotion that needs to move through.',
    metaphor: 'It\'s like your nervous system is discharging energy, the way thunder releases pressure from a storm.',
    reframe: 'That shaking is actually a sign your body is trying to process and release, not that something is wrong.',
    exploration: 'First — let\'s help your system feel safe. Try pressing your feet firmly into the floor and looking slowly around the room, naming a few things you can see. How does that feel? If the shaking continues after grounding and you feel stable — not overwhelmed — that can sometimes be your system releasing. But let\'s not rush it.',
    fullResponse: () => `
Tremor is often the body's way of releasing activation or emotion that needs to move through. It's like your nervous system is discharging energy, the way thunder releases pressure from a storm.

First — let's help your system feel safe. Try pressing your feet firmly into the floor and looking slowly around the room, naming a few things you can see. How does that feel? If the shaking continues after grounding and you feel stable — not overwhelmed — that can sometimes be your system releasing. But let's not rush it.
    `.trim()
  },

  /**
   * Numbness / Disconnection
   * Common in trauma, dissociation, overwhelm, protection
   * CONTRAINDICATION: Do NOT use exploration questions when dissociation/numbness is active — use grounding only.
   */
  numbness: {
    sensation: 'numbness or feeling disconnected from the body',
    normalize: 'That numbness is actually a protective response. When emotions become too much, the body sometimes goes quiet to survive.',
    metaphor: 'It\'s like your body is saying "This is too much right now, I need to step back."',
    reframe: 'This isn\'t a sign you\'re broken. It\'s evidence of how resilient you are — your system knows how to protect you.',
    exploration: 'That disconnection makes sense — your system is protecting you. Let\'s not push into it right now. Can you feel your feet on the floor? Try pressing them down gently. Notice the weight of your body in the seat. We can stay here for a moment before going anywhere.',
    fullResponse: () => `
That numbness is actually a protective response. When emotions become too much, the body sometimes goes quiet to survive. It's like your body is saying "This is too much right now, I need to step back."

This isn't a sign you're broken. It's evidence of how resilient you are. Let's not push past it. Can you feel your feet on the floor? Try pressing them down gently and noticing the weight of your body in the seat. Once you feel a little more present, we can go from there.
    `.trim()
  },

  /**
   * Racing Heart / Palpitations
   * Common in anxiety, panic, fear, acute stress
   */
  racingHeart: {
    sensation: 'racing heart or palpitations',
    normalize: 'Your heart is responding to something your system perceives as urgent or unsafe. That\'s exactly what it\'s designed to do.',
    metaphor: 'When your nervous system detects threat, your heart rate increases to prepare your body to respond.',
    reframe: 'This racing is your body mobilizing energy, not a sign something is medically wrong (though if this is new or severe, checking with a doctor is reasonable).',
    exploration: 'Let\'s slow your breathing first — even a few longer exhales can signal safety to your nervous system. Try it now. How does that feel? Has anything shifted in your chest? Once your system settles, we can look at what it was responding to.',
    fullResponse: () => `
Your heart is racing because your system perceives something as urgent or unsafe. That's exactly what it's designed to do. It's like your body is mobilizing energy to help you respond.

Let's slow your breathing first — even a few longer exhales can signal safety to your nervous system. Try it now. How does that feel? Has anything shifted in your chest? Once your system settles, we can look at what it was responding to.
    `.trim()
  },

  /**
   * Breathing Difficulty / Chest Tightness (Anxiety Variant)
   * Common in anxiety, panic, hyperventilation
   * NOTE: Distinct from chestPressure which pairs with anger/aggression urges
   */
  breathingDifficulty: {
    sensation: 'difficulty breathing or chest tightness from anxiety',
    normalize: 'When your nervous system is activated, your breathing naturally becomes shallow — it\'s part of the fight-or-flight response.',
    metaphor: 'Your chest tightens as if to brace for something, which makes it harder to take full breaths.',
    reframe: 'This isn\'t dangerous, even though it feels scary. Your body is trying to protect you, but it\'s over-protecting.',
    exploration: 'Let\'s help your breathing settle first with some slower, longer breaths. Once your chest opens back up, we can explore what your system is bracing against.',
    fullResponse: () => `
When your nervous system is activated, your breathing becomes shallow — it's part of the protective response. Your chest tightens as if bracing for something.

This feels scary but isn't dangerous. Your body is trying to protect you, but it's over-protecting. Let's help your breathing settle with slower, longer breaths. Once your chest opens back up, we can explore what your system is bracing against.
    `.trim()
  },

  /**
   * Jaw Clenching / Teeth Grinding
   * Common in stress, suppressed anger, tension
   */
  jawClenching: {
    sensation: 'jaw clenching or teeth grinding',
    normalize: 'Your jaw often holds tension when you\'re under stress or when emotions feel unsafe to express.',
    metaphor: 'The jaw clench is like your system saying "I\'m holding this in, I\'m not letting this out."',
    reframe: 'This tension is your body\'s way of controlling something — often speech, anger, or emotion that feels risky.',
    exploration: 'What is your jaw protecting you from expressing? What would happen if you slowly released that grip? Let\'s try gently unclenching and noticing what comes up.',
    fullResponse: () => `
Your jaw often holds tension when you're under stress or when emotions feel unsafe to express. It's like your system is saying "I'm holding this in, I'm not letting this out."

This is your body\'s way of controlling something — often speech, anger, or feeling that feels risky. What is your jaw protecting you from expressing? Try gently unclenching and noticing what comes up when you release that grip.
    `.trim()
  }
};

/**
 * Helper function to select template based on client description
 * PRIORITIZES body location first, then sensation type
 * This prevents issues like "my chest feels tight" matching generic tension instead of chest-specific
 */
export function selectSomaticTemplate(clientDescription: string): SomaticTemplate | null {
  const lowerDescription = clientDescription.toLowerCase();

  // STEP 1: Check for specific body locations first (highest priority)

  // Chest-related: check both anger/pressure variant AND anxiety/breathing variant
  if (lowerDescription.includes('chest')) {
    if (lowerDescription.includes('pressure') || lowerDescription.includes('punch') || lowerDescription.includes('hit') || lowerDescription.includes('anger')) {
      return SOMATIC_RESPONSE_TEMPLATES.chestPressure;
    }
    if (lowerDescription.includes('breath') || lowerDescription.includes('breathe') || lowerDescription.includes('tight')) {
      return SOMATIC_RESPONSE_TEMPLATES.breathingDifficulty;
    }
    // Default to breathing difficulty for general chest tightness
    return SOMATIC_RESPONSE_TEMPLATES.breathingDifficulty;
  }

  // Throat-related
  if (lowerDescription.includes('throat') || lowerDescription.includes('neck')) {
    return SOMATIC_RESPONSE_TEMPLATES.throatTightness;
  }

  // Stomach/Gut-related
  if (lowerDescription.includes('stomach') || lowerDescription.includes('gut') || lowerDescription.includes('belly')) {
    return SOMATIC_RESPONSE_TEMPLATES.gutTension;
  }

  // Jaw-related
  if (lowerDescription.includes('jaw') || lowerDescription.includes('teeth') || lowerDescription.includes('grind') || lowerDescription.includes('clench')) {
    return SOMATIC_RESPONSE_TEMPLATES.jawClenching;
  }

  // Heart-related
  if (lowerDescription.includes('heart') || lowerDescription.includes('palpitation') || lowerDescription.includes('racing') || lowerDescription.includes('pound')) {
    return SOMATIC_RESPONSE_TEMPLATES.racingHeart;
  }

  // Breathing-related (general, not chest-specific)
  if (lowerDescription.includes('breath') && !lowerDescription.includes('chest')) {
    return SOMATIC_RESPONSE_TEMPLATES.breathingDifficulty;
  }

  // STEP 2: Check for general sensation types (lower priority)

  // Muscle/tension (generic body areas without specific location)
  if (lowerDescription.includes('muscle') || lowerDescription.includes('shoulder') || lowerDescription.includes('back')) {
    return SOMATIC_RESPONSE_TEMPLATES.muscleTension;
  }

  // General tension/tightness (catch-all, lowest priority)
  if (lowerDescription.includes('tension') || (lowerDescription.includes('tight') && !lowerDescription.includes('chest'))) {
    return SOMATIC_RESPONSE_TEMPLATES.muscleTension;
  }

  // Heaviness/fatigue
  if (lowerDescription.includes('heavy') || lowerDescription.includes('fatigue') || lowerDescription.includes('tired') || lowerDescription.includes('weigh')) {
    return SOMATIC_RESPONSE_TEMPLATES.heaviness;
  }

  // Tremor/shakiness
  if (lowerDescription.includes('tremble') || lowerDescription.includes('shake') || lowerDescription.includes('shaking') || lowerDescription.includes('quiver')) {
    return SOMATIC_RESPONSE_TEMPLATES.tremor;
  }

  // Numbness/disconnection/dissociation
  if (lowerDescription.includes('numb') || lowerDescription.includes('disconnected') || lowerDescription.includes('empty') || lowerDescription.includes('dissociat')) {
    return SOMATIC_RESPONSE_TEMPLATES.numbness;
  }

  return null;
}

/**
 * Build a personalized somatic response for a given sensation
 * Optionally incorporate client name or therapeutic theme
 */
export function buildSomaticResponse(
  sensation: string,
  options?: {
    clientName?: string;
    theme?: string;
    addPostResponse?: string;
  }
): string {
  const template = selectSomaticTemplate(sensation);
  if (!template) {
    return ''; // No matching template
  }

  let response = template.fullResponse(options);

  if (options?.addPostResponse) {
    response += '\n\n' + options.addPostResponse;
  }

  return response;
}
