import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = {
  title: "Your report",
  description:
    "Every listing that holds your personal data, and the requests you have sent to remove them.",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <DashboardView />
      </main>
      <SiteFooter />
    </>
  );
}
