# Repository Instructions

Read [`CLAUDE.md`](CLAUDE.md) for the project architecture, development commands, invariants, security model,
and review workflow. The same project guidance applies to every AI coding agent, regardless of vendor or model.

## Language policy

### Repository artifacts

- Write project instructions, AI-facing documentation, specifications, architecture documents, roadmaps,
  and code comments in English.
- This includes AI instruction files and the AI-facing documents under `docs/`.
- User-facing content that is intentionally localized, such as the English and Japanese website, must remain
  in its target language.
- Preserve technical identifiers, commands, paths, and code in their original form.

### Conversation language

- Communicate with the user in their preferred language.
- Determine the conversation language in this order:
  1. A language explicitly requested by the user.
  2. The language used in the user's recent messages.
  3. English when the preferred language is unclear.
- Do not change the language of repository artifacts based on the conversation language.

### Personal preferences

- Version-controlled repository instructions must remain neutral regarding an individual's preferred
  conversation language.
- Personal language preferences must be defined only in personal, non-version-controlled AI instructions.
