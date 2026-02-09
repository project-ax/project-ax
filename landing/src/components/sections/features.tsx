"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { Reveal, StaggerContainer, StaggerItem } from "@/components/ui/reveal";
import {
  Shield,
  Fingerprint,
  ScanSearch,
  Lock,
  Layers,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Shield,
    title: "Sandboxed Execution",
    description:
      "Every AI agent runs in an isolated sandbox — no network access, no credential leaks, no escape hatches. We support seatbelt, nsjail, and Docker.",
    iconColor: "text-indigo-400",
  },
  {
    icon: Fingerprint,
    title: "Taint Tracking",
    description:
      "Every piece of external content is tagged at the source. We trace it through the entire pipeline so you always know what's user-generated and what isn't.",
    iconColor: "text-violet-400",
  },
  {
    icon: ScanSearch,
    title: "Prompt Injection Scanning",
    description:
      "Multi-layer scanning catches injection attempts before they reach your LLM. Regex patterns, ML classifiers, and canary tokens — belt, suspenders, and a backup belt.",
    iconColor: "text-sky-400",
  },
  {
    icon: Lock,
    title: "Encrypted Credentials",
    description:
      "API keys never enter the sandbox. AES-256-GCM encryption at rest, OS keychain integration, and a paranoid credential store.",
    iconColor: "text-emerald-400",
  },
  {
    icon: Layers,
    title: "Provider Architecture",
    description:
      "Every subsystem is a swappable provider. Bring your own LLM, memory store, scanner, or sandbox — the contracts are TypeScript interfaces.",
    iconColor: "text-amber-400",
  },
  {
    icon: Zap,
    title: "OpenAI-Compatible API",
    description:
      "Drop-in /v1/chat/completions endpoint. Point your existing tools at ax and get security for free.",
    iconColor: "text-rose-400",
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-[1200px] px-6">
        <Reveal>
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              Security that{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-glow">
                doesn&apos;t get in the way
              </span>
            </h2>
            <p className="text-text-secondary text-lg max-w-2xl mx-auto">
              We obsess over security so you can obsess over your product.
              Every layer is designed to be invisible until something goes wrong.
            </p>
          </div>
        </Reveal>

        <StaggerContainer
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
          staggerDelay={0.1}
        >
          {features.map((feature) => (
            <StaggerItem key={feature.title}>
              <GlassCard className="h-full group">
                <div className="flex flex-col gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      "bg-bg-elevated border border-border group-hover:border-border-hover transition-colors",
                      feature.iconColor
                    )}
                  >
                    <feature.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </GlassCard>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
