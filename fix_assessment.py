#!/usr/bin/env python3
# Surgical fix for assessment.html.
# Replaces exactly two blocks and leaves everything else untouched:
#   1. The DIMENSION_INTROS object (adds Personal Impact, renumbers to "of 3").
#   2. The renderQuestions function (adds the Personal Impact render section
#      via a shared renderItem helper).
# Self-verifies: each old block must appear exactly once before replacing,
# and all five key functions must survive. Refuses to write if anything is off.

import sys

PATH = "assessment.html"

with open(PATH, "r", encoding="utf-8") as f:
    src = f.read()

orig_len = len(src)

# ── Block 1: DIMENSION_INTROS ──────────────────────────────────────────────
# Anchor on the two existing dimension entries, which are unique in the file.
OLD_INTROS = '''  Confidence: {
    eyebrow: "Part A of 2",
    title: "Confidence",
    subtitle: "How you carry yourself. Twenty-five questions across five subscales: self-esteem, resilience, assertiveness, growth, and situational self-awareness."
  },
  "Social Skills": {
    eyebrow: "Part B of 2",
    title: "Social Skills",
    subtitle: "How you behave with other people. Twenty-five questions across five subscales: empathy, warmth, conversation, emotional control, and consistency across audiences."
  }
};'''

NEW_INTROS = '''  Confidence: {
    eyebrow: "Part 1 of 3",
    title: "Confidence",
    subtitle: "How you carry yourself. Twenty-five questions across five subscales: self-esteem, resilience, assertiveness, growth, and situational self-awareness."
  },
  "Social Skills": {
    eyebrow: "Part 2 of 3",
    title: "Social Skills",
    subtitle: "How you behave with other people. Twenty-five questions across five subscales: empathy, warmth, conversation, emotional control, and consistency across audiences."
  },
  "Personal Impact": {
    eyebrow: "Part 3 of 3",
    title: "Personal Impact",
    subtitle: "Whether your message lands. Ten questions across two areas: how you build a message, and how you carry it."
  }
};'''

# ── Block 2: renderQuestions ───────────────────────────────────────────────
OLD_RENDER = '''function renderQuestions() {
  const list = document.getElementById('questions-list');
  list.innerHTML = '';

  // Group items by subscale, in the order they appear in the JSON
  // (questionnaire.json subscales is already ordered A1..A5, B1..B5)
  const subscaleCodes = Object.keys(QUESTIONNAIRE.subscales);
  let currentDimension = null;

  subscaleCodes.forEach(code => {
    const sub = QUESTIONNAIRE.subscales[code];

    // Dimension banner \u2014 once per dimension change
    if (sub.dimension !== currentDimension) {
      currentDimension = sub.dimension;
      const intro = DIMENSION_INTROS[currentDimension];
      const banner = document.createElement('div');
      banner.className = 'dimension-banner';
      banner.innerHTML = `
        <div class="dimension-eyebrow">${intro.eyebrow}</div>
        <h2>${intro.title}</h2>
        <p>${intro.subtitle}</p>
      `;
      list.appendChild(banner);
    }

    // Subscale heading
    const heading = document.createElement('div');
    heading.className = 'subscale-heading';
    heading.innerHTML = `
      <div class="subscale-eyebrow">Subscale ${code}</div>
      <h3>${sub.name}</h3>
    `;
    list.appendChild(heading);

    // The five items for this subscale
    sub.items.forEach(n => {
      const item = QUESTIONNAIRE.items.find(i => i.n === n);
      const q = document.createElement('div');
      q.className = 'question';
      q.id = 'q-' + item.n;
      q.innerHTML = `
        <div class="question-number">Question ${item.n} of ${QUESTIONNAIRE.items.length}</div>
        <div class="question-text">${item.text}</div>
        <div class="likert">
          ${QUESTIONNAIRE.likert.map(l => `
            <label>
              <input type="radio" name="q${item.n}" value="${l.value}" onchange="recordAnswer(${item.n}, ${l.value})">
              <span class="likert-text">
                <span class="likert-value">${l.value}</span>
                ${l.label}
              </span>
            </label>
          `).join('')}
        </div>
      `;
      list.appendChild(q);
    });
  });

  updateProgress();
}'''

NEW_RENDER = '''function renderQuestions() {
  const list = document.getElementById('questions-list');
  list.innerHTML = '';

  // Helper: render one question item into the list. Used by both the
  // subscale loop and the Personal Impact section so the markup matches.
  function renderItem(item) {
    const q = document.createElement('div');
    q.className = 'question';
    q.id = 'q-' + item.n;
    q.innerHTML = `
      <div class="question-number">Question ${item.n} of ${QUESTIONNAIRE.items.length}</div>
      <div class="question-text">${item.text}</div>
      <div class="likert">
        ${QUESTIONNAIRE.likert.map(l => `
          <label>
            <input type="radio" name="q${item.n}" value="${l.value}" onchange="recordAnswer(${item.n}, ${l.value})">
            <span class="likert-text">
              <span class="likert-value">${l.value}</span>
              ${l.label}
            </span>
          </label>
        `).join('')}
      </div>
    `;
    list.appendChild(q);
  }

  // Group items by subscale, in the order they appear in the JSON
  // (questionnaire.json subscales is already ordered A1..A5, B1..B5)
  const subscaleCodes = Object.keys(QUESTIONNAIRE.subscales);
  let currentDimension = null;

  subscaleCodes.forEach(code => {
    const sub = QUESTIONNAIRE.subscales[code];

    // Dimension banner \u2014 once per dimension change
    if (sub.dimension !== currentDimension) {
      currentDimension = sub.dimension;
      const intro = DIMENSION_INTROS[currentDimension];
      const banner = document.createElement('div');
      banner.className = 'dimension-banner';
      banner.innerHTML = `
        <div class="dimension-eyebrow">${intro.eyebrow}</div>
        <h2>${intro.title}</h2>
        <p>${intro.subtitle}</p>
      `;
      list.appendChild(banner);
    }

    // Subscale heading
    const heading = document.createElement('div');
    heading.className = 'subscale-heading';
    heading.innerHTML = `
      <div class="subscale-eyebrow">Subscale ${code}</div>
      <h3>${sub.name}</h3>
    `;
    list.appendChild(heading);

    // The five items for this subscale
    sub.items.forEach(n => {
      const item = QUESTIONNAIRE.items.find(i => i.n === n);
      renderItem(item);
    });
  });

  // Personal Impact section. These items are not part of any subscale; they
  // form their own stream with two components. Rendered after the subscales,
  // with a dimension banner and one subscale-style heading per component.
  if (QUESTIONNAIRE.personalImpact && QUESTIONNAIRE.personalImpact.components) {
    const piIntro = DIMENSION_INTROS['Personal Impact'];
    if (piIntro) {
      const banner = document.createElement('div');
      banner.className = 'dimension-banner';
      banner.innerHTML = `
        <div class="dimension-eyebrow">${piIntro.eyebrow}</div>
        <h2>${piIntro.title}</h2>
        <p>${piIntro.subtitle}</p>
      `;
      list.appendChild(banner);
    }

    const components = QUESTIONNAIRE.personalImpact.components;
    Object.keys(components).forEach(key => {
      const comp = components[key];
      const heading = document.createElement('div');
      heading.className = 'subscale-heading';
      heading.innerHTML = `
        <div class="subscale-eyebrow">Personal Impact</div>
        <h3>${comp.name}</h3>
      `;
      list.appendChild(heading);

      comp.items.forEach(n => {
        const item = QUESTIONNAIRE.items.find(i => i.n === n);
        renderItem(item);
      });
    });
  }

  updateProgress();
}'''

def must_appear_once(haystack, needle, label):
    c = haystack.count(needle)
    if c != 1:
        print(f"ABORT: expected '{label}' to appear exactly once, found {c}.")
        print("No changes written. The file may not be the expected v9 version.")
        sys.exit(1)

must_appear_once(src, OLD_INTROS, "DIMENSION_INTROS block")
must_appear_once(src, OLD_RENDER, "renderQuestions function")

out = src.replace(OLD_INTROS, NEW_INTROS).replace(OLD_RENDER, NEW_RENDER)

# Verify all five key functions survive.
required = [
    "function renderQuestions(",
    "function recordAnswer(",
    "function updateProgress(",
    "function goToScreen(",
    "function generateReport(",
]
missing = [r for r in required if r not in out]
if missing:
    print("ABORT: these functions are missing after the edit:", missing)
    print("No changes written.")
    sys.exit(1)

# Verify the new pieces are present.
checks = [
    ("Part 3 of 3", "Personal Impact intro"),
    ("function renderItem", "renderItem helper"),
    ("QUESTIONNAIRE.personalImpact", "Personal Impact render section"),
]
for needle, label in checks:
    if needle not in out:
        print(f"ABORT: expected new content '{label}' not found after edit.")
        sys.exit(1)

with open(PATH, "w", encoding="utf-8") as f:
    f.write(out)

print("OK. Both blocks replaced.")
print(f"File length: {orig_len} chars -> {len(out)} chars (grew by {len(out)-orig_len}).")
print("All five functions present: renderQuestions, recordAnswer, updateProgress, goToScreen, generateReport.")
print("Personal Impact render section and renderItem helper present.")
