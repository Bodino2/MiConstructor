type BrandLogoProps = {
  className?: string;
  compact?: boolean;
  inverse?: boolean;
};

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M38 9H18.5C12.7 9 9 12.8 9 18.5v11C9 35.2 12.8 39 18.5 39H38"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="square"
      />
      <path
        d="M16 33V18.5L24 25.5L32 18.5V33"
        stroke="#D35400"
        strokeWidth="4.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <circle cx="16" cy="18.5" r="2.6" fill="#C59B27" />
      <circle cx="32" cy="18.5" r="2.6" fill="#C59B27" />
      <rect x="35" y="35" width="6" height="6" rx="1.2" fill="#00A896" />
    </svg>
  );
}

export default function BrandLogo({
  className = "",
  compact = false,
  inverse = false,
}: BrandLogoProps) {
  return (
    <span
      className={`mc-brand ${inverse ? "mc-brand-inverse" : ""} ${className}`.trim()}
      aria-label="MiConstructor"
    >
      <span className="mc-brand-symbol">
        <BrandMark />
      </span>
      {!compact && (
        <span className="mc-brand-copy">
          <strong><span>Mi</span>Constructor</strong>
          <small>Proyectos que avanzan con control</small>
        </span>
      )}
    </span>
  );
}
