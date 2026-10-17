import { useCodex } from './CodexProvider.js';

export function ModelControls({ disabled = false }: { disabled?: boolean }) {
  const codex = useCodex();
  return <div className="codex-model-controls"><label>Model<select aria-label="Codex model" value={codex.model?.id ?? ''} disabled={disabled || !codex.state.models.length} onChange={event => codex.selectModel(event.target.value)}>{!codex.state.models.length && <option value="">No model catalog available</option>}{codex.state.models.map(model => <option key={model.id} value={model.id}>{model.name || model.model}</option>)}</select></label><label>Reasoning effort<select aria-label="Reasoning effort" value={codex.effort ?? ''} disabled={disabled || !codex.model?.efforts.length} onChange={event => codex.selectEffort(event.target.value)}>{!codex.model?.efforts.length && <option value="">Default</option>}{codex.model?.efforts.map(effort => <option key={effort} value={effort}>{effort}</option>)}</select></label></div>;
}
