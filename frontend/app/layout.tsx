import type { Metadata, Viewport } from "next";
import AuthProvider from "../components/AuthProvider";
import ToastProvider from "../components/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "WRV Energies — Portal",
  description:
    "Scan or manually log readings for your registered machines and review reading history.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
