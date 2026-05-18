// /api/generate-report.js
//
// The real OSCI Pro PDF report generator.
//
// Input: a scoring payload (from assets/scoring.js) plus the respondent's
// email and optional name. Output: a 15-page personalised PDF assembled
// from the content library, with an AI-generated headline at the top.
//
// In production this is gated by Stripe Checkout session verification.
// For the 30-person test we are calling it directly from the assessment
// page (no payment in test mode).

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ── Anthropic API call ─────────────────────────────────────────────────────
async function generateHeadline(content, scoring, respondentName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fallbackHeadline(content, scoring);
  }

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
        model: 'claude-sonnet-4-5',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) {
      console.error('Anthropic API non-OK:', res.status);
      return fallbackHeadline(content, scoring);
    }
    const data = await res.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    const cleaned = text.trim().replace(/^["']|["']$/g, '');
    return cleaned || fallbackHeadline(content, scoring);
  } catch (e) {
    console.error('Anthropic API error:', e.message);
    return fallbackHeadline(content, scoring);
  }
}

function fallbackHeadline(content, scoring) {
  const quadrant = content.quadrants[scoring.quadrant];
  return quadrant.tagline;
}

// ── PDF rendering helpers ──────────────────────────────────────────────────
const COLOURS = {
  navy:   '#1F3A5F',
  gold:   '#B08D57',
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
     .text(text, { align: 'justify', lineGap: 3 });
  doc.moveDown(0.4);
}

function bulletPoint(doc, text) {
  const x = doc.x;
  doc.font(FONT_BODY).fontSize(11).fillColor(COLOURS.ink);
  doc.text('•  ' + text, x + 12, doc.y, { 
    align: 'justify', lineGap: 3, indent: 0,
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

// ── Quadrant background tile for the scores ────────────────────────────────
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
    doc.font(FONT_BODY_ITALIC).fontSize(9).fillColor(COLOURS.muted)
       .text(prettyBand(t.band) || '', tx, y + 60, { width: tileW, align: 'center' });
  });
}

function prettyBand(b) {
  if (!b) return '';
  return b.charAt(0).toUpperCase() + b.slice(1);
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

  // Generate the headline (with fallback)
  const headline = await generateHeadline(content, scoring, respondentName);

  // Identify the strengths and development areas
  const sortedSubscales = Object.entries(scoring.subscaleScores)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const strengthCodes = sortedSubscales.slice(0, 2).map(s => s[0]);
  const developmentCodes = scoring.priorityAreas;

  // Select methods relevant to the development areas
  const relevantMethods = [];
  const methodKeys = Object.keys(content.methods).filter(k => k.startsWith('M'));
  for (const k of methodKeys) {
    const m = content.methods[k];
    if (m.relevant_to && m.relevant_to.some(s => developmentCodes.includes(s))) {
      relevantMethods.push({ key: k, ...m });
    }
  }
  // Pick the most relevant 4 methods
  const chosenMethods = relevantMethods.slice(0, 4);

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

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="OSCI_Pro_Report.pdf"`);
  doc.pipe(res);

  renderReport(doc, content, scoring, headline, respondentName, strengthCodes, developmentCodes, chosenMethods);

  doc.end();
};

// ── The report itself ──────────────────────────────────────────────────────
function renderReport(doc, content, scoring, headline, respondentName, strengthCodes, developmentCodes, chosenMethods) {
  const quadrant = content.quadrants[scoring.quadrant];
  const totalPagesEstimate = 15;
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
  doc.moveDown(6);
  doc.font(FONT_HEAD).fontSize(10).fillColor(COLOURS.muted)
     .text(respondentName ? `Prepared for ${respondentName}` : 'Prepared for you');
  doc.text(today);

  // ─── Page 2: Opening summary ────────────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Opening summary');
  h1(doc, 'There is a lot here to build on');
  bodyText(doc, headline);
  bodyText(doc, `Your results place you in the ${quadrant.label.replace(/^The /, '')} quadrant. ${quadrant.opening_paragraph}`);
  bodyText(doc, `This report does three things. It names where your charisma is already working, so you can use those strengths more deliberately. It names two specific subscales where some focused practice will produce visible change. And it points at the methods, drawn from thirty years of working with senior people on this material, that fit your particular profile.`);
  bodyText(doc, `Below your scores, you will find the four sections that matter most: your key strengths, your key development areas, the methods worth knowing, and a four-week plan you can start on this week.`);

  doc.moveDown(0.5);
  drawScoreTiles(doc, scoring, 72, doc.y, 451);
  doc.y += 90;
  doc.x = 72;

  // ─── Pages 3-4: Your quadrant ──────────────────────────────────────────
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

  // ─── Page 5: The two dimensions ────────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Your two dimensions');
  h1(doc, 'Confidence and Social Skills');
  bodyText(doc, `Your Confidence score is ${scoring.confidence}, which sits in the ${prettyBand(scoring.confidenceBand).toLowerCase()} band. Your Social Skills score is ${scoring.socialSkills}, which sits in the ${prettyBand(scoring.socialSkillsBand).toLowerCase()} band. These two scores together are what produces your quadrant placement.`);

  bodyText(doc, `The three bands the Pro uses (Lower, Developing, Higher) are deliberately calibrated against ten validation cases drawn from coaching practice. The Developing band is where most paying users sit, and it is also where the work is most actionable. Close enough to the higher tier that the gap is genuinely closeable. Far enough from it that there is something to close.`);

  h2(doc, 'On the Confidence dimension');
  bodyText(doc, confidenceBandSummary(scoring.confidenceBand));

  h2(doc, 'On the Social Skills dimension');
  bodyText(doc, socialSkillsBandSummary(scoring.socialSkillsBand));

  // ─── Page 6: The Authenticity Index ────────────────────────────────────
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
      bodyText(doc, authBand.how_to_make_it_stronger);
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

  // ─── Pages 7-9: Your key strengths ─────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Your key strengths');
  h1(doc, 'What is already working');
  bodyText(doc, `Two subscales stand out as relative strengths in your profile. The Pro report leads with these because the most reliable way to develop is to build out from what is already working, not to start from scratch on what is not.`);

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
    bodyText(doc, block.what_this_suggests);
    h2(doc, 'Why it matters');
    bodyText(doc, block.why_it_matters);
    h2(doc, 'How to use it even better');
    bodyText(doc, block.how_to_use_it_even_better);
  });

  // ─── Pages 10-12: Your key development areas ───────────────────────────
  doc.addPage();
  eyebrow(doc, 'Your key development areas');
  h1(doc, 'Where to put your attention next');
  bodyText(doc, `Two subscales have been identified as the most useful focus for your development now. These are the areas where some deliberate practice over the next four to six weeks will produce visible change. Pick one to start with. Work on it. Then come back to the other.`);
  bodyText(doc, `The framing the rest of this report uses is important: a low score on a subscale does not mean you are deficient as a person. It means that particular module is not yet doing its job reliably. It needs writing, testing, or refining. The work is incremental, visible, and entirely doable in the real meetings and conversations of your working week.`);

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
    bodyText(doc, block.what_may_be_happening);
    h2(doc, 'Why this matters');
    bodyText(doc, block.why_this_matters);
    h2(doc, 'The skill to build');
    bodyText(doc, block.the_skill_to_build);
    h2(doc, 'What to try next');
    block.what_to_try_next.forEach(b => bulletPoint(doc, b));
  });

  // ─── Page 13: Methods worth knowing ────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Methods worth knowing');
  h1(doc, 'Four methods for your profile');
  bodyText(doc, `The OSCI Pro Practice Content Library contains seventeen named methods. The four below have been selected as the most directly relevant to the development areas above. Each is described in short here. Each is set out in fuller detail in the companion book, Open-Source Charisma.`);

  chosenMethods.forEach(m => {
    h3(doc, m.name);
    bodyText(doc, m.summary);
  });

  // ─── Page 14: A four-week development plan ─────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Your four-week plan');
  h1(doc, 'Where to start');
  bodyText(doc, `Most development plans fail because they are too long or too vague. Yours has three habits to focus on over the next four weeks. Specific. Small enough to actually do. Concrete enough that you and the people around you will notice the difference.`);

  const plan = buildFourWeekPlan(content, developmentCodes, chosenMethods);
  plan.forEach((item, idx) => {
    h3(doc, `Habit ${idx + 1}: ${item.title}`);
    bodyText(doc, item.detail);
  });

  bodyText(doc, `At the end of week four, come back to this report. Re-read the development pages. Notice what has changed and what has not. The pattern you build in the first four weeks will tell you whether to keep going on the same habit or to shift to the second priority subscale next.`);

  // ─── Pages 15-17: Goal-setting exercise ──────────────────────────────
  if (content.goal_setting) {
    renderGoalSettingIntro(doc, content.goal_setting);
    developmentCodes.forEach((code, idx) => {
      const sub = content.subscales[code];
      if (!sub) return;
      renderGoalSettingExercise(doc, content.goal_setting, code, sub, scoring.subscaleScores[code], idx + 1, developmentCodes.length);
    });
    renderGoalSettingClosing(doc, content.goal_setting);
  }

  // ─── Final page: Closing ──────────────────────────────────────────────────
  doc.addPage();
  eyebrow(doc, 'A final note');
  h1(doc, 'The point of all this');
  bodyText(doc, `The point is not to become a different person. It is to make the best of who you already are more consistent, more visible, and more useful to the people around you.`);
  bodyText(doc, `The model the Pro report rests on is straightforward. Charisma is not a fixed personality trait. It is a set of specific skills, each one improvable on its own, with practice that can be done in real working situations. The two priority subscales in this report are where to start. The methods at the back are the patterns to reach for. The four-week plan is small enough to actually run.`);
  bodyText(doc, `If you would value going further, the companion book, Open-Source Charisma, sets out the full model with stories, characters, and ten practical chapters of practice. For workshops, coaching, or licensed use of the Pro instrument in your own organisation, contact Jim at jim.harvey@themessagebusiness.com.`);

  doc.moveDown(3);
  doc.lineWidth(0.5).strokeColor(COLOURS.gold)
     .moveTo(72, doc.y).lineTo(523, doc.y).stroke();
  doc.moveDown(0.6);
  doc.font(FONT_HEAD).fontSize(9).fillColor(COLOURS.muted)
     .text(`OSCI Pro Report  ·  Generated ${today}  ·  Scoring version ${scoring.version || 'unknown'}`, { align: 'center', width: 451 });
  doc.moveDown(0.2);
  doc.text('© 2026 James G Harvey / Allcow Trading Co Ltd  ·  opensourcecharisma.com', { align: 'center', width: 451 });
}

function confidenceBandSummary(band) {
  if (band === 'higher') {
    return "You sit in the higher band on Confidence. The pattern this points to is a settled internal baseline, composure under pressure, willingness to say the difficult thing, and the capacity to update your position when shown evidence. The work at this band is mostly about consistency and calibration: keeping the strength visible across audiences and across the pressure points where it can otherwise slip.";
  }
  if (band === 'developing') {
    return "You sit in the developing band on Confidence. This is the band where most paying users sit, and it is the band where the work is most actionable. You have the building blocks. The development question is which specific subscale to focus on first. The priority subscales identified later in this report point at where the work will most repay your attention now.";
  }
  return "You sit in the lower band on Confidence. The pattern this often shows is that the building blocks are present but uneven: a settled baseline that has not fully consolidated, composure that is reliable in some settings and not others, willingness to speak directly that is conditional on stakes. The work is to build the underlying skills one at a time, with deliberate practice in the real meetings and conversations of your working week.";
}

function socialSkillsBandSummary(band) {
  if (band === 'higher') {
    return "You sit in the higher band on Social Skills. The pattern this points to is consistent quality of listening, warmth that does not depend on what the other person can do for you, conversational craft that moves rather than just exchanges, and emotional control that lets the room think for itself. The work at this band is mostly about deploying these strengths where they matter most.";
  }
  if (band === 'developing') {
    return "You sit in the developing band on Social Skills. The components are in place. What the development pages will probably point at is where one or two specific behaviours are still uneven: how you listen under pressure, how warmth shows up with peripheral contacts, how you handle disagreement in front of others. Small adjustments at this band produce visible reputation effects.";
  }
  return "You sit in the lower band on Social Skills. The pattern this often shows is that the conventional social moves are working in some contexts but not transferring reliably to others. The priority subscales identified later in this report will name which specific behaviours are most worth your attention now. None of them require a personality change. All of them are practices you can run in the real meetings of the next four weeks.";
}

function buildFourWeekPlan(content, developmentCodes, chosenMethods) {
  // Three concrete habits drawn from the two development subscales' first activities
  const plan = [];
  if (developmentCodes[0]) {
    const sub = content.subscales[developmentCodes[0]];
    if (sub && sub.development && sub.development.what_to_try_next[0]) {
      plan.push({
        title: `${sub.name}`,
        detail: sub.development.what_to_try_next[0]
      });
    }
  }
  if (developmentCodes[1]) {
    const sub = content.subscales[developmentCodes[1]];
    if (sub && sub.development && sub.development.what_to_try_next[0]) {
      plan.push({
        title: `${sub.name}`,
        detail: sub.development.what_to_try_next[0]
      });
    }
  }
  if (chosenMethods[0]) {
    plan.push({
      title: `Practise the ${chosenMethods[0].name}`,
      detail: `In the next four weeks, find three real situations where you can use this method. The first time will be awkward. The second time will be less awkward. By the third, the practice will be building muscle. ${chosenMethods[0].summary.split('. ')[0]}.`
    });
  }
  return plan;
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
  doc.font(FONT_BODY_ITALIC).fontSize(12).fillColor(COLOURS.muted)
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
     .text(gs.closing_paragraph, { align: 'justify', lineGap: 3 });
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

