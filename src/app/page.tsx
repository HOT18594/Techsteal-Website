import { Assistant } from "@/components/Assistant";
import { Forum } from "@/components/Forum";
import { Gallery } from "@/components/Gallery";
import { Hero } from "@/components/Hero";
import { History } from "@/components/History";
import { Members } from "@/components/Members";
import { Rules } from "@/components/Rules";
import { Status } from "@/components/Status";

export default function Home() {
  return (
    <>
      <Hero />
      <Status />
      <Assistant />
      <Forum />
      <History />
      <Members />
      <Gallery />
      <Rules />
    </>
  );
}
