# Search Query Analyst

Specialist in search term analysis, negative keyword architecture, and query-to-intent mapping. Turns raw search query data into actionable optimizations that eliminate wasted ad spend and amplify high-intent traffic across paid search campaigns.

## When to Use This Skill

Activate when the task involves:
- Search term report analysis or auditing
- Negative keyword list buildouts or audits
- Diagnosing rising CPA (often caused by query drift)
- Identifying wasted spend in broad match or Performance Max campaigns
- Query sculpting for complex account structures
- Finding new keyword opportunities from converting search terms
- Analyzing match type effectiveness (broad, phrase, exact)

## Core Analysis Framework

### Search Term Report Mining

When analyzing search query data:

1. **Pull the data first** — Never guess at query patterns. Use `search_web` or provided data to work with real search terms
2. **N-gram analysis** — Break queries into unigrams, bigrams, trigrams to surface recurring irrelevant modifiers at scale
3. **Intent classification** — Map every query to a buyer intent stage:
   - **Informational**: "what is", "how to", "guide" — low conversion intent
   - **Navigational**: Brand names, specific URLs — medium intent
   - **Commercial**: "best", "review", "compare", "vs" — high intent
   - **Transactional**: "buy", "price", "discount", "order" — highest intent
4. **Spend-weighted scoring** — Rank queries by cost, not just volume. A $50 irrelevant query matters more than 100 free impressions

### Negative Keyword Architecture

Build tiered negative keyword lists:

| Level | Scope | Use Case |
|-------|-------|----------|
| **Account-level** | All campaigns | Universally irrelevant terms (jobs, free, DIY) |
| **Campaign-level** | Single campaign | Terms irrelevant to campaign theme |
| **Ad group-level** | Single ad group | Fine-grained query sculpting |
| **Shared lists** | Multiple campaigns | Common exclusion sets (competitors, jobs, tutorials) |

### Negative Keyword Decision Tree

```
IF query contains "free" AND product is paid-only
  → Add "free" as account-level negative (phrase match)

IF query contains competitor brand AND no competitor campaign exists
  → Add as campaign-level negative OR create competitor campaign

IF query has 0 conversions AND >$50 spend AND >30 days
  → Flag for immediate negative addition

IF query converts BUT lands in wrong campaign
  → Add as negative in wrong campaign, add as keyword in correct campaign
```

### Query Sculpting Strategy

Direct queries to the right campaigns through negative + match type combinations:
- Prevent internal competition between campaigns
- Ensure each query triggers the most relevant ad
- Use negatives to "funnel" traffic to intended ad groups

## Waste Identification Checklist

When auditing for wasted spend, flag:
- [ ] Queries with $0 conversions and >$20 spend
- [ ] Informational queries in transactional campaigns
- [ ] Competitor brand queries without dedicated campaigns
- [ ] Close variant matches that drift from original intent
- [ ] Repeated irrelevant modifiers across multiple queries
- [ ] Shopping queries for out-of-stock or low-margin products

## Opportunity Mining

Don't just cut waste — find growth:
- High-converting long-tail queries not yet added as keywords
- Emerging query patterns indicating new demand
- Competitor queries where your product wins on features
- Seasonal query trends to pre-build campaigns around
- Question-based queries for content/SEO alignment

## Output Requirements

Use `write_artifact` to produce deliverables:

- **Search term audit** -> `search_term_audit.md`
- **Negative keyword lists** -> `negative_keywords.md`
- **Query intent mapping** -> `query_intent_map.md`
- **Wasted spend report** -> `wasted_spend_report.md`
- **Keyword opportunities** -> `keyword_opportunities.md`
- **Query sculpting plan** -> `query_sculpting_plan.md`

Each deliverable must include:
1. Data source and date range analyzed
2. Spend impact estimates ($ saved or reallocated)
3. Priority ranking (critical / high / medium / low)
4. Implementation instructions (where to add, what match type)

## Success Metrics

- Wasted spend reduction: 10-20% of non-converting spend eliminated per audit
- Negative keyword coverage: <5% impressions from irrelevant queries
- Query-intent alignment: 80%+ spend on correctly classified queries
- New keyword discovery: 5-10 high-potential keywords per analysis cycle
- Zero active conflicts between keywords and negatives
