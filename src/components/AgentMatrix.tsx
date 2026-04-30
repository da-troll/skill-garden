'use client';
import { agentColor } from '../lib/format';

export default function AgentMatrix({
  matrix,
  agents,
  skills,
  onSelect,
}: {
  matrix: Record<string, Record<string, 'own' | 'shared' | 'absent'>>;
  agents: { id: string; label: string; color: string }[];
  skills: any[];
  onSelect: (skillName: string) => void;
}) {
  // Sort skill names: ones owned by agents first (more interesting), then shared/user.
  const skillNames = Object.keys(matrix).sort((a, b) => {
    const aHasAgent = agents.some((g) => matrix[a][g.id] === 'own');
    const bHasAgent = agents.some((g) => matrix[b][g.id] === 'own');
    if (aHasAgent !== bHasAgent) return aHasAgent ? -1 : 1;
    return a.localeCompare(b);
  });

  const getInvocations = (name: string, agentId: string): number => {
    const s = skills.find((x) => x.name === name);
    if (!s) return 0;
    return (s.invokedBy || {})[agentId] || 0;
  };

  const cellStyle = (state: string, hasUsage: boolean) => {
    if (state === 'own') return { background: 'rgba(124,255,178,0.15)', color: '#7CFFB2', borderColor: 'rgba(124,255,178,0.35)' };
    if (state === 'shared') return { background: hasUsage ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)', color: '#888', borderColor: '#1f1f1f' };
    return { background: '#0d0d0d', color: '#444', borderColor: '#141414' };
  };

  return (
    <div className="overflow-x-auto border border-edge rounded-sm">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-bg sticky top-0 z-10">
          <tr>
            <th className="text-left px-3 py-2.5 border-b border-edge text-[11px] uppercase tracking-wide text-dim font-normal">
              Skill
            </th>
            <th className="text-left px-3 py-2.5 border-b border-edge text-[11px] uppercase tracking-wide text-dim font-normal">
              Owner
            </th>
            {agents.map((a) => (
              <th key={a.id} className="px-3 py-2.5 border-b border-edge text-center text-[11px] uppercase tracking-wide font-normal" style={{ color: agentColor(a.id) }}>
                {a.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {skillNames.map((name, i) => {
            const ownerSkill = skills.find((s) => s.name === name);
            const owner = ownerSkill?.owner || '?';
            return (
              <tr key={name} className={i % 2 ? 'bg-panel/40' : ''}>
                <td className="px-3 py-2 border-b border-edge">
                  <button onClick={() => onSelect(name)} className="text-ink hover:text-accent text-left">
                    {name}
                  </button>
                </td>
                <td className="px-3 py-2 border-b border-edge text-[11px]" style={{ color: agentColor(owner) }}>
                  {owner}
                </td>
                {agents.map((a) => {
                  const state = matrix[name][a.id];
                  const inv = getInvocations(name, a.id);
                  const style = cellStyle(state, inv > 0);
                  return (
                    <td key={a.id} className="border-b border-edge text-center" style={{ borderLeft: '1px solid #141414' }}>
                      <div className="px-2 py-2 text-[11px] flex items-center justify-center gap-1" style={style}>
                        <span>{state === 'absent' ? '—' : state === 'own' ? '✓' : '·'}</span>
                        {inv > 0 && <span className="text-accent">{inv}×</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 text-[10px] text-dim border-t border-edge bg-bg flex flex-wrap gap-3">
        <span><span className="text-accent">✓</span> = installed in agent&apos;s own dir</span>
        <span><span className="text-dim">·</span> = available via shared (visible to all)</span>
        <span><span className="text-dim">—</span> = absent</span>
        <span><span className="text-accent">N×</span> = invocation count from JSONL scan</span>
      </div>
    </div>
  );
}
