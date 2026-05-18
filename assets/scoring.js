// /assets/scoring.js
// OSCI Pro scoring. Pure function. No dependencies. Runs in browser and Node.

// Takes:
//   answers: object keyed by question number, value 1-5 raw Likert response
//   questionnaire: the questionnaire.json object
// Returns a scoring payload with subscale scores, dimension scores, quadrant,
// Authenticity Index and the two priority subscales.

function scoreOSCIPro(answers, questionnaire) {
  const { items, subscales, reverseItems, shadowItems, cutPoints, authenticityBands } = questionnaire;

  // 1. Invert reverse-scored items. Formula: 6 - raw.
  const inverted = {};
  for (const item of items) {
    const raw = answers[item.n];
    if (typeof raw !== "number" || raw < 1 || raw > 5) {
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

  // 7. Authenticity Index. Mean of the eight shadow items (post-reverse),
  //    scaled to 0-100. Each item is 1-5 after reversal, so mean is 1-5;
  //    scale: ((mean - 1) / 4) * 100.
  const shadowSum = shadowItems.reduce((acc, n) => acc + inverted[n], 0);
  const shadowMean = shadowSum / shadowItems.length;
  const authenticityIndex = Math.round(((shadowMean - 1) / 4) * 100);

  const authBand = authenticityBands.find(
    b => authenticityIndex >= b.min && authenticityIndex <= b.max
  );

  // 8. Two priority subscales: the two lowest scores. Tie-break by
  //    subscale order (A1 < A2 < ... < B5) so the result is deterministic.
  const ordered = Object.entries(subscaleScores)
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const priority = [ordered[0][0], ordered[1][0]];

  return {
    confidence,
    socialSkills,
    confidenceBand,
    socialSkillsBand,
    quadrant,
    subscaleScores,
    subscaleBands,
    authenticityIndex,
    authenticityBand: authBand ? authBand.label : null,
    authenticityDescription: authBand ? authBand.description : null,
    priorityAreas: priority,
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
