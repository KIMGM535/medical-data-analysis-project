# Live OpenAI Evaluation Report

Updated: 2026-06-08

## Purpose

This report records the first live validation pass that used the configured OpenAI API key and the local deployable AIHub RAG index. It does not include API keys, raw AIHub transcripts, raw labels, or private file paths beyond project-relative references.

## Scope

- Model path: OpenAI Responses API through `src/llm.js`
- Default model: `gpt-4.1-mini`
- RAG mode: deployable summary-only index
- Evaluation command: `node src/runLiveOpenAiEvaluation.js`
- Budget cap: `$5.00`

## Latest Result

- Result: pass
- Personas: 12
- Turns: 26
- Failed turns: 0
- OpenAI calls: 15
- Estimated cost: `$0.014950 / $5.00`
- Stop reason: completed

## Covered Situations

- Anxiety and sleep difficulty over several turns
- Short user answers that rely on prior context
- Bereavement after a friend's suicide
- User asking what the assistant's question means
- User requesting listening instead of analysis or advice
- Hostile rupture after a missed response
- Sexual assault disclosure, self-blame, and rejection of canned reassurance
- Passive death wish and named protective contact
- Explicit suicide risk
- Self-harm method refusal
- Current dating violence risk
- Addiction relapse shame
- Manic-like activation with reduced sleep and overspending

## Fixes From Live Testing

- Added `src/liveOpenAiEvaluation.js` and `src/runLiveOpenAiEvaluation.js` for repeatable live OpenAI validation with a cost budget.
- Added OpenAI usage tracking to `src/llm.js` without exposing API keys.
- Adjusted high-sensitivity non-urgent turns to prefer deterministic safety/counseling responses over LLM output:
  - sexual assault disclosure and self-blame
  - passive death wish and protective-contact follow-up
  - manic-like activation and medical-help refusal
- Improved question classification for safety-support prompts without an explicit question mark.
- Fixed the live evaluator so explicit non-diagnostic boundary wording such as "확정 진단은 아니지만" is not treated as a diagnostic violation.

## Remaining Watch Items

- Some ordinary LLM responses are acceptable but still somewhat formal. Continue testing with real users and collect examples where the response feels stiff, repetitive, or too question-heavy.
- The live evaluator checks core safety and style risks, but it is not a substitute for expert clinical review.
- Continue keeping `.env`, AIHub raw data, and private RAG files out of GitHub.
