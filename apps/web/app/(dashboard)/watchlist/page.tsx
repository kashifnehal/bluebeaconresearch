import { Suspense } from "react";
import { WatchlistClient } from "./WatchlistClient";

export default function WatchlistPage() {
  return (
    <Suspense>
      <WatchlistClient />
    </Suspense>
  );
}

