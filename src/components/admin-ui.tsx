import type { ReactNode } from "react";

export const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10";
export const textareaClass = `${inputClass} min-h-24 py-2`;
export const buttonClass =
  "inline-flex h-10 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50";
export const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted disabled:opacity-50";

export function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border bg-card">
      <header className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const labels: Record<string, string> = {
    pending: "Pendente",
    submitted: "Enviado",
    approved: "Aprovado",
    rejected: "Reprovado",
    resubmit: "Reenviar",
    not_started: "Não iniciado",
    in_progress: "Em andamento",
    blocked: "Bloqueado",
    completed: "Concluído",
  };
  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
      {labels[value] ?? value}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="p-10 text-center text-sm text-muted-foreground">{children}</div>;
}
