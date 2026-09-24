import Image from "next/image";
import logo from "@/public/logo-yuli.png";

/**
 * Hotel Yuli logo centered above the login form (public/logo-yuli.png, transparent
 * background). next/image serves a resized, compressed copy of the 1000 px source.
 */
export function LoginLogo() {
  return <Image className="login-logo" src={logo} alt="Hotel Yuli" width={200} sizes="200px" priority />;
}
