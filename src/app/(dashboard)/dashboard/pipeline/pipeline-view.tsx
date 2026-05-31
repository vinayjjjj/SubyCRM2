"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MOCK_DEALS, STAGE_META, STAGES_ORDERED, type Deal, type DealStage } from "@/lib/mock-pipeline";

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("");
}

function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `€${Math.round(v / 1_000)}k`;
  return `€${v}`;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function PipelineView() {
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>(MOCK_DEALS);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DealStage | null>(null);

  const byStage = useMemo(() => {
    const map: Record<DealStage, Deal[]> = {
      intro: [], first_call: [], tech_review: [], term_sheet: [], live: [], lost: [],
    };
    for (const d of deals) map[d.stage].push(d);
    return map;
  }, [deals]);

  const activeStages = STAGES_ORDERED.filter((s) => s !== "lost");
  const activeDeals = deals.filter((d) => d.stage !== "lost" && d.stage !== "live");
  const totalActive = activeDeals.length;
  const weightedPipeline = activeDeals.reduce((s, d) => s + (d.value * d.probability) / 100, 0);
  const liveVolume = deals.filter((d) => d.stage === "live").reduce((s, d) => s + d.value, 0);

  const moveDeal = (id: string, target: DealStage) => {
    setDeals((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              stage: target,
              enteredStageAt: new Date().toISOString(),
              probability: target === "live" ? 100 : target === "lost" ? 0 : d.probability,
            }
          : d,
      ),
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pipeline</h1>
          <p style={{ color: "var(--t2)", fontSize: 13, marginTop: 4 }}>
            {totalActive} active deal{totalActive !== 1 ? "s" : ""} · weighted pipeline {fmtVolume(weightedPipeline)} · live {fmtVolume(liveVolume)}/mo
          </p>
        </div>
      </div>

      <div
        className="grid gap-2.5 items-start"
        style={{ gridTemplateColumns: `repeat(${STAGES_ORDERED.length}, minmax(0, 1fr))` }}
      >
        {STAGES_ORDERED.map((stage) => {
          const meta = STAGE_META[stage];
          const items = byStage[stage];
          const totalValue = items.reduce((s, d) => s + d.value, 0);
          const isTarget = dragOver === stage;

          return (
            <div
              key={stage}
              className="rounded-xl p-2.5 flex flex-col gap-2.5 min-h-[280px] transition-[background,outline-color]"
              onDragOver={(e) => { e.preventDefault(); setDragOver(stage); }}
              onDragLeave={() => setDragOver((d) => (d === stage ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedId) moveDeal(draggedId, stage);
                setDraggedId(null);
                setDragOver(null);
              }}
              style={{
                background: isTarget ? meta.bg : "var(--sf2)",
                outline: isTarget ? `2px dashed ${meta.color}` : "1px solid var(--bd)",
                outlineOffset: isTarget ? -2 : 0,
              }}
            >
              <div className="flex items-center justify-between py-0.5 px-1">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--t1)", textTransform: "uppercase", letterSpacing: 0.04 }}>
                    {meta.label}
                  </span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--t2)" }}>
                  {items.length} · {fmtVolume(totalValue)}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {items.length === 0 ? (
                  <div style={{ fontSize: 11, color: "var(--t3)", textAlign: "center", padding: "12px 6px" }}>
                    Empty.
                  </div>
                ) : (
                  items.map((d) => (
                    <DealCard
                      key={d.id}
                      deal={d}
                      tone={meta.color}
                      onDragStart={() => setDraggedId(d.id)}
                      onDragEnd={() => { setDraggedId(null); setDragOver(null); }}
                      onOpen={() => router.push(`/dashboard/contacts/${d.contactId}`)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DealCard({
  deal, tone, onDragStart, onDragEnd, onOpen,
}: {
  deal: Deal;
  tone: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);
  const ageDays = daysSince(deal.enteredStageAt);
  const stale = ageDays > 14 && deal.stage !== "live" && deal.stage !== "lost";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "var(--sf)",
        border: "1px solid var(--bd)",
        borderLeft: `3px solid ${tone}`,
        borderRadius: 8,
        padding: "10px 12px",
        cursor: "grab",
        boxShadow: hover ? "var(--shadow)" : "var(--shadow-sm)",
        transition: "box-shadow 0.12s, transform 0.12s",
        transform: hover ? "translateY(-1px)" : "none",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {deal.companyName}
          </div>
          <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1 }}>
            {deal.contactName}
          </div>
        </div>
        <span
          className="font-mono text-xs tabular-nums"
          style={{
            fontSize: 11, fontWeight: 700, color: "var(--t1)",
            background: "var(--al)", padding: "1px 6px", borderRadius: 4,
            whiteSpace: "nowrap",
          }}
        >
          {fmtVolume(deal.value)}
        </span>
      </div>

      {deal.nextStep && (
        <div style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.4, fontStyle: "italic" }}>
          → {deal.nextStep}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 10, color: stale ? "var(--rc)" : "var(--t3)", fontWeight: stale ? 600 : 400 }}>
          {ageDays === 0 ? "today" : `${ageDays}d in stage`}{stale ? " ⚠" : ""}
        </span>
        {deal.probability > 0 && deal.probability < 100 && (
          <span style={{ fontSize: 10, color: "var(--t2)" }}>{deal.probability}%</span>
        )}
      </div>

      {/* Probability bar */}
      {deal.stage !== "lost" && deal.stage !== "live" && (
        <div style={{ height: 3, background: "var(--al)", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              width: `${deal.probability}%`,
              height: "100%",
              background: tone,
              borderRadius: 2,
              transition: "width 0.2s",
            }}
          />
        </div>
      )}
    </div>
  );
}
