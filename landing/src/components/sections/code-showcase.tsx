"use client";

import { Reveal } from "@/components/ui/reveal";
import { GlassCard } from "@/components/ui/glass-card";

const codeExample = `# ax.yaml — your security config
providers:
  llm: anthropic
  scanner: patterns       # prompt injection detection
  sandbox: seatbelt       # macOS sandbox (or nsjail/docker)
  memory: sqlite          # FTS5 full-text search
  credentials: encrypted  # AES-256-GCM at rest
  audit: sqlite           # queryable audit log

security:
  taint_budget: 0.7       # block above this threshold
  scan_inbound: true      # scan all inputs
  scan_outbound: true     # scan all outputs
  network_deny: true      # no network in sandbox`;

const codeHighlighted = codeExample.split("\n").map((line, i) => {
  if (line.startsWith("#") || line.includes("#")) {
    const parts = line.split("#");
    if (line.startsWith("#")) {
      return (
        <span key={i} className="text-text-tertiary">
          {line}
        </span>
      );
    }
    return (
      <span key={i}>
        <span className="text-text-primary">{parts[0]}</span>
        <span className="text-text-tertiary">#{parts.slice(1).join("#")}</span>
      </span>
    );
  }
  if (line.includes(":")) {
    const [key, ...rest] = line.split(":");
    return (
      <span key={i}>
        <span className="text-accent-glow">{key}</span>
        <span className="text-text-tertiary">:</span>
        <span className="text-text-primary">{rest.join(":")}</span>
      </span>
    );
  }
  return (
    <span key={i} className="text-text-primary">
      {line}
    </span>
  );
});

export function CodeShowcase() {
  return (
    <section id="how-it-works" className="relative py-24 md:py-32">
      {/* Subtle glow */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-accent/5 blur-[100px]" />

      <div className="relative mx-auto max-w-[1200px] px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <Reveal direction="left">
            <div className="flex flex-col gap-4">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                One config file.{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-glow">
                  Full protection.
                </span>
              </h2>
              <p className="text-text-secondary text-lg leading-relaxed">
                Drop a <code className="font-mono text-accent-glow text-sm bg-bg-elevated px-1.5 py-0.5 rounded">ax.yaml</code> into
                your project. Pick your providers, set your thresholds, and
                let us handle the paranoia.
              </p>
              <p className="text-text-secondary leading-relaxed">
                Every provider is a TypeScript interface — swap implementations
                without changing a line of application code. Start with our
                defaults, graduate to your own when you&apos;re ready.
              </p>
            </div>
          </Reveal>

          {/* Code block */}
          <Reveal direction="right">
            <GlassCard className="p-0 overflow-hidden" hover={false}>
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
                <span className="ml-2 text-xs text-text-tertiary font-mono">
                  ax.yaml
                </span>
              </div>
              {/* Code */}
              <pre className="p-5 text-sm font-mono leading-relaxed overflow-x-auto">
                <code className="flex flex-col gap-0.5">
                  {codeHighlighted.map((line, i) => (
                    <span key={i} className="block">
                      {line}
                    </span>
                  ))}
                </code>
              </pre>
            </GlassCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
