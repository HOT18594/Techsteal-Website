import Link from "next/link";
import { siteConfig } from "@/lib/site";
import { CopyrightYear } from "@/components/CopyrightYear";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main"><Link href="/" className="footer-wordmark">{siteConfig.name}<span>↗</span></Link><nav aria-label="Footer"><Link href="/join">Join us</Link><Link href="/status">Server</Link><Link href="/rules">Rules</Link><Link href="/history">History</Link>{Object.entries(siteConfig.socials).filter(([, url]) => url && url !== "#").map(([name, url]) => <a key={name} href={url} target="_blank" rel="noopener noreferrer">{name}</a>)}</nav></div>
      <div className="footer-bottom"><span>© <CopyrightYear /> Techsteal</span><span>Not affiliated with Mojang or Microsoft.</span><span>{siteConfig.season}</span></div>
    </footer>
  );
}
