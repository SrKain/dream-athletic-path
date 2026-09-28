import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { AgencyLogo } from "@/components/agency-logo";
import type { AgencyVisualSettings } from "@/types/db";

export interface PublicHeaderProps {
  visual?: AgencyVisualSettings | null;
  showBackToCatalog?: boolean;
  backLabel?: string;
  rightSlot?: ReactNode;
}

export function PublicHeader({
  visual,
  showBackToCatalog = false,
  backLabel = "Back to Catalog",
  rightSlot,
}: PublicHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="container-edge flex h-16 items-center justify-between md:h-20">
        <Link
          to="/"
          className="flex items-center gap-3 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
        >
          <AgencyLogo logoUrl={visual?.logo_url} variant="header" />
        </Link>

        <div className="flex items-center gap-3">
          {showBackToCatalog && (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-card/60 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>{backLabel}</span>
            </Link>
          )}
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
