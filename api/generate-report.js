// /api/generate-report.js
//
// The real OSCI Pro PDF report generator.
//
// v6 changes (from v5 to v6):
//   1.  Fixed the "Week 3: use the The five-minutes practice" duplication bug.
//   2.  Removed redundant repeat paragraph at the end of the four-week plan.
//   3.  Rewrote the trailing conditional sentence on the Authenticity Index
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

async function generateHeadline(content, scoring, respondentName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[headline] ANTHROPIC_API_KEY not set in environment');
    return fallbackHeadline(content, scoring);
  }
  console.error('[headline] API key present, length:', apiKey.length);

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
    .replace(/\{authenticity_index\}/g, scoring.authenticityIndex)
    .replace(/\{authenticity_band\}/g, scoring.authenticityBand || 'unknown')
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
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[headline] Anthropic API non-OK', res.status, errText.slice(0, 500));
      return fallbackHeadline(content, scoring);
    }
    const data = await res.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    const cleaned = text.trim().replace(/^["']|["']$/g, '');
    if (!cleaned) {
      console.error('[headline] Empty response from API, data keys:', Object.keys(data));
      return fallbackHeadline(content, scoring);
    }
    console.error('[headline] Got headline:', cleaned.slice(0, 120));
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
- Authenticity Index: ${scoring.authenticityIndex} (${scoring.authenticityBand || 'unknown'})
- Two highest subscales: ${strength1 ? subName(strength1) + ' (' + subScore(strength1) + ')' : '—'}, ${strength2 ? subName(strength2) + ' (' + subScore(strength2) + ')' : '—'}
- Two priority subscales: ${subName(dev1)} (${subScore(dev1)}), ${subName(dev2)} (${subScore(dev2)})

# The task

Write four short paragraphs titled "Where you are right now". 60-80 words each. Address ${name} in the second person.

Paragraph 1: Which dimension is the stronger one. What that looks like from the outside.
Paragraph 2: What the other dimension is doing. What its score means in practice.
Paragraph 3: The two priority subscales, named explicitly. What it costs ${name} to leave them unattended. Plain terms.
Paragraph 4: The Authenticity Index reading. What it points at. The through-line to the work the rest of the report sets out.

# The voice

Orwell's rules apply, in order:

1. Never use a metaphor, simile, or other figure of speech which you are used to seeing in print. No "earned the right to be in the room". No "where your real charisma lives". No "the platform from which everything operates". No "unlock". No "orchestrate". No "land".
2. Never use a long word where a short one will do. "Use" not "leverage". "Read" not "discern". "Now" not "at this juncture".
3. If it is possible to cut a word out, always cut it out.
4. Never use the passive where you can use the active.
5. Never use a foreign phrase, a scientific word, or a jargon word if you can think of an everyday English equivalent.

Additional rules, hard:

- UK English. "Behaviour", "organisation", "recognise".
- No em dashes. Anywhere.
- No contractions. Write "you are" not "you're". "It is" not "it's". "That is" not "that's". "Does not" not "doesn't".
- No "not just X, but Y" constructions. No antithesis.
- No exclamation marks. No questions to the reader. No phrases like "the work ahead".
- Plain. Specific. Like a thoughtful friend telling you what they see, not like a consultant writing a report.
- Score numbers used twice across the four paragraphs, no more.
- No headings, no bullets, no bold. Four plain paragraphs separated by blank lines.
- Do not start any paragraph with "Your [thing] score sits in..." Vary openers.

# Voice examples — write at this level

Example paragraph 1 (Sarah Mitchell, higher social skills, developing confidence):
"Your Social Skills are your stronger dimension at 78. You connect naturally, read emotional registers well, and most people feel genuinely comfortable around you. Your warmth and empathy subscales are among your highest scores. The quality of your one-to-one interactions is strong. People trust you. They open up. You make conversations feel worth having."

Example paragraph 2 (Sarah Mitchell, on her lower confidence):
"Your Confidence at 74 is functional. You do not present as uncertain or hesitant in most settings. But it has a ceiling. Under higher stakes, with people you perceive as more senior or more confident, and when the outcome of an interaction really matters, the internal experience does not match the external performance. You compensate well. The compensation costs you energy. That is what a 74 feels like from the inside."

Example paragraph 3 (Sarah Mitchell, on her priority subscale):
"Your Assertiveness and Accountability subscale at 64 is the clearest confidence gap. This is not about whether you can assert yourself. You can. It is about whether you do, consistently, in the moments that require it most: naming a problem when it will create friction, disagreeing with someone whose opinion you value, holding accountability without deflecting or softening."

Example paragraph 4 (Sarah Mitchell, on her Authenticity Index):
"Your Authenticity Index at 68 maps onto something different. Your social skills are genuine. They are not evenly distributed. People who know you well, who you feel invested in, get something real and valuable. People on the periphery get less. Not nothing, but less. That unevenness is what the 68 is measuring."

Note the rhythm. Short sentences. Plain words. Specific. Concrete. Speaking to the reader, not about them.

Return only the four paragraphs, separated by blank lines. No preamble. No headings.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[profile] Anthropic API non-OK', res.status, errText.slice(0, 500));
      return fallbackProfileNarrative(content, scoring, respondentName);
    }
    const data = await res.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    const cleaned = text.trim();
    if (!cleaned) {
      console.error('[profile] Empty response, using fallback');
      return fallbackProfileNarrative(content, scoring, respondentName);
    }
    // Split into paragraphs on blank lines
    const paragraphs = cleaned.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    if (paragraphs.length < 3) {
      console.error('[profile] Too few paragraphs returned, using fallback');
      return fallbackProfileNarrative(content, scoring, respondentName);
    }
    console.error('[profile] Got', paragraphs.length, 'paragraphs');
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

  const para1 = `${name}, here is what your scores are actually saying. Your ${strongerLabel} is the stronger of the two dimensions at ${strongerScore}. That is the version of you most people in the room are picking up on, and it is doing useful work. The risk at this band is taking it for granted. Strong dimensions stay strong when they are deployed deliberately. They quietly thin when they are not.`;

  const para2 = `Your ${otherLabel} at ${otherScore} is the other half of the picture. It is functional, but not yet doing everything it could. The gap between the two dimensions is where the development conversation usually sits. The priority subscales below name the specific behaviours where attention will most repay the effort.`;

  const para3 = `The two priority subscales identified for you are ${subName(dev1)} and ${subName(dev2)}. These are not character flaws. They are skills that are not yet doing their job reliably. The cost of leaving them unattended is small in any single moment and significant over time. The people around you read these gaps long before they name them.`;

  const para4 = `Your Authenticity Index sits at ${scoring.authenticityIndex}. This measures whether the version of you that turns up is broadly the same regardless of who is in the room. The work the rest of this report sets out is the work of consistency. Not becoming a different person. Making more of the version that already exists available to more of the people around you.`;

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
  const tileW = (width - 16) / 3;
  const tiles = [
    { label: 'CONFIDENCE',         value: scoring.confidence,        band: scoring.confidenceBand },
    { label: 'SOCIAL SKILLS',      value: scoring.socialSkills,      band: scoring.socialSkillsBand },
    { label: 'AUTHENTICITY INDEX', value: scoring.authenticityIndex, band: scoring.authenticityBand }
  ];
  tiles.forEach((t, idx) => {
    const tx = x + idx * (tileW + 8);
    doc.rect(tx, y, tileW, 80).lineWidth(0.5).strokeColor(COLOURS.line).stroke();
    doc.font(FONT_HEAD_BOLD).fontSize(8).fillColor(COLOURS.muted)
       .text(t.label, tx, y + 10, { width: tileW, align: 'center', characterSpacing: 1.5 });
    doc.font(FONT_HEAD_BOLD).fontSize(28).fillColor(COLOURS.navy)
       .text(String(t.value), tx, y + 24, { width: tileW, align: 'center' });
    doc.font(FONT_HEAD).fontSize(8).fillColor(COLOURS.muted)
       .text(prettyBand(t.band) || '', tx, y + 62, { width: tileW, align: 'center' });
  });
}

function prettyBand(b) {
  if (!b) return '';
  return b.charAt(0).toUpperCase() + b.slice(1);
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
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
  }

  const { email, scoring, respondentName } = body || {};
  if (!scoring || typeof scoring.confidence !== 'number') {
    res.status(400).json({ error: 'Missing scoring payload' });
    return;
  }

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

  // Build the PDF
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 72, bottom: 72, left: 72, right: 72 },
    info: {
      Title: 'OSCI Pro Report',
      Author: 'Jim Harvey | The Message Business',
      Subject: 'Personalised charisma development report'
    }
  });

  // Build the filename: include name if present
  const safeName = respondentName ? respondentName.replace(/[^a-zA-Z0-9_-]+/g, '_') : '';
  const filename = safeName ? `OSCI_Pro_Report_${safeName}.pdf` : 'OSCI_Pro_Report.pdf';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  renderReport(doc, content, scoring, headline, profileParagraphs, respondentName, strengthCodes, developmentCodes, chosenMethods);

  doc.end();
};

// ── The report itself ──────────────────────────────────────────────────────
function renderReport(doc, content, scoring, headline, profileParagraphs, respondentName, strengthCodes, developmentCodes, chosenMethods) {
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

  // ─── Page 2: Opening summary ────────────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Opening summary');
  h1(doc, 'There is a lot here to build on');

  if (content.manifesto && content.manifesto.front) {
    content.manifesto.front.paragraphs.forEach(p => bodyText(doc, p));
  }

  bodyText(doc, `Your results place you in the ${quadrant.label.replace(/^The /, '')} quadrant. ${quadrant.opening_paragraph}`);

  doc.moveDown(0.5);
  drawScoreTiles(doc, scoring, 72, doc.y, 451);
  doc.y += 90;
  doc.x = 72;

  // ─── Page 3: Your quadrant ─────────────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Your quadrant');
  h1(doc, quadrant.label);
  doc.font(FONT_BODY_ITALIC).fontSize(13).fillColor(COLOURS.muted)
     .text(quadrant.tagline);
  doc.moveDown(0.8);
  h2(doc, 'What this quadrant means');
  bodyText(doc, quadrant.what_the_quadrant_means);
  h2(doc, 'Common patterns at this position');
  bodyText(doc, quadrant.common_blind_spots);

  // ─── Page 4: Quadrant grid (new in v6) ─────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'The charisma quadrants');
  h1(doc, 'Where you sit in the model');
  bodyText(doc, `The model maps charisma onto two dimensions: Confidence on the horizontal axis, Social Skills on the vertical. The four quadrants describe how the two combine in practice. Your scores place you in the highlighted quadrant. The other three are not failure modes. They are different working configurations, each with its own strengths and its own development edges.`);
  doc.moveDown(1.2);
  // Grid: centred on the page (page width 595, content width 451, center = 297.5)
  // Use 320pt size, leaving space for axis labels on the left and below.
  drawQuadrantGrid(doc, scoring, 297.5, doc.y, 320);

  // ─── Page 5: The two dimensions ────────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Your two dimensions');
  h1(doc, 'Confidence and Social Skills');
  bodyText(doc, `Your Confidence score is ${scoring.confidence}, in the ${prettyBand(scoring.confidenceBand).toLowerCase()} band. Your Social Skills score is ${scoring.socialSkills}, in the ${prettyBand(scoring.socialSkillsBand).toLowerCase()} band. The two together produce your quadrant placement, and the way you read them as you develop matters more than the headline numbers.`);

  h2(doc, 'On the Confidence dimension');
  bodyText(doc, confidenceBandSummary(scoring.confidenceBand));

  h2(doc, 'On the Social Skills dimension');
  bodyText(doc, socialSkillsBandSummary(scoring.socialSkillsBand));

  // ─── Page 6: Subscale profile (new in v6) ──────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Your full profile');
  h1(doc, 'All ten subscales at a glance');
  bodyText(doc, `The two dimensions are built from ten subscales: five for Confidence, five for Social Skills. The bars below show how each of yours is scoring. The two amber bars are your priority subscales, identified by the scoring engine as the most useful focus for development now. The rest of this report builds on this picture.`);
  doc.moveDown(0.6);
  drawSubscaleBars(doc, scoring, content, developmentCodes, 72, doc.y, 451);

  // ─── Page 7: Where you are right now (new in v6) ───────────────────────
  doc.addPage();
  eyebrow(doc, 'Your profile in plain words');
  h1(doc, 'Where you are right now');
  profileParagraphs.forEach(p => bodyText(doc, p));

  // ─── Page 8: The Authenticity Index ────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'The Authenticity Index');
  h1(doc, `Your Authenticity Index: ${scoring.authenticityIndex}`);
  doc.font(FONT_BODY_ITALIC).fontSize(13).fillColor(COLOURS.muted)
     .text(scoring.authenticityBand || '');
  doc.moveDown(0.8);

  const authBandKey = (scoring.authenticityBand || '').toLowerCase().replace(/\s+/g, '_');
  const authBand = content.authenticity_bands[authBandKey];
  if (authBand) {
    if (authBand.what_this_suggests) {
      h2(doc, 'What this suggests');
      bodyText(doc, authBand.what_this_suggests);
    }
    if (authBand.why_this_matters) {
      h2(doc, 'Why this matters');
      bodyText(doc, authBand.why_this_matters);
    }
    if (authBand.why_it_matters) {
      h2(doc, 'Why it matters');
      bodyText(doc, authBand.why_it_matters);
    }
    if (authBand.how_to_make_it_stronger) {
      h2(doc, 'How to make it stronger');
      // Strip the conditional B5 reference if it's the last sentence. The v5
      // text ends with "...if B5 has shown up as one of your priority subscales."
      // That sentence only lands if B5 is actually a priority, which for most
      // respondents it is not.
      let text = authBand.how_to_make_it_stronger;
      // The broadly_consistent and selectively_deployed bands end with a
      // sentence that only lands if B5 is a priority subscale. If it isn't,
      // strip that trailing sentence outright. The preceding sentence already
      // closes the paragraph cleanly.
      if (!developmentCodes.includes('B5')) {
        text = text.replace(/\s*The development pages[^.]*B5[^.]*\.\s*$/, '');
      }
      bodyText(doc, text);
    }
    if (authBand.how_to_use_it_even_better) {
      h2(doc, 'How to use it even better');
      bodyText(doc, authBand.how_to_use_it_even_better);
    }
    if (authBand.the_skill_to_build) {
      h2(doc, 'The skill to build');
      bodyText(doc, authBand.the_skill_to_build);
    }
    if (authBand.what_to_try_next && authBand.what_to_try_next.length) {
      h2(doc, 'What to try next');
      authBand.what_to_try_next.forEach(b => bulletPoint(doc, b));
    }
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
  bodyText(doc, `Two subscales have been identified as the most useful focus for your development now. These are the areas where some deliberate practice over the next four to six weeks will produce visible change. Pick one to start with. Work on it. Then come back to the other.`);
  bodyText(doc, `The framing the rest of this report uses is important. A low score on a subscale does not mean you are deficient as a person. It means that particular skill is not yet doing its job reliably. The work is incremental, visible, and entirely doable in the real meetings and conversations of your working week.`);

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

    h2(doc, 'What may be happening');
    bodyText(doc, varyOpener(block.what_may_be_happening, code, 'development'));
    h2(doc, 'Why this matters');
    bodyText(doc, block.why_this_matters);
    h2(doc, 'The skill to build');
    bodyText(doc, block.the_skill_to_build);
    h2(doc, 'What to try next');
    block.what_to_try_next.forEach(b => bulletPoint(doc, b));
  });

  // ─── Methods worth knowing ─────────────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Methods worth knowing');
  h1(doc, 'Four methods for your profile');
  bodyText(doc, `The Pro Practice Content Library contains seventeen named methods. Three of the four below have been chosen for their direct relevance to your development areas. The fourth is included to broaden the toolkit. Each is set out in fuller detail in the companion book, Open-Source Charisma.`);
  doc.moveDown(0.4);

  chosenMethods.forEach((m, idx) => {
    renderMethodCard(doc, m, idx === chosenMethods.length - 1);
  });

  // ─── A four-week plan ──────────────────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Your four-week plan');
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

  // ─── Final page: Closing ──────────────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'A final note');
  const backManifesto = (content.manifesto && content.manifesto.back) || null;
  h1(doc, backManifesto ? backManifesto.title : 'The point of all this');
  if (backManifesto) {
    backManifesto.paragraphs.forEach(p => bodyText(doc, p));
  } else {
    bodyText(doc, `The point is not to become a different person. It is to make the best of who you already are more consistent, more visible, and more useful to the people around you.`);
  }

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
  const acts = (primarySub && primarySub.development && primarySub.development.what_to_try_next) || [];

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
    plan.push({
      title: `Week 3: use the ${cleanName}`,
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
