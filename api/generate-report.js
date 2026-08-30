// /api/generate-report.js
//
// The real OSCI Pro PDF report generator.
//
// v4.6 (13 June) changes:
//   A.  Opening summary handoff line updated for the v4.5 page order
//       (content-v3.9): the page after the tiles is now the one-page
//       summary, and the line says so.
//   B.  Narrative prompt final-check: capitalise Confidence and Social
//       Skills as dimension names; UK spelling list (judgement first).
//       'judgment' also added to the mechanical validator banned list
//       (word-boundary match cannot touch 'judgement').
//   C.  Week 3 plan title gains a conditional 'method' suffix, so
//       "use the Asking for feedback worth getting method" reads whole
//       while "use the five-minutes practice" stays untouched.
//
// v4.5 (13 June) changes:
//   A.  One-page summary, "Your profile on one page", rendered directly
//       after the opening summary: two strengths and two development areas,
//       each with a locked situational line from content.json
//       (where_it_helps / where_gain_shows, twenty lines, content-v3.8).
//       No AI text on the page; header uses the static quadrant tagline.
//   B.  The two dimensions pages (Confidence, Social Skills, Sistine
//       Chapel) moved from after the plain-words profile to before the
//       four positions. The reader now meets the axes before the map, the
//       quadrant, and the subscale bars, and the page's "introduced later
//       in the report" line is true again.
//   C.  Header smoothing: five eyebrow/title repeats resolved (What we
//       mean by charisma, two dimensions, four positions, Consistency
//       Index, four-week plan). Eyebrows now locate; titles now state.
//
// v4.4 (13 June) changes:
//   A.  High-band variant for development frames. A subscale selected as a
//       priority while sitting in the higher band (a relative gap) was
//       being served the locked low-band opening ("A lower score on this
//       subscale...") against a visible score of 80+. content.json can now
//       carry development.high_band_variant { replace, with } per subscale;
//       the renderer swaps the anchored sentences when the respondent's
//       band qualifies (subscaleBands, score >= 79 fallback). Populated for
//       A4 in content-v3.7; remaining nine subscales are a content pass.
//   B.  content-v3.7 also carries four voice fixes: A4 costs paragraph to
//       tendency voice (removes "You get left behind, and everyone knows
//       it"), "can get hard-wired", B3 strokes-and-clicks repointed to the
//       companion book (the methods section never carried it), and the
//       Unknowingly Influential portrait "not yet caught up" -> "has
//       further to come".
//
// v4.3 (12 June) changes:
//   A.  "Final check before you answer" block appended to the end of both AI
//       prompts (headline in content.json, narrative here): names the
//       mechanically checked rules at the position the model attends to most,
//       gives the substitute for each ban (dash -> comma/full stop/colon,
//       contraction -> words in full, antithesis -> state what it is), and
//       tells the model the draft is rejected and regenerated on violation.
//       Goal: cut how often the v4.2 validator retry has to fire. No further
//       prompt surgery until the validator logs show the live failure rate.
//
// v4.2 (12 June) changes:
//   A.  Voice enforcement layer: voiceViolations() checks every AI output
//       for em/en dashes, the banned phrase list, contractions, exclamation
//       marks, and questions. One corrective retry naming the violations,
//       then mechanical dash repair. Unresolved violations log as errors and
//       never block generation. (Leo's live report leaked two em dashes and
//       one "show up" past the prompt rules; prompts request, this enforces.)
//   B.  Anthropic fetch factored into anthropicText() shared by both calls
//       and their retries.
//   C.  Courteously Charismatic opening paragraph stops claiming "higher on
//       both" bands; Developing-band respondents land in the quadrant too
//       and the old line contradicted the tiles beneath it.
//   D.  One contraction fixed on the A1 page (can't -> cannot).
//
// v4.1 (12 June) changes:
//   A.  Headline and narrative prompts: hard constraint that praise must never
//       describe a skill measured by a development priority (the live test
//       praised the respondent's lowest subscale on the cover). The live
//       failure is now a labelled bad example in the headline prompt, and a
//       guard line stops the good examples being borrowed as content.
//   B.  "method (page 16)" stale cross-reference replaced with "method from
//       the companion book" across all seven subscale pages that carried it.
//   C.  One contraction in the Sistine passage corrected for the report rule
//       (aren't -> are not).
//
// v4 (newspaper reorder, 12 June) changes:
//   A.  Page sequence reordered: the reader meets the dashboard on page 3.
//       New order: cover → what we mean by charisma → opening summary with
//       score tiles → the four positions → your map → your quadrant → ten
//       bars → plain words → the two dimensions (background) → Index → rest.
//   B.  Preface page 3 (the four readings) dissolved: it duplicated the
//       Consistency Index and Personal Impact pages. Its "four lenses"
//       paragraph now renders beneath the score tiles on the opening summary.
//   C.  renderPreface split into renderPrefaceCharisma / renderPrefaceDimensions
//       / renderPrefacePositions so each page renders where it earns its place.
//   D.  Three success-log lines downgraded from console.error to console.log
//       so genuine errors stand out in the Vercel logs.
//   E.  Fallback narrative: "deployed deliberately" → "used deliberately",
//       matching the deploy sweep applied across content.json.
//
// v3 (sub-pass C) changes:
//   A.  Subscale development pages now render the locked four-header
//       structure: What this score tells you / What it costs to leave this
//       alone / How to close the gap / Where you might start. Multi-paragraph
//       fields are split via splitParas(); the final field renders as bullets.
//   B.  Weekly plan now sources its activities from development.where_you_might_start
//       (was development.what_to_try_next).
//   C.  varyOpener no longer applied to development frames (locked pages carry
//       their own openers); still applied to strength frames.
//   D.  Fixed pre-existing crash on the Charismatic Consistency Index page:
//       removed three dead branches referencing the undefined `authBand`
//       (leftover from the Authenticity Index rename). Index page now renders.
//
// v6 changes (from v5 to v6):
//   1.  Fixed the "Week 3: use the The five-minutes practice" duplication bug.
//   2.  Removed redundant repeat paragraph at the end of the four-week plan.
//   3.  Renamed Authenticity Index to Charismatic Consistency Index (v3.8). Field references throughout the file follow the new naming. The construct is unchanged. Updated the band content to the new opportunity-framed copy.
//       page so it lands whether or not B5 is a priority.
//   4.  Renamed the development-areas header to "Where to focus next" and
//       the four-week plan header to "Your four weeks" so the two pages no
//       longer share register.
//   5.  Score-tile sub-labels: roman not italic, slightly smaller.
//   6.  All body prose: left-aligned ragged-right (was justified). Friendlier
//       to read, no more wide word-spacing on narrow lines.
//   7.  Strength and development openers vary by subscale instead of every
//       page starting with "Your X score sits in a strong/lower range."
//   8.  Cover page: added a second gold rule above the name/date block so
//       the eye has somewhere to land in the lower third.
//
// New pages (v6):
//   - Quadrant grid (page 4): 2x2 grid with axis labels, four labels, YOU
//     marker in the respondent's quadrant.
//   - Subscale profile (page 6): horizontal bars for all ten subscales, two
//     priority bars in amber/gold.
//   - Where you are right now (page 7): four-paragraph personalised narrative,
//     generated via an Anthropic API call with a deterministic fallback.
//
// Input: a scoring payload (from assets/scoring.js) plus the respondent's
// email and optional name. Output: a personalised PDF assembled from the
// content library, with AI-generated headline and personal-profile narrative.
//
// In production this is gated by Stripe Checkout session verification.
// For the 30-person test we are calling it directly from the assessment
// page (no payment in test mode).

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ── Anthropic API calls ────────────────────────────────────────────────────

// ── Voice enforcement (v4.2) ────────────────────────────────────────────
// The prompts request the voice rules; this enforces the mechanically
// checkable ones on every AI output. Each call gets one corrective retry
// that names the violations. After the retry, em and en dashes are
// repaired mechanically and anything still unresolved is logged as an
// error. Violations never block report generation: a paying customer
// always gets their PDF.

const VOICE_BANNED_PHRASES = [
  // From voice rule 4 in both prompts (clichés and pop-business idioms)
  'unlock', 'land', 'lands', 'show up', 'shows up', 'showing up',
  'earned the right to be in the room', 'where your real charisma lives',
  'the next chapter', 'growth journey', 'moving the needle',
  'the platform from which', 'orchestrate', 'leverage',
  // From voice rule 3 (the two lexical antithesis markers)
  'not just', 'not only',
  // From voice rules 5 and 9
  'version of you', 'the real you', 'your journey',
  // v4.6: US spelling caught live (judgement is the UK form and safe:
  // word-boundary matching means 'judgment' cannot match inside it)
  'judgment'
];

const VOICE_CONTRACTIONS = /\b(you're|you've|you'll|you'd|it's|that's|there's|here's|what's|who's|they're|we're|i'm|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|won't|can't|couldn't|wouldn't|shouldn't|hasn't|haven't|hadn't|let's)\b/i;

function voiceViolations(text) {
  const violations = [];
  if (/[\u2014\u2013]/.test(text)) violations.push({ rule: 'no em or en dashes', match: 'dash' });
  for (const phrase of VOICE_BANNED_PHRASES) {
    const re = new RegExp('\\b' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (re.test(text)) violations.push({ rule: 'banned phrase', match: phrase });
  }
  const contraction = text.match(VOICE_CONTRACTIONS);
  if (contraction) violations.push({ rule: 'no contractions', match: contraction[0] });
  if (text.includes('!')) violations.push({ rule: 'no exclamation marks', match: '!' });
  if (text.includes('?')) violations.push({ rule: 'no questions to the reader', match: '?' });
  return violations;
}

function describeViolations(violations) {
  return violations.map(v => `${v.rule} ("${v.match}")`).join('; ');
}

// Mechanical last resort for dashes only. Digit ranges become "X to Y";
// every other em or en dash becomes a comma.
function repairDashes(text) {
  return text
    .replace(/(\d)\s*[\u2014\u2013]\s*(\d)/g, '$1 to $2')
    .replace(/\s*[\u2014\u2013]\s*/g, ', ');
}

async function anthropicText(apiKey, prompt, maxTokens, tag) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`[${tag}] Anthropic API non-OK`, res.status, errText.slice(0, 500));
    return null;
  }
  const data = await res.json();
  return (data.content && data.content[0] && data.content[0].text) || '';
}

async function generateHeadline(content, scoring, respondentName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[headline] ANTHROPIC_API_KEY not set in environment');
    return fallbackHeadline(content, scoring);
  }
  console.log('[headline] API key present, length:', apiKey.length);

  const quadrant = content.quadrants[scoring.quadrant];
  const priority1Code = scoring.priorityAreas[0];
  const priority2Code = scoring.priorityAreas[1];

  // Two highest subscales for the strength reference
  const sortedSubscales = Object.entries(scoring.subscaleScores)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const strength1Code = sortedSubscales[0][0];
  const strength2Code = sortedSubscales[1][0];

  const prompt = content.headline_prompt_template
    .replace(/\{quadrant_label\}/g, quadrant.label)
    .replace(/\{quadrant_tagline\}/g, quadrant.tagline)
    .replace(/\{confidence\}/g, scoring.confidence)
    .replace(/\{confidence_band\}/g, scoring.confidenceBand)
    .replace(/\{social_skills\}/g, scoring.socialSkills)
    .replace(/\{social_skills_band\}/g, scoring.socialSkillsBand)
    .replace(/\{consistency_index\}/g, scoring.consistencyIndex)
    .replace(/\{consistency_band\}/g, scoring.consistencyBand || 'unknown')
    .replace(/\{priority_1_code\}/g, priority1Code)
    .replace(/\{priority_1_name\}/g, content.subscales[priority1Code].name)
    .replace(/\{priority_1_score\}/g, scoring.subscaleScores[priority1Code])
    .replace(/\{priority_1_band\}/g, scoring.subscaleBands[priority1Code])
    .replace(/\{priority_2_code\}/g, priority2Code)
    .replace(/\{priority_2_name\}/g, content.subscales[priority2Code].name)
    .replace(/\{priority_2_score\}/g, scoring.subscaleScores[priority2Code])
    .replace(/\{priority_2_band\}/g, scoring.subscaleBands[priority2Code])
    .replace(/\{strength_1_code\}/g, strength1Code)
    .replace(/\{strength_1_name\}/g, content.subscales[strength1Code].name)
    .replace(/\{strength_1_score\}/g, scoring.subscaleScores[strength1Code])
    .replace(/\{strength_2_code\}/g, strength2Code)
    .replace(/\{strength_2_name\}/g, content.subscales[strength2Code].name)
    .replace(/\{strength_2_score\}/g, scoring.subscaleScores[strength2Code]);

  try {
    const raw = await anthropicText(apiKey, prompt, 200, 'headline');
    if (raw === null) return fallbackHeadline(content, scoring);
    let cleaned = raw.trim().replace(/^["']|["']$/g, '');
    if (!cleaned) {
      console.error('[headline] Empty response from API');
      return fallbackHeadline(content, scoring);
    }

    let violations = voiceViolations(cleaned);
    if (violations.length) {
      console.log('[headline] Voice violations, retrying once:', describeViolations(violations));
      const retryPrompt = `${prompt}\n\nYour previous attempt was:\n"${cleaned}"\n\nIt broke these voice rules: ${describeViolations(violations)}.\n\nWrite a new headline that keeps the same substance and removes every violation. Return only the headline.`;
      const retryRaw = await anthropicText(apiKey, retryPrompt, 200, 'headline-retry');
      if (retryRaw) {
        const retryCleaned = retryRaw.trim().replace(/^["']|["']$/g, '');
        if (retryCleaned && voiceViolations(retryCleaned).length < violations.length) {
          cleaned = retryCleaned;
        }
      }
    }

    cleaned = repairDashes(cleaned);
    const remaining = voiceViolations(cleaned);
    if (remaining.length) {
      console.error('[headline] Unresolved voice violations:', describeViolations(remaining));
    }
    console.log('[headline] Got headline:', cleaned.slice(0, 120));
    return cleaned;
  } catch (e) {
    console.error('[headline] Network/parse error:', e.message);
    return fallbackHeadline(content, scoring);
  }
}

function fallbackHeadline(content, scoring) {
  const quadrant = content.quadrants[scoring.quadrant];
  return quadrant.tagline;
}

// Personalised four-paragraph narrative for the "Where you are right now" page.
// Same pattern as the headline call: try the API, fall back to a deterministic
// build if the call fails or the key is missing.
async function generateProfileNarrative(content, scoring, respondentName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[profile] ANTHROPIC_API_KEY not set, using fallback');
    return fallbackProfileNarrative(content, scoring, respondentName);
  }

  const quadrant = content.quadrants[scoring.quadrant];
  const dev1 = scoring.priorityAreas[0];
  const dev2 = scoring.priorityAreas[1];

  // Two highest subscales after excluding the priority areas
  const sortedSubscales = Object.entries(scoring.subscaleScores)
    .filter(([code]) => !scoring.priorityAreas.includes(code))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const strength1 = sortedSubscales[0] ? sortedSubscales[0][0] : null;
  const strength2 = sortedSubscales[1] ? sortedSubscales[1][0] : null;

  const name = respondentName || 'You';
  const subName = c => (content.subscales[c] ? content.subscales[c].name : c);
  const subScore = c => scoring.subscaleScores[c];

  const prompt = `You are writing one section of an OSCI Pro charisma development report for ${name}.

# Their profile

- Quadrant: ${quadrant.label}
- Confidence: ${scoring.confidence} (${scoring.confidenceBand} band)
- Social Skills: ${scoring.socialSkills} (${scoring.socialSkillsBand} band)
- Charismatic Consistency Index: ${(typeof scoring.consistencyIndex === 'number' && Number.isFinite(scoring.consistencyIndex)) ? scoring.consistencyIndex + ' (' + (scoring.consistencyBand || 'unknown') + ')' : 'not available for this profile'}
- Two highest subscales: ${strength1 ? subName(strength1) + ' (' + subScore(strength1) + ')' : '—'}, ${strength2 ? subName(strength2) + ' (' + subScore(strength2) + ')' : '—'}
- Two priority subscales: ${subName(dev1)} (${subScore(dev1)}), ${subName(dev2)} (${subScore(dev2)})

# The task

Write four short paragraphs titled "Where you are right now". 60-80 words each. Address ${name} in the second person.

Paragraph 1: Which dimension is the stronger one. What that looks like from the outside (the experience the people around them have).
Paragraph 2: What the other dimension is doing. What its score means in practice, in plain terms.
Paragraph 3: The two priority subscales, named explicitly. The cost of leaving them unattended, in plain terms. Frame these as opportunities, not deficits.
Paragraph 4: The Charismatic Consistency Index reading. What it points at. The through-line to the work the rest of the report sets out. If the Index is "not available for this profile", omit this paragraph entirely and write only three paragraphs; do not mention that it is unavailable.

One hard constraint above every voice rule: never attribute to ${name} a strength that either priority subscale measures. Their priorities are ${subName(dev1)} and ${subName(dev2)}. Before writing any complimentary sentence, check it against those two names: if the compliment describes the skill one of them measures (for example reading the room, reading cues, or reading the moment when Situational Self-Awareness is a priority; or consistent warmth across audiences when Authentic vs Performed Social Behaviour is a priority), cut it and draw the praise from the two highest subscales instead. This page must not contradict the development pages that follow it.

# The voice

The OSCI Pro report follows a strict voice. The principles below catch the most common failure modes. Follow all of them.

1. Opportunity framing, not deficit framing. Name what the reader has and where the next move is, not what they lack. "The work is widening the reach" not "the gap is reach". Never name a band, score, or pattern as a weakness, deficit, problem, or shortfall.

2. Plain register. UK English ("behaviour", "organisation", "recognise"). Short words. Cut every word that does not earn its place. "Use" not "leverage". "Read" not "discern". "Now" not "at this juncture".

3. No antithesis. This is the most common failure, so read it carefully. Antithesis is defining something by first stating what it is NOT. ALL of these forms are banned, not only the first one: "not just X but Y"; "not X, but Y"; "X rather than Y" used to define (e.g. "steady rather than effusive"); "less about X than about Y"; "not only X but also Y"; and the split form "It is not about X. It is about Y." or "This is not X. Y." THE TEST: if a sentence reaches its point by first telling the reader what the thing is not, delete the negative half and state what the thing IS, directly. "steady rather than effusive" becomes "a steady, reliable presence". "not about competence, it is about belonging" becomes "you are competent; the work is the internal sense of belonging". The only permitted contrast is a genuine either/or the reader must choose between (enumerating two distinct patterns they might recognise), which carries real information and is not definition-by-negation.

4. No clichés or pop-business idioms. No "unlock", "land", "show up", "shows up", "earned the right to be in the room", "where your real charisma lives", "the next chapter", "growth journey", "moving the needle", "the platform from which", "orchestrate".

5. No "version of you" or "the real you" language. The construct is consistency of warmth and attention across audiences, not authenticity. The reader is one person whose warmth and attention may reach further or less far.

6. Describe by effect on others where possible, not internal state of the reader. "People hear what you mean" rather than "you communicate clearly". The instrument measures patterns visible from outside.

7. No em dashes anywhere. No contractions ("you are" not "you're", "it is" not "it's", "does not" not "doesn't"). No exclamation marks. No questions to the reader.

8. Specific over elegant. "Read the room well" not "have strong situational intelligence". Use a concrete word over a generalising one wherever possible.

9. The reader is a senior professional. Write at the level of a thoughtful friend, not a coach or consultant. No therapy language. No coaching language. No "your journey".

10. Score numbers used at most twice across the four paragraphs. The numbers are not the point. The pattern they describe is the point.

11. No headings, no bullets, no bold. Four plain paragraphs separated by blank lines.

12. Vary openers. Do not start any paragraph with "Your [thing] score sits in..."

13. Tendency voice for patterns. "Higher" not "high". "Tends to" not "always". "Can" not "will". The instrument reads tendencies, not certainties.

14. When the report makes a claim about itself, frame from the reader's perspective. "The work this report sets out" not "the framework this report provides".

# Voice examples — write at this level

Example paragraph 1 (higher social skills, developing confidence):
"Your Social Skills at 78 mean people experience you as a steady, reliable presence. You connect naturally, read emotional registers well, and most people feel genuinely comfortable around you. Your warmth and empathy subscales are among your highest. The quality of your one-to-one interactions is strong. People trust you. They open up."

Example paragraph 2 (developing confidence — note: states what IS, no "the question is not... it is"):
"Your Confidence score at 74 shows you are prepared and you follow through. The challenge appears in moments of exposure, in front of a larger group or dealing with uncertainty you cannot fully control. You are competent. The work is building the internal sense of belonging in those high-stakes moments. That gap between internal and external is where your energy, and sometimes your impact, falls."

Example paragraph 3 (a priority subscale — states the opportunity directly):
"Your Assertiveness and Accountability subscale at 64 is your clearest confidence opportunity. You can assert yourself. The work is doing it consistently in the moments that require it most: naming a problem when it creates friction, disagreeing with someone whose opinion you value, holding accountability without softening. The cost of leaving this is the contribution that does not get heard, which over time becomes the contribution that does not get made."

Example paragraph 4 (the Charismatic Consistency Index):
"Your Charismatic Consistency Index at 68 tells you something direct. Your social skills are real, and they reach some audiences more fully than others. People you know well get something valuable. People at the fringes get less of it. That unevenness is what the 68 is measuring. Widening the reach of what you already have is the work the rest of this report sets out."

Note the rhythm. Short sentences. Plain words. Specific. Concrete. Speaking to the reader, not about them. Naming the experience the people around the reader have, not the reader's internal state. End paragraphs on the lived consequence ("where your impact falls"), not an abstract formulation ("where your energy goes"). Describe what the reader IS, positively; never reach the point by first saying what they are not, and never name the band inside the prose.

# Final check before you answer

Your output is checked mechanically. Any em dash, en dash, contraction, banned phrase, exclamation mark, or question mark causes the draft to be rejected and regenerated. Before returning, reread each paragraph line by line:

Where you reached for an em dash, use a comma, a full stop, or a colon instead. Where you wrote a contraction, write the words in full. Where a sentence makes its point by saying what something is not, delete the negative half and state what it is.

Capitalise Confidence and Social Skills wherever they name the two dimensions, including mid-sentence. Use UK English spelling throughout: judgement, recognise, organise, behaviour, colour, centre.

Return only the four paragraphs, separated by blank lines. No preamble. No headings.`;

  try {
    const raw = await anthropicText(apiKey, prompt, 800, 'profile');
    if (raw === null) return fallbackProfileNarrative(content, scoring, respondentName);
    let cleaned = raw.trim();
    if (!cleaned) {
      console.error('[profile] Empty response, using fallback');
      return fallbackProfileNarrative(content, scoring, respondentName);
    }

    let violations = voiceViolations(cleaned);
    if (violations.length) {
      console.log('[profile] Voice violations, retrying once:', describeViolations(violations));
      const retryPrompt = `${prompt}\n\nYour previous attempt was:\n\n${cleaned}\n\nIt broke these voice rules: ${describeViolations(violations)}.\n\nWrite the paragraphs again, keeping the same substance and removing every violation. Return only the paragraphs, separated by blank lines.`;
      const retryRaw = await anthropicText(apiKey, retryPrompt, 800, 'profile-retry');
      if (retryRaw) {
        const retryCleaned = retryRaw.trim();
        const retryParas = retryCleaned.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        if (retryCleaned && retryParas.length >= 3 && voiceViolations(retryCleaned).length < violations.length) {
          cleaned = retryCleaned;
        }
      }
    }

    cleaned = repairDashes(cleaned);
    const remaining = voiceViolations(cleaned);
    if (remaining.length) {
      console.error('[profile] Unresolved voice violations:', describeViolations(remaining));
    }

    // Split into paragraphs on blank lines
    const paragraphs = cleaned.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    if (paragraphs.length < 3) {
      console.error('[profile] Too few paragraphs returned, using fallback');
      return fallbackProfileNarrative(content, scoring, respondentName);
    }
    console.log('[profile] Got', paragraphs.length, 'paragraphs');
    return paragraphs;
  } catch (e) {
    console.error('[profile] Network/parse error:', e.message);
    return fallbackProfileNarrative(content, scoring, respondentName);
  }
}

function fallbackProfileNarrative(content, scoring, respondentName) {
  const name = respondentName || 'You';
  const dev1 = scoring.priorityAreas[0];
  const dev2 = scoring.priorityAreas[1];
  const subName = c => (content.subscales[c] ? content.subscales[c].name : c);

  // Which dimension is stronger
  const cScore = scoring.confidence;
  const sScore = scoring.socialSkills;
  const cStronger = cScore >= sScore;
  const strongerLabel = cStronger ? 'Confidence' : 'Social Skills';
  const strongerScore = cStronger ? cScore : sScore;
  const otherLabel = cStronger ? 'Social Skills' : 'Confidence';
  const otherScore = cStronger ? sScore : cScore;

  const para1 = `${name}, here is what your scores are actually saying. Your ${strongerLabel} is the stronger of the two dimensions at ${strongerScore}. That is the version of you most people in the room are picking up on, and it is doing useful work. The risk at this band is taking it for granted. Strong dimensions stay strong when they are used deliberately. They quietly thin when they are not.`;

  const para2 = `Your ${otherLabel} at ${otherScore} is the other half of the picture. It is functional, and not yet doing everything it could. Bringing it up to meet your ${strongerLabel} is where the next development usually sits. The priority subscales below name the specific behaviours where attention will most repay the effort.`;

  const para3 = `The two priority subscales identified for you are ${subName(dev1)} and ${subName(dev2)}. They are skills that are not yet doing their job reliably, and each has clear room to build. The cost of leaving them unattended is small in any single moment and significant over time. The people around you notice these long before they name them.`;

  const para4 = `Your Charismatic Consistency Index sits at ${scoring.consistencyIndex}. This measures how reliably your warmth and attention are available across the audiences and situations in your life. The work the rest of this report sets out is the work of widening the reach of what you already have. Not becoming a different person. Making more of the version that already exists available to more of the people around you.`;

  return [para1, para2, para3, para4];
}

// ── PDF rendering helpers ──────────────────────────────────────────────────
const COLOURS = {
  navy:   '#1F3A5F',
  gold:   '#B08D57',
  amber:  '#C9A84C',   // for priority bars on the subscale chart
  cream:  '#F8F5EF',
  soft:   '#F2EEE8',
  ink:    '#1A1A1A',
  muted:  '#555555',
  line:   '#D9D9D9'
};

const FONT_HEAD = 'Helvetica';
const FONT_HEAD_BOLD = 'Helvetica-Bold';
const FONT_BODY = 'Times-Roman';
const FONT_BODY_ITALIC = 'Times-Italic';

// Standard body alignment for the whole report. Was 'justify' in v5, which
// produced wide word-spacing on narrow lines. Left-aligned ragged-right reads
// more naturally and feels less corporate.
const BODY_ALIGN = 'left';

function eyebrow(doc, text) {
  doc.font(FONT_HEAD_BOLD).fontSize(9).fillColor(COLOURS.gold)
     .text(text.toUpperCase(), { characterSpacing: 2 });
  doc.moveDown(0.2);
}

function h1(doc, text) {
  doc.font(FONT_HEAD_BOLD).fontSize(26).fillColor(COLOURS.navy).text(text);
  doc.moveDown(0.3);
  goldRule(doc);
  doc.moveDown(0.8);
}

function h2(doc, text) {
  doc.moveDown(0.6);
  doc.font(FONT_HEAD_BOLD).fontSize(15).fillColor(COLOURS.navy).text(text);
  doc.moveDown(0.4);
}

function h3(doc, text) {
  doc.moveDown(0.4);
  doc.font(FONT_HEAD_BOLD).fontSize(11).fillColor(COLOURS.navy).text(text);
  doc.moveDown(0.2);
}

function bodyText(doc, text) {
  doc.font(FONT_BODY).fontSize(11).fillColor(COLOURS.ink)
     .text(text, { align: BODY_ALIGN, lineGap: 3 });
  doc.moveDown(0.4);
}

// Split a field that may contain multiple paragraphs (joined by blank lines)
// into an array, so each renders with its own spacing. Single-paragraph
// fields return a one-element array.
function splitParas(text) {
  if (!text) return [];
  return String(text).split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
}

function bulletPoint(doc, text) {
  const x = doc.x;
  doc.font(FONT_BODY).fontSize(11).fillColor(COLOURS.ink);
  doc.text('•  ' + text, x + 12, doc.y, {
    align: BODY_ALIGN, lineGap: 3, indent: 0,
    width: 595 - 72 - 72 - 12
  });
  doc.x = x;
  doc.moveDown(0.3);
}

function goldRule(doc, width = 150) {
  doc.lineWidth(2).strokeColor(COLOURS.gold)
     .moveTo(doc.x, doc.y).lineTo(doc.x + width, doc.y).stroke();
}

function pageNumber(doc, n, total) {
  doc.font(FONT_HEAD).fontSize(8).fillColor(COLOURS.muted)
     .text(`Page ${n} of ${total}`, 72, 800, { align: 'center', width: 451 });
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > 760) doc.addPage();
}

// ── Score tiles ────────────────────────────────────────────────────────────
// Sub-labels now in roman (was italic), slightly smaller, in muted grey.
function drawScoreTiles(doc, scoring, x, y, width) {
  const tiles = [
    { label: 'CONFIDENCE',         value: scoring.confidence,        band: scoring.confidenceBand },
    { label: 'SOCIAL SKILLS',      value: scoring.socialSkills,      band: scoring.socialSkillsBand },
    { label: 'CHARISMATIC CONSISTENCY', value: scoring.consistencyIndex, band: scoring.consistencyBand }
  ];
  // Add the Personal Impact tile when the reading is present (60-item payloads).
  if (scoring.personalImpact && typeof scoring.personalImpact.score === 'number') {
    tiles.push({
      label: 'PERSONAL IMPACT',
      value: scoring.personalImpact.score,
      band: scoring.personalImpact.band
    });
  }

  const gap = 8;
  const n = tiles.length;
  const tileW = (width - gap * (n - 1)) / n;
  // Four tiles are narrower, so the score figure and label sizes step down a
  // little to keep everything inside the tile without crowding.
  const valueSize = n >= 4 ? 24 : 28;
  const labelSize = n >= 4 ? 7 : 8;

  tiles.forEach((t, idx) => {
    const tx = x + idx * (tileW + gap);
    doc.rect(tx, y, tileW, 80).lineWidth(0.5).strokeColor(COLOURS.line).stroke();
    doc.font(FONT_HEAD_BOLD).fontSize(labelSize).fillColor(COLOURS.muted)
       .text(t.label, tx + 2, y + 10, { width: tileW - 4, align: 'center', characterSpacing: 1.2 });
    doc.font(FONT_HEAD_BOLD).fontSize(valueSize).fillColor(COLOURS.navy)
       .text((typeof t.value === 'number' && Number.isFinite(t.value)) ? String(t.value) : '–', tx, y + 26, { width: tileW, align: 'center' });
    doc.font(FONT_HEAD).fontSize(7).fillColor(COLOURS.muted)
       .text(prettyBand(t.band) || '', tx + 2, y + 63, { width: tileW - 4, align: 'center' });
  });
}

// v4.4: is this subscale in the higher band for this respondent?
// Primary source: scoring.subscaleBands from the scoring payload. Fallback
// for older payloads without per-subscale bands: score at or above 79,
// mirroring the Developing/Higher dimension cut in the framework (above 78).
function isHighBandSubscale(scoring, code) {
  const band = scoring.subscaleBands && scoring.subscaleBands[code];
  if (typeof band === 'string') return band.toLowerCase() === 'higher';
  const score = scoring.subscaleScores && scoring.subscaleScores[code];
  return typeof score === 'number' && score >= 79;
}

function prettyBand(b) {
  if (!b) return '';
  // Band keys come in as 'higher', 'lower', 'broadly_consistent',
  // 'selectively_deployed' etc. Convert underscores to spaces and
  // uppercase only the first letter, so we get 'Broadly consistent'
  // not 'Broadly_consistent' or 'Broadly Consistent'.
  const spaced = b.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ── Quadrant grid (new in v6) ──────────────────────────────────────────────
// Draws the 2x2 charisma model with axis labels and a YOU marker in the
// active quadrant. Centred on x with given total size.
function drawQuadrantGrid(doc, scoring, centerX, topY, size) {
  const half = size / 2;
  const left = centerX - half;
  const top = topY;

  // Map quadrant key to grid position (col, row): col 0 = lower confidence, col 1 = higher
  //                                               row 0 = top (higher social), row 1 = bottom (lower social)
  const positions = {
    courteously_charismatic:    { col: 1, row: 0, label: 'The Courteously\nCharismatic' },
    unknowingly_influential:    { col: 0, row: 0, label: 'The Unknowingly\nInfluential' },
    occasionally_overconfident: { col: 1, row: 1, label: 'The Occasionally\nOverconfident' },
    incidentally_invisible:     { col: 0, row: 1, label: 'The Incidentally\nInvisible' }
  };

  const activePos = positions[scoring.quadrant] || positions.courteously_charismatic;

  // Draw the four cells
  const cellW = half;
  const cellH = half;
  Object.entries(positions).forEach(([key, pos]) => {
    const cx = left + pos.col * cellW;
    const cy = top + pos.row * cellH;
    const isActive = key === scoring.quadrant;

    // Background — active cell in soft cream, others white
    doc.rect(cx, cy, cellW, cellH);
    if (isActive) {
      doc.fillAndStroke(COLOURS.soft, COLOURS.line);
    } else {
      doc.lineWidth(0.5).strokeColor(COLOURS.line).stroke();
    }

    // Quadrant label, centred
    doc.font(isActive ? FONT_HEAD_BOLD : FONT_HEAD)
       .fontSize(10)
       .fillColor(isActive ? COLOURS.navy : COLOURS.muted)
       .text(pos.label, cx + 6, cy + cellH / 2 - 14, {
         width: cellW - 12, align: 'center', lineGap: 1
       });

    // YOU marker on the active cell — small gold pill with plain text
    // (Helvetica doesn't include the ▸ glyph, which v6.0 rendered as garbled
    // characters. Plain text in a box reads cleanly across all PDF viewers.)
    if (isActive) {
      const pillW = 44;
      const pillH = 14;
      const pillX = cx + (cellW - pillW) / 2;
      const pillY = cy + cellH - 22;
      doc.rect(pillX, pillY, pillW, pillH).lineWidth(1).strokeColor(COLOURS.gold).stroke();
      doc.font(FONT_HEAD_BOLD).fontSize(8).fillColor(COLOURS.gold)
         .text('YOU', pillX, pillY + 3, {
           width: pillW, align: 'center', characterSpacing: 1.5
         });
    }
  });

  // Axis labels — Confidence on the x-axis (under the grid)
  doc.font(FONT_HEAD_BOLD).fontSize(8).fillColor(COLOURS.muted)
     .text('LOWER CONFIDENCE', left, top + size + 8, {
       width: cellW, align: 'center', characterSpacing: 1.5
     })
     .text('HIGHER CONFIDENCE', left + cellW, top + size + 8, {
       width: cellW, align: 'center', characterSpacing: 1.5
     });

  // Social Skills on the y-axis (rotated text to the left of the grid)
  doc.save();
  doc.font(FONT_HEAD_BOLD).fontSize(8).fillColor(COLOURS.muted);
  // Higher social skills label, rotated 90 degrees, positioned left of top half
  doc.rotate(-90, { origin: [left - 12, top + cellH / 2] })
     .text('HIGHER SOCIAL SKILLS', left - 12 - 50, top + cellH / 2 - 4, {
       width: 100, align: 'center', characterSpacing: 1.5
     });
  doc.restore();
  doc.save();
  doc.font(FONT_HEAD_BOLD).fontSize(8).fillColor(COLOURS.muted);
  doc.rotate(-90, { origin: [left - 12, top + cellH + cellH / 2] })
     .text('LOWER SOCIAL SKILLS', left - 12 - 50, top + cellH + cellH / 2 - 4, {
       width: 100, align: 'center', characterSpacing: 1.5
     });
  doc.restore();

  // Restore drawing cursor below the grid
  doc.x = 72;
  doc.y = top + size + 30;
}

// ── Subscale profile (new in v6) ───────────────────────────────────────────
// Ten horizontal bars, one per subscale, grouped by dimension. Priority
// subscales rendered in amber; the rest in navy. Score and label beside each.
function drawSubscaleBars(doc, scoring, content, developmentCodes, x, y, width) {
  const codes = ['A1','A2','A3','A4','A5','B1','B2','B3','B4','B5'];
  const labelW = 200;
  const scoreW = 32;
  const gapAfterLabel = 8;
  const gapBeforeScore = 8;
  const barW = width - labelW - scoreW - gapAfterLabel - gapBeforeScore;
  const barH = 12;
  const rowH = 22;

  let cy = y;

  codes.forEach((code, idx) => {
    // Section header before the first A and first B
    if (code === 'A1') {
      doc.font(FONT_HEAD_BOLD).fontSize(9).fillColor(COLOURS.gold)
         .text('CONFIDENCE SUBSCALES', x, cy, { characterSpacing: 1.5 });
      cy += 16;
    }
    if (code === 'B1') {
      cy += 8;
      doc.font(FONT_HEAD_BOLD).fontSize(9).fillColor(COLOURS.gold)
         .text('SOCIAL SKILLS SUBSCALES', x, cy, { characterSpacing: 1.5 });
      cy += 16;
    }

    const sub = content.subscales[code];
    const score = scoring.subscaleScores[code] || 0;
    const isPriority = developmentCodes.includes(code);
    const fill = isPriority ? COLOURS.amber : COLOURS.navy;

    // Label
    doc.font(FONT_HEAD).fontSize(10).fillColor(COLOURS.ink)
       .text(`${code}  ${sub ? sub.name : code}`, x, cy + 1, {
         width: labelW, ellipsis: true
       });

    // Bar background
    const barX = x + labelW + gapAfterLabel;
    doc.rect(barX, cy, barW, barH)
       .fillAndStroke(COLOURS.soft, COLOURS.line);

    // Bar fill — proportional to score
    const fillW = Math.max(2, (score / 100) * barW);
    doc.rect(barX, cy, fillW, barH).fill(fill);

    // Score number
    doc.font(FONT_HEAD_BOLD).fontSize(10).fillColor(COLOURS.ink)
       .text(String(score), barX + barW + gapBeforeScore, cy + 1, {
         width: scoreW, align: 'right'
       });

    cy += rowH;
  });

  // Legend
  cy += 6;
  const legendY = cy;
  doc.rect(x, legendY, 10, 10).fill(COLOURS.amber);
  doc.font(FONT_HEAD).fontSize(9).fillColor(COLOURS.muted)
     .text('Your two priority subscales. Start the development work here.',
           x + 16, legendY, { width: width - 16 });

  doc.x = 72;
  doc.y = cy + 24;
}

// ── Personal Impact page (new in v9) ───────────────────────────────────────
function renderPersonalImpactPage(doc, content, scoring) {
  const pi = scoring.personalImpact;
  const copy = (content.personal_impact && content.personal_impact.bands &&
    content.personal_impact.bands[pi.band]) || null;

  doc.addPage();
  eyebrow(doc, 'How your message lands');
  h1(doc, `Your Personal Impact: ${pi.score}`);
  doc.font(FONT_BODY_ITALIC).fontSize(13).fillColor(COLOURS.muted)
     .text(pi.band || '');
  doc.moveDown(0.8);

  // What this measures (shared opener, from content.json or a sensible default)
  const intro = (content.personal_impact && content.personal_impact.intro) ||
    'Personal Impact measures whether your message lands. Not whether you are confident or warm, but whether the thing you most need a person to take away actually gets through. It runs as a separate reading because the substance and the delivery are different skills, and a person can be strong in one and not the other.';
  h2(doc, 'What this measures');
  bodyText(doc, intro);

  // The band reading
  if (copy && copy.what_this_suggests) {
    h2(doc, 'What this suggests');
    bodyText(doc, copy.what_this_suggests);
  }

  // The two component readings, with their scores
  h2(doc, 'The two parts of impact');
  const mc = pi.components.message_craft;
  const vp = pi.components.voice_presence;
  const mcCopy = (content.personal_impact && content.personal_impact.components &&
    content.personal_impact.components.message_craft) || 'how the message is built: relevant, clear, and concrete enough to survive the meeting.';
  const vpCopy = (content.personal_impact && content.personal_impact.components &&
    content.personal_impact.components.voice_presence) || 'how the message is delivered: pace, emphasis, and the willingness to leave a point room to land.';
  bodyText(doc, `Message Craft, ${mc.score} of 100. This is ${mcCopy}`);
  bodyText(doc, `Voice and Presence, ${vp.score} of 100. This is ${vpCopy}`);

  // The multiplier framing: which version prints depends on the substance beneath.
  h2(doc, 'Reading this score honestly');
  if (pi.impactOutrunsSubstance) {
    const overrun = (content.personal_impact && content.personal_impact.multiplier_overrun) ||
      'Your Personal Impact score is high, but your Social Skills sit below the higher band. That combination is worth naming plainly. Impact built on delivery rather than on genuine connection is polish, and a room will eventually see through it. The work is not more delivery. It is the social skills underneath: the listening, the warmth, the consistency that give the delivery something real to carry. Read this score as a prompt to strengthen the foundation, not to add more shine.';
    bodyText(doc, overrun);
  } else {
    const sound = (content.personal_impact && content.personal_impact.multiplier_sound) ||
      'Your Personal Impact rests on a solid social foundation. The delivery is carrying real substance, which is what makes it land rather than merely impress. The development edge here is consistency: making sure the message lands as reliably in the hard rooms as it does in the easy ones.';
    bodyText(doc, sound);
  }
}

// ── Opener variation (new in v6) ───────────────────────────────────────────
// v5 had every subscale page opening with "Your [name] score sits in a
// strong/lower range." Across four consecutive pages the repetition shows.
// We intercept the first sentence and swap in one of three variants,
// deterministically selected by the subscale code so the same respondent
// always gets the same wording.

function varyOpener(originalText, code, frame) {
  // frame = 'strength' or 'development'
  // Identify the original opener pattern and replace just the first sentence.
  const pattern = /^Your [^.]+ score sits in a (strong|lower) range\.\s*/;
  const match = originalText.match(pattern);
  if (!match) return originalText;

  const rest = originalText.slice(match[0].length);

  // Deterministic variant pick: hash of code → 0/1/2
  const variantIdx = (code.charCodeAt(0) + code.charCodeAt(1)) % 3;

  let opener;
  if (frame === 'strength') {
    const strengthOpeners = [
      'This is a relative high point in your profile. ',
      'The score here is doing useful work for you. ',
      'This sits among your stronger subscales. '
    ];
    opener = strengthOpeners[variantIdx];
  } else {
    const devOpeners = [
      'This subscale is the one most worth attention now. ',
      'There is real room to develop here, and the work is specific. ',
      'This is the subscale where deliberate practice will most repay the effort. '
    ];
    opener = devOpeners[variantIdx];
  }

  return opener + rest;
}

// ── Main entry ─────────────────────────────────────────────────────────────
//
// Paid endpoint. The caller sends a Stripe checkout session id and nothing
// else. What they answered, and whether they paid for it, are read from
// places they do not control.
//
// There is deliberately no test bypass. A secret door into a paid endpoint is
// how free reports leak. Test with Stripe test mode and card 4242 4242 4242 4242.
const MAX_GENERATIONS = 20;

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missingEnv = [
    !stripeKey && 'STRIPE_SECRET_KEY',
    !supabaseUrl && 'SUPABASE_URL',
    !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY'
  ].filter(Boolean);

  if (missingEnv.length) {
    // Names only, never values.
    console.error('[report] Missing environment configuration:', missingEnv.join(', '));
    res.status(500).json({ error: 'Report generation is not configured.', missing: missingEnv });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
  }

  const sessionId = (body && body.session_id) || (req.query && req.query.session_id);
  if (typeof sessionId !== 'string' || sessionId.indexOf('cs_') !== 0) {
    res.status(400).json({ error: 'Missing checkout session.' });
    return;
  }

  // Initialise inside the handler. Module-level init fails intermittently on
  // Vercel's serverless runtime and has broken deploys on these projects.
  const stripe = require('stripe')(stripeKey);
  const { createClient } = require('@supabase/supabase-js');
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'osci' }
  });

  // ── The gate ───────────────────────────────────────────────────────────
  // Stripe is asked directly. A session id in a request is a claim, and the
  // answer to whether it was paid comes from Stripe, never from the caller.
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e) {
    console.error('[report] Session lookup failed:', e && e.message);
    res.status(404).json({ error: 'That payment could not be found.' });
    return;
  }

  if (session.payment_status !== 'paid') {
    console.error('[report] Unpaid session refused:', sessionId, session.payment_status);
    res.status(402).json({ error: 'This report has not been paid for.' });
    return;
  }

  const runToken = (session.metadata && session.metadata.run_token) || session.client_reference_id;
  if (!runToken) {
    console.error('[report] Paid session carries no run_token:', sessionId);
    res.status(500).json({ error: 'Your payment went through, but the assessment could not be matched. Please contact us.' });
    return;
  }

  const { data: run, error: runError } = await admin
    .from('runs')
    .select('name, email, scoring')
    .eq('token', runToken)
    .maybeSingle();

  if (runError) {
    console.error('[report] Run lookup failed:', runError.message);
    res.status(500).json({ error: 'Could not load your answers. Please try again.' });
    return;
  }
  if (!run) {
    console.error('[report] Paid session has no run row:', sessionId, runToken);
    res.status(500).json({ error: 'Your payment went through, but the assessment could not be found. Please contact us.' });
    return;
  }

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('generation_count, status, first_generated_at')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();

  if (orderError) {
    // Not fatal. Stripe already said this was paid, and that is the
    // entitlement. The record is bookkeeping and the log names the gap.
    console.error('[report] Order lookup failed:', orderError.message);
  }

  if (order && order.status === 'refunded') {
    res.status(403).json({ error: 'This order was refunded.' });
    return;
  }
  if (order && order.generation_count >= MAX_GENERATIONS) {
    console.error('[report] Generation cap reached:', sessionId, order.generation_count);
    res.status(429).json({ error: 'This report has been downloaded too many times. Please contact us.' });
    return;
  }

  const email = run.email;
  const respondentName = run.name;
  const scoring = run.scoring;

  if (!scoring || typeof scoring.confidence !== 'number') {
    console.error('[report] Stored scoring payload is malformed:', runToken);
    res.status(500).json({ error: 'Stored answers are unreadable. Please contact us.' });
    return;
  }

  // Recorded before it is streamed. A count one too high after a broken
  // download is a nuisance. A count that never rises is a hole.
  const generatedAt = new Date().toISOString();
  const { error: countError } = await admin
    .from('orders')
    .update({
      generation_count: ((order && order.generation_count) || 0) + 1,
      first_generated_at: (order && order.first_generated_at) || generatedAt,
      last_generated_at: generatedAt,
      updated_at: generatedAt
    })
    .eq('stripe_session_id', sessionId);
  if (countError) console.error('[report] Could not record generation:', countError.message);

  // Load content library
  const contentPath = path.join(__dirname, '..', 'assets', 'content.json');
  let content;
  try {
    content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
  } catch (e) {
    console.error('Failed to load content library:', e);
    res.status(500).json({ error: 'Content library missing' });
    return;
  }

  // Load the personalised-interpretation patterns block (resolver rules,
  // locked situational readings, technique references). Non-fatal: if the
  // file is missing, patterns stays null and the development pages fall back
  // to the previous locked-block behaviour, so a report is always produced.
  let patterns = null;
  try {
    patterns = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'patterns.json'), 'utf8'));
  } catch (e) {
    console.error('[patterns] not loaded, falling back to locked blocks:', e.message);
  }

  // Two API calls in parallel: headline (cover) and profile narrative (new
  // "Where you are right now" page). Both have fallbacks. Running in parallel
  // saves ~half a second of report generation time.
  const [headline, profileParagraphs] = await Promise.all([
    generateHeadline(content, scoring, respondentName),
    generateProfileNarrative(content, scoring, respondentName)
  ]);

  // Identify the strengths and development areas.
  // Critical: a subscale must never appear in both lists. Where scores are
  // tied (e.g. A1=A2=64 with both flagged as priorities), the development
  // area selection wins, and strengths are picked from what remains.
  const developmentCodes = scoring.priorityAreas;
  const sortedSubscales = Object.entries(scoring.subscaleScores)
    .filter(([code]) => !developmentCodes.includes(code))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const strengthCodes = sortedSubscales.slice(0, 2).map(s => s[0]);

  // Select methods: 3 most relevant to the development areas, plus 1 wildcard
  // from across the toolkit so the reader gets a balanced set rather than
  // four methods all clustered on the same theme.
  const methodKeys = Object.keys(content.methods).filter(k => k.startsWith('M'));
  const priorityMatched = [];
  const wildcards = [];
  for (const k of methodKeys) {
    const m = content.methods[k];
    if (m.relevant_to && m.relevant_to.some(s => developmentCodes.includes(s))) {
      priorityMatched.push({ key: k, ...m });
    } else {
      wildcards.push({ key: k, ...m });
    }
  }
  const chosenMethods = priorityMatched.slice(0, 3);
  // Add one wildcard from a different dimension to broaden the toolkit
  if (wildcards.length) {
    const devDimensions = new Set(developmentCodes.map(c => c[0])); // 'A' or 'B'
    const fromOtherDimension = wildcards.find(m =>
      m.relevant_to && m.relevant_to.some(s => !devDimensions.has(s[0]))
    );
    chosenMethods.push(fromOtherDimension || wildcards[0]);
  }

  // Build the PDF.
  // bufferPages: true is REQUIRED so we can come back at the end and stamp
  // the header, footer and "Page X of Y" on every page once the total page
  // count is known. Without buffering, pages flush as they're built and
  // we'd be unable to write "Page 1 of 22" because we don't yet know it's 22.
  const titleForMetadata = respondentName ? `${respondentName} OSCI Report` : 'OSCI Pro Report';
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 72, bottom: 72, left: 72, right: 72 },
    bufferPages: true,
    info: {
      Title: titleForMetadata,
      Author: 'Jim Harvey | The Message Business',
      Subject: 'Personalised charisma development report'
    }
  });

  // Filename for the download. Format: "[Name] OSCI Report.pdf"
  // Strip anything that's awkward in a filename but preserve the space so
  // the saved file reads as natural English on the user's desktop.
  const safeNameForFilename = respondentName
    ? respondentName.replace(/[^a-zA-Z0-9 _-]+/g, '').trim()
    : '';
  const filename = safeNameForFilename
    ? `${safeNameForFilename} OSCI Report.pdf`
    : 'OSCI Report.pdf';

  res.setHeader('Content-Type', 'application/pdf');
  // Quoted filename so the space survives the HTTP header. Also include
  // filename* (RFC 5987) for browsers that need a UTF-8-safe form.
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  doc.pipe(res);

  renderReport(doc, content, scoring, headline, profileParagraphs, respondentName, strengthCodes, developmentCodes, chosenMethods, patterns);

  // Second pass: stamp header, footer and "Page X of Y" on every page now
  // that we know how many pages there are. Skip page 1 (the cover) — a
  // cover with "Private and Confidential" stamped across it looks wrong,
  // and the page number ("Page 1 of 22") would also be ugly on the cover.
  stampHeadersAndFooters(doc, respondentName);

  doc.end();
};

// Walk every buffered page and add the header (top), footer text (bottom
// left) and page indicator (bottom right). Skip the cover page.
function stampHeadersAndFooters(doc, respondentName) {
  const range = doc.bufferedPageRange(); // { start, count }
  const totalPages = range.count;
  const headerText = respondentName
    ? `${respondentName} OSCI Report  ·  Private and Confidential`
    : 'OSCI Report  ·  Private and Confidential';
  const footerLeft = '© James G Harvey 2026';

  // A4 page dimensions in points
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const sideMargin = 72;

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (i === 0) continue; // skip the cover

    // pdfkit's high-level text() call advances doc.y after writing, and if
    // a subsequent call's y position appears to be below the bottom margin,
    // pdfkit will auto-add a new page before writing. That behaviour ruins
    // a stamping pass like this one (one stamp triggers a new page, that
    // page gets stamped, and so on). To stop that, we drop the bottom
    // margin to zero for the duration of the stamping pass on each page,
    // then restore. We also use `lineBreak: false` so the text never wraps.
    const originalBottomMargin = doc.page.margins.bottom;
    const originalTopMargin = doc.page.margins.top;
    doc.page.margins.bottom = 0;
    doc.page.margins.top = 0;

    // Header text: muted, centred, in the top page gutter.
    doc.font(FONT_HEAD).fontSize(8).fillColor(COLOURS.muted)
       .text(headerText, sideMargin, 36, {
         width: pageWidth - 2 * sideMargin,
         align: 'center',
         lineBreak: false
       });

    // Thin gold rule under the header — a quiet brand cue.
    doc.lineWidth(0.4).strokeColor(COLOURS.gold)
       .moveTo(sideMargin, 50)
       .lineTo(pageWidth - sideMargin, 50)
       .stroke();

    // Footer: copyright on the left, page indicator on the right.
    const footerY = pageHeight - 40;
    const halfWidth = (pageWidth - 2 * sideMargin) / 2;

    doc.font(FONT_HEAD).fontSize(8).fillColor(COLOURS.muted)
       .text(footerLeft, sideMargin, footerY, {
         width: halfWidth,
         align: 'left',
         lineBreak: false
       });

    doc.font(FONT_HEAD).fontSize(8).fillColor(COLOURS.muted)
       .text(`Page ${i + 1} of ${totalPages}`, sideMargin + halfWidth, footerY, {
         width: halfWidth,
         align: 'right',
         lineBreak: false
       });

    // Restore the margins so any further pdfkit operations behave normally.
    doc.page.margins.bottom = originalBottomMargin;
    doc.page.margins.top = originalTopMargin;
  }
}

// ── The report itself ──────────────────────────────────────────────────────
// ── The locked preface ─────────────────────────────────────────────────────
// Four pages of locked concept content that set the voice and explain the
// instrument before the reader meets any of their own numbers. Source: the
// locked collation (preface_p1_v7 .. preface_p4_v2). These render verbatim;
// the only substitution is the live score where the locked text carries a
// [put the number here] placeholder.
// ── The preface, split into placeable pages (newspaper reorder, 12 June) ───
// The old renderPreface ran four concept pages back to back before the reader
// met a single number. The reorder puts the news first: the reader now meets
// the dashboard on page 3. The concept pages render individually, where each
// earns its place:
//   page1 (What we mean by charisma)  → stays up front; it sells the model.
//   page4 (The four positions)        → sits directly before the reader's map.
//   page2 (The two dimensions)        → background, after the plain-words
//                                       narrative; the Sistine passage is now
//                                       read by an invested reader.
//   page3 (The four readings)         → dissolved. It duplicated the CCI and
//                                       Personal Impact pages; its useful
//                                       "four lenses" paragraph now renders
//                                       beneath the score tiles on the
//                                       opening summary.

// ── One-page summary (new in v4.5) ─────────────────────────────────────────
// The whole profile on a single page, directly after the opening summary:
// two strengths and two development areas, each with a locked situational
// line from content.json (where_it_helps / where_gain_shows). No AI text
// on this page; the header uses the static quadrant tagline.
function renderOnePageSummary(doc, content, scoring, strengthCodes, developmentCodes, profileParagraphs) {
  const quadrant = content.quadrants[scoring.quadrant];
  doc.addPage();
  eyebrow(doc, 'Your results');
  h1(doc, 'Where you are right now');

  if (quadrant && quadrant.tagline) {
    doc.font(FONT_BODY_ITALIC).fontSize(12).fillColor(COLOURS.muted)
       .text(`${quadrant.label}. ${quadrant.tagline}`, { lineGap: 2 });
    doc.moveDown(0.8);
  }

  const entry = (code, line) => {
    const sub = content.subscales[code];
    if (!sub) return;
    doc.font(FONT_HEAD_BOLD).fontSize(11).fillColor(COLOURS.navy)
       .text(`${code}  ${sub.name}  \u00B7  ${scoring.subscaleScores[code]} of 100`);
    doc.moveDown(0.15);
    if (line) bodyText(doc, line);
    doc.moveDown(0.35);
  };

  h2(doc, 'What is already working');
  strengthCodes.forEach(code =>
    entry(code, content.subscales[code] && content.subscales[code].where_it_helps));

  doc.moveDown(0.3);
  h2(doc, 'Where to focus next');
  developmentCodes.forEach(code =>
    entry(code, content.subscales[code] && content.subscales[code].where_gain_shows));

  doc.moveDown(0.4);
  const firstPriority = content.subscales[developmentCodes[0]];
  bodyText(doc, `Start with ${firstPriority ? firstPriority.name : 'your first priority subscale'}. The rest of this report explains each of these in detail, and the four-week plan near the back turns the first priority into specific practice.`);

  // Folded in from the old "Your profile in plain words" page: the read of the
  // two dimensions in prose. The Consistency Index paragraph is filtered out,
  // so consistency keeps its single home on its own page later.
  if (Array.isArray(profileParagraphs) && profileParagraphs.length) {
    const dimensionRead = profileParagraphs.filter(p => !/consistency\s+index/i.test(p));
    if (dimensionRead.length) {
      h2(doc, 'In plain words');
      dimensionRead.forEach(p => bodyText(doc, p));
    }
  }
}

function renderPrefaceCharisma(doc, content) {
  const pf = content.preface;
  if (!pf) return;
  doc.addPage();
  eyebrow(doc, pf.page1.eyebrow);
  h1(doc, pf.page1.title);
  pf.page1.paras.forEach(p => bodyText(doc, p));
}

function renderPrefaceDimensions(doc, content) {
  const pf = content.preface;
  if (!pf) return;
  doc.addPage();
  eyebrow(doc, pf.page2.eyebrow);
  h1(doc, pf.page2.title);
  pf.page2.intro.forEach(p => bodyText(doc, p));
  h2(doc, 'Confidence');
  pf.page2.confidence.forEach(p => bodyText(doc, p));
  h2(doc, 'Social Skills');
  pf.page2.social_skills.forEach(p => bodyText(doc, p));
  h2(doc, pf.page2.combine_head);
  pf.page2.combine.forEach(p => bodyText(doc, p));
}

function renderPrefacePositions(doc, content) {
  const pf = content.preface;
  if (!pf) return;
  doc.addPage();
  eyebrow(doc, pf.page4.eyebrow);
  h1(doc, pf.page4.title);
  pf.page4.intro.forEach(p => bodyText(doc, p));

  // Quadrant image on its own clean band, centred, if available on disk.
  try {
    const imgPath = path.join(__dirname, '..', 'assets', 'quadrant.png');
    if (fs.existsSync(imgPath)) {
      const imgWidth = 340;
      const imgHeight = 340; // square source
      if (doc.y + imgHeight > 740) doc.addPage();
      const x = (595.28 - imgWidth) / 2;
      const top = doc.y + 6;
      doc.image(imgPath, x, top, { width: imgWidth });
      doc.y = top + imgHeight + 18; // doc.image does not advance the cursor
      doc.x = 72;
    }
  } catch (e) {
    // image is decorative; never block the report on it
  }

  pf.page4.positions.forEach(pos => {
    h2(doc, pos.name);
    doc.font(FONT_BODY_ITALIC).fontSize(11).fillColor(COLOURS.muted).text(pos.sub);
    doc.moveDown(0.3);
    pos.paras.forEach(p => bodyText(doc, p));
  });
  h2(doc, pf.page4.closing_head);
  pf.page4.closing.forEach(p => bodyText(doc, p));
}

// ── The Charismatic Consistency Index page (locked) ─────────────────────────
// Renders from content.consistency_page (the locked Charismatic_Consistency
// page) rather than the band-card structure. Structure: a concept note, the
// band-specific paragraph for the reader's band, then the shared "How to
// extend your reach" close.
function renderConsistencyPage(doc, content, scoring) {
  const cp = content.consistency_page;
  // A valid index is a finite number; a valid band resolves to band copy. If
  // either is missing (e.g. the questionnaire is missing its consistencyBands),
  // render the concept and general advice without ever printing "undefined".
  const idx = scoring.consistencyIndex;
  const hasIndex = (typeof idx === 'number' && Number.isFinite(idx));
  const bandKey = (scoring.consistencyBand || '').toLowerCase()
    .replace(/\s+/g, '_').replace(/-/g, '_');
  const bandPara = bandKey ? cp.bands[bandKey] : null;

  doc.addPage();
  eyebrow(doc, cp.eyebrow);
  h1(doc, hasIndex ? `${cp.title}: ${idx}` : cp.title);
  if (scoring.consistencyBand) {
    doc.font(FONT_BODY_ITALIC).fontSize(13).fillColor(COLOURS.muted)
       .text(scoring.consistencyBand);
  }
  doc.moveDown(0.8);

  // One idea, one home: this page now carries only the reader's own consistency
  // read. The concept (what the Index measures) and the generic "how to extend
  // your reach" move to the appendix, so the reader meets the number once, here,
  // as a read of their result.
  if (bandPara) {
    bodyText(doc, bandPara);
  } else {
    // No band resolved: fall back to the concept so the page is never empty.
    cp.concept.forEach(p => bodyText(doc, p));
  }
}

// ── Personalised interpretation: pattern resolver + technique lookup ────────
// Every subscale in patterns.json carries candidate patterns, each defined by
// a few item numbers. The resolver picks the candidate whose items have the
// lowest mean post-reverse score (from scoring.subscaleItemScores). An optional
// `tie` candidate fires only on an exact tie. Returns null if patterns is
// absent or the subscale has no item detail, so the caller can fall back.
function resolvePattern(patterns, scoring, code) {
  if (!patterns || !patterns.subscales || !patterns.subscales[code]) return null;
  const detail = scoring.subscaleItemScores && scoring.subscaleItemScores[code];
  if (!detail || !detail.length) return null;
  const byN = {};
  detail.forEach(o => { byN[o.n] = o.score; });
  const block = patterns.subscales[code];
  const mean = items => items.reduce((a, n) => a + (byN[n] || 0), 0) / items.length;
  const scored = block.candidates
    .map(c => ({ c, m: mean(c.items) }))
    .sort((a, b) => a.m - b.m || String(a.c.id).localeCompare(String(b.c.id)));
  if (block.tie && scored.length >= 2 && scored[0].m === scored[1].m) return block.tie;
  return scored[0] ? scored[0].c : null;
}

// Resolve a technique reference to { name, summary }. M-ids come from
// content.methods; new slugs come from content.techniques; anything still
// unresolved falls back to the one-line description in patterns.new_techniques.
function lookupTechnique(content, patterns, ref) {
  if (content.methods && content.methods[ref]) {
    return { name: content.methods[ref].name, summary: content.methods[ref].summary };
  }
  if (content.techniques && content.techniques[ref]) {
    return { name: content.techniques[ref].name, summary: content.techniques[ref].summary };
  }
  if (patterns && patterns.new_techniques && patterns.new_techniques[ref]) {
    const line = patterns.new_techniques[ref];
    const i = line.indexOf(':');
    if (i > -1) {
      const name = line.slice(0, i).trim();
      let summary = line.slice(i + 1).trim();
      // The one-liners are stored as "Name: predicate", so the predicate starts
      // lower-case and reads as a fragment under the heading. Capitalise it so
      // it stands as a proper sentence beside the fully-authored methods.
      summary = summary.charAt(0).toUpperCase() + summary.slice(1);
      return { name, summary };
    }
    return { name: ref, summary: line };
  }
  return null;
}

// Split a development block's "what this score tells you" into the shared
// concept teaching (kept) and the old generic in-case paragraph (dropped, now
// replaced by the resolved reading). Splits on the "Now[,] what this score is
// telling us in your case" marker. If the marker is absent, the whole text is
// treated as concept teaching.
function conceptTeaching(text) {
  if (!text) return '';
  const m = text.split(/\n?\s*Now,?\s+what this score is telling us in your case\.?\s*/i);
  return m[0].trim();
}

// Strip the now-obsolete "read your own profile and decide which is you"
// self-diagnosis lines from a concept note. The report resolves the pattern
// from the reader's answers now, so the instruction to self-diagnose no
// longer applies.
function stripSelfDiagnose(text) {
  if (!text) return text;
  return text
    .replace(/\s*Both possibilities exist in your subscale score\.\s*/gi, ' ')
    .replace(/\s*Read your own profile against the (?:two|four)[^.]*\.\s*/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// Concept teaching for the appendix: apply the high-band variant swap, take
// the concept half (before the "in your case" marker), and strip the
// self-diagnosis line.
function appendixConcept(block, scoring, code) {
  let t = block.what_this_score_tells_you || '';
  const hv = block.high_band_variant;
  if (hv && hv.replace && hv.with && isHighBandSubscale(scoring, code) && t.includes(hv.replace)) {
    t = t.replace(hv.replace, hv.with);
  }
  return stripSelfDiagnose(conceptTeaching(t));
}

// The Charismatic Consistency Index concept, moved here from the front page.
// The reader's own consistency read stays on its page in the report; the
// explanation of what the Index measures, and the generic development move,
// live here as reference.
function renderAppendixConsistency(doc, content) {
  const cp = content.consistency_page;
  if (!cp) return;
  doc.addPage();
  eyebrow(doc, cp.eyebrow || 'How widely it reaches');
  h1(doc, cp.title || 'The Charismatic Consistency Index');
  if (cp.concept) cp.concept.forEach(p => bodyText(doc, p));
  if (cp.extend_head && cp.extend) {
    h2(doc, cp.extend_head);
    cp.extend.forEach(p => bodyText(doc, p));
  }
}

// ── The appendix: the model, at the back ───────────────────────────────────
// Everything the reader does not need in order to act now: what charisma is,
// the two dimensions and the Sistine passage, the four positions, and the
// concept notes plus skill-building teaching for the priority subscales. All
// of it moved here so the front of the report is the reader's own results.
function renderAppendix(doc, content, scoring, developmentCodes, patterns) {
  doc.addPage();
  eyebrow(doc, 'Appendix');
  h1(doc, 'The model, in full');
  bodyText(doc, `Everything up to here is your report. What follows is the model it rests on: what we mean by charisma, the two dimensions it is built from, the four positions, and the thinking behind your priority subscales. Read it if you want the reasoning under your results. You do not need it to act on the report.`);

  // The concept pages. Each already begins with its own doc.addPage().
  renderPrefaceCharisma(doc, content);
  renderPrefaceDimensions(doc, content);
  renderPrefacePositions(doc, content);
  renderAppendixConsistency(doc, content);

  // The subscales explained, for the reader's priority subscales: what the
  // subscale measures, and how the skill is built. Rendered only when the
  // patterns block is present, because without it the development pages carry
  // this teaching inline already.
  if (patterns) {
    developmentCodes.forEach(code => {
      const sub = content.subscales[code];
      if (!sub || !sub.development) return;
      const block = sub.development;
      doc.addPage();
      eyebrow(doc, 'The subscales explained');
      h1(doc, `${code}  ${sub.name}`);
      h2(doc, 'What this measures');
      splitParas(appendixConcept(block, scoring, code)).forEach(p => bodyText(doc, p));
      if (block.how_to_close_the_gap) {
        h2(doc, 'How the skill is built');
        splitParas(block.how_to_close_the_gap).forEach(p => bodyText(doc, p));
      }
    });
  }
}

function renderReport(doc, content, scoring, headline, profileParagraphs, respondentName, strengthCodes, developmentCodes, chosenMethods, patterns) {
  const quadrant = content.quadrants[scoring.quadrant];
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // ─── Page 1: Cover ──────────────────────────────────────────────────────
  doc.moveDown(8);
  doc.font(FONT_HEAD_BOLD).fontSize(10).fillColor(COLOURS.gold)
     .text('OSCI PRO REPORT', { characterSpacing: 3, align: 'left' });
  doc.moveDown(0.5);
  doc.font(FONT_HEAD_BOLD).fontSize(32).fillColor(COLOURS.navy)
     .text('Your Charisma', { align: 'left' });
  doc.font(FONT_HEAD_BOLD).fontSize(32).fillColor(COLOURS.navy)
     .text('Quadrant', { align: 'left' });
  doc.moveDown(0.5);
  doc.lineWidth(2).strokeColor(COLOURS.gold)
     .moveTo(72, doc.y).lineTo(220, doc.y).stroke();
  doc.moveDown(1.2);
  doc.font(FONT_HEAD_BOLD).fontSize(20).fillColor(COLOURS.navy).text(quadrant.label);
  doc.moveDown(1.2);
  doc.font(FONT_BODY_ITALIC).fontSize(13).fillColor(COLOURS.ink)
     .text(headline, { align: 'left', lineGap: 4, width: 400 });

  // Second gold rule lower in the page — gives the lower third somewhere to
  // anchor instead of dead space. Thinner than the headline rule.
  doc.moveDown(5);
  doc.lineWidth(0.5).strokeColor(COLOURS.gold)
     .moveTo(72, doc.y).lineTo(180, doc.y).stroke();
  doc.moveDown(0.8);

  doc.font(FONT_HEAD).fontSize(10).fillColor(COLOURS.muted)
     .text(respondentName ? `Prepared for ${respondentName}` : 'Prepared for you');
  doc.text(today);

  // The model theory (what we mean by charisma, the two dimensions, the four
  // positions) now renders in the appendix at the back. The front of the
  // report goes straight to the reader's own results.

  // ─── Opening summary (the news) ──────────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Opening summary');
  h1(doc, 'There is a lot here to build on');

  if (content.manifesto && content.manifesto.front) {
    content.manifesto.front.paragraphs.forEach(p => bodyText(doc, p));
  }

  bodyText(doc, `Your results place you in the ${quadrant.label.replace(/^The /, '')} quadrant, where Confidence and Social Skills are both working for you. Your quadrant is read in full a few pages on.`);

  doc.moveDown(0.5);
  drawScoreTiles(doc, scoring, 72, doc.y, 451);
  doc.y += 90;
  doc.x = 72;

  // The "four lenses" paragraph from the dissolved four-readings page now
  // lives beneath the tiles, where it orients the numbers it sits under.
  if (content.preface && content.preface.page3 && content.preface.page3.together) {
    doc.moveDown(0.4);
    content.preface.page3.together.forEach(p => bodyText(doc, p));
  }

  // ─── Your profile on one page (new in v4.5) ──────────────────────────────
  // The complete takeaway by page 4: two strengths and two development
  // areas with situational lines, before any further model exposition.
  renderOnePageSummary(doc, content, scoring, strengthCodes, developmentCodes, profileParagraphs);

  // ─── Your position on the map ────────────────────────────────────────────
  // The two dimensions and the four positions now live in the appendix. The
  // reader meets their own placement here; the model behind it is at the back.
  doc.addPage();
  eyebrow(doc, 'Where you sit on the map');
  h1(doc, 'Your position');
  bodyText(doc, `The map below plots your two dimension scores against each other. Your placement is highlighted. The four positions are described in the appendix at the back of this report; this is where your own scores put you now.`);
  doc.moveDown(1.2);
  drawQuadrantGrid(doc, scoring, 297.5, doc.y, 320);

  // ─── Your quadrant in detail ─────────────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Your quadrant');
  h1(doc, quadrant.label);
  doc.font(FONT_BODY_ITALIC).fontSize(13).fillColor(COLOURS.muted)
     .text(quadrant.tagline);
  doc.moveDown(0.8);
  h2(doc, 'The work in this quadrant');
  bodyText(doc, quadrant.what_the_quadrant_means);
  h2(doc, 'Common patterns at this position');
  bodyText(doc, quadrant.common_blind_spots);

  doc.addPage();
  eyebrow(doc, 'Your full profile');
  h1(doc, 'All ten subscales at a glance');
  bodyText(doc, `The two dimensions are built from ten subscales: five for Confidence, five for Social Skills. The bars below show how each of yours is scoring. The two amber bars are your priority subscales, identified by the scoring engine as the most useful focus for development now. The rest of this report builds on this picture.`);
  doc.moveDown(0.6);
  drawSubscaleBars(doc, scoring, content, developmentCodes, 72, doc.y, 451);

  // ─── (folded) "Your profile in plain words" ────────────────────────────
  // The standalone plain-words page is gone. Its dimension read now closes the
  // results page (renderOnePageSummary), so the reader meets their whole result
  // in one place. The Consistency Index paragraph is filtered out there, so the
  // consistency read has its single home on the page below.

  // ─── The Charismatic Consistency Index (locked page) ──────────────────
  renderConsistencyPage(doc, content, scoring);

  // ─── Personal Impact (new in v9) ───────────────────────────────────────
  // Only rendered when the reading is present (60-item payloads). The page
  // reads the score against the Social Skills foundation: the multiplier
  // rule means a high impact score over thin social skills carries a
  // different message from the same score over strong ones.
  if (scoring.personalImpact && typeof scoring.personalImpact.score === 'number') {
    renderPersonalImpactPage(doc, content, scoring);
  }

  // ─── Your key strengths ─────────────────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Your key strengths');
  h1(doc, 'What is already working');
  bodyText(doc, `Two subscales stand out as relative strengths in your profile. The Pro report leads with these because the most reliable way to develop is to extend what is already working, rather than start from scratch on what is not.`);

  strengthCodes.forEach((code, idx) => {
    if (idx > 0) doc.addPage();
    const sub = content.subscales[code];
    if (!sub) return;
    const block = sub.strength;

    doc.moveDown(0.6);
    eyebrow(doc, `Strength ${idx + 1} of ${strengthCodes.length}`);
    h1(doc, `${code}  ${sub.name}`);
    doc.font(FONT_BODY_ITALIC).fontSize(12).fillColor(COLOURS.muted)
       .text(`Score: ${scoring.subscaleScores[code]} of 100`);
    doc.moveDown(0.6);

    h2(doc, 'What this suggests');
    bodyText(doc, varyOpener(block.what_this_suggests, code, 'strength'));
    h2(doc, 'Why it matters');
    bodyText(doc, block.why_it_matters);
    h2(doc, 'How to use it even better');
    bodyText(doc, block.how_to_use_it_even_better);
  });

  // ─── Your key development areas ─────────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Your key development areas');
  h1(doc, 'Where to focus next');
  // Section intro. When the patterns block is present, lead with the
  // provenance line (this is built from the reader's own answers) and the
  // one-line profile framing, both filled from the reader's scores.
  const sIntro = patterns && patterns.section_intro;
  if (sIntro) {
    if (sIntro.provenance) bodyText(doc, sIntro.provenance);
    if (sIntro.profile) {
      const topStrengthName = (content.subscales[strengthCodes[0]] || {}).name || 'your strongest area';
      const firstPriorityName = (content.subscales[developmentCodes[0]] || {}).name || 'your first priority';
      bodyText(doc, sIntro.profile
        .replace('{top_strength}', topStrengthName)
        .replace('{first_priority}', firstPriorityName));
    }
  } else {
    bodyText(doc, `Two subscales have been identified as the most useful focus for your development now. These are the areas where some deliberate practice over the next four to six weeks will produce visible change. Pick one to start with. Work on it. Then come back to the other.`);
  }

  developmentCodes.forEach((code, idx) => {
    doc.addPage();
    const sub = content.subscales[code];
    if (!sub) return;
    const block = sub.development;

    eyebrow(doc, `Development area ${idx + 1} of ${developmentCodes.length}`);
    h1(doc, `${code}  ${sub.name}`);
    doc.font(FONT_BODY_ITALIC).fontSize(12).fillColor(COLOURS.muted)
       .text(`Score: ${scoring.subscaleScores[code]} of 100`);
    doc.moveDown(0.6);

    // v4.4: high-band variant. A subscale can be selected as a priority
    // while sitting in the higher band (a relative gap, not a low score).
    // The locked low-band opening reads wrongly against a score of 80+.
    // If content.json carries a high_band_variant for this subscale and
    // the respondent's band qualifies, swap the anchored sentences. Absent
    // key or absent anchor: current behaviour, untouched.
    let tellsYou = block.what_this_score_tells_you;
    const hv = block.high_band_variant;
    if (hv && hv.replace && hv.with &&
        isHighBandSubscale(scoring, code) &&
        tellsYou.includes(hv.replace)) {
      tellsYou = tellsYou.replace(hv.replace, hv.with);
    }

    // v-item1: resolve the reader's specific pattern from their item answers.
    // When resolved, we render the shared concept teaching, then the
    // personalised reading in place of the old generic in-case paragraph, and
    // the pattern's matched techniques in place of the generic activities.
    // When not resolved (patterns absent, or no item detail), fall back to the
    // previous locked-block behaviour exactly.
    const resolved = resolvePattern(patterns, scoring, code);

    if (resolved) {
      // Personal, up front: your pattern and your matched techniques only.
      // The concept teaching and the how-to-close method move to the appendix,
      // so this page stays about you and what to do next.
      h2(doc, 'Where you are with this');
      bodyText(doc, resolved.reading);

      if (resolved.techniques && resolved.techniques.length) {
        h2(doc, 'Where to start');
        bodyText(doc, `These are the techniques matched to what your answers show. Each is set out in fuller detail in the Practice Content Library and the companion book, and the subscale is explained in full in the appendix.`);
        resolved.techniques
          .map(ref => lookupTechnique(content, patterns, ref))
          .filter(Boolean)
          .forEach(t => {
            h3(doc, t.name);
            bodyText(doc, t.summary);
          });
      }
    } else {
      // Fallback (patterns block absent): the previous locked-block behaviour,
      // so a report is always produced.
      h2(doc, 'What this score tells you');
      splitParas(tellsYou).forEach(p => bodyText(doc, p));
      h2(doc, 'What it costs to leave this alone');
      splitParas(block.what_it_costs_to_leave_this_alone).forEach(p => bodyText(doc, p));
      h2(doc, 'How to close the gap');
      splitParas(block.how_to_close_the_gap).forEach(p => bodyText(doc, p));
      h2(doc, 'Where you might start');
      block.where_you_might_start.forEach(b => bulletPoint(doc, b));
    }
  });

  // ─── (removed) "Four methods for your profile" ─────────────────────────
  // The generic four-method section duplicated the pattern-matched techniques
  // now shown under "Where to start" on each development page. Removed so each
  // technique appears once, in the place most relevant to the reader.

  // ─── A four-week plan ──────────────────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Putting it to work');
  h1(doc, 'Your four weeks');
  bodyText(doc, `Most development plans fail because they are too long or too vague. Yours has four weeks, with one or two specific things to do in each. Small enough to actually run alongside your normal work.`);
  bodyText(doc, `Focus on your first priority subscale: ${content.subscales[developmentCodes[0]] ? content.subscales[developmentCodes[0]].name : 'your first priority'}. The plan below uses the activities from that subscale. After four weeks, come back to this report and decide whether to keep going or to move on to your second priority.`);

  const weeklyPlan = buildWeeklyPlan(content, developmentCodes, chosenMethods);
  weeklyPlan.forEach(week => {
    h3(doc, week.title);
    bodyText(doc, week.detail);
  });

  // (v5's redundant trailing paragraph here has been removed. Week 4's text
  // already covers the audit/notice instruction.)

  // ─── Goal-setting exercise ──────────────────────────────────────────────
  if (content.goal_setting) {
    renderGoalSettingIntro(doc, content.goal_setting);
    developmentCodes.forEach((code, idx) => {
      const sub = content.subscales[code];
      if (!sub) return;
      renderGoalSettingExercise(doc, content.goal_setting, code, sub, scoring.subscaleScores[code], idx + 1, developmentCodes.length);
    });
    renderGoalSettingClosing(doc, content.goal_setting);
  }

  // ─── Closing: One last thing (the warm close of the report) ────────────
  doc.addPage();
  eyebrow(doc, 'A final note');
  const backManifesto = (content.manifesto && content.manifesto.back) || null;
  h1(doc, backManifesto ? backManifesto.title : 'The point of all this');
  if (backManifesto) {
    backManifesto.paragraphs.forEach(p => bodyText(doc, p));
  } else {
    bodyText(doc, `The point is not to become a different person. It is to make the best of who you already are more consistent, more visible, and more useful to the people around you.`);
  }

  // ─── Appendix: the model, as pure reference behind the report ──────────
  renderAppendix(doc, content, scoring, developmentCodes, patterns);

  // ─── Final sign-off, at the very end ───────────────────────────────────
  doc.moveDown(3);
  doc.lineWidth(0.5).strokeColor(COLOURS.gold)
     .moveTo(72, doc.y).lineTo(523, doc.y).stroke();
  doc.moveDown(0.6);
  doc.font(FONT_HEAD).fontSize(9).fillColor(COLOURS.muted)
     .text(`OSCI Pro Report  \u00B7  Generated ${today}`, { align: 'center', width: 451 });
  doc.moveDown(0.2);
  doc.text('\u00A9 2026 James G Harvey / Allcow Trading Co Ltd  \u00B7  opensourcecharisma.com', { align: 'center', width: 451 });
}

function confidenceBandSummary(band) {
  if (band === 'higher') {
    return "Your Confidence score sits in the higher band. The pattern this usually means: a settled internal baseline, composure when things get hard, willingness to say the difficult thing in the room rather than around it, and the capacity to update your position when shown new evidence. The work at this band is consistency. Keeping the strength visible across audiences, and across the pressure points where it can quietly slip.";
  }
  if (band === 'developing') {
    return "Your Confidence score sits in the developing band. The components are mostly in place, with one or two specific subscales still uneven. The development question is which one to focus on first. The priority subscales identified later in this report point at where the work will most repay attention now. Improvement at this band tends to be visible to other people inside a few weeks.";
  }
  return "Your Confidence score sits in the lower band. The components are present but uneven. The settled baseline that is supposed to hold under pressure has not yet consolidated. Composure that is reliable in some settings is missing in others. Willingness to speak directly is conditional on stakes. The work is incremental, one subscale at a time, with practice that runs in the real meetings of your working week.";
}

function socialSkillsBandSummary(band) {
  if (band === 'higher') {
    return "Your Social Skills score sits in the higher band. The pattern this points to is consistent listening, warmth that does not depend on what the other person can do for you, conversational craft that moves rather than just exchanges, and emotional control that lets the room think for itself. The work at this band is deployment: putting these strengths to work where they matter most, with the people who would benefit most from them.";
  }
  if (band === 'developing') {
    return "Your Social Skills score sits in the developing band. The basic moves are in place. What is uneven is the next layer down: how you listen when under pressure, how warmth shows up with people on the periphery of your work, how you handle disagreement in front of others. Small adjustments at this band tend to produce disproportionate reputational effects. The priority subscales below name which specific behaviours are most worth attention.";
  }
  return "Your Social Skills score sits in the lower band. The conventional social moves are working in some contexts but not transferring reliably to others. The priority subscales identified later in this report will name which specific behaviours are most worth attention now. None of them require a personality change. All of them are practices that can run in the real meetings and conversations of the next four weeks.";
}

function buildWeeklyPlan(content, developmentCodes, chosenMethods) {
  // Week-by-week structure built from the first priority subscale's four
  // activities. Week 1 = the smallest first move. Week 2 = the harder
  // version. Week 3 = use the most relevant named method. Week 4 = audit
  // and notice the shift in other people.
  const plan = [];
  const primarySub = content.subscales[developmentCodes[0]];
  const acts = (primarySub && primarySub.development && primarySub.development.where_you_might_start) || [];

  if (acts[0]) {
    plan.push({
      title: 'Week 1: start small',
      detail: acts[0]
    });
  }
  if (acts[1]) {
    plan.push({
      title: 'Week 2: the harder version',
      detail: acts[1]
    });
  }
  if (chosenMethods[0]) {
    // v5 bug fix: method names often start with "The " (e.g. "The five-minutes
    // practice"), which combined with the template "Week 3: use the ${name}"
    // produced "Week 3: use the The five-minutes practice". Strip the leading
    // "The " so the title reads naturally.
    const rawName = chosenMethods[0].name || '';
    const cleanName = rawName.replace(/^The\s+/i, '');
    // v4.6: "Week 3: use the Asking for feedback worth getting" read as
    // truncated. Append "method" unless the name already ends in a noun
    // that carries it (practice, framework, method).
    const suffix = /(practice|framework|method)$/i.test(cleanName) ? '' : ' method';
    plan.push({
      title: `Week 3: use the ${cleanName}${suffix}`,
      detail: `Find three real situations this week to put this method to work. The first time will feel awkward. The second time will be less awkward. By the third, the practice will be building muscle. ${chosenMethods[0].summary.split('. ')[0]}.`
    });
  } else if (acts[2]) {
    plan.push({
      title: 'Week 3: extend',
      detail: acts[2]
    });
  }
  plan.push({
    title: 'Week 4: notice the shift',
    detail: `Audit the four weeks. What have you done differently? What have the people around you started doing differently with you? The change in their behaviour is the more important signal, and it usually shows up first as small things: a colleague volunteering more, a more candid answer to a question, a meeting that ends somewhere better than expected. Re-read the development page for ${primarySub ? primarySub.name : 'your priority subscale'} and decide whether to stay with it or move to the second priority next.`
  });
  return plan;
}

// Kept for compatibility in case anything still references it
function buildFourWeekPlan(content, developmentCodes, chosenMethods) {
  return buildWeeklyPlan(content, developmentCodes, chosenMethods);
}

// ── Goal-setting renderers ─────────────────────────────────────────────────

function renderGoalSettingIntro(doc, gs) {
  doc.addPage();
  eyebrow(doc, gs.intro_page.eyebrow);
  h1(doc, gs.intro_page.title);
  gs.intro_page.intro_paragraphs.forEach(p => bodyText(doc, p));
}

function renderGoalSettingExercise(doc, gs, code, sub, score, n, total) {
  doc.addPage();
  eyebrow(doc, `Goal-setting exercise ${n} of ${total}`);
  h1(doc, `${code}  ${sub.name}`);

  // Subtitle: the one-liner descriptor for this subscale
  if (sub.subtitle) {
    doc.font(FONT_BODY_ITALIC).fontSize(12).fillColor(COLOURS.muted)
       .text(sub.subtitle, { lineGap: 2 });
    doc.moveDown(0.6);
  }

  // What moving up one level looks like for the people around them
  if (sub.next_level_up) {
    doc.font(FONT_HEAD_BOLD).fontSize(11).fillColor(COLOURS.navy)
       .text('What moving up one level might look like');
    doc.moveDown(0.2);
    doc.font(FONT_BODY).fontSize(11).fillColor(COLOURS.ink)
       .text(sub.next_level_up, { align: BODY_ALIGN, lineGap: 3 });
    doc.moveDown(0.6);
  }

  doc.font(FONT_BODY_ITALIC).fontSize(11).fillColor(COLOURS.muted)
     .text(`Current score: ${score} of 100. Use the five short steps below to set a specific goal for this subscale.`);
  doc.moveDown(0.8);

  // Step 1 — rating
  h3(doc, `Step 1.  ${gs.step_titles.step_1}`);
  bodyText(doc, gs.step_prompts.step_1_lead);
  drawRatingScale(doc, gs.step_prompts.step_1_anchor_low, gs.step_prompts.step_1_anchor_high);
  doc.moveDown(0.4);

  // Steps 2-5 — prompts with fillable boxes
  const stepDefs = [
    { title: gs.step_titles.step_2, prompts: gs.step_prompts.step_2_prompts },
    { title: gs.step_titles.step_3, prompts: gs.step_prompts.step_3_prompts },
    { title: gs.step_titles.step_4, prompts: gs.step_prompts.step_4_prompts },
    { title: gs.step_titles.step_5, prompts: gs.step_prompts.step_5_prompts }
  ];

  stepDefs.forEach((step, idx) => {
    ensureSpace(doc, 140);
    h3(doc, `Step ${idx + 2}.  ${step.title}`);
    step.prompts.forEach(p => {
      ensureSpace(doc, 70);
      doc.font(FONT_BODY).fontSize(11).fillColor(COLOURS.ink)
         .text(p, { lineGap: 2 });
      doc.moveDown(0.3);
      drawWriteBox(doc, 50);
      doc.moveDown(0.6);
    });
  });
}

function renderGoalSettingClosing(doc, gs) {
  doc.moveDown(0.5);
  ensureSpace(doc, 120);
  doc.font(FONT_BODY_ITALIC).fontSize(11).fillColor(COLOURS.muted)
     .text(gs.closing_paragraph, { align: BODY_ALIGN, lineGap: 3 });
}

// Helpers for the goal-setting exercise

function drawRatingScale(doc, lowLabel, highLabel) {
  const x = 72;
  const w = 451;
  const y = doc.y + 4;
  const cellW = w / 11;

  // Draw 0-10 boxes
  for (let i = 0; i <= 10; i++) {
    const cx = x + i * cellW;
    doc.rect(cx, y, cellW - 2, 28).lineWidth(0.5).strokeColor(COLOURS.line).stroke();
    doc.font(FONT_HEAD_BOLD).fontSize(11).fillColor(COLOURS.navy)
       .text(String(i), cx, y + 9, { width: cellW - 2, align: 'center' });
  }

  // Anchor labels under the ends
  doc.font(FONT_BODY_ITALIC).fontSize(9).fillColor(COLOURS.muted)
     .text(lowLabel, x, y + 34, { width: cellW * 4 });
  doc.font(FONT_BODY_ITALIC).fontSize(9).fillColor(COLOURS.muted)
     .text(highLabel, x + w - cellW * 4, y + 34, { width: cellW * 4, align: 'right' });

  doc.y = y + 60;
  doc.x = x;
}

function drawWriteBox(doc, height) {
  const x = 72;
  const w = 451;
  const y = doc.y;
  doc.rect(x, y, w, height).lineWidth(0.5)
     .fillAndStroke(COLOURS.soft, COLOURS.line);
  doc.fillColor(COLOURS.ink);
  doc.y = y + height + 4;
  doc.x = x;
}

// ── Method card renderer ───────────────────────────────────────────────────
function renderMethodCard(doc, method, isLast) {
  const x = 72;
  const w = 451;
  const padding = 16;
  const titleHeight = 20;

  // Save state, measure body text height
  const savedY = doc.y;
  doc.font(FONT_BODY).fontSize(10.5);
  const bodyHeight = doc.heightOfString(method.summary, { width: w - 2 * padding, lineGap: 3 });
  const cardHeight = titleHeight + bodyHeight + 2 * padding + 6;
  doc.y = savedY;

  // If card would overflow the page, start a new one
  if (savedY + cardHeight > 760) {
    doc.addPage();
  }

  const startY = doc.y;
  // Background
  doc.rect(x, startY, w, cardHeight).fillAndStroke(COLOURS.soft, COLOURS.line);
  // Title
  doc.fillColor(COLOURS.navy).font(FONT_HEAD_BOLD).fontSize(13)
     .text(method.name, x + padding, startY + padding, { width: w - 2 * padding });
  // Body — left-aligned to match the rest of the report
  doc.fillColor(COLOURS.ink).font(FONT_BODY).fontSize(10.5)
     .text(method.summary, x + padding, startY + padding + titleHeight + 4,
           { width: w - 2 * padding, lineGap: 3, align: BODY_ALIGN });
  doc.y = startY + cardHeight + (isLast ? 8 : 14);
  doc.x = 72;
}
