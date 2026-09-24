"use client";

import { useEffect, useRef, useState } from "react";

/** The logo file to place in public/. */
export const LOGIN_LOGO_SRC = "/hotel-yuli-logo.png";

/**
 * Hotel Yuli logo centered above the login form. Until public/hotel-yuli-logo.png
 * exists, it shows the "Y" monogram (favicon) with the hotel name instead of a
 * broken image.
 */
export function LoginLogo() {
  const [missing, setMissing] = useState(false);
  const image = useRef<HTMLImageElement>(null);

  // The image may fail before React hydrates (onError would not fire): check once mounted.
  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth === 0) setMissing(true);
  }, []);

  if (missing) {
    return (
      <div className="login-logo login-logo-fallback" role="img" aria-label="Hotel Yuli">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark, no optimisation needed */}
        <img src="/favicon.svg" alt="" width={72} height={72} />
        <span>HOTEL YULI</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- logo size is unknown until the file is added; plain img keeps its aspect ratio
  return <img ref={image} className="login-logo" src={LOGIN_LOGO_SRC} alt="Hotel Yuli" onError={() => setMissing(true)} />;
}
