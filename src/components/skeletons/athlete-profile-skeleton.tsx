export function AthleteProfileSkeleton() {
  return (
    <div
      className="min-h-screen bg-background text-foreground"
      aria-busy="true"
      aria-label="Loading athlete profile"
    >
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="container-edge flex h-16 items-center justify-between">
          <div className="h-6 w-28 rounded bg-muted motion-safe:animate-pulse" />
          <div className="h-8 w-32 rounded-lg bg-muted/80 motion-safe:animate-pulse" />
        </div>
      </header>

      {/* Hero Section Skeleton */}
      <section className="relative overflow-hidden bg-[#061b13] min-h-[500px] sm:min-h-[540px] flex items-center">
        <div className="container-edge relative z-10 px-6 sm:px-10 md:px-12 lg:px-16 xl:px-20 py-16 sm:py-20 lg:py-24 w-full">
          <div className="grid gap-10 lg:grid-cols-[auto_1fr] lg:gap-16 xl:gap-20 lg:items-center">
            {/* Portrait 4:5 */}
            <div className="flex justify-center sm:justify-start">
              <div className="aspect-[4/5] w-52 sm:w-60 md:w-72 shrink-0 rounded-2xl bg-white/10 motion-safe:animate-pulse ring-1 ring-white/10" />
            </div>

            {/* Info Lines */}
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <div className="h-6 w-24 rounded-full bg-white/10 motion-safe:animate-pulse" />
                <div className="h-6 w-20 rounded-full bg-white/10 motion-safe:animate-pulse" />
              </div>
              <div className="h-10 sm:h-12 w-3/4 rounded-lg bg-white/15 motion-safe:animate-pulse" />
              <div className="h-5 w-1/2 rounded bg-white/10 motion-safe:animate-pulse" />
              <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-white/5 motion-safe:animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sub-nav Skeleton */}
      <div className="border-b border-border/70 bg-card/60 py-3">
        <div className="container-edge flex gap-4 overflow-x-auto">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-7 w-24 shrink-0 rounded-md bg-muted motion-safe:animate-pulse"
            />
          ))}
        </div>
      </div>

      {/* Body Sections Skeleton */}
      <div className="container-edge py-12 space-y-16">
        <div className="space-y-4">
          <div className="h-8 w-44 rounded bg-muted motion-safe:animate-pulse" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="aspect-video rounded-xl bg-muted/70 motion-safe:animate-pulse"
              />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="h-8 w-40 rounded bg-muted motion-safe:animate-pulse" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-xl border border-border/70 bg-card p-4 space-y-2"
              >
                <div className="h-4 w-1/2 rounded bg-muted/60 motion-safe:animate-pulse" />
                <div className="h-6 w-3/4 rounded bg-muted motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
