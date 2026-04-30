'use client';
import { useState } from 'react';
import { agentColor, ownerLabel, formatRelative, mdToHtml } from '../lib/format';

export default function SkillModal({
  skill,
  onClose,
  agents,
}: {
  skill: any;
  onClose: () => void;
  agents: { id: string; label: string; color: string }[];
}) {
  const [copied, setCopied] = useState(false);

  const copyAsPrompt = async () => {
    const prompt = `Invoke the "${skill.name}" skill. Description: ${skill.description}\n\nFull SKILL.md follows:\n\n${skill.body}`;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('clipboard write failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-panel border border-edge rounded-sm max-w-3xl w-full max-h-[90vh] flex flex-col"
        style={{ borderTopWidth: 3, borderTopColor: agentColor(skill.owner) }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-edge px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-ink">{skill.name}</h2>
            <p className="text-[11px] uppercase tracking-wide mt-1" style={{ color: agentColor(skill.owner) }}>
              {ownerLabel(skill.owner, skill.ownerLabel)}
              {skill.isPromotionCandidate && (
                <span className="ml-2 normal-case" style={{ color: '#FFD580' }}>
                  · promote? (in {skill.locations.length} agent dirs, not shared)
                </span>
              )}
            </p>
            {skill.locations && skill.locations.length > 0 ? (
              <div className="mt-2 flex flex-col gap-0.5">
                {skill.locations.map((loc: any) => (
                  <p key={loc.realpath} className="text-dim text-[11px] truncate" title={loc.realpath}>
                    <span style={{ color: agentColor(loc.owner) }}>{loc.ownerLabel}</span>
                    {' · '}
                    <span className="text-dim/80">{loc.path}</span>
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-dim text-xs mt-1 truncate">{skill.path}</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={copyAsPrompt}
              className={`px-3 py-1.5 text-xs border rounded-sm ${copied ? 'border-accent text-accent bg-accent/10' : 'border-edge text-dim hover:text-ink hover:border-ink/30'}`}
            >
              {copied ? '✓ copied' : 'copy as prompt'}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs border border-edge text-dim rounded-sm hover:text-ink hover:border-ink/30"
            >esc</button>
          </div>
        </header>

        {(skill.invocations > 0 || skill.errors > 0) && (
          <div className="border-b border-edge px-5 py-3 bg-bg/50">
            <div className="text-[11px] uppercase tracking-wide text-dim mb-2">Usage in scanned sessions</div>
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="text-accent">{skill.invocations} invocation{skill.invocations === 1 ? '' : 's'}</span>
              {skill.lastInvokedAt && (<span className="text-dim">last: {formatRelative(skill.lastInvokedAt)}</span>)}
              {skill.errors > 0 && (<span className="text-pepper">⚠ {skill.errors} error{skill.errors === 1 ? '' : 's'}</span>)}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {agents.map((a) => {
                const c = (skill.invokedBy || {})[a.id] || 0;
                return (
                  <span
                    key={a.id}
                    className="px-1.5 py-0.5 text-[10px] rounded-sm border"
                    style={{
                      borderColor: c > 0 ? agentColor(a.id) : '#1f1f1f',
                      color: c > 0 ? agentColor(a.id) : '#666',
                    }}
                  >
                    {a.label} · {c}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="overflow-y-auto px-5 py-4 md text-sm" dangerouslySetInnerHTML={{ __html: mdToHtml(skill.body) }} />
      </div>
    </div>
  );
}
