'use client';

import { useEffect, useState } from 'react';
import { isSampleMode, subscribeSampleMode } from '../lib/sample-mode';

export function SampleDataBanner() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(isSampleMode());
    return subscribeSampleMode(setOn);
  }, []);

  if (!on) return null;

  return (
    <p
      role="status"
      className="border-b border-amber-300 bg-amber-50 px-5 py-2.5 text-center text-sm text-amber-950"
    >
      Sample data is on because the API did not respond. This is not a live exam — practice answers
      stay in this browser.
    </p>
  );
}
