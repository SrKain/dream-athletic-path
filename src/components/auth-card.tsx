import { Link } from "@tanstack/react-router";

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-2">
      <section className="hidden bg-surface p-12 text-surface-foreground lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="font-display text-2xl font-semibold">
          Go Team Go
        </Link>
        <div>
          <p className="eyebrow text-gold">Athlete platform</p>
          <p className="mt-5 max-w-lg text-4xl font-semibold leading-tight">
            Do talento esportivo à universidade certa.
          </p>
        </div>
        <p className="text-xs text-white/40">Plataforma segura para agência e atletas.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="font-display text-xl font-semibold lg:hidden">
            Go Team Go
          </Link>
          <h1 className="mt-8 font-display text-3xl font-semibold lg:mt-0">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </main>
  );
}

export const fieldClass =
  "mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
export const primaryButtonClass =
  "inline-flex h-11 w-full items-center justify-center rounded-md bg-foreground px-5 text-sm font-medium text-background disabled:opacity-50";
