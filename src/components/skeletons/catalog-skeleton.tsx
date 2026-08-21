export function CatalogSkeleton() {
  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col justify-between"
      aria-busy="true"
      aria-label="Loading athlete catalog"
    >
      <div>
        {/* Header Skeleton */}
        <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
          <div className="container-edge flex h-16 items-center justify-between md:h-20">
            <div className="h-7 w-32 rounded-md bg-muted motion-safe:animate-pulse" />
          </div>
        </header>

        {/* Hero Section Skeleton */}
        <section className="relative overflow-hidden border-b border-border/70 min-h-[380px] md:min-h-[460px] flex items-center bg-[#061b13]">
          <div className="container-edge relative z-10 py-12 md:py-16 w-full">
            <div className="max-w-2xl space-y-4">
              <div className="h-10 sm:h-14 w-3/4 rounded-lg bg-white/10 motion-safe:animate-pulse" />
              <div className="h-10 sm:h-14 w-1/2 rounded-lg bg-white/10 motion-safe:animate-pulse" />
              <div className="h-5 w-5/6 rounded-md bg-white/5 motion-safe:animate-pulse mt-4" />
              <div className="h-5 w-2/3 rounded-md bg-white/5 motion-safe:animate-pulse" />
            </div>
          </div>
        </section>

        {/* Catalog Section Skeleton */}
        <section className="container-edge py-10 md:py-14">
          <div className="mb-6 flex items-center justify-between border-b border-border/70 pb-3">
            <div className="h-8 w-44 rounded-md bg-muted motion-safe:animate-pulse" />
            <div className="h-4 w-28 rounded-md bg-muted motion-safe:animate-pulse" />
          </div>

          {/* Filter Bar Skeleton */}
          <div className="glass-panel mb-10 rounded-md p-4 space-y-3">
            <div className="h-11 w-full rounded-md bg-muted/60 motion-safe:animate-pulse" />
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-8 w-20 shrink-0 rounded-full bg-muted/70 motion-safe:animate-pulse"
                />
              ))}
            </div>
          </div>

          {/* Cards Grid Skeleton */}
          <div className="space-y-12">
            <div>
              <div className="mb-5 flex items-center justify-between border-b border-border/70 pb-3">
                <div className="h-7 w-36 rounded-md bg-muted motion-safe:animate-pulse" />
                <div className="h-4 w-24 rounded-md bg-muted/60 motion-safe:animate-pulse" />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={i}
                    className="overflow-hidden rounded-md border border-border/70 bg-card"
                  >
                    <div className="aspect-[3/4] w-full bg-muted/80 motion-safe:animate-pulse" />
                    <div className="p-3 space-y-2">
                      <div className="h-4 w-4/5 rounded bg-muted motion-safe:animate-pulse" />
                      <div className="h-3 w-3/5 rounded bg-muted/60 motion-safe:animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Footer Skeleton */}
      <footer className="mt-16 border-t border-border/70 bg-background/60 py-10">
        <div className="container-edge flex items-center justify-between">
          <div className="h-5 w-28 rounded bg-muted motion-safe:animate-pulse" />
          <div className="h-4 w-48 rounded bg-muted/60 motion-safe:animate-pulse" />
        </div>
      </footer>
    </div>
  );
}
