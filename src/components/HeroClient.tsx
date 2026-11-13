"use client";

import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { useCopyAddress } from "@/components/CopyIpButton";
import { useApi } from "@/lib/use-api";
import { fallbackMembers, fallbackGallery, fallbackStatus } from "@/lib/fallback-data";
import { siteConfig } from "@/lib/site";
import type { GalleryItem, Member, ServerStatus } from "@/types";

const SHORTCUTS = [
  { href: "/assistant", title: "Chatty Jr.", icon: "fa-robot" },
  { href: "/members", title: "Members", icon: "fa-users" },
  { href: "/history", title: "History", icon: "fa-clock-rotate-left" },
  { href: "/rules", title: "Rules", icon: "fa-shield-halved" },
];

export function HeroClient() {
  const { data: status, loading } = useApi<ServerStatus>("/api/status", fallbackStatus);
  const { data: members } = useApi<Member[]>("/api/members", fallbackMembers);
  const { data: gallery } = useApi<GalleryItem[]>("/api/gallery", fallbackGallery);
  const { copied, copy } = useCopyAddress();
  const live = status.source === "live";
  const featured = gallery.find((item) => item.featured) ?? gallery[0];
  const statusText = loading ? "Checking…" : live ? status.online ? "Online" : "Offline" : "Unavailable";

  return (
    <div className="home-page">
      <section className="world-hero" aria-labelledby="home-title">
        <Image src="/techsteal-hero.jpeg" alt="A Minecraft valley with mountains, forests, and a winding river" fill priority sizes="100vw" className="world-image" />
        <div className="world-shade" />
        <div className="world-content">
          <div className="season-banner" role="status">
            <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
            <span>Season 6 — very soon</span>
          </div>
          <span className="world-label"><span />{siteConfig.previousSeason} has wrapped<span className="world-label-divider">/</span>Private Minecraft server</span>
          <h1 id="home-title" className="home-wordmark">{siteConfig.name}</h1>
          <button className="hero-address" onClick={() => void copy()} aria-label={`Copy server address ${siteConfig.address}`}><span>{copied ? "Address copied" : siteConfig.address}</span><i className={copied ? "fa-solid fa-check" : "fa-regular fa-copy"} aria-hidden="true" /></button>
          <div className="hero-actions"><Link href="/join" className="btn-primary">Join the server <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link><Link href="/status" className="btn-secondary">Server status <span className={`home-status-dot ${live && status.online ? "is-online" : ""}`} /></Link></div>
        </div>
        <div className="hero-footnote"><span>JAVA {siteConfig.version}</span><Link href="#community" aria-label="Explore the community"><i className="fa-solid fa-chevron-down" aria-hidden="true" /></Link><span>{siteConfig.software.toUpperCase()} / SURVIVAL</span></div>
      </section>
      <section id="community" className="home-community" aria-labelledby="community-title">
        <div className="home-section-heading"><h2 id="community-title">The server.</h2><span>{siteConfig.season}</span></div>
        <div className="community-grid">
          <Link href="/status" className="community-card community-server"><span className="community-card-label"><i className="fa-solid fa-cube" aria-hidden="true" />Server<i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /></span><div className="community-card-bottom"><div className="home-server-state"><span className={`home-status-dot ${live && status.online ? "is-online" : ""}`} /><h3>{statusText}</h3></div><span>{live && status.online ? `${status.players ?? 0} / ${status.max ?? siteConfig.maxPlayers} players` : siteConfig.address}</span></div><div className="server-block-motif" aria-hidden="true"><span /><span /><span /></div></Link>
          <Link href="/forum" className="community-card community-forum"><span className="community-card-label"><i className="fa-regular fa-comments" aria-hidden="true" />Forum<i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /></span><div className="community-card-bottom"><h3>Forum</h3>{members.length > 0 && <div className="home-member-row"><div className="home-avatars">{members.slice(0, 4).map((member) => <Avatar key={member.id ?? member.name} name={member.name} src={member.avatarUrl} color={member.color} size="sm" />)}</div><span>{members.length} members</span></div>}</div></Link>
          <Link href="/gallery" className={`community-card community-gallery ${featured ? "has-image" : ""}`}>
            {featured ? <Image src={featured.image} alt={featured.title} fill sizes="(max-width: 768px) 100vw, 430px" className="community-gallery-image" /> : <div className="gallery-landscape" aria-hidden="true"><div /><div /><div /></div>}
            <span className="community-card-label"><i className="fa-regular fa-image" aria-hidden="true" />Gallery<i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /></span><div className="community-card-bottom"><h3>{featured ? featured.title : "Gallery"}</h3>{featured && <span>By {featured.builder}</span>}</div>
          </Link>
        </div>
        <div className="home-shortcuts">{SHORTCUTS.map((item) => <Link href={item.href} key={item.href}><i className={`fa-solid ${item.icon}`} aria-hidden="true" /><span>{item.title}</span><i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>)}</div>
      </section>
    </div>
  );
}
