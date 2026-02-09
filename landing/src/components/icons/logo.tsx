export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Crab claw / shield hybrid icon */}
      <path
        d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2z"
        fill="url(#logo-gradient)"
        fillOpacity="0.15"
        stroke="url(#logo-gradient)"
        strokeWidth="1.5"
      />
      <path
        d="M10 12c0-2 1.5-3.5 3-4l1 3-2 3h-2v-2z"
        fill="url(#logo-gradient)"
        fillOpacity="0.6"
      />
      <path
        d="M22 12c0-2-1.5-3.5-3-4l-1 3 2 3h2v-2z"
        fill="url(#logo-gradient)"
        fillOpacity="0.6"
      />
      <path
        d="M11 17c0 3 2.5 5.5 5 5.5s5-2.5 5-5.5"
        stroke="url(#logo-gradient)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="13" cy="15" r="1" fill="var(--accent-glow)" />
      <circle cx="19" cy="15" r="1" fill="var(--accent-glow)" />
      <defs>
        <linearGradient
          id="logo-gradient"
          x1="4"
          y1="4"
          x2="28"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-glow)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
