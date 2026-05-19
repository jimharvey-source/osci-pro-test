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

  // Lead with the manifesto (the through-line of the whole report).
  // Page 1 has carried the quadrant name and the headline. Page 2 picks
  // that up and frames what comes next.
  if (content.manifesto && content.manifesto.front) {
    content.manifesto.front.paragraphs.forEach(p => bodyText(doc, p));
  }

  bodyText(doc, `Your results place you in the ${quadrant.label.replace(/^The /, '')} quadrant. ${quadrant.opening_paragraph}`);

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
  bodyText(doc, `Your Confidence score is ${scoring.confidence}, in the ${prettyBand(scoring.confidenceBand).toLowerCase()} band. Your Social Skills score is ${scoring.socialSkills}, in the ${prettyBand(scoring.socialSkillsBand).toLowerCase()} band. The two together produce your quadrant placement, and the way you read them as you develop matters more than the headline numbers.`);

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
  bodyText(doc, `The Pro Practice Content Library contains seventeen named methods. Three of the four below have been chosen for their direct relevance to your development areas. The fourth is included to broaden the toolkit. Each is set out in fuller detail in the companion book, Open-Source Charisma.`);
  doc.moveDown(0.4);

  chosenMethods.forEach((m, idx) => {
    renderMethodCard(doc, m, idx === chosenMethods.length - 1);
  });

  // ─── Page 14: A four-week development plan ─────────────────────────────
  doc.addPage();
  eyebrow(doc, 'Your four-week plan');
  h1(doc, 'Where to start');
  bodyText(doc, `Most development plans fail because they are too long or too vague. Yours has four weeks, with one or two specific things to do in each. Small enough to actually run alongside your normal work.`);
  bodyText(doc, `Focus on your first priority subscale: ${content.subscales[developmentCodes[0]] ? content.subscales[developmentCodes[0]].name : 'your first priority'}. The plan below uses the activities from that subscale. After four weeks, come back to this report and decide whether to keep going or to move on to your second priority.`);

  const weeklyPlan = buildWeeklyPlan(content, developmentCodes, chosenMethods);
  weeklyPlan.forEach(week => {
    h3(doc, week.title);
    bodyText(doc, week.detail);
  });

  bodyText(doc, `Re-read the development pages at the end of week four. Notice what has changed in how you behave, and notice what the people around you have started doing differently. Both are evidence. The shift in your own behaviour is the first thing. The shift in theirs is the second, and the more important one.`);

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
  const backManifesto = (content.manifesto && content.manifesto.back) || null;
  h1(doc, backManifesto ? backManifesto.title : 'The point of all this');
  if (backManifesto) {
    backManifesto.paragraphs.forEach(p => bodyText(doc, p));
  } else {
    // Fallback if manifesto block missing
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
    plan.push({
      title: `Week 3: use the ${chosenMethods[0].name}`,
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
       .text(sub.next_level_up, { align: 'justify', lineGap: 3 });
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

// ── Method card renderer ───────────────────────────────────────────────────
// Renders a single method as a soft-cream card with the method name in navy.
// Pages flow normally; cards split across pages if necessary.

function renderMethodCard(doc, method, isLast) {
  // Estimate height needed for this card. If not enough space remains on
  // the current page, the card starts a new page. We measure by laying out
  // the text in a hidden pass.
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
  // Body
  doc.fillColor(COLOURS.ink).font(FONT_BODY).fontSize(10.5)
     .text(method.summary, x + padding, startY + padding + titleHeight + 4,
           { width: w - 2 * padding, lineGap: 3, align: 'justify' });
  doc.y = startY + cardHeight + (isLast ? 8 : 14);
  doc.x = 72;
}

