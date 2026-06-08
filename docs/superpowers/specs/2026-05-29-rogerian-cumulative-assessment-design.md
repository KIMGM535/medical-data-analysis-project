# Rogerian Cumulative Assessment Design

## Goal
Build the chat program around person-centered counseling first, while using the AIHub 71806 label structure in the background to update a gradual, non-diagnostic state hypothesis as the conversation deepens.

## Conversation Principles
- The visible reply starts with reflection and empathic understanding, not classification.
- The assistant avoids early diagnosis language and treats condition labels as tentative hypotheses.
- The assistant asks one open, experience-near question per turn.
- The assistant repairs misunderstandings before continuing analysis.
- Clear direct self-harm intent or method-seeking still triggers safety support, but the wording begins with presence and concern.

## Cumulative State Model
Each turn produces a `sessionProfile` from all user messages:
- `phase`: `opening`, `exploring`, or `integrating`
- `signals`: symptoms, duration, functional impact, risks, protective factors
- `aihubLabels`: four AIHub-style 0-3 scores for major symptoms, risk factors, improvement factors, and intervention factors
- `hypotheses`: tentative condition hypotheses for anxiety, depression, addiction/impulse, grief, and general stress

The assistant should not present hypotheses prominently during `opening`. In `exploring`, it should ask for missing clinical context such as duration, intensity, and effect on daily functioning. In `integrating`, it may summarize a tentative pattern using language like “현재까지의 가설” and “확정 진단은 아니지만”.

## Safety Boundary
Safety detection remains separate from diagnosis. The system distinguishes:
- Direct self-harm intent or self-harm method questions: urgent safety response
- Bereavement by suicide: grief response, not automatic self-harm response
- Hostile or rejecting user feedback: relationship repair response

## Files
- `src/sessionState.js`: cumulative profile and AIHub label scoring
- `src/counselor.js`: orchestrates safety, repair, Rogers response, and state output
- `test/sessionState.test.js`: cumulative model tests
- `test/counselor.test.js`: conversation behavior tests

