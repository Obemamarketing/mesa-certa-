import { IBM_Plex_Sans } from "next/font/google";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";

const fonteAdmin = IBM_Plex_Sans({
  variable: "--font-admin",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`admin-root flex-1 flex w-full ${fonteAdmin.variable}`} style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col pb-14 lg:pb-0">{children}</div>
      <BottomNav />
    </div>
  );
}
