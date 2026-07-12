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

The graph has three relationship layers:

- Weak signals are derived locally from co-occurrence and remain visually subordinate.
- AI inferred relations are generated after a source is created or updated. They appear immediately with confidence styling and can be promoted or rejected.
- Formal relations carry a type, reason, evidence, confidence, source references, and source hashes.

Only a high-confidence `derived_from` inference may become formal automatically. Other inferred relations remain editable suggestions. Rejected suggestions create feedback patterns that reduce similar future recommendations. If a source changes, dependent formal relations move to `needs_review`.

To protect the hosted free tier, background relation analysis is serialized and capped at eight AI analysis requests per browser per day. Pending historical documents remain queued for a later day instead of creating a burst of serverless requests.

## Retrieval rule

Search and the graph orient the user. Source material provides factual detail. Framework cards support low-pressure resurfacing but never replace their sources.