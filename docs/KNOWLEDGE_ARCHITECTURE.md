# Knowledge Architecture

Verdent Study separates durable source material, reviewed knowledge, AI candidates, and derived signals.

## Layers

| Layer | Role | Trusted as evidence |
|---|---|---:|
| Personal input | Notes and judgments written by the owner | Yes |
| External sources | Articles, reports, transcripts, and clips | Yes |
| Published products | Reviewed output created by the owner | Yes |
| Knowledge points | Reusable concepts that cite source material | No |
| Framework cards | Reviewed methods and checklists that cite source material | No |
| Candidates | AI-generated knowledge points, frameworks, and relations awaiting review | No |
| Weak signals | Co-occurrence and tag overlap calculated at runtime | No |

## Review-first rule

AI output never becomes reviewed knowledge automatically. AI may create candidates, explain why they are useful, and attach evidence. A person accepts, edits, or rejects each candidate.

## Relationship rule

Formal relations carry a type, reason, evidence, confidence, source references, and source hashes. Weak signals remain visually subordinate and can be hidden. If a source changes, dependent relations move to `needs_review`.

## Retrieval rule

Search and the graph orient the user. Source material provides factual detail. Framework cards support low-pressure resurfacing but never replace their sources.