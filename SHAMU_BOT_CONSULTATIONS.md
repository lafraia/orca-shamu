# Bot consultations

The bot receiving the user's message remains responsible for the answer. A selected bot mention inside a bot's permanent conversation no longer forwards the user's message to that peer. The coordinator formulates its own question, obtains the peer's completed response and synthesizes a user-facing answer.

Example: the user asks CEO, "Ask Orlando when the app will launch." CEO can ask, "I need to report our launch forecast. What date can you confirm, what still blocks it, and what evidence supports that forecast?" Orlando answers CEO as itself. CEO uses that result to answer the user. The application does not manufacture either bot's words by rewriting the user's text.

## Research and choice

[OpenAI's agents-as-tools pattern](https://openai.github.io/openai-agents-python/multi_agent/) keeps a manager in control of the user conversation while specialists return bounded results. Its handoff pattern instead transfers the active conversation to a specialist. The former fits Shamu's coordinator use case.

[LangChain's supervisor/subagent pattern](https://docs.langchain.com/oss/python/langchain/multi-agent/subagents) similarly makes the main agent choose the question and combine the result. It distinguishes a blocking consultation from independent background work and describes start/check/result operations for asynchronous work. Shamu uses that separation with its existing native queues and durable operation identities, without adding either framework as a dependency.

Shamu retains each bot's permanent native session, configured model, memory and provider permissions. Independence here means an attributed bot-pair communication thread and a focused peer question, separate from the user's chat. It does not create another provider session or clone a user's conversation. Recent source history is no longer automatically inserted into bot-authored consultation prompts. The originating bot can explicitly reference necessary evidence within the user's delegated scope.

## Commands

Use the bundled Shamu CLI and explicitly select its local application profile. `bots ask` accepts this JSON through `--input-file`:

```json
{
  "action": "ask",
  "requestId": "057dc8a2-0f72-4e4c-a931-6b0454ec91d9",
  "actorId": "COORDINATOR_BOT_ID",
  "sourceItemId": "ORIGINAL_USER_REQUEST_ITEM_ID",
  "botId": "RECIPIENT_BOT_ID",
  "text": "I need a confirmed launch forecast. What date and remaining blockers can you verify?"
}
```

The service validates the coordinator's permanent session, primary host and actual user item. Self consultations and verbatim copies of the complete user message are refused. The bot's configured name determines authorship. A caller-supplied display label cannot substitute for that identity. A peer question still depends on model instruction following; the exact-copy guard does not claim to recognize every possible paraphrase or grammatical person.

`bots ask-result` reads the same request:

```json
{
  "action": "ask.result",
  "requestId": "057dc8a2-0f72-4e4c-a931-6b0454ec91d9",
  "actorId": "COORDINATOR_BOT_ID",
  "waitSeconds": 30
}
```

Waiting is bounded to 30 seconds per call and only reads the existing request. Queued, running, refused, failed and unconfirmed states are distinct from completion. Repeated checks never send another prompt. A lost reply must be recovered under the same UUID; changing the question, originating bot or user reference under that UUID is refused.

The result reader follows the native submission and its root turn, including queue-to-submission linkage. It returns that turn's bounded assistant output, rather than borrowing another turn's or a child agent's response. Only the originating bot on the same primary can read a consultation result through this API. A native approval or question remains subject to the existing human permission flow.

## Presentation and compatibility

### Linked replies and scoped skill

`bots ask-result` includes `name`, `botId` and a canonical Markdown `reference` generated from the recorded recipient identity. The coordinator uses that reference to name and link the peer in its synthesis. It opens the peer's permanent chat, not an exact-answer permalink. The application does not guess links from names in generated prose or rewrite the model's answer.

The bundled [shamu-consultation-reply skill](skills/shamu-consultation-reply/SKILL.md) guides concise, attributed replies. It distinguishes completed answers from pending, failed and truncated results, preserves the peer's evidence and uncertainty, and separates confirmed facts from estimates or the coordinator's own inferences. The skill uses a flexible answer structure rather than requiring a long report for every question.

[Agent Skills](https://agentskills.io/home) separates discovery from on-demand guidance. Shamu follows that approach: the bot turn guidance and BOT_TOOLS.md identify this skill, and the bot reads its version-matched body through `skills get shamu-consultation-reply --json` using its bundled CLI. This shares one guide across configured providers without adding a global skill installation or inserting the whole guide into every turn. The source in `skill-guides/shamu-consultation-reply.md` generates the portable SKILL.md and CLI catalog through the existing generator.

The service guarantees the reference's origin and native result correlation; the wording and whether the bot follows the skill still depend on the model. A peer result is source material, not new permission. Loading the guide does not send another prompt, approve a pending action or resume a coordinator that has already finished.

Both directions remain visible in the existing bot-pair communication drawer, with each bot's real name and authored text. The user's original request stays in the coordinator's chat. Bot-authored consultation frames use their recorded native operation and reference IDs, so ordinary pasted text cannot become an authenticated communication merely by resembling a prompt wrapper.

Workspace-to-bot user mentions keep their direct notification behavior. Existing historical mentions are not rewritten. `bots mention` remains available for one-way bot notifications; `bots send` and `bots result` remain the external CLI ingress and its result API. Neither CLI sender labels nor peer messages expand Vault permissions.

This implementation supports focused follow-up questions by the coordinator within the same user request and pair thread. Each different question has a different UUID. It does not run an autonomous background dialogue loop or automatically resume a coordinator that has already ended its turn. The coordinator must retrieve the result before finishing its response or explicitly explain a pending result.
