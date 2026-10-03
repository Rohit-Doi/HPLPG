export default function Loading() {
  return (
    <div className="container py-8" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-4 w-40" />
      <div className="skeleton mt-3 h-8 w-72" />
      <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:gap-x-5 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[3/4] rounded-lg" />
            <div className="skeleton mt-2 h-4 w-2/3" />
            <div className="skeleton mt-1.5 h-3 w-full" />
            <div className="skeleton mt-1.5 h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
