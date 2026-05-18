// /api/generate-test-report.js
//
// Test build only. Receives a scoring payload, generates a placeholder PDF
// that proves the full server-side rendering path works. No Stripe, no
// auth. In production this is replaced by /api/generate-report.js which
// verifies a Stripe session before rendering the real report.

const PDFDocument = require('pdfkit');

module.exports = (req, res) => {
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
  const { email, scoring } = body || {};
  if (!scoring || typeof scoring.confidence !== 'number') {
    res.status(400).json({ error: 'Missing scoring payload' });
    return;
  }

  // Quadrant labels & taglines, duplicated here so the function is
  // self-contained. In production these come from the same JSON the
  // front end reads, served from /assets or bundled into the function.
  const QUADRANTS = {
    incidentally_invisible:    { label: 'The Incidentally Invisible',    tagline: 'Talented but overlooked. Ability is not the gap. Visibility is.' },
    unknowingly_influential:   { label: 'The Unknowingly Influential',   tagline: 'Connects naturally. Undersells consistently. Influence outruns reputation.' },
    occasionally_overconfident:{ label: 'The Occasionally Overconfident', tagline: 'Commands attention. Loses the room when warmth or restraint is the test.' },
    courteously_charismatic:   { label: 'The Courteously Charismatic',   tagline: 'Competent and connected. The work is consistency. Closing the gap between best and average.' }
  };
  const SUBSCALE_NAMES = {
    A1: 'Self-Esteem & Self-Worth',           A2: 'Resilience & Composure',
    A3: 'Assertiveness & Accountability',     A4: 'Growth & Adaptability',
    A5: 'Situational Self-Awareness',         B1: 'Empathy & Listening',
    B2: 'Warmth & Social Courtesy',           B3: 'Conversational Skills',
    B4: 'Emotional Control & Humility',       B5: 'Authentic vs Performed Social Behaviour'
  };

  // Colours from the report design
  const NAVY = '#1F3A5F';
  const GOLD = '#B08D57';
  const MUTED = '#555555';
  const INK = '#1A1A1A';

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 72, bottom: 72, left: 72, right: 72 },
    info: {
      Title: 'OSCI Pro Test Report',
      Author: 'Jim Harvey | The Message Business',
      Subject: 'Test build — placeholder report'
    }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="OSCI_Pro_Test_Report.pdf"');
  doc.pipe(res);

  // ─── Cover ──────────────────────────────────────────────────────────────
  doc.moveDown(4);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(GOLD)
     .text('OSCI PRO — TEST BUILD', { characterSpacing: 2 });
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(28).fillColor(NAVY)
     .text('Your Charisma Quadrant');
  doc.moveDown(0.4);
  doc.lineWidth(2).strokeColor(GOLD).moveTo(72, doc.y).lineTo(220, doc.y).stroke();
  doc.moveDown(0.8);
  doc.font('Times-Italic').fontSize(14).fillColor(INK)
     .text('A placeholder report from the test build. Real practice content not yet wired up.');
  doc.moveDown(6);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED)
     .text('Generated for: ' + (email || 'anonymous test user'))
     .text('Generated on: ' + new Date().toISOString().slice(0, 10))
     .text('Scoring version: ' + (scoring.version || 'unknown'));

  // ─── Page 2: Quadrant and scores ────────────────────────────────────────
  doc.addPage();
  const q = QUADRANTS[scoring.quadrant] || { label: scoring.quadrant, tagline: '' };

  doc.font('Helvetica-Bold').fontSize(10).fillColor(GOLD)
     .text('YOUR QUADRANT', { characterSpacing: 2 });
  doc.moveDown(0.2);
  doc.font('Helvetica-Bold').fontSize(22).fillColor(NAVY).text(q.label);
  doc.moveDown(0.3);
  doc.font('Times-Italic').fontSize(13).fillColor(MUTED).text(q.tagline);
  doc.moveDown(0.6);
  doc.lineWidth(1.5).strokeColor(GOLD).moveTo(72, doc.y).lineTo(523, doc.y).stroke();
  doc.moveDown(1.2);

  // Three score tiles, drawn manually
  const tileY = doc.y;
  const tileW = 145;
  const gap = 8;
  const tiles = [
    { label: 'CONFIDENCE',         value: scoring.confidence,        band: scoring.confidenceBand },
    { label: 'SOCIAL SKILLS',      value: scoring.socialSkills,      band: scoring.socialSkillsBand },
    { label: 'AUTHENTICITY INDEX', value: scoring.authenticityIndex, band: scoring.authenticityBand }
  ];
  tiles.forEach((t, idx) => {
    const x = 72 + idx * (tileW + gap);
    doc.rect(x, tileY, tileW, 90).lineWidth(0.5).strokeColor('#D9D9D9').stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
       .text(t.label, x, tileY + 12, { width: tileW, align: 'center', characterSpacing: 1.5 });
    doc.font('Helvetica-Bold').fontSize(32).fillColor(NAVY)
       .text(String(t.value), x, tileY + 28, { width: tileW, align: 'center' });
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED)
       .text(prettyBand(t.band), x, tileY + 68, { width: tileW, align: 'center' });
  });
  doc.y = tileY + 110;

  // ─── Subscale table ─────────────────────────────────────────────────────
  doc.moveDown(1);
  doc.x = 72;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY).text('Subscale breakdown');
  doc.moveDown(0.5);

  // Table header
  const colX = [72, 320, 410, 470];
  const headerY = doc.y;
  doc.rect(72, headerY, 451, 22).fillColor('#F2EEE8').fill();
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY);
  doc.text('Subscale', colX[0] + 8, headerY + 7);
  doc.text('Score',     colX[1] + 8, headerY + 7);
  doc.text('Band',      colX[2] + 8, headerY + 7);
  doc.text('Priority',  colX[3] + 8, headerY + 7);
  doc.y = headerY + 22;

  // Rows
  const codes = ['A1','A2','A3','A4','A5','B1','B2','B3','B4','B5'];
  codes.forEach(code => {
    const isPriority = (scoring.priorityAreas || []).includes(code);
    const rowY = doc.y;
    doc.rect(72, rowY, 451, 22).lineWidth(0.3).strokeColor('#E5E5E5').stroke();
    doc.font('Helvetica').fontSize(10).fillColor(INK);
    doc.text(code + '  ' + SUBSCALE_NAMES[code], colX[0] + 8, rowY + 7, { width: 240 });
    doc.font('Helvetica-Bold').fillColor(NAVY)
       .text(String(scoring.subscaleScores[code]), colX[1] + 8, rowY + 7);
    doc.font('Helvetica-Oblique').fillColor(MUTED)
       .text(prettyBand((scoring.subscaleBands || {})[code]), colX[2] + 8, rowY + 7);
    if (isPriority) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(GOLD)
         .text('PRIORITY', colX[3] + 8, rowY + 8);
    }
    doc.y = rowY + 22;
  });

  // ─── Page 3: Test build note ────────────────────────────────────────────
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(10).fillColor(GOLD)
     .text('TEST BUILD NOTE', { characterSpacing: 2 });
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY)
     .text('This is a placeholder report.');
  doc.moveDown(0.4);
  doc.lineWidth(1.5).strokeColor(GOLD).moveTo(72, doc.y).lineTo(220, doc.y).stroke();
  doc.moveDown(1);
  doc.font('Times-Roman').fontSize(12).fillColor(INK).text(
    'In production, this report will run to twelve to eighteen pages and will include band-calibrated practice content for your two priority subscales, summaries of the supporting subscales, three checks for any difficult conversation, and references to the seventeen named methods from the Practice Content Library.',
    { align: 'justify', lineGap: 4 }
  );
  doc.moveDown(0.5);
  doc.text(
    'The purpose of this test build is to prove the technical pipeline end to end: questionnaire delivery, client-side scoring, server-side scoring (running the same logic on the same payload), PDF generation under load, and download flow on desktop and mobile. The numbers above are real. The narrative around them is not yet wired in.',
    { align: 'justify', lineGap: 4 }
  );
  doc.moveDown(1.5);

  // Quick technical confirmation block
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Technical confirmation');
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor(INK);
  doc.text('Scoring version: ' + (scoring.version || 'unknown'));
  doc.text('Quadrant code: ' + scoring.quadrant);
  doc.text('Priority subscales: ' + (scoring.priorityAreas || []).join(', '));
  doc.text('Authenticity Index: ' + scoring.authenticityIndex + ' (' + (scoring.authenticityBand || 'unknown') + ')');
  doc.text('Generated: ' + new Date().toISOString());

  doc.end();
};

function prettyBand(b) {
  if (!b) return '';
  return b.charAt(0).toUpperCase() + b.slice(1);
}
