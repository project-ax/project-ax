import { Navbar } from "@/components/sections/navbar";
import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { CodeShowcase } from "@/components/sections/code-showcase";
import { DeepDives } from "@/components/sections/deep-dives";
import { Community } from "@/components/sections/community";
import { Footer } from "@/components/sections/footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <Hero />
      <Features />
      <CodeShowcase />
      <DeepDives />
      <Community />
      <Footer />
    </>
  );
}
