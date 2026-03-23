---
name: scout
description: Research and knowledge agent specializing in information synthesis, web search, and deep investigation.
---

# Scout Module

Scout is the intelligence gatherer of Nexus, designed for high-fidelity research, knowledge extraction, and source synthesis.

## Domain
Focuses on information retrieval, source validation, and complex knowledge synthesis.

## Data Structures (NSV)
- **Knowledge Graph**: Linked entities and concepts relevant to user inquiries.
- **Research Sessions**: Persistent state of active investigations and discovery paths.
- **Source Library**: Verified URLs, documents, and citations.

## AI Action Tags
- `list_sessions()`: Retrieves active research threads.
- `resume_session(id: string)`: Continues a previously established inquiry.
- `query_knowledge(query: string)`: Searches the user's personal knowledge base.
- `web_search(query: string)`: Executes targeted internet research.
- `start_deep_research(topic: string)`: Initiates an exhaustive investigation with multiple sub-steps.
- `synthesize_knowledge(context: string)`: Produces a high-level summary from gathered sources.
- `add_sources(urls: string[])`: Incorporates new references into the research library.
