// /assets/scoring.js
// OSCI Pro scoring. Pure function. No dependencies. Runs in browser and Node.

// Takes:
//   answers: object keyed by question number, value 1-5 raw Likert response
//   questionnaire: the questionnaire.json object
// Returns a scoring payload with subscale scores, dimension scores, quadrant,
// Charismatic Consistency Index and the two priority subscales.

function scoreOSCIPro(answers, questionnaire) {
  const { items, subscales, reverseItems, shadowItems, cutPoints, consistencyBands,
          personalImpact, personalImpactBands } = questionnaire;

  // 1. Invert reverse-scored items. Formula: 6 - raw.
  //    Q1-50 (the ten subscales) are mandatory and still throw if missing.
  //    Q51-60 (Personal Impact) are optional: if a respondent's payload
  //    predates the Personal Impact stream, those items are simply skipped
  //    and the Personal Impact reading is omitted downstream. This keeps the
  //    function backward-compatible with any 50-answer payloads in flight.
  const personalImpactItemSet = (questionnaire.personalImpact &&
    Array.isArray(questionnaire.personalImpact.items))
    ? new Set(questionnaire.personalImpact.items)
    : new Set();

  const inverted = {};
  for (const item of items) {
    const raw = answers[item.n];
    if (typeof raw !== "number" || raw < 1 || raw > 5) {
      if (personalImpactItemSet.has(item.n)) {
        continue; // optional Personal Impact item, not yet answered
      }
      throw new Error("Missing or invalid answer for Q" + item.n);
    }
    inverted[item.n] = reverseItems.includes(item.n) ? (6 - raw) : raw;
  }

  // 2. Subscale scores. Sum of 5 items × 4 = 20-100 range.
  const subscaleScores = {};
  for (const code in subscales) {
    const itemNumbers = subscales[code].items;
    const sum = itemNumbers.reduce((acc, n) => acc + inverted[n], 0);
    subscaleScores[code] = sum * 4; // 5 items × 5 max = 25; × 4 = 100
  }

  // 3. Dimension scores. Mean of the five subscales in the dimension.
  const confidenceCodes   = ["A1", "A2", "A3", "A4", "A5"];
  const socialSkillsCodes = ["B1", "B2", "B3", "B4", "B5"];

  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

  const confidence   = Math.round(mean(confidenceCodes.map(c => subscaleScores[c])));
  const socialSkills = Math.round(mean(socialSkillsCodes.map(c => subscaleScores[c])));

  // 4. Quadrant. Uses Lower/Developing/Higher cut-points; quadrant uses the
  //    Developing/Higher threshold as the "higher" boundary (i.e. anyone in
  //    Developing or Higher on an axis counts as "higher" for quadrant placement).
  //    Free tool used a 60-point midpoint; we move to 65 to match the Lower/Developing
  //    boundary so quadrant placement remains consistent with the report bands.
  const cCut = cutPoints.confidence.lowerToDeveloping;   // 65
  const sCut = cutPoints.socialSkills.lowerToDeveloping; // 65
  const cHigher = confidence   >= cCut;
  const sHigher = socialSkills >= sCut;

  let quadrant;
  if (cHigher && sHigher)        quadrant = "courteously_charismatic";
  else if (!cHigher && sHigher)  quadrant = "unknowingly_influential";
  else if (cHigher && !sHigher)  quadrant = "occasionally_overconfident";
  else                            quadrant = "incidentally_invisible";

  // 5. Bands on each axis.
  function bandFor(score, cuts) {
    if (score < cuts.lowerToDeveloping) return "lower";
    if (score < cuts.developingToHigher) return "developing";
    return "higher";
  }
  const confidenceBand   = bandFor(confidence,   cutPoints.confidence);
  const socialSkillsBand = bandFor(socialSkills, cutPoints.socialSkills);

  // 6. Subscale bands (use the Confidence cut-points for A-subscales,
  //    Social Skills cut-points for B-subscales).
  const subscaleBands = {};
  for (const code in subscaleScores) {
    const cuts = code.startsWith("A") ? cutPoints.confidence : cutPoints.socialSkills;
    subscaleBands[code] = bandFor(subscaleScores[code], cuts);
  }

  // 7. Charismatic Consistency Index. Mean of the eight shadow items
  //    (post-reverse), scaled to 0-100. Each item is 1-5 after reversal, so
  //    mean is 1-5; scale: ((mean - 1) / 4) * 100. The Index reads how
  //    consistently the respondent's warmth and attention are available
  //    across audiences and across the respondent's own states. Renamed
  //    from Authenticity Index at v3.8; the construct is unchanged.
  const shadowSum = shadowItems.reduce((acc, n) => acc + inverted[n], 0);
  const shadowMean = shadowSum / shadowItems.length;
  const consistencyIndex = Math.round(((shadowMean - 1) / 4) * 100);

  const consistencyBand = consistencyBands.find(
    b => consistencyIndex >= b.min && consistencyIndex <= b.max
  );

  // 7b. Personal Impact. Mean of its ten items (Q51-60, post-reverse), scaled
  //     to 0-100, with two component readings: Message Craft (Q51-55) and
  //     Voice and Presence (Q56-60). Reported as a band.
  //
  //     The multiplier rule (framework section 7): a high Personal Impact
  //     score is only good news when the social skills underneath it are
  //     strong. High impact over Social Skills below the Higher threshold is
  //     "polish the room will eventually see through". We compute a flag the
  //     report uses to choose which framing to print. The score is the same;
  //     the meaning depends on the substance beneath it.
  //
  //     Guarded so that an older 50-answer payload (no Q51-60) still scores
  //     cleanly: if the PI items are absent, personalImpact is returned null
  //     and the report simply omits the Personal Impact reading.
  let personalImpactResult = null;
  if (personalImpact && Array.isArray(personalImpact.items)) {
    const piItems = personalImpact.items;
    const havePI = piItems.every(n => typeof inverted[n] === "number");
    if (havePI) {
      const scale = arr => {
        const m = arr.reduce((a, n) => a + inverted[n], 0) / arr.length; // 1-5
        return Math.round(((m - 1) / 4) * 100); // 0-100
      };
      const piScore = scale(piItems);
      const components = {};
      for (const key in personalImpact.components) {
        const comp = personalImpact.components[key];
        components[key] = {
          name: comp.name,
          score: scale(comp.items)
        };
      }
      const piBand = (personalImpactBands || []).find(
        b => piScore >= b.min && piScore <= b.max
      );

      // Multiplier flag: is the Social Skills foundation strong enough to
      // support the impact score? "Thin" = Social Skills below the Higher
      // threshold (the developingToHigher cut point).
      const socialSkillsIsHigher = socialSkills >= cutPoints.socialSkills.developingToHigher;
      const impactIsHigh = piScore >= 70; // "Lands in most rooms" or better
      const impactOutrunsSubstance = impactIsHigh && !socialSkillsIsHigher;

      personalImpactResult = {
        score: piScore,
        band: piBand ? piBand.label : null,
        description: piBand ? piBand.description : null,
        components,
        impactOutrunsSubstance
      };
    }
  }

  // 8. Two priority subscales: the two lowest scores. Tie-break by
  //    subscale order (A1 < A2 < ... < B5) so the result is deterministic.
  const ordered = Object.entries(subscaleScores)
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const priority = [ordered[0][0], ordered[1][0]];

  // 9. Item-level detail for the personalisation layer (added v-item1).
  //    The report generator uses the post-reverse per-item scores to resolve
  //    which named sub-pattern within a subscale is the respondent's, rather
  //    than asking the reader to "decide which is you". Without this, the
  //    generator only sees rolled-up subscale scores and every reader with the
  //    same priority subscale receives the identical development page.
  //
  //    Two views are returned, both keyed on question number:
  //      itemScores           flat map, post-reverse 1-5 (higher = stronger on
  //                           the item's subscale construct). Directly usable:
  //                           a low value always means "less of this behaviour",
  //                           whether or not the item was reverse-scored.
  //      subscaleItemScores   the same values grouped by subscale, each entry
  //                           carrying { n, raw, score, reverse } so the
  //                           generator can name the specific low item and,
  //                           where useful, quote it. `raw` is the answer as
  //                           given (1-5); `score` is post-reverse.
  //
  //    Personal Impact items (Q51-60) are included when present. Any item not
  //    answered (older payloads) is simply absent from both views.
  const reverseSet = new Set(reverseItems);
  const itemScores = {};
  for (const n in inverted) {
    itemScores[n] = inverted[n];
  }
  const subscaleItemScores = {};
  for (const code in subscales) {
    subscaleItemScores[code] = subscales[code].items
      .filter(n => typeof inverted[n] === "number")
      .map(n => ({
        n,
        raw: answers[n],
        score: inverted[n],
        reverse: reverseSet.has(n)
      }));
  }

  return {
    confidence,
    socialSkills,
    confidenceBand,
    socialSkillsBand,
    quadrant,
    subscaleScores,
    subscaleBands,
    consistencyIndex,
    consistencyBand: consistencyBand ? consistencyBand.label : null,
    consistencyDescription: consistencyBand ? consistencyBand.description : null,
    personalImpact: personalImpactResult,
    priorityAreas: priority,
    // Item-level detail for the personalisation layer.
    itemScores,
    subscaleItemScores,
    version: questionnaire.version
  };
}

// Export for Node, attach to window for browser
if (typeof module !== "undefined" && module.exports) {
  module.exports = { scoreOSCIPro };
}
if (typeof window !== "undefined") {
  window.scoreOSCIPro = scoreOSCIPro;
}
