# LocalPilot Flow Engine decisions

## Using the editor

Open **Flow Engine** from the graph icon in the activity rail. The workflow library is on the left, the canvas is in the center, and the selected node's configuration and latest run data appear in the Inspector on the right. Add a node from the palette and drag it into place. To connect nodes, click **Connect** on the source and then click the target card, or drag **Connect** onto the target card. For a condition, configure both true and false outgoing edges in the Inspector. Validation reports graph errors before save or run.

**Run input JSON** accepts an object such as `{ "request": "Summarize this folder" }`. The Input node emits that object. Downstream nodes receive an object keyed by the IDs of their active predecessor nodes. Tool arguments can interpolate values using `{{path.to.value}}`. Agent goals can refer to a path with the same syntax; upstream values are supplied separately as untrusted data. The node Inspector shows the exact input and output from the selected run, so inspect those values when configuring a path. A Dry run lists planned node order and known tool risk without executing nodes.

The toolbar can import and export version 1 graph JSON. Import creates a new workflow ID after schema and graph validation. The editor currently starts from a blank Input → Output graph; there is no built-in template gallery.

## Node types

| Node | Behavior |
|------|----------|
| Input / Output | Pass the run input into the graph and collect output |
| Agent | Run the existing LocalPilot agent loop in Agent or Plan mode using the selected or configured provider |
| Tool | Invoke a registered LocalPilot tool after argument validation and applicable permission approval |
| Condition | Evaluate `exists`, `equals`, `not_equals`, or `contains`; only the matching branch runs |
| Approval | Wait for an explicit Approve or Deny response in the Runs panel |
| Delay | Wait for a configured number of milliseconds |
| Subworkflow | Run another saved graph, with cycle and depth checks |
| Custom | Invoke a node type registered by main-process code through `registerCustomWorkflowNode` |

Custom nodes cannot load executable code from graph JSON. The palette's `example` custom type is only a placeholder; it will fail until application code registers that type. Agent `ask_user` questions appear in the Runs panel and accept a text answer.

## Automation triggers

Save a graph before adding a trigger in the left panel. The supported triggers are interval schedules, workspace filesystem changes, Git HEAD changes, and authenticated HTTP POSTs on `127.0.0.1`. Schedule and Git triggers use an interval in seconds, not calendar or cron expressions. Git triggers poll the chosen workspace-relative repository path. Filesystem triggers watch an existing workspace-relative path and may include subfolders. Trigger paths are checked against the selected workspace.

For a webhook, choose a local path and port, then copy the bearer token shown once when the trigger is created. Send a JSON object in a POST request with `Authorization: Bearer <token>`. The server listens only on localhost. Tokens and trigger settings require Electron encrypted storage; trigger setup fails when `safeStorage` encryption is unavailable. Triggers are loaded on application startup and reloaded when the workspace changes. Duplicate events within the configured deduplication window are suppressed while the app is running. The app must be open for triggers to fire; missed schedule ticks and filesystem changes are not backfilled.

Trigger payloads enter a run as `{ trigger, triggerId, timestamp }` in its input object. An optional filter compares one payload path with a JSON value before starting a run. Trigger configuration can be enabled, disabled, or deleted from the editor.

## Existing application boundaries

LocalPilot stores the existing text-step workflows in `settings.json` through `SettingsStore`. Selecting one inserts its numbered steps into the chat composer. Those records remain valid and are not converted automatically.

The main process owns providers, agent runs, tool execution, permissions, and storage. The renderer communicates through the typed preload bridge. Flow definitions and run commands must cross that bridge as validated data; the renderer never executes a node or receives API keys.

## Graph contract

`src/shared/workflow.ts` defines version 1 graphs with nodes and directed edges. Node configuration is discriminated by kind and parsed with Zod. The version is explicit so future schema changes can be migrated without silently reinterpreting saved graphs. Graph validation must reject duplicate IDs, missing endpoints, and cycles before a run starts.

Graph definitions are stored in SQLite separately from legacy text workflows. A run stores a copy of the graph used to start it. Editing or deleting the library entry therefore cannot change the meaning of a running or historical run.

The store also keeps immutable revisions whenever a definition changes. The editor can browse and restore an earlier revision; restoration creates a new current revision and does not change historical runs.

## Execution and persistence

`src/main/workflow/store.ts` uses the existing `node:sqlite` database. A checkpoint replaces a complete run snapshot and appends an event inside one SQLite transaction. The service must checkpoint before notifying the renderer so a missed IPC event can be recovered by querying run state and events.

Run and node states include `pending`, `running`, `waiting`, `paused`, `succeeded`, `failed`, `cancelled`, and `unknown`; nodes also support `skipped`. State transitions are the engine's responsibility. The store validates persisted snapshots but does not infer transitions from them.

On restart, persisted `pending`, `running`, and `waiting` runs become `paused`. Nodes that were `running` become `unknown`, since a side effect may have completed before its checkpoint. Waiting approval and tool nodes recover as `pending`, so they request approval again before acting. A waiting agent question node recovers as `unknown`, since the agent may already have performed earlier side effects. Approval is never inferred from a prior prompt. A paused run with no unknown node can be resumed from the Runs panel. An unknown node requires **Review and replay** and a confirmation because its prior action may already have occurred. Replay resets that node to pending and resumes the run. There is no automatic retry for agent, tool, approval, custom, or nested workflow nodes; retry configuration applies only to other node kinds.

## Safety and concurrency

Flow tool nodes use main-process risk classification, permission prompts, timeouts, audit logging, workspace context, and the kill switch. The workflow service applies those checks before calling a registered tool. Dynamic MCP tool names may disappear on reload, so the service checks tool availability at execution time.

The engine executes at most two non-side-effect nodes in a batch. Tool, agent, approval, custom, and nested workflow nodes run one at a time within a graph. Up to four top-level runs may be active. A main-process slot serializes tool, agent, and custom node execution across runs to protect shared desktop and workspace resources.

## Verification

The repository CI runs TypeScript checks, Vitest, and a production build on macOS, Windows, and Linux. Flow changes should add graph validation, engine transition, permission, checkpoint, recovery, and IPC input tests. Restart tests need an isolated on-disk SQLite database; the default Vitest database is in memory.
