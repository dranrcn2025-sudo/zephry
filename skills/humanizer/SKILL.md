---
name: humanizer
description: Remove common signs of AI-generated writing and rewrite text so it sounds more natural, human, and voiceful. Use when editing or reviewing prose that feels too polished, generic, abstract, corporate, list-heavy, em-dash-happy, or obviously AI-written; especially for rewrites that must preserve meaning while reducing AI tells.
---

# Humanizer

When asked to humanize text, prioritize **meaning preservation + stronger voice** over surface-level synonym swaps.

## Core job

Do four things:
1. Identify obvious AI-writing patterns.
2. Rewrite the text in cleaner, more human language.
3. Preserve the original meaning, facts, and intent.
4. Add a real voice when appropriate instead of producing sterile “clean” prose.

## Common AI tells to remove

Watch for these patterns and fix them when they appear:

- Inflated importance or fake grandness
  - e.g. “pivotal,” “crucial,” “testament,” “underscores,” “broader landscape”
- Promotional or brochure language
  - e.g. “vibrant,” “renowned,” “stunning,” “rich cultural heritage”
- Fake depth via dangling `-ing` phrases
  - e.g. “highlighting…,” “reflecting…,” “underscoring…”
- Vague attributions / weasel phrasing
  - e.g. “experts say,” “observers note,” “some critics argue”
- Overuse of AI-favorite words
  - e.g. “delve,” “foster,” “showcase,” “valuable,” “intricate,” “landscape”
- Em dash overuse
- Rule-of-three padding and over-structured sentences
- Abstract summary language instead of concrete detail
- Mechanical transitions
  - e.g. “additionally,” “moreover,” “furthermore”
- Soulless neutrality
  - technically clean but with no opinion, uncertainty, rhythm, or human presence

## Rewrite rules

- Prefer concrete facts over inflated framing.
- Prefer simple verbs over padded constructions.
- Prefer one clear point per sentence.
- Keep the original register unless the user asks to shift it.
- Do not introduce new facts.
- Do not make the writing “more human” by making it sloppy or inaccurate.
- Do not flatten distinctive voice if the source already has one.

## Add voice carefully

When the source text feels dead, add pulse without changing meaning:

- Vary sentence length.
- Allow mild opinion or uncertainty when the context supports it.
- Use first person only if it fits the piece.
- Let the writing sound like a person, not a press release.
- Keep humor, edge, or warmth subtle unless the user asks for more.

## Good output shapes

Depending on what the user wants, respond in one of these modes:

### 1) Direct rewrite
Use when the user just wants better text.

Output only the rewritten text unless they ask for commentary.

### 2) Annotated edit
Use when the user is learning or comparing.

Format:
- AI tells spotted:
- What changed:
- Rewritten version:

### 3) Light diagnostic
Use when the user asks “why does this feel AI?”

Keep it short. Point to 3-6 strongest tells, not every tiny one.

## Special caution

If the user’s own style is blunt, weird, messy, emotional, or strongly voiced, do **not** sand it down into generic “good writing.”
The goal is not bland polish. The goal is to remove machine smell while keeping the person.
