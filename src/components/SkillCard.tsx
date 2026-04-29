'use client';
import { agentColor, ownerLabel, formatRelative } from '../lib/format';

export default function SkillCard({ skill, onSelect }: { skill: any; onSelect: () => void }) {
  const usedBy = Object.entries(skill.invokedBy || {}) as [string, number][];
  const totalInvocations = skill.invocations || 0;
  const isStale = !skill.lastInvokedAt;

  return (
    <button
      onClick={onSelect}
      className="text-left bg-panel border border-edge hover:border-accent/40 rounded-sm p-4 transition-colors flex flex-col gap-3 group"
      style={{ borderLeftWidth: 3, borderLeftColor: agentColor(skill.owner) }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ink truncate">{skill.name}</h3>
          <p className="text-dim text-[11px] uppercase tracking-wide mt-0.5">
            {ownerLabel(skill.owner, skill.ownerLabel)}
          </p>
        </div>
        {totalInvocations > 0 && (
          <span className="shrink-0 text-accent text-xs px-2 py-0.5 rounded-sm bg-accent/10 border border-accent/20">
            {totalInvocations}×
          </span>
        )}
      </div>

      <p className="text-sm text-ink/80 line-clamp-3">
        {skill.description || <span className="text-dim italic">no description in frontmatter</span>}
      </p>

      <div className="flex flex-wrap gap-1 text-[10px] mt-auto">
        {usedBy.length > 0 ? (
          usedBy.map(([agent, count]) => (
            <span
              key={agent}
              className="px-1.5 py-0.5 rounded-sm border"
              style={{ borderColor: agentColor(agent), color: agentColor(agent) }}
              title={`${count} invocation${count === 1 ? '' : 's'} by ${agent}`}
            >
              {agent} · {count}
            </span>
          ))
        ) : (
          <span className="text-dim text-[10px]">— never invoked in scanned sessions —</span>
        )}
      </div>

      {!isStale && (
        <p className="text-[10px] text-dim border-t border-edge pt-2 -mb-1">
          last used {formatRelative(skill.lastInvokedAt)}
        </p>
      )}
    </button>
  );
}
