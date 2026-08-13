## LDA-PO

### Logic
- ensure-chains (merge missing family keys; `--replace` overwrites)
- opus head → `claude-ocx-<provider>--<model>` alias
- set `model` + `tierModels.{opus,sonnet,haiku,fable}` to each family’s head alias
- modelMap: `claude-opus-5` (+ common opus defaults) → opus head alias
- chains keyed by each head alias (copy of family chain) so CLI Default fails over
- ide apply for env

### Data
| Field | Where |
|-------|--------|
| routing.chains | config.claudeCode |
| tierModels / model / modelMap | config.claudeCode |
| IDE env | ~/.claude + Cursor settings |

### Architecture
CLI/API/GUI → `applyFailoverDefault` → saveConfig → `applyIdeClaudeEnv`

### Portal
`src/claude/failover-default.ts`

### Others
Hop only on failure; document clearly in GUI copy.
