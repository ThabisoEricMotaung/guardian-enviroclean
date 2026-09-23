import Link from "next/link";

const base = "inline-flex items-center justify-center gap-2 rounded-[3px] font-medium tracking-wide transition";

const sizes = {
  default: "px-6 py-3 text-sm",
  sm: "px-4 py-2.5 text-sm",
};

const variants = {
  primary: "bg-[var(--guardian-deep)] text-[#ffffff] hover:bg-[var(--guardian-deep-dark)]",
  secondary:
    "border border-[var(--foreground)]/30 text-[var(--foreground)] hover:border-[var(--foreground)] hover:bg-[var(--foreground)]/[0.03]",
};

type Props = {
  href: string;
  variant?: "primary" | "secondary";
  size?: "default" | "sm";
  external?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function CtaButton({
  href,
  variant = "primary",
  size = "default",
  external = false,
  children,
  className = "",
}: Props) {
  const classes = `${base} ${sizes[size]} ${variants[variant]} ${className}`;

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
