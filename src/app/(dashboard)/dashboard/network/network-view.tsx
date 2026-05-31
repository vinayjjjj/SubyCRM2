"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MOCK_CONTACTS } from "@/lib/mock-contacts";
import { MOCK_COMPANIES } from "@/lib/mock-companies";

type Sector = "payment" | "blockchain" | "vc" | "infra" | "fintech" | "ai" | "other";
type Filter = Sector | "all";

const SECTOR_META: Record<Sector, { label: string; color: string }> = {
  payment:    { label: "Payment",    color: "#16a34a" },
  blockchain: { label: "Blockchain", color: "#ea580c" },
  vc:         { label: "VC",         color: "#4f46e5" },
  infra:      { label: "Infra",      color: "#0ea5e9" },
  fintech:    { label: "Fintech",    color: "#0d9488" },
  ai:         { label: "AI",         color: "#a855f7" },
  other:      { label: "Other",      color: "#9ca3af" },
};

const SECTORS: Sector[] = ["payment", "blockchain", "vc", "infra", "fintech", "ai"];

const SECTOR_REMAP: Record<string, Sector> = {
  payment: "payment",
  crypto: "blockchain",
  blockchain: "blockchain",
  vc: "vc",
  saas: "infra",
  partner: "infra",
  ai: "ai",
  finance: "fintech",
  insurance: "fintech",
  healthtech: "fintech",
};

const COMPANY_OVERRIDES: Record<string, Sector> = {
  "Mistral AI": "ai",
  "Hugging Face": "ai",
  "Linear": "infra",
  "Vercel": "infra",
  "Notion": "infra",
  "Qonto": "fintech",
  "Ramp": "fintech",
  "Pennylane": "fintech",
  "Alan": "fintech",
  "Doctolib": "fintech",
};

const STRENGTH_R: Record<string, number> = { hot: 16, warm: 12, cold: 9 };

interface Node {
  id: string;
  name: string;
  initials: string;
  company: string;
  sector: Sector;
  strength: string;
  x: number;
  y: number;
  r: number;
}

interface Edge { a: string; b: string }

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("");
}

function sectorOf(companyName: string | null): Sector {
  if (!companyName) return "other";
  if (COMPANY_OVERRIDES[companyName]) return COMPANY_OVERRIDES[companyName];
  const co = MOCK_COMPANIES.find((c) => c.name === companyName);
  if (!co || !co.sector) return "other";
  return SECTOR_REMAP[co.sector] ?? "other";
}

function buildAllNodes(W: number, H: number): { nodes: Node[]; edges: Edge[]; clusters: Record<Sector, { cx: number; cy: number; r: number }> } {
  const cx = W / 2;
  const cy = H / 2;
  const all: Sector[] = [...SECTORS, "other"];
  const clusterDist = Math.min(W, H) * 0.34;

  const clusters: Record<Sector, { cx: number; cy: number; r: number }> = {} as Record<Sector, { cx: number; cy: number; r: number }>;
  all.forEach((s, i) => {
    const angle = (i / all.length) * Math.PI * 2 - Math.PI / 2;
    clusters[s] = { cx: cx + Math.cos(angle) * clusterDist, cy: cy + Math.sin(angle) * clusterDist, r: 0 };
  });

  const grouped: Record<Sector, typeof MOCK_CONTACTS> = {
    payment: [], blockchain: [], vc: [], infra: [], fintech: [], ai: [], other: [],
  };
  for (const c of MOCK_CONTACTS) grouped[sectorOf(c.company)].push(c);

  const nodes: Node[] = [];
  (Object.keys(grouped) as Sector[]).forEach((sector) => {
    const list = grouped[sector];
    const center = clusters[sector];
    const ringR = 22 + list.length * 5;
    clusters[sector].r = ringR + 25;
    list.forEach((c, i) => {
      const angle = (i / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2;
      const jitter = ((c.id.length * 7) % 18) - 9;
      const x = center.cx + Math.cos(angle) * (ringR + jitter);
      const y = center.cy + Math.sin(angle) * (ringR + jitter);
      nodes.push({
        id: c.id,
        name: c.name,
        initials: initials(c.name),
        company: c.company ?? "",
        sector,
        strength: c.relationshipStrength,
        x, y,
        r: STRENGTH_R[c.relationshipStrength] ?? 9,
      });
    });
  });

  const byCompany: Record<string, string[]> = {};
  for (const n of nodes) {
    if (!n.company) continue;
    (byCompany[n.company] = byCompany[n.company] || []).push(n.id);
  }
  const edges: Edge[] = [];
  for (const ids of Object.values(byCompany)) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) edges.push({ a: ids[i], b: ids[j] });
    }
  }

  return { nodes, edges, clusters };
}

function buildFocusedNodes(sector: Sector, W: number, H: number): { nodes: Node[]; edges: Edge[] } {
  const cx = W / 2;
  const cy = H / 2;
  const list = MOCK_CONTACTS.filter((c) => sectorOf(c.company) === sector);

  // Group by company → multi-ring layout
  const byCompany: Record<string, typeof MOCK_CONTACTS> = {};
  for (const c of list) {
    const key = c.company || "—";
    (byCompany[key] = byCompany[key] || []).push(c);
  }
  const companies = Object.keys(byCompany);
  const ringR = Math.min(W, H) * 0.32;
  const nodes: Node[] = [];

  companies.forEach((co, i) => {
    const angle = (i / companies.length) * Math.PI * 2 - Math.PI / 2;
    const groupX = cx + Math.cos(angle) * ringR;
    const groupY = cy + Math.sin(angle) * ringR;
    const members = byCompany[co];
    const memberRing = 14 + members.length * 7;
    members.forEach((c, j) => {
      const ang = (j / Math.max(1, members.length)) * Math.PI * 2 - Math.PI / 2;
      const x = members.length === 1 ? groupX : groupX + Math.cos(ang) * memberRing;
      const y = members.length === 1 ? groupY : groupY + Math.sin(ang) * memberRing;
      nodes.push({
        id: c.id,
        name: c.name,
        initials: initials(c.name),
        company: c.company ?? "",
        sector,
        strength: c.relationshipStrength,
        x, y,
        r: STRENGTH_R[c.relationshipStrength] ?? 9,
      });
    });
  });

  const idByCompany: Record<string, string[]> = {};
  for (const n of nodes) {
    (idByCompany[n.company] = idByCompany[n.company] || []).push(n.id);
  }
  const edges: Edge[] = [];
  for (const ids of Object.values(idByCompany)) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) edges.push({ a: ids[i], b: ids[j] });
    }
  }

  return { nodes, edges };
}

export function NetworkView() {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const W = 920;
  const H = 620;

  const sectorCounts = useMemo(() => {
    const counts: Record<Sector, number> = { payment: 0, blockchain: 0, vc: 0, infra: 0, fintech: 0, ai: 0, other: 0 };
    for (const c of MOCK_CONTACTS) counts[sectorOf(c.company)]++;
    return counts;
  }, []);

  const allBuild = useMemo(() => buildAllNodes(W, H), []);
  const focusedBuild = useMemo(
    () => (filter !== "all" ? buildFocusedNodes(filter, W, H) : null),
    [filter],
  );

  const { nodes, edges } = filter === "all" ? allBuild : focusedBuild!;
  const nodeById: Record<string, Node> = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);

  const cx = W / 2;
  const cy = H / 2;

  // Group nodes by company for the listing panel (only when filter set)
  const groupedForList = useMemo(() => {
    if (filter === "all") return null;
    const byCompany: Record<string, Node[]> = {};
    for (const n of nodes) (byCompany[n.company || "—"] = byCompany[n.company || "—"] || []).push(n);
    return byCompany;
  }, [filter, nodes]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Network</h1>
          <p style={{ color: "var(--t2)", fontSize: 13, marginTop: 4 }}>
            {MOCK_CONTACTS.length} contacts · {filter === "all" ? "all sectors" : `${SECTOR_META[filter].label.toLowerCase()} focus`}
          </p>
        </div>
      </div>

      {/* Sector filter tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={() => setFilter("all")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 999,
            background: filter === "all" ? "var(--ac)" : "var(--sf)",
            color: filter === "all" ? "white" : "var(--t1)",
            border: `1px solid ${filter === "all" ? "var(--ac)" : "var(--bd)"}`,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            transition: "all 0.12s",
          }}
        >
          All
          <span style={{
            background: filter === "all" ? "rgba(255,255,255,0.2)" : "var(--al)",
            padding: "1px 6px", borderRadius: 999, fontSize: 10, fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          }}>
            {MOCK_CONTACTS.length}
          </span>
        </button>

        {SECTORS.map((s) => {
          const active = filter === s;
          const meta = SECTOR_META[s];
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 999,
                background: active ? meta.color : "var(--sf)",
                color: active ? "white" : "var(--t1)",
                border: `1px solid ${active ? meta.color : "var(--bd)"}`,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                transition: "all 0.12s",
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: active ? "white" : meta.color,
              }} />
              {meta.label}
              <span style={{
                background: active ? "rgba(255,255,255,0.2)" : "var(--al)",
                padding: "1px 6px", borderRadius: 999, fontSize: 10, fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}>
                {sectorCounts[s]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Graph + side panel */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: filter !== "all" ? "1fr 280px" : "1fr" }}
      >
        <div className="rounded-xl border border-border bg-card shadow-sm p-3 overflow-auto">
          <svg width={W} height={H} style={{ display: "block" }}>
            <defs>
              <radialGradient id="hotPulse" cx="50%" cy="50%" r="50%">
                <stop offset="40%" stopColor="white" stopOpacity={0} />
                <stop offset="100%" stopColor="white" stopOpacity={0.4} />
              </radialGradient>
            </defs>

            {/* Cluster zones (only in All view) */}
            {filter === "all" && (Object.keys(allBuild.clusters) as Sector[]).map((s) => {
              const cl = allBuild.clusters[s];
              const meta = SECTOR_META[s];
              return (
                <g key={s}>
                  <circle
                    cx={cl.cx} cy={cl.cy} r={cl.r}
                    fill={meta.color}
                    fillOpacity={0.04}
                    stroke={meta.color}
                    strokeOpacity={0.15}
                    strokeDasharray="4 4"
                    strokeWidth={1}
                  />
                  <text
                    x={cl.cx} y={cl.cy - cl.r - 6}
                    textAnchor="middle"
                    fontSize={11} fontWeight={700}
                    fill={meta.color}
                    style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
                  >
                    {meta.label}
                  </text>
                </g>
              );
            })}

            {/* Center node */}
            {filter === "all" && (
              <g>
                <circle cx={cx} cy={cy} r={22} fill="var(--ac)" />
                <circle cx={cx} cy={cy} r={26} fill="none" stroke="var(--ac)" strokeOpacity={0.2} />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="white">
                  you
                </text>
              </g>
            )}

            {/* Edges */}
            {edges.map((e, i) => {
              const a = nodeById[e.a];
              const b = nodeById[e.b];
              if (!a || !b) return null;
              const highlighted = hovered === a.id || hovered === b.id;
              return (
                <line
                  key={i}
                  x1={a.x} y1={a.y}
                  x2={b.x} y2={b.y}
                  stroke={SECTOR_META[a.sector].color}
                  strokeWidth={highlighted ? 1.6 : 0.8}
                  opacity={highlighted ? 0.7 : filter === "all" ? 0.18 : 0.35}
                />
              );
            })}

            {/* Spokes from "you" to hot contacts (All view) */}
            {filter === "all" && nodes.filter((n) => n.strength === "hot").map((n, i) => (
              <line
                key={`spoke-${i}`}
                x1={cx} y1={cy}
                x2={n.x} y2={n.y}
                stroke={SECTOR_META[n.sector].color}
                strokeOpacity={0.2}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ))}

            {/* Nodes */}
            {nodes.map((n) => {
              const sectorColor = SECTOR_META[n.sector].color;
              const isHovered = hovered === n.id;
              const fillOpacity = n.strength === "hot" ? 0.95 : n.strength === "warm" ? 0.65 : 0.35;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x}, ${n.y})`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered((h) => (h === n.id ? null : h))}
                  onClick={() => router.push(`/dashboard/contacts/${n.id}`)}
                >
                  {n.strength === "hot" && (
                    <circle r={n.r + 6} fill={sectorColor} fillOpacity={0.18} />
                  )}
                  <circle
                    r={n.r + (isHovered ? 3 : 0)}
                    fill={sectorColor}
                    fillOpacity={fillOpacity}
                    stroke={isHovered ? "var(--t1)" : sectorColor}
                    strokeWidth={isHovered ? 2 : 1}
                  />
                  <text
                    textAnchor="middle"
                    dy={3}
                    fontSize={n.r > 12 ? 9 : 8}
                    fontWeight={700}
                    fill={n.strength === "hot" ? "white" : "var(--t1)"}
                    pointerEvents="none"
                  >
                    {n.initials}
                  </text>
                </g>
              );
            })}

            {/* Hover tooltip — rendered last so it's on top */}
            {hovered && nodeById[hovered] && (() => {
              const n = nodeById[hovered];
              const tx = Math.min(W - 160, Math.max(80, n.x));
              const ty = n.y - n.r - 50;
              return (
                <g pointerEvents="none">
                  <rect
                    x={tx - 80} y={ty}
                    width={160} height={42}
                    rx={6}
                    fill="var(--ac)"
                    fillOpacity={0.95}
                  />
                  <text x={tx} y={ty + 16} textAnchor="middle" fontSize={12} fontWeight={700} fill="white">
                    {n.name}
                  </text>
                  <text x={tx} y={ty + 32} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.7)">
                    {n.company} · {n.strength}
                  </text>
                </g>
              );
            })()}
          </svg>
        </div>

        {/* Side panel — only when a sector is selected */}
        {filter !== "all" && groupedForList && (
          <div className="rounded-xl border border-border bg-card shadow-sm p-3.5 overflow-hidden flex flex-col" style={{ maxHeight: `${H + 24}px` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: SECTOR_META[filter].color }} />
              <h3 style={{ fontSize: 13, fontWeight: 700 }}>{SECTOR_META[filter].label}</h3>
              <span style={{ fontSize: 11, color: "var(--t3)", marginLeft: "auto" }}>
                {nodes.length} contacts · {Object.keys(groupedForList).length} compan{Object.keys(groupedForList).length === 1 ? "y" : "ies"}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.entries(groupedForList).map(([company, members]) => (
                <div key={company}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: "var(--t3)",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}>
                    {company}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {members.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => router.push(`/dashboard/contacts/${n.id}`)}
                        onMouseEnter={() => setHovered(n.id)}
                        onMouseLeave={() => setHovered((h) => (h === n.id ? null : h))}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "6px 8px", borderRadius: 6,
                          background: hovered === n.id ? "var(--al)" : "transparent",
                          border: "none", cursor: "pointer", textAlign: "left",
                          transition: "background 0.1s",
                        }}
                      >
                        <span style={{
                          width: 22, height: 22, borderRadius: "50%",
                          background: SECTOR_META[filter].color,
                          opacity: n.strength === "hot" ? 1 : n.strength === "warm" ? 0.7 : 0.4,
                          color: "white", fontSize: 9, fontWeight: 700,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          {n.initials}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--t1)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {n.name}
                        </span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                          background: n.strength === "hot" ? "var(--rb)" : n.strength === "warm" ? "var(--ob)" : "var(--al)",
                          color: n.strength === "hot" ? "var(--rc)" : n.strength === "warm" ? "var(--oc)" : "var(--t3)",
                        }}>
                          {n.strength}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: "var(--t3)", textAlign: "center" }}>
        Size = strength · color = sector · hover for details · click opens contact.
      </p>
    </div>
  );
}
